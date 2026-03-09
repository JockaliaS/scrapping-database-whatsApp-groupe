use axum::{
    body::Bytes,
    extract::{Path, State},
    http::{HeaderMap, StatusCode},
    Json,
};
use uuid::Uuid;

use crate::errors::AppError;
use crate::models::message::HubSpokePayload;
use crate::models::profile::Profile;
use crate::services::hub_spoke::verify_hub_spoke;
use crate::services::matching::fast_keyword_filter;
use crate::AppState;

/// GET /api/webhook-stats — returns today's webhook counters for the authenticated user
pub async fn get_webhook_stats(
    State(state): State<AppState>,
    user_id: Uuid,
) -> Result<Json<serde_json::Value>, AppError> {
    // Total webhooks today (all events, all sources)
    let total_today: i64 = sqlx::query_scalar(
        "SELECT COUNT(*) FROM webhook_events WHERE user_id = $1 AND created_at >= CURRENT_DATE"
    )
    .bind(user_id)
    .fetch_one(&state.db)
    .await
    .unwrap_or(0);

    // Total group messages today (@g.us)
    let total_groups: i64 = sqlx::query_scalar(
        "SELECT COUNT(*) FROM webhook_events WHERE user_id = $1 AND created_at >= CURRENT_DATE AND is_group = true"
    )
    .bind(user_id)
    .fetch_one(&state.db)
    .await
    .unwrap_or(0);

    // Total for monitored groups only
    let total_monitored: i64 = sqlx::query_scalar(
        "SELECT COUNT(*) FROM webhook_events WHERE user_id = $1 AND created_at >= CURRENT_DATE AND is_monitored_group = true"
    )
    .bind(user_id)
    .fetch_one(&state.db)
    .await
    .unwrap_or(0);

    // Total actually processed (content was present and went through pipeline)
    let total_processed: i64 = sqlx::query_scalar(
        "SELECT COUNT(*) FROM webhook_events WHERE user_id = $1 AND created_at >= CURRENT_DATE AND is_monitored_group = true AND processed = true"
    )
    .bind(user_id)
    .fetch_one(&state.db)
    .await
    .unwrap_or(0);

    Ok(Json(serde_json::json!({
        "total_today": total_today,
        "total_groups": total_groups,
        "total_monitored": total_monitored,
        "total_processed": total_processed,
    })))
}

/// Shared matching pipeline used by both hub_spoke_webhook and per-user webhook.
/// Given a group_id, message content, sender info, and group name,
/// finds monitored groups, runs keyword filter, Gemini scoring, creates opportunities, and broadcasts.
async fn process_message(
    state: &AppState,
    group_id: &str,
    content: &str,
    sender_name: Option<&str>,
    sender_phone: Option<&str>,
    group_name: Option<&str>,
    timestamp: i64,
    raw: Option<&serde_json::Value>,
) -> Result<(), AppError> {
    // Skip empty messages
    if content.trim().is_empty() {
        return Ok(());
    }

    // Find or create group for each user who monitors this WhatsApp group
    let groups = sqlx::query_as::<_, (Uuid, Uuid)>(
        "SELECT id, user_id FROM groups WHERE whatsapp_group_id = $1 AND is_monitored = true"
    )
    .bind(group_id)
    .fetch_all(&state.db)
    .await?;

    if groups.is_empty() {
        return Ok(());
    }

    // Save message (once per group record)
    let whatsapp_ts = chrono::DateTime::from_timestamp(timestamp, 0)
        .unwrap_or_else(chrono::Utc::now);

    for (group_db_id, user_id) in &groups {
        let message_id = Uuid::new_v4();

        sqlx::query(
            r#"INSERT INTO messages (id, group_id, sender_name, sender_phone, content, whatsapp_timestamp, raw_payload)
               VALUES ($1, $2, $3, $4, $5, $6, $7)"#,
        )
        .bind(message_id)
        .bind(group_db_id)
        .bind(sender_name)
        .bind(sender_phone)
        .bind(content)
        .bind(whatsapp_ts)
        .bind(raw)
        .execute(&state.db)
        .await?;

        // Update group last activity
        sqlx::query("UPDATE groups SET last_activity = NOW() WHERE id = $1")
            .bind(group_db_id)
            .execute(&state.db)
            .await?;

        // Get user profile
        let profile = match sqlx::query_as::<_, Profile>(
            "SELECT * FROM profiles WHERE user_id = $1 AND onboarding_complete = true"
        )
        .bind(user_id)
        .fetch_optional(&state.db)
        .await?
        {
            Some(p) => p,
            None => continue,
        };

        // Fast keyword filter
        if !fast_keyword_filter(&profile, content) {
            continue;
        }

        // Score with Gemini
        let gemini = match &state.gemini {
            Some(g) => g.clone(),
            None => continue,
        };

        let db = state.db.clone();
        let ws = state.ws_manager.clone();
        let evolution = state.evolution.clone();
        let config = state.config.clone();
        let content = content.to_string();
        let sender_name_owned = sender_name.unwrap_or_default().to_string();
        let sender_phone_owned = sender_phone.unwrap_or_default().to_string();
        let group_name_owned = group_name.unwrap_or_default().to_string();
        let profile = profile.clone();
        let user_id = *user_id;
        let group_db_id = *group_db_id;

        // Spawn async scoring task
        tokio::spawn(async move {
            let summary = profile.raw_text.as_deref().unwrap_or("");
            let sector = profile.sector.as_deref().unwrap_or("");

            match gemini
                .score_opportunity(summary, &profile.keywords, sector, &content, &group_name_owned, &sender_name_owned)
                .await
            {
                Ok(score_result) => {
                    if score_result.score < profile.min_score {
                        return;
                    }

                    // Upsert contact
                    let contact_id = sqlx::query_scalar::<_, Uuid>(
                        r#"INSERT INTO contacts (id, phone, name, total_announcements)
                           VALUES ($1, $2, $3, 1)
                           ON CONFLICT (phone) DO UPDATE SET
                             total_announcements = contacts.total_announcements + 1,
                             name = COALESCE(NULLIF($3, ''), contacts.name),
                             updated_at = NOW()
                           RETURNING id"#,
                    )
                    .bind(Uuid::new_v4())
                    .bind(&sender_phone_owned)
                    .bind(&sender_name_owned)
                    .fetch_one(&db)
                    .await
                    .ok();

                    // Save opportunity
                    let opp_id = Uuid::new_v4();
                    let opp = sqlx::query_as::<_, crate::models::opportunity::Opportunity>(
                        r#"INSERT INTO opportunities
                           (id, user_id, message_id, group_id, contact_id, score,
                            matched_keywords, context_analysis, suggested_reply,
                            is_demand, is_offer)
                           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
                           RETURNING *"#,
                    )
                    .bind(opp_id)
                    .bind(user_id)
                    .bind(message_id)
                    .bind(group_db_id)
                    .bind(contact_id)
                    .bind(score_result.score)
                    .bind(&score_result.matched_keywords)
                    .bind(&score_result.context_analysis)
                    .bind(&score_result.suggested_reply)
                    .bind(score_result.is_demand)
                    .bind(score_result.is_offer)
                    .fetch_one(&db)
                    .await;

                    if let Ok(opp) = opp {
                        // Broadcast via WebSocket
                        let ws_msg = serde_json::json!({
                            "type": "new_opportunity",
                            "data": {
                                "id": opp.id,
                                "score": opp.score,
                                "matched_keywords": opp.matched_keywords,
                                "context_analysis": opp.context_analysis,
                                "suggested_reply": opp.suggested_reply,
                                "is_demand": opp.is_demand,
                                "is_offer": opp.is_offer,
                                "group_name": group_name_owned,
                                "sender_name": sender_name_owned,
                                "sender_phone": sender_phone_owned,
                                "message_content": content,
                                "created_at": opp.created_at,
                            }
                        });
                        ws.broadcast_to_user(user_id, &ws_msg.to_string()).await;

                        // Send WhatsApp alert
                        if let Some(alert_number) = &profile.alert_number {
                            if let Some(evolution) = &evolution {
                                // Get instance name
                                if let Ok(Some((instance,))) = sqlx::query_as::<_, (String,)>(
                                    "SELECT instance_name FROM whatsapp_connections WHERE user_id = $1 AND status = 'connected'"
                                )
                                .bind(user_id)
                                .fetch_optional(&db)
                                .await
                                {
                                    // Get template
                                    let template = profile.alert_template.as_deref().unwrap_or(
                                        "Nouvelle opportunite (score: {{score}}%) dans {{group}} - {{message}}"
                                    );

                                    let _ = crate::services::alerting::AlertService::send_whatsapp_alert(
                                        evolution,
                                        &instance,
                                        alert_number,
                                        template,
                                        &opp,
                                        &sender_name_owned,
                                        &sender_phone_owned,
                                        &group_name_owned,
                                        &content,
                                        &config.frontend_url,
                                    )
                                    .await;

                                    // Mark alert as sent
                                    let _ = sqlx::query(
                                        "UPDATE opportunities SET alert_sent = true WHERE id = $1"
                                    )
                                    .bind(opp.id)
                                    .execute(&db)
                                    .await;
                                }
                            }
                        }
                    }
                }
                Err(e) => {
                    tracing::error!("[Webhook] Gemini scoring error: {}", e);
                }
            }
        });
    }

    Ok(())
}

/// Hub&Spoke webhook endpoint (kept for external Node.js apps using HMAC)
pub async fn hub_spoke_webhook(
    State(state): State<AppState>,
    headers: HeaderMap,
    body: Bytes,
) -> Result<StatusCode, AppError> {
    tracing::info!("[Webhook] hub_spoke_webhook called");

    // Extract headers
    let signature = headers
        .get("X-Radar-Signature")
        .and_then(|v| v.to_str().ok())
        .ok_or_else(|| AppError::Unauthorized("Missing signature".into()))?;

    let timestamp = headers
        .get("X-Radar-Timestamp")
        .and_then(|v| v.to_str().ok())
        .ok_or_else(|| AppError::Unauthorized("Missing timestamp".into()))?;

    // Verify HMAC
    verify_hub_spoke(
        &body,
        signature,
        timestamp,
        &state.config.radar_webhook_secret,
    )?;

    // Parse payload
    let payload: HubSpokePayload = serde_json::from_slice(&body)
        .map_err(|e| AppError::BadRequest(format!("Invalid payload: {}", e)))?;

    tracing::info!("[Webhook] hub_spoke: group={} content_len={}", payload.group_id, payload.content.len());

    // Record hub-spoke webhook event (no specific user_id for hub-spoke, will be resolved in process_message)
    let _ = sqlx::query(
        r#"INSERT INTO webhook_events (id, event_type, source, remote_jid, is_group, processed)
           VALUES ($1, 'messages.upsert', 'hub-spoke', $2, true, true)"#,
    )
    .bind(Uuid::new_v4())
    .bind(&payload.group_id)
    .execute(&state.db)
    .await;

    process_message(
        &state,
        &payload.group_id,
        &payload.content,
        payload.sender_name.as_deref(),
        payload.sender_phone.as_deref(),
        payload.group_name.as_deref(),
        payload.timestamp,
        payload.raw.as_ref(),
    )
    .await?;

    Ok(StatusCode::OK)
}

/// Per-user webhook endpoint for Evolution API events.
/// URL: POST /webhook/whatsapp/{user_id}
/// Auth: apikey header must match EVOLUTION_API_KEY.
/// Each user gets their own webhook URL for their Evolution API instance.
pub async fn per_user_webhook(
    State(state): State<AppState>,
    Path(user_id): Path<Uuid>,
    headers: HeaderMap,
    body: Bytes,
) -> Result<StatusCode, AppError> {
    tracing::info!("[Webhook] per_user_webhook called for user_id={}", user_id);

    // Verify apikey header matches EVOLUTION_API_KEY
    let provided_key = headers
        .get("apikey")
        .and_then(|v| v.to_str().ok())
        .unwrap_or("");

    let expected_key = state
        .config
        .evolution_api_key
        .as_deref()
        .unwrap_or("");

    if provided_key.is_empty() || provided_key != expected_key {
        tracing::warn!("[Webhook] per_user user_id={}: invalid or missing apikey (got '{}')", user_id, if provided_key.is_empty() { "<empty>" } else { "<redacted>" });
        return Err(AppError::Unauthorized("Invalid apikey".into()));
    }

    // Verify user_id exists in whatsapp_connections
    let conn_exists = sqlx::query_scalar::<_, i64>(
        "SELECT COUNT(*) FROM whatsapp_connections WHERE user_id = $1"
    )
    .bind(user_id)
    .fetch_one(&state.db)
    .await
    .unwrap_or(0);

    if conn_exists == 0 {
        tracing::warn!("[Webhook] per_user: user_id={} has no whatsapp_connection", user_id);
        return Ok(StatusCode::OK); // Return 200 silently — don't break Evolution API
    }

    // Parse the Evolution API payload
    let payload: serde_json::Value = serde_json::from_slice(&body)
        .map_err(|e| {
            tracing::error!("[Webhook] per_user user_id={}: invalid JSON: {}", user_id, e);
            AppError::BadRequest(format!("Invalid JSON payload: {}", e))
        })?;

    let event = payload["event"].as_str().unwrap_or("");
    let instance_name = payload["instance"].as_str().unwrap_or("");

    tracing::info!("[Webhook] per_user user_id={} event={} instance={}", user_id, event, instance_name);

    handle_evolution_event(&state, user_id, event, instance_name, &payload).await
}


/// Record a webhook event in the database and broadcast counter update via WebSocket
async fn record_webhook_event(
    state: &AppState,
    user_id: Uuid,
    event_type: &str,
    source: &str,
    remote_jid: &str,
    is_group: bool,
    is_monitored: bool,
    group_db_id: Option<Uuid>,
    processed: bool,
) {
    let _ = sqlx::query(
        r#"INSERT INTO webhook_events (id, user_id, event_type, source, remote_jid, is_group, is_monitored_group, group_db_id, processed)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)"#,
    )
    .bind(Uuid::new_v4())
    .bind(user_id)
    .bind(event_type)
    .bind(source)
    .bind(remote_jid)
    .bind(is_group)
    .bind(is_monitored)
    .bind(group_db_id)
    .bind(processed)
    .execute(&state.db)
    .await;

    // Broadcast live counter update via WebSocket
    let ws_msg = serde_json::json!({
        "type": "webhook_event",
        "data": {
            "event_type": event_type,
            "is_group": is_group,
            "is_monitored": is_monitored,
            "processed": processed,
        }
    });
    state.ws_manager.broadcast_to_user(user_id, &ws_msg.to_string()).await;
}

/// Shared handler for Evolution API events (used by both global and per-user webhooks)
async fn handle_evolution_event(
    state: &AppState,
    user_id: Uuid,
    event: &str,
    instance_name: &str,
    payload: &serde_json::Value,
) -> Result<StatusCode, AppError> {
    match event {
        "messages.upsert" => {
            let data = &payload["data"];
            let remote_jid = data["key"]["remoteJid"].as_str().unwrap_or("");

            tracing::info!("[Webhook] messages.upsert user_id={} instance={} remoteJid={}", user_id, instance_name, remote_jid);

            let is_group = remote_jid.ends_with("@g.us");

            // Check if this group is monitored + get group_db_id
            let monitored_info = if is_group {
                sqlx::query_as::<_, (Uuid, bool)>(
                    "SELECT id, is_monitored FROM groups WHERE whatsapp_group_id = $1 AND user_id = $2"
                )
                .bind(remote_jid)
                .bind(user_id)
                .fetch_optional(&state.db)
                .await
                .ok()
                .flatten()
            } else {
                None
            };

            let is_monitored = monitored_info.as_ref().map(|m| m.1).unwrap_or(false);
            let group_db_id = monitored_info.as_ref().map(|m| m.0);

            // Only process group messages
            if !is_group {
                record_webhook_event(state, user_id, event, "evolution", remote_jid, false, false, None, false).await;
                tracing::debug!("[Webhook] messages.upsert: skipping non-group message (jid={})", remote_jid);
                return Ok(StatusCode::OK);
            }

            // Extract message content
            let content = data["message"]["conversation"]
                .as_str()
                .or_else(|| data["message"]["extendedTextMessage"]["text"].as_str())
                .unwrap_or("");

            if content.trim().is_empty() {
                record_webhook_event(state, user_id, event, "evolution", remote_jid, true, is_monitored, group_db_id, false).await;
                tracing::debug!("[Webhook] messages.upsert: empty content, skipping");
                return Ok(StatusCode::OK);
            }

            // Record webhook event (processed = true since we have content to process)
            record_webhook_event(state, user_id, event, "evolution", remote_jid, true, is_monitored, group_db_id, true).await;

            // Extract sender
            let sender_jid = data["key"]["participant"]
                .as_str()
                .or_else(|| data["key"]["remoteJid"].as_str())
                .unwrap_or("");

            let sender_phone = sender_jid.split('@').next().unwrap_or("");
            let sender_name = data["pushName"].as_str().unwrap_or("");
            let group_id = remote_jid;

            let msg_timestamp = data["messageTimestamp"]
                .as_i64()
                .or_else(|| data["messageTimestamp"].as_str().and_then(|s| s.parse().ok()))
                .unwrap_or_else(|| chrono::Utc::now().timestamp());

            tracing::info!("[Webhook] messages.upsert: processing group={} sender={} content_len={}", group_id, sender_name, content.len());

            process_message(
                state,
                group_id,
                content,
                Some(sender_name),
                Some(sender_phone),
                None,
                msg_timestamp,
                Some(payload),
            )
            .await?;
        }

        "connection.update" => {
            record_webhook_event(state, user_id, event, "evolution", "", false, false, None, true).await;
            let data = &payload["data"];
            let state_str = data["state"].as_str()
                .or_else(|| data["instance"]["state"].as_str())
                .unwrap_or("");

            let db_status = match state_str {
                "open" => "connected",
                "close" | "closed" => "disconnected",
                "connecting" => "connecting",
                _ => state_str,
            };

            tracing::info!("[Webhook] connection.update: instance={} state={} -> db_status={} for user_id={}", instance_name, state_str, db_status, user_id);

            sqlx::query(
                "UPDATE whatsapp_connections SET status = $1, updated_at = NOW() WHERE user_id = $2"
            )
            .bind(db_status)
            .bind(user_id)
            .execute(&state.db)
            .await?;

            // Notify user via WebSocket
            let ws_msg = serde_json::json!({
                "type": "connection_update",
                "data": {
                    "status": db_status,
                    "instance_name": instance_name,
                }
            });
            state.ws_manager.broadcast_to_user(user_id, &ws_msg.to_string()).await;
        }

        "qrcode.updated" => {
            record_webhook_event(state, user_id, event, "evolution", "", false, false, None, true).await;
            let data = &payload["data"];
            let qr_base64 = data["qrcode"]["base64"].as_str()
                .or_else(|| data["qrcode"].as_str())
                .or_else(|| data["base64"].as_str())
                .unwrap_or("");

            tracing::info!("[Webhook] qrcode.updated: instance={} user_id={} has_qr={}", instance_name, user_id, !qr_base64.is_empty());

            if !qr_base64.is_empty() {
                let qr_data = if qr_base64.starts_with("data:") {
                    qr_base64.to_string()
                } else {
                    format!("data:image/png;base64,{}", qr_base64)
                };

                let ws_msg = serde_json::json!({
                    "type": "qr_update",
                    "data": {
                        "qr_code": qr_data,
                    }
                });
                state.ws_manager.broadcast_to_user(user_id, &ws_msg.to_string()).await;
            }
        }

        _ => {
            record_webhook_event(state, user_id, event, "evolution", "", false, false, None, false).await;
            tracing::debug!("[Webhook] unhandled event '{}' for instance '{}' user_id={}", event, instance_name, user_id);
        }
    }

    Ok(StatusCode::OK)
}

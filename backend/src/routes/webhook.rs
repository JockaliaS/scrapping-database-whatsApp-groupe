use axum::{
    body::Bytes,
    extract::State,
    http::{HeaderMap, StatusCode},
};
use uuid::Uuid;

use crate::errors::AppError;
use crate::models::message::HubSpokePayload;
use crate::models::profile::Profile;
use crate::services::hub_spoke::verify_hub_spoke;
use crate::services::matching::fast_keyword_filter;
use crate::AppState;

/// Shared matching pipeline used by both hub_spoke_webhook and global_webhook.
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
                    tracing::error!("Gemini scoring error: {}", e);
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

/// Global webhook endpoint for Evolution API events.
/// Evolution API sends ALL events to this single endpoint.
/// No JWT auth — authenticated via `apikey` header matching EVOLUTION_API_KEY.
pub async fn global_webhook(
    State(state): State<AppState>,
    headers: HeaderMap,
    body: Bytes,
) -> Result<StatusCode, AppError> {
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
        tracing::warn!("Global webhook: invalid or missing apikey");
        return Err(AppError::Unauthorized("Invalid apikey".into()));
    }

    // Parse the Evolution API payload
    let payload: serde_json::Value = serde_json::from_slice(&body)
        .map_err(|e| AppError::BadRequest(format!("Invalid JSON payload: {}", e)))?;

    let event = payload["event"].as_str().unwrap_or("");
    let instance_name = payload["instance"].as_str().unwrap_or("");

    if instance_name.is_empty() {
        tracing::debug!("Global webhook: no instance name in payload");
        return Ok(StatusCode::OK);
    }

    // Look up instance in DB to find the owning user
    let user_row = sqlx::query_as::<_, (Uuid,)>(
        "SELECT user_id FROM whatsapp_connections WHERE instance_name = $1"
    )
    .bind(instance_name)
    .fetch_optional(&state.db)
    .await?;

    // If not found, this instance belongs to another app — return 200 silently
    let user_id = match user_row {
        Some((uid,)) => uid,
        None => {
            tracing::debug!("Global webhook: instance '{}' not registered in Radar", instance_name);
            return Ok(StatusCode::OK);
        }
    };

    match event {
        "messages.upsert" => {
            let data = &payload["data"];
            let remote_jid = data["key"]["remoteJid"].as_str().unwrap_or("");

            // Only process group messages
            if !remote_jid.ends_with("@g.us") {
                return Ok(StatusCode::OK);
            }

            // Extract message content
            let content = data["message"]["conversation"]
                .as_str()
                .or_else(|| data["message"]["extendedTextMessage"]["text"].as_str())
                .unwrap_or("");

            if content.trim().is_empty() {
                return Ok(StatusCode::OK);
            }

            // Extract sender: participant for groups, or remoteJid for direct
            let sender_jid = data["key"]["participant"]
                .as_str()
                .or_else(|| data["key"]["remoteJid"].as_str())
                .unwrap_or("");

            // Extract phone number from JID (remove @s.whatsapp.net)
            let sender_phone = sender_jid
                .split('@')
                .next()
                .unwrap_or("");

            let sender_name = data["pushName"].as_str().unwrap_or("");
            let group_id = remote_jid;

            let msg_timestamp = data["messageTimestamp"]
                .as_i64()
                .or_else(|| data["messageTimestamp"].as_str().and_then(|s| s.parse().ok()))
                .unwrap_or_else(|| chrono::Utc::now().timestamp());

            // Feed into the matching pipeline
            process_message(
                &state,
                group_id,
                content,
                Some(sender_name),
                Some(sender_phone),
                None, // group_name not in Evolution API payload; will be looked up from DB
                msg_timestamp,
                Some(&payload),
            )
            .await?;
        }

        "connection.update" => {
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

            tracing::info!("Global webhook: connection.update for instance '{}' -> {}", instance_name, db_status);
        }

        "qrcode.updated" => {
            let data = &payload["data"];
            // Extract QR base64 from various possible payload structures
            let qr_base64 = data["qrcode"]["base64"].as_str()
                .or_else(|| data["qrcode"].as_str())
                .or_else(|| data["base64"].as_str())
                .unwrap_or("");

            if !qr_base64.is_empty() {
                let qr_data = if qr_base64.starts_with("data:") {
                    qr_base64.to_string()
                } else {
                    format!("data:image/png;base64,{}", qr_base64)
                };

                // Push QR code via WebSocket to the user
                let ws_msg = serde_json::json!({
                    "type": "qr_update",
                    "data": {
                        "qr_code": qr_data,
                    }
                });
                state.ws_manager.broadcast_to_user(user_id, &ws_msg.to_string()).await;

                tracing::info!("Global webhook: qrcode.updated for instance '{}'", instance_name);
            }
        }

        _ => {
            tracing::debug!("Global webhook: unhandled event '{}' for instance '{}'", event, instance_name);
        }
    }

    Ok(StatusCode::OK)
}

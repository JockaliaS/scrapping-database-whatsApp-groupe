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

    // Skip empty messages
    if payload.content.trim().is_empty() {
        return Ok(StatusCode::OK);
    }

    // Find or create group for each user who monitors this WhatsApp group
    let groups = sqlx::query_as::<_, (Uuid, Uuid)>(
        "SELECT id, user_id FROM groups WHERE whatsapp_group_id = $1 AND is_monitored = true"
    )
    .bind(&payload.group_id)
    .fetch_all(&state.db)
    .await?;

    if groups.is_empty() {
        return Ok(StatusCode::OK);
    }

    // Save message (once per group record)
    let whatsapp_ts = chrono::DateTime::from_timestamp(payload.timestamp, 0)
        .unwrap_or_else(chrono::Utc::now);

    for (group_db_id, user_id) in &groups {
        let message_id = Uuid::new_v4();

        sqlx::query(
            r#"INSERT INTO messages (id, group_id, sender_name, sender_phone, content, whatsapp_timestamp, raw_payload)
               VALUES ($1, $2, $3, $4, $5, $6, $7)"#,
        )
        .bind(message_id)
        .bind(group_db_id)
        .bind(&payload.sender_name)
        .bind(&payload.sender_phone)
        .bind(&payload.content)
        .bind(whatsapp_ts)
        .bind(&payload.raw)
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
        if !fast_keyword_filter(&profile, &payload.content) {
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
        let content = payload.content.clone();
        let sender_name = payload.sender_name.clone().unwrap_or_default();
        let sender_phone = payload.sender_phone.clone().unwrap_or_default();
        let group_name = payload.group_name.clone().unwrap_or_default();
        let profile = profile.clone();
        let user_id = *user_id;
        let group_db_id = *group_db_id;

        // Spawn async scoring task
        tokio::spawn(async move {
            let summary = profile.raw_text.as_deref().unwrap_or("");
            let sector = profile.sector.as_deref().unwrap_or("");

            match gemini
                .score_opportunity(summary, &profile.keywords, sector, &content, &group_name, &sender_name)
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
                    .bind(&sender_phone)
                    .bind(&sender_name)
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
                                "group_name": group_name,
                                "sender_name": sender_name,
                                "sender_phone": sender_phone,
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
                                        &sender_name,
                                        &sender_phone,
                                        &group_name,
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

    Ok(StatusCode::OK)
}

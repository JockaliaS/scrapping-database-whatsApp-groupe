use axum::{extract::{Path, State}, Json};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::sync::Arc;
use tokio::sync::RwLock;
use uuid::Uuid;

use crate::errors::AppError;
use crate::AppState;

#[allow(dead_code)]
#[derive(Debug, Deserialize)]
pub struct ScanRequest {
    pub group_ids: Vec<Uuid>,
    pub from: Option<String>,
    pub to: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
pub struct ScanStatus {
    pub scan_id: Uuid,
    pub status: String,
    pub progress: f64,
    pub messages_scanned: i64,
    pub messages_fetched: i64,
    pub matches_found: i64,
    pub current_group: Option<String>,
}

pub type ScanStore = Arc<RwLock<HashMap<Uuid, ScanStatus>>>;

pub fn new_scan_store() -> ScanStore {
    Arc::new(RwLock::new(HashMap::new()))
}

pub async fn start_scan(
    State(state): State<AppState>,
    user_id: Uuid,
    Json(req): Json<ScanRequest>,
) -> Result<(axum::http::StatusCode, Json<serde_json::Value>), AppError> {
    let scan_id = Uuid::new_v4();
    tracing::info!("[Scan] start_scan user_id={} scan_id={} groups={}", user_id, scan_id, req.group_ids.len());

    // Check prerequisites
    let evolution = state.evolution.clone()
        .ok_or_else(|| AppError::BadRequest("Evolution API non configuree.".into()))?;

    let conn = sqlx::query_as::<_, (String,)>(
        "SELECT instance_name FROM whatsapp_connections WHERE user_id = $1 AND status = 'connected'"
    )
    .bind(user_id)
    .fetch_optional(&state.db)
    .await?
    .ok_or_else(|| AppError::BadRequest("Aucune instance WhatsApp connectee.".into()))?;

    let instance_name = conn.0;

    let status = ScanStatus {
        scan_id,
        status: "running".into(),
        progress: 0.0,
        messages_scanned: 0,
        messages_fetched: 0,
        matches_found: 0,
        current_group: None,
    };

    state.scans.write().await.insert(scan_id, status);

    // Spawn background task
    let db = state.db.clone();
    let gemini = state.gemini.clone();
    let scans = state.scans.clone();
    let ws = state.ws_manager.clone();

    tokio::spawn(async move {
        let total_groups = req.group_ids.len();

        for (idx, group_id) in req.group_ids.iter().enumerate() {
            // Get group info (name + whatsapp_group_id)
            let group = sqlx::query_as::<_, (String, String)>(
                "SELECT name, whatsapp_group_id FROM groups WHERE id = $1 AND user_id = $2"
            )
            .bind(group_id)
            .bind(user_id)
            .fetch_optional(&db)
            .await;

            let (group_name, whatsapp_group_id) = match group {
                Ok(Some(g)) => g,
                _ => continue,
            };

            tracing::info!("[Scan] Processing group: {} ({})", group_name, whatsapp_group_id);

            // Update scan status
            {
                let mut scans = scans.write().await;
                if let Some(s) = scans.get_mut(&scan_id) {
                    s.current_group = Some(group_name.clone());
                    s.progress = (idx as f64) / (total_groups as f64) * 100.0;
                }
            }

            // Fetch messages from Evolution API (limit 100 per group)
            let api_messages = match evolution.fetch_messages(&instance_name, &whatsapp_group_id, 100).await {
                Ok(msgs) => {
                    tracing::info!("[Scan] Fetched {} messages from Evolution for group {}", msgs.len(), group_name);
                    // Update fetched count
                    let mut scans = scans.write().await;
                    if let Some(s) = scans.get_mut(&scan_id) {
                        s.messages_fetched += msgs.len() as i64;
                    }
                    msgs
                }
                Err(e) => {
                    tracing::error!("[Scan] Failed to fetch messages for group {}: {}", group_name, e);
                    continue;
                }
            };

            // Get user profile for matching
            let profile = match sqlx::query_as::<_, crate::models::profile::Profile>(
                "SELECT * FROM profiles WHERE user_id = $1"
            )
            .bind(user_id)
            .fetch_optional(&db)
            .await
            {
                Ok(Some(p)) => p,
                _ => continue,
            };

            // Process each message
            for msg_val in &api_messages {
                // Extract message content from Evolution API format
                let content = msg_val["message"]["conversation"].as_str()
                    .or_else(|| msg_val["message"]["extendedTextMessage"]["text"].as_str());

                let content = match content {
                    Some(c) if !c.trim().is_empty() => c,
                    _ => continue, // skip non-text messages
                };

                let sender_phone = msg_val["key"]["participant"].as_str()
                    .or_else(|| msg_val["key"]["remoteJid"].as_str())
                    .map(|s| s.split('@').next().unwrap_or(s))
                    .unwrap_or("unknown");

                let sender_name = msg_val["pushName"].as_str().unwrap_or("Unknown");

                let timestamp = msg_val["messageTimestamp"].as_i64()
                    .or_else(|| msg_val["messageTimestamp"].as_str().and_then(|s| s.parse().ok()))
                    .unwrap_or(0);

                let wa_timestamp = chrono::DateTime::from_timestamp(timestamp, 0)
                    .unwrap_or_else(chrono::Utc::now);

                // Update scanned count
                {
                    let mut scans = scans.write().await;
                    if let Some(s) = scans.get_mut(&scan_id) {
                        s.messages_scanned += 1;
                    }
                }

                // Store message in DB (skip if already exists based on content+timestamp+group)
                let msg_id = match sqlx::query_scalar::<_, Uuid>(
                    r#"INSERT INTO messages (id, group_id, sender_name, sender_phone, content, whatsapp_timestamp, raw_payload)
                       VALUES ($1, $2, $3, $4, $5, $6, $7)
                       ON CONFLICT DO NOTHING
                       RETURNING id"#,
                )
                .bind(Uuid::new_v4())
                .bind(group_id)
                .bind(sender_name)
                .bind(sender_phone)
                .bind(content)
                .bind(wa_timestamp)
                .bind(msg_val)
                .fetch_optional(&db)
                .await
                {
                    Ok(Some(id)) => id,
                    Ok(None) => continue, // duplicate, skip
                    Err(e) => {
                        tracing::debug!("[Scan] Message insert error (likely duplicate): {}", e);
                        continue;
                    }
                };

                // Fast keyword filter
                if !crate::services::matching::fast_keyword_filter(&profile, content) {
                    continue;
                }

                // Score with Gemini if available
                if let Some(gemini) = &gemini {
                    let summary = profile.raw_text.as_deref().unwrap_or("");
                    let sector = profile.sector.as_deref().unwrap_or("");

                    match gemini.score_opportunity(summary, &profile.keywords, sector, content, &group_name, sender_name).await {
                        Ok(score_result) => {
                            if score_result.score >= profile.min_score {
                                // Upsert contact
                                let contact_id = sqlx::query_scalar::<_, Uuid>(
                                    r#"INSERT INTO contacts (id, phone, name, total_announcements)
                                       VALUES ($1, $2, $3, 1)
                                       ON CONFLICT (phone) DO UPDATE SET
                                         total_announcements = contacts.total_announcements + 1,
                                         updated_at = NOW()
                                       RETURNING id"#,
                                )
                                .bind(Uuid::new_v4())
                                .bind(sender_phone)
                                .bind(sender_name)
                                .fetch_one(&db)
                                .await
                                .ok();

                                let _ = sqlx::query(
                                    r#"INSERT INTO opportunities
                                       (id, user_id, message_id, group_id, contact_id, score,
                                        matched_keywords, context_analysis, suggested_reply,
                                        is_demand, is_offer)
                                       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)"#,
                                )
                                .bind(Uuid::new_v4())
                                .bind(user_id)
                                .bind(msg_id)
                                .bind(group_id)
                                .bind(contact_id)
                                .bind(score_result.score)
                                .bind(&score_result.matched_keywords)
                                .bind(&score_result.context_analysis)
                                .bind(&score_result.suggested_reply)
                                .bind(score_result.is_demand)
                                .bind(score_result.is_offer)
                                .execute(&db)
                                .await;

                                let mut scans = scans.write().await;
                                if let Some(s) = scans.get_mut(&scan_id) {
                                    s.matches_found += 1;
                                }

                                tracing::info!("[Scan] Match found! score={} group={} sender={}", score_result.score, group_name, sender_name);
                            }
                        }
                        Err(e) => {
                            tracing::error!("[Scan] Gemini scoring error: {}", e);
                        }
                    }
                }
            }

            // Update group last_activity
            let _ = sqlx::query("UPDATE groups SET last_activity = NOW() WHERE id = $1")
                .bind(group_id)
                .execute(&db)
                .await;
        }

        // Mark scan as complete
        let mut scans = scans.write().await;
        if let Some(s) = scans.get_mut(&scan_id) {
            s.status = "completed".into();
            s.progress = 100.0;
            s.current_group = None;
            tracing::info!("[Scan] COMPLETED scan_id={} fetched={} scanned={} matches={}",
                scan_id, s.messages_fetched, s.messages_scanned, s.matches_found);
        }

        // Notify via WebSocket
        let notification = serde_json::json!({
            "type": "scan_complete",
            "data": { "scan_id": scan_id }
        });
        ws.broadcast_to_user(user_id, &notification.to_string()).await;
    });

    Ok((
        axum::http::StatusCode::ACCEPTED,
        Json(serde_json::json!({ "scan_id": scan_id })),
    ))
}

pub async fn get_scan_status(
    State(state): State<AppState>,
    _user_id: Uuid,
    Path(scan_id): Path<Uuid>,
) -> Result<Json<ScanStatus>, AppError> {
    let scans = state.scans.read().await;
    let status = scans
        .get(&scan_id)
        .cloned()
        .ok_or_else(|| AppError::NotFound("Scan not found".into()))?;

    Ok(Json(status))
}

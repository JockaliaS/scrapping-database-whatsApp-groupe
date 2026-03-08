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

    let status = ScanStatus {
        scan_id,
        status: "running".into(),
        progress: 0.0,
        messages_scanned: 0,
        matches_found: 0,
        current_group: None,
    };

    state.scans.write().await.insert(scan_id, status);

    // Spawn background task for scanning
    let db = state.db.clone();
    let gemini = state.gemini.clone();
    let scans = state.scans.clone();
    let ws = state.ws_manager.clone();

    tokio::spawn(async move {
        let total_groups = req.group_ids.len();

        for (idx, group_id) in req.group_ids.iter().enumerate() {
            // Get group info
            let group = sqlx::query_as::<_, (String,)>(
                "SELECT name FROM groups WHERE id = $1 AND user_id = $2"
            )
            .bind(group_id)
            .bind(user_id)
            .fetch_optional(&db)
            .await;

            let group_name = match group {
                Ok(Some(g)) => g.0,
                _ => continue,
            };

            // Update scan status
            {
                let mut scans = scans.write().await;
                if let Some(s) = scans.get_mut(&scan_id) {
                    s.current_group = Some(group_name.clone());
                    s.progress = (idx as f64) / (total_groups as f64) * 100.0;
                }
            }

            // Get messages for this group
            let messages = match sqlx::query_as::<_, (Uuid, String, Option<String>, Option<String>)>(
                "SELECT id, content, sender_name, sender_phone FROM messages WHERE group_id = $1"
            )
            .bind(group_id)
            .fetch_all(&db).await {
                Ok(m) => m,
                Err(_) => continue,
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

            for (msg_id, content, sender_name, sender_phone) in &messages {
                // Update scanned count
                {
                    let mut scans = scans.write().await;
                    if let Some(s) = scans.get_mut(&scan_id) {
                        s.messages_scanned += 1;
                    }
                }

                // Fast keyword filter
                if !crate::services::matching::fast_keyword_filter(&profile, content) {
                    continue;
                }

                // Score with Gemini if available
                if let Some(gemini) = &gemini {
                    let summary = profile.raw_text.as_deref().unwrap_or("");
                    let sector = profile.sector.as_deref().unwrap_or("");
                    let s_name = sender_name.as_deref().unwrap_or("Unknown");

                    match gemini.score_opportunity(summary, &profile.keywords, sector, content, &group_name, s_name).await {
                        Ok(score_result) => {
                            if score_result.score >= profile.min_score {
                                // Upsert contact
                                let phone = sender_phone.as_deref().unwrap_or("unknown");
                                let contact_id = sqlx::query_scalar::<_, Uuid>(
                                    r#"INSERT INTO contacts (id, phone, name, total_announcements)
                                       VALUES ($1, $2, $3, 1)
                                       ON CONFLICT (phone) DO UPDATE SET
                                         total_announcements = contacts.total_announcements + 1,
                                         updated_at = NOW()
                                       RETURNING id"#,
                                )
                                .bind(Uuid::new_v4())
                                .bind(phone)
                                .bind(s_name)
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
                            }
                        }
                        Err(e) => {
                            tracing::error!("Gemini scoring error during scan: {}", e);
                        }
                    }
                }
            }
        }

        // Mark scan as complete
        let mut scans = scans.write().await;
        if let Some(s) = scans.get_mut(&scan_id) {
            s.status = "completed".into();
            s.progress = 100.0;
            s.current_group = None;
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

use axum::{
    body::Bytes,
    extract::{Query, State},
    http::StatusCode,
    response::{IntoResponse, Redirect},
    Json,
};
use serde::Deserialize;
use uuid::Uuid;

use crate::errors::AppError;
use crate::services::slack::SlackService;
use crate::AppState;

// ─── OAuth: Get authorization URL ───
// User clicks "Connecter Slack" → frontend calls this → opens returned URL

pub async fn get_auth_url(
    State(state): State<AppState>,
    user_id: Uuid,
) -> Result<Json<serde_json::Value>, AppError> {
    let client_id = state
        .config
        .slack_client_id
        .as_deref()
        .ok_or_else(|| AppError::Internal("SLACK_CLIENT_ID not configured".into()))?;

    let redirect_uri = format!("{}/auth/slack/callback", state.config.backend_url);

    // Encode user_id in the state parameter (signed with HMAC so it can't be tampered)
    let state_param = sign_oauth_state(user_id, &state.config.jwt_secret);

    let url = SlackService::build_oauth_url(client_id, &redirect_uri, &state_param);

    Ok(Json(serde_json::json!({
        "url": url,
    })))
}

// ─── OAuth: Callback from Slack ───
// Slack redirects here after user authorizes: GET /auth/slack/callback?code=xxx&state=yyy
// This is a PUBLIC route (no JWT — the user is coming from Slack's redirect)

#[derive(Deserialize)]
pub struct SlackCallbackQuery {
    pub code: Option<String>,
    pub state: Option<String>,
    pub error: Option<String>,
}

pub async fn oauth_callback(
    State(state): State<AppState>,
    Query(query): Query<SlackCallbackQuery>,
) -> Result<impl IntoResponse, AppError> {
    // Handle user denial
    if let Some(error) = &query.error {
        tracing::warn!("[Slack] OAuth denied: {}", error);
        let redirect_url = format!("{}/settings?slack=denied", state.config.frontend_url);
        return Ok(Redirect::temporary(&redirect_url).into_response());
    }

    let code = query
        .code
        .as_deref()
        .ok_or_else(|| AppError::BadRequest("Missing code parameter".into()))?;

    let state_param = query
        .state
        .as_deref()
        .ok_or_else(|| AppError::BadRequest("Missing state parameter".into()))?;

    // Verify and extract user_id from state
    let user_id = verify_oauth_state(state_param, &state.config.jwt_secret)
        .ok_or_else(|| AppError::BadRequest("Invalid or expired state parameter".into()))?;

    tracing::info!("[Slack] OAuth callback for user_id={}", user_id);

    let client_id = state
        .config
        .slack_client_id
        .as_deref()
        .ok_or_else(|| AppError::Internal("SLACK_CLIENT_ID not configured".into()))?;

    let client_secret = state
        .config
        .slack_client_secret
        .as_deref()
        .ok_or_else(|| AppError::Internal("SLACK_CLIENT_SECRET not configured".into()))?;

    let redirect_uri = format!("{}/auth/slack/callback", state.config.backend_url);

    // Exchange code for token
    let oauth_resp = state
        .slack
        .exchange_code(client_id, client_secret, code, &redirect_uri)
        .await
        .map_err(|e| {
            tracing::error!("[Slack] OAuth exchange failed: {}", e);
            AppError::Internal(format!("Slack OAuth failed: {}", e))
        })?;

    let bot_token = oauth_resp
        .access_token
        .ok_or_else(|| AppError::Internal("No access_token in Slack response".into()))?;

    let team_id = oauth_resp.team.as_ref().map(|t| t.id.clone()).unwrap_or_default();
    let team_name = oauth_resp.team.as_ref().map(|t| t.name.clone()).unwrap_or_default();

    tracing::info!(
        "[Slack] OAuth success user_id={} team={} ({})",
        user_id,
        team_name,
        team_id
    );

    // Upsert slack_connections
    sqlx::query(
        r#"INSERT INTO slack_connections (id, user_id, team_id, team_name, bot_token, status)
           VALUES ($1, $2, $3, $4, $5, 'connected')
           ON CONFLICT (user_id) DO UPDATE SET
             team_id = $3,
             team_name = $4,
             bot_token = $5,
             status = 'connected',
             updated_at = NOW()"#,
    )
    .bind(Uuid::new_v4())
    .bind(user_id)
    .bind(&team_id)
    .bind(&team_name)
    .bind(&bot_token)
    .execute(&state.db)
    .await?;

    // Auto-sync channels into groups table
    if let Ok(channels) = state.slack.list_channels(&bot_token).await {
        for ch in &channels {
            let _ = sqlx::query(
                r#"INSERT INTO groups (id, user_id, whatsapp_group_id, name, member_count, source)
                   VALUES ($1, $2, $3, $4, $5, 'slack')
                   ON CONFLICT (user_id, whatsapp_group_id) DO UPDATE SET
                     name = $4,
                     member_count = $5"#,
            )
            .bind(Uuid::new_v4())
            .bind(user_id)
            .bind(&ch.id)
            .bind(&ch.name)
            .bind(ch.num_members.unwrap_or(0) as i32)
            .execute(&state.db)
            .await;
        }
        tracing::info!("[Slack] auto-synced {} channels for user_id={}", channels.len(), user_id);
    }

    // Redirect back to frontend Settings page
    let redirect_url = format!("{}/settings?slack=success", state.config.frontend_url);
    Ok(Redirect::temporary(&redirect_url).into_response())
}

// ─── Get Slack connection status ───

pub async fn get_status(
    State(state): State<AppState>,
    user_id: Uuid,
) -> Result<Json<serde_json::Value>, AppError> {
    let conn = sqlx::query_as::<_, (String, Option<String>, Option<String>)>(
        "SELECT status, team_id, team_name FROM slack_connections WHERE user_id = $1",
    )
    .bind(user_id)
    .fetch_optional(&state.db)
    .await?;

    match conn {
        Some((status, team_id, team_name)) => Ok(Json(serde_json::json!({
            "connected": status == "connected",
            "status": status,
            "team_id": team_id,
            "team_name": team_name,
        }))),
        None => Ok(Json(serde_json::json!({
            "connected": false,
            "status": "disconnected",
        }))),
    }
}

// ─── Disconnect Slack ───

pub async fn disconnect(
    State(state): State<AppState>,
    user_id: Uuid,
) -> Result<StatusCode, AppError> {
    tracing::info!("[Slack] disconnect user_id={}", user_id);

    sqlx::query("DELETE FROM groups WHERE user_id = $1 AND source = 'slack'")
        .bind(user_id)
        .execute(&state.db)
        .await?;

    sqlx::query("DELETE FROM slack_connections WHERE user_id = $1")
        .bind(user_id)
        .execute(&state.db)
        .await?;

    Ok(StatusCode::NO_CONTENT)
}

// ─── List Slack channels ───

pub async fn list_channels(
    State(state): State<AppState>,
    user_id: Uuid,
) -> Result<Json<Vec<serde_json::Value>>, AppError> {
    let bot_token = sqlx::query_scalar::<_, String>(
        "SELECT bot_token FROM slack_connections WHERE user_id = $1 AND status = 'connected'",
    )
    .bind(user_id)
    .fetch_optional(&state.db)
    .await?
    .ok_or_else(|| AppError::BadRequest("Slack not connected".into()))?;

    let channels = state
        .slack
        .list_channels(&bot_token)
        .await
        .map_err(|e| AppError::Internal(format!("Slack API error: {}", e)))?;

    let monitored: Vec<(String, bool)> = sqlx::query_as(
        "SELECT whatsapp_group_id, is_monitored FROM groups WHERE user_id = $1 AND source = 'slack'",
    )
    .bind(user_id)
    .fetch_all(&state.db)
    .await?;

    let monitored_map: std::collections::HashMap<String, bool> =
        monitored.into_iter().collect();

    let result: Vec<serde_json::Value> = channels
        .into_iter()
        .map(|ch| {
            let is_monitored = monitored_map.get(&ch.id).copied().unwrap_or(false);
            serde_json::json!({
                "id": ch.id,
                "name": ch.name,
                "num_members": ch.num_members,
                "is_member": ch.is_member,
                "is_monitored": is_monitored,
            })
        })
        .collect();

    Ok(Json(result))
}

// ─── Sync Slack channels into groups table ───

pub async fn sync_channels(
    State(state): State<AppState>,
    user_id: Uuid,
) -> Result<Json<Vec<serde_json::Value>>, AppError> {
    tracing::info!("[Slack] sync_channels user_id={}", user_id);

    let bot_token = sqlx::query_scalar::<_, String>(
        "SELECT bot_token FROM slack_connections WHERE user_id = $1 AND status = 'connected'",
    )
    .bind(user_id)
    .fetch_optional(&state.db)
    .await?
    .ok_or_else(|| AppError::BadRequest("Slack not connected".into()))?;

    let channels = state
        .slack
        .list_channels(&bot_token)
        .await
        .map_err(|e| AppError::Internal(format!("Slack API error: {}", e)))?;

    for ch in &channels {
        sqlx::query(
            r#"INSERT INTO groups (id, user_id, whatsapp_group_id, name, member_count, source)
               VALUES ($1, $2, $3, $4, $5, 'slack')
               ON CONFLICT (user_id, whatsapp_group_id) DO UPDATE SET
                 name = $4,
                 member_count = $5"#,
        )
        .bind(Uuid::new_v4())
        .bind(user_id)
        .bind(&ch.id)
        .bind(&ch.name)
        .bind(ch.num_members.unwrap_or(0) as i32)
        .execute(&state.db)
        .await?;
    }

    list_channels(State(state), user_id).await
}

// ─── Toggle Slack channel monitoring ───

pub async fn toggle_channel(
    State(state): State<AppState>,
    user_id: Uuid,
    channel_id: String,
) -> Result<Json<serde_json::Value>, AppError> {
    tracing::info!(
        "[Slack] toggle_channel user_id={} channel_id={}",
        user_id,
        channel_id
    );

    let result = sqlx::query_as::<_, (Uuid, bool)>(
        r#"UPDATE groups SET is_monitored = NOT is_monitored
           WHERE user_id = $1 AND whatsapp_group_id = $2 AND source = 'slack'
           RETURNING id, is_monitored"#,
    )
    .bind(user_id)
    .bind(&channel_id)
    .fetch_optional(&state.db)
    .await?;

    match result {
        Some((id, is_monitored)) => Ok(Json(serde_json::json!({
            "id": id,
            "channel_id": channel_id,
            "is_monitored": is_monitored,
        }))),
        None => Err(AppError::NotFound("Channel not found in monitored groups".into())),
    }
}

// ─── Test Slack webhook alert ───

pub async fn test_alert(
    State(state): State<AppState>,
    user_id: Uuid,
) -> Result<Json<serde_json::Value>, AppError> {
    let webhook_url = sqlx::query_scalar::<_, Option<String>>(
        "SELECT slack_webhook_url FROM profiles WHERE user_id = $1",
    )
    .bind(user_id)
    .fetch_optional(&state.db)
    .await?
    .flatten()
    .ok_or_else(|| AppError::BadRequest("No Slack webhook URL configured".into()))?;

    state
        .slack
        .send_webhook_rich_alert(
            &webhook_url,
            85,
            "Test Contact",
            "+33600000000",
            "Groupe Test",
            "Ceci est un message de test depuis Radar pour verifier votre integration Slack.",
            "Bonjour, je suis interesse par votre offre...",
            &state.config.frontend_url,
        )
        .await
        .map_err(|e| AppError::Internal(format!("Slack webhook error: {}", e)))?;

    Ok(Json(serde_json::json!({
        "message": "Alerte Slack envoyee avec succes !"
    })))
}

// ─── Global Slack Events API webhook ───
// URL: POST /webhook/slack/events
// ONE single URL configured in the Slack App → Event Subscriptions.
// Slack sends team_id in the payload, we look up which Radar user owns that workspace.

pub async fn slack_events_webhook(
    State(state): State<AppState>,
    body: Bytes,
) -> Result<Json<serde_json::Value>, AppError> {
    let payload: serde_json::Value = serde_json::from_slice(&body)
        .map_err(|e| AppError::BadRequest(format!("Invalid JSON: {}", e)))?;

    // Handle Slack URL verification challenge (sent once when configuring the Request URL)
    if payload["type"].as_str() == Some("url_verification") {
        let challenge = payload["challenge"].as_str().unwrap_or("");
        tracing::info!("[Slack] URL verification challenge");
        return Ok(Json(serde_json::json!({ "challenge": challenge })));
    }

    // Handle event callbacks
    if payload["type"].as_str() != Some("event_callback") {
        return Ok(Json(serde_json::json!({ "ok": true })));
    }

    let team_id = payload["team_id"].as_str().unwrap_or("");
    let event = &payload["event"];
    let event_type = event["type"].as_str().unwrap_or("");

    // Only process new messages (no edits, no bot messages, no subtypes)
    if event_type != "message" || !event["subtype"].is_null() {
        return Ok(Json(serde_json::json!({ "ok": true })));
    }

    let channel_id = event["channel"].as_str().unwrap_or("");
    let text = event["text"].as_str().unwrap_or("");
    let user_slack_id = event["user"].as_str().unwrap_or("");
    let ts = event["ts"]
        .as_str()
        .and_then(|s| s.split('.').next())
        .and_then(|s| s.parse::<i64>().ok())
        .unwrap_or_else(|| chrono::Utc::now().timestamp());

    if text.trim().is_empty() {
        return Ok(Json(serde_json::json!({ "ok": true })));
    }

    tracing::info!(
        "[Slack] message: team_id={} channel={} sender={} text_len={}",
        team_id, channel_id, user_slack_id, text.len()
    );

    // Find ALL Radar users who are connected to this Slack workspace (team_id)
    // and who monitor this channel
    let users: Vec<(Uuid, Uuid, String)> = sqlx::query_as(
        r#"SELECT g.id, sc.user_id, g.name
           FROM slack_connections sc
           JOIN groups g ON g.user_id = sc.user_id
                        AND g.whatsapp_group_id = $2
                        AND g.source = 'slack'
                        AND g.is_monitored = true
           WHERE sc.team_id = $1
             AND sc.status = 'connected'"#,
    )
    .bind(team_id)
    .bind(channel_id)
    .fetch_all(&state.db)
    .await?;

    if users.is_empty() {
        tracing::debug!(
            "[Slack] no monitored users for team_id={} channel={}",
            team_id, channel_id
        );
        return Ok(Json(serde_json::json!({ "ok": true })));
    }

    tracing::info!(
        "[Slack] routing message to {} user(s) for channel={}",
        users.len(), channel_id
    );

    // Process for each user who monitors this channel
    let channel_name = users.first().map(|u| u.2.clone()).unwrap_or_default();

    super::webhook::process_message_from_slack(
        &state,
        channel_id,
        text,
        Some(user_slack_id),
        Some(&channel_name),
        ts,
    )
    .await?;

    Ok(Json(serde_json::json!({ "ok": true })))
}

// ─── OAuth state signing/verification ───
// We encode user_id + timestamp into the state param, signed with HMAC
// so nobody can forge a callback for another user.

fn sign_oauth_state(user_id: Uuid, secret: &str) -> String {
    use hmac::{Hmac, Mac};
    use sha2::Sha256;

    let timestamp = chrono::Utc::now().timestamp();
    let payload = format!("{}:{}", user_id, timestamp);

    let mut mac = Hmac::<Sha256>::new_from_slice(secret.as_bytes())
        .expect("HMAC can take key of any size");
    mac.update(payload.as_bytes());
    let signature = hex::encode(mac.finalize().into_bytes());

    // state = user_id:timestamp:signature
    format!("{}:{}", payload, signature)
}

fn verify_oauth_state(state: &str, secret: &str) -> Option<Uuid> {
    use hmac::{Hmac, Mac};
    use sha2::Sha256;

    let parts: Vec<&str> = state.splitn(3, ':').collect();
    if parts.len() != 3 {
        return None;
    }

    let user_id_str = parts[0];
    let timestamp_str = parts[1];
    let provided_sig = parts[2];

    // Check not expired (15 minutes max)
    let timestamp: i64 = timestamp_str.parse().ok()?;
    let now = chrono::Utc::now().timestamp();
    if (now - timestamp).abs() > 900 {
        tracing::warn!("[Slack] OAuth state expired (age={}s)", now - timestamp);
        return None;
    }

    // Verify HMAC signature
    let payload = format!("{}:{}", user_id_str, timestamp_str);
    let mut mac = Hmac::<Sha256>::new_from_slice(secret.as_bytes()).ok()?;
    mac.update(payload.as_bytes());
    let expected_sig = hex::encode(mac.finalize().into_bytes());

    if !constant_time_eq::constant_time_eq(provided_sig.as_bytes(), expected_sig.as_bytes()) {
        tracing::warn!("[Slack] OAuth state signature mismatch");
        return None;
    }

    user_id_str.parse::<Uuid>().ok()
}

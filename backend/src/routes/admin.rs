use axum::{extract::{Path, State}, http::StatusCode, Json};
use uuid::Uuid;

use crate::errors::AppError;
use crate::models::user::{AdminUserUpdate, User, UserPublic};
use crate::AppState;

pub async fn list_users(
    State(state): State<AppState>,
    _admin_id: Uuid,
) -> Result<Json<Vec<UserPublic>>, AppError> {
    let users = sqlx::query_as::<_, User>("SELECT * FROM users ORDER BY created_at DESC")
        .fetch_all(&state.db)
        .await?;

    Ok(Json(users.into_iter().map(UserPublic::from).collect()))
}

pub async fn update_user(
    State(state): State<AppState>,
    _admin_id: Uuid,
    Path(id): Path<Uuid>,
    Json(req): Json<AdminUserUpdate>,
) -> Result<Json<UserPublic>, AppError> {
    let user = sqlx::query_as::<_, User>(
        r#"UPDATE users SET
            is_active = COALESCE($2, is_active),
            role = COALESCE($3, role),
            full_name = COALESCE($4, full_name),
            updated_at = NOW()
           WHERE id = $1
           RETURNING *"#,
    )
    .bind(id)
    .bind(req.is_active)
    .bind(&req.role)
    .bind(&req.full_name)
    .fetch_optional(&state.db)
    .await?
    .ok_or_else(|| AppError::NotFound("User not found".into()))?;

    Ok(Json(UserPublic::from(user)))
}

pub async fn get_config(
    State(state): State<AppState>,
    _admin_id: Uuid,
) -> Result<Json<Vec<serde_json::Value>>, AppError> {
    let configs = sqlx::query_as::<_, (String, String, chrono::DateTime<chrono::Utc>)>(
        "SELECT key, value, updated_at FROM system_config ORDER BY key"
    )
    .fetch_all(&state.db)
    .await?;

    let result: Vec<serde_json::Value> = configs
        .into_iter()
        .map(|(key, value, updated_at)| {
            // Mask sensitive values
            let display_value = if key.contains("key") || key.contains("secret") {
                let len = value.len();
                if len > 4 {
                    format!("{}...{}", &value[..2], &value[len - 4..])
                } else {
                    "****".into()
                }
            } else {
                value
            };
            serde_json::json!({
                "key": key,
                "value": display_value,
                "updated_at": updated_at,
            })
        })
        .collect();

    Ok(Json(result))
}

pub async fn update_config(
    State(state): State<AppState>,
    _admin_id: Uuid,
    Json(configs): Json<Vec<ConfigEntry>>,
) -> Result<StatusCode, AppError> {
    for entry in configs {
        sqlx::query(
            r#"INSERT INTO system_config (key, value, updated_at)
               VALUES ($1, $2, NOW())
               ON CONFLICT (key) DO UPDATE SET value = $2, updated_at = NOW()"#,
        )
        .bind(&entry.key)
        .bind(&entry.value)
        .execute(&state.db)
        .await?;
    }

    Ok(StatusCode::OK)
}

#[derive(serde::Deserialize)]
pub struct ConfigEntry {
    pub key: String,
    pub value: String,
}

pub async fn get_logs(
    State(_state): State<AppState>,
    _admin_id: Uuid,
) -> Result<Json<Vec<serde_json::Value>>, AppError> {
    // Return recent log entries (in production, this would read from a log store)
    Ok(Json(vec![serde_json::json!({
        "message": "Logs are available via RUST_LOG and tracing output",
        "level": "info"
    })]))
}

pub async fn list_hub_spoke_tokens(
    State(state): State<AppState>,
    _admin_id: Uuid,
) -> Result<Json<Vec<serde_json::Value>>, AppError> {
    let tokens = sqlx::query_as::<_, (Uuid, String, bool, chrono::DateTime<chrono::Utc>, Option<chrono::DateTime<chrono::Utc>>)>(
        "SELECT id, source_app, is_active, created_at, last_used FROM hub_spoke_tokens ORDER BY created_at DESC"
    )
    .fetch_all(&state.db)
    .await?;

    let result: Vec<serde_json::Value> = tokens
        .into_iter()
        .map(|(id, source, active, created, last_used)| {
            serde_json::json!({
                "id": id,
                "source_app": source,
                "is_active": active,
                "created_at": created,
                "last_used": last_used,
            })
        })
        .collect();

    Ok(Json(result))
}

#[derive(serde::Deserialize)]
pub struct CreateTokenRequest {
    pub source_app: String,
}

pub async fn create_hub_spoke_token(
    State(state): State<AppState>,
    _admin_id: Uuid,
    Json(req): Json<CreateTokenRequest>,
) -> Result<(StatusCode, Json<serde_json::Value>), AppError> {
    let token = uuid::Uuid::new_v4().to_string();
    use sha2::Digest;
    let token_hash = format!("{:x}", sha2::Sha256::digest(token.as_bytes()));

    sqlx::query(
        "INSERT INTO hub_spoke_tokens (id, source_app, token_hash) VALUES ($1, $2, $3)"
    )
    .bind(Uuid::new_v4())
    .bind(&req.source_app)
    .bind(&token_hash)
    .execute(&state.db)
    .await?;

    Ok((
        StatusCode::CREATED,
        Json(serde_json::json!({
            "token": token,
            "source_app": req.source_app,
            "message": "Save this token, it won't be shown again"
        })),
    ))
}

pub async fn delete_hub_spoke_token(
    State(state): State<AppState>,
    _admin_id: Uuid,
    Path(id): Path<Uuid>,
) -> Result<StatusCode, AppError> {
    sqlx::query("DELETE FROM hub_spoke_tokens WHERE id = $1")
        .bind(id)
        .execute(&state.db)
        .await?;

    Ok(StatusCode::NO_CONTENT)
}

// --- Admin group management ---

#[derive(serde::Deserialize)]
pub struct CreateGroupRequest {
    pub user_id: Uuid,
    pub whatsapp_group_id: String,
    pub name: String,
    pub member_count: Option<i32>,
    pub is_monitored: Option<bool>,
}

pub async fn create_group(
    State(state): State<AppState>,
    _admin_id: Uuid,
    Json(req): Json<CreateGroupRequest>,
) -> Result<(StatusCode, Json<serde_json::Value>), AppError> {
    let id = Uuid::new_v4();
    let monitored = req.is_monitored.unwrap_or(true);

    sqlx::query(
        r#"INSERT INTO groups (id, user_id, whatsapp_group_id, name, member_count, is_monitored)
           VALUES ($1, $2, $3, $4, $5, $6)
           ON CONFLICT (user_id, whatsapp_group_id) DO UPDATE
           SET name = $4, member_count = $5, is_monitored = $6"#,
    )
    .bind(id)
    .bind(req.user_id)
    .bind(&req.whatsapp_group_id)
    .bind(&req.name)
    .bind(req.member_count.unwrap_or(0))
    .bind(monitored)
    .execute(&state.db)
    .await?;

    Ok((
        StatusCode::CREATED,
        Json(serde_json::json!({
            "id": id,
            "whatsapp_group_id": req.whatsapp_group_id,
            "name": req.name,
            "is_monitored": monitored
        })),
    ))
}

use axum::{extract::State, http::StatusCode, Json};
use uuid::Uuid;

use crate::errors::AppError;
use crate::AppState;

pub async fn connect(
    State(state): State<AppState>,
    user_id: Uuid,
) -> Result<Json<serde_json::Value>, AppError> {
    let evolution = match state.evolution.as_ref() {
        Some(e) => e,
        None => return Err(AppError::BadRequest("Evolution API not configured. Set it up in Admin settings.".into())),
    };

    let instance_name = format!("radar-{}", user_id.to_string().split('-').next().unwrap_or("user"));

    // Create instance (ignore "already exists" errors)
    let create_result = evolution.create_instance(&instance_name).await;
    if let Err(ref e) = create_result {
        let err_str = e.to_string();
        // Only fail if it's NOT an "already exists" error
        if !err_str.contains("already exists") && !err_str.contains("already created") {
            tracing::error!("Evolution create_instance error: {}", err_str);
            return Err(AppError::BadRequest(format!("Evolution API: {}", err_str)));
        }
    }

    // Save connection — try update first, then insert
    let updated = sqlx::query(
        "UPDATE whatsapp_connections SET instance_name = $1, status = 'connecting', updated_at = NOW() WHERE user_id = $2"
    )
    .bind(&instance_name)
    .bind(user_id)
    .execute(&state.db)
    .await?;

    if updated.rows_affected() == 0 {
        sqlx::query(
            "INSERT INTO whatsapp_connections (id, user_id, instance_name, status) VALUES ($1, $2, $3, 'connecting')"
        )
        .bind(Uuid::new_v4())
        .bind(user_id)
        .bind(&instance_name)
        .execute(&state.db)
        .await?;
    }

    // Get QR code
    match evolution.get_qr_code(&instance_name).await {
        Ok(qr) => {
            let qr_code = qr.get("base64").or(qr.get("code")).cloned();
            Ok(Json(serde_json::json!({
                "instance_name": instance_name,
                "qr_code": qr_code,
                "status": "connecting"
            })))
        }
        Err(e) => {
            tracing::error!("Evolution get_qr_code error: {}", e);
            Err(AppError::BadRequest(format!("Evolution API: {}", e)))
        }
    }
}

pub async fn get_qr(
    State(state): State<AppState>,
    user_id: Uuid,
) -> Result<Json<serde_json::Value>, AppError> {
    let evolution = match state.evolution.as_ref() {
        Some(e) => e,
        None => return Ok(Json(serde_json::json!({
            "status": "not_configured",
            "qr_code": null
        }))),
    };

    let conn = match sqlx::query_as::<_, (String, String)>(
        "SELECT instance_name, status FROM whatsapp_connections WHERE user_id = $1"
    )
    .bind(user_id)
    .fetch_optional(&state.db)
    .await?
    {
        Some(c) => c,
        None => return Ok(Json(serde_json::json!({
            "status": "disconnected",
            "qr_code": null
        }))),
    };

    // Check if connected first
    if let Ok(status) = evolution.get_instance_status(&conn.0).await {
        let state_str = status["state"].as_str()
            .or_else(|| status["instance"]["state"].as_str())
            .unwrap_or("unknown");
        if state_str == "open" {
            let _ = sqlx::query(
                "UPDATE whatsapp_connections SET status = 'connected', updated_at = NOW() WHERE user_id = $1"
            )
            .bind(user_id)
            .execute(&state.db)
            .await;

            return Ok(Json(serde_json::json!({
                "status": "connected",
                "qr_code": null
            })));
        }
    }

    // Get QR code
    match evolution.get_qr_code(&conn.0).await {
        Ok(qr) => {
            let qr_code = qr.get("base64").or(qr.get("code")).cloned();
            Ok(Json(serde_json::json!({
                "status": if qr_code.is_some() { "connecting" } else { &conn.1 },
                "qr_code": qr_code,
            })))
        }
        Err(e) => {
            tracing::warn!("QR code fetch error: {}", e);
            Ok(Json(serde_json::json!({
                "status": "error",
                "qr_code": null,
                "error": e.to_string()
            })))
        }
    }
}

pub async fn get_status(
    State(state): State<AppState>,
    user_id: Uuid,
) -> Result<Json<serde_json::Value>, AppError> {
    let conn = sqlx::query_as::<_, (String, String, Option<String>)>(
        "SELECT instance_name, status, connected_number FROM whatsapp_connections WHERE user_id = $1"
    )
    .bind(user_id)
    .fetch_optional(&state.db)
    .await?;

    match conn {
        Some((instance, status, number)) => {
            // Check live status from Evolution API
            let live_status = if let Some(evolution) = &state.evolution {
                evolution
                    .get_instance_status(&instance)
                    .await
                    .ok()
                    .and_then(|s| s["state"].as_str().map(|s| s.to_string()))
            } else {
                None
            };

            Ok(Json(serde_json::json!({
                "status": live_status.unwrap_or(status),
                "connected_number": number,
                "instance_name": instance
            })))
        }
        None => Ok(Json(serde_json::json!({
            "status": "disconnected",
            "connected_number": null
        }))),
    }
}

pub async fn disconnect(
    State(state): State<AppState>,
    user_id: Uuid,
) -> Result<StatusCode, AppError> {
    let conn = sqlx::query_as::<_, (String,)>(
        "SELECT instance_name FROM whatsapp_connections WHERE user_id = $1"
    )
    .bind(user_id)
    .fetch_optional(&state.db)
    .await?;

    if let Some((instance,)) = conn {
        if let Some(evolution) = &state.evolution {
            let _ = evolution.delete_instance(&instance).await;
        }

        sqlx::query(
            "UPDATE whatsapp_connections SET status = 'disconnected', updated_at = NOW() WHERE user_id = $1"
        )
        .bind(user_id)
        .execute(&state.db)
        .await?;
    }

    Ok(StatusCode::OK)
}

use axum::{extract::State, http::StatusCode, Json};
use serde::Deserialize;
use uuid::Uuid;

use crate::errors::AppError;
use crate::AppState;

#[derive(Deserialize)]
pub struct ConnectExistingRequest {
    pub instance_name: String,
}

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

    // Set webhook
    let webhook_url = "https://api.radar.jockaliaservices.fr/webhook/hub-spoke";
    if let Err(e) = evolution.set_webhook(&instance_name, webhook_url).await {
        tracing::warn!("Failed to set webhook for {}: {}", instance_name, e);
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

pub async fn connect_existing(
    State(state): State<AppState>,
    user_id: Uuid,
    Json(payload): Json<ConnectExistingRequest>,
) -> Result<Json<serde_json::Value>, AppError> {
    let evolution = match state.evolution.as_ref() {
        Some(e) => e,
        None => return Err(AppError::BadRequest("Evolution API not configured. Set it up in Admin settings.".into())),
    };

    let instance_name = payload.instance_name.trim().to_string();
    if instance_name.is_empty() {
        return Err(AppError::BadRequest("Instance name is required".into()));
    }

    // Verify instance exists
    let instances = evolution.list_instances().await.map_err(|e| {
        AppError::BadRequest(format!("Failed to list instances: {}", e))
    })?;

    let instance_exists = instances.iter().any(|inst| {
        inst["instance"]["instanceName"].as_str() == Some(&instance_name)
            || inst["instanceName"].as_str() == Some(&instance_name)
            || inst["name"].as_str() == Some(&instance_name)
    });

    if !instance_exists {
        return Err(AppError::BadRequest(format!(
            "Instance '{}' not found in Evolution API",
            instance_name
        )));
    }

    // Check connection status
    let status_str = match evolution.get_instance_status(&instance_name).await {
        Ok(status) => {
            let s = status["state"].as_str()
                .or_else(|| status["instance"]["state"].as_str())
                .unwrap_or("unknown")
                .to_string();
            s
        }
        Err(_) => "unknown".to_string(),
    };

    // Configure webhook
    let webhook_url = "https://api.radar.jockaliaservices.fr/webhook/hub-spoke";
    if let Err(e) = evolution.set_webhook(&instance_name, webhook_url).await {
        tracing::warn!("Failed to set webhook for {}: {}", instance_name, e);
    }

    // Save to whatsapp_connections
    let db_status = if status_str == "open" { "connected" } else { "connecting" };

    let updated = sqlx::query(
        "UPDATE whatsapp_connections SET instance_name = $1, status = $2, updated_at = NOW() WHERE user_id = $3"
    )
    .bind(&instance_name)
    .bind(db_status)
    .bind(user_id)
    .execute(&state.db)
    .await?;

    if updated.rows_affected() == 0 {
        sqlx::query(
            "INSERT INTO whatsapp_connections (id, user_id, instance_name, status) VALUES ($1, $2, $3, $4)"
        )
        .bind(Uuid::new_v4())
        .bind(user_id)
        .bind(&instance_name)
        .bind(db_status)
        .execute(&state.db)
        .await?;
    }

    Ok(Json(serde_json::json!({
        "status": db_status,
        "instance_name": instance_name,
        "webhook_url": webhook_url
    })))
}

pub async fn list_evolution_instances(
    State(state): State<AppState>,
) -> Result<Json<serde_json::Value>, AppError> {
    let evolution = match state.evolution.as_ref() {
        Some(e) => e,
        None => return Err(AppError::BadRequest("Evolution API not configured.".into())),
    };

    let instances = evolution.list_instances().await.map_err(|e| {
        AppError::BadRequest(format!("Failed to list instances: {}", e))
    })?;

    // Extract useful info from each instance
    let simplified: Vec<serde_json::Value> = instances.iter().map(|inst| {
        let name = inst["instance"]["instanceName"].as_str()
            .or_else(|| inst["instanceName"].as_str())
            .or_else(|| inst["name"].as_str())
            .unwrap_or("unknown");
        let state_str = inst["instance"]["state"].as_str()
            .or_else(|| inst["state"].as_str())
            .unwrap_or("unknown");
        serde_json::json!({
            "instance_name": name,
            "status": state_str
        })
    }).collect();

    Ok(Json(serde_json::json!({
        "instances": simplified
    })))
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

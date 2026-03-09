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
    tracing::info!("[WhatsApp] connect (new instance) user_id={}", user_id);

    let evolution = match state.evolution.as_ref() {
        Some(e) => e,
        None => {
            tracing::error!("[WhatsApp] connect: Evolution API not configured");
            return Err(AppError::BadRequest("Evolution API not configured. Set it up in Admin settings.".into()));
        }
    };

    let instance_name = format!("radar_{}", user_id.to_string().split('-').next().unwrap_or("user"));
    tracing::info!("[WhatsApp] connect: creating instance={} for user_id={}", instance_name, user_id);

    // Create instance (ignore "already exists" errors)
    let create_result = evolution.create_instance(&instance_name).await;
    if let Err(ref e) = create_result {
        let err_str = e.to_string();
        // Only fail if it's NOT an "already exists" error
        if !err_str.contains("already exists") && !err_str.contains("already created") {
            tracing::error!("[WhatsApp] connect: create_instance FAILED: {}", err_str);
            return Err(AppError::BadRequest(format!("Evolution API: {}", err_str)));
        }
        tracing::info!("[WhatsApp] connect: instance already exists, continuing");
    }

    // Save connection — try update first, then insert
    let updated = sqlx::query(
        "UPDATE whatsapp_connections SET instance_name = $1, status = 'awaiting_qr', updated_at = NOW() WHERE user_id = $2"
    )
    .bind(&instance_name)
    .bind(user_id)
    .execute(&state.db)
    .await?;

    if updated.rows_affected() == 0 {
        tracing::info!("[WhatsApp] connect: no existing connection, inserting new row");
        sqlx::query(
            "INSERT INTO whatsapp_connections (id, user_id, instance_name, status) VALUES ($1, $2, $3, 'awaiting_qr')"
        )
        .bind(Uuid::new_v4())
        .bind(user_id)
        .bind(&instance_name)
        .execute(&state.db)
        .await?;
    } else {
        tracing::info!("[WhatsApp] connect: updated existing connection row");
    }

    // Option A: auto-configure webhook on the new instance
    let webhook_url = format!("{}/webhook/whatsapp/{}", state.config.backend_url, user_id);
    tracing::info!("[WhatsApp] connect: auto-configuring webhook on instance={} url={}", instance_name, webhook_url);
    match evolution.set_webhook(&instance_name, &webhook_url).await {
        Ok(_) => tracing::info!("[WhatsApp] connect: webhook configured OK"),
        Err(e) => tracing::warn!("[WhatsApp] connect: webhook configuration failed (will retry on next connect): {}", e),
    }

    // Save webhook_url in DB
    let _ = sqlx::query(
        "UPDATE whatsapp_connections SET webhook_url = $1 WHERE user_id = $2"
    )
    .bind(&webhook_url)
    .bind(user_id)
    .execute(&state.db)
    .await;

    // Get QR code
    match evolution.get_qr_code(&instance_name).await {
        Ok(qr) => {
            let qr_code = qr.get("base64").or(qr.get("code")).cloned();
            tracing::info!("[WhatsApp] connect: QR code obtained, has_qr={}", qr_code.is_some());
            Ok(Json(serde_json::json!({
                "instance_name": instance_name,
                "qr_code": qr_code,
                "status": "awaiting_qr",
                "webhook_url": webhook_url
            })))
        }
        Err(e) => {
            tracing::error!("[WhatsApp] connect: get_qr_code FAILED: {}", e);
            Err(AppError::BadRequest(format!("Evolution API: {}", e)))
        }
    }
}

pub async fn get_qr(
    State(state): State<AppState>,
    user_id: Uuid,
) -> Result<Json<serde_json::Value>, AppError> {
    tracing::debug!("[WhatsApp] get_qr user_id={}", user_id);

    let evolution = match state.evolution.as_ref() {
        Some(e) => e,
        None => {
            tracing::warn!("[WhatsApp] get_qr: Evolution not configured");
            return Ok(Json(serde_json::json!({
                "status": "not_configured",
                "qr_code": null
            })));
        }
    };

    let conn = match sqlx::query_as::<_, (String, String)>(
        "SELECT instance_name, status FROM whatsapp_connections WHERE user_id = $1"
    )
    .bind(user_id)
    .fetch_optional(&state.db)
    .await?
    {
        Some(c) => {
            tracing::debug!("[WhatsApp] get_qr: found connection instance={} status={}", c.0, c.1);
            c
        }
        None => {
            tracing::warn!("[WhatsApp] get_qr: no whatsapp_connection for user_id={}", user_id);
            return Ok(Json(serde_json::json!({
                "status": "disconnected",
                "qr_code": null
            })));
        }
    };

    // Check if connected first
    if let Ok(status) = evolution.get_instance_status(&conn.0).await {
        let state_str = status["state"].as_str()
            .or_else(|| status["instance"]["state"].as_str())
            .unwrap_or("unknown");
        tracing::info!("[WhatsApp] get_qr: instance={} live_state={}", conn.0, state_str);
        if state_str == "open" {
            tracing::info!("[WhatsApp] get_qr: instance={} is OPEN — updating DB to connected", conn.0);
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
            tracing::debug!("[WhatsApp] get_qr: instance={} has_qr={}", conn.0, qr_code.is_some());
            Ok(Json(serde_json::json!({
                "status": if qr_code.is_some() { "connecting" } else { &conn.1 },
                "qr_code": qr_code,
            })))
        }
        Err(e) => {
            tracing::warn!("[WhatsApp] get_qr: QR fetch error for instance={}: {}", conn.0, e);
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
    tracing::debug!("[WhatsApp] get_status user_id={}", user_id);

    let conn = sqlx::query_as::<_, (String, String, Option<String>)>(
        "SELECT instance_name, status, connected_number FROM whatsapp_connections WHERE user_id = $1"
    )
    .bind(user_id)
    .fetch_optional(&state.db)
    .await?;

    match conn {
        Some((instance, status, number)) => {
            tracing::info!("[WhatsApp] get_status: user_id={} instance={} db_status={} number={:?}", user_id, instance, status, number);

            // Check live status from Evolution API
            let live_status = if let Some(evolution) = &state.evolution {
                match evolution.get_instance_status(&instance).await {
                    Ok(s) => {
                        let state_str = s["state"].as_str().map(|s| s.to_string());
                        tracing::info!("[WhatsApp] get_status: instance={} live_state={:?}", instance, state_str);
                        state_str
                    }
                    Err(e) => {
                        tracing::warn!("[WhatsApp] get_status: failed to get live status for {}: {}", instance, e);
                        None
                    }
                }
            } else {
                tracing::warn!("[WhatsApp] get_status: Evolution not configured");
                None
            };

            Ok(Json(serde_json::json!({
                "status": live_status.unwrap_or(status),
                "connected_number": number,
                "instance_name": instance
            })))
        }
        None => {
            tracing::info!("[WhatsApp] get_status: user_id={} has no connection", user_id);
            Ok(Json(serde_json::json!({
                "status": "disconnected",
                "connected_number": null
            })))
        }
    }
}

pub async fn connect_existing(
    State(state): State<AppState>,
    user_id: Uuid,
    Json(payload): Json<ConnectExistingRequest>,
) -> Result<Json<serde_json::Value>, AppError> {
    tracing::info!("[WhatsApp] connect_existing user_id={} instance_name={}", user_id, payload.instance_name);

    let evolution = match state.evolution.as_ref() {
        Some(e) => e,
        None => {
            tracing::error!("[WhatsApp] connect_existing: Evolution API not configured");
            return Err(AppError::BadRequest("Evolution API not configured. Set it up in Admin settings.".into()));
        }
    };

    let instance_name = payload.instance_name.trim().to_string();
    if instance_name.is_empty() {
        tracing::warn!("[WhatsApp] connect_existing: empty instance_name");
        return Err(AppError::BadRequest("Instance name is required".into()));
    }

    // Verify instance exists
    tracing::info!("[WhatsApp] connect_existing: listing instances to verify '{}' exists", instance_name);
    let instances = evolution.list_instances().await.map_err(|e| {
        tracing::error!("[WhatsApp] connect_existing: list_instances failed: {}", e);
        AppError::BadRequest(format!("Failed to list instances: {}", e))
    })?;

    let instance_exists = instances.iter().any(|inst| {
        inst["instance"]["instanceName"].as_str() == Some(&instance_name)
            || inst["instanceName"].as_str() == Some(&instance_name)
            || inst["name"].as_str() == Some(&instance_name)
    });

    if !instance_exists {
        let names: Vec<String> = instances.iter().map(|inst| {
            inst["instance"]["instanceName"].as_str()
                .or_else(|| inst["instanceName"].as_str())
                .or_else(|| inst["name"].as_str())
                .unwrap_or("?").to_string()
        }).collect();
        tracing::error!("[WhatsApp] connect_existing: '{}' NOT FOUND. Available: {:?}", instance_name, names);
        return Err(AppError::BadRequest(format!(
            "Instance '{}' not found in Evolution API",
            instance_name
        )));
    }

    tracing::info!("[WhatsApp] connect_existing: instance '{}' found, checking status", instance_name);

    // Check connection status
    let status_str = match evolution.get_instance_status(&instance_name).await {
        Ok(status) => {
            let s = status["state"].as_str()
                .or_else(|| status["instance"]["state"].as_str())
                .unwrap_or("unknown")
                .to_string();
            tracing::info!("[WhatsApp] connect_existing: instance '{}' status={}", instance_name, s);
            s
        }
        Err(e) => {
            tracing::warn!("[WhatsApp] connect_existing: get_instance_status failed for '{}': {}", instance_name, e);
            "unknown".to_string()
        }
    };

    // Save to whatsapp_connections
    let db_status = if status_str == "open" { "connected" } else { "connecting" };
    tracing::info!("[WhatsApp] connect_existing: saving connection instance={} db_status={}", instance_name, db_status);

    let updated = sqlx::query(
        "UPDATE whatsapp_connections SET instance_name = $1, status = $2, updated_at = NOW() WHERE user_id = $3"
    )
    .bind(&instance_name)
    .bind(db_status)
    .bind(user_id)
    .execute(&state.db)
    .await?;

    if updated.rows_affected() == 0 {
        tracing::info!("[WhatsApp] connect_existing: inserting new connection row");
        sqlx::query(
            "INSERT INTO whatsapp_connections (id, user_id, instance_name, status) VALUES ($1, $2, $3, $4)"
        )
        .bind(Uuid::new_v4())
        .bind(user_id)
        .bind(&instance_name)
        .bind(db_status)
        .execute(&state.db)
        .await?;
    } else {
        tracing::info!("[WhatsApp] connect_existing: updated existing connection row");
    }

    // Option B: user must manually configure webhook — provide their personal URL
    let webhook_url = format!("{}/webhook/whatsapp/{}", state.config.backend_url, user_id);

    // Save webhook_url in DB
    let _ = sqlx::query(
        "UPDATE whatsapp_connections SET webhook_url = $1 WHERE user_id = $2"
    )
    .bind(&webhook_url)
    .bind(user_id)
    .execute(&state.db)
    .await;

    tracing::info!("[WhatsApp] connect_existing: DONE user_id={} instance={} status={} webhook_url={}", user_id, instance_name, db_status, webhook_url);

    Ok(Json(serde_json::json!({
        "status": db_status,
        "instance_name": instance_name,
        "webhook_url": webhook_url,
        "message": "Instance verifiee et connectee a Radar. Configurez le webhook dans Evolution API."
    })))
}

pub async fn list_evolution_instances(
    State(state): State<AppState>,
) -> Result<Json<serde_json::Value>, AppError> {
    tracing::info!("[WhatsApp] list_evolution_instances called");

    let evolution = match state.evolution.as_ref() {
        Some(e) => e,
        None => {
            tracing::error!("[WhatsApp] list_evolution_instances: Evolution API not configured");
            return Err(AppError::BadRequest("Evolution API not configured.".into()));
        }
    };

    let instances = evolution.list_instances().await.map_err(|e| {
        tracing::error!("[WhatsApp] list_evolution_instances: failed: {}", e);
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

    tracing::info!("[WhatsApp] list_evolution_instances: returning {} instances", simplified.len());
    for inst in &simplified {
        tracing::debug!("[WhatsApp] instance: name={} status={}", inst["instance_name"], inst["status"]);
    }

    Ok(Json(serde_json::json!({
        "instances": simplified
    })))
}

pub async fn disconnect(
    State(state): State<AppState>,
    user_id: Uuid,
) -> Result<StatusCode, AppError> {
    tracing::info!("[WhatsApp] disconnect user_id={}", user_id);

    let conn = sqlx::query_as::<_, (String,)>(
        "SELECT instance_name FROM whatsapp_connections WHERE user_id = $1"
    )
    .bind(user_id)
    .fetch_optional(&state.db)
    .await?;

    if let Some((instance,)) = conn {
        tracing::info!("[WhatsApp] disconnect: removing instance={} for user_id={}", instance, user_id);
        // Only delete the instance from Evolution API if it was created by Radar (starts with "radar_")
        if instance.starts_with("radar_") {
            tracing::info!("[WhatsApp] disconnect: deleting radar-created instance from Evolution");
            if let Some(evolution) = &state.evolution {
                let _ = evolution.delete_instance(&instance).await;
            }
        } else {
            tracing::info!("[WhatsApp] disconnect: keeping external instance '{}' in Evolution", instance);
        }

        sqlx::query(
            "DELETE FROM whatsapp_connections WHERE user_id = $1"
        )
        .bind(user_id)
        .execute(&state.db)
        .await?;
        tracing::info!("[WhatsApp] disconnect: connection removed from DB");
    } else {
        tracing::info!("[WhatsApp] disconnect: no connection found for user_id={}", user_id);
    }

    Ok(StatusCode::OK)
}

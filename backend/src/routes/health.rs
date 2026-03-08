use axum::{extract::State, Json};
use std::time::Instant;

use crate::AppState;

pub async fn health_check(
    State(state): State<AppState>,
) -> Json<serde_json::Value> {
    // Check database
    let db_start = Instant::now();
    let db_status = match sqlx::query("SELECT 1").execute(&state.db).await {
        Ok(_) => serde_json::json!({
            "status": "ok",
            "latency_ms": db_start.elapsed().as_millis()
        }),
        Err(e) => serde_json::json!({
            "status": "error",
            "error": e.to_string()
        }),
    };

    // Check Redis
    let redis_status = match &state.redis {
        Some(pool) => {
            let redis_start = Instant::now();
            match pool.get().await {
                Ok(mut conn) => {
                    match redis::cmd("PING")
                        .query_async::<_, String>(&mut conn)
                        .await
                    {
                        Ok(_) => serde_json::json!({
                            "status": "ok",
                            "latency_ms": redis_start.elapsed().as_millis()
                        }),
                        Err(e) => serde_json::json!({
                            "status": "error",
                            "error": e.to_string()
                        }),
                    }
                }
                Err(e) => serde_json::json!({
                    "status": "error",
                    "error": e.to_string()
                }),
            }
        }
        None => serde_json::json!({ "status": "not_configured" }),
    };

    // Check Evolution API
    let evolution_status = match &state.evolution {
        Some(evo) => {
            let evo_start = Instant::now();
            match evo.check_connection().await {
                Ok(true) => serde_json::json!({
                    "status": "ok",
                    "latency_ms": evo_start.elapsed().as_millis()
                }),
                _ => serde_json::json!({ "status": "error" }),
            }
        }
        None => serde_json::json!({ "status": "not_configured" }),
    };

    // Gemini status
    let gemini_status = if state.gemini.is_some() {
        serde_json::json!({ "status": "ok" })
    } else {
        serde_json::json!({ "status": "not_configured" })
    };

    let ws_connections = state.ws_manager.connection_count().await;
    let uptime = state.start_time.elapsed().as_secs();

    Json(serde_json::json!({
        "status": "ok",
        "version": "1.0.0",
        "commit": state.config.commit_hash,
        "timestamp": chrono::Utc::now(),
        "services": {
            "database": db_status,
            "redis": redis_status,
            "gemini": gemini_status,
            "evolution_api": evolution_status,
        },
        "websocket_connections": ws_connections,
        "uptime_seconds": uptime
    }))
}

use axum::{extract::{Path, State}, Json};
use uuid::Uuid;

use crate::errors::AppError;
use crate::models::group::Group;
use crate::AppState;

/// GET /api/groups — fast DB-only read, no Evolution API call
pub async fn list_groups(
    State(state): State<AppState>,
    user_id: Uuid,
) -> Result<Json<Vec<Group>>, AppError> {
    tracing::info!("[Groups] list_groups (DB only) user_id={}", user_id);

    let groups = sqlx::query_as::<_, Group>(
        "SELECT * FROM groups WHERE user_id = $1 ORDER BY name"
    )
    .bind(user_id)
    .fetch_all(&state.db)
    .await?;

    tracing::info!("[Groups] Returning {} groups from DB for user_id={}", groups.len(), user_id);
    Ok(Json(groups))
}

/// POST /api/groups/sync — fetch from Evolution API, upsert into DB, return updated list
pub async fn sync_groups(
    State(state): State<AppState>,
    user_id: Uuid,
) -> Result<Json<Vec<Group>>, AppError> {
    tracing::info!("[Groups] sync_groups called for user_id={}", user_id);

    let conn = sqlx::query_as::<_, (String,)>(
        "SELECT instance_name FROM whatsapp_connections WHERE user_id = $1 AND status = 'connected'"
    )
    .bind(user_id)
    .fetch_optional(&state.db)
    .await?;

    let instance_name = match conn {
        Some(c) => {
            tracing::info!("[Groups] sync: user_id={} instance={}", user_id, c.0);
            c.0
        }
        None => {
            tracing::warn!("[Groups] sync: user_id={} has no connected instance", user_id);
            return Err(AppError::BadRequest("Aucune instance WhatsApp connectee.".into()));
        }
    };

    let evolution = state.evolution.as_ref()
        .ok_or_else(|| AppError::BadRequest("Evolution API not configured".into()))?;

    let api_groups = evolution.get_groups(&instance_name).await
        .map_err(|e| {
            tracing::error!("[Groups] sync: Evolution get_groups failed: {}", e);
            AppError::BadRequest(format!("Erreur Evolution API: {}", e))
        })?;

    tracing::info!("[Groups] sync: Evolution returned {} groups", api_groups.len());

    let mut synced = 0;
    for g in &api_groups {
        let gid = g["id"].as_str().unwrap_or_default();
        if gid.is_empty() { continue; }
        let name = g["subject"].as_str().unwrap_or("Unknown");
        let size = g["size"].as_i64().unwrap_or(0) as i32;

        // Atomic upsert — preserves is_monitored on conflict
        let result = sqlx::query(
            r#"INSERT INTO groups (id, user_id, whatsapp_group_id, name, member_count)
               VALUES ($1, $2, $3, $4, $5)
               ON CONFLICT (user_id, whatsapp_group_id)
               DO UPDATE SET name = EXCLUDED.name, member_count = EXCLUDED.member_count"#
        )
        .bind(Uuid::new_v4())
        .bind(user_id)
        .bind(gid)
        .bind(name)
        .bind(size)
        .execute(&state.db)
        .await;

        match result {
            Ok(_) => synced += 1,
            Err(e) => tracing::error!("[Groups] sync: upsert failed gid={}: {}", gid, e),
        }
    }

    tracing::info!("[Groups] sync: upserted {} groups for user_id={}", synced, user_id);

    // Return fresh list from DB
    let groups = sqlx::query_as::<_, Group>(
        "SELECT * FROM groups WHERE user_id = $1 ORDER BY name"
    )
    .bind(user_id)
    .fetch_all(&state.db)
    .await?;

    Ok(Json(groups))
}

/// PUT /api/groups/:id/toggle
pub async fn toggle_group(
    State(state): State<AppState>,
    user_id: Uuid,
    Path(id): Path<Uuid>,
) -> Result<Json<Group>, AppError> {
    tracing::info!("[Groups] toggle_group user_id={} group_id={}", user_id, id);

    let group = sqlx::query_as::<_, Group>(
        r#"UPDATE groups SET is_monitored = NOT is_monitored
           WHERE id = $1 AND user_id = $2
           RETURNING *"#,
    )
    .bind(id)
    .bind(user_id)
    .fetch_optional(&state.db)
    .await?
    .ok_or_else(|| AppError::NotFound("Group not found".into()))?;

    tracing::info!("[Groups] toggle OK group={} is_monitored={}", group.name, group.is_monitored);
    Ok(Json(group))
}

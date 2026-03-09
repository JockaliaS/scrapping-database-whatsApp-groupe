use axum::{extract::{Path, State}, Json};
use uuid::Uuid;

use crate::errors::AppError;
use crate::models::group::Group;
use crate::AppState;

pub async fn list_groups(
    State(state): State<AppState>,
    user_id: Uuid,
) -> Result<Json<Vec<Group>>, AppError> {
    tracing::info!("[Groups] list_groups called for user_id={}", user_id);

    // First sync groups from Evolution API if connection exists
    let conn = sqlx::query_as::<_, (String,)>(
        "SELECT instance_name FROM whatsapp_connections WHERE user_id = $1 AND status = 'connected'"
    )
    .bind(user_id)
    .fetch_optional(&state.db)
    .await;

    match &conn {
        Ok(Some(c)) => tracing::info!("[Groups] user_id={} has connected instance: {}", user_id, c.0),
        Ok(None) => tracing::warn!("[Groups] user_id={} has NO connected whatsapp_connection (status != 'connected')", user_id),
        Err(e) => tracing::error!("[Groups] user_id={} DB error fetching connection: {}", user_id, e),
    }

    // Also log ALL connections for this user regardless of status
    let all_conns = sqlx::query_as::<_, (String, String)>(
        "SELECT instance_name, status FROM whatsapp_connections WHERE user_id = $1"
    )
    .bind(user_id)
    .fetch_all(&state.db)
    .await;

    match &all_conns {
        Ok(conns) => {
            if conns.is_empty() {
                tracing::warn!("[Groups] user_id={} has ZERO whatsapp_connections rows", user_id);
            } else {
                for (name, status) in conns {
                    tracing::info!("[Groups] user_id={} connection: instance={} status={}", user_id, name, status);
                }
            }
        }
        Err(e) => tracing::error!("[Groups] user_id={} DB error listing all connections: {}", user_id, e),
    }

    if let Ok(Some(conn)) = conn {
        if let Some(evolution) = &state.evolution {
            tracing::info!("[Groups] Calling Evolution API get_groups for instance={}", conn.0);
            match evolution.get_groups(&conn.0).await {
                Ok(api_groups) => {
                    tracing::info!("[Groups] Evolution returned {} groups for instance={}", api_groups.len(), conn.0);
                    for (i, g) in api_groups.iter().enumerate() {
                        let gid = g["id"].as_str().unwrap_or_default();
                        let name = g["subject"].as_str().unwrap_or("Unknown");
                        let size = g["size"].as_i64().unwrap_or(0) as i32;
                        tracing::debug!("[Groups] group[{}]: id={} name={} size={}", i, gid, name, size);

                        let result = sqlx::query(
                            r#"INSERT INTO groups (id, user_id, whatsapp_group_id, name, member_count)
                               VALUES ($1, $2, $3, $4, $5)
                               ON CONFLICT (user_id, whatsapp_group_id) DO UPDATE
                               SET name = $4, member_count = $5"#,
                        )
                        .bind(Uuid::new_v4())
                        .bind(user_id)
                        .bind(gid)
                        .bind(name)
                        .bind(size)
                        .execute(&state.db)
                        .await;

                        if let Err(e) = result {
                            tracing::error!("[Groups] DB upsert failed for group gid={}: {}", gid, e);
                        }
                    }
                }
                Err(e) => {
                    tracing::error!("[Groups] Evolution get_groups FAILED for instance={}: {}", conn.0, e);
                }
            }
        } else {
            tracing::warn!("[Groups] Evolution service not configured — cannot fetch groups");
        }
    }

    let groups = sqlx::query_as::<_, Group>(
        "SELECT * FROM groups WHERE user_id = $1 ORDER BY name"
    )
    .bind(user_id)
    .fetch_all(&state.db)
    .await?;

    tracing::info!("[Groups] Returning {} groups from DB for user_id={}", groups.len(), user_id);
    Ok(Json(groups))
}

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

    tracing::info!("[Groups] toggle_group OK group={} is_monitored={}", group.name, group.is_monitored);
    Ok(Json(group))
}

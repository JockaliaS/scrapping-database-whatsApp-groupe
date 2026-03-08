use axum::{extract::{Path, State}, Json};
use uuid::Uuid;

use crate::errors::AppError;
use crate::models::group::Group;
use crate::AppState;

pub async fn list_groups(
    State(state): State<AppState>,
    user_id: Uuid,
) -> Result<Json<Vec<Group>>, AppError> {
    // First sync groups from Evolution API if connection exists
    if let Ok(Some(conn)) = sqlx::query_as::<_, (String,)>(
        "SELECT instance_name FROM whatsapp_connections WHERE user_id = $1 AND status = 'connected'"
    )
    .bind(user_id)
    .fetch_optional(&state.db)
    .await
    {
        if let Some(evolution) = &state.evolution {
            if let Ok(api_groups) = evolution.get_groups(&conn.0).await {
                for g in &api_groups {
                    let gid = g["id"].as_str().unwrap_or_default();
                    let name = g["subject"].as_str().unwrap_or("Unknown");
                    let size = g["size"].as_i64().unwrap_or(0) as i32;

                    let _ = sqlx::query(
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
                }
            }
        }
    }

    let groups = sqlx::query_as::<_, Group>(
        "SELECT * FROM groups WHERE user_id = $1 ORDER BY name"
    )
    .bind(user_id)
    .fetch_all(&state.db)
    .await?;

    Ok(Json(groups))
}

pub async fn toggle_group(
    State(state): State<AppState>,
    user_id: Uuid,
    Path(id): Path<Uuid>,
) -> Result<Json<Group>, AppError> {
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

    Ok(Json(group))
}

use axum::{extract::{Path, Query, State}, Json};
use uuid::Uuid;

use crate::errors::AppError;
use crate::models::opportunity::{Opportunity, OpportunityFilter, OpportunityWithDetails, StatusUpdate};
use crate::AppState;

#[derive(sqlx::FromRow)]
struct OpportunityRow {
    id: Uuid,
    user_id: Uuid,
    message_id: Uuid,
    group_id: Uuid,
    contact_id: Option<Uuid>,
    score: i32,
    matched_keywords: Vec<String>,
    context_analysis: Option<String>,
    suggested_reply: Option<String>,
    is_demand: Option<bool>,
    is_offer: Option<bool>,
    status: String,
    alert_sent: bool,
    created_at: chrono::DateTime<chrono::Utc>,
    updated_at: chrono::DateTime<chrono::Utc>,
    group_name: Option<String>,
    sender_name: Option<String>,
    sender_phone: Option<String>,
    message_content: Option<String>,
}

fn row_to_details(row: OpportunityRow) -> OpportunityWithDetails {
    OpportunityWithDetails {
        opportunity: Opportunity {
            id: row.id,
            user_id: row.user_id,
            message_id: row.message_id,
            group_id: row.group_id,
            contact_id: row.contact_id,
            score: row.score,
            matched_keywords: row.matched_keywords,
            context_analysis: row.context_analysis,
            suggested_reply: row.suggested_reply,
            is_demand: row.is_demand,
            is_offer: row.is_offer,
            status: row.status,
            alert_sent: row.alert_sent,
            created_at: row.created_at,
            updated_at: row.updated_at,
        },
        group_name: row.group_name,
        sender_name: row.sender_name,
        sender_phone: row.sender_phone,
        message_content: row.message_content,
    }
}

pub async fn list_opportunities(
    State(state): State<AppState>,
    user_id: Uuid,
    Query(_filter): Query<OpportunityFilter>,
) -> Result<Json<Vec<OpportunityWithDetails>>, AppError> {
    // Simple query — filters can be added later with query builder
    let rows = sqlx::query_as::<_, OpportunityRow>(
        r#"SELECT o.id, o.user_id, o.message_id, o.group_id, o.contact_id,
                  o.score, o.matched_keywords, o.context_analysis, o.suggested_reply,
                  o.is_demand, o.is_offer, o.status, o.alert_sent,
                  o.created_at, o.updated_at,
                  g.name as group_name, m.sender_name, m.sender_phone, m.content as message_content
           FROM opportunities o
           JOIN groups g ON o.group_id = g.id
           JOIN messages m ON o.message_id = m.id
           WHERE o.user_id = $1
           ORDER BY o.created_at DESC
           LIMIT 100"#,
    )
    .bind(user_id)
    .fetch_all(&state.db)
    .await?;

    Ok(Json(rows.into_iter().map(row_to_details).collect()))
}

pub async fn get_opportunity(
    State(state): State<AppState>,
    user_id: Uuid,
    Path(id): Path<Uuid>,
) -> Result<Json<OpportunityWithDetails>, AppError> {
    let row = sqlx::query_as::<_, OpportunityRow>(
        r#"SELECT o.id, o.user_id, o.message_id, o.group_id, o.contact_id,
                  o.score, o.matched_keywords, o.context_analysis, o.suggested_reply,
                  o.is_demand, o.is_offer, o.status, o.alert_sent,
                  o.created_at, o.updated_at,
                  g.name as group_name, m.sender_name, m.sender_phone, m.content as message_content
           FROM opportunities o
           JOIN groups g ON o.group_id = g.id
           JOIN messages m ON o.message_id = m.id
           WHERE o.id = $1 AND o.user_id = $2"#,
    )
    .bind(id)
    .bind(user_id)
    .fetch_optional(&state.db)
    .await?
    .ok_or_else(|| AppError::NotFound("Opportunity not found".into()))?;

    Ok(Json(row_to_details(row)))
}

pub async fn update_status(
    State(state): State<AppState>,
    user_id: Uuid,
    Path(id): Path<Uuid>,
    Json(req): Json<StatusUpdate>,
) -> Result<Json<Opportunity>, AppError> {
    let valid_statuses = ["new", "contacted", "in_progress", "won", "not_relevant"];
    if !valid_statuses.contains(&req.status.as_str()) {
        return Err(AppError::BadRequest("Invalid status".into()));
    }

    let opportunity = sqlx::query_as::<_, Opportunity>(
        r#"UPDATE opportunities SET status = $1, updated_at = NOW()
           WHERE id = $2 AND user_id = $3
           RETURNING *"#,
    )
    .bind(&req.status)
    .bind(id)
    .bind(user_id)
    .fetch_optional(&state.db)
    .await?
    .ok_or_else(|| AppError::NotFound("Opportunity not found".into()))?;

    Ok(Json(opportunity))
}

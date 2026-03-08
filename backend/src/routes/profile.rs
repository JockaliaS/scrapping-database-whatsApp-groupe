use axum::{extract::State, Json};
use uuid::Uuid;

use crate::errors::AppError;
use crate::models::profile::{GenerateKeywordsRequest, Profile, ProfileKeywords, ProfileUpdate};
use crate::AppState;

pub async fn get_profile(
    State(state): State<AppState>,
    user_id: Uuid,
) -> Result<Json<Profile>, AppError> {
    let profile = sqlx::query_as::<_, Profile>(
        "SELECT * FROM profiles WHERE user_id = $1"
    )
    .bind(user_id)
    .fetch_optional(&state.db)
    .await?
    .ok_or_else(|| AppError::NotFound("Profile not found".into()))?;

    Ok(Json(profile))
}

pub async fn update_profile(
    State(state): State<AppState>,
    user_id: Uuid,
    Json(req): Json<ProfileUpdate>,
) -> Result<Json<Profile>, AppError> {
    let profile = sqlx::query_as::<_, Profile>(
        r#"UPDATE profiles SET
            raw_text = COALESCE($2, raw_text),
            keywords = COALESCE($3, keywords),
            anti_keywords = COALESCE($4, anti_keywords),
            intentions = COALESCE($5, intentions),
            sector = COALESCE($6, sector),
            min_score = COALESCE($7, min_score),
            alert_number = COALESCE($8, alert_number),
            alert_template = COALESCE($9, alert_template),
            sharing_enabled = COALESCE($10, sharing_enabled),
            onboarding_complete = COALESCE($11, onboarding_complete),
            updated_at = NOW()
           WHERE user_id = $1
           RETURNING *"#,
    )
    .bind(user_id)
    .bind(&req.raw_text)
    .bind(&req.keywords)
    .bind(&req.anti_keywords)
    .bind(&req.intentions)
    .bind(&req.sector)
    .bind(req.min_score)
    .bind(&req.alert_number)
    .bind(&req.alert_template)
    .bind(req.sharing_enabled)
    .bind(req.onboarding_complete)
    .fetch_one(&state.db)
    .await?;

    Ok(Json(profile))
}

pub async fn generate_keywords(
    State(state): State<AppState>,
    _user_id: Uuid,
    Json(req): Json<GenerateKeywordsRequest>,
) -> Result<Json<ProfileKeywords>, AppError> {
    let gemini = state.gemini.as_ref()
        .ok_or_else(|| AppError::Internal("Gemini API not configured".into()))?;

    let keywords = gemini
        .generate_profile_keywords(&req.raw_text)
        .await
        .map_err(|e| AppError::Internal(format!("Gemini error: {}", e)))?;

    Ok(Json(keywords))
}

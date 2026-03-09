use axum::{extract::State, Json};
use uuid::Uuid;

use crate::errors::AppError;
use crate::models::profile::{GenerateKeywordsRequest, Profile, ProfileKeywords, ProfileUpdate};
use crate::AppState;

pub async fn get_profile(
    State(state): State<AppState>,
    user_id: Uuid,
) -> Result<Json<serde_json::Value>, AppError> {
    tracing::info!("[Profile] get_profile user_id={}", user_id);

    let profile = sqlx::query_as::<_, Profile>(
        "SELECT * FROM profiles WHERE user_id = $1"
    )
    .bind(user_id)
    .fetch_optional(&state.db)
    .await?
    .ok_or_else(|| AppError::NotFound("Profile not found".into()))?;

    // Also fetch user info (name, email)
    let user = sqlx::query_as::<_, (String, Option<String>)>(
        "SELECT email, full_name FROM users WHERE id = $1"
    )
    .bind(user_id)
    .fetch_optional(&state.db)
    .await?;

    let (email, full_name) = user.unwrap_or_default();

    tracing::info!("[Profile] get_profile: user_id={} email={} name={:?} keywords={} onboarding={}",
        user_id, email, full_name, profile.keywords.len(), profile.onboarding_complete);

    // Merge user + profile into one response
    let mut response = serde_json::to_value(&profile).unwrap_or_default();
    if let Some(obj) = response.as_object_mut() {
        obj.insert("email".to_string(), serde_json::json!(email));
        obj.insert("full_name".to_string(), serde_json::json!(full_name));
    }

    Ok(Json(response))
}

pub async fn update_profile(
    State(state): State<AppState>,
    user_id: Uuid,
    Json(req): Json<ProfileUpdate>,
) -> Result<Json<Profile>, AppError> {
    tracing::info!("[Profile] update_profile user_id={}", user_id);

    // If full_name or email is provided, update users table
    if req.full_name.is_some() || req.email.is_some() {
        if let Some(name) = &req.full_name {
            tracing::info!("[Profile] updating user full_name={}", name);
            sqlx::query("UPDATE users SET full_name = $1, updated_at = NOW() WHERE id = $2")
                .bind(name)
                .bind(user_id)
                .execute(&state.db)
                .await?;
        }
        if let Some(email) = &req.email {
            tracing::info!("[Profile] updating user email={}", email);
            sqlx::query("UPDATE users SET email = $1, updated_at = NOW() WHERE id = $2")
                .bind(email)
                .bind(user_id)
                .execute(&state.db)
                .await?;
        }
    }

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

    tracing::info!("[Profile] update_profile OK user_id={}", user_id);
    Ok(Json(profile))
}

pub async fn generate_keywords(
    State(state): State<AppState>,
    _user_id: Uuid,
    Json(req): Json<GenerateKeywordsRequest>,
) -> Result<Json<ProfileKeywords>, AppError> {
    tracing::info!("[Profile] generate_keywords text_len={}", req.raw_text.len());

    let gemini = state.gemini.as_ref()
        .ok_or_else(|| AppError::Internal("Gemini API not configured".into()))?;

    let keywords = gemini
        .generate_profile_keywords(&req.raw_text)
        .await
        .map_err(|e| AppError::Internal(format!("Gemini error: {}", e)))?;

    tracing::info!("[Profile] generate_keywords OK: {} keywords, {} intentions", keywords.keywords.len(), keywords.intentions.len());
    Ok(Json(keywords))
}

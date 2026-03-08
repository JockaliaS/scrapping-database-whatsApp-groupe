use axum::{extract::State, http::StatusCode, Json};
use argon2::{Argon2, PasswordHash, PasswordHasher, PasswordVerifier};
use argon2::password_hash::SaltString;
use argon2::password_hash::rand_core::OsRng;
use jsonwebtoken::{encode, Header, EncodingKey};
use serde::{Deserialize, Serialize};
use uuid::Uuid;

use crate::errors::AppError;
use crate::models::user::{AuthResponse, LoginRequest, RegisterRequest, User, UserPublic};
use crate::AppState;

#[derive(Debug, Serialize, Deserialize)]
pub struct Claims {
    pub sub: String, // user id
    pub role: String,
    pub exp: usize,
}

pub async fn login(
    State(state): State<AppState>,
    Json(req): Json<LoginRequest>,
) -> Result<Json<AuthResponse>, AppError> {
    let user = sqlx::query_as::<_, User>(
        "SELECT * FROM users WHERE email = $1 AND is_active = true"
    )
    .bind(&req.email)
    .fetch_optional(&state.db)
    .await?
    .ok_or_else(|| AppError::Unauthorized("Invalid credentials".into()))?;

    let parsed_hash = PasswordHash::new(&user.password_hash)
        .map_err(|_| AppError::Internal("Invalid password hash".into()))?;
    Argon2::default()
        .verify_password(req.password.as_bytes(), &parsed_hash)
        .map_err(|_| AppError::Unauthorized("Invalid credentials".into()))?;

    let token = create_token(&user, &state.config.jwt_secret, state.config.jwt_expire_minutes)?;

    Ok(Json(AuthResponse {
        token,
        user: UserPublic::from(user),
    }))
}

pub async fn register(
    State(state): State<AppState>,
    Json(req): Json<RegisterRequest>,
) -> Result<(StatusCode, Json<AuthResponse>), AppError> {
    // Check if email already exists
    let existing = sqlx::query_scalar::<_, i64>("SELECT COUNT(*) FROM users WHERE email = $1")
        .bind(&req.email)
        .fetch_one(&state.db)
        .await?;

    if existing > 0 {
        return Err(AppError::BadRequest("Email already registered".into()));
    }

    let salt = SaltString::generate(&mut OsRng);
    let password_hash = Argon2::default()
        .hash_password(req.password.as_bytes(), &salt)
        .map_err(|e| AppError::Internal(format!("Password hashing error: {}", e)))?
        .to_string();

    let user_id = Uuid::new_v4();
    let user = sqlx::query_as::<_, User>(
        r#"INSERT INTO users (id, email, password_hash, full_name)
           VALUES ($1, $2, $3, $4)
           RETURNING *"#,
    )
    .bind(user_id)
    .bind(&req.email)
    .bind(&password_hash)
    .bind(&req.full_name)
    .fetch_one(&state.db)
    .await?;

    // Create empty profile
    sqlx::query(
        "INSERT INTO profiles (id, user_id) VALUES ($1, $2)"
    )
    .bind(Uuid::new_v4())
    .bind(user_id)
    .execute(&state.db)
    .await?;

    let token = create_token(&user, &state.config.jwt_secret, state.config.jwt_expire_minutes)?;

    Ok((
        StatusCode::CREATED,
        Json(AuthResponse {
            token,
            user: UserPublic::from(user),
        }),
    ))
}

fn create_token(user: &User, secret: &str, expire_minutes: i64) -> Result<String, AppError> {
    let expiration = chrono::Utc::now()
        .checked_add_signed(chrono::Duration::minutes(expire_minutes))
        .ok_or_else(|| AppError::Internal("Token expiration error".into()))?
        .timestamp() as usize;

    let claims = Claims {
        sub: user.id.to_string(),
        role: user.role.clone(),
        exp: expiration,
    };

    encode(
        &Header::default(),
        &claims,
        &EncodingKey::from_secret(secret.as_bytes()),
    )
    .map_err(|e| AppError::Internal(format!("Token creation error: {}", e)))
}

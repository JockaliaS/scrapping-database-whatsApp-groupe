use argon2::password_hash::rand_core::OsRng;
use argon2::password_hash::SaltString;
use argon2::{Argon2, PasswordHasher};
use sqlx::postgres::PgPoolOptions;
use sqlx::PgPool;
use uuid::Uuid;

use crate::config::Config;

pub async fn init_pool(database_url: &str) -> PgPool {
    PgPoolOptions::new()
        .max_connections(20)
        .connect(database_url)
        .await
        .expect("Failed to connect to PostgreSQL")
}

pub async fn run_migrations(pool: &PgPool) {
    let sql: &str = include_str!("../migrations/001_initial.sql");
    for statement in sql.split(';') {
        let trimmed: &str = statement.trim();
        if trimmed.is_empty() {
            continue;
        }
        match sqlx::query(trimmed).execute(pool).await {
            Ok(_) => {}
            Err(e) => {
                let err_str = e.to_string();
                if err_str.contains("already exists")
                    || err_str.contains("duplicate key")
                {
                    tracing::debug!("Migration skipped (already applied): {}", err_str);
                } else {
                    tracing::warn!("Migration statement error: {}", err_str);
                }
            }
        }
    }
    tracing::info!("Database migrations applied");
}

/// Ensure admin user exists and password is up to date.
/// Called at application startup — idempotent.
pub async fn seed_admin(pool: &PgPool, config: &Config) {
    let salt = SaltString::generate(&mut OsRng);
    let password_hash = match Argon2::default()
        .hash_password(config.admin_password.as_bytes(), &salt)
    {
        Ok(h) => h.to_string(),
        Err(e) => {
            tracing::error!("Failed to hash admin password: {}", e);
            return;
        }
    };

    // Try to update existing admin first
    let updated = sqlx::query(
        "UPDATE users SET password_hash = $1, role = 'admin' WHERE email = $2",
    )
    .bind(&password_hash)
    .bind(&config.admin_email)
    .execute(pool)
    .await;

    match updated {
        Ok(result) if result.rows_affected() > 0 => {
            tracing::info!("Admin password updated for {}", config.admin_email);
            return;
        }
        _ => {}
    }

    // Admin doesn't exist, create it
    let user_id = Uuid::new_v4();

    let result = sqlx::query(
        r#"INSERT INTO users (id, email, password_hash, full_name, role)
           VALUES ($1, $2, $3, 'Administrateur Radar', 'admin')"#,
    )
    .bind(user_id)
    .bind(&config.admin_email)
    .bind(&password_hash)
    .execute(pool)
    .await;

    match result {
        Ok(_) => {
            let _ = sqlx::query(
                "INSERT INTO profiles (id, user_id) VALUES ($1, $2)",
            )
            .bind(Uuid::new_v4())
            .bind(user_id)
            .execute(pool)
            .await;

            tracing::info!("Admin created: {}", config.admin_email);
        }
        Err(e) => {
            tracing::error!("Failed to create admin: {}", e);
        }
    }
}

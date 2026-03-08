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
    let sql = include_str!("../migrations/001_initial.sql");
    for statement in sql.split(';') {
        let trimmed = statement.trim();
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

/// Seed default admin user if no users exist in the database.
/// Called once at application startup — idempotent.
pub async fn seed_admin(pool: &PgPool, config: &Config) {
    let count = sqlx::query_scalar::<_, i64>("SELECT COUNT(*) FROM users")
        .fetch_one(pool)
        .await
        .unwrap_or(0);

    if count > 0 {
        tracing::info!("Users already exist, skipping admin seed");
        return;
    }

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

    let user_id = Uuid::new_v4();
    let profile_id = Uuid::new_v4();

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
            // Create profile for admin
            let _ = sqlx::query(
                "INSERT INTO profiles (id, user_id) VALUES ($1, $2)",
            )
            .bind(profile_id)
            .bind(user_id)
            .execute(pool)
            .await;

            tracing::info!(
                "Default admin created: {} (change password after first login!)",
                config.admin_email
            );
        }
        Err(e) => {
            tracing::error!("Failed to create admin user: {}", e);
        }
    }
}

use sqlx::postgres::PgPoolOptions;
use sqlx::PgPool;

pub async fn init_pool(database_url: &str) -> PgPool {
    PgPoolOptions::new()
        .max_connections(20)
        .connect(database_url)
        .await
        .expect("Failed to connect to PostgreSQL")
}

pub async fn run_migrations(pool: &PgPool) {
    let sql = include_str!("../migrations/001_initial.sql");
    // Split by semicolons and execute each statement
    for statement in sql.split(';') {
        let trimmed = statement.trim();
        if trimmed.is_empty() {
            continue;
        }
        match sqlx::query(trimmed).execute(pool).await {
            Ok(_) => {}
            Err(e) => {
                let err_str = e.to_string();
                // Ignore "already exists" errors during migration
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

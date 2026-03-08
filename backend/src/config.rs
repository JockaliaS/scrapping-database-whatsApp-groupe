use std::env;

#[derive(Clone, Debug)]
pub struct Config {
    pub database_url: String,
    pub redis_url: String,
    pub jwt_secret: String,
    pub jwt_expire_minutes: i64,
    pub gemini_api_key: Option<String>,
    pub evolution_api_url: String,
    pub evolution_api_key: Option<String>,
    pub radar_webhook_secret: String,
    pub frontend_url: String,
    pub backend_url: String,
    pub app_env: String,
    pub commit_hash: String,
    pub port: u16,
}

impl Config {
    pub fn from_env() -> Self {
        Self {
            database_url: env::var("DATABASE_URL").expect("DATABASE_URL required"),
            redis_url: env::var("REDIS_URL").unwrap_or_else(|_| "redis://127.0.0.1:6379".into()),
            jwt_secret: env::var("JWT_SECRET").expect("JWT_SECRET required"),
            jwt_expire_minutes: env::var("JWT_EXPIRE_MINUTES")
                .unwrap_or_else(|_| "10080".into())
                .parse()
                .unwrap_or(10080),
            gemini_api_key: env::var("GEMINI_API_KEY").ok(),
            evolution_api_url: env::var("EVOLUTION_API_URL")
                .unwrap_or_else(|_| "https://whatsapp-prod.jockaliaservices.fr".into()),
            evolution_api_key: env::var("EVOLUTION_API_KEY").ok(),
            radar_webhook_secret: env::var("RADAR_WEBHOOK_SECRET")
                .expect("RADAR_WEBHOOK_SECRET required"),
            frontend_url: env::var("FRONTEND_URL")
                .unwrap_or_else(|_| "https://radar.jockaliaservices.fr".into()),
            backend_url: env::var("BACKEND_URL")
                .unwrap_or_else(|_| "https://api.radar.jockaliaservices.fr".into()),
            app_env: env::var("APP_ENV").unwrap_or_else(|_| "production".into()),
            commit_hash: env::var("COMMIT_HASH").unwrap_or_else(|_| "local".into()),
            port: env::var("PORT")
                .unwrap_or_else(|_| "8000".into())
                .parse()
                .unwrap_or(8000),
        }
    }
}

use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use sqlx::FromRow;
use uuid::Uuid;

#[derive(Debug, Clone, Serialize, Deserialize, FromRow)]
pub struct Profile {
    pub id: Uuid,
    pub user_id: Uuid,
    pub raw_text: Option<String>,
    pub keywords: Vec<String>,
    pub anti_keywords: Vec<String>,
    pub intentions: Vec<String>,
    pub sector: Option<String>,
    pub min_score: i32,
    pub alert_number: Option<String>,
    pub alert_template: Option<String>,
    pub sharing_enabled: bool,
    pub onboarding_complete: bool,
    pub slack_webhook_url: Option<String>,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}

#[derive(Debug, Deserialize)]
pub struct ProfileUpdate {
    pub full_name: Option<String>,
    pub email: Option<String>,
    pub raw_text: Option<String>,
    pub keywords: Option<Vec<String>>,
    pub anti_keywords: Option<Vec<String>>,
    pub intentions: Option<Vec<String>>,
    pub sector: Option<String>,
    pub min_score: Option<i32>,
    pub alert_number: Option<String>,
    pub alert_template: Option<String>,
    pub sharing_enabled: Option<bool>,
    pub onboarding_complete: Option<bool>,
    pub slack_webhook_url: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct GenerateKeywordsRequest {
    pub raw_text: String,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct ProfileKeywords {
    pub keywords: Vec<String>,
    pub anti_keywords: Vec<String>,
    pub intentions: Vec<String>,
    pub sector: String,
    #[serde(default)]
    pub profile_summary: Option<String>,
}

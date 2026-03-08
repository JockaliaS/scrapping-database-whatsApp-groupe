use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use sqlx::FromRow;
use uuid::Uuid;

#[derive(Debug, Clone, Serialize, Deserialize, FromRow)]
pub struct Opportunity {
    pub id: Uuid,
    pub user_id: Uuid,
    pub message_id: Uuid,
    pub group_id: Uuid,
    pub contact_id: Option<Uuid>,
    pub score: i32,
    pub matched_keywords: Vec<String>,
    pub context_analysis: Option<String>,
    pub suggested_reply: Option<String>,
    pub is_demand: Option<bool>,
    pub is_offer: Option<bool>,
    pub status: String,
    pub alert_sent: bool,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}

#[allow(dead_code)]
#[derive(Debug, Default, Clone, Serialize, Deserialize)]
pub struct OpportunityFilter {
    pub status: Option<String>,
    pub group_id: Option<String>,
    pub score_min: Option<i32>,
    pub score_max: Option<i32>,
    pub from: Option<String>,
    pub to: Option<String>,
    pub search: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct StatusUpdate {
    pub status: String,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct OpportunityScore {
    pub score: i32,
    pub matched_keywords: Vec<String>,
    pub context_analysis: String,
    pub suggested_reply: String,
    pub is_demand: bool,
    pub is_offer: bool,
}

#[derive(Debug, Serialize, Clone)]
pub struct OpportunityWithDetails {
    #[serde(flatten)]
    pub opportunity: Opportunity,
    pub group_name: Option<String>,
    pub sender_name: Option<String>,
    pub sender_phone: Option<String>,
    pub message_content: Option<String>,
}

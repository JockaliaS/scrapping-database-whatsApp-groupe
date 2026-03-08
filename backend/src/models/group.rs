use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use sqlx::FromRow;
use uuid::Uuid;

#[derive(Debug, Clone, Serialize, Deserialize, FromRow)]
pub struct Group {
    pub id: Uuid,
    pub user_id: Uuid,
    pub whatsapp_group_id: String,
    pub name: String,
    pub member_count: Option<i32>,
    pub last_activity: Option<DateTime<Utc>>,
    pub is_monitored: bool,
    pub created_at: DateTime<Utc>,
}

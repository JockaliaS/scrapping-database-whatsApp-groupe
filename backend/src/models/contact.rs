use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use sqlx::FromRow;
use uuid::Uuid;

#[derive(Debug, Clone, Serialize, Deserialize, FromRow)]
pub struct Contact {
    pub id: Uuid,
    pub phone: String,
    pub name: Option<String>,
    pub first_seen: DateTime<Utc>,
    pub total_announcements: i32,
    pub updated_at: DateTime<Utc>,
}

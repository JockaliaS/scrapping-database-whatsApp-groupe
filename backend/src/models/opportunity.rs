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
    #[serde(deserialize_with = "deserialize_score")]
    pub score: i32,
    #[serde(default)]
    pub matched_keywords: Vec<String>,
    #[serde(default)]
    pub context_analysis: String,
    #[serde(default)]
    pub suggested_reply: String,
    #[serde(default)]
    pub is_demand: bool,
    #[serde(default)]
    pub is_offer: bool,
}

/// Gemini sometimes returns score as an object {"value": 75} or as a string "75"
/// instead of a plain integer. This deserializer handles all cases.
fn deserialize_score<'de, D>(deserializer: D) -> Result<i32, D::Error>
where
    D: serde::Deserializer<'de>,
{
    use serde_json::Value;
    let v = Value::deserialize(deserializer)?;
    match &v {
        Value::Number(n) => n.as_i64().map(|x| x as i32).ok_or_else(|| {
            serde::de::Error::custom(format!("score number out of range: {}", n))
        }),
        Value::String(s) => s.trim().parse::<i32>().map_err(|_| {
            serde::de::Error::custom(format!("score string not a number: {}", s))
        }),
        Value::Object(map) => {
            // Try common keys: "value", "score", "result"
            for key in &["value", "score", "result"] {
                if let Some(val) = map.get(*key) {
                    if let Some(n) = val.as_i64() {
                        return Ok(n as i32);
                    }
                    if let Some(s) = val.as_str() {
                        if let Ok(n) = s.trim().parse::<i32>() {
                            return Ok(n);
                        }
                    }
                }
            }
            // Fallback: try first numeric value in the map
            for val in map.values() {
                if let Some(n) = val.as_i64() {
                    return Ok(n as i32);
                }
            }
            Err(serde::de::Error::custom(format!("score object has no numeric value: {:?}", map)))
        }
        _ => Err(serde::de::Error::custom(format!("unexpected score type: {}", v))),
    }
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

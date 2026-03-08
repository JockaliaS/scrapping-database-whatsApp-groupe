use serde::Deserialize;

#[derive(Debug, Deserialize)]
pub struct HubSpokePayload {
    pub group_id: String,
    pub group_name: Option<String>,
    pub sender_phone: Option<String>,
    pub sender_name: Option<String>,
    pub content: String,
    pub timestamp: i64,
    pub raw: Option<serde_json::Value>,
}

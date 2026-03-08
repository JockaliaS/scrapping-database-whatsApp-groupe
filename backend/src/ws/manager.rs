use std::collections::HashMap;
use std::sync::Arc;
use tokio::sync::{mpsc, RwLock};
use uuid::Uuid;

pub type WsSender = mpsc::UnboundedSender<String>;

#[derive(Clone)]
pub struct WsManager {
    connections: Arc<RwLock<HashMap<Uuid, Vec<WsSender>>>>,
}

impl WsManager {
    pub fn new() -> Self {
        Self {
            connections: Arc::new(RwLock::new(HashMap::new())),
        }
    }

    pub async fn add_connection(&self, user_id: Uuid) -> mpsc::UnboundedReceiver<String> {
        let (tx, rx) = mpsc::unbounded_channel();
        let mut conns = self.connections.write().await;
        conns.entry(user_id).or_default().push(tx);
        tracing::info!("WebSocket connected for user {}", user_id);
        rx
    }

    pub async fn remove_connection(&self, user_id: Uuid, sender: &WsSender) {
        let mut conns = self.connections.write().await;
        if let Some(senders) = conns.get_mut(&user_id) {
            senders.retain(|s| !s.same_channel(sender));
            if senders.is_empty() {
                conns.remove(&user_id);
            }
        }
        tracing::info!("WebSocket disconnected for user {}", user_id);
    }

    pub async fn broadcast_to_user(&self, user_id: Uuid, message: &str) {
        let conns = self.connections.read().await;
        if let Some(senders) = conns.get(&user_id) {
            for sender in senders {
                let _ = sender.send(message.to_string());
            }
        }
    }

    pub async fn connection_count(&self) -> usize {
        let conns = self.connections.read().await;
        conns.values().map(|v| v.len()).sum()
    }
}

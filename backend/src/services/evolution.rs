use reqwest::Client;
use serde_json::{json, Value};

pub struct EvolutionService {
    client: Client,
    base_url: String,
    api_key: String,
}

impl EvolutionService {
    pub fn new(base_url: String, api_key: String) -> Self {
        Self {
            client: Client::new(),
            base_url: base_url.trim_end_matches('/').to_string(),
            api_key,
        }
    }

    pub async fn send_message(&self, instance: &str, to: &str, text: &str) -> anyhow::Result<()> {
        let url = format!("{}/message/sendText/{}", self.base_url, instance);
        self.client
            .post(&url)
            .header("apikey", &self.api_key)
            .json(&json!({
                "number": to,
                "text": text
            }))
            .send()
            .await?;
        Ok(())
    }

    pub async fn create_instance(&self, instance_name: &str) -> anyhow::Result<Value> {
        let url = format!("{}/instance/create", self.base_url);
        let resp = self.client
            .post(&url)
            .header("apikey", &self.api_key)
            .json(&json!({
                "instanceName": instance_name,
                "integration": "WHATSAPP-BAILEYS"
            }))
            .send()
            .await?
            .json::<Value>()
            .await?;
        Ok(resp)
    }

    pub async fn get_qr_code(&self, instance_name: &str) -> anyhow::Result<Value> {
        let url = format!("{}/instance/connect/{}", self.base_url, instance_name);
        let resp = self.client
            .get(&url)
            .header("apikey", &self.api_key)
            .send()
            .await?
            .json::<Value>()
            .await?;
        Ok(resp)
    }

    pub async fn get_instance_status(&self, instance_name: &str) -> anyhow::Result<Value> {
        let url = format!(
            "{}/instance/connectionState/{}",
            self.base_url, instance_name
        );
        let resp = self.client
            .get(&url)
            .header("apikey", &self.api_key)
            .send()
            .await?
            .json::<Value>()
            .await?;
        Ok(resp)
    }

    pub async fn get_groups(&self, instance_name: &str) -> anyhow::Result<Vec<Value>> {
        let url = format!("{}/group/fetchAllGroups/{}", self.base_url, instance_name);
        let resp = self.client
            .get(&url)
            .header("apikey", &self.api_key)
            .send()
            .await?
            .json::<Vec<Value>>()
            .await?;
        Ok(resp)
    }

    pub async fn delete_instance(&self, instance_name: &str) -> anyhow::Result<()> {
        let url = format!("{}/instance/delete/{}", self.base_url, instance_name);
        self.client
            .delete(&url)
            .header("apikey", &self.api_key)
            .send()
            .await?;
        Ok(())
    }

    pub async fn check_connection(&self) -> anyhow::Result<bool> {
        let url = format!("{}/instance/fetchInstances", self.base_url);
        let resp = self.client
            .get(&url)
            .header("apikey", &self.api_key)
            .send()
            .await?;
        Ok(resp.status().is_success())
    }
}

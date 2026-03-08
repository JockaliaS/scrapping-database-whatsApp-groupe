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

    /// Check HTTP status and return a clear error if not 2xx
    async fn check_response(&self, resp: reqwest::Response) -> anyhow::Result<Value> {
        let status = resp.status();
        let body: Value = resp.json().await.unwrap_or_else(|_| json!({"error": "empty response"}));

        if !status.is_success() {
            let msg = body["response"]["message"]
                .as_str()
                .or_else(|| body["error"].as_str())
                .or_else(|| body["message"].as_str())
                .unwrap_or("Unknown error");
            anyhow::bail!("Evolution API {} {}: {}", status.as_u16(), status.canonical_reason().unwrap_or(""), msg);
        }

        Ok(body)
    }

    pub async fn send_message(&self, instance: &str, to: &str, text: &str) -> anyhow::Result<()> {
        let url = format!("{}/message/sendText/{}", self.base_url, instance);
        let resp = self.client
            .post(&url)
            .header("apikey", &self.api_key)
            .json(&json!({
                "number": to,
                "text": text
            }))
            .send()
            .await?;
        self.check_response(resp).await?;
        Ok(())
    }

    pub async fn create_instance(&self, instance_name: &str) -> anyhow::Result<Value> {
        let url = format!("{}/instance/create", self.base_url);
        let resp = self.client
            .post(&url)
            .header("apikey", &self.api_key)
            .json(&json!({
                "instanceName": instance_name,
                "qrcode": true,
                "integration": "WHATSAPP-BAILEYS"
            }))
            .send()
            .await?;
        self.check_response(resp).await
    }

    pub async fn get_qr_code(&self, instance_name: &str) -> anyhow::Result<Value> {
        let url = format!("{}/instance/connect/{}", self.base_url, instance_name);
        let resp = self.client
            .get(&url)
            .header("apikey", &self.api_key)
            .send()
            .await?;
        self.check_response(resp).await
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
            .await?;
        self.check_response(resp).await
    }

    pub async fn get_groups(&self, instance_name: &str) -> anyhow::Result<Vec<Value>> {
        let url = format!("{}/group/fetchAllGroups/{}", self.base_url, instance_name);
        let resp = self.client
            .get(&url)
            .header("apikey", &self.api_key)
            .send()
            .await?;
        let status = resp.status();
        let body: Vec<Value> = resp.json().await.unwrap_or_default();
        if !status.is_success() {
            anyhow::bail!("Evolution API {}: failed to fetch groups", status.as_u16());
        }
        Ok(body)
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

    pub async fn list_instances(&self) -> anyhow::Result<Vec<Value>> {
        let url = format!("{}/instance/fetchInstances", self.base_url);
        let resp = self.client
            .get(&url)
            .header("apikey", &self.api_key)
            .send()
            .await?;
        let status = resp.status();
        let body: Vec<Value> = resp.json().await.unwrap_or_default();
        if !status.is_success() {
            anyhow::bail!("Evolution API {}: failed to fetch instances", status.as_u16());
        }
        Ok(body)
    }
}

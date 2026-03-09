use reqwest::Client;
use serde_json::{json, Value};

pub struct EvolutionService {
    client: Client,
    base_url: String,
    api_key: String,
}

impl EvolutionService {
    pub fn new(base_url: String, api_key: String) -> Self {
        tracing::info!("Evolution service init: base_url={}", base_url.trim_end_matches('/'));
        Self {
            client: Client::new(),
            base_url: base_url.trim_end_matches('/').to_string(),
            api_key,
        }
    }

    /// Check HTTP status and return a clear error if not 2xx
    async fn check_response(&self, resp: reqwest::Response) -> anyhow::Result<Value> {
        let status = resp.status();
        let url = resp.url().to_string();
        let body: Value = resp.json().await.unwrap_or_else(|_| json!({"error": "empty response"}));

        if !status.is_success() {
            let msg = body["response"]["message"]
                .as_str()
                .or_else(|| body["error"].as_str())
                .or_else(|| body["message"].as_str())
                .unwrap_or("Unknown error");
            tracing::error!("[Evolution] {} {} -> {} {}: {}", "REQUEST", url, status.as_u16(), status.canonical_reason().unwrap_or(""), msg);
            tracing::debug!("[Evolution] Full error body: {}", body);
            anyhow::bail!("Evolution API {} {}: {}", status.as_u16(), status.canonical_reason().unwrap_or(""), msg);
        }

        tracing::debug!("[Evolution] {} -> {} OK", url, status.as_u16());
        Ok(body)
    }

    pub async fn send_message(&self, instance: &str, to: &str, text: &str) -> anyhow::Result<()> {
        let url = format!("{}/message/sendText/{}", self.base_url, instance);
        tracing::info!("[Evolution] send_message instance={} to={} text_len={}", instance, to, text.len());
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
        tracing::info!("[Evolution] send_message OK instance={} to={}", instance, to);
        Ok(())
    }

    pub async fn create_instance(&self, instance_name: &str) -> anyhow::Result<Value> {
        let url = format!("{}/instance/create", self.base_url);
        tracing::info!("[Evolution] create_instance name={}", instance_name);
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
        let result = self.check_response(resp).await;
        match &result {
            Ok(_) => tracing::info!("[Evolution] create_instance OK name={}", instance_name),
            Err(e) => tracing::warn!("[Evolution] create_instance FAILED name={}: {}", instance_name, e),
        }
        result
    }

    pub async fn get_qr_code(&self, instance_name: &str) -> anyhow::Result<Value> {
        let url = format!("{}/instance/connect/{}", self.base_url, instance_name);
        tracing::debug!("[Evolution] get_qr_code instance={}", instance_name);
        let resp = self.client
            .get(&url)
            .header("apikey", &self.api_key)
            .send()
            .await?;
        let result = self.check_response(resp).await;
        match &result {
            Ok(v) => {
                let has_base64 = v.get("base64").is_some();
                let has_code = v.get("code").is_some();
                tracing::debug!("[Evolution] get_qr_code instance={} has_base64={} has_code={}", instance_name, has_base64, has_code);
            }
            Err(e) => tracing::warn!("[Evolution] get_qr_code FAILED instance={}: {}", instance_name, e),
        }
        result
    }

    pub async fn get_instance_status(&self, instance_name: &str) -> anyhow::Result<Value> {
        let url = format!(
            "{}/instance/connectionState/{}",
            self.base_url, instance_name
        );
        tracing::debug!("[Evolution] get_instance_status instance={}", instance_name);
        let resp = self.client
            .get(&url)
            .header("apikey", &self.api_key)
            .send()
            .await?;
        let result = self.check_response(resp).await;
        match &result {
            Ok(v) => {
                let state = v["state"].as_str()
                    .or_else(|| v["instance"]["state"].as_str())
                    .unwrap_or("unknown");
                tracing::info!("[Evolution] instance_status instance={} state={}", instance_name, state);
            }
            Err(e) => tracing::warn!("[Evolution] get_instance_status FAILED instance={}: {}", instance_name, e),
        }
        result
    }

    pub async fn get_groups(&self, instance_name: &str) -> anyhow::Result<Vec<Value>> {
        let url = format!("{}/group/fetchAllGroups/{}", self.base_url, instance_name);
        tracing::info!("[Evolution] get_groups instance={} url={}", instance_name, url);
        let resp = self.client
            .get(&url)
            .query(&[("getParticipants", "false")])
            .header("apikey", &self.api_key)
            .send()
            .await?;
        let status = resp.status();
        let raw_text = resp.text().await.unwrap_or_default();
        tracing::info!("[Evolution] get_groups instance={} status={} body_len={}", instance_name, status.as_u16(), raw_text.len());
        tracing::debug!("[Evolution] get_groups raw response (first 500 chars): {}", &raw_text[..raw_text.len().min(500)]);

        if !status.is_success() {
            tracing::error!("[Evolution] get_groups FAILED instance={} status={} body={}", instance_name, status.as_u16(), &raw_text[..raw_text.len().min(300)]);
            anyhow::bail!("Evolution API {}: failed to fetch groups — {}", status.as_u16(), &raw_text[..raw_text.len().min(200)]);
        }

        let body: Vec<Value> = serde_json::from_str(&raw_text).unwrap_or_else(|e| {
            tracing::error!("[Evolution] get_groups JSON parse error: {} — raw: {}", e, &raw_text[..raw_text.len().min(300)]);
            vec![]
        });
        tracing::info!("[Evolution] get_groups instance={} -> {} groups returned", instance_name, body.len());
        Ok(body)
    }

    pub async fn get_webhook(&self, instance_name: &str) -> anyhow::Result<Value> {
        let url = format!("{}/webhook/find/{}", self.base_url, instance_name);
        tracing::info!("[Evolution] get_webhook instance={}", instance_name);
        let resp = self.client
            .get(&url)
            .header("apikey", &self.api_key)
            .send()
            .await?;
        let result = self.check_response(resp).await;
        match &result {
            Ok(v) => {
                let wh_url = v["url"].as_str().unwrap_or("none");
                let enabled = v["enabled"].as_bool().unwrap_or(false);
                tracing::info!("[Evolution] get_webhook instance={} url={} enabled={}", instance_name, wh_url, enabled);
            }
            Err(e) => tracing::warn!("[Evolution] get_webhook FAILED instance={}: {}", instance_name, e),
        }
        result
    }

    pub async fn set_webhook(&self, instance_name: &str, webhook_url: &str) -> anyhow::Result<Value> {
        let url = format!("{}/webhook/set/{}", self.base_url, instance_name);
        tracing::info!("[Evolution] set_webhook instance={} url={}", instance_name, webhook_url);
        let resp = self.client
            .post(&url)
            .header("apikey", &self.api_key)
            .json(&serde_json::json!({
                "webhook": {
                    "enabled": true,
                    "url": webhook_url,
                    "webhookByEvents": false,
                    "webhookBase64": false,
                    "events": ["MESSAGES_UPSERT", "CONNECTION_UPDATE", "QRCODE_UPDATED"]
                }
            }))
            .send()
            .await?;
        let result = self.check_response(resp).await;
        match &result {
            Ok(_) => tracing::info!("[Evolution] set_webhook OK instance={}", instance_name),
            Err(e) => tracing::error!("[Evolution] set_webhook FAILED instance={}: {}", instance_name, e),
        }
        result
    }

    pub async fn delete_instance(&self, instance_name: &str) -> anyhow::Result<()> {
        let url = format!("{}/instance/delete/{}", self.base_url, instance_name);
        tracing::info!("[Evolution] delete_instance name={}", instance_name);
        self.client
            .delete(&url)
            .header("apikey", &self.api_key)
            .send()
            .await?;
        tracing::info!("[Evolution] delete_instance OK name={}", instance_name);
        Ok(())
    }

    pub async fn check_connection(&self) -> anyhow::Result<bool> {
        let url = format!("{}/instance/fetchInstances", self.base_url);
        tracing::debug!("[Evolution] check_connection");
        let resp = self.client
            .get(&url)
            .header("apikey", &self.api_key)
            .send()
            .await?;
        let ok = resp.status().is_success();
        tracing::info!("[Evolution] check_connection -> {}", ok);
        Ok(ok)
    }

    pub async fn list_instances(&self) -> anyhow::Result<Vec<Value>> {
        let url = format!("{}/instance/fetchInstances", self.base_url);
        tracing::info!("[Evolution] list_instances");
        let resp = self.client
            .get(&url)
            .header("apikey", &self.api_key)
            .send()
            .await?;
        let status = resp.status();
        let body: Vec<Value> = resp.json().await.unwrap_or_default();
        if !status.is_success() {
            tracing::error!("[Evolution] list_instances FAILED status={}", status.as_u16());
            anyhow::bail!("Evolution API {}: failed to fetch instances", status.as_u16());
        }
        tracing::info!("[Evolution] list_instances -> {} instances", body.len());
        Ok(body)
    }
}

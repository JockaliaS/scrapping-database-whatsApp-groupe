use crate::models::profile::ProfileKeywords;
use crate::models::opportunity::OpportunityScore;
use reqwest::Client;
use serde_json::{json, Value};

pub struct GeminiService {
    client: Client,
    api_key: String,
}

impl GeminiService {
    pub fn new(api_key: String) -> Self {
        Self {
            client: Client::new(),
            api_key,
        }
    }

    pub async fn generate_profile_keywords(&self, raw_text: &str) -> anyhow::Result<ProfileKeywords> {
        let prompt = format!(
            r#"Analyze this professional profile and extract structured matching data for a WhatsApp opportunity detection system.

Profile: {}

Return ONLY valid JSON, no markdown, no explanation:
{{
  "keywords": ["list of keywords and key phrases to detect in messages"],
  "anti_keywords": ["words that would create false positives to exclude"],
  "intentions": ["detected business service intentions in French"],
  "sector": "main professional sector in French",
  "profile_summary": "one sentence summary of this person's services in French"
}}

All text values must be in French. Keywords should cover: exact terms, synonyms, common abbreviations, related concepts."#,
            raw_text
        );

        self.call_gemini(&prompt).await
    }

    pub async fn score_opportunity(
        &self,
        profile_summary: &str,
        keywords: &[String],
        sector: &str,
        message_content: &str,
        group_name: &str,
        sender: &str,
    ) -> anyhow::Result<OpportunityScore> {
        let keywords_str = keywords.join(", ");
        let prompt = format!(
            r#"You are analyzing a WhatsApp message to detect a business opportunity.

Professional profile:
- Services: {profile_summary}
- Keywords: {keywords_str}
- Sector: {sector}

Message context:
- Group: {group_name}
- Sender: {sender}
- Message: {message_content}

Analyze and return ONLY valid JSON, no markdown, no explanation:
{{
  "score": <integer 0-100>,
  "matched_keywords": ["keywords from the profile that matched"],
  "context_analysis": "brief explanation in French of why this is or isn't an opportunity",
  "suggested_reply": "a professional reply suggestion in French, in the voice of the profile owner",
  "is_demand": <boolean, true if someone is looking for services>,
  "is_offer": <boolean, true if someone is offering services>
}}

Score guide: 0-30 = not relevant, 31-60 = possible, 61-80 = likely opportunity, 81-100 = strong opportunity.
Respond entirely in French."#
        );

        self.call_gemini(&prompt).await
    }

    async fn call_gemini<T: serde::de::DeserializeOwned>(&self, prompt: &str) -> anyhow::Result<T> {
        let url = format!(
            "https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key={}",
            self.api_key
        );

        let body = json!({
            "contents": [{
                "parts": [{"text": prompt}]
            }],
            "generationConfig": {
                "temperature": 0.2,
                "maxOutputTokens": 1024
            }
        });

        let mut last_error = None;
        for attempt in 0..3 {
            if attempt > 0 {
                let delay = std::time::Duration::from_millis(1000 * 2u64.pow(attempt));
                tokio::time::sleep(delay).await;
            }

            match self.client.post(&url).json(&body).send().await {
                Ok(response) => {
                    if response.status() == 429 {
                        tracing::warn!("Gemini rate limited, attempt {}/3", attempt + 1);
                        last_error = Some(anyhow::anyhow!("Rate limited"));
                        continue;
                    }

                    let resp_body: Value = response.json().await?;
                    let text = resp_body["candidates"][0]["content"]["parts"][0]["text"]
                        .as_str()
                        .ok_or_else(|| anyhow::anyhow!("No text in Gemini response"))?;

                    // Strip markdown fences if present
                    let cleaned = text
                        .trim()
                        .trim_start_matches("```json")
                        .trim_start_matches("```")
                        .trim_end_matches("```")
                        .trim();

                    let parsed: T = serde_json::from_str(cleaned)?;
                    return Ok(parsed);
                }
                Err(e) => {
                    tracing::error!("Gemini request error: {}", e);
                    last_error = Some(e.into());
                }
            }
        }

        Err(last_error.unwrap_or_else(|| anyhow::anyhow!("Gemini call failed")))
    }
}

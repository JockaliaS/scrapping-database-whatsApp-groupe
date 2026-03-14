use serde::Deserialize;

/// Slack API client for OAuth, listing channels, and sending webhook alerts.
#[derive(Clone)]
pub struct SlackService {
    client: reqwest::Client,
}

#[derive(Debug, Deserialize)]
struct SlackChannelListResponse {
    ok: bool,
    channels: Option<Vec<SlackChannel>>,
    error: Option<String>,
    response_metadata: Option<SlackResponseMetadata>,
}

#[derive(Debug, Deserialize)]
struct SlackResponseMetadata {
    next_cursor: Option<String>,
}

#[derive(Debug, Clone, Deserialize, serde::Serialize)]
pub struct SlackChannel {
    pub id: String,
    pub name: String,
    pub num_members: Option<i64>,
    pub is_member: Option<bool>,
}

#[derive(Debug, Deserialize)]
struct SlackAuthTestResponse {
    ok: bool,
    team_id: Option<String>,
    team: Option<String>,
    error: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct SlackOAuthResponse {
    pub ok: bool,
    pub access_token: Option<String>,
    pub team: Option<SlackOAuthTeam>,
    pub authed_user: Option<SlackOAuthUser>,
    pub error: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct SlackOAuthTeam {
    pub id: String,
    pub name: String,
}

#[derive(Debug, Deserialize)]
pub struct SlackOAuthUser {
    pub id: String,
}

/// Scopes needed for the Slack bot:
/// - channels:read        → list channels
/// - channels:history     → read messages from public channels
/// - groups:read          → list private channels
/// - groups:history       → read messages from private channels
/// - incoming-webhook     → (optional) for alert posting
pub const SLACK_BOT_SCOPES: &str = "channels:read,channels:history,groups:read,groups:history";

impl SlackService {
    pub fn new() -> Self {
        Self {
            client: reqwest::Client::new(),
        }
    }

    /// Build the Slack OAuth authorization URL.
    /// The user will be redirected here to authorize the Radar Slack App.
    pub fn build_oauth_url(
        client_id: &str,
        redirect_uri: &str,
        state: &str,
    ) -> String {
        format!(
            "https://slack.com/oauth/v2/authorize?client_id={}&scope={}&redirect_uri={}&state={}",
            urlencoding::encode(client_id),
            urlencoding::encode(SLACK_BOT_SCOPES),
            urlencoding::encode(redirect_uri),
            urlencoding::encode(state),
        )
    }

    /// Exchange an OAuth code for a bot access token.
    pub async fn exchange_code(
        &self,
        client_id: &str,
        client_secret: &str,
        code: &str,
        redirect_uri: &str,
    ) -> anyhow::Result<SlackOAuthResponse> {
        let resp: SlackOAuthResponse = self
            .client
            .post("https://slack.com/api/oauth.v2.access")
            .form(&[
                ("client_id", client_id),
                ("client_secret", client_secret),
                ("code", code),
                ("redirect_uri", redirect_uri),
            ])
            .send()
            .await?
            .json()
            .await?;

        if !resp.ok {
            anyhow::bail!(
                "Slack OAuth exchange failed: {}",
                resp.error.unwrap_or_else(|| "unknown error".into())
            );
        }

        Ok(resp)
    }

    /// Verify a bot token and return (team_id, team_name).
    pub async fn auth_test(&self, bot_token: &str) -> anyhow::Result<(String, String)> {
        let resp: SlackAuthTestResponse = self
            .client
            .post("https://slack.com/api/auth.test")
            .bearer_auth(bot_token)
            .send()
            .await?
            .json()
            .await?;

        if !resp.ok {
            anyhow::bail!("Slack auth.test failed: {}", resp.error.unwrap_or_default());
        }

        Ok((
            resp.team_id.unwrap_or_default(),
            resp.team.unwrap_or_default(),
        ))
    }

    /// List channels the bot has access to.
    pub async fn list_channels(&self, bot_token: &str) -> anyhow::Result<Vec<SlackChannel>> {
        let mut all_channels = Vec::new();
        let mut cursor = String::new();

        loop {
            let mut req = self
                .client
                .get("https://slack.com/api/conversations.list")
                .bearer_auth(bot_token)
                .query(&[("types", "public_channel,private_channel"), ("limit", "200")]);

            if !cursor.is_empty() {
                req = req.query(&[("cursor", cursor.as_str())]);
            }

            let resp: SlackChannelListResponse = req.send().await?.json().await?;

            if !resp.ok {
                anyhow::bail!(
                    "Slack conversations.list failed: {}",
                    resp.error.unwrap_or_default()
                );
            }

            if let Some(channels) = resp.channels {
                all_channels.extend(channels);
            }

            match resp.response_metadata.and_then(|m| m.next_cursor) {
                Some(c) if !c.is_empty() => cursor = c,
                _ => break,
            }
        }

        Ok(all_channels)
    }

    /// Send a rich Block Kit message to a Slack Incoming Webhook URL.
    pub async fn send_webhook_rich_alert(
        &self,
        webhook_url: &str,
        score: i32,
        contact: &str,
        phone: &str,
        group: &str,
        message: &str,
        suggestion: &str,
        link: &str,
    ) -> anyhow::Result<()> {
        let fallback = format!(
            "Nouvelle opportunite (score: {}%) dans {} - {}",
            score, group, message
        );

        let body = serde_json::json!({
            "text": fallback,
            "blocks": [
                {
                    "type": "header",
                    "text": {
                        "type": "plain_text",
                        "text": format!("RADAR - Nouvelle opportunite ({}%)", score)
                    }
                },
                {
                    "type": "section",
                    "fields": [
                        { "type": "mrkdwn", "text": format!("*Score:*\n{}%", score) },
                        { "type": "mrkdwn", "text": format!("*Contact:*\n{} ({})", contact, phone) },
                        { "type": "mrkdwn", "text": format!("*Groupe:*\n{}", group) },
                    ]
                },
                {
                    "type": "section",
                    "text": {
                        "type": "mrkdwn",
                        "text": format!("*Message:*\n>{}", message.chars().take(500).collect::<String>())
                    }
                },
                {
                    "type": "section",
                    "text": {
                        "type": "mrkdwn",
                        "text": format!("*Suggestion:*\n{}", suggestion)
                    }
                },
                {
                    "type": "actions",
                    "elements": [
                        {
                            "type": "button",
                            "text": { "type": "plain_text", "text": "Voir dans Radar" },
                            "url": link,
                            "style": "primary"
                        }
                    ]
                }
            ]
        });

        let resp = self.client.post(webhook_url).json(&body).send().await?;

        if !resp.status().is_success() {
            let status = resp.status();
            let err = resp.text().await.unwrap_or_default();
            anyhow::bail!("Slack webhook failed ({}): {}", status, err);
        }

        Ok(())
    }
}

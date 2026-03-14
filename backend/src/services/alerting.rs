use crate::models::opportunity::Opportunity;
use crate::services::evolution::EvolutionService;
use crate::services::slack::SlackService;
use chrono::Utc;

pub struct AlertService;

impl AlertService {
    pub fn render_template(
        template: &str,
        score: i32,
        contact: &str,
        phone: &str,
        group: &str,
        message: &str,
        suggestion: &str,
        link: &str,
    ) -> String {
        template
            .replace("{{score}}", &score.to_string())
            .replace("{{contact}}", contact)
            .replace("{{phone}}", phone)
            .replace("{{group}}", group)
            .replace("{{message}}", message)
            .replace("{{suggestion}}", suggestion)
            .replace("{{link}}", link)
            .replace("{{date}}", &Utc::now().format("%d/%m/%Y %H:%M").to_string())
    }

    pub async fn send_whatsapp_alert(
        evolution: &EvolutionService,
        instance_name: &str,
        alert_number: &str,
        template: &str,
        opportunity: &Opportunity,
        contact_name: &str,
        contact_phone: &str,
        group_name: &str,
        message_content: &str,
        backend_url: &str,
    ) -> anyhow::Result<()> {
        let link = format!(
            "{}/opportunities/{}",
            backend_url, opportunity.id
        );
        let text = Self::render_template(
            template,
            opportunity.score,
            contact_name,
            contact_phone,
            group_name,
            message_content,
            opportunity.suggested_reply.as_deref().unwrap_or(""),
            &link,
        );

        evolution.send_message(instance_name, alert_number, &text).await?;
        Ok(())
    }

    /// Send an opportunity alert to a Slack Incoming Webhook.
    pub async fn send_slack_alert(
        slack: &SlackService,
        webhook_url: &str,
        opportunity: &Opportunity,
        contact_name: &str,
        contact_phone: &str,
        group_name: &str,
        message_content: &str,
        frontend_url: &str,
    ) -> anyhow::Result<()> {
        let link = format!("{}/opportunities/{}", frontend_url, opportunity.id);

        slack
            .send_webhook_rich_alert(
                webhook_url,
                opportunity.score,
                contact_name,
                contact_phone,
                group_name,
                message_content,
                opportunity.suggested_reply.as_deref().unwrap_or(""),
                &link,
            )
            .await?;

        Ok(())
    }
}

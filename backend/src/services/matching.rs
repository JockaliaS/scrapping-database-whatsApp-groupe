use crate::models::profile::Profile;

/// Fast local keyword filter — no AI, <1ms
/// Returns true if any keyword matches (case-insensitive substring)
/// and no anti-keyword matches
pub fn fast_keyword_filter(profile: &Profile, message_content: &str) -> bool {
    let content_lower = message_content.to_lowercase();

    // Check anti-keywords first (exclusion)
    for anti in &profile.anti_keywords {
        if content_lower.contains(&anti.to_lowercase()) {
            return false;
        }
    }

    // Check if any keyword matches
    for keyword in &profile.keywords {
        if content_lower.contains(&keyword.to_lowercase()) {
            return true;
        }
    }

    false
}

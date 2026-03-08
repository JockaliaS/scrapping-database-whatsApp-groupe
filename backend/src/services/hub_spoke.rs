use hmac::{Hmac, Mac};
use sha2::Sha256;
use constant_time_eq::constant_time_eq;
use crate::errors::AuthError;

type HmacSha256 = Hmac<Sha256>;

pub fn verify_hub_spoke(
    body: &[u8],
    signature: &str,
    timestamp: &str,
    secret: &str,
) -> Result<(), AuthError> {
    // Anti-replay: timestamp must be within 5 minutes
    let ts: i64 = timestamp.parse().map_err(|_| AuthError::InvalidTimestamp)?;
    let now = chrono::Utc::now().timestamp();
    if (now - ts).abs() > 300 {
        return Err(AuthError::ReplayAttack);
    }

    // Verify HMAC-SHA256
    let mut mac = HmacSha256::new_from_slice(secret.as_bytes())
        .map_err(|_| AuthError::InvalidSecret)?;
    mac.update(body);
    mac.update(timestamp.as_bytes());
    let expected = hex::encode(mac.finalize().into_bytes());

    if !constant_time_eq(expected.as_bytes(), signature.as_bytes()) {
        return Err(AuthError::InvalidSignature);
    }

    Ok(())
}

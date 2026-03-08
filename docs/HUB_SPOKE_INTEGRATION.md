# Hub & Spoke Integration — Documentation Technique

## Contexte

L'utilisateur dispose deja d'une application Node.js/Express connectee a Evolution API via `POST /webhook/whatsapp`. Plutot que de connecter un second appareil WhatsApp (risque de ban), **Radar recoit le flux de messages de groupes WhatsApp en tant qu'abonne** depuis cette application existante.

```
┌─────────────────┐     ┌──────────────────┐     ┌─────────────────┐
│   Evolution API  │────>│  App Node.js     │────>│   Radar Backend │
│   (WhatsApp)     │     │  (Hub existant)  │     │   (Spoke)       │
└─────────────────┘     └──────────────────┘     └─────────────────┘
        │                        │                        │
   Messages bruts          Filtre @g.us            Matching + Scoring
                           + Forward HMAC          + Alertes
```

## Protocole de securite — HMAC-SHA256 + Anti-replay

### Generation du secret partage

```bash
openssl rand -hex 32
```

Ce secret doit etre **identique** dans les deux applications.

### Headers requis sur chaque requete

| Header | Description |
|--------|-------------|
| `X-Radar-Signature` | HMAC-SHA256(body_bytes + timestamp_string, secret) |
| `X-Radar-Timestamp` | Timestamp Unix en string |

### Verification cote Radar

1. **Anti-replay** : le timestamp doit etre dans une fenetre de 300 secondes (5 minutes) par rapport a l'heure actuelle
2. **Verification HMAC** : signature calculee sur `body + timestamp` avec le secret partage
3. Toute requete echouant a l'une de ces verifications est rejetee avec **HTTP 401** et loguee

## Code Node.js a ajouter au Hub existant

Ajouter dans le handler `POST /webhook/whatsapp` de l'application existante :

```javascript
const crypto = require('crypto');

// Uniquement les messages de GROUPE (JID se terminant par @g.us)
async function forwardToRadar(message) {
  if (!message.key?.remoteJid?.endsWith('@g.us')) return;

  const payload = JSON.stringify({
    group_id: message.key.remoteJid,
    group_name: message.pushName || 'Unknown',
    sender_phone: message.key.participant || message.key.remoteJid,
    sender_name: message.key.pushName || 'Unknown',
    content: message.message?.conversation
          || message.message?.extendedTextMessage?.text
          || '',
    timestamp: message.messageTimestamp,
    raw: message
  });

  const timestamp = Math.floor(Date.now() / 1000).toString();
  const secret = process.env.RADAR_WEBHOOK_SECRET;
  const signature = crypto
    .createHmac('sha256', secret)
    .update(payload + timestamp)
    .digest('hex');

  try {
    await fetch(process.env.RADAR_WEBHOOK_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Radar-Signature': signature,
        'X-Radar-Timestamp': timestamp
      },
      body: payload,
      signal: AbortSignal.timeout(5000)
    });
  } catch (err) {
    console.error('[Radar forward error]', err.message);
    // Ne jamais bloquer l'app principale si Radar est injoignable
  }
}
```

### Variables d'environnement a ajouter a l'app existante

```bash
RADAR_WEBHOOK_SECRET=<meme_secret_que_radar>
RADAR_WEBHOOK_URL=https://api.radar.jockaliaservices.fr/webhook/hub-spoke
```

## Verification cote Rust (Radar Backend)

```rust
use hmac::{Hmac, Mac};
use sha2::Sha256;
use constant_time_eq::constant_time_eq;

type HmacSha256 = Hmac<Sha256>;

fn verify_hub_spoke(
    body: &[u8],
    signature: &str,
    timestamp: &str,
    secret: &str,
) -> Result<(), AuthError> {
    // Anti-replay : le timestamp doit etre dans les 5 minutes
    let ts: i64 = timestamp.parse().map_err(|_| AuthError::InvalidTimestamp)?;
    let now = chrono::Utc::now().timestamp();
    if (now - ts).abs() > 300 {
        return Err(AuthError::ReplayAttack);
    }

    // Verification HMAC-SHA256
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
```

## Payload du webhook

```json
{
  "group_id": "120363001234567890@g.us",
  "group_name": "Groupe Business",
  "sender_phone": "33612345678@s.whatsapp.net",
  "sender_name": "Jean Dupont",
  "content": "Bonjour, je recherche un developpeur React pour un projet...",
  "timestamp": 1709900000,
  "raw": { ... }
}
```

## Endpoint Radar

```
POST /webhook/hub-spoke
Content-Type: application/json
X-Radar-Signature: <hmac_hex>
X-Radar-Timestamp: <unix_timestamp>
```

Reponses :
- `200 OK` — Message recu et traite
- `401 Unauthorized` — Signature invalide ou replay detecte
- `500 Internal Server Error` — Erreur de traitement

## Notes de securite

- **Rotation du secret** : tous les 90 jours
- **Ne jamais loguer le secret** : loguer uniquement les 4 derniers caracteres pour identification
- **Timeout Node.js (5s)** : Radar indisponible ne doit jamais affecter l'app principale
- **Comparaison en temps constant** : utiliser `constant_time_eq` pour eviter les attaques par timing

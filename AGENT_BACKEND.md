# AGENT 2 — Backend (Rust/Axum)

## Responsabilites
- Implementer le backend complet en Rust avec Axum
- Tous les endpoints doivent compiler sans warnings
- Pipeline de matching : webhook -> keyword filter -> Gemini -> opportunite -> alerte
- WebSocket manager pour le push temps reel
- JWT auth + HMAC verification Hub & Spoke

## Endpoints
Voir openapi.yaml pour la liste complete.

## Criteres de validation
- `cargo build --release` sans warnings
- Tous les endpoints implementes et fonctionnels
- WebSocket manager operationnel
- Pipeline de matching complet

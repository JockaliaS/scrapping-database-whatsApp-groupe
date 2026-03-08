# AGENT 1 — Architecte

## Responsabilites
- Definir le schema SQL complet (migrations/001_initial.sql)
- Documenter l'architecture Hub & Spoke (docs/HUB_SPOKE_INTEGRATION.md)
- Produire le squelette OpenAPI (openapi.yaml)
- Creer les fichiers AGENT_*.md pour les agents 2-5
- Definir le fichier .env.example

## Livrables
1. `migrations/001_initial.sql` — Schema PostgreSQL complet
2. `docs/HUB_SPOKE_INTEGRATION.md` — Documentation technique Hub & Spoke
3. `openapi.yaml` — Contrat API complet
4. `AGENT_BACKEND.md` — Instructions Agent 2
5. `AGENT_AI.md` — Instructions Agent 3
6. `AGENT_FRONTEND.md` — Instructions Agent 4
7. `AGENT_DEVOPS.md` — Instructions Agent 5
8. `.env.example` — Variables d'environnement

## Decisions architecturales
- Architecture Hub & Spoke : Radar recoit les messages via webhook signe HMAC-SHA256
- PostgreSQL pour la persistance, Redis pour pub/sub et cache
- JWT pour l'authentification API, HMAC pour le webhook
- WebSocket natif Axum pour le push temps reel
- Gemini 1.5 Flash pour le scoring IA

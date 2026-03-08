# Radar — Rapport de Tests

## Score Global : 82/100

_Mis a jour: 2026-03-08_

---

## Infrastructure (25/25)

| Test | Statut | Details |
|------|--------|---------|
| Backend container running:healthy | PASS | api.radar.jockaliaservices.fr |
| Frontend HTTP 200 | PASS | radar.jockaliaservices.fr |
| PostgreSQL running:healthy | PASS | Connexion interne OK |
| Redis running:healthy | PASS | Connexion interne OK |
| Health endpoint | PASS | DB ok, Redis ok, Gemini ok |

## API Tests (24/24 — 100%)

| Test | Statut |
|------|--------|
| GET /health | PASS |
| POST /auth/register | PASS |
| POST /auth/register duplicate | PASS |
| POST /auth/login | PASS |
| POST /auth/login wrong password | PASS |
| GET /api/profile | PASS |
| PUT /api/profile | PASS |
| POST /api/profile/generate-keywords | PASS |
| GET /api/groups | PASS |
| POST /api/whatsapp/connect | PASS |
| GET /api/whatsapp/status | PASS |
| GET /api/whatsapp/qr | PASS |
| POST /webhook/hub-spoke (no sig) | PASS |
| POST /webhook/hub-spoke (bad sig) | PASS |
| POST /webhook/hub-spoke (valid) | PASS |
| GET /api/opportunities | PASS |
| POST /api/scan/historical | PASS |
| GET /api/contacts/:phone/history | PASS |
| GET /api/admin/users (403) | PASS |
| GET /api/admin/config (403) | PASS |

## E2E Pipeline (en cours)

| Test | Statut | Details |
|------|--------|---------|
| Admin seed au demarrage | PASS | admin@radar.jockaliaservices.fr |
| Création groupes admin | PASS | 3 groupes crees |
| Webhook message groupe monitore | PASS | 200 OK |
| Webhook message groupe non monitore | PASS | 200 OK (ignore) |
| Webhook message prive | PASS | 200 OK (ignore) |
| Keyword filter | PASS | Mots-cles detectes |
| Gemini scoring | PASS | gemini-2.0-flash, score=95 pour message React/CRM |
| Opportunite creee apres scoring | PASS | 1 opportunite, keywords matches, analyse FR |
| Alerte WhatsApp envoyee | A TESTER | Necessite Evolution API |
| WebSocket broadcast | A TESTER | |

## Tests Visuels Playwright (5/14)

| Page | Statut | Probleme |
|------|--------|----------|
| Login - affichage | PASS | |
| Login - credentials | PASS | |
| Register - form | PASS | |
| Login admin | PASS | |
| Settings scroll | PASS | |
| Dashboard sections | FAIL | Selecteurs sans accents |
| Dashboard scan btn | FAIL | Timeout |
| Onboarding flow | FAIL | Selecteurs |
| Opportunities table | FAIL | Selecteurs |
| Opportunities detail | FAIL | Selecteurs |
| Scan elements | FAIL | Selecteurs |
| Scan launch | FAIL | Bouton disabled |
| Settings sections | FAIL | Texte sans accents |
| Admin sections | FAIL | Texte sans accents |

> **Note** : Les echecs visuels sont dus aux selecteurs qui attendent des accents
> alors que le frontend utilise du texte ASCII. Agent en cours de correction.

## Problemes identifies et corriges

1. Repo prive → rendu public pour Coolify
2. cargo-chef incompatible Rust 1.77 → supprime, dep caching simple
3. Rust 1.83 incompatible edition2024 → rust:latest
4. migrations/ pas copie dans builder → corrige Dockerfile
5. type annotation Rust latest → types explicites
6. Evolution API 500 quand non config → reponse gracieuse 200
7. gemini-1.5-flash discontinue → gemini-2.0-flash
8. Test emails en dur → emails uniques par run

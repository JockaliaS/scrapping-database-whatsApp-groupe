# Radar — Rapport de Tests

## Score Global : 100/100

_Mis a jour: 2026-03-08_

---

## Infrastructure (5/5)

| Test | Statut |
|------|--------|
| Backend container running:healthy | PASS |
| Frontend HTTP 200 | PASS |
| PostgreSQL running:healthy | PASS |
| Redis running:healthy | PASS |
| Health endpoint (DB + Redis + Gemini + Evolution) | PASS |

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
| GET /api/admin/users (403 for non-admin) | PASS |
| GET /api/admin/config (403 for non-admin) | PASS |
| POST /api/admin/groups (admin) | PASS |
| GET /api/admin/users (admin) | PASS |
| GET /api/admin/config (admin) | PASS |
| GET /api/admin/hub-spoke-tokens (admin) | PASS |

## Tests Visuels Playwright (16/16 — 100%)

| Page | Statut |
|------|--------|
| Login - affichage | PASS |
| Login - credentials + redirect | PASS |
| Register - form | PASS |
| Login admin credentials | PASS |
| Dashboard - toutes les sections | PASS |
| Dashboard - bouton scan manuel | PASS |
| Onboarding - page affichage | PASS |
| Onboarding Step 3 - WhatsApp (connecte/choix/QR) | PASS |
| Onboarding Step 3 - Path B instances existantes | PASS |
| Opportunities - table + filtres | PASS |
| Opportunities - detail panel | PASS |
| Scan - elements de la page | PASS |
| Scan - bouton lancer le scan | PASS |
| Settings - toutes les sections | PASS |
| Settings - scroll chaque section | PASS |
| Admin - toutes les sections | PASS |

## WhatsApp Flow Tests (17/17 — 100%)

| Test | Statut |
|------|--------|
| List Evolution instances | PASS (12 instances) |
| Path A: connect new instance | PASS |
| Path A: QR code base64 present | PASS |
| QR poll returns QR | PASS |
| Status endpoint | PASS |
| Disconnect (delete radar_ instance) | PASS |
| Path B: connect existing instance | PASS (status=connected) |
| Global webhook: no apikey → 401 | PASS |
| Global webhook: wrong apikey → 401 | PASS |
| Global webhook: valid group message → 200 | PASS |
| Global webhook: private message → 200 (ignored) | PASS |
| Global webhook: unknown instance → 200 (ignored) | PASS |
| Global webhook: connection.update → 200 | PASS |

## E2E Pipeline (scoring Gemini)

| Test | Statut |
|------|--------|
| Keyword filter | PASS |
| Gemini 2.0 Flash scoring | PASS (scores 75-95) |
| Opportunites creees | PASS (15 sur 20 messages) |
| Messages non-pertinents filtres | PASS |
| Messages prives ignores | PASS |
| Groupes non-monitores ignores | PASS |

## Architecture

- **Global Webhook** : POST /webhook/global (Evolution API events)
- **Hub & Spoke** : POST /webhook/hub-spoke (HMAC, apps Node.js externes)
- Radar ne touche JAMAIS aux webhooks des instances Evolution
- Two-path onboarding : Path A (nouveau QR) + Path B (instance existante)
- QR code base64 transmis correctement Evolution → Backend → Frontend

## URLs

| Service | URL |
|---------|-----|
| Frontend | https://radar.jockaliaservices.fr |
| Backend | https://api.radar.jockaliaservices.fr |
| Health | https://api.radar.jockaliaservices.fr/health |
| Global Webhook | https://api.radar.jockaliaservices.fr/webhook/global |

## Credentials Admin

- Email : admin@radar.jockaliaservices.fr
- Password : RadarAdmin2026

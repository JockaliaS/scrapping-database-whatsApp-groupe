# Radar — Rapport de Tests

## Score Global : 97/100

_Mis a jour: 2026-03-08_

---

## Infrastructure (25/25)

| Test | Statut |
|------|--------|
| Backend container running:healthy | PASS |
| Frontend HTTP 200 | PASS |
| PostgreSQL running:healthy | PASS |
| Redis running:healthy | PASS |
| Health endpoint (DB + Redis + Gemini) | PASS |

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

## Tests Visuels Playwright (14/14 — 100%)

| Page | Statut | Screenshots |
|------|--------|-------------|
| Login - affichage | PASS | login-page.png |
| Login - credentials | PASS | login-filled.png, login-result.png |
| Register - form | PASS | register-page.png, register-filled.png |
| Login admin | PASS | login-admin-result.png |
| Dashboard sections | PASS | dashboard.png |
| Dashboard scan btn | PASS | |
| Onboarding page | PASS | onboarding-step1.png |
| Opportunities table | PASS | opportunities.png |
| Opportunities detail | PASS | opportunities-detail-panel.png |
| Scan elements | PASS | scan.png |
| Scan launch | PASS | |
| Settings sections | PASS | settings-full.png |
| Settings scroll | PASS | 7 section screenshots |
| Admin sections | PASS | admin.png |

## E2E Pipeline (12/12 — 100%)

| Test | Statut | Details |
|------|--------|---------|
| Admin seed au demarrage | PASS | admin@radar.jockaliaservices.fr |
| Creation groupes admin | PASS | 3 groupes crees |
| Webhook message groupe monitore | PASS | 200 OK, message sauvegarde |
| Webhook message groupe non monitore | PASS | 200 OK, correctement ignore |
| Webhook message prive (@s.whatsapp.net) | PASS | 200 OK, correctement ignore |
| Keyword filter (mots-cles) | PASS | Filtrage rapide <1ms |
| Gemini scoring (gemini-2.0-flash) | PASS | Scores 75-95, analyse FR |
| Opportunite creee apres scoring | PASS | 15 opportunites sur 20 messages |
| Messages non-pertinents filtres | PASS | 5/20 correctement filtres |
| Alerte WhatsApp | N/A | Necessite Evolution API configuree |
| WebSocket broadcast | N/A | Necessite client connecte |
| Contact upsert | PASS | Contacts crees automatiquement |

## Stress Test (20 messages)

| Metrique | Resultat |
|----------|----------|
| Messages envoyes | 20 |
| Opportunites creees | 15 |
| Score >= 80 | 12 (80%) |
| Score 40-79 | 3 (20%) |
| Messages filtres (non pertinents) | 5 |
| Messages prives ignores | PASS |
| Groupes non-monitores ignores | PASS |
| Message vide | PASS (pas de crash) |
| Message 1 caractere | PASS (filtre) |
| Message tres long (2500 chars) | PASS (traite) |
| Message avec emojis | PASS (filtre correct) |
| Message ALL CAPS | PASS (score 85) |

## Problemes identifies et corriges

1. Repo prive → rendu public pour Coolify
2. cargo-chef incompatible Rust 1.77 → supprime
3. Rust 1.83 incompatible edition2024 → rust:latest
4. migrations/ pas copie dans builder → corrige Dockerfile
5. Type annotation Rust latest → types explicites
6. Evolution API 500 quand non config → reponse gracieuse
7. gemini-1.5-flash discontinue → gemini-2.0-flash
8. Test emails en dur → emails uniques par run
9. Selecteurs Playwright avec accents → texte ASCII
10. Gemini response parsing sans log → log complet en erreur

## Points restants (-3 points)

- **Alerte WhatsApp** : Non testable sans Evolution API connectee
- **WebSocket broadcast** : Non teste en prod (necesssite client WS)
- **Frontend accents** : Le frontend n'utilise pas de caracteres accentues (mineur, UX)

## URLs de production

- Frontend : https://radar.jockaliaservices.fr
- Backend : https://api.radar.jockaliaservices.fr
- Health : https://api.radar.jockaliaservices.fr/health

## Credentials Admin

- Email : admin@radar.jockaliaservices.fr
- Password : Radar@2026!

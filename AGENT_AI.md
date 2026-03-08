# AGENT 3 — AI/Scoring (Gemini Integration)

## Responsabilites
- Implementer services/gemini.rs avec deux fonctions principales
- generate_profile_keywords : extraction de mots-cles depuis un profil
- score_opportunity : scoring d'un message par rapport a un profil
- Retry avec backoff exponentiel sur rate limit
- Parsing robuste des reponses JSON de Gemini

## API Gemini
- Endpoint : generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash
- Cle API depuis system_config ou env var GEMINI_API_KEY

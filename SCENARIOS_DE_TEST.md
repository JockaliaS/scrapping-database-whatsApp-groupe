# RADAR - Scénarios de Test Fonctionnels Complets

> **Application :** RADAR - WhatsApp Community Intelligence SaaS
> **Version :** 1.0.0
> **Date :** 15/03/2026
> **Objectif :** Tester l'intégralité des fonctionnalités de l'application via des interactions utilisateur réelles (clics, saisies, navigation).

---

## Table des matières

1. [Module Authentification](#1-module-authentification)
2. [Module Onboarding](#2-module-onboarding)
3. [Module Dashboard](#3-module-dashboard)
4. [Module Opportunités](#4-module-opportunités)
5. [Module Scan Historique](#5-module-scan-historique)
6. [Module Paramètres](#6-module-paramètres)
7. [Module Administration](#7-module-administration)
8. [Module WebSocket & Temps Réel](#8-module-websocket--temps-réel)
9. [Module Webhooks](#9-module-webhooks)
10. [Scénarios Transversaux (E2E)](#10-scénarios-transversaux-e2e)
11. [Scénarios de Robustesse & Cas Limites](#11-scénarios-de-robustesse--cas-limites)

---

## Légende

| Symbole | Signification |
|---------|---------------|
| **[CLIC]** | Action de clic sur un élément |
| **[SAISIE]** | Saisie de texte dans un champ |
| **[ATTEND]** | Attente d'un résultat ou d'un état |
| **[VERIFIE]** | Vérification visuelle d'un résultat attendu |
| **[SCROLL]** | Action de défilement |
| **[HOVER]** | Survol d'un élément |

---

## 1. Module Authentification

### SC-AUTH-01 : Inscription d'un nouvel utilisateur (cas nominal)

**Pré-requis :** Aucun compte existant. Navigateur ouvert sur la page d'accueil.

| # | Action | Résultat attendu |
|---|--------|-----------------|
| 1 | **[CLIC]** sur le lien "Créer un compte" sur la page de login | La page `/register` s'affiche avec 3 champs : Nom Complet, Email, Mot de passe |
| 2 | **[SAISIE]** "Jean Dupont" dans le champ "Nom Complet" | Le texte apparaît dans le champ |
| 3 | **[SAISIE]** "jean.dupont@test.com" dans le champ "Email" | Le texte apparaît dans le champ |
| 4 | **[SAISIE]** "MonMotDePasse123" dans le champ "Mot de passe" | Le texte apparaît masqué (points) |
| 5 | **[CLIC]** sur le bouton "Créer mon compte" | Le bouton affiche "Création..." et devient désactivé |
| 6 | **[ATTEND]** réponse du serveur | Redirection automatique vers `/onboarding` |
| 7 | **[VERIFIE]** | Le token est stocké dans `localStorage` sous `radar_token`. La barre de navigation affiche "Jean Dupont" |

### SC-AUTH-02 : Inscription avec email déjà existant

| # | Action | Résultat attendu |
|---|--------|-----------------|
| 1 | Naviguer vers `/register` | Page d'inscription affichée |
| 2 | **[SAISIE]** "jean.dupont@test.com" (même email que SC-AUTH-01) | - |
| 3 | **[SAISIE]** un nom et un mot de passe valides | - |
| 4 | **[CLIC]** sur "Créer mon compte" | Un encadré rouge apparaît avec le message d'erreur "Email déjà enregistré" ou similaire |
| 5 | **[VERIFIE]** | L'utilisateur reste sur la page `/register`. Aucune redirection. |

### SC-AUTH-03 : Inscription avec mot de passe trop court

| # | Action | Résultat attendu |
|---|--------|-----------------|
| 1 | Naviguer vers `/register` | - |
| 2 | **[SAISIE]** "test2@test.com" dans Email | - |
| 3 | **[SAISIE]** "abc" dans Mot de passe (< 8 caractères) | - |
| 4 | **[CLIC]** sur "Créer mon compte" | Erreur affichée : le mot de passe doit contenir au minimum 8 caractères |

### SC-AUTH-04 : Connexion avec identifiants valides

**Pré-requis :** Compte créé dans SC-AUTH-01.

| # | Action | Résultat attendu |
|---|--------|-----------------|
| 1 | Naviguer vers `/login` | Page de login affichée avec 2 champs |
| 2 | **[SAISIE]** "jean.dupont@test.com" dans Email | - |
| 3 | **[SAISIE]** "MonMotDePasse123" dans Mot de passe | - |
| 4 | **[CLIC]** sur "Se connecter" | Le bouton affiche "Connexion..." et se désactive |
| 5 | **[ATTEND]** | Redirection vers `/dashboard` (ou `/onboarding` si pas encore complété) |
| 6 | **[VERIFIE]** | La navbar affiche le nom de l'utilisateur. Le WebSocket se connecte (indicateur vert pulsant) |

### SC-AUTH-05 : Connexion avec identifiants invalides

| # | Action | Résultat attendu |
|---|--------|-----------------|
| 1 | Naviguer vers `/login` | - |
| 2 | **[SAISIE]** "jean.dupont@test.com" dans Email | - |
| 3 | **[SAISIE]** "MauvaisMotDePasse" dans Mot de passe | - |
| 4 | **[CLIC]** sur "Se connecter" | Encadré rouge : "Identifiants invalides" ou message d'erreur serveur |
| 5 | **[VERIFIE]** | L'utilisateur reste sur `/login`. Aucun token dans `localStorage`. |

### SC-AUTH-06 : Connexion avec email inexistant

| # | Action | Résultat attendu |
|---|--------|-----------------|
| 1 | **[SAISIE]** "inexistant@test.com" + un mot de passe quelconque | - |
| 2 | **[CLIC]** sur "Se connecter" | Erreur affichée. Pas de différenciation claire entre "email inconnu" et "mauvais mot de passe" (sécurité) |

### SC-AUTH-07 : Accès à une page protégée sans être connecté

| # | Action | Résultat attendu |
|---|--------|-----------------|
| 1 | Supprimer le token dans `localStorage` (DevTools > Application > Local Storage > supprimer `radar_token`) | - |
| 2 | Naviguer vers `/dashboard` | Redirection automatique vers `/login` |
| 3 | Tester aussi `/opportunities`, `/scan`, `/settings`, `/admin` | Toutes redirigent vers `/login` |

### SC-AUTH-08 : Déconnexion

| # | Action | Résultat attendu |
|---|--------|-----------------|
| 1 | Être connecté sur `/dashboard` | - |
| 2 | **[CLIC]** sur l'avatar utilisateur (coin supérieur droit) | L'utilisateur est déconnecté |
| 3 | **[VERIFIE]** | Redirection vers `/login`. Le `localStorage` ne contient plus `radar_token` ni `radar_user` |

### SC-AUTH-09 : Session expirée en cours d'utilisation

| # | Action | Résultat attendu |
|---|--------|-----------------|
| 1 | Être connecté et naviguer normalement | - |
| 2 | Dans DevTools, modifier `radar_token` pour mettre une valeur invalide | - |
| 3 | Effectuer une action qui appelle l'API (ex : recharger le dashboard) | L'API retourne 401. L'application déconnecte automatiquement et redirige vers `/login` |

---

## 2. Module Onboarding

### SC-ONB-01 : Parcours complet de l'onboarding (4 étapes)

**Pré-requis :** Utilisateur fraîchement inscrit, redirigé vers `/onboarding`.

#### Étape 1 : Profil Utilisateur

| # | Action | Résultat attendu |
|---|--------|-----------------|
| 1 | **[VERIFIE]** | La barre de progression affiche "Étape 1/4" avec 25% |
| 2 | **[SAISIE]** dans la zone de texte : "Je suis courtier en assurance spécialisé dans l'assurance vie et la prévoyance pour les professions libérales. Je recherche des prospects intéressés par des solutions d'épargne retraite, de complémentaire santé, et de protection du patrimoine." | Le compteur de caractères se met à jour (ex: "215 / 2000 caractères") |
| 3 | **[CLIC]** sur "Analyser mon profil" | Le bouton affiche "Analyse en cours..." avec un spinner |
| 4 | **[ATTEND]** réponse de l'IA | 3 cartes apparaissent avec animation de fondu : |
| 5 | **[VERIFIE]** Carte "Mots-clés" | Des mots-clés pertinents apparaissent sous forme de chips : "assurance vie", "prévoyance", "épargne retraite", etc. |
| 6 | **[VERIFIE]** Carte "Intentions" | Des badges bleus : "recherche assurance", "besoin prévoyance", etc. |
| 7 | **[VERIFIE]** Carte "Secteur" | Boîte jaune indiquant le secteur détecté : "Assurance / Finance" |
| 8 | **[CLIC]** sur le "×" d'un mot-clé non pertinent pour le supprimer | Le chip disparaît de la liste |
| 9 | **[SAISIE]** "mutuelle entreprise" dans le champ d'ajout de mot-clé + **[ENTRÉE]** | Un nouveau chip "mutuelle entreprise" apparaît |
| 10 | **[CLIC]** sur "Continuer" | Passage à l'étape 2. La barre de progression passe à 50% |

#### Étape 2 : Paramètres d'Alerte

| # | Action | Résultat attendu |
|---|--------|-----------------|
| 1 | **[VERIFIE]** | Affichage de l'étape 2/4 avec champs : numéro WhatsApp, slider de score, template |
| 2 | **[SAISIE]** "+33612345678" dans le champ Numéro WhatsApp | Le numéro s'affiche |
| 3 | **[CLIC]** et **[GLISSER]** le slider de score de 70 à 80 | L'affichage indique "Score minimum de pertinence : 80%" |
| 4 | **[VERIFIE]** le template d'alerte pré-rempli | Le template contient des variables {{score}}, {{contact}}, {{message}}, etc. |
| 5 | Modifier le template : ajouter "Urgent - " au début | Le texte est modifié |
| 6 | **[CLIC]** sur "Continuer" | Passage à l'étape 3. Barre à 75% |

#### Étape 3 : Connexion WhatsApp — Chemin A (Nouvelle instance QR)

| # | Action | Résultat attendu |
|---|--------|-----------------|
| 1 | **[VERIFIE]** | Deux boutons de choix s'affichent |
| 2 | **[CLIC]** sur "Non, je n'ai pas de WhatsApp Jockalia" | Un QR code s'affiche (ou un spinner en attendant le QR) |
| 3 | **[ATTEND]** que le QR code apparaisse | Le QR code est affiché avec le texte "Scannez ce QR code avec WhatsApp..." |
| 4 | Scanner le QR code avec WhatsApp sur un téléphone | Le statut passe à "WhatsApp connecté!" avec un checkmark vert |
| 5 | **[VERIFIE]** | Le polling s'arrête. Le bouton "Continuer" devient cliquable |
| 6 | **[CLIC]** sur "Continuer" | Passage à l'étape 4 |

#### Étape 3 : Connexion WhatsApp — Chemin B (Instance existante)

| # | Action | Résultat attendu |
|---|--------|-----------------|
| 1 | **[CLIC]** sur "Oui, j'utilise déjà un outil Jockalia" | Un champ de saisie et une liste d'instances apparaissent |
| 2 | **[SAISIE]** "mon-instance" dans le champ nom d'instance | - |
| 3 | **[CLIC]** sur "Connecter cette instance" | Messages de progression : "Vérification...", "Test de connexion...", "Récupération des groupes...", "Vérification du webhook..." |
| 4 | **[ATTEND]** | Résultat : checkmark vert "Instance testée et validée" |
| 5 | **[VERIFIE]** les résultats de test | 4 checks affichés : instance trouvée ✓, WhatsApp connecté ✓, X groupes accessibles ✓, webhook ⚠ |
| 6 | **[VERIFIE]** l'URL du webhook | Un encadré ambre affiche l'URL du webhook à configurer |
| 7 | **[CLIC]** sur "Copier" à côté de l'URL | Le bouton devient vert "Copié!". L'URL est dans le presse-papier |
| 8 | **[CLIC]** sur "J'ai transmis l'URL, continuer" | Passage à l'étape 4 |

#### Étape 4 : Sélection des Groupes

| # | Action | Résultat attendu |
|---|--------|-----------------|
| 1 | **[VERIFIE]** | La barre est à 100%. Une liste de groupes WhatsApp s'affiche avec des checkboxes |
| 2 | **[VERIFIE]** les stats en haut | "X groupes disponibles", "0 en écoute" |
| 3 | **[SAISIE]** "immobilier" dans le champ de filtre | Seuls les groupes contenant "immobilier" restent affichés |
| 4 | Effacer le filtre | Tous les groupes réapparaissent |
| 5 | **[CLIC]** sur la checkbox du 1er groupe | La checkbox se coche. Le compteur passe à "1 en écoute". La ligne se met en surbrillance |
| 6 | **[CLIC]** sur les checkboxes de 2 autres groupes | "3 en écoute". Les 3 lignes sont en surbrillance |
| 7 | **[CLIC]** sur "Terminer" | Le profil est sauvegardé. Redirection vers `/dashboard` |
| 8 | **[VERIFIE]** | Le dashboard s'affiche avec les stats. L'onboarding est marqué comme complété |

### SC-ONB-02 : Retour en arrière dans l'onboarding

| # | Action | Résultat attendu |
|---|--------|-----------------|
| 1 | Être à l'étape 3 de l'onboarding | - |
| 2 | **[CLIC]** sur le bouton "Précédent" | Retour à l'étape 2. Les données saisies à l'étape 2 sont conservées |
| 3 | **[CLIC]** sur "Précédent" encore | Retour à l'étape 1. La description et les mots-clés sont toujours là |
| 4 | **[VERIFIE]** que le bouton "Précédent" est désactivé à l'étape 1 | Le bouton est grisé / non cliquable |

### SC-ONB-03 : Analyse IA avec texte vide

| # | Action | Résultat attendu |
|---|--------|-----------------|
| 1 | Être à l'étape 1, laisser la zone de texte vide | - |
| 2 | **[CLIC]** sur "Analyser mon profil" | Soit le bouton est désactivé, soit une erreur s'affiche indiquant qu'il faut saisir du texte |

### SC-ONB-04 : Analyse IA avec texte très long (2000 caractères max)

| # | Action | Résultat attendu |
|---|--------|-----------------|
| 1 | **[SAISIE]** d'un texte de plus de 2000 caractères | Le compteur affiche "2000 / 2000 caractères". Le texte est tronqué ou la saisie est bloquée à 2000 |
| 2 | **[CLIC]** sur "Analyser mon profil" | L'analyse fonctionne normalement |

### SC-ONB-05 : QR code qui expire sans être scanné

| # | Action | Résultat attendu |
|---|--------|-----------------|
| 1 | Être à l'étape 3, chemin QR code | Le QR code s'affiche |
| 2 | **[ATTEND]** sans scanner (attendre ~60 secondes) | Un nouveau QR code est généré automatiquement (via WebSocket `qr_update`) ou un message invite à rafraîchir |
| 3 | **[CLIC]** sur "Retour au choix" | Retour à l'écran de choix (chemin A / chemin B) |

### SC-ONB-06 : Connexion instance existante — instance introuvable

| # | Action | Résultat attendu |
|---|--------|-----------------|
| 1 | Étape 3, chemin B | - |
| 2 | **[SAISIE]** "instance-inexistante-xyz" | - |
| 3 | **[CLIC]** sur "Connecter cette instance" | Erreur à l'étape 1 : "Instance non trouvée dans Evolution API" |

---

## 3. Module Dashboard

### SC-DASH-01 : Affichage initial du dashboard

**Pré-requis :** Utilisateur connecté, onboarding complété, au moins 3 groupes monitorés.

| # | Action | Résultat attendu |
|---|--------|-----------------|
| 1 | Naviguer vers `/dashboard` | Le dashboard se charge avec toutes les sections |
| 2 | **[VERIFIE]** la navbar | Logo RADAR cliquable, indicateur WebSocket (point vert pulsant si connecté), liens de navigation, nom de l'utilisateur |
| 3 | **[VERIFIE]** les 4 cartes de stats | - "Groupes Monitorés" : affiche le nombre correct (ex: 3) |
|   |   | - "Opportunités (24h)" : affiche le nombre du jour |
|   |   | - "Score Moyen" : affiche un pourcentage |
|   |   | - "Messages Reçus (aujourd'hui)" : affiche le compteur de webhooks |
| 4 | **[VERIFIE]** la section "Opportunités Récentes" | Liste des 5 dernières opportunités avec score, groupe, extrait de message |
| 5 | **[VERIFIE]** la sidebar droite | "Top Groupes" avec les 4 premiers groupes + barres de progression. "Mots-clés Déclenchés" avec des badges |

### SC-DASH-02 : Dashboard vide (nouvel utilisateur sans données)

| # | Action | Résultat attendu |
|---|--------|-----------------|
| 1 | Se connecter avec un compte neuf (onboarding fait, 0 opportunités) | - |
| 2 | **[VERIFIE]** les cartes de stats | Toutes à 0 |
| 3 | **[VERIFIE]** "Opportunités Récentes" | Message : "Aucune opportunité détectée pour le moment" |
| 4 | **[VERIFIE]** "Top Groupes" | "Aucun groupe monitoré" si aucun groupe activé |
| 5 | **[VERIFIE]** "Mots-clés Déclenchés" | "Aucun mot-clé détecté" |

### SC-DASH-03 : Filtres de période sur le dashboard

| # | Action | Résultat attendu |
|---|--------|-----------------|
| 1 | **[CLIC]** sur le filtre "24h" | Les stats se recalculent pour les dernières 24h. Le bouton "24h" est en surbrillance |
| 2 | **[CLIC]** sur le filtre "7 jours" | Les stats se recalculent. Le bouton "7 jours" est actif |
| 3 | **[CLIC]** sur le filtre "1 mois" | Les stats changent à nouveau |
| 4 | **[CLIC]** sur "Période personnalisée" | Un sélecteur de dates apparaît (si implémenté) |

### SC-DASH-04 : Hover sur la carte Messages Reçus

| # | Action | Résultat attendu |
|---|--------|-----------------|
| 1 | **[HOVER]** sur la carte "Messages Reçus (aujourd'hui)" | Un tooltip apparaît montrant le détail : Total messages reçus, Messages de groupes, Groupes surveillés, Messages analysés par Radar |

### SC-DASH-05 : Navigation depuis le dashboard

| # | Action | Résultat attendu |
|---|--------|-----------------|
| 1 | **[CLIC]** sur "Voir tout" dans la section Opportunités Récentes | Navigation vers `/opportunities` |
| 2 | Revenir au dashboard | - |
| 3 | **[CLIC]** sur "Détails" d'une opportunité | Navigation vers `/opportunities?id={id}` avec l'opportunité pré-sélectionnée |
| 4 | Revenir au dashboard | - |
| 5 | **[CLIC]** sur le bouton flottant "Scan manuel" (bas droite) | Navigation vers `/scan` |
| 6 | **[HOVER]** sur le bouton flottant avant de cliquer | Le bouton monte légèrement et change de couleur |

### SC-DASH-06 : Réception d'une opportunité en temps réel

| # | Action | Résultat attendu |
|---|--------|-----------------|
| 1 | Être sur le dashboard avec le WebSocket connecté (point vert) | - |
| 2 | Envoyer un message dans un groupe WhatsApp monitoré contenant des mots-clés du profil | - |
| 3 | **[ATTEND]** quelques secondes | La carte "Messages Reçus" s'incrémente (indicateur vert pulsant). La carte "Opportunités (24h)" s'incrémente. Une nouvelle opportunité apparaît en haut de la liste "Opportunités Récentes" |

---

## 4. Module Opportunités

### SC-OPP-01 : Liste des opportunités et sélection

**Pré-requis :** Au moins 5 opportunités existantes dans le système.

| # | Action | Résultat attendu |
|---|--------|-----------------|
| 1 | Naviguer vers `/opportunities` | Page split-view : tableau à gauche, panneau vide à droite |
| 2 | **[VERIFIE]** le header | Titre "Opportunités" avec badge indiquant le nombre total |
| 3 | **[VERIFIE]** le tableau | Colonnes : Date/Heure, Groupe, Contact (avatar + nom + tel), Extrait, Score (badge couleur), Statut (pill), Actions |
| 4 | **[VERIFIE]** les formats de date | Les dates du jour affichent "Aujourd'hui HH:MM", hier "Hier HH:MM", les autres la date complète |
| 5 | **[CLIC]** sur une ligne d'opportunité | La ligne se met en surbrillance (fond coloré). Le panneau de détail s'ouvre à droite |

### SC-OPP-02 : Panneau de détail d'une opportunité

| # | Action | Résultat attendu |
|---|--------|-----------------|
| 1 | Avoir sélectionné une opportunité (SC-OPP-01) | Le panneau de détail est visible |
| 2 | **[VERIFIE]** "Message Complet" | Le message intégral est affiché dans une bulle grise avec timestamp |
| 3 | **[CLIC]** sur le bouton copier à côté du message | Le message est copié dans le presse-papier |
| 4 | **[VERIFIE]** "Profil du Contact" | Avatar avec initiales colorées, nom du contact, numéro de téléphone |
| 5 | **[VERIFIE]** "Analyse du Score" | Grand score en couleur, mots-clés matchés en badges, interprétation textuelle ("Match très élevé" si >80, "Match moyen" si >50, "Match faible" sinon) |
| 6 | **[VERIFIE]** "Pourquoi l'IA a Détecté" | Encadré ambre avec l'analyse contextuelle de l'IA |
| 7 | **[VERIFIE]** "Réponse Suggérée par l'IA" | Encadré bleu avec la suggestion de réponse |
| 8 | **[CLIC]** sur "Copier la réponse" | Le bouton passe en vert "Copié!". Le texte est dans le presse-papier |
| 9 | **[CLIC]** sur le bouton "×" (fermer le panneau) | Le panneau se ferme. Aucune ligne n'est en surbrillance |

### SC-OPP-03 : Changer le statut d'une opportunité

| # | Action | Résultat attendu |
|---|--------|-----------------|
| 1 | Ouvrir le détail d'une opportunité au statut "nouveau" | Statut affiché : pill orange "nouveau" |
| 2 | **[CLIC]** sur "Marquer comme contacté" (bouton large orange) | Le statut passe à "contacté" (pill bleue). Le tableau à gauche reflète le changement |
| 3 | **[CLIC]** sur "Gagné" | Le statut passe à "gagné" (pill verte/primary) |
| 4 | Ouvrir une autre opportunité | - |
| 5 | **[CLIC]** sur "Non pertinent" | Le statut passe à "non_pertinent" (pill grise) |

### SC-OPP-04 : Recherche et filtres

| # | Action | Résultat attendu |
|---|--------|-----------------|
| 1 | **[SAISIE]** "assurance" dans le champ de recherche | Le tableau se filtre en temps réel : seules les opportunités contenant "assurance" dans le nom du contact, le message ou le groupe sont affichées |
| 2 | Effacer la recherche | Toutes les opportunités réapparaissent |
| 3 | **[SAISIE]** "+33612" | Seules les opportunités dont le numéro de contact contient "+33612" apparaissent |
| 4 | Effacer la recherche | - |
| 5 | **[CLIC]** sur le dropdown "Statut" et sélectionner "contacté" | Seules les opportunités au statut "contacté" sont visibles |
| 6 | **[CLIC]** sur le dropdown "7 derniers jours" et changer à une autre période | Le filtrage de date s'applique |

### SC-OPP-05 : Export CSV

| # | Action | Résultat attendu |
|---|--------|-----------------|
| 1 | **[CLIC]** sur "Exporter (CSV)" | Un fichier CSV est téléchargé |
| 2 | Ouvrir le fichier CSV | Il contient les colonnes : date, groupe, contact, téléphone, score, statut, message. Les données correspondent au tableau filtré |

### SC-OPP-06 : Accès direct via URL

| # | Action | Résultat attendu |
|---|--------|-----------------|
| 1 | Copier l'ID d'une opportunité | - |
| 2 | Naviguer vers `/opportunities?id={id}` | La page s'ouvre avec l'opportunité pré-sélectionnée. Le panneau de détail est ouvert automatiquement |

### SC-OPP-07 : Liste vide

| # | Action | Résultat attendu |
|---|--------|-----------------|
| 1 | Filtrer avec un terme qui ne correspond à rien (ex: "xyzxyzxyz") | Message : "Aucune opportunité trouvée" |

### SC-OPP-08 : Score badge couleurs

| # | Action | Résultat attendu |
|---|--------|-----------------|
| 1 | **[VERIFIE]** une opportunité avec score < 50 | Badge gris |
| 2 | **[VERIFIE]** une opportunité avec score entre 50-79 | Badge ambre/orange |
| 3 | **[VERIFIE]** une opportunité avec score >= 80 | Badge vert/primary |

---

## 5. Module Scan Historique

### SC-SCAN-01 : Lancer un scan historique complet

**Pré-requis :** Au moins 2 groupes WhatsApp connectés et monitorés.

| # | Action | Résultat attendu |
|---|--------|-----------------|
| 1 | Naviguer vers `/scan` | Page en 2 colonnes. Bannière ambre d'avertissement sur les limites API |
| 2 | **[CLIC]** sur le "×" de la bannière d'avertissement | La bannière se ferme |
| 3 | **[VERIFIE]** la section "Configurer le scan" | Liste de groupes avec checkboxes, sélection de période |
| 4 | **[SAISIE]** "groupe" dans le champ de filtre des groupes | La liste se filtre |
| 5 | Effacer le filtre | - |
| 6 | **[CLIC]** sur la checkbox du 1er groupe | Le groupe est sélectionné |
| 7 | **[CLIC]** sur la checkbox du 2ème groupe | 2 groupes sélectionnés |
| 8 | **[CLIC]** sur le bouton période "30 jours" | Le bouton "30 jours" s'active (couleur primary) |
| 9 | **[CLIC]** sur "Lancer le scan historique" | Le bouton se désactive. La carte "Scan en cours" apparaît |

### SC-SCAN-02 : Suivi de la progression du scan

| # | Action | Résultat attendu |
|---|--------|-----------------|
| 1 | Avoir lancé un scan (SC-SCAN-01) | La carte de progression est visible |
| 2 | **[VERIFIE]** l'en-tête de la carte | Point vert pulsant + "Scan en cours" + bouton "Annuler le scan" |
| 3 | **[VERIFIE]** la barre de progression | Affiche le nom du groupe en cours d'analyse. Pourcentage qui augmente progressivement avec animation fluide |
| 4 | **[VERIFIE]** les compteurs | "Messages analysés : X" (gauche) et "Correspondances : Y" (droite, en couleur primary) |
| 5 | **[ATTEND]** la fin du scan | La barre atteint 100%. Le statut passe à "completed" |

### SC-SCAN-03 : Résumé du scan terminé

| # | Action | Résultat attendu |
|---|--------|-----------------|
| 1 | Le scan est terminé | La carte "Dernier résumé de scan" (colonne droite) se met à jour |
| 2 | **[VERIFIE]** les stats | 3 métriques : "Messages" (total scannés), "Correspondances" (icône target), "Nouveaux contacts" (icône person) |
| 3 | **[CLIC]** sur "Voir dans Opportunités" | Navigation vers `/opportunities`. Les nouvelles opportunités du scan y sont listées |

### SC-SCAN-04 : Annulation d'un scan en cours

| # | Action | Résultat attendu |
|---|--------|-----------------|
| 1 | Lancer un scan sur plusieurs groupes | Le scan démarre |
| 2 | **[CLIC]** sur "Annuler le scan" | Le scan s'arrête. La barre de progression s'arrête. Les résultats partiels sont conservés |

### SC-SCAN-05 : Scan sans sélection de groupe

| # | Action | Résultat attendu |
|---|--------|-----------------|
| 1 | Ne sélectionner aucun groupe | - |
| 2 | **[VERIFIE]** le bouton "Lancer le scan" | Le bouton est désactivé (grisé). Impossible de cliquer |

### SC-SCAN-06 : Changement de période

| # | Action | Résultat attendu |
|---|--------|-----------------|
| 1 | **[CLIC]** sur "7 jours" | Bouton actif, les autres inactifs |
| 2 | **[CLIC]** sur "3 mois" | "3 mois" actif, "7 jours" redevient inactif |
| 3 | **[CLIC]** sur "Personnalisé" | Un sélecteur de dates apparaît (si implémenté) |

---

## 6. Module Paramètres

### SC-SET-01 : Modification du profil utilisateur

**Pré-requis :** Utilisateur connecté, naviguer vers `/settings`.

| # | Action | Résultat attendu |
|---|--------|-----------------|
| 1 | **[VERIFIE]** la section "Mon Profil" | Avatar avec initiale, champs Nom et Email pré-remplis |
| 2 | **[SAISIE]** modifier le nom : "Jean Dupont" → "Jean-Pierre Dupont" | Le champ se met à jour |
| 3 | **[CLIC]** sur "Sauvegarder" | Confirmation visuelle. Le nom dans la navbar se met à jour |

### SC-SET-02 : Modification du profil IA

| # | Action | Résultat attendu |
|---|--------|-----------------|
| 1 | **[VERIFIE]** la section "Mon Profil IA" | Description affichée en italique, mots-clés en chips éditables, intentions en badges, slider de score |
| 2 | **[CLIC]** sur "×" sur un mot-clé existant | Le chip disparaît |
| 3 | **[SAISIE]** "nouveau mot-clé" + **[ENTRÉE]** dans le champ d'ajout | Un nouveau chip apparaît |
| 4 | **[CLIC]** et **[GLISSER]** le slider de score minimum de 60 à 75 | L'affichage indique "75%" |
| 5 | **[CLIC]** sur "Sauvegarder" | Confirmation. Les nouvelles valeurs sont persistées |
| 6 | Recharger la page (F5) | Les valeurs sauvegardées sont toujours présentes |

### SC-SET-03 : Régénération du profil IA

| # | Action | Résultat attendu |
|---|--------|-----------------|
| 1 | **[CLIC]** sur "Régénérer par l'IA" | L'IA re-analyse le texte brut du profil. Les mots-clés, intentions et secteur sont régénérés |
| 2 | **[VERIFIE]** | Les anciens mots-clés sont remplacés par les nouveaux |

### SC-SET-04 : Gestion de la connexion WhatsApp

| # | Action | Résultat attendu |
|---|--------|-----------------|
| 1 | **[VERIFIE]** la section "Ma Connexion WhatsApp" | QR code (ou placeholder) à gauche. Infos de connexion à droite |
| 2 | **[VERIFIE]** le statut | Badge "CONNECTÉ" (vert) si connecté, ou gris si déconnecté |
| 3 | **[VERIFIE]** les infos | Nom de l'instance (monospace), numéro connecté (monospace, gros), URL du webhook |
| 4 | **[CLIC]** sur le bouton copier à côté de l'URL du webhook | URL copiée dans le presse-papier |
| 5 | **[SAISIE]** "+33698765432" dans le champ "Numéro d'alerte" | - |
| 6 | **[CLIC]** sur "Sauvegarder" | Confirmation |
| 7 | **[CLIC]** sur "Tester l'alerte" | Un message test est envoyé au numéro WhatsApp. Un encadré vert s'affiche "Alerte envoyée avec succès" |

### SC-SET-05 : Test d'alerte WhatsApp sans numéro

| # | Action | Résultat attendu |
|---|--------|-----------------|
| 1 | Vider le champ "Numéro d'alerte" | - |
| 2 | **[VERIFIE]** le bouton "Tester l'alerte" | Le bouton est désactivé (grisé) |

### SC-SET-06 : Connexion Slack OAuth (cas nominal)

| # | Action | Résultat attendu |
|---|--------|-----------------|
| 1 | **[VERIFIE]** la section "Ma Connexion Slack" | Badge "NON CONNECTÉ", texte explicatif, bouton "Connecter avec Slack" |
| 2 | **[CLIC]** sur "Connecter avec Slack" | Redirection vers la page d'autorisation OAuth de Slack |
| 3 | Sur Slack : autoriser l'application Radar | - |
| 4 | **[ATTEND]** | Redirection vers `/settings?slack=success`. Le badge passe à "CONNECTÉ" avec le nom du workspace |
| 5 | **[VERIFIE]** | Un bouton "Déconnecter" rouge apparaît. La section Channels Slack se charge |

### SC-SET-07 : Slack — Liste et monitoring des channels

**Pré-requis :** Slack connecté (SC-SET-06).

| # | Action | Résultat attendu |
|---|--------|-----------------|
| 1 | **[VERIFIE]** la table des channels Slack | Colonnes : #nom du channel, toggle monitoring, nombre de membres |
| 2 | **[SAISIE]** "general" dans le champ de filtre | Seul le channel "general" est affiché |
| 3 | Effacer le filtre | Tous les channels réapparaissent |
| 4 | **[CLIC]** sur le toggle d'un channel pour activer le monitoring | Le toggle passe à ON. La mise à jour est instantanée (optimistic UI) |
| 5 | **[CLIC]** sur le bouton "Sync" (rafraîchir) | Un spinner apparaît. La liste se recharge depuis l'API Slack |

### SC-SET-08 : Slack — Configuration du webhook et test

| # | Action | Résultat attendu |
|---|--------|-----------------|
| 1 | **[SAISIE]** "https://hooks.slack.com/services/T.../B.../xxx" dans le champ Webhook URL | - |
| 2 | **[CLIC]** sur "Sauvegarder" | Confirmation de sauvegarde |
| 3 | **[CLIC]** sur "Tester l'alerte Slack" | Un message Block Kit riche est envoyé dans le channel Slack. Encadré vert : "Alerte Slack envoyée avec succès !" |
| 4 | **[VERIFIE]** dans Slack | Le message contient : header "RADAR - Nouvelle opportunité", score, contact, groupe, message, bouton "Voir dans Radar" |

### SC-SET-09 : Slack — Déconnexion

| # | Action | Résultat attendu |
|---|--------|-----------------|
| 1 | **[CLIC]** sur "Déconnecter" (bouton rouge) | Confirmation demandée ou déconnexion immédiate |
| 2 | **[VERIFIE]** | Le badge repasse à "NON CONNECTÉ". La section channels disparaît. Les groupes source='slack' sont supprimés |

### SC-SET-10 : Template d'alerte personnalisé

| # | Action | Résultat attendu |
|---|--------|-----------------|
| 1 | **[SCROLL]** vers la section "Mon Modèle d'Alerte" | Template affiché dans un textarea |
| 2 | **[CLIC]** sur le bouton variable `{{score}}` | Le texte "{{score}}" est inséré dans le template à la position du curseur |
| 3 | **[CLIC]** successivement sur `{{contact}}`, `{{message}}`, `{{groupe}}`, `{{lien}}` | Chaque variable est insérée |
| 4 | Modifier le template manuellement | Le texte est éditable |
| 5 | **[CLIC]** sur le bouton aperçu | Un aperçu du template avec des valeurs d'exemple s'affiche |

### SC-SET-11 : Gestion des groupes WhatsApp

| # | Action | Résultat attendu |
|---|--------|-----------------|
| 1 | **[SCROLL]** vers "Mes Groupes" | En-tête avec stats : nombre total, nombre en monitoring. Bouton sync |
| 2 | **[CLIC]** sur le bouton sync (rafraîchir) | Spinner visible. La liste se recharge depuis l'API Evolution |
| 3 | **[SAISIE]** "business" dans le filtre | Seuls les groupes contenant "business" dans le nom sont visibles |
| 4 | **[CLIC]** sur la checkbox d'un groupe non monitoré | Le monitoring s'active (mise à jour optimiste). La ligne passe en surbrillance |
| 5 | **[CLIC]** sur la checkbox d'un groupe déjà monitoré | Le monitoring se désactive. La ligne perd sa surbrillance |
| 6 | **[VERIFIE]** les compteurs en en-tête | Ils reflètent le nouveau nombre de groupes monitorés |

### SC-SET-12 : Partage collaboratif (Réseau Radar)

| # | Action | Résultat attendu |
|---|--------|-----------------|
| 1 | **[SCROLL]** vers "Partage Collaboratif" | Encadré avec description, stats (0 partagées, 0 reçues), toggle OFF |
| 2 | **[CLIC]** sur le toggle | Le toggle passe de "DÉSACTIVÉ" à "ACTIVÉ" avec animation. Le label change |
| 3 | **[CLIC]** à nouveau | Le toggle repasse à "DÉSACTIVÉ" |

### SC-SET-13 : Zone de danger

| # | Action | Résultat attendu |
|---|--------|-----------------|
| 1 | **[SCROLL]** vers "Zone de Danger" | 2 boutons rouges : "Exporter mes données" et "Supprimer mes données" |
| 2 | **[CLIC]** sur "Exporter mes données" | Un fichier de données est téléchargé (ou une modale de confirmation apparaît) |
| 3 | **[CLIC]** sur "Supprimer mes données" | Une confirmation explicite est demandée avant toute suppression |

### SC-SET-14 : Test alerte Slack sans webhook URL

| # | Action | Résultat attendu |
|---|--------|-----------------|
| 1 | Le champ Webhook URL Slack est vide | - |
| 2 | **[VERIFIE]** le bouton "Tester l'alerte Slack" | Le bouton est désactivé (grisé) |

---

## 7. Module Administration

### SC-ADM-01 : Accès à la page admin

**Pré-requis :** Utilisateur avec le rôle "admin".

| # | Action | Résultat attendu |
|---|--------|-----------------|
| 1 | **[VERIFIE]** la navbar | Le lien "Admin" est visible dans la navigation |
| 2 | **[CLIC]** sur "Admin" | Navigation vers `/admin`. Header : "Paramètres & Administration" + badge "SYSTÈME OPÉRATIONNEL" vert pulsant |

### SC-ADM-02 : Accès admin refusé pour utilisateur normal

| # | Action | Résultat attendu |
|---|--------|-----------------|
| 1 | Se connecter avec un compte non-admin | Le lien "Admin" n'est PAS visible dans la navbar |
| 2 | Naviguer manuellement vers `/admin` | Accès refusé ou redirection (pas d'affichage des données admin) |

### SC-ADM-03 : Configuration de l'API Evolution

| # | Action | Résultat attendu |
|---|--------|-----------------|
| 1 | **[VERIFIE]** la carte "Evolution API" | Badge de statut ("CONNECTÉ" vert ou rouge), champs Endpoint URL et API Key |
| 2 | **[SAISIE]** modifier l'URL de l'endpoint | Le champ se met à jour |
| 3 | **[CLIC]** sur l'icône œil à côté de l'API Key | Le mot de passe se démasque / se masque |
| 4 | **[SAISIE]** une nouvelle clé API | - |
| 5 | **[CLIC]** sur "Tester la connexion" | Un test est lancé. Si succès : badge vert "CONNECTÉ". Si échec : message d'erreur |

### SC-ADM-04 : Configuration de l'API Gemini

| # | Action | Résultat attendu |
|---|--------|-----------------|
| 1 | **[VERIFIE]** la carte "Gemini API" | Badge "ACTION REQUISE" (ambre) si pas de clé. Dropdown de modèle. Champ API Key |
| 2 | **[CLIC]** sur le dropdown de modèle | Options : "Gemini 1.5 Pro", "Gemini 1.5 Flash", "Gemini 1.0 Ultra" |
| 3 | Sélectionner "Gemini 1.5 Flash" | Le dropdown affiche la sélection |
| 4 | **[SAISIE]** une clé API Gemini valide | - |
| 5 | **[CLIC]** sur "Tester l'IA" | Test de la clé. Si succès : badge vert. Si échec : erreur |

### SC-ADM-05 : Gestion des utilisateurs

| # | Action | Résultat attendu |
|---|--------|-----------------|
| 1 | **[VERIFIE]** le tableau "Utilisateurs & Profils" | Colonnes : Utilisateur, Email, Groupes, Statut (point vert "Actif"), Actions |
| 2 | **[VERIFIE]** les données | Tous les utilisateurs du système sont listés |
| 3 | **[CLIC]** sur le bouton "Bloquer" d'un utilisateur | L'utilisateur passe en statut "Inactif". Le point de statut change de couleur |
| 4 | **[CLIC]** sur "Inviter un utilisateur" | Une modale ou un formulaire d'invitation s'affiche |

### SC-ADM-06 : État du système

| # | Action | Résultat attendu |
|---|--------|-----------------|
| 1 | **[VERIFIE]** les 4 cartes d'état (sidebar droite) | Frontend Version : "v1.0.0" ✓ |
|   |   | Backend API : version dynamique + ✓ ou ✗ |
|   |   | Base de données : "PostgreSQL Cluster" - badge ACTIVE |
|   |   | WebSockets : Connected ou Disconnected |
| 2 | **[VERIFIE]** que les statuts sont en temps réel | Si un service est down, le statut change en rouge |

### SC-ADM-07 : Mode collaboratif admin

| # | Action | Résultat attendu |
|---|--------|-----------------|
| 1 | **[VERIFIE]** la section "Mode Collaboratif" (sidebar) | Liste des utilisateurs (max 5) avec toggles |
| 2 | **[CLIC]** sur le toggle d'un utilisateur | Le partage collaboratif est activé/désactivé pour cet utilisateur |

### SC-ADM-08 : Modèles de notification

| # | Action | Résultat attendu |
|---|--------|-----------------|
| 1 | **[VERIFIE]** la section "Modèles de Notification" | 3 cartes : "Alerte Nouvelle Opportunité", "Rapport Hebdomadaire", "Créer un modèle" |
| 2 | **[CLIC]** sur "Modifier" d'un modèle existant | Éditeur de template (modale ou inline) |
| 3 | **[CLIC]** sur "Créer un modèle" (carte avec bord pointillé) | Formulaire de création de nouveau modèle |
| 4 | **[HOVER]** sur la carte "Créer un modèle" | Effet visuel au survol |

---

## 8. Module WebSocket & Temps Réel

### SC-WS-01 : Connexion WebSocket initiale

| # | Action | Résultat attendu |
|---|--------|-----------------|
| 1 | Se connecter à l'application | - |
| 2 | **[VERIFIE]** l'indicateur dans la navbar | Point vert avec animation pulsante = WebSocket connecté |
| 3 | Ouvrir les DevTools > Network > WS | Une connexion WebSocket est active vers `/ws?token=...` |

### SC-WS-02 : Déconnexion et reconnexion WebSocket

| # | Action | Résultat attendu |
|---|--------|-----------------|
| 1 | Couper la connexion internet (mode avion ou désactiver WiFi) | L'indicateur WebSocket passe en rouge/gris (déconnecté) |
| 2 | Réactiver la connexion internet | L'indicateur repasse en vert après quelques secondes (reconnexion automatique avec backoff exponentiel) |

### SC-WS-03 : Réception de nouvelle opportunité en temps réel

| # | Action | Résultat attendu |
|---|--------|-----------------|
| 1 | Être sur la page `/dashboard` ou `/opportunities` | WebSocket connecté |
| 2 | Déclencher un webhook (envoyer un message WhatsApp pertinent dans un groupe monitoré) | - |
| 3 | **[ATTEND]** | Message WebSocket de type `new_opportunity` reçu |
| 4 | **[VERIFIE]** sur le dashboard | La carte "Opportunités (24h)" s'incrémente. L'opportunité apparaît dans la liste récente |
| 5 | **[VERIFIE]** sur la page opportunités | L'opportunité apparaît en haut du tableau |

### SC-WS-04 : Compteur de webhook events

| # | Action | Résultat attendu |
|---|--------|-----------------|
| 1 | Être sur le dashboard | - |
| 2 | Envoyer plusieurs messages dans des groupes monitorés | - |
| 3 | **[VERIFIE]** la carte "Messages Reçus" | Le compteur s'incrémente en temps réel. L'indicateur vert pulse |

### SC-WS-05 : Mise à jour QR code en temps réel (Onboarding)

| # | Action | Résultat attendu |
|---|--------|-----------------|
| 1 | Être à l'étape 3 de l'onboarding (chemin QR) | QR code affiché |
| 2 | **[ATTEND]** expiration du QR | Un nouveau QR code est poussé via WebSocket (`qr_update`). L'image se met à jour automatiquement sans rechargement |

### SC-WS-06 : Mise à jour du statut de connexion WhatsApp

| # | Action | Résultat attendu |
|---|--------|-----------------|
| 1 | Être sur la page de paramètres ou l'onboarding | - |
| 2 | Déconnecter le téléphone de WhatsApp Web | Un message WebSocket `connection_update` est reçu. Le statut passe à "déconnecté" |
| 3 | Reconnecter | Le statut repasse à "connecté" |

---

## 9. Module Webhooks

### SC-WH-01 : Réception d'un webhook WhatsApp (Evolution API)

| # | Action | Résultat attendu |
|---|--------|-----------------|
| 1 | Envoyer un message dans un groupe WhatsApp monitoré contenant des mots-clés du profil utilisateur. Exemple : "Bonjour, je cherche une assurance vie pour ma famille, quelqu'un peut me conseiller ?" | - |
| 2 | **[ATTEND]** le traitement (quelques secondes) | Le webhook est reçu sur `/webhook/whatsapp/{user_id}` |
| 3 | **[VERIFIE]** dans l'application | Une nouvelle opportunité apparaît avec : score > seuil minimum, mots-clés matchés ("assurance vie"), analyse contextuelle de l'IA, réponse suggérée |
| 4 | **[VERIFIE]** les alertes | Si un numéro d'alerte est configuré : message WhatsApp reçu sur le téléphone. Si webhook Slack configuré : message dans le channel Slack |

### SC-WH-02 : Webhook WhatsApp — message sans mots-clés

| # | Action | Résultat attendu |
|---|--------|-----------------|
| 1 | Envoyer un message sans rapport avec le profil : "Salut les gars, c'est quoi le programme ce weekend ?" | - |
| 2 | **[ATTEND]** | Le webhook est reçu et traité |
| 3 | **[VERIFIE]** | Aucune opportunité n'est créée. Le compteur "Messages Reçus" s'incrémente mais pas "Opportunités" |

### SC-WH-03 : Webhook WhatsApp — message dans un groupe NON monitoré

| # | Action | Résultat attendu |
|---|--------|-----------------|
| 1 | Envoyer un message pertinent dans un groupe non monitoré | - |
| 2 | **[ATTEND]** | Le webhook est reçu |
| 3 | **[VERIFIE]** | Le message est ignoré. Aucune opportunité créée. Le compteur de messages de groupes non surveillés peut s'incrémenter |

### SC-WH-04 : Webhook WhatsApp — message privé (pas un groupe)

| # | Action | Résultat attendu |
|---|--------|-----------------|
| 1 | Envoyer un message privé (pas dans un groupe) | - |
| 2 | **[VERIFIE]** | Le message est ignoré silencieusement (pas de traitement des messages privés) |

### SC-WH-05 : Webhook Hub-Spoke

| # | Action | Résultat attendu |
|---|--------|-----------------|
| 1 | Envoyer une requête POST vers `/webhook/hub-spoke` avec signature HMAC valide et un payload contenant un message pertinent | - |
| 2 | **[VERIFIE]** | Le message est traité dans le pipeline. Opportunité créée si le score dépasse le seuil |

### SC-WH-06 : Webhook Hub-Spoke — signature invalide

| # | Action | Résultat attendu |
|---|--------|-----------------|
| 1 | Envoyer un POST vers `/webhook/hub-spoke` avec une signature HMAC incorrecte | - |
| 2 | **[VERIFIE]** | Réponse 401 Unauthorized. Aucun traitement du message |

### SC-WH-07 : Webhook Slack Events

| # | Action | Résultat attendu |
|---|--------|-----------------|
| 1 | Un message est posté dans un channel Slack monitoré | - |
| 2 | Slack envoie un événement à `/webhook/slack/events` | - |
| 3 | **[VERIFIE]** | Le message est traité via le pipeline. Si pertinent, une opportunité est créée |

### SC-WH-08 : Webhook Slack — URL Verification Challenge

| # | Action | Résultat attendu |
|---|--------|-----------------|
| 1 | Slack envoie un challenge `{"type": "url_verification", "challenge": "xyz"}` | - |
| 2 | **[VERIFIE]** | Le serveur répond `{"challenge": "xyz"}` (nécessaire pour activer l'Event Subscription) |

---

## 10. Scénarios Transversaux (E2E)

### SC-E2E-01 : Parcours complet — de l'inscription à la première opportunité

**Description :** Simuler le parcours d'un nouveau client du début à la fin.

| # | Action | Résultat attendu |
|---|--------|-----------------|
| 1 | Ouvrir l'application dans un navigateur en navigation privée | Page de login |
| 2 | **[CLIC]** "Créer un compte" | Page d'inscription |
| 3 | **[SAISIE]** nom, email, mot de passe | - |
| 4 | **[CLIC]** "Créer mon compte" | Redirection vers l'onboarding |
| 5 | **Étape 1 :** Saisir une description métier réaliste + analyser | Mots-clés générés par l'IA |
| 6 | Ajuster les mots-clés si nécessaire | - |
| 7 | **[CLIC]** Continuer | Étape 2 |
| 8 | **Étape 2 :** Saisir numéro WhatsApp + régler le slider à 75% | - |
| 9 | **[CLIC]** Continuer | Étape 3 |
| 10 | **Étape 3 :** Connecter WhatsApp (QR ou instance existante) | WhatsApp connecté |
| 11 | **[CLIC]** Continuer | Étape 4 |
| 12 | **Étape 4 :** Sélectionner 3 groupes à monitorer | 3 groupes sélectionnés |
| 13 | **[CLIC]** Terminer | Redirection vers le dashboard |
| 14 | **[VERIFIE]** le dashboard | 3 groupes monitorés affichés. Compteurs à 0. WebSocket connecté |
| 15 | Depuis un téléphone, envoyer un message pertinent dans un groupe monitoré | - |
| 16 | **[ATTEND]** 5-10 secondes | Le compteur "Messages Reçus" s'incrémente. Une nouvelle opportunité apparaît. Alerte WhatsApp reçue sur le téléphone |
| 17 | **[CLIC]** sur "Détails" de l'opportunité | Panneau de détail avec score, analyse IA, réponse suggérée |
| 18 | **[CLIC]** "Copier la réponse" | Texte copié. Bouton vert "Copié!" |
| 19 | **[CLIC]** "Marquer comme contacté" | Statut mis à jour |

### SC-E2E-02 : Parcours multi-canal — WhatsApp + Slack simultanés

| # | Action | Résultat attendu |
|---|--------|-----------------|
| 1 | Configurer WhatsApp (3 groupes monitorés) | WhatsApp fonctionnel |
| 2 | Connecter Slack via OAuth (paramètres) | Slack connecté |
| 3 | Activer le monitoring sur 2 channels Slack | Channels en écoute |
| 4 | Configurer un webhook Slack pour les alertes | Webhook sauvegardé |
| 5 | Envoyer un message pertinent dans un groupe WhatsApp | Opportunité créée + alerte WhatsApp + alerte Slack |
| 6 | Envoyer un message pertinent dans un channel Slack monitoré | Opportunité créée + alerte Slack |
| 7 | **[VERIFIE]** la page Opportunités | Les opportunités des deux sources apparaissent. Elles sont distinguables par le nom du groupe/channel |

### SC-E2E-03 : Scan historique puis suivi

| # | Action | Résultat attendu |
|---|--------|-----------------|
| 1 | Naviguer vers `/scan` | - |
| 2 | Sélectionner 2 groupes + période "30 jours" | - |
| 3 | Lancer le scan | Progression affichée avec barre et compteurs |
| 4 | **[ATTEND]** la fin du scan | Résumé : X messages scannés, Y correspondances, Z nouveaux contacts |
| 5 | **[CLIC]** "Voir dans Opportunités" | Navigation vers `/opportunities` |
| 6 | **[VERIFIE]** | Les opportunités du scan sont listées avec des dates passées |
| 7 | Filtrer par statut "nouveau" | Toutes les opportunités du scan sont au statut "nouveau" |
| 8 | Pour chaque opportunité intéressante : ouvrir le détail, lire l'analyse, copier la réponse, marquer comme "contacté" | Workflow fluide |
| 9 | Exporter en CSV les opportunités filtrées | Fichier CSV téléchargé avec les bonnes données |

### SC-E2E-04 : Administration complète

| # | Action | Résultat attendu |
|---|--------|-----------------|
| 1 | Se connecter en tant qu'admin | Le lien "Admin" est visible |
| 2 | Naviguer vers `/admin` | Page admin complète |
| 3 | Configurer l'API Evolution : saisir URL + clé + tester | Test réussi, badge vert |
| 4 | Configurer l'API Gemini : saisir clé + sélectionner modèle + tester | Test réussi, badge vert |
| 5 | **[VERIFIE]** l'état du système | Les 4 services sont vert |
| 6 | **[VERIFIE]** la liste des utilisateurs | Tous les utilisateurs sont listés |
| 7 | Bloquer un utilisateur | Statut changé en "Inactif" |
| 8 | Se déconnecter et tenter de se reconnecter avec le compte bloqué | L'accès est refusé |
| 9 | Revenir en admin et débloquer l'utilisateur | L'utilisateur peut se reconnecter |

### SC-E2E-05 : Multi-onglets temps réel

| # | Action | Résultat attendu |
|---|--------|-----------------|
| 1 | Ouvrir l'application dans 2 onglets : un sur `/dashboard`, un sur `/opportunities` | Les deux onglets ont leur WebSocket connecté |
| 2 | Envoyer un message pertinent dans un groupe monitoré | - |
| 3 | **[VERIFIE]** l'onglet Dashboard | Le compteur s'incrémente. L'opportunité apparaît dans la liste récente |
| 4 | **[VERIFIE]** l'onglet Opportunités | L'opportunité apparaît aussi dans le tableau |

---

## 11. Scénarios de Robustesse & Cas Limites

### SC-ROB-01 : Message vide dans un webhook

| # | Action | Résultat attendu |
|---|--------|-----------------|
| 1 | Envoyer un webhook avec un contenu vide `""` ou `" "` | Le message est filtré. Aucune opportunité créée. Pas d'erreur serveur |

### SC-ROB-02 : Message très long (>5000 caractères)

| # | Action | Résultat attendu |
|---|--------|-----------------|
| 1 | Envoyer un message de 5000+ caractères dans un groupe monitoré | Le message est traité normalement. L'extrait dans le tableau des opportunités est tronqué. Le message complet est visible dans le détail |

### SC-ROB-03 : Caractères spéciaux et emojis dans les messages

| # | Action | Résultat attendu |
|---|--------|-----------------|
| 1 | Envoyer un message contenant : emojis (🏠💰), accents (é, è, ê), caractères arabes/chinois, HTML (`<script>alert('xss')</script>`) | Le message est traité sans erreur. Les caractères s'affichent correctement. Le HTML n'est PAS exécuté (pas de XSS) |

### SC-ROB-04 : Double clic sur les boutons d'action

| # | Action | Résultat attendu |
|---|--------|-----------------|
| 1 | **[DOUBLE-CLIC]** rapide sur "Créer mon compte" | Un seul appel API est envoyé (bouton désactivé après le 1er clic) |
| 2 | **[DOUBLE-CLIC]** rapide sur "Lancer le scan" | Un seul scan est lancé |
| 3 | **[DOUBLE-CLIC]** rapide sur "Tester l'alerte" | Un seul message de test est envoyé |

### SC-ROB-05 : Perte de connexion réseau pendant une opération

| # | Action | Résultat attendu |
|---|--------|-----------------|
| 1 | Couper le réseau pendant un scan en cours | Le scan s'interrompt. Un message d'erreur s'affiche. Les résultats partiels sont conservés |
| 2 | Couper le réseau pendant la sauvegarde du profil | Un message d'erreur "Erreur réseau" apparaît. Les données locales ne sont pas corrompues |

### SC-ROB-06 : Rafraîchissement de page pendant l'onboarding

| # | Action | Résultat attendu |
|---|--------|-----------------|
| 1 | Être à l'étape 3 de l'onboarding | - |
| 2 | Appuyer sur F5 (recharger la page) | L'application recharge vers `/onboarding`. Les données des étapes précédentes sont soit conservées (si persistées), soit perdues (l'utilisateur doit recommencer) |

### SC-ROB-07 : Multiples utilisateurs monitorant le même groupe

| # | Action | Résultat attendu |
|---|--------|-----------------|
| 1 | 2 utilisateurs différents monitorent le même groupe WhatsApp | - |
| 2 | Un message pertinent est envoyé dans ce groupe | Les 2 utilisateurs reçoivent chacun leur propre opportunité (scores potentiellement différents selon leurs profils) |

### SC-ROB-08 : Webhook avec payload JSON invalide

| # | Action | Résultat attendu |
|---|--------|-----------------|
| 1 | Envoyer un POST vers `/webhook/whatsapp/{user_id}` avec un body non-JSON | Le serveur retourne une erreur 400 "Invalid JSON". Pas de crash serveur |

### SC-ROB-09 : Token JWT expiré pendant l'utilisation

| # | Action | Résultat attendu |
|---|--------|-----------------|
| 1 | Utiliser l'application normalement jusqu'à expiration du token (7 jours par défaut) | À la prochaine requête API, le serveur retourne 401. L'application déconnecte l'utilisateur et redirige vers `/login` |

### SC-ROB-10 : Responsive design — mobile

| # | Action | Résultat attendu |
|---|--------|-----------------|
| 1 | Ouvrir l'application sur un écran mobile (375px de large) | La navigation s'adapte (hamburger menu ou sidebar). Les cartes du dashboard passent en 1 colonne |
| 2 | Naviguer vers Opportunités | Le split-view s'adapte : tableau pleine largeur. Le détail s'ouvre en overlay ou remplace le tableau |
| 3 | Naviguer vers Paramètres | Les sections s'empilent verticalement. Les formulaires sont utilisables |
| 4 | Naviguer vers Scan | Les 2 colonnes deviennent 1 colonne |

### SC-ROB-11 : Scan avec 0 résultats

| # | Action | Résultat attendu |
|---|--------|-----------------|
| 1 | Lancer un scan sur un groupe qui n'a aucun message contenant des mots-clés | - |
| 2 | **[ATTEND]** la fin du scan | Résumé : X messages scannés, 0 correspondances, 0 nouveaux contacts. Pas d'erreur |

### SC-ROB-12 : Déconnexion WhatsApp puis webhook

| # | Action | Résultat attendu |
|---|--------|-----------------|
| 1 | Déconnecter WhatsApp (ou supprimer la connexion dans les paramètres) | Statut passe à "déconnecté" |
| 2 | Un ancien webhook arrive encore pour cet utilisateur | Le webhook est traité mais le profil/monitoring peut ne plus correspondre. Pas de crash |

### SC-ROB-13 : Navigation rapide entre pages

| # | Action | Résultat attendu |
|---|--------|-----------------|
| 1 | **[CLIC]** rapidement : Dashboard → Opportunités → Scan → Paramètres → Dashboard | Chaque page se charge correctement. Pas de requêtes API orphelines. Pas d'erreur de mémoire |

### SC-ROB-14 : Copier/coller dans tous les champs de saisie

| # | Action | Résultat attendu |
|---|--------|-----------------|
| 1 | Copier/coller du texte dans le champ description profil | Le texte est collé. Le compteur de caractères se met à jour |
| 2 | Copier/coller un numéro dans le champ WhatsApp | Le numéro est collé |
| 3 | Copier/coller une URL dans le champ webhook Slack | L'URL est collée |

### SC-ROB-15 : Message dupliqué (même message envoyé 2 fois)

| # | Action | Résultat attendu |
|---|--------|-----------------|
| 1 | Le même message WhatsApp arrive 2 fois via webhook (retry d'Evolution API) | Un seul message est enregistré en base (ON CONFLICT DO NOTHING). Une seule opportunité est créée |

### SC-ROB-16 : Suppression de mots-clés puis réception de webhook

| # | Action | Résultat attendu |
|---|--------|-----------------|
| 1 | Supprimer tous les mots-clés du profil IA | Profil sauvegardé sans mots-clés |
| 2 | Un message arrive dans un groupe monitoré | Le pipeline de filtrage par mots-clés ne match rien. Aucune opportunité créée (comportement correct : pas de mots-clés = pas de détection) |

---

## Annexe : Matrice de couverture

| Module | Nombre de scénarios | Couverture |
|--------|---------------------|------------|
| Authentification | 9 | Login, Register, Logout, Session, Protection routes |
| Onboarding | 6 | 4 étapes, 2 chemins WhatsApp, cas limites |
| Dashboard | 6 | Stats, filtres, navigation, temps réel, état vide |
| Opportunités | 8 | Liste, détail, statuts, recherche, filtres, export, URL |
| Scan | 6 | Lancement, progression, résumé, annulation, validation |
| Paramètres | 14 | Profil, IA, WhatsApp, Slack, template, groupes, danger |
| Administration | 8 | Config APIs, utilisateurs, état système, notifications |
| WebSocket | 6 | Connexion, reconnexion, événements temps réel |
| Webhooks | 8 | WhatsApp, Hub-Spoke, Slack, validation, cas limites |
| E2E Transversaux | 5 | Parcours complets, multi-canal, multi-onglets |
| Robustesse | 16 | Sécurité, edge cases, responsive, performance |
| **TOTAL** | **92 scénarios** | **Couverture complète** |

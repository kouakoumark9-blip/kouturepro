# KouturePro Enterprise

Application SaaS/PWA de gestion d'atelier de couture, en français et en FCFA, avec vitrine publique par atelier.

## Aperçu

![Page de connexion KouturePro](docs/screenshots/connexion.png)

[Voir l’inscription mobile](docs/screenshots/inscription-mobile.png) · [Voir le tableau de bord après connexion](docs/screenshots/tableau-de-bord.png)

## Essayer en local

```bash
npm install
npm run dev
```

Ouvrir **http://localhost:3000/auth** : choisissez **Connexion** ou **Inscription** avec votre e-mail **ou** votre téléphone et un mot de passe. Une connexion validée ouvre directement **votre propre tableau de bord** ; « Créer un compte » continue avec les quatre étapes d’inscription de l’atelier, puis ouvre son tableau de bord. L'application ne connecte plus automatiquement les visiteurs. Pour tester l’atelier « Atelier Koné » en développement, connectez-vous avec **`demo@kouturepro.test`** et **`Atelier2026!`** (ou la valeur de `DEMO_PASSWORD` si vous l’avez personnalisée). Le compte de démo ne peut pas se connecter en production. La vitrine publique reste accessible sur **http://localhost:3000/atelier-kone**.

### Générer une base de données fictive

```bash
npm run demo:db
DATA_DIR=demo-data npm run dev
```

La commande crée **`demo-data/kouturepro.sqlite`** avec un atelier, des clients, mensurations, commandes, paiements, tissus et membres fictifs. Son fichier **`demo-data/local-secrets.json`** est indispensable pour relire les champs chiffrés : gardez les deux fichiers ensemble. La base existante dans `data/` n'est ni copiée ni modifiée. Cette base de démonstration est réservée au **développement**, et ces fichiers sont exclus de Git ; seul le script de génération est publié.

- `npm test` : test d'API sur une base temporaire et indépendante.
- `npm run test:auth` : parcours navigateur isolé Connexion / Inscription / hors ligne / changement de mot de passe (nécessite Chromium Playwright et `npm run build`).
- `npm run build` : construit le site de production.
- `SERVE_BUILD=1 npm run dev` : sert le build déjà créé avec la démo, sans lancer Vite (pratique sur un petit serveur de test).
- `npm start` : sert le build de production après configuration des secrets ci-dessous.
- `node tests/e2e.mjs` : parcours navigateur facultatif avec Playwright, **modifie les données de la démo** (installer Chromium et ses dépendances Playwright au préalable).

## Parcours déjà utilisables

- Connexion ou inscription par e-mail ou téléphone et mot de passe (hachage bcrypt), puis onboarding en 4 étapes (nom et logo facultatif, localisation, spécialités, plan). Ancien écran de code SMS et entrée automatique dans la démo supprimés.
- Clients, coordonnées chiffrées, mesures chiffrées modifiables, notes vocales chiffrées, rapprochement simple de mesures.
- Commandes, tissu tiré du stock, patron réutilisable, cinq étapes de production, alertes, affectations et commissions par commande.
- Espèces/virement, acomptes, solde, caisse, dépenses, reçus/factures PDF (téléchargement, lien privé valable 7 jours partageable sur WhatsApp) et plans d'épargne individuels.
- Stock, seuils, achats et fournisseurs ; équipe, rôles et plusieurs boutiques. Le propriétaire crée un membre avec un identifiant et un mot de passe initial, à lui communiquer en privé. Chaque membre peut changer son mot de passe dans Paramètres.
- Tableau de bord, statistiques calculées sur les écritures réelles et indicateurs prudents de consommation de tissu.
- Vitrine éditable et publique : galerie, avis, localisation, WhatsApp et demande de rendez-vous. Pages servies avec titre/meta, contenu HTML sans JavaScript, `LocalBusiness` + `Product` JSON-LD, sitemap et canonical.
- PWA installable ; après une première connexion en ligne sur l’appareil, saisies et notes vocales possibles hors ligne via IndexedDB, synchronisation automatique avec détection des conflits de version. Connexion et inscription nécessitent Internet. Le mode « Simuler le mode hors ligne » dans Paramètres permet de tester sans couper internet.

## Activer les services réels

Copier `.env.example` vers `.env` puis remplir les identifiants nécessaires. Le serveur charge automatiquement `.env`.

| Service | Variables | Comportement sans identifiants |
| --- | --- | --- |
| Rappels SMS | `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_FROM` | Les rappels SMS sont désactivés ; la connexion n’utilise pas de code SMS. |
| Mobile money | `CINETPAY_API_KEY`, `CINETPAY_SITE_ID`, `PUBLIC_BASE_URL` | L'encaissement mobile est **désactivé** : aucun faux paiement n'est créé. |
| WhatsApp intégré | `WHATSAPP_ACCESS_TOKEN`, `WHATSAPP_PHONE_ID`, `WHATSAPP_TEMPLATE_NAME` | Le bouton ouvre WhatsApp avec un message prérempli, sans prétendre l'envoyer automatiquement. |

Depuis une commande, « Partager la facture » crée un lien PDF privé signé, consultable sans compte pendant 7 jours. Vous pouvez le copier ou ouvrir WhatsApp avec le lien prérempli ; **ce dernier geste ne l’envoie pas automatiquement**. Si WhatsApp Cloud API est configuré, l’envoi direct du PDF est aussi proposé, sous réserve d’une conversation client active (fenêtre Meta de 24 h) et d’une URL HTTPS publique (`PUBLIC_BASE_URL`) accessible par Meta. Un échec reste signalé comme échec, sans fausse confirmation. Ne transmettez ce lien confidentiel qu’au client concerné. Le flux CinetPay crée une transaction en attente et ouvre son véritable lien de paiement ; le serveur vérifie **montant, devise et statut** auprès du prestataire sur notification ou demande de vérification, avant de marquer le paiement comme reçu. Le guichet propose les opérateurs effectivement activés dans le contrat marchand ; choisir « Wave », « Orange Money » ou « MTN Money » dans l'interface ne garantit pas à lui seul la disponibilité de cet opérateur. Le `PUBLIC_BASE_URL` doit être une URL HTTPS publique joignable pour le webhook. Les rappels SMS/WhatsApp sont programmés pour l'essayage, le retrait et certains soldes impayés, après activation volontaire dans Paramètres et configuration des accès ; un modèle WhatsApp approuvé en français avec 3 variables est nécessaire.

**Important :** une démonstration locale ne peut pas encaisser du vrai mobile money ni envoyer de vrais SMS/WhatsApp sans contrats et secrets marchands. Ces connexions ne sont pas simulées comme réussies.

## Sécurité & exploitation

Les mots de passe sont hachés avec bcrypt et ne sont jamais renvoyés par l’API. Les sessions préexistantes créées avec le code SMS sont invalidées. **Migration :** si un compte créé avant cette mise à jour n’a pas de mot de passe, un administrateur disposant d’un accès au serveur doit exécuter `node server/reset-password.js <e-mail-ou-numéro>` (ou fournir `RESET_PASSWORD` dans son environnement) et transmettre le nouveau mot de passe en privé. Aucun visiteur ne peut s’approprier un ancien compte sur la seule connaissance de son numéro. Pour les membres, le propriétaire peut aussi réinitialiser le mot de passe depuis « Équipe & boutiques ». Cette version ne vérifie pas encore la possession de l’e-mail ou du téléphone lors de l’inscription et ne propose pas de récupération autonome du mot de passe : la réinitialisation d’un propriétaire passe par l’administrateur du serveur.

En production, `APP_ENCRYPTION_KEY` et `SESSION_SECRET` sont obligatoires (deux secrets distincts, par exemple `openssl rand -hex 32`). **Ne perdez pas `APP_ENCRYPTION_KEY`** : elle sert au déchiffrement des mesures, des coordonnées clients et des notes vocales. En développement, une clé locale est créée dans `data/local-secrets.json`. Sessions en cookie HTTP-only/SameSite, séparation des données par atelier, permissions API et protection des écritures contre les formulaires intersites.

SQLite fonctionne en mode WAL avec sauvegarde cohérente **une fois par jour**, conservation des sept dernières copies dans `DATA_DIR/backups/`. Sauvegarder également **hors du serveur** tout `DATA_DIR` (notamment `uploads/` et `public-uploads/`), ainsi que la clé de chiffrement. Placer le service derrière un reverse proxy HTTPS ; protéger l'accès au répertoire de données et ne pas publier `.env`.

## Architecture

- Front : React, Vite, Tailwind CSS, Lucide, polices hébergées localement ; CSS mobile-first, manifest et service worker.
- Back : Express, API REST, SQLite `better-sqlite3`, AES-256-GCM pour les données sensibles, PDFKit.
- Données : `DATA_DIR/kouturepro.sqlite` ; instantanés quotidiens dans `DATA_DIR/backups/`. Les médias publics sont dans `DATA_DIR/public-uploads/`, l'audio privé chiffré dans `DATA_DIR/uploads/`.
- Hors ligne : coque PWA mise en cache, instantané local et file d'écritures IndexedDB ; rejeu dans l'ordre à la reconnexion et choix explicite lorsque deux versions ont été modifiées.

## Périmètre transparent

Le plan Starter/Pro/Business est enregistré, mais l'abonnement SaaS n'encaisse pas encore de facturation récurrente. L'épargne intégrée est **individuelle** et distincte du paiement d'une commande ; une tontine collective réglementée n'est pas mise en place. La prévision de stock utilise la moyenne récente et signale les limites de l'historique, sans annoncer une précision saisonnière non justifiée. Les traductions dioula/baoulé/nouchi ne sont pas incluses dans cette version française.

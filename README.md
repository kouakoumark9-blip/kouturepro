# KouturePro Enterprise

Application d’atelier de couture et portail marchand responsive, en français avec anglais disponible pour les nouveaux marchands. Le site existant est [kouturepro.vercel.app](https://kouturepro.vercel.app), hébergé sur **Vercel**, avec la base PostgreSQL **Neon existante** et Vercel Blob.

> **État au 24 septembre 2026 :** l’ancien espace atelier est en ligne et `/api/health` y signale `database=ready`, mais **le nouveau portail marchand n’est pas encore publié** : `/api/merchant/countries` répond 404 et `/marchands.webmanifest` renvoie du HTML. Le code est préparé localement et testé sur des bases jetables ; voir [VALIDATION_MARCHANDS.md](VALIDATION_MARCHANDS.md). [Voici comment le mettre en ligne dans le projet existant](docs/deploiement-vercel.md). Ne pas interpréter le HTTP 200 de `/marchands` comme une preuve du déploiement.

## Deux espaces, sans suppression des données existantes

- **Atelier actuel `/app` et `/auth` :** dix rubriques (tableau de bord, clients, commandes, production, caisse, stock, équipe, vitrine, statistiques et paramètres), comptes existants, données chiffrées, vitrine publique SEO, PWA et synchronisation hors ligne. Ces comptes et commandes restent dans leurs tables actuelles.
- **Nouveau portail `/marchands` :** inscription par e-mail et mot de passe avec Better Auth, pays/opérateurs configurables, téléphone E.164, devise liée au pays, rôles et invitations manuelles, clients avec consentement WhatsApp/SMS, commandes et liens privés `/pay/[token]` valables 48 h. Le client indique une référence, puis seul le marchand connecté peut confirmer manuellement après contrôle. Paiements **réels mais déclarés manuellement** ; messages WhatsApp/SMS **partagés manuellement**, jamais expédiés par l’application.
- Les tables marchandes sont ajoutées à la base existante de manière additive ; les commandes atelier ne sont **pas** converties automatiquement en commandes marchandes. La suppression des données du compte marchand n’a pas encore son parcours complet. Les anciens raccourcis WhatsApp de l’espace atelier ne disposent pas tous d’une preuve de consentement, contrairement au nouveau portail : clarifier leur traitement avant une mise en conformité globale.

**Aucune clé d’API de paiement, CinetPay, Twilio ou WhatsApp Business n’est nécessaire.** Le mot de passe oublié *automatique par e-mail* fait exception : sans un compte d’envoi et `RESEND_API_KEY` + `RESET_FROM_EMAIL` sur Vercel, cette option est désactivée ; l’inscription et les paiements manuels continuent de fonctionner. Ne pas publier de secrets dans Git ou le chat.

## Essayer localement

Node.js **22** est demandé par `package.json` :

```bash
npm ci
npm run build
SEED_DEMO=0 npm run dev
```

Ouvrir `http://localhost:3000/marchands`. En local, SQLite est utilisé par défaut ; cela **ne migre pas Neon Production**. Pour l’espace atelier existant, ouvrir `/auth`. Une base fictive indépendante existe pour les tests locaux (`npm run demo:db`) et ne doit jamais être importée en Production.

Tests principaux (bases jetables, jamais Production) :

```bash
npm test
npm run test:auth
npm run test:modules
npm run test:responsive
npm run test:merchant-api
npm run test:merchant-ui
npm run test:merchant-pwa
npm run test:merchant-preview
```

Les parcours WebKit acceptent `TEST_WEBKIT=1` et les tests PostgreSQL exigent une URL **loopback** de base `merchant_validation*` dédiée. Le moteur WebKit sous Linux avec profil iPhone ne remplace pas un essai sur un vrai Safari/iPhone ; le service d’e-mail des tests API est **intercepté**, aucun e-mail réel n’est envoyé. Voir [le détail des résultats](VALIDATION_MARCHANDS.md).

## Mettre en ligne sur le site existant

Consulter [docs/deploiement-vercel.md](docs/deploiement-vercel.md) pour télécharger la livraison, pousser les sources sur le dépôt GitHub **existant** `kouakoumark9-blip/kouturepro`, contrôler la branche Neon Preview et la sauvegarde, puis fusionner dans `main` pour déclencher le déploiement du projet Vercel **existant**. Le paquet `kouturepro-marchands-release.zip` (téléchargeable dans l’espace de travail de cette conversation, pas dans Git) est une livraison de **code uniquement**, sans base, secret, build ou données fictives : il faut l’**extraire** dans une copie du dépôt, pas envoyer le ZIP seul à Vercel. Ne pas lancer les fichiers SQL du dossier `database/` manuellement sur Neon Production.

Conserver les secrets Vercel actuels `APP_ENCRYPTION_KEY` et `SESSION_SECRET` : les changer pourrait rendre des données existantes illisibles ou invalider des sessions. Prévoir une sauvegarde restaurable de Neon et des clés ; conserver Vercel Blob lié. Le déploiement ne prouve pas à lui seul la délivrabilité e-mail, l’installation sur iPhone ou le bon fonctionnement du stockage QR sur Blob.

## Architecture

- Interface React, Vite, Tailwind CSS et Lucide, avec manifest/service worker PWA. Portail marchand français/anglais, responsive, file hors ligne IndexedDB chiffrée et indicateur de synchronisation.
- API Express dans la Function Vercel `api/index.js`, PostgreSQL Neon direct en Production, SQLite uniquement pour le développement. Les données sensibles de l’ancien atelier restent chiffrées ; les tables marchandes sont cloisonnées par entreprise et les jetons privés sont hachés.
- Authentification marchande Better Auth, sessions en cookies HttpOnly, mot de passe haché bcrypt, limitations d’essais. Réinitialisation par e-mail uniquement si un expéditeur externe autorisé est configuré. **Ne jamais afficher ou transmettre les mots de passe des utilisateurs.**
- Documents, vitrine publique et dix modules atelier existants conservés ; le guide des anciens modules est dans [docs/modules-base-donnees.md](docs/modules-base-donnees.md). Images de vitrine/QR à valider avec le store Vercel Blob connecté au projet.

Cette livraison n’installe pas automatiquement un moyen d’encaissement : elle affiche le numéro/QR du marchand pour que le client effectue un **vrai paiement hors de l’application**, puis demande une vérification humaine de la référence. Aucun bouton ne doit être interprété comme une confirmation automatique de fonds reçus.

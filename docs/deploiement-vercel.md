# KouturePro — déploiement intégral sur Vercel

> **État au 23 septembre 2026 :** [kouturepro.vercel.app](https://kouturepro.vercel.app) sert l’application sur le projet Vercel `kouturepro`. L’API a renvoyé `database: ready` ; la base Neon directe `neondb` contient **21 tables KouturePro et 0 atelier** après la première mise en service. Le store Blob public `kouturepro-medias` (Paris) a été relié à Production et vérifié par un test d’écriture, lecture et suppression. Les écrans de connexion et d’inscription ont été ouverts en production sans erreur JavaScript. Les parcours avec de vraies données clients et les paiements marchands ne sont pas encore validés. L’URL `vercel.com/.../kouturepro` reste la page d’administration, pas l’adresse publique du SaaS.

## 1. Préparer le projet

- Source : `https://github.com/kouakoumark9-blip/kouturepro`, branche `main`. **Publier les changements de ce dossier** sur cette branche, puis vérifier qu’un nouveau déploiement apparaît dans **Vercel → Deployments**. Le commit initial ne contient pas la migration Vercel.
- Dans **Vercel → Settings → Build and Deployment**, placer **Root Directory** à la racine du dépôt (pas `dist`), utiliser **Vite**, `npm run build` et **Output Directory `dist`**. Le fichier `vercel.json` configure la Function `api/index.js`, les rewrites API/pages et un Cron quotidien. `package.json` épingle **Node.js 22**.
- Un build est nécessaire : il produit l’interface et `dist/pg-worker.mjs`, Worker PostgreSQL autonome inclus dans la Function. Le rendu serveur des vitrines lit aussi `dist/index.html`. Ne pas déployer `dist` seul.

## 2. Configurer PostgreSQL connecté à Vercel

Dans **Settings → Environment Variables** pour l’environnement **Production** :

1. Confirmer que l’intégration Neon/PostgreSQL fournit **`DATABASE_URL_UNPOOLED`**. C’est l’URL **directe**, pas celle dont l’hôte contient `-pooler.`. L’application privilégie cette variable ; elle peut accepter `POSTGRES_URL_NON_POOLING` ou une `DATABASE_URL` non mutualisée. Une URL poolée Neon est refusée car les transactions et le `search_path` du schéma ne sont pas garantis derrière PgBouncer.
2. Le compte PostgreSQL doit pouvoir créer un schéma et des tables. Avant le déploiement, vous pouvez exécuter [database/initialiser-neon.sql](../database/initialiser-neon.sql) dans **Neon → Postgres database → SQL Editor**, après avoir choisi la branche et la base de production : le dernier résultat doit indiquer **21 tables**. Guide : [database/README.md](../database/README.md). Au premier démarrage la Function crée sinon le schéma isolé **`kouturepro`** et ses tables automatiquement, dans une transaction protégée contre les démarrages concurrents. Les URL de Neon Auth et du JWKS ne constituent **pas** une connexion PostgreSQL. **Ne pas supprimer ce schéma** après création de comptes. Prévoir des sauvegardes et tester une restauration avec le fournisseur.
3. Dans **Preview**, utiliser de préférence une **branche de base distincte** (fonction de l’intégration Neon), jamais la base de production pour essayer un déploiement. Les tests locaux automatisés demandent aussi une base PostgreSQL **jetable**, car ils y inscrivent de vrais enregistrements de test.
4. Aucune base SQLite fictive n’est migrée automatiquement. Un nouveau projet démarre vide : le premier propriétaire doit s’inscrire à `/auth` et suivre l’onboarding. Ne pas importer `demo-data/`, `data/` ni `base-fictive-kouturepro.zip` dans la production.

## 3. Configurer Vercel Blob connecté

- Le projet et l’environnement **Production** sont reliés au store Blob **public** `kouturepro-medias` dans la région `cdg1` (Paris), nécessaire aux images de la vitrine. Le SDK utilise le `BLOB_READ_WRITE_TOKEN` injecté dans la Function. Une session CLI locale peut aussi utiliser `BLOB_STORE_ID` + un jeton `VERCEL_OIDC_TOKEN` du **même environnement** ; ne jamais inscrire ces jetons dans le dépôt.
- Les photos de vitrine sont envoyées en Blob public ; seule une URL de photo envoyée **depuis le même atelier** peut ensuite être utilisée dans sa vitrine. Les notes vocales sont **chiffrées AES-256-GCM avant** le stockage Blob ; les octets du Blob ne sont pas un audio lisible. Leur lecture déchiffrée exige une session autorisée auprès de l’API. Pour une isolation stricte des objets eux-mêmes, prévoir un store privé séparé et adapter l’accès aux voix.
- Un test dans une Function de production non promue a exercé `put()`, `get()` et `del()` sur un objet temporaire du store public : **réussi, objet supprimé**. Il reste à tester une photo et une note vocale **via l’interface déployée**, à les relire après actualisation et après un nouveau déploiement. `vercel env pull` masque les valeurs de type Secret ; le test depuis un poste local ne pourra utiliser que des identifiants autorisés de l’environnement correspondant. Si le store est privé ou déconnecté, l’envoi de la photo publique ne fonctionnera pas tel quel.
- Les requêtes d’upload passent par la Function : limite applicative **4 Mio** par image et **3 Mio** par voix ; la limite du corps d’une requête Vercel est d’environ **4,5 Mo** (en-têtes multipart inclus). Pour des fichiers plus volumineux il faudrait basculer vers un upload Blob direct depuis le navigateur avec autorisation serveur.

## 4. Configurer les secrets (Production)

Créer des valeurs **différentes, longues et stables**, par exemple avec `openssl rand -hex 32`. Dans **Vercel → Settings → Environment Variables** :

| Variable | Rôle |
| --- | --- |
| `APP_ENCRYPTION_KEY` | Chiffre mesures, coordonnées clients et notes vocales ; **ne jamais la perdre ni la faire varier entre redéploiements**. |
| `SESSION_SECRET` | Signe les sessions et les liens privés de factures ; la modifier invalide les sessions/liens en cours. |
| `CRON_SECRET` | Protège `/api/cron/reminders` ; Vercel envoie automatiquement `Authorization: Bearer <secret>` quand il appelle le Cron. |
| `PUBLIC_BASE_URL` | Recommandée avec votre domaine HTTPS définitif, sans slash final. En son absence l’application utilise `VERCEL_PROJECT_PRODUCTION_URL` ou `VERCEL_URL` ; l’URL des webhooks de paiement doit être publiquement joignable. |

**Attention aux clés :** `APP_ENCRYPTION_KEY` et `SESSION_SECRET` ont été générées distinctes et enregistrées en tant que Secrets Vercel lors de la première publication. La base ne contenait alors aucun atelier. Comme Vercel masque les valeurs après leur enregistrement, **aucune copie de récupération hors Vercel n’est actuellement garantie**. Avant d’accueillir de vraies données de clients, remplacez la clé de chiffrement dans une base encore vide par une clé conservée dans un coffre-fort indépendant ; ensuite, ne la changez plus sans procédure de rechiffrement des données. Sauvegardez aussi Neon et Blob. `CRON_SECRET` est configuré en Production, mais l’exécution quotidienne reste à observer.

**Ne pas renseigner** `SEED_DEMO=1`, `DATA_DIR`, `USE_POSTGRES=1` ni des identifiants de la base locale dans Production. `VERCEL=1` est défini par la plateforme. Un compte fictif de démonstration est refusé en production.

**Services facultatifs, réellement externes :** `CINETPAY_API_KEY`, `CINETPAY_SITE_ID` pour encaisser via CinetPay (Wave/Orange/MTN seulement si activés sur votre contrat marchand), `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_FROM` pour les SMS, `WHATSAPP_ACCESS_TOKEN`, `WHATSAPP_PHONE_ID`, `WHATSAPP_TEMPLATE_NAME` pour les rappels et l’envoi direct des PDF WhatsApp. Sans ces contrats/secrets, aucun vrai paiement mobile, SMS ni message API n’est prétendu réussi. Pour CinetPay, vérifier en plus la réception du webhook et le changement d’état après vérification serveur du montant, de la devise et du statut.

## 5. Tests préalables reproductibles

Utiliser Node.js **22**, puis, depuis la racine du dépôt :

```bash
npm ci
npm test
npm run build
npm run test:auth
```

Pour couvrir **PostgreSQL**, réserver une base dédiée et **non productive** et exécuter :

```bash
TEST_POSTGRES_URL='postgresql://utilisateur:motdepasse@127.0.0.1:5432/kp_test' npm test
```

Ce test crée deux ateliers et vérifie la persistance après redémarrage, les données chiffrées, le cloisonnement par atelier et la limite de connexion partagée. Le workflow `.github/workflows/ci.yml` lance ces vérifications avec PostgreSQL 17 et Node 22 sur les prochaines publications. Si Chromium Playwright n’est pas installé localement : `npx playwright install chromium` avant `npm run test:auth`.

## 6. Vérifications après déploiement (indispensables)

Remplacer `<domaine>` par l’**URL de production affichée sous Deployments** (et non celle du tableau de bord d’administration `vercel.com/...`) :

1. Ouvrir `https://<domaine>/api/health` : attendre `{"ok":true,"database":"ready",...}`. Si 500/503 : vérifier les logs de la Function, l’URL directe PostgreSQL, les droits et les secrets.
2. Ouvrir `https://<domaine>/auth` sur Android ou à largeur mobile. Créer un **nouveau** compte avec e-mail ou téléphone + mot de passe, achever l’onboarding, puis constater l’ouverture du tableau de bord propre à l’atelier. Se déconnecter, se reconnecter : le tableau de bord doit s’ouvrir directement.
3. Créer un client, une mensuration, une commande et un acompte ; actualiser, fermer/revenir, puis refaire un déploiement et vérifier que les données restent en place. Tester aussi une deuxième inscription pour vérifier l’isolation entre ateliers.
4. Ajouter une photo à la vitrine ; ouvrir sa page publique `https://<domaine>/<slug>` et contrôler l’image, le `LocalBusiness`/`Product` dans le HTML, `robots.txt` et `sitemap.xml`. Ajouter puis relire une note vocale autorisée ; sans connexion, sa route API doit refuser l’accès.
5. Sans l’en-tête secret, `GET /api/cron/reminders` doit retourner **401** ; contrôler ensuite le déclenchement quotidien à **08:00 UTC** dans Vercel et les logs d’envoi seulement si des rappels ont été activés/configurés.
6. Si le paiement réel est activé, tester la redirection vers CinetPay et une transaction sur le compte marchand de test, puis vérifier le webhook et le rapprochement après validation serveur. Ne pas confondre un bouton Wave/Orange/MTN avec un paiement réellement accepté.

Si une étape échoue, **ne pas annoncer la mise en ligne opérationnelle** : corriger, redéployer puis recommencer les vérifications. Les rewrites et le packaging ne sont validés définitivement que par un essai sur Vercel : une simulation locale de la Function a réussi, mais elle ne reproduit pas le CDN et les jetons Vercel réels.

## 7. Exploitation et limites connues

- Le backend PostgreSQL utilise un Worker et un adaptateur synchrone pour conserver l’API métier existante. **Chaque requête SQL attendue bloque la boucle d’événements de la Function**. Un petit atelier/pilote fonctionne, mais une charge simultanée importante demande une refonte asynchrone et des tests de charge. Chaque instance ouvre une connexion directe ; surveiller la limite de connexions et les coûts Neon/Vercel.
- Les uploads et l’authentification exigent une connexion réseau. Après une première connexion, le mode hors ligne permet des saisies locales et une synchronisation au retour du réseau, avec gestion des conflits ; les données non synchronisées restent sur l’appareil tant qu’elles n’ont pas été envoyées.
- Les migrations sont appliquées au démarrage de la Function. Avant toute modification destructive d’un schéma en production, sauvegarder PostgreSQL et prévoir une migration versionnée. Sauvegarder également Blob et les clés de chiffrement **hors de l’environnement Vercel**.
- La réinitialisation autonome du mot de passe propriétaire et la vérification de propriété d’un e-mail/numéro ne sont pas encore fournies. Les fonctionnalités de paiements/notifications nécessitent les contrats fournisseurs réels décrits ci-dessus.

## Documentation des intégrations

- [1](https://vercel.com/docs/frameworks/backend/express) Vercel et Express ; [2](https://vercel.com/docs/project-configuration/vercel-json) configuration et rewrites ; [3](https://vercel.com/docs/functions/runtimes/node-js/node-js-versions) versions Node.js ; [4](https://neon.com/docs/guides/vercel-managed-integration) variables Neon connectées ; [5](https://neon.com/docs/connect/connection-errors) restrictions PgBouncer ; [6](https://vercel.com/docs/vercel-blob/using-blob-sdk) Blob et OIDC ; [7](https://vercel.com/docs/cron-jobs/manage-cron-jobs) protection du Cron ; [8](https://vercel.com/docs/concepts/solutions/file-storage) limites de requête et stockage.

# Mettre KouturePro Marchands en ligne sur le site existant

**Situation au 24 septembre 2026, 11 h 45 UTC :** le portail marchand est déployé sur le projet Vercel **existant** `https://kouturepro.vercel.app` après fusion de la [PR #1](https://github.com/kouakoumark9-blip/kouturepro/pull/1). `/api/health` y répond `database=ready`, `/api/merchant/countries` **200 JSON** avec 16 pays et `/marchands.webmanifest` retourne bien un manifest. Avant publication, la route marchande répondait 404 : c’était l’absence de **notre code serveur**, pas une API externe manquante. Voir [les vérifications et limites](../VALIDATION_MARCHANDS.md).

> Pour les prochains déploiements, conserver la même base Neon Production et une sauvegarde restaurable. Aucun identifiant CinetPay, Twilio ou WhatsApp Business n’est nécessaire : paiements et messages marchands sont manuels. Seul l’envoi *automatique* du courriel de mot de passe oublié nécessite un service d’e-mail configuré.

## 1. Mettre le code dans le dépôt GitHub existant

Le paquet `kouturepro-marchands-release.zip` est téléchargeable depuis l’espace de travail de cette conversation (il n’est pas commité dans Git) ; il contient le **code source**, pas une base de données ou des identifiants. **Il faut extraire les fichiers : envoyer le ZIP tel quel dans GitHub ou Vercel ne met pas l’application à jour.**

Si vous disposez de Git sur votre ordinateur et des droits d’écriture sur `kouakoumark9-blip/kouturepro` :

```bash
git clone https://github.com/kouakoumark9-blip/kouturepro.git
cd kouturepro
git switch -c feature/marchands-v2
# Adapter le chemin du fichier téléchargé à votre ordinateur :
unzip -o /chemin/vers/kouturepro-marchands-release.zip -d .
rm RELEASE_REVISION.txt
npm ci
npm run build
npm test
npm run test:merchant-preview
git add -A
git commit -m "feat: portail marchands et paiements manuels"
git push -u origin feature/marchands-v2
```

Node.js **22** est requis par le projet. Si `git push` demande une connexion, authentifiez-vous dans GitHub avec **votre propre session** ; ne communiquez jamais le mot de passe ou un jeton dans le chat. Ouvrez ensuite une *pull request* de `feature/marchands-v2` vers `main`. Ne la fusionnez pas avant les vérifications ci-dessous. Si l’agent doit le faire à votre place, il lui faut une session d’écriture GitHub et une session Vercel autorisées **dans son environnement**, pas simplement votre connexion sur votre ordinateur.

## 2. Contrôler le projet Vercel existant, sans en créer un second

Dans **Vercel → projet `kouturepro` → Settings → Git**, vérifier que le dépôt ci-dessus est relié et que la branche Production est `main`. Dans **Build and Deployment**, garder la racine du dépôt, le build `npm run build`, le répertoire de sortie `dist`, Node.js 22 et la Function `api/index.js` configurée par `vercel.json`. Une push sur la branche de travail doit créer un déploiement **Preview** ; la fusion dans `main` déclenche ensuite un déploiement **Production** si la liaison Git est active.

Ne testez pas une Preview en la reliant à Neon **Production** : la Function applique les nouvelles migrations additives au premier démarrage et les tests créent des comptes/commandes. Le projet Vercel existant expose les variables Neon **aux deux environnements** ; cette livraison refuse donc par défaut toute connexion PostgreSQL en Preview. Pour ouvrir une Preview fonctionnelle, configurer une **branche de base Neon temporaire distincte** avec ses propres variables Preview, contrôler qu’elles ne ciblent pas Production, puis définir `KP_PREVIEW_DB_CONFIRMED=1` **uniquement en Preview**. Tant que ce contrôle n’est pas fait, une erreur de démarrage de la Preview est intentionnelle et protège Production. Le code utilise l’URL Vercel propre à la Preview pour l’authentification et les liens, même si `PUBLIC_BASE_URL` définit le domaine Production.

## 3. Protéger la base Neon et les secrets existants

Avant de fusionner, vérifier une sauvegarde restaurable de **la base Neon déjà connectée**, identifier l’atelier et les comptes existants et contrôler les éventuelles collisions d’e-mails lors de l’import Better Auth. Les schémas/tables nouveaux sont ajoutés au démarrage : **ne pas exécuter `database/initialiser-neon.sql` ni `database/proposition-marchands-neon.sql` manuellement en Production**. N’importer ni `data/`, ni `demo-data/`, ni les ZIP de bases fictives.

Dans **Vercel → Settings → Environment Variables → Production**, conserver les valeurs déjà utilisées pour :

- `DATABASE_URL_UNPOOLED` : URL PostgreSQL **directe** de la base Neon existante, jamais `-pooler` ; ne pas la montrer dans le chat ;
- `APP_ENCRYPTION_KEY` : **ne jamais remplacer** une clé ayant chiffré des données réelles, sous peine de les rendre illisibles ;
- `SESSION_SECRET` : conserver la valeur existante pour les sessions et liens existants ;
- l’intégration Vercel Blob déjà liée, pour les images de vitrine et les QR hébergés ;
- `PUBLIC_BASE_URL=https://kouturepro.vercel.app` si une origine HTTPS canonique est nécessaire. Vérifier qu’elle n’envoie pas les liens Preview vers Production.

Ne définir **aucune** variable `CINETPAY_*`, `TWILIO_*` ou `WHATSAPP_*` : aucun fournisseur de paiement/messagerie n’est utilisé dans les nouveaux parcours. Ne pas définir `SEED_DEMO=1`, `USE_POSTGRES=1` ou `DATA_DIR` dans Vercel.

Pour le mot de passe oublié par e-mail, un expéditeur vérifié reste nécessaire. En choisissant un service à palier gratuit comme Resend, renseigner `RESEND_API_KEY` et `RESET_FROM_EMAIL` **dans Vercel**, jamais dans Git. Tant qu’ils sont absents, l’inscription, les paiements manuels et les invitations fonctionnent ; **le mot de passe oublié automatique est désactivé**. Ne pas prétendre l’avoir validé en conditions réelles sans un e-mail effectivement reçu.

## 4. Mettre en Production et vérifier

Après vérification de la Preview sur une branche Neon non productive, accord sur la migration additive et sauvegarde de Production, fusionner la pull request dans `main`. Dans **Vercel → Deployments**, attendre un déploiement `Ready` correspondant au nouveau commit, puis vérifier **sur le vrai domaine** :

1. `https://kouturepro.vercel.app/api/health` → HTTP 200 et `database=ready` ;
2. `/api/merchant/countries` → HTTP 200 et **JSON** contenant les pays, au lieu du 404 actuel ;
3. `/marchands.webmanifest` → HTTP 200 avec type **JSON/manifest**, au lieu du HTML actuel ;
4. `/marchands` → inscription/connexion autorisée, devise liée au pays, clients et consentement ;
5. `/pay/[token]` → lien 48 h, référence « J’ai payé », confirmation **uniquement** après vérification manuelle par le marchand connecté ;
6. QR via Blob, essai sur appareils réels, e-mail de récupération seulement si Resend est configuré.

N’ajoutez **aucun compte fictif en Production** pour les essais. Les anciens comptes/commandes restent dans l’espace atelier ; aucune migration destructive vers les nouvelles tables marchandes n’est prévue. La suppression des données du compte marchand et la mise en conformité des anciens raccourcis WhatsApp restent des sujets à traiter avant d’annoncer que toutes les exigences sont achevées.

En cas d’échec, consulter les logs de Function dans Vercel et revenir au déploiement précédent si nécessaire ; **ne supprimer aucun schéma Neon pour “annuler” le code**, les migrations sont additives et les données existantes doivent rester intactes.

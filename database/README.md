# Tables KouturePro dans Neon

**État vérifié le 23 septembre 2026 :** la première requête à l’API déployée sur Vercel a appliqué ce schéma à la base Neon directe `neondb` du projet `kouturepro`. Un contrôle SQL distinct a confirmé **21 tables dans `kouturepro` et 0 atelier** ; aucune base fictive n’a été importée. Les instructions ci-dessous servent à reproduire l’initialisation sur une **autre branche/base**, pas à recréer la Production déjà initialisée.

**À distinguer :** Neon Auth et son URL JWKS servent à l'authentification ; ils ne donnent pas accès à la base PostgreSQL. Le projet KouturePro utilise actuellement sa propre connexion par e-mail **ou** téléphone et mot de passe. Le SQL ci-dessous crée ses tables dans le schéma `kouturepro` d'une **base Neon déjà existante** ; il ne crée pas un nouveau projet Neon, ne modifie pas les tables Neon Auth et ne transfère pas la base fictive vers la production.

## Base réelle : 21 tables, aucune donnée fictive

1. Ouvrir [la console Neon](https://console.neon.tech/), sélectionner **le projet PostgreSQL connecté à KouturePro**, puis **Postgres database → SQL Editor**.
2. Choisir **la branche Production** et **la base utilisée par Vercel** (souvent `neondb`). Confirmer ce choix avant de toucher une base qui contient déjà des données. Si nécessaire, créer au préalable une sauvegarde / branche de restauration.
3. Ouvrir [initialiser-neon.sql](initialiser-neon.sql), **copier tout le contenu** dans l'éditeur SQL, puis cliquer sur **Run**. Le script est transactionnel et idempotent pour un schéma KouturePro de cette version. Il utilise un verrou compatible avec le démarrage simultané de l'API. Il n'efface aucune table et n'insère aucun compte.
4. Lire les deux derniers résultats : **`tables_kouturepro = 21`** et, si c'est vraiment une nouvelle base, **`ateliers_deja_presents = 0`**. Si des données sont déjà présentes, ce second chiffre peut être supérieur à zéro : **ne les supprimez pas**. En cas d'erreur de permissions, arrêter et vérifier que le rôle SQL a le droit de créer un schéma.
5. Dans **Vercel → Settings → Environment Variables**, vérifier que `DATABASE_URL_UNPOOLED` pointe vers **cette même branche et cette même base** ; ne copiez pas cette URL contenant un mot de passe dans le chat ou le dépôt. Sur un déploiement Vercel, l'application appliquerait aussi ce schéma automatiquement au premier démarrage, mais elle n'a pas encore été publiée ni vérifiée en ligne.

Vous pouvez créer une **branche Neon Preview distincte** puis rejouer `initialiser-neon.sql` sur cette branche pour tester sans modifier la Production. Pour générer une nouvelle version du SQL à partir du code de l'application, lancer `npm run db:sql` ; le fichier suit `server/schema.js` et les migrations PostgreSQL utilisées au démarrage.

## Base fictive indépendante

- `base-fictive-kouturepro-postgresql.zip` (à la racine de **cet espace de travail**, non publié sur GitHub) contient une sauvegarde PostgreSQL **réservée au développement local**, avec un guide et une clé de déchiffrement **fictive** ; import et déchiffrement testés sur une base locale séparée. **Ne jamais l'importer dans Neon Production**.
- `base-fictive-kouturepro.zip` (également disponible dans cet espace de travail) contient la version SQLite indépendante.
- Les deux sont des exemples distincts des données de vos futurs clients. Aucun utilisateur de démonstration n'est créé par `initialiser-neon.sql`.

Documentation officielle : [Neon SQL Editor](https://neon.com/docs/get-started/query-with-neon-sql-editor) et [intégration Neon/Vercel](https://neon.com/docs/guides/vercel-managed-integration).

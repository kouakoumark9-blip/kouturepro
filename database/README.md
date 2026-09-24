# Schémas KouturePro dans la base Neon existante

**Situation au 24 septembre 2026, 11 h 45 UTC :** la version marchande a été déployée sur la **base Neon existante** via le projet Vercel existant. `/api/health` répond `database=ready` et `/api/merchant/countries` renvoie **200 JSON** avec 16 pays, ce qui confirme au moins la disponibilité des nouvelles tables de pays. Un accès à un vrai compte marchand et l’intégrité de toutes les commandes privées n’ont **pas** été contrôlés depuis cette session. Ne pas rejouer le SQL d’initialisation directement sur Production.

## Déploiement de la nouvelle version

1. Conserver **la même base Neon Production** et ses variables Vercel ; ne pas créer une nouvelle base Production ni importer de données fictives.
2. Avant de publier, effectuer et tester une sauvegarde restaurable. Contrôler les comptes e-mail existants et les conflits éventuels lors de l’import Better Auth. Les migrations du serveur ajoutent automatiquement les nouveaux schémas et tables au premier démarrage, sous verrou PostgreSQL ; elles ne suppriment pas les comptes, commandes et tables atelier existants.
3. **Ne pas coller ni exécuter `initialiser-neon.sql` ou `proposition-marchands-neon.sql` dans l’éditeur SQL de Neon Production.** Ce sont des références générées/provisoires, pas une opération à répéter sur la base active. Un déploiement de Preview peut utiliser une **branche de base Neon non productive** du même projet avec une URL dédiée.
4. Vérifier après déploiement `/api/health`, `/api/merchant/countries`, les parcours autorisés et les journaux Vercel. Consulter [le guide de déploiement](../docs/deploiement-vercel.md) et [la validation locale](../VALIDATION_MARCHANDS.md).

## Bases fictives

`base-fictive-kouturepro-postgresql.zip`, `base-fictive-kouturepro.zip`, `demo-data/` et `data/` appartiennent au **développement local**. Aucun de ces fichiers ne doit être importé dans Neon Production ou copié dans la livraison Vercel. Les tests PostgreSQL utilisent uniquement `127.0.0.1` et une base jetable nommée `merchant_validation*`.

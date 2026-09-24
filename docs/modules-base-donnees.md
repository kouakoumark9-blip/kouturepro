# KouturePro — rubriques et base de données

**Production :** [kouturepro.vercel.app](https://kouturepro.vercel.app). La base PostgreSQL Neon existante `neondb` comporte le schéma `kouturepro` et **21 tables**. L'API de production s'y connecte (`/api/health` : `database: ready`). Lors du contrôle du 23 septembre 2026, la base ne contenait **aucun atelier fictif**. On utilise cette base existante : **aucune deuxième base n'est créée, aucune table n'est supprimée et aucune donnée de démonstration n'est importée**. Le SQL de référence est [database/initialiser-neon.sql](../database/initialiser-neon.sql).

> Cette page décrit **l’ancien espace atelier** (`/app`), pas le portail `/marchands` publié le 24 septembre 2026. Le chiffre historique de 21 tables ci-dessus date **d’avant** l’ajout des tables marchandes : ne pas l’utiliser comme nombre attendu aujourd’hui. Ne pas exécuter le SQL de référence manuellement sur Production. Voir [le guide actuel](deploiement-vercel.md).

| Rubrique | Adresse après connexion | Tables PostgreSQL utilisées | Ce qui est enregistré ou calculé |
| --- | --- | --- | --- |
| Tableau de bord | `/app` | `orders`, `payments`, `clients`, `fabrics`, `appointments`, `branches` | Indicateurs calculés à partir des paiements **confirmés**, commandes et priorités ; aucune table de chiffres factices. |
| Clients | `/app/clients` | `clients`, `measurements`, `voices`, `orders` | Fiches, coordonnées et mesures chiffrées, notes vocales chiffrées, historique des commandes. |
| Commandes | `/app/orders` | `orders`, `clients`, `patterns`, `payments`, `stock_movements`, `fabrics` | Création, échéances, acompte confirmé, affectation et consommation de tissu. |
| Production | `/app/production` | `orders`, `patterns`, `users` | Cinq étapes enregistrées dans `orders.stage` : mesures, découpe, assemblage, essayage, finition. |
| Paiements & caisse | `/app/payments` | `payments`, `expenses`, `savings_plans`, `savings_contributions`, `orders` | Encaissements, dépenses, épargne et factures PDF ; paiements mobiles **en attente** tant que le prestataire ne les a pas confirmés. |
| Stock & fournisseurs | `/app/stock` | `fabrics`, `suppliers`, `stock_movements`, `expenses` | Inventaire par succursale, seuils, fournisseurs et achats qui ajustent le métrage. |
| Équipe & succursales | `/app/team` | `users`, `branches`, `organizations`, `orders` | Membres, rôles, succursales et répartition des commandes. |
| Vitrine (gestion) | `/app/showcase` | `organizations`, `showcase_items`, `uploaded_images`, `reviews`, `appointments` | Informations publiques, photos dans **Vercel Blob**, avis et demandes de rendez-vous. |
| Statistiques | `/app/stats` | `payments`, `orders`, `clients`, `fabrics`, `stock_movements` | Graphiques et marges **calculés** depuis les écritures de l'atelier, pas depuis une table statique. |
| Paramètres | `/app/settings` | `organizations`, `users`, `reminder_log`, `rate_limits` | Préférences de l'atelier et accès du compte ; limites d'authentification et suivi des rappels côté serveur. |

Les tables de chaque atelier sont filtrées par son `org_id` ; les ressources de plusieurs succursales portent en plus un `branch_id`. Les écritures passent par l'API authentifiée, puis PostgreSQL. Les rôles propriétaire, couturier, comptable et apprenti sont vérifiés **dans l'API**, et les actions non autorisées sont masquées dans l'interface. Les statistiques ne comptent pas les paiements en attente comme encaissés.

**À ne pas confondre :** la base fictive indépendante du dossier local est réservée aux essais ; la production démarre vide et reçoit uniquement les ateliers inscrits par de vrais utilisateurs. Avant des données clients sensibles, sécuriser une copie récupérable de `APP_ENCRYPTION_KEY` hors Vercel et organiser les sauvegardes Neon et Blob. Le simple affichage des options Wave, Orange Money et MTN Money ne prouve pas qu'un contrat marchand actif les autorise.

# Validation du portail marchand — 24 septembre 2026

**Verdict : les parcours locaux fonctionnent sans aucune clé API externe de paiement, WhatsApp, SMS ou e-mail ; la publication et la validation en Production ne sont pas faites.** Les données Neon de Production et le dépôt GitHub distant n’ont pas été modifiés. Les tests ont utilisé des bases jetables SQLite/PostgreSQL et des comptes inventés **uniquement en local**. Sans prestataire d’e-mail, seule la réinitialisation automatique du mot de passe demeure indisponible ; l’inscription et les paiements manuels restent fonctionnels.

## Résultats exécutés

| Contrôle | Résultat | Portée réelle |
|---|---|---|
| `npm run build` ; `npm test` | ✅ Build réussi ; **6 tests réussis, 0 échec, 1 test PostgreSQL opt-in ignoré** dans `npm test`. Avertissement non bloquant sur la taille du bundle. | Build et tests unitaires/intégration locaux. |
| `npm run test:postgres` avec `TEST_POSTGRES_URL=postgresql://postgres@127.0.0.1:55473/merchant_validation` | ✅ **1/1 réussi**, y compris redémarrage et entrée Vercel simulée. | PostgreSQL 17 **local**, pas Neon. Une première tentative simultanée à plusieurs autres tests a expiré au démarrage ; le test isolé a réussi. La durée d’attente de démarrage a été relevée. L’URL est maintenant refusée si elle n’est pas locale et jetable. |
| `npm run test:merchant-api` avec SQLite, puis `TEST_MERCHANT_POSTGRES_URL=postgresql://postgres@127.0.0.1:55473/merchant_validation_api4 npm run test:merchant-api` | ✅ Réussi dans **les deux moteurs**. | Isolation inter-marchands ; consentement et révocation ; téléphone E.164 ; montant/devise ; lien 48 h avec jeton haché ; déclaration puis confirmation authentifiée et journalisée ; invitation à usage unique ; limites de tentatives ; QR en **stockage local SQLite seulement**. |
| `npm run test:merchant-preview` | ✅ Better Auth accepte l’origine de la Preview et ses liens restent en Preview même si `PUBLIC_BASE_URL` indique Production ; **une Preview non explicitement isolée refuse de démarrer avant toute connexion PostgreSQL**. | Simulation **locale**, pas un déploiement Vercel réel. |
| Mot de passe oublié dans ces tests API | ✅ Demande → message Resend **intercepté** → lien et redirection → nouveau mot de passe → ancienne session révoquée → reconnexion. | **Aucun e-mail réel envoyé.** Ne prouve ni domaine vérifié, ni délivrabilité, ni variables Vercel. |
| `npm run test:merchant-ui` ; `TEST_WEBKIT=1 npm run test:merchant-ui` | ✅ Parcours sur Chromium Android et **WebKit avec profil utilisateur iPhone** : inscription Ghana, devise GHS, client +225 consenti, commande et `/pay/[token]`, partage manuel, paiement à vérifier puis payé, synchronisation hors ligne, invitation et permissions. Bascule FR/EN vérifiée. | Navigateurs automatisés sur Linux, **pas Safari sur iPhone physique**. |
| `npm run test:merchant-pwa` ; `TEST_WEBKIT=1 npm run test:merchant-pwa` | ✅ Service worker actif ; manifest marchand avec démarrage `/marchands` ; aucune réponse de paiement, invitation, reset ou API dans le cache ; bouton d’installation absent pour un visiteur non connecté. Le shell s’ouvre hors ligne sous Chromium. | Sous WebKit Linux, la navigation hors ligne plante dans le navigateur de test : seuls le cache et le manifest ont pu être vérifiés. Installation réelle Android/iOS non vérifiée. |
| `npm run test:auth` ; `npm run test:modules` ; `npm run test:responsive` et `TEST_WEBKIT=1 npm run test:responsive` | ✅ Ancien espace : authentification, dix rubriques, commandes, vitrine et affichages de 320 à 1440 px. | Régressions locales : anciennes données non supprimées. Une exécution WebKit simultanée a dépassé le délai sur un dialogue ; la relance isolée a couvert **les 6 tailles sans échec**. |

**Environnement :** Node local 20.20.2 alors que `package.json` demande Node 22 ; le comportement exact du runtime Node 22 de Vercel n’est donc pas attesté par ces tests. `RESEND_API_KEY` et `RESET_FROM_EMAIL` sont documentés dans `.env.example` mais non renseignés ici. Aucun appel à un prestataire de paiement ou de messagerie n’est requis pour les nouveaux paiements manuels.

## Contrôle Production, en lecture seule

- `https://kouturepro.vercel.app/api/health` : HTTP 200, `ok=true`, `database=ready` **pour l’application déjà déployée**. Le sitemap public liste actuellement **12 ateliers hors démo** : il faut préserver les comptes et commandes existants et confirmer une sauvegarde avant migration.
- `/api/merchant/countries` : **HTTP 404** ; le nouvel endpoint n’est pas en ligne.
- `/marchands.webmanifest` : HTTP 200 **mais `text/html`, pas un manifest JSON** (repli sur le shell existant).
- `/marchands` : HTTP 200 HTML, mais ce code HTML ne prouve pas l’existence du nouveau portail.
- GitHub `main` distant : `14afa162cde1799ac8f2709e426f048b1362b6fe`. Les nouveautés sont sur la branche locale `feature/marchands-v2`, non publiées sur GitHub ; `database/initialiser-neon.sql` n’a **pas** été exécuté sur Neon Production.

**Conclusion Production :** aucune preuve que le portail, ses tables, ses routes ou sa PWA y fonctionnent ; ils ne sont pas publiés. Le bon état du `/api/health` existant ne valide pas les nouveautés.

## Blocages et décisions avant lancement

1. **Accès autorisés GitHub/Vercel** : reconnecter une session de déploiement ; ne pas communiquer de secrets dans le chat. Vérifier d’abord une sauvegarde et les collisions éventuelles entre comptes existants et comptes Better Auth ; appliquer seulement les migrations additives sur la base Neon **existante**, sans jeu de données de démonstration. Tester le déploiement puis `/api/merchant/countries` et le manifest avec leurs vrais types de contenu.
2. **E-mail réel** : créer/configurer le compte Resend, vérifier le domaine, puis définir `RESEND_API_KEY` et `RESET_FROM_EMAIL` dans Vercel. Contrôler un reset vers une boîte autorisée ; le test mocké ne remplace pas cet essai.
3. **Appareils et stockage hébergé** : faire l’essai sur Safari/iPhone physique (installation PWA et retour en ligne), Android physique si possible, et contrôler le téléversement/lecture des QR avec le Vercel Blob réellement lié au projet. Sans cela, la validation est partielle.
4. **Périmètre fonctionnel encore ouvert** : l’option demandée de **suppression des données du compte marchand** n’a pas encore son parcours complet. Les anciens modules d’atelier restent distincts : leurs commandes ne sont pas migrées vers les nouvelles tables marchandes ; leurs anciens raccourcis WhatsApp n’ont pas la preuve de consentement exigée pour les **nouveaux** clients marchands. Clarifier avant toute conversion/destruction de données existantes ou mise en conformité globale de l’ancien espace.

Ne pas présenter les résultats simulés comme un envoi d’e-mail, un paiement bancaire réellement encaissé, une installation iOS réelle ou un déploiement Neon/Vercel achevé. Pour reproduire localement, les commandes `test:merchant-*` figurent dans `package.json` ; les commandes PostgreSQL exigent exclusivement une base jetable en loopback.

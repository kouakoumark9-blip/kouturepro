# Livraison du portail marchand — sans API de paiement ni de messagerie

**État au 24 septembre 2026, 11 h 45 UTC : code publié sur le site existant.** Le 404 de `/api/merchant/countries` constaté avant déploiement a disparu : l’endpoint renvoie désormais **200 JSON** avec 16 pays. Ce n’était **pas** une clé API externe à ajouter. Les paiements sont déclarés/confirmés manuellement et les messages WhatsApp/SMS sont partagés manuellement. L’inscription, les commandes et les liens de paiement ont été testés sans clés externes **en local**, pas avec un compte fictif Production.

## Contenu du paquet `kouturepro-marchands-release.zip`

Sources de l’application actuelle et nouvelle, scripts et tests, configuration Vercel et exemple de variables. **Aucun** `.env`, jeton, base de données, `node_modules`, build local ni jeu de données de démonstration. Le fichier SQL présent est documentaire : **ne pas lancer `database/initialiser-neon.sql` manuellement en Production**.

## Publication sécurisée dans les services existants

1. Un propriétaire autorise une session GitHub ayant le droit de pousser vers `kouakoumark9-blip/kouturepro`, ainsi qu’une session Vercel ayant accès au projet déjà lié. Un accès public en lecture seule ne suffit pas. Ne pas transmettre de mots de passe, jetons ou URL Neon dans le chat.
2. Vérifier une sauvegarde récente de la **base Neon existante**, les comptes et schémas avant démarrage du nouveau code. Les nouvelles tables/schéma d’authentification sont créés automatiquement et de manière additive au démarrage ; l’import des comptes e-mail existants doit être contrôlé pour éviter toute collision. Ne pas importer de données fictives en Production.
3. Sur une branche de publication, vérifier avec Node 22 : `npm ci`, `npm run build`, `npm test`, `npm run test:merchant-api`, `npm run test:merchant-ui`. Les essais PostgreSQL et WebKit figurent dans `VALIDATION_MARCHANDS.md` et doivent utiliser exclusivement les bases locales jetables.
4. Déployer avec le projet Vercel et l’intégration GitHub **existants**, après accord sur le risque de migration additive. **Attention : les variables Neon actuelles couvrent Preview et Production.** Cette version bloque donc le démarrage d’une Preview tant qu’une branche Neon isolée et ses propres variables n’ont pas été vérifiées et que `KP_PREVIEW_DB_CONFIRMED=1` n’a pas été défini **uniquement pour Preview**. Réutiliser les variables Neon et les secrets de session/chiffrement déjà enregistrés pour Production ; n’ajouter **aucune** clé CinetPay/Twilio/WhatsApp. Ne pas tester avec une base fictive en Production.
5. Après déploiement, vérifier que `/api/health` renvoie `database=ready`, que `/api/merchant/countries` renvoie HTTP 200 JSON, que `/marchands.webmanifest` renvoie un manifest JSON et faire le parcours avec un compte autorisé et des données réelles/consenties.

## Exception indispensable : e-mail de récupération

Sans expéditeur configuré, **seul le mot de passe oublié par e-mail est désactivé** ; les autres parcours fonctionnent. Aucun service ne peut expédier et authentifier automatiquement un e-mail sans compte, domaine/expéditeur autorisé et secret SMTP ou clé de service. L’option prévue est un prestataire à palier gratuit tel que Resend : créer le compte, vérifier le domaine et renseigner `RESEND_API_KEY` et `RESET_FROM_EMAIL` dans Vercel (pas dans Git). Si aucun prestataire n’est souhaité, il faut approuver explicitement une autre politique de récupération des comptes avant de promettre cette fonction.

## Limites restantes

Le stockage Vercel Blob réel, l’envoi réel de l’e-mail et l’installation sur un iPhone physique ne sont pas validés. Le parcours de suppression des données du compte marchand n’est pas terminé. Les anciennes commandes d’atelier restent dans leur espace existant, sans migration destructive vers les tables marchandes. **Le déploiement est achevé, mais la validation fonctionnelle réelle reste partielle.**

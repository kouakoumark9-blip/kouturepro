# État du portail marchand — 24 septembre 2026

**Mis en ligne sur [kouturepro.vercel.app](https://kouturepro.vercel.app) à 11 h 45 UTC**, après demande explicite de publication et confirmation par le propriétaire qu’une sauvegarde Neon restaurable existe. La pull request [#1](https://github.com/kouakoumark9-blip/kouturepro/pull/1) est fusionnée dans `main` au commit `164dd957c5c4c089c9f099bdb3a04f27695fb651` ; déploiement Vercel Production `dpl_7mcADTcuUgWfunSRtYUDyohYwpKT` **Ready**. Les nouveaux schémas sont ajoutés au démarrage sur la base Neon existante : **aucun SQL provisoire lancé manuellement et aucune base fictive importée**.

**Ne pas confondre mise en ligne et validation complète :** les parcours connectés avec un vrai compte marchand sur Vercel, un e-mail réellement reçu, le QR sur Blob et l’installation sur un iPhone physique restent à vérifier. La suppression intégrale des données du compte marchand n’est pas encore développée.

## Vérifications Production réalisées après publication

| Point | Résultat |
| --- | --- |
| `/api/health` | HTTP **200**, `ok=true`, `database=ready` sur le nouveau déploiement. |
| `/api/merchant/countries` | HTTP **200 JSON**, **16 pays** ; avant publication cette route répondait 404. `reset_email_available=false` : aucun expéditeur de récupération n’est configuré. |
| `/marchands.webmanifest` | HTTP **200**, `application/manifest+json`, `start_url=/marchands` ; avant publication l’URL retournait du HTML. |
| `/marchands` | HTTP **200**, `Cache-Control: private, no-store` et `noindex`. Chromium mobile et WebKit avec profil iPhone affichent connexion, inscription, 16 pays, sans erreur JavaScript ni débordement à 390 px. Aucun compte fictif créé en Production. |
| Autorisations et ancien espace | `/api/merchant/me` sans session → **401** ; lien de paiement factice → **404** ; Better Auth rejette une adresse e-mail invalide → **400** ; ancien `/api/bootstrap` sans session → **401** et `/auth` → **200**. |
| Ateliers déjà publiés | Le sitemap énumère toujours **12 ateliers hors démo** avant et après déploiement. Une vitrine ancienne répond **200** avec `LocalBusiness` et canonical. Cela ne suffit pas, seul, à garantir chaque compte ou commande privée : essai connecté/contrôle de sauvegarde toujours recommandé. |
| GitHub / Vercel | CI GitHub Node **22** avec SQLite et PostgreSQL locale : **7/7 tests réussis** après correction du nom de la base jetable du CI. Build Vercel sur Node 22 (déterminé par `engines`) réussi. |

## Validations locales complémentaires

- `npm run build` et `npm test` : réussis ; lorsque l’URL PostgreSQL est absente, 6 tests réussissent et le test externe est ignoré. Avec la base locale `kp_test` (comme dans GitHub Actions) : **7/7 réussis**.
- API marchande sur SQLite et PostgreSQL 17 **local**, base jetable `merchant_validation_api4` : consentement, isolation, devises, jetons hachés et liens 48 h, paiement déclaré puis confirmé/journalisé par utilisateur authentifié, invitations uniques et limites de tentatives. QR testé en stockage SQLite local **uniquement**.
- Navigateur marchand Chromium et WebKit avec profil iPhone : inscription Ghana, client CI consenti, commandes GHS, paiement manuel, langues FR/EN, file hors ligne et synchronisation, invitations/personnel. Ancien espace testé à 320–1440 px. Le profil WebKit Linux **n’est pas Safari sur un iPhone physique**.
- Service worker et manifest : cache sans données des liens de paiement, invitation, reset ou API ; coque hors ligne vérifiée sous Chromium. Une navigation hors ligne sous Playwright WebKit Linux provoque une erreur interne du navigateur de test, pas une validation sur appareil réel.
- Réinitialisation : parcours complet avec **Resend intercepté sans e-mail sortant**, nouvelle connexion réussie et ancienne session révoquée. Sans `RESEND_API_KEY` et `RESET_FROM_EMAIL` réels, le mot de passe oublié automatique reste **désactivé** en Production.

## Conditions et limites du déploiement

Le projet Vercel partage des variables Neon entre Preview et Production. La Preview a été **construite**, mais bloque volontairement toute connexion PostgreSQL tant qu’une branche Neon isolée n’est pas configurée, pour éviter d’écrire des données d’essai dans Production. **À la nouvelle demande explicite de publier immédiatement**, la Production a été déployée après confirmation d’une sauvegarde par le propriétaire, sans essai connecté sur une Preview Neon. La sauvegarde n’a pas pu être vérifiée depuis cet environnement.

Les paiements sont réels mais **réalisés hors de l’application** sur le numéro/QR du marchand, déclarés par le client et confirmés **manuellement** par le marchand. Aucun fournisseur CinetPay, Twilio ou WhatsApp Business n’est requis ou appelé par les nouveaux parcours. L’émission automatique de courrier de récupération demande un service d’e-mail autorisé ; il est absent. Le QR via Vercel Blob, la délivrabilité Resend et Safari/iPhone physique demandent un essai réel.

Les anciens comptes/commandes restent dans l’espace atelier existant ; ils ne sont pas convertis automatiquement en commandes marchandes. Les anciens raccourcis WhatsApp de cet espace n’ont pas tous une preuve de consentement. Le parcours de **suppression des données d’un compte marchand** est encore à construire. Ne pas déclarer que toutes les exigences sont achevées sur la seule base des contrôles de santé et des formulaires publics.

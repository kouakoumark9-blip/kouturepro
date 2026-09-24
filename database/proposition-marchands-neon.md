# Proposition de schéma Neon — marchands d’Afrique de l’Ouest

**État : proposition, non appliquée.** Aucune requête n’a été exécutée sur Neon et aucune donnée, aucun compte ni paiement existant n’a été modifié. Le dépôt actuel est KouturePro (ateliers de couture) : sa base PostgreSQL possède déjà `kouturepro.organizations`, `users`, `clients`, `orders`, `payments` et une authentification maison. Le nouveau cahier des charges impose Better Auth ou Auth.js, une inscription différente et l’absence d’API de paiement/messagerie ; il faut confirmer s’il remplace ce produit ou constitue une nouvelle application avant de migrer des comptes réels.

## Organisation de la base

Proposition : conserver **la même base Neon**, mais préparer le modèle cible dans un espace logique `commerce` (pas un nouveau projet ni une nouvelle base) pour éviter toute collision avec les tables en production. Si le choix est de transformer KouturePro, une migration progressive rapprochera ce modèle des données de `kouturepro`, sans supprimer les anciennes tables ni importer la démo. L’authentification Better Auth générera et gérera ses **propres tables** `user`, `session`, `account`, `verification` avec sa version épinglée et ses migrations officielles ; ne pas inventer ni modifier à la main sa structure interne [1](https://better-auth.com/docs/concepts/database). Better Auth s’intègre à Express en montant son gestionnaire **avant** le parseur JSON [1](https://better-auth.com/docs/integrations/express).

### Référentiels globaux (sans marchand_id)

| Table | Champs essentiels | Règles |
|---|---|---|
| `countries` | `iso2` PK, `name_fr`, `name_en`, `flag_emoji`, `dial_code`, `currency_code`, `currency_decimals`, `is_active` | Référentiel **en base**, administrable sans redéploiement ; ISO unique, indicatif `+…`, 0 décimale pour XOF et GNF. Les marchands choisissent leur pays, sans pouvoir changer la devise ou l’indicatif de tous les autres. |
| `operators` | `code` PK, `display_name`, `kind` (`mobile_money` ou `bank_transfer`), `is_active` | Catalogue modifiable : Orange Money, Moov Money, MTN MoMo, Wave, Telecel Cash, AirtelTigo Money, OPay, PalmPay, virement bancaire. |
| `country_operators` | (`country_iso2`, `operator_code`) PK, `suggested`, `is_active` | Propositions **par pays**, éditables en base ; ne présument pas qu’un opérateur accepte techniquement des paiements ou est présent partout. Le marchand active seulement les moyens qu’il possède effectivement. |

**16 pays de départ à insérer en base** (le SQL propose des associations initiales par pays : par exemple Orange/Moov/MTN/Wave en CI, MTN/Telecel/AirtelTigo au Ghana, OPay/PalmPay au Nigeria et virement bancaire partout). Ces associations sont **indicatives, à confirmer localement** avant activation ; `country_operators` reste configurable, y compris pour les pays qui commencent uniquement avec le virement :

| Pays (ISO) | Indicatif | Devise | Décimales affichées |
|---|---|---|---:|
| Côte d’Ivoire CI | +225 | XOF | 0 |
| Sénégal SN | +221 | XOF | 0 |
| Mali ML | +223 | XOF | 0 |
| Burkina Faso BF | +226 | XOF | 0 |
| Bénin BJ | +229 | XOF | 0 |
| Togo TG | +228 | XOF | 0 |
| Niger NE | +227 | XOF | 0 |
| Guinée-Bissau GW | +245 | XOF | 0 |
| Ghana GH | +233 | GHS | 2 |
| Nigeria NG | +234 | NGN | 2 |
| Guinée GN | +224 | GNF | 0 |
| Liberia LR | +231 | LRD | 2 |
| Sierra Leone SL | +232 | SLE | 2 |
| Gambie GM | +220 | GMD | 2 |
| Cap-Vert CV | +238 | CVE | 2 |
| Mauritanie MR | +222 | MRU | 2 |

SLE correspond au leone actuel ; l’ancien code SLL ne doit pas être mis par défaut [3](https://spec.edmcouncil.org/fibo/ontology/FND/Accounting/ISO4217-CurrencyCodes/SLE?version=master%2F2026Q1). Les montants sont stockés en **unités mineures entières** (`BIGINT`) et rendus par `Intl.NumberFormat` selon la devise et la langue ; aucune hypothèse « tous les prix sont en FCFA ».

### Tables rattachées à un marchand

`merchant_id` figure dans **chaque** table métier ci-dessous. Toutes les relations entre deux ressources d’un marchand utilisent des clés étrangères composées, par exemple `(merchant_id, client_id) → clients(merchant_id, id)` : une commande d’un marchand ne peut pas désigner le client d’un autre.

| Table | Champs essentiels | Contraintes / comportement |
|---|---|---|
| `merchants` | `id` UUID PK, `business_name`, `country_iso2` FK, `locale` (`fr`/`en`), `created_at`, `updated_at` | Le pays choisi à l’inscription détermine indicatif et devise initiaux. Changer le pays ne réécrit pas les devises des anciennes commandes. |
| `merchant_users` | `id`, `merchant_id`, `auth_user_id`, `role` (`marchand`/`personnel`), `is_active`, `joined_at` | Lien vers le compte Better Auth ; un marchand propriétaire actif au maximum par entreprise ; un personnel désactivé perd l’accès à la prochaine requête. Le mot de passe n’est **jamais** dans cette table. |
| `invitations` | `id`, `merchant_id`, `email`, `token_hash`, `created_by`, `expires_at`, `used_at`, `revoked_at` | Lien aléatoire à usage unique, hash stocké seulement ; invitation copiée/partagée manuellement, sans e-mail automatique. |
| `clients` | `id`, `merchant_id`, `name`, `country_iso2`, `phone_e164`, `notes`, `consent_whatsapp_sms`, `consent_recorded_at`, `consent_revoked_at`, `created_at` | Pays du téléphone modifiable par client ; numéro validé par **libphonenumber-js**, puis vérifié à nouveau au serveur et stocké en E.164. Recherche nom/numéro limitée au marchand. Consentement horodaté et révocable ; boutons d’envoi interdits si absent/révoqué. |
| `payment_settings` | `id`, `merchant_id`, `country_iso2`, `operator_code` (ou libellé personnalisé), `enabled`, `destination_phone_e164`, `bank_instructions`, `qr_blob_key`, `updated_at` | Moyens activés et coordonnées saisis par le propriétaire ; QR dans Vercel Blob, référence seulement dans Neon. Prévoir un opérateur personnalisé propre au marchand, jamais ajouter son libellé aux autres comptes. |
| `orders` | `id`, `merchant_id`, `client_id`, `amount_minor`, `currency_code`, `country_iso2`, `payment_status`, `created_by`, `created_at`, `updated_at` | `payment_status` ∈ `pending`, `review`, `paid`, `cancelled`. Devise photographiée à la création. Si intégration à KouturePro, **ne pas remplacer** `orders.status` (production) : ajouter un statut de paiement distinct. |
| `payment_links` | `id`, `merchant_id`, `order_id`, `token_hash`, `created_at`, `expires_at`, `revoked_at` | Token tiré de **32 octets** aléatoires (`base64url`, ≥ 32 caractères) ; seul son SHA-256 est enregistré. Expiration par défaut à 48 h ; plusieurs liens historiques possibles mais liens expirés/révoqués invalides. |
| `payment_claims` | `id`, `merchant_id`, `order_id`, `payment_link_id`, `transaction_reference`, `submitted_at` | Déclaration « J’ai payé » depuis `/pay/[token]` : crée une réclamation et place la commande en `review`, **jamais en `paid`**. Référence et doublons validés/limités côté serveur. |
| `payment_events` | `id`, `merchant_id`, `order_id`, `action`, `actor_user_id` (nullable pour client), `actor_role`, `reference_snapshot`, `previous_status`, `new_status`, `created_at` | Journal append-only : auteur, instant, référence. « Marquer comme payé » + entrée dans le journal sont atomiques dans **une transaction serveur** avec utilisateur connecté. |
| `message_templates` | (`merchant_id`, `locale`, `kind`) PK, `body`, `updated_at` | Textes modifiables : `payment_link` et `payment_confirmed`, en français et anglais. Variables autorisées limitées et encodées pour les liens. |

**Index** : `(merchant_id, lower(name))` et `(merchant_id, phone_e164)` pour les clients ; `(merchant_id, payment_status, created_at DESC)` pour les commandes ; unicité du `payment_links.token_hash` et de `invitations.token_hash`. Les références au marchand, client, commande, lien et membre doivent aussi posséder des index/contraintes de clé étrangère adaptés.

Extraits SQL de contraintes à inclure dans la migration définitive (illustratifs, **non exécutés**) :

```sql
-- Sur clients et numéros de réception mobile ; libphonenumber-js valide en plus
-- les longueurs et règles propres au pays avant insertion.
CHECK (phone_e164 ~ '^\+[1-9][0-9]{1,14}$')

-- orders : la paire (merchant_id, id) est UNIQUE et la paire ci-dessous
-- interdit de rattacher un client d’un autre marchand.
FOREIGN KEY (merchant_id, client_id)
  REFERENCES commerce.clients (merchant_id, id)

-- payment_links : token_hash CHAR(64) UNIQUE ; on ne stocke pas le token URL.
CHECK (expires_at > created_at
   AND expires_at <= created_at + INTERVAL '48 hours')
```

## Isolation, rôles et parcours sensibles

- Better Auth gère inscription e-mail/mot de passe, sessions en cookies `httpOnly` / `Secure` en production, déconnexion, hash des mots de passe et réinitialisation. **Seul** le mot de passe oublié déclenche un e-mail automatique, via un fournisseur d’e-mail à palier gratuit à configurer. L’envoi doit être fiable sur Vercel (ne pas lancer un `Promise` non attendu qui sera interrompu par la fin de la Function). L’option `sendResetPassword` est prévue par Better Auth [1](https://better-auth.com/docs/authentication/email-password).
- Inscription en **une opération guidée** : nom, entreprise, pays, téléphone E.164 avec drapeau et indicatif, e-mail, mot de passe. Ne pas réutiliser automatiquement les anciens hachages/sessions sans protocole de migration éprouvé. Lien d’invitation à usage unique pour le personnel ; propriétaire seulement pour pays de son entreprise, opérateurs, coordonnées de paiement et membres.
- Requêtes métier toujours filtrées par `merchant_id` issu de la **session vérifiée**, jamais de l’identifiant envoyé par le navigateur ; clés étrangères composées et politiques PostgreSQL RLS (`merchant_id = current_setting('app.merchant_id', true)::uuid`) en défense supplémentaire, avec `SET LOCAL` **dans une transaction** pour éviter toute fuite entre connexions Neon réutilisées. La route publique `/pay/[token]` passe par un service restreint ne lisant que le lien haché et les champs nécessaires : nom de l’entreprise, montant/devise et méthodes activées, **pas** le carnet de clients.
- La page publique peut déclarer une référence et passer à `review`, sous limitation de débit par IP et token ; elle ne possède aucune action pour écrire `paid`. La transition `review → paid` n’existe que dans une route authentifiée, autorisée et journalisée. Un clic « J’ai payé » n’est **pas** une preuve de paiement ; vérification humaine indispensable.
- Aucun CinetPay ni API WhatsApp/SMS, aucun envoi automatique de messages. Après consentement, un clic **explicite** ouvre `https://wa.me/${phoneE164.slice(1)}?text=${encodeURIComponent(message)}` ou `sms:${phoneE164}?body=${encodeURIComponent(message)}` ; l’utilisateur appuie lui-même sur Envoyer. Sur ordinateur, proposer aussi « Copier le texte / le lien » lorsque le protocole SMS n’est pas disponible.
- Ne jamais journaliser les tokens bruts ; limiter la durée de vie, révoquer au besoin, répondre en `Cache-Control: no-store` et `Referrer-Policy: no-referrer` sur `/pay/*`. Suppression du compte : révocation des sessions/liens/invitations, suppression transactionnelle des données de ce marchand et des QR Blob associés ; expliquer le traitement des sauvegardes et les éventuelles obligations légales de conservation.

## Construction étape par étape (après accord sur le périmètre)

1. **Pays et inscription** : créer branche Neon de test, sauvegarde préalable, migrations pays/catalogue + Better Auth officiel, i18n `fr`/`en`, sélecteur téléphonique libphonenumber-js et création du marchand sans données fictives. Tester pays, isolation, connexion/déconnexion et reset e-mail (avec vrai fournisseur de test et secret Vercel, pas en Production au premier essai).
2. **Paramètres de paiement** : propriétaires seuls, activation des opérateurs de leur pays, numéro destinataire et QR Vercel Blob ; vérifications de lecture/écriture entre marchands et de permissions du personnel.
3. **Clients et commandes** : E.164, recherche, consentement horodaté, choix/création de client, devise du pays et paiement en attente. Ne pas confondre suivi d’une commande de couture et état du paiement si l’ancien produit est conservé.
4. **Liens et messages manuels** : tokens hachés de 48 h, page `/pay/[token]`, WhatsApp/SMS par ouverture locale, deux modèles modifiables, limitation de débit ; tester expiration, révocation, doublons et absence d’API de messagerie/paiement.
5. **Validation manuelle** : « J’ai payé » → à vérifier ; membre autorisé → payée avec référence, auteur et date en transaction ; confirmation WhatsApp/SMS toujours manuelle ; tests de concurrence et d’accès non autorisé.
6. **PWA et finition** : réutiliser/adapter manifest et service worker existants, bouton « Télécharger maintenant » piloté par `beforeinstallprompt` sur Android/Chrome, masquer en mode standalone ; sur Safari iPhone expliquer « Partager → Sur l’écran d’accueil ». Vérifier en vraie navigation mobile, tablette et ordinateur, avec l’interface entièrement traduite.

La [proposition SQL détaillée](proposition-marchands-neon.sql) contient le DDL, les 16 pays, le catalogue des 9 moyens et des politiques RLS de base. **Elle n’est pas une migration de production** : il reste notamment à générer les tables Better Auth, créer le rôle SQL non propriétaire, encadrer les modifications réservées au marchand, gérer la lecture publique limitée aux tokens valides et préserver les contacts chiffrés existants. Son exécution et une seconde exécution idempotente ont été vérifiées avec un moteur PostgreSQL local ; des essais locaux ont aussi vérifié la conservation des anciennes tables, le rejet des liens entre deux marchands, la validation E.164 minimale et l’isolation RLS sous un rôle non propriétaire. Aucun essai n’a été effectué sur Neon.

**Aucune mise en production** de ce nouveau modèle avant validation sur une branche Neon isolée, tests locaux, sauvegarde et plan de retour arrière. L’aperçu local actuellement démarré affiche toujours le KouturePro existant.

## Décision nécessaire avant la première migration

1. **Adapter l’application KouturePro existante** (conserver/migrer les données des ateliers, retirer CinetPay et les intégrations de messagerie, remplacer progressivement l’authentification) **ou créer une nouvelle application distincte** ? Cela détermine les clés étrangères et la stratégie pour les comptes existants.
2. La case de consentement doit-elle empêcher **l’enregistrement du client**, ou seulement **l’ouverture des boutons WhatsApp/SMS** ? Je recommande la seconde option pour conserver la possibilité de gérer une commande sans imposer l’accord marketing ; un consentement explicite et daté reste nécessaire avant tout message.

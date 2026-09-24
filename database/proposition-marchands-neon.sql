-- PROPOSITION / NE PAS EXECUTER SUR NEON PRODUCTION.
-- A tester uniquement sur une branche Neon Preview APRES confirmation du produit cible.
-- Une seule base Neon existante : ces tables sont dans le schema commerce, sans
-- toucher aux tables kouturepro. Ne cree aucun compte ni aucune commande fictive.
-- Les tables user/session/account/verification de Better Auth sont generees par
-- la version de Better Auth retenue, pas par ce fichier. Relier auth_user_id a
-- leur table user une fois sa migration validee sur la branche Preview.
-- RLS : l'application doit se connecter avec un ROLE SQL NON PROPRIETAIRE et
-- non BYPASSRLS et fixer app.merchant_id avec SET LOCAL dans chaque transaction.
-- Les routes publiques /pay utilisent ensuite une fonction/role restreint a
-- definir dans la phase liens (elles ne doivent pas avoir SELECT global direct).

BEGIN;
SELECT pg_advisory_xact_lock(7426216);
CREATE SCHEMA IF NOT EXISTS commerce;

CREATE TABLE IF NOT EXISTS commerce.countries (
 iso2 CHAR(2) PRIMARY KEY CHECK (iso2 ~ '^[A-Z]{2}$'),
 name_fr TEXT NOT NULL, name_en TEXT NOT NULL, flag_emoji TEXT NOT NULL,
 dial_code TEXT NOT NULL CHECK (dial_code ~ '^\+[1-9][0-9]{0,2}$'),
 currency_code CHAR(3) NOT NULL CHECK (currency_code ~ '^[A-Z]{3}$'),
 currency_decimals SMALLINT NOT NULL CHECK (currency_decimals BETWEEN 0 AND 3),
 is_active BOOLEAN NOT NULL DEFAULT TRUE,
 updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS commerce.operators (
 code TEXT PRIMARY KEY CHECK (code ~ '^[a-z][a-z0-9_]*$'),
 display_name TEXT NOT NULL,
 kind TEXT NOT NULL CHECK (kind IN ('mobile_money','bank_transfer')),
 is_active BOOLEAN NOT NULL DEFAULT TRUE
);

CREATE TABLE IF NOT EXISTS commerce.country_operators (
 country_iso2 CHAR(2) NOT NULL REFERENCES commerce.countries(iso2),
 operator_code TEXT NOT NULL REFERENCES commerce.operators(code),
 suggested BOOLEAN NOT NULL DEFAULT FALSE,
 is_active BOOLEAN NOT NULL DEFAULT TRUE,
 PRIMARY KEY (country_iso2, operator_code)
);

CREATE TABLE IF NOT EXISTS commerce.merchants (
 id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
 business_name TEXT NOT NULL CHECK (length(trim(business_name)) BETWEEN 2 AND 180),
 country_iso2 CHAR(2) NOT NULL REFERENCES commerce.countries(iso2),
 locale CHAR(2) NOT NULL DEFAULT 'fr' CHECK (locale IN ('fr','en')),
 created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
 updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS commerce.merchant_users (
 id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
 merchant_id UUID NOT NULL REFERENCES commerce.merchants(id) ON DELETE CASCADE,
 auth_user_id TEXT NOT NULL, -- Better Auth user.id, lie par FK apres migration auth
 role TEXT NOT NULL CHECK (role IN ('marchand','personnel')),
 is_active BOOLEAN NOT NULL DEFAULT TRUE,
 joined_at TIMESTAMPTZ NOT NULL DEFAULT now(),
 UNIQUE (merchant_id, id),
 UNIQUE (merchant_id, auth_user_id)
);
CREATE UNIQUE INDEX IF NOT EXISTS ix_commerce_one_active_owner
 ON commerce.merchant_users(merchant_id) WHERE role='marchand' AND is_active;
CREATE INDEX IF NOT EXISTS ix_commerce_auth_user
 ON commerce.merchant_users(auth_user_id);

CREATE TABLE IF NOT EXISTS commerce.invitations (
 id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
 merchant_id UUID NOT NULL REFERENCES commerce.merchants(id) ON DELETE CASCADE,
 invitee_email TEXT NOT NULL CHECK (length(invitee_email) BETWEEN 3 AND 254),
 token_hash CHAR(64) NOT NULL UNIQUE CHECK (token_hash ~ '^[0-9a-f]{64}$'),
 created_by UUID, -- renseigne a la creation, nullable si ce membre est supprime
 created_by_label TEXT NOT NULL DEFAULT '',
 expires_at TIMESTAMPTZ NOT NULL,
 used_at TIMESTAMPTZ,
 revoked_at TIMESTAMPTZ,
 created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
 FOREIGN KEY (merchant_id,created_by)
  REFERENCES commerce.merchant_users(merchant_id,id)
  ON DELETE SET NULL (created_by),
 CHECK (expires_at > created_at),
 CHECK (used_at IS NULL OR revoked_at IS NULL)
);
CREATE INDEX IF NOT EXISTS ix_commerce_invites_email
 ON commerce.invitations(merchant_id, lower(invitee_email));

CREATE TABLE IF NOT EXISTS commerce.clients (
 id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
 merchant_id UUID NOT NULL REFERENCES commerce.merchants(id) ON DELETE CASCADE,
 name TEXT NOT NULL CHECK (length(trim(name)) BETWEEN 2 AND 180),
 phone_country_iso2 CHAR(2) NOT NULL REFERENCES commerce.countries(iso2),
 phone_e164 TEXT NOT NULL CHECK (phone_e164 ~ '^\+[1-9][0-9]{1,14}$'),
 notes TEXT NOT NULL DEFAULT '',
 consent_whatsapp_sms BOOLEAN NOT NULL DEFAULT FALSE,
 consent_recorded_at TIMESTAMPTZ,
 consent_revoked_at TIMESTAMPTZ,
 created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
 updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
 UNIQUE (merchant_id,id),
 CHECK (NOT consent_whatsapp_sms OR
        (consent_recorded_at IS NOT NULL AND consent_revoked_at IS NULL))
);
CREATE INDEX IF NOT EXISTS ix_commerce_clients_name
 ON commerce.clients(merchant_id, lower(name));
CREATE INDEX IF NOT EXISTS ix_commerce_clients_phone
 ON commerce.clients(merchant_id, phone_e164);

CREATE TABLE IF NOT EXISTS commerce.payment_settings (
 id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
 merchant_id UUID NOT NULL REFERENCES commerce.merchants(id) ON DELETE CASCADE,
 country_iso2 CHAR(2) NOT NULL REFERENCES commerce.countries(iso2),
 operator_code TEXT REFERENCES commerce.operators(code),
 custom_display_name TEXT,
 enabled BOOLEAN NOT NULL DEFAULT FALSE,
 destination_phone_e164 TEXT
  CHECK (destination_phone_e164 IS NULL OR destination_phone_e164 ~ '^\+[1-9][0-9]{1,14}$'),
 bank_instructions TEXT,
 qr_blob_key TEXT, -- la cle Vercel Blob, pas le fichier dans PostgreSQL
 updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
 UNIQUE (merchant_id,id),
 CHECK ((operator_code IS NOT NULL) <> (custom_display_name IS NOT NULL)),
 CHECK (custom_display_name IS NULL OR length(trim(custom_display_name)) BETWEEN 2 AND 100),
 CHECK (NOT enabled OR (destination_phone_e164 IS NOT NULL
        OR nullif(trim(bank_instructions),'') IS NOT NULL
        OR qr_blob_key IS NOT NULL))
);
CREATE UNIQUE INDEX IF NOT EXISTS ix_commerce_known_payment_setting
 ON commerce.payment_settings(merchant_id,country_iso2,operator_code)
 WHERE operator_code IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS ix_commerce_custom_payment_setting
 ON commerce.payment_settings(merchant_id,country_iso2,lower(custom_display_name))
 WHERE custom_display_name IS NOT NULL;

CREATE TABLE IF NOT EXISTS commerce.orders (
 id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
 merchant_id UUID NOT NULL REFERENCES commerce.merchants(id) ON DELETE CASCADE,
 client_id UUID NOT NULL,
 description TEXT NOT NULL DEFAULT '',
 amount_minor BIGINT NOT NULL CHECK (amount_minor > 0),
 currency_code CHAR(3) NOT NULL CHECK (currency_code ~ '^[A-Z]{3}$'),
 country_iso2 CHAR(2) NOT NULL REFERENCES commerce.countries(iso2),
 payment_status TEXT NOT NULL DEFAULT 'pending'
  CHECK (payment_status IN ('pending','review','paid','cancelled')),
 created_by UUID, -- renseigne a la creation, nullable si ce membre est supprime
 created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
 updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
 UNIQUE (merchant_id,id),
 FOREIGN KEY (merchant_id,client_id)
  REFERENCES commerce.clients(merchant_id,id),
 FOREIGN KEY (merchant_id,created_by)
  REFERENCES commerce.merchant_users(merchant_id,id)
  ON DELETE SET NULL (created_by)
);
CREATE INDEX IF NOT EXISTS ix_commerce_orders_status
 ON commerce.orders(merchant_id,payment_status,created_at DESC);

CREATE TABLE IF NOT EXISTS commerce.payment_links (
 id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
 merchant_id UUID NOT NULL REFERENCES commerce.merchants(id) ON DELETE CASCADE,
 order_id UUID NOT NULL,
 token_hash CHAR(64) NOT NULL UNIQUE CHECK (token_hash ~ '^[0-9a-f]{64}$'),
 created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
 expires_at TIMESTAMPTZ NOT NULL DEFAULT (now()+INTERVAL '48 hours'),
 revoked_at TIMESTAMPTZ,
 UNIQUE (merchant_id,id,order_id),
 FOREIGN KEY (merchant_id,order_id) REFERENCES commerce.orders(merchant_id,id),
 CHECK (expires_at > created_at AND expires_at <= created_at + INTERVAL '48 hours')
);
CREATE INDEX IF NOT EXISTS ix_commerce_links_order
 ON commerce.payment_links(merchant_id,order_id,expires_at DESC);

CREATE TABLE IF NOT EXISTS commerce.payment_claims (
 id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
 merchant_id UUID NOT NULL REFERENCES commerce.merchants(id) ON DELETE CASCADE,
 order_id UUID NOT NULL,
 payment_link_id UUID NOT NULL,
 transaction_reference TEXT NOT NULL
  CHECK (length(trim(transaction_reference)) BETWEEN 2 AND 120),
 submitted_at TIMESTAMPTZ NOT NULL DEFAULT now(),
 FOREIGN KEY (merchant_id,order_id)
  REFERENCES commerce.orders(merchant_id,id),
 FOREIGN KEY (merchant_id,payment_link_id,order_id)
  REFERENCES commerce.payment_links(merchant_id,id,order_id)
);
CREATE INDEX IF NOT EXISTS ix_commerce_claims_order
 ON commerce.payment_claims(merchant_id,order_id,submitted_at DESC);

CREATE TABLE IF NOT EXISTS commerce.payment_events (
 id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
 merchant_id UUID NOT NULL REFERENCES commerce.merchants(id) ON DELETE CASCADE,
 order_id UUID NOT NULL,
 action TEXT NOT NULL CHECK (action IN ('reference_submitted','marked_paid','cancelled')),
 actor_user_id UUID,
 actor_label TEXT NOT NULL, -- photographie lisible meme si un membre est retire
 reference_snapshot TEXT,
 previous_status TEXT,
 new_status TEXT NOT NULL,
 created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
 FOREIGN KEY (merchant_id,order_id)
  REFERENCES commerce.orders(merchant_id,id),
 FOREIGN KEY (merchant_id,actor_user_id)
  REFERENCES commerce.merchant_users(merchant_id,id)
  ON DELETE SET NULL (actor_user_id)
);
CREATE INDEX IF NOT EXISTS ix_commerce_events_order
 ON commerce.payment_events(merchant_id,order_id,created_at DESC);

CREATE TABLE IF NOT EXISTS commerce.message_templates (
 merchant_id UUID NOT NULL REFERENCES commerce.merchants(id) ON DELETE CASCADE,
 locale CHAR(2) NOT NULL CHECK (locale IN ('fr','en')),
 kind TEXT NOT NULL CHECK (kind IN ('payment_link','payment_confirmed')),
 body TEXT NOT NULL CHECK (length(body) BETWEEN 1 AND 2000),
 updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
 PRIMARY KEY (merchant_id,locale,kind)
);

-- Les sources pays/opérateurs sont des DONNEES, jamais une liste codée dans
-- l'application. ON CONFLICT DO NOTHING respecte les modifications ultérieures.
INSERT INTO commerce.countries
 (iso2,name_fr,name_en,flag_emoji,dial_code,currency_code,currency_decimals)
VALUES
 ('CI','Côte d''Ivoire','Côte d''Ivoire','🇨🇮','+225','XOF',0),
 ('SN','Sénégal','Senegal','🇸🇳','+221','XOF',0),
 ('ML','Mali','Mali','🇲🇱','+223','XOF',0),
 ('BF','Burkina Faso','Burkina Faso','🇧🇫','+226','XOF',0),
 ('BJ','Bénin','Benin','🇧🇯','+229','XOF',0),
 ('TG','Togo','Togo','🇹🇬','+228','XOF',0),
 ('NE','Niger','Niger','🇳🇪','+227','XOF',0),
 ('GW','Guinée-Bissau','Guinea-Bissau','🇬🇼','+245','XOF',0),
 ('GH','Ghana','Ghana','🇬🇭','+233','GHS',2),
 ('NG','Nigeria','Nigeria','🇳🇬','+234','NGN',2),
 ('GN','Guinée','Guinea','🇬🇳','+224','GNF',0),
 ('LR','Liberia','Liberia','🇱🇷','+231','LRD',2),
 ('SL','Sierra Leone','Sierra Leone','🇸🇱','+232','SLE',2),
 ('GM','Gambie','Gambia','🇬🇲','+220','GMD',2),
 ('CV','Cap-Vert','Cape Verde','🇨🇻','+238','CVE',2),
 ('MR','Mauritanie','Mauritania','🇲🇷','+222','MRU',2)
ON CONFLICT (iso2) DO NOTHING;

INSERT INTO commerce.operators(code,display_name,kind) VALUES
 ('orange_money','Orange Money','mobile_money'),
 ('moov_money','Moov Money','mobile_money'),
 ('mtn_momo','MTN MoMo','mobile_money'),
 ('wave','Wave','mobile_money'),
 ('telecel_cash','Telecel Cash','mobile_money'),
 ('airteltigo_money','AirtelTigo Money','mobile_money'),
 ('opay','OPay','mobile_money'),
 ('palmpay','PalmPay','mobile_money'),
 ('bank_transfer','Virement bancaire','bank_transfer')
ON CONFLICT (code) DO NOTHING;

-- Suggestions INITIALES ET INDICATIVES, pas une garantie de couverture locale.
-- Chaque marchand confirme ses operateurs et entre ses propres coordonnees ;
-- le referentiel par pays reste modifiable, sans changer les donnees des autres.
INSERT INTO commerce.country_operators(country_iso2,operator_code,suggested)
 SELECT iso2,'bank_transfer',TRUE FROM commerce.countries
 ON CONFLICT (country_iso2,operator_code) DO NOTHING;
INSERT INTO commerce.country_operators(country_iso2,operator_code,suggested) VALUES
 ('CI','orange_money',TRUE),('CI','moov_money',TRUE),
 ('CI','mtn_momo',TRUE),('CI','wave',TRUE),
 ('SN','orange_money',TRUE),('SN','wave',TRUE),
 ('ML','orange_money',TRUE),('ML','moov_money',TRUE),
 ('BF','orange_money',TRUE),('BF','moov_money',TRUE),('BF','telecel_cash',TRUE),
 ('BJ','moov_money',TRUE),('BJ','mtn_momo',TRUE),
 ('TG','moov_money',TRUE),
 ('GW','orange_money',TRUE),
 ('GH','mtn_momo',TRUE),('GH','telecel_cash',TRUE),('GH','airteltigo_money',TRUE),
 ('NG','opay',TRUE),('NG','palmpay',TRUE),
 ('GN','orange_money',TRUE),
 ('LR','orange_money',TRUE),('SL','orange_money',TRUE),('GM','wave',TRUE)
ON CONFLICT (country_iso2,operator_code) DO NOTHING;
-- NE, CV et MR ont initialement le virement ; les operateurs locaux se
-- renseignent via ce meme referentiel avant leur presentation aux clients.

-- Politique d'isolation de principe : operationnelle seulement si Vercel utilise
-- un role SQL non-proprietaire, sans BYPASSRLS, et SET LOCAL app.merchant_id
-- apres verification de la session Better Auth. Ne jamais se fier a un header
-- ou a un merchant_id fourni par le navigateur.
ALTER TABLE commerce.merchants ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
 IF NOT EXISTS (SELECT 1 FROM pg_policies
                WHERE schemaname='commerce' AND tablename='merchants'
                  AND policyname='own_merchant') THEN
  CREATE POLICY own_merchant ON commerce.merchants
   USING (id=nullif(current_setting('app.merchant_id',TRUE),'')::uuid)
   WITH CHECK (id=nullif(current_setting('app.merchant_id',TRUE),'')::uuid);
 END IF;
END $$;
DO $$
DECLARE t TEXT;
BEGIN
 FOREACH t IN ARRAY ARRAY['merchant_users','invitations','clients',
                           'payment_settings','orders','payment_links',
                           'payment_claims','payment_events','message_templates']
 LOOP
  EXECUTE format('ALTER TABLE commerce.%I ENABLE ROW LEVEL SECURITY',t);
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='commerce'
                 AND tablename=t AND policyname='own_merchant') THEN
   EXECUTE format('CREATE POLICY own_merchant ON commerce.%I '
    || 'USING (merchant_id=nullif(current_setting(''app.merchant_id'',TRUE),'''')::uuid) '
    || 'WITH CHECK (merchant_id=nullif(current_setting(''app.merchant_id'',TRUE),'''')::uuid)',t);
  END IF;
 END LOOP;
END $$;
COMMIT;

-- RESTE A FAIRE AVANT UTILISATION : generation Better Auth et FK auth_user_id,
-- role Vercel non-proprietaire + GRANT minimum, politique RLS owner-only pour
-- ecritures pays/paiement/membres, fonction publique limitee /pay avec debit,
-- chiffrement E.164 conforme au modele existant si migration KouturePro,
-- mecanisme de purge Blob et journal append-only. Voir proposition-marchands-neon.md.

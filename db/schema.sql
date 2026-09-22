-- Rapid Pare-Brise CRM — durable PostgreSQL schema
CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE TABLE IF NOT EXISTS prospects (id uuid PRIMARY KEY DEFAULT gen_random_uuid(),name text NOT NULL,sector text,zone text,address text,fleet text,phone text,status text NOT NULL DEFAULT 'Nouveau',score integer NOT NULL DEFAULT 50 CHECK(score BETWEEN 0 AND 100),notes text,next_action text,access text NOT NULL DEFAULT 'À vérifier',insurance text NOT NULL DEFAULT 'À vérifier',place_id text,latitude double precision,longitude double precision,signed_revenue numeric(12,2) NOT NULL DEFAULT 0,generated_revenue numeric(12,2) NOT NULL DEFAULT 0,potential_revenue numeric(12,2) NOT NULL DEFAULT 0,created_at timestamptz NOT NULL DEFAULT now(),updated_at timestamptz NOT NULL DEFAULT now(),deleted_at timestamptz);
ALTER TABLE prospects ADD COLUMN IF NOT EXISTS email text;
ALTER TABLE prospects ADD COLUMN IF NOT EXISTS contact_name text;
ALTER TABLE prospects ADD COLUMN IF NOT EXISTS contact_role text;
ALTER TABLE prospects ADD COLUMN IF NOT EXISTS email_status text NOT NULL DEFAULT 'À vérifier';
ALTER TABLE prospects ADD COLUMN IF NOT EXISTS do_not_contact boolean NOT NULL DEFAULT false;
ALTER TABLE prospects ADD COLUMN IF NOT EXISTS last_field_visit_at timestamptz;
ALTER TABLE prospects ADD COLUMN IF NOT EXISTS field_visit_count integer NOT NULL DEFAULT 0;
ALTER TABLE prospects ADD COLUMN IF NOT EXISTS next_action_at timestamptz;
ALTER TABLE prospects ADD COLUMN IF NOT EXISTS last_contact_at timestamptz;
ALTER TABLE prospects ADD COLUMN IF NOT EXISTS website text;
ALTER TABLE prospects ADD COLUMN IF NOT EXISTS siret text;
ALTER TABLE prospects ADD COLUMN IF NOT EXISTS postal_code text;
ALTER TABLE prospects ADD COLUMN IF NOT EXISTS city text;
ALTER TABLE prospects ADD COLUMN IF NOT EXISTS company_size text NOT NULL DEFAULT 'À qualifier';
ALTER TABLE prospects ADD COLUMN IF NOT EXISTS fleet_count integer CHECK(fleet_count IS NULL OR fleet_count >= 0);
ALTER TABLE prospects ADD COLUMN IF NOT EXISTS fleet_confidence text NOT NULL DEFAULT 'À vérifier';
ALTER TABLE prospects ADD COLUMN IF NOT EXISTS fleet_types text;
ALTER TABLE prospects ADD COLUMN IF NOT EXISTS usage_intensity text NOT NULL DEFAULT 'À vérifier';
ALTER TABLE prospects ADD COLUMN IF NOT EXISTS current_glass_partner text NOT NULL DEFAULT 'Inconnu';
ALTER TABLE prospects ADD COLUMN IF NOT EXISTS glass_partner_details text;
ALTER TABLE prospects ADD COLUMN IF NOT EXISTS lead_source text NOT NULL DEFAULT 'Prospection terrain';
ALTER TABLE prospects ADD COLUMN IF NOT EXISTS best_contact_time text;
ALTER TABLE prospects ADD COLUMN IF NOT EXISTS decision_process text;
ALTER TABLE prospects ADD COLUMN IF NOT EXISTS objections text;
ALTER TABLE prospects ADD COLUMN IF NOT EXISTS data_quality_score integer NOT NULL DEFAULT 0 CHECK(data_quality_score BETWEEN 0 AND 100);
ALTER TABLE prospects ADD COLUMN IF NOT EXISTS merged_into_id uuid REFERENCES prospects(id) ON DELETE RESTRICT;
ALTER TABLE prospects ADD COLUMN IF NOT EXISTS data_verified_at timestamptz;
CREATE INDEX IF NOT EXISTS prospects_status_idx ON prospects(status) WHERE deleted_at IS NULL;CREATE INDEX IF NOT EXISTS prospects_zone_idx ON prospects(zone) WHERE deleted_at IS NULL;CREATE INDEX IF NOT EXISTS prospects_updated_idx ON prospects(updated_at DESC) WHERE deleted_at IS NULL;
CREATE TABLE IF NOT EXISTS prospect_events(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),prospect_id uuid NOT NULL REFERENCES prospects(id) ON DELETE RESTRICT,event_type text NOT NULL,payload jsonb NOT NULL DEFAULT '{}'::jsonb,created_at timestamptz NOT NULL DEFAULT now());CREATE INDEX IF NOT EXISTS prospect_events_prospect_idx ON prospect_events(prospect_id,created_at DESC);
CREATE TABLE IF NOT EXISTS prospect_contacts(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),prospect_id uuid NOT NULL REFERENCES prospects(id) ON DELETE RESTRICT,name text NOT NULL,role text,email text,phone text,is_decision_maker boolean NOT NULL DEFAULT false,is_primary boolean NOT NULL DEFAULT false,preferred_channel text NOT NULL DEFAULT 'Téléphone',notes text,created_at timestamptz NOT NULL DEFAULT now(),updated_at timestamptz NOT NULL DEFAULT now(),deleted_at timestamptz);
CREATE INDEX IF NOT EXISTS prospect_contacts_prospect_idx ON prospect_contacts(prospect_id,is_primary DESC) WHERE deleted_at IS NULL;
CREATE TABLE IF NOT EXISTS individual_customers(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),name text NOT NULL,phone text,vehicle text,registration text NOT NULL,source text NOT NULL DEFAULT 'Apport personnel',status text NOT NULL DEFAULT 'À contacter',generated_revenue numeric(12,2) NOT NULL DEFAULT 0,notes text,created_at timestamptz NOT NULL DEFAULT now(),updated_at timestamptz NOT NULL DEFAULT now(),deleted_at timestamptz);
CREATE INDEX IF NOT EXISTS individual_customers_registration_idx ON individual_customers(upper(registration)) WHERE deleted_at IS NULL;CREATE INDEX IF NOT EXISTS individual_customers_status_idx ON individual_customers(status) WHERE deleted_at IS NULL;CREATE INDEX IF NOT EXISTS individual_customers_updated_idx ON individual_customers(updated_at DESC) WHERE deleted_at IS NULL;
CREATE TABLE IF NOT EXISTS individual_customer_events(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),customer_id uuid NOT NULL REFERENCES individual_customers(id) ON DELETE RESTRICT,event_type text NOT NULL,payload jsonb NOT NULL DEFAULT '{}'::jsonb,created_at timestamptz NOT NULL DEFAULT now());CREATE INDEX IF NOT EXISTS individual_customer_events_customer_idx ON individual_customer_events(customer_id,created_at DESC);
CREATE TABLE IF NOT EXISTS documents(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),name text NOT NULL,file_name text NOT NULL,mime_type text NOT NULL,size_bytes integer NOT NULL CHECK(size_bytes>0 AND size_bytes<=10485760),category text NOT NULL DEFAULT 'Autre',content bytea NOT NULL,created_at timestamptz NOT NULL DEFAULT now(),updated_at timestamptz NOT NULL DEFAULT now(),deleted_at timestamptz);CREATE INDEX IF NOT EXISTS documents_created_idx ON documents(created_at DESC) WHERE deleted_at IS NULL;CREATE INDEX IF NOT EXISTS documents_category_idx ON documents(category) WHERE deleted_at IS NULL;
ALTER TABLE documents ADD COLUMN IF NOT EXISTS prospect_id uuid REFERENCES prospects(id) ON DELETE RESTRICT;
CREATE INDEX IF NOT EXISTS documents_prospect_idx ON documents(prospect_id,created_at DESC) WHERE deleted_at IS NULL;
-- Commercial records and documents are archived with deleted_at; application code must not hard-delete history.

-- Mailing commercial: modèles, séquences, inscriptions et journal immuable des messages.
CREATE TABLE IF NOT EXISTS email_templates(
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  subject text NOT NULL,
  body_html text NOT NULL,
  body_text text NOT NULL,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz
);

CREATE TABLE IF NOT EXISTS email_sequences(
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  description text,
  active boolean NOT NULL DEFAULT false,
  stop_on_reply boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz
);

CREATE TABLE IF NOT EXISTS email_sequence_steps(
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sequence_id uuid NOT NULL REFERENCES email_sequences(id) ON DELETE RESTRICT,
  template_id uuid NOT NULL REFERENCES email_templates(id) ON DELETE RESTRICT,
  step_order integer NOT NULL CHECK(step_order > 0),
  delay_days integer NOT NULL DEFAULT 0 CHECK(delay_days >= 0),
  send_automatically boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(sequence_id,step_order)
);

CREATE TABLE IF NOT EXISTS email_enrollments(
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  prospect_id uuid NOT NULL REFERENCES prospects(id) ON DELETE RESTRICT,
  sequence_id uuid NOT NULL REFERENCES email_sequences(id) ON DELETE RESTRICT,
  status text NOT NULL DEFAULT 'active' CHECK(status IN ('active','paused','completed','replied','cancelled','failed')),
  current_step integer NOT NULL DEFAULT 1,
  next_send_at timestamptz,
  stop_reason text,
  enrolled_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS email_enrollments_one_active_idx ON email_enrollments(prospect_id) WHERE status='active';
CREATE INDEX IF NOT EXISTS email_enrollments_due_idx ON email_enrollments(next_send_at) WHERE status='active';

CREATE TABLE IF NOT EXISTS email_messages(
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  prospect_id uuid NOT NULL REFERENCES prospects(id) ON DELETE RESTRICT,
  enrollment_id uuid REFERENCES email_enrollments(id) ON DELETE RESTRICT,
  template_id uuid REFERENCES email_templates(id) ON DELETE RESTRICT,
  direction text NOT NULL DEFAULT 'outbound' CHECK(direction IN ('outbound','inbound')),
  status text NOT NULL DEFAULT 'draft' CHECK(status IN ('draft','scheduled','sending','sent','delivered','replied','failed','cancelled')),
  provider text NOT NULL DEFAULT 'microsoft',
  provider_message_id text,
  recipient_email text NOT NULL,
  sender_email text NOT NULL DEFAULT 'sasvinv13004@outlook.fr',
  sender_name text NOT NULL DEFAULT 'Samir - Rapid Pare-Brise Marseille',
  subject text NOT NULL,
  body_html text NOT NULL,
  body_text text NOT NULL,
  scheduled_at timestamptz,
  sent_at timestamptz,
  replied_at timestamptz,
  error_code text,
  error_message text,
  idempotency_key text NOT NULL UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS email_messages_prospect_idx ON email_messages(prospect_id,created_at DESC);
CREATE INDEX IF NOT EXISTS email_messages_scheduled_idx ON email_messages(scheduled_at) WHERE status='scheduled';
ALTER TABLE email_messages ADD COLUMN IF NOT EXISTS reply_category text;
ALTER TABLE email_messages ADD COLUMN IF NOT EXISTS reply_confidence integer;
ALTER TABLE email_messages ADD COLUMN IF NOT EXISTS review_status text NOT NULL DEFAULT 'not_required' CHECK(review_status IN ('not_required','pending','approved','changed','dismissed'));
CREATE UNIQUE INDEX IF NOT EXISTS email_messages_provider_unique_idx ON email_messages(provider,provider_message_id) WHERE provider_message_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS sales_tasks(
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  prospect_id uuid NOT NULL REFERENCES prospects(id) ON DELETE RESTRICT,
  message_id uuid REFERENCES email_messages(id) ON DELETE RESTRICT,
  task_type text NOT NULL,
  title text NOT NULL,
  status text NOT NULL DEFAULT 'open' CHECK(status IN ('open','completed','dismissed')),
  priority integer NOT NULL DEFAULT 50 CHECK(priority BETWEEN 0 AND 100),
  due_at timestamptz,
  source text NOT NULL DEFAULT 'manual',
  created_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS sales_tasks_message_type_idx ON sales_tasks(message_id,task_type) WHERE message_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS sales_tasks_open_idx ON sales_tasks(status,due_at,priority DESC) WHERE status='open';

CREATE TABLE IF NOT EXISTS appointments(
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  prospect_id uuid NOT NULL REFERENCES prospects(id) ON DELETE RESTRICT,
  contact_id uuid REFERENCES prospect_contacts(id) ON DELETE SET NULL,
  title text NOT NULL,
  meeting_type text NOT NULL DEFAULT 'Sur place' CHECK(meeting_type IN ('Sur place','Téléphone','Visioconférence','Au centre')),
  starts_at timestamptz NOT NULL,
  ends_at timestamptz NOT NULL,
  location text,
  objective text,
  preparation_notes text,
  status text NOT NULL DEFAULT 'scheduled' CHECK(status IN ('scheduled','confirmed','completed','cancelled','no_show')),
  confirmation_status text NOT NULL DEFAULT 'not_sent' CHECK(confirmation_status IN ('not_sent','draft','sent','confirmed')),
  reminder_day boolean NOT NULL DEFAULT true,
  reminder_hour boolean NOT NULL DEFAULT true,
  outcome text,
  next_action text,
  next_action_at timestamptz,
  external_provider text,
  external_event_id text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK(ends_at > starts_at)
);
CREATE INDEX IF NOT EXISTS appointments_calendar_idx ON appointments(starts_at,status);
CREATE INDEX IF NOT EXISTS appointments_prospect_idx ON appointments(prospect_id,starts_at DESC);
ALTER TABLE sales_tasks ADD COLUMN IF NOT EXISTS appointment_id uuid REFERENCES appointments(id) ON DELETE RESTRICT;
CREATE UNIQUE INDEX IF NOT EXISTS sales_tasks_appointment_type_idx ON sales_tasks(appointment_id,task_type) WHERE appointment_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS prospect_merges(
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  master_prospect_id uuid NOT NULL REFERENCES prospects(id) ON DELETE RESTRICT,
  merged_prospect_id uuid NOT NULL REFERENCES prospects(id) ON DELETE RESTRICT,
  master_snapshot jsonb NOT NULL,
  merged_snapshot jsonb NOT NULL,
  merged_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(merged_prospect_id)
);
CREATE INDEX IF NOT EXISTS prospect_merges_master_idx ON prospect_merges(master_prospect_id,merged_at DESC);

CREATE TABLE IF NOT EXISTS call_logs(
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  prospect_id uuid NOT NULL REFERENCES prospects(id) ON DELETE RESTRICT,
  contact_id uuid REFERENCES prospect_contacts(id) ON DELETE SET NULL,
  direction text NOT NULL DEFAULT 'outbound' CHECK(direction IN ('outbound','inbound')),
  outcome text NOT NULL CHECK(outcome IN ('answered','no_answer','callback','interested','appointment','information','wrong_contact','not_interested')),
  started_at timestamptz NOT NULL DEFAULT now(),
  duration_seconds integer NOT NULL DEFAULT 0 CHECK(duration_seconds BETWEEN 0 AND 86400),
  notes text,
  next_action text,
  next_action_at timestamptz,
  previous_status text,
  resulting_status text,
  appointment_id uuid REFERENCES appointments(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS call_logs_prospect_idx ON call_logs(prospect_id,started_at DESC);
CREATE INDEX IF NOT EXISTS call_logs_recent_idx ON call_logs(started_at DESC);
ALTER TABLE sales_tasks ADD COLUMN IF NOT EXISTS call_id uuid REFERENCES call_logs(id) ON DELETE RESTRICT;
CREATE UNIQUE INDEX IF NOT EXISTS sales_tasks_call_type_idx ON sales_tasks(call_id,task_type) WHERE call_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS commercial_offers(
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  prospect_id uuid NOT NULL REFERENCES prospects(id) ON DELETE RESTRICT,
  title text NOT NULL,
  offer_type text NOT NULL DEFAULT 'partnership' CHECK(offer_type IN ('partnership','service','quote')),
  status text NOT NULL DEFAULT 'draft' CHECK(status IN ('draft','sent','viewed','accepted','refused','expired')),
  amount numeric(12,2) NOT NULL DEFAULT 0 CHECK(amount >= 0),
  valid_until date,
  summary text,
  terms text,
  sent_at timestamptz,
  viewed_at timestamptz,
  decided_at timestamptz,
  refusal_reason text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS commercial_offers_prospect_idx ON commercial_offers(prospect_id,created_at DESC);
CREATE INDEX IF NOT EXISTS commercial_offers_status_idx ON commercial_offers(status,valid_until);
ALTER TABLE sales_tasks ADD COLUMN IF NOT EXISTS offer_id uuid REFERENCES commercial_offers(id) ON DELETE RESTRICT;
CREATE UNIQUE INDEX IF NOT EXISTS sales_tasks_offer_type_idx ON sales_tasks(offer_id,task_type) WHERE offer_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS partner_profiles(
  prospect_id uuid PRIMARY KEY REFERENCES prospects(id) ON DELETE RESTRICT,
  onboarding_status text NOT NULL DEFAULT 'pending' CHECK(onboarding_status IN ('pending','active','paused')),
  agreement_started_at date,
  next_review_at date,
  satisfaction integer CHECK(satisfaction IS NULL OR satisfaction BETWEEN 1 AND 5),
  operational_notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS fleet_vehicles(
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  prospect_id uuid NOT NULL REFERENCES prospects(id) ON DELETE RESTRICT,
  registration text NOT NULL,
  make text,
  model text,
  vehicle_year integer,
  driver_name text,
  notes text,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(prospect_id,registration)
);
CREATE INDEX IF NOT EXISTS fleet_vehicles_prospect_idx ON fleet_vehicles(prospect_id,active);
CREATE TABLE IF NOT EXISTS service_cases(
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  prospect_id uuid NOT NULL REFERENCES prospects(id) ON DELETE RESTRICT,
  vehicle_id uuid REFERENCES fleet_vehicles(id) ON DELETE SET NULL,
  request_type text NOT NULL CHECK(request_type IN ('windshield','side','rear','roof','other')),
  status text NOT NULL DEFAULT 'new' CHECK(status IN ('new','scheduled','in_progress','completed','cancelled')),
  requested_at timestamptz NOT NULL DEFAULT now(),
  scheduled_at timestamptz,
  completed_at timestamptz,
  insurer text,
  claim_number text,
  amount numeric(12,2) NOT NULL DEFAULT 0 CHECK(amount >= 0),
  notes text,
  satisfaction integer CHECK(satisfaction IS NULL OR satisfaction BETWEEN 1 AND 5),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS service_cases_prospect_idx ON service_cases(prospect_id,requested_at DESC);
CREATE INDEX IF NOT EXISTS service_cases_status_idx ON service_cases(status,scheduled_at);
ALTER TABLE sales_tasks ADD COLUMN IF NOT EXISTS service_case_id uuid REFERENCES service_cases(id) ON DELETE RESTRICT;
CREATE UNIQUE INDEX IF NOT EXISTS sales_tasks_service_case_type_idx ON sales_tasks(service_case_id,task_type) WHERE service_case_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS performance_goals(
  period_month date PRIMARY KEY,
  revenue_target numeric(12,2) NOT NULL DEFAULT 0 CHECK(revenue_target >= 0),
  calls_target integer NOT NULL DEFAULT 0 CHECK(calls_target >= 0),
  appointments_target integer NOT NULL DEFAULT 0 CHECK(appointments_target >= 0),
  partners_target integer NOT NULL DEFAULT 0 CHECK(partners_target >= 0),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS automation_settings(setting_key text PRIMARY KEY,label text NOT NULL,category text NOT NULL,enabled boolean NOT NULL DEFAULT true,numeric_value integer,unit text,description text,updated_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE IF NOT EXISTS automation_audit(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),setting_key text NOT NULL REFERENCES automation_settings(setting_key) ON DELETE RESTRICT,previous_value jsonb NOT NULL,new_value jsonb NOT NULL,changed_at timestamptz NOT NULL DEFAULT now());
CREATE INDEX IF NOT EXISTS automation_audit_recent_idx ON automation_audit(changed_at DESC);
CREATE TABLE IF NOT EXISTS crm_backups(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),label text NOT NULL,payload jsonb NOT NULL,record_count integer NOT NULL,created_at timestamptz NOT NULL DEFAULT now());
CREATE INDEX IF NOT EXISTS crm_backups_recent_idx ON crm_backups(created_at DESC);
INSERT INTO automation_settings(setting_key,label,category,enabled,numeric_value,unit,description) VALUES
('mailing_sequence','Séquence e-mail automatique','Mailing',true,14,'jours','Relances J0, J+3, J+7 et J+14 avec arrêt sur réponse.'),
('offer_follow_up','Relance après une offre','Commercial',true,3,'jours','Crée une relance après l’envoi d’une offre.'),
('appointment_day_reminder','Rappel rendez-vous la veille','Agenda',true,1,'jour','Crée la confirmation avant le rendez-vous.'),
('appointment_hour_reminder','Rappel avant rendez-vous','Agenda',true,1,'heure','Alerte avant le début du rendez-vous.'),
('satisfaction_follow_up','Demande de satisfaction','Partenaires',true,2,'jours','Programme le retour après une intervention.'),
('stale_opportunity','Alerte dossier inactif','Pilotage',true,14,'jours','Signale les opportunités sans mouvement.'),
('data_review','Contrôle des données','Données',true,90,'jours','Signale les fiches à vérifier.') ON CONFLICT(setting_key) DO NOTHING;

CREATE TABLE IF NOT EXISTS field_visits(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),prospect_id uuid NOT NULL REFERENCES prospects(id) ON DELETE RESTRICT,outcome text NOT NULL CHECK(outcome IN ('visited','absent','callback','not_interested','not_found','closed')),note text,latitude double precision,longitude double precision,visited_at timestamptz NOT NULL DEFAULT now());
CREATE INDEX IF NOT EXISTS field_visits_prospect_idx ON field_visits(prospect_id,visited_at DESC);

INSERT INTO email_templates(name,subject,body_html,body_text)
SELECT 'Premier contact flotte','Une solution vitrage pour la flotte de {{entreprise}}',
'<p>Bonjour {{contact}},</p><p>Je me permets de vous contacter au nom de Rapid Pare-Brise Marseille afin de vous proposer une solution simple et adaptée pour la gestion des vitrages de votre flotte de véhicules.</p><p>Seriez-vous disponible pour un court échange ?</p>',
'Bonjour {{contact}},\n\nJe me permets de vous contacter au nom de Rapid Pare-Brise Marseille afin de vous proposer une solution simple et adaptée pour la gestion des vitrages de votre flotte de véhicules.\n\nSeriez-vous disponible pour un court échange ?'
WHERE NOT EXISTS (SELECT 1 FROM email_templates WHERE name='Premier contact flotte' AND deleted_at IS NULL);

INSERT INTO email_templates(name,subject,body_html,body_text)
SELECT 'Relance courte J+3','Suite à mon message pour {{entreprise}}','<p>Bonjour {{contact}},</p><p>Je me permets de revenir vers vous concernant la gestion des vitrages de la flotte de {{entreprise}}.</p><p>Un échange de quelques minutes vous conviendrait-il cette semaine ?</p>','Bonjour {{contact}},\n\nJe me permets de revenir vers vous concernant la gestion des vitrages de la flotte de {{entreprise}}.\n\nUn échange de quelques minutes vous conviendrait-il cette semaine ?'
WHERE NOT EXISTS (SELECT 1 FROM email_templates WHERE name='Relance courte J+3' AND deleted_at IS NULL);
INSERT INTO email_templates(name,subject,body_html,body_text)
SELECT 'Relance valeur J+7','Réduire l’immobilisation de vos véhicules','<p>Bonjour {{contact}},</p><p>Notre objectif est simple : réduire le temps d’immobilisation des véhicules et faciliter la prise en charge vitrage de {{entreprise}}.</p><p>Je peux vous présenter rapidement notre fonctionnement.</p>','Bonjour {{contact}},\n\nNotre objectif est simple : réduire le temps d’immobilisation des véhicules et faciliter la prise en charge vitrage de {{entreprise}}.\n\nJe peux vous présenter rapidement notre fonctionnement.'
WHERE NOT EXISTS (SELECT 1 FROM email_templates WHERE name='Relance valeur J+7' AND deleted_at IS NULL);
INSERT INTO email_templates(name,subject,body_html,body_text)
SELECT 'Dernière relance J+14','Dois-je clôturer ma demande ?','<p>Bonjour {{contact}},</p><p>Sans retour de votre part, je me permets un dernier message concernant notre solution vitrage pour {{entreprise}}.</p><p>Si le sujet n’est pas d’actualité, je clôturerai simplement ma demande.</p>','Bonjour {{contact}},\n\nSans retour de votre part, je me permets un dernier message concernant notre solution vitrage pour {{entreprise}}.\n\nSi le sujet n’est pas d’actualité, je clôturerai simplement ma demande.'
WHERE NOT EXISTS (SELECT 1 FROM email_templates WHERE name='Dernière relance J+14' AND deleted_at IS NULL);

INSERT INTO email_sequences(name,description,active,stop_on_reply)
SELECT 'Prospection flotte J0/J+3/J+7/J+14','Séquence Rapid Pare-Brise Marseille avec arrêt automatique après réponse.',true,true
WHERE NOT EXISTS (SELECT 1 FROM email_sequences WHERE name='Prospection flotte J0/J+3/J+7/J+14' AND deleted_at IS NULL);

INSERT INTO email_sequence_steps(sequence_id,template_id,step_order,delay_days,send_automatically)
SELECT s.id,t.id,v.step_order,v.delay_days,true
FROM email_sequences s
JOIN (VALUES ('Premier contact flotte',1,0),('Relance courte J+3',2,3),('Relance valeur J+7',3,7),('Dernière relance J+14',4,14)) AS v(template_name,step_order,delay_days) ON true
JOIN email_templates t ON t.name=v.template_name AND t.deleted_at IS NULL
WHERE s.name='Prospection flotte J0/J+3/J+7/J+14' AND s.deleted_at IS NULL
ON CONFLICT(sequence_id,step_order) DO NOTHING;

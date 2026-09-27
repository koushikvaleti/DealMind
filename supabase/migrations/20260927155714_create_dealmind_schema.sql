/*
# Create DealMind application schema

1. New Tables
- `profiles`: one private profile per signed-in user.
- `deals`: user-owned sales opportunities and health context.
- `customers`: contacts and notes attached to owned deals.
- `conversations`: AI and user messages for owned deals.
- `memories`: durable deal facts and memory-provider references.
- `insights`: generated deal intelligence.
- `deal_activities`: deal timeline events.
- `notifications`: user-owned deal notifications.

2. Security
- Every table enables RLS.
- Every policy is scoped to authenticated users and checks ownership directly or through the parent deal.
- Ownership fields default from auth.uid() and are never accepted from the UI as a security decision.

3. Indexes
- Add user, deal, stage, and recency indexes for common dashboard and detail queries.

4. Important notes
- This migration is additive and idempotent.
- AI and Hindsight provider credentials are intentionally not stored in the browser database.
*/

CREATE TABLE IF NOT EXISTS public.profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email text NOT NULL DEFAULT '',
  full_name text NOT NULL DEFAULT '',
  avatar_url text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.deals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  company_name text NOT NULL,
  deal_value numeric(14,2) NOT NULL DEFAULT 0 CHECK (deal_value >= 0),
  industry text NOT NULL DEFAULT '',
  stage text NOT NULL DEFAULT 'Discovery',
  decision_maker text NOT NULL DEFAULT '',
  health_score integer NOT NULL DEFAULT 50 CHECK (health_score BETWEEN 0 AND 100),
  risk_level text NOT NULL DEFAULT 'Medium',
  risk_summary text NOT NULL DEFAULT '',
  next_action text NOT NULL DEFAULT '',
  last_interaction timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.customers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  deal_id uuid NOT NULL REFERENCES public.deals(id) ON DELETE CASCADE,
  name text NOT NULL DEFAULT '',
  role text NOT NULL DEFAULT '',
  email text NOT NULL DEFAULT '',
  company text NOT NULL DEFAULT '',
  notes text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.conversations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  deal_id uuid NOT NULL REFERENCES public.deals(id) ON DELETE CASCADE,
  user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  role text NOT NULL CHECK (role IN ('user','assistant','system')),
  message text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.memories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  deal_id uuid NOT NULL REFERENCES public.deals(id) ON DELETE CASCADE,
  user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  hindsight_memory_id text,
  memory_type text NOT NULL DEFAULT 'Observation',
  content text NOT NULL,
  source text NOT NULL DEFAULT 'user',
  importance integer NOT NULL DEFAULT 3 CHECK (importance BETWEEN 1 AND 5),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.insights (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  deal_id uuid NOT NULL REFERENCES public.deals(id) ON DELETE CASCADE,
  user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  type text NOT NULL,
  title text NOT NULL,
  description text NOT NULL,
  severity text NOT NULL DEFAULT 'info',
  source text NOT NULL DEFAULT 'user',
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.deal_activities (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  deal_id uuid NOT NULL REFERENCES public.deals(id) ON DELETE CASCADE,
  user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  activity_type text NOT NULL,
  description text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  deal_id uuid REFERENCES public.deals(id) ON DELETE CASCADE,
  type text NOT NULL DEFAULT 'info',
  title text NOT NULL,
  message text NOT NULL,
  read boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.profiles (id, email, full_name)
  VALUES (NEW.id, COALESCE(NEW.email, ''), COALESCE(NEW.raw_user_meta_data->>'full_name', ''))
  ON CONFLICT (id) DO UPDATE SET email = EXCLUDED.email;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created AFTER INSERT ON auth.users
FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

CREATE OR REPLACE FUNCTION public.touch_deal_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$;
DROP TRIGGER IF EXISTS deals_updated_at ON public.deals;
CREATE TRIGGER deals_updated_at BEFORE UPDATE ON public.deals
FOR EACH ROW EXECUTE FUNCTION public.touch_deal_updated_at();

CREATE INDEX IF NOT EXISTS deals_user_updated_idx ON public.deals(user_id, updated_at DESC);
CREATE INDEX IF NOT EXISTS deals_user_stage_idx ON public.deals(user_id, stage);
CREATE INDEX IF NOT EXISTS customers_deal_idx ON public.customers(deal_id);
CREATE INDEX IF NOT EXISTS conversations_deal_created_idx ON public.conversations(deal_id, created_at);
CREATE INDEX IF NOT EXISTS memories_deal_updated_idx ON public.memories(deal_id, updated_at DESC);
CREATE INDEX IF NOT EXISTS insights_deal_created_idx ON public.insights(deal_id, created_at DESC);
CREATE INDEX IF NOT EXISTS activities_deal_created_idx ON public.deal_activities(deal_id, created_at DESC);
CREATE INDEX IF NOT EXISTS notifications_user_created_idx ON public.notifications(user_id, created_at DESC);

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.deals ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.customers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.memories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.insights ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.deal_activities ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS profiles_select_own ON public.profiles;
CREATE POLICY profiles_select_own ON public.profiles FOR SELECT TO authenticated USING (auth.uid() = id);
DROP POLICY IF EXISTS profiles_update_own ON public.profiles;
CREATE POLICY profiles_update_own ON public.profiles FOR UPDATE TO authenticated USING (auth.uid() = id) WITH CHECK (auth.uid() = id);

DROP POLICY IF EXISTS deals_select_own ON public.deals;
CREATE POLICY deals_select_own ON public.deals FOR SELECT TO authenticated USING (auth.uid() = user_id);
DROP POLICY IF EXISTS deals_insert_own ON public.deals;
CREATE POLICY deals_insert_own ON public.deals FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS deals_update_own ON public.deals;
CREATE POLICY deals_update_own ON public.deals FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS deals_delete_own ON public.deals;
CREATE POLICY deals_delete_own ON public.deals FOR DELETE TO authenticated USING (auth.uid() = user_id);

DROP POLICY IF EXISTS customers_select_own_deal ON public.customers;
CREATE POLICY customers_select_own_deal ON public.customers FOR SELECT TO authenticated USING (EXISTS (SELECT 1 FROM public.deals d WHERE d.id = deal_id AND d.user_id = auth.uid()));
DROP POLICY IF EXISTS customers_insert_own_deal ON public.customers;
CREATE POLICY customers_insert_own_deal ON public.customers FOR INSERT TO authenticated WITH CHECK (EXISTS (SELECT 1 FROM public.deals d WHERE d.id = deal_id AND d.user_id = auth.uid()));
DROP POLICY IF EXISTS customers_update_own_deal ON public.customers;
CREATE POLICY customers_update_own_deal ON public.customers FOR UPDATE TO authenticated USING (EXISTS (SELECT 1 FROM public.deals d WHERE d.id = deal_id AND d.user_id = auth.uid())) WITH CHECK (EXISTS (SELECT 1 FROM public.deals d WHERE d.id = deal_id AND d.user_id = auth.uid()));
DROP POLICY IF EXISTS customers_delete_own_deal ON public.customers;
CREATE POLICY customers_delete_own_deal ON public.customers FOR DELETE TO authenticated USING (EXISTS (SELECT 1 FROM public.deals d WHERE d.id = deal_id AND d.user_id = auth.uid()));

DROP POLICY IF EXISTS conversations_select_own ON public.conversations;
CREATE POLICY conversations_select_own ON public.conversations FOR SELECT TO authenticated USING (auth.uid() = user_id AND EXISTS (SELECT 1 FROM public.deals d WHERE d.id = deal_id AND d.user_id = auth.uid()));
DROP POLICY IF EXISTS conversations_insert_own ON public.conversations;
CREATE POLICY conversations_insert_own ON public.conversations FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id AND EXISTS (SELECT 1 FROM public.deals d WHERE d.id = deal_id AND d.user_id = auth.uid()));
DROP POLICY IF EXISTS conversations_update_own ON public.conversations;
CREATE POLICY conversations_update_own ON public.conversations FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS conversations_delete_own ON public.conversations;
CREATE POLICY conversations_delete_own ON public.conversations FOR DELETE TO authenticated USING (auth.uid() = user_id);

DROP POLICY IF EXISTS memories_select_own ON public.memories;
CREATE POLICY memories_select_own ON public.memories FOR SELECT TO authenticated USING (auth.uid() = user_id AND EXISTS (SELECT 1 FROM public.deals d WHERE d.id = deal_id AND d.user_id = auth.uid()));
DROP POLICY IF EXISTS memories_insert_own ON public.memories;
CREATE POLICY memories_insert_own ON public.memories FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id AND EXISTS (SELECT 1 FROM public.deals d WHERE d.id = deal_id AND d.user_id = auth.uid()));
DROP POLICY IF EXISTS memories_update_own ON public.memories;
CREATE POLICY memories_update_own ON public.memories FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS memories_delete_own ON public.memories;
CREATE POLICY memories_delete_own ON public.memories FOR DELETE TO authenticated USING (auth.uid() = user_id);

DROP POLICY IF EXISTS insights_select_own ON public.insights;
CREATE POLICY insights_select_own ON public.insights FOR SELECT TO authenticated USING (auth.uid() = user_id AND EXISTS (SELECT 1 FROM public.deals d WHERE d.id = deal_id AND d.user_id = auth.uid()));
DROP POLICY IF EXISTS insights_insert_own ON public.insights;
CREATE POLICY insights_insert_own ON public.insights FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id AND EXISTS (SELECT 1 FROM public.deals d WHERE d.id = deal_id AND d.user_id = auth.uid()));
DROP POLICY IF EXISTS insights_update_own ON public.insights;
CREATE POLICY insights_update_own ON public.insights FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS insights_delete_own ON public.insights;
CREATE POLICY insights_delete_own ON public.insights FOR DELETE TO authenticated USING (auth.uid() = user_id);

DROP POLICY IF EXISTS activities_select_own ON public.deal_activities;
CREATE POLICY activities_select_own ON public.deal_activities FOR SELECT TO authenticated USING (auth.uid() = user_id AND EXISTS (SELECT 1 FROM public.deals d WHERE d.id = deal_id AND d.user_id = auth.uid()));
DROP POLICY IF EXISTS activities_insert_own ON public.deal_activities;
CREATE POLICY activities_insert_own ON public.deal_activities FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id AND EXISTS (SELECT 1 FROM public.deals d WHERE d.id = deal_id AND d.user_id = auth.uid()));
DROP POLICY IF EXISTS activities_update_own ON public.deal_activities;
CREATE POLICY activities_update_own ON public.deal_activities FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS activities_delete_own ON public.deal_activities;
CREATE POLICY activities_delete_own ON public.deal_activities FOR DELETE TO authenticated USING (auth.uid() = user_id);

DROP POLICY IF EXISTS notifications_select_own ON public.notifications;
CREATE POLICY notifications_select_own ON public.notifications FOR SELECT TO authenticated USING (auth.uid() = user_id);
DROP POLICY IF EXISTS notifications_insert_own ON public.notifications;
CREATE POLICY notifications_insert_own ON public.notifications FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS notifications_update_own ON public.notifications;
CREATE POLICY notifications_update_own ON public.notifications FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS notifications_delete_own ON public.notifications;
CREATE POLICY notifications_delete_own ON public.notifications FOR DELETE TO authenticated USING (auth.uid() = user_id);

REVOKE ALL ON FUNCTION public.handle_new_user() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.handle_new_user() TO supabase_auth_admin;

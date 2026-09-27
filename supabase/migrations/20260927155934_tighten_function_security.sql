/*
# Tighten function security

1. Functions modified
- `public.handle_new_user`: already SECURITY DEFINER; revoke EXECUTE from anon and authenticated so it cannot be called via the REST API. It is only invoked by the auth trigger.
- `public.touch_deal_updated_at`: add an explicit `SET search_path = public` so the trigger function is not vulnerable to search_path manipulation.

2. Security
- No data changes.
- Addresses security advisor findings about mutable search_path and public SECURITY DEFINER executability.
*/

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.profiles (id, email, full_name)
  VALUES (NEW.id, COALESCE(NEW.email, ''), COALESCE(NEW.raw_user_meta_data->>'full_name', ''))
  ON CONFLICT (id) DO UPDATE SET email = EXCLUDED.email;
  RETURN NEW;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.touch_deal_updated_at()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$;

DROP TRIGGER IF EXISTS deals_updated_at ON public.deals;
CREATE TRIGGER deals_updated_at BEFORE UPDATE ON public.deals
FOR EACH ROW EXECUTE FUNCTION public.touch_deal_updated_at();

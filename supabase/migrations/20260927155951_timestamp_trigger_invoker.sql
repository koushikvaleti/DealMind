/*
# Make timestamp trigger SECURITY INVOKER

1. Functions modified
- `public.touch_deal_updated_at`: switch from SECURITY DEFINER to SECURITY INVOKER and revoke EXECUTE from anon/authenticated. It only sets `updated_at = now()` on the row being updated, so it needs no elevated privileges.
*/

CREATE OR REPLACE FUNCTION public.touch_deal_updated_at()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$;

REVOKE EXECUTE ON FUNCTION public.touch_deal_updated_at() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS deals_updated_at ON public.deals;
CREATE TRIGGER deals_updated_at BEFORE UPDATE ON public.deals
FOR EACH ROW EXECUTE FUNCTION public.touch_deal_updated_at();

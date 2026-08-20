-- Authoritative production RLS baseline for the events module.
-- Role-specific permissions are intentionally deferred to the permissions PR.

ALTER TABLE public.events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.recurrence_rule ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS events_authenticated_select ON public.events;
DROP POLICY IF EXISTS events_authenticated_insert ON public.events;
DROP POLICY IF EXISTS events_authenticated_update ON public.events;
DROP POLICY IF EXISTS events_authenticated_delete ON public.events;
DROP POLICY IF EXISTS "Enable delete for authenticated users" ON public.events;
DROP POLICY IF EXISTS "Enable insert for authenticated users only" ON public.events;
DROP POLICY IF EXISTS "Enable update for authenticated users" ON public.events;
DROP POLICY IF EXISTS "public can read events" ON public.events;

CREATE POLICY "Enable delete for authenticated users"
  ON public.events FOR DELETE TO authenticated
  USING ((SELECT auth.uid()) IS NOT NULL);
CREATE POLICY "Enable insert for authenticated users only"
  ON public.events FOR INSERT TO authenticated
  WITH CHECK ((SELECT auth.uid()) IS NOT NULL);
CREATE POLICY "Enable update for authenticated users"
  ON public.events FOR UPDATE TO authenticated
  USING ((SELECT auth.uid()) IS NOT NULL);
CREATE POLICY "public can read events"
  ON public.events FOR SELECT TO public
  USING (true);

DROP POLICY IF EXISTS recurrence_rule_authenticated_select ON public.recurrence_rule;
DROP POLICY IF EXISTS recurrence_rule_authenticated_insert ON public.recurrence_rule;
DROP POLICY IF EXISTS recurrence_rule_authenticated_update ON public.recurrence_rule;
DROP POLICY IF EXISTS recurrence_rule_authenticated_delete ON public.recurrence_rule;
DROP POLICY IF EXISTS "Allow all for authenticated users" ON public.recurrence_rule;
DROP POLICY IF EXISTS "Allow Public to see recurrence" ON public.recurrence_rule;

CREATE POLICY "Allow all for authenticated users"
  ON public.recurrence_rule FOR ALL TO authenticated
  USING ((SELECT auth.uid()) IS NOT NULL);
CREATE POLICY "Allow Public to see recurrence"
  ON public.recurrence_rule FOR SELECT TO public
  USING (true);

CREATE TABLE public.cargo_other_loading (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  wagon_number text NOT NULL,
  asa_arrival_time timestamptz,
  asa_dispatch_time timestamptz,
  asa_handover_time timestamptz,
  asa_return_arrival_time timestamptz,
  balance_ndfz_time timestamptz,
  cargo_operations timestamptz,
  cargo_submit_time timestamptz,
  fosfor_arrival_time timestamptz,
  fosfor_dispatch_time timestamptz,
  request_submit_time timestamptz,
  track_assignment_time timestamptz,
  platform_number text,
  train_number_asa text,
  train_number_fosfor text,
  note text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.cargo_other_unloading (LIKE public.cargo_other_loading INCLUDING ALL);

ALTER TABLE public.cargo_other_loading ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cargo_other_unloading ENABLE ROW LEVEL SECURITY;

CREATE POLICY "auth read other_loading" ON public.cargo_other_loading FOR SELECT TO authenticated USING (true);
CREATE POLICY "auth insert other_loading" ON public.cargo_other_loading FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "auth update other_loading" ON public.cargo_other_loading FOR UPDATE TO authenticated USING (true);
CREATE POLICY "auth delete other_loading" ON public.cargo_other_loading FOR DELETE TO authenticated USING (true);

CREATE POLICY "auth read other_unloading" ON public.cargo_other_unloading FOR SELECT TO authenticated USING (true);
CREATE POLICY "auth insert other_unloading" ON public.cargo_other_unloading FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "auth update other_unloading" ON public.cargo_other_unloading FOR UPDATE TO authenticated USING (true);
CREATE POLICY "auth delete other_unloading" ON public.cargo_other_unloading FOR DELETE TO authenticated USING (true);
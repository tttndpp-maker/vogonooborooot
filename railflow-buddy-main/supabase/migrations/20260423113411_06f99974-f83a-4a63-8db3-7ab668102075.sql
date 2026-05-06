-- Удалить старую таблицу wagons со всеми зависимостями
DROP TABLE IF EXISTS public.wagons CASCADE;

-- Перенос пользователей старых ролей
UPDATE public.user_roles SET role = 'STATION' WHERE role::text IN ('OFFICE', 'DISPATCH');

-- Пересоздать enum
ALTER TYPE public.app_role RENAME TO app_role_old;
CREATE TYPE public.app_role AS ENUM ('ADMIN', 'ASU', 'STATION');

ALTER TABLE public.user_roles
  ALTER COLUMN role TYPE public.app_role USING role::text::public.app_role;

DROP FUNCTION IF EXISTS public.has_role(uuid, public.app_role_old) CASCADE;
DROP FUNCTION IF EXISTS public.get_user_roles(uuid) CASCADE;

CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role public.app_role)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$ SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role) $$;

CREATE OR REPLACE FUNCTION public.get_user_roles(_user_id uuid)
RETURNS public.app_role[] LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$ SELECT COALESCE(ARRAY_AGG(role), ARRAY[]::public.app_role[]) FROM public.user_roles WHERE user_id = _user_id $$;

DROP TYPE public.app_role_old;

-- Пересоздать политики на user_roles, использовавшие has_role (CASCADE их удалил)
CREATE POLICY "Admins can view all roles" ON public.user_roles
  FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'ADMIN'));
CREATE POLICY "Admins can insert roles" ON public.user_roles
  FOR INSERT TO authenticated WITH CHECK (public.has_role(auth.uid(), 'ADMIN'));
CREATE POLICY "Admins can delete roles" ON public.user_roles
  FOR DELETE TO authenticated USING (public.has_role(auth.uid(), 'ADMIN'));

-- Пересоздать политику профилей
CREATE POLICY "Admins can view all profiles" ON public.profiles
  FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'ADMIN'));

-- Функция проверки прав для всех cargo-таблиц
CREATE OR REPLACE FUNCTION public.enforce_cargo_wagon_permissions()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE
  is_admin BOOLEAN; is_asu BOOLEAN; is_station BOOLEAN;
BEGIN
  is_admin := public.has_role(auth.uid(), 'ADMIN');
  IF is_admin THEN NEW.updated_at := now(); RETURN NEW; END IF;
  is_asu := public.has_role(auth.uid(), 'ASU');
  is_station := public.has_role(auth.uid(), 'STATION');

  IF NEW.asa_arrival_time IS DISTINCT FROM OLD.asa_arrival_time AND NOT is_asu THEN RAISE EXCEPTION 'Нет прав: asa_arrival_time'; END IF;
  IF NEW.asa_dispatch_time IS DISTINCT FROM OLD.asa_dispatch_time AND NOT is_asu THEN RAISE EXCEPTION 'Нет прав: asa_dispatch_time'; END IF;
  IF NEW.train_number_asa IS DISTINCT FROM OLD.train_number_asa AND NOT is_asu THEN RAISE EXCEPTION 'Нет прав: train_number_asa'; END IF;
  IF NEW.asa_return_arrival_time IS DISTINCT FROM OLD.asa_return_arrival_time AND NOT is_asu THEN RAISE EXCEPTION 'Нет прав: asa_return_arrival_time'; END IF;
  IF NEW.asa_handover_time IS DISTINCT FROM OLD.asa_handover_time AND NOT is_asu THEN RAISE EXCEPTION 'Нет прав: asa_handover_time'; END IF;

  IF NEW.balance_ndfz_time IS DISTINCT FROM OLD.balance_ndfz_time AND NOT is_station THEN RAISE EXCEPTION 'Нет прав: balance_ndfz_time'; END IF;
  IF NEW.note IS DISTINCT FROM OLD.note AND NOT is_station THEN RAISE EXCEPTION 'Нет прав: note'; END IF;
  IF NEW.fosfor_dispatch_time IS DISTINCT FROM OLD.fosfor_dispatch_time AND NOT is_station THEN RAISE EXCEPTION 'Нет прав: fosfor_dispatch_time'; END IF;
  IF NEW.train_number_fosfor IS DISTINCT FROM OLD.train_number_fosfor AND NOT is_station THEN RAISE EXCEPTION 'Нет прав: train_number_fosfor'; END IF;
  IF NEW.platform_number IS DISTINCT FROM OLD.platform_number AND NOT is_station THEN RAISE EXCEPTION 'Нет прав: platform_number'; END IF;
  IF NEW.fosfor_arrival_time IS DISTINCT FROM OLD.fosfor_arrival_time AND NOT is_station THEN RAISE EXCEPTION 'Нет прав: fosfor_arrival_time'; END IF;
  IF NEW.cargo_submit_time IS DISTINCT FROM OLD.cargo_submit_time AND NOT is_station THEN RAISE EXCEPTION 'Нет прав: cargo_submit_time'; END IF;
  IF NEW.cargo_operations IS DISTINCT FROM OLD.cargo_operations AND NOT is_station THEN RAISE EXCEPTION 'Нет прав: cargo_operations'; END IF;
  IF NEW.request_submit_time IS DISTINCT FROM OLD.request_submit_time AND NOT is_station THEN RAISE EXCEPTION 'Нет прав: request_submit_time'; END IF;
  IF NEW.track_assignment_time IS DISTINCT FROM OLD.track_assignment_time AND NOT is_station THEN RAISE EXCEPTION 'Нет прав: track_assignment_time'; END IF;

  IF NEW.wagon_number IS DISTINCT FROM OLD.wagon_number THEN RAISE EXCEPTION 'Только ADMIN может менять номер вагона'; END IF;

  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

-- Создать 7 таблиц
DO $do$
DECLARE
  cargo_tables text[] := ARRAY['cargo_coke','cargo_slag','cargo_knauf_gypsum','cargo_yellow_phosphorus','cargo_ulken_buryl','cargo_tksm','cargo_birlik'];
  tbl text;
BEGIN
  FOREACH tbl IN ARRAY cargo_tables LOOP
    EXECUTE format('CREATE TABLE public.%I (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      wagon_number text NOT NULL,
      asa_arrival_time timestamptz,
      platform_number text,
      balance_ndfz_time timestamptz,
      asa_dispatch_time timestamptz,
      train_number_asa text,
      fosfor_arrival_time timestamptz,
      cargo_submit_time timestamptz,
      cargo_operations text,
      request_submit_time timestamptz,
      track_assignment_time timestamptz,
      fosfor_dispatch_time timestamptz,
      train_number_fosfor text,
      asa_return_arrival_time timestamptz,
      asa_handover_time timestamptz,
      note text,
      created_by uuid,
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now()
    )', tbl);
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', tbl);
    EXECUTE format('CREATE POLICY "auth_select" ON public.%I FOR SELECT TO authenticated USING (true)', tbl);
    EXECUTE format('CREATE POLICY "auth_insert" ON public.%I FOR INSERT TO authenticated WITH CHECK (auth.uid() = created_by)', tbl);
    EXECUTE format('CREATE POLICY "auth_update" ON public.%I FOR UPDATE TO authenticated USING (true)', tbl);
    EXECUTE format('CREATE POLICY "admin_delete" ON public.%I FOR DELETE TO authenticated USING (public.has_role(auth.uid(), ''ADMIN''))', tbl);
    EXECUTE format('CREATE TRIGGER enforce_perms BEFORE UPDATE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.enforce_cargo_wagon_permissions()', tbl);
    EXECUTE format('ALTER PUBLICATION supabase_realtime ADD TABLE public.%I', tbl);
    EXECUTE format('ALTER TABLE public.%I REPLICA IDENTITY FULL', tbl);
  END LOOP;
END $do$;
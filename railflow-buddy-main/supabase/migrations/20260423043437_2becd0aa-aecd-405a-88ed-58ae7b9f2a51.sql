
-- Roles enum
CREATE TYPE public.app_role AS ENUM ('ADMIN', 'ASU', 'OFFICE', 'DISPATCH', 'STATION');

-- user_roles table
CREATE TABLE public.user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role public.app_role NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, role)
);

ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

-- Security definer function
CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role public.app_role)
RETURNS BOOLEAN
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id AND role = _role
  )
$$;

-- Get all roles for a user (returns array)
CREATE OR REPLACE FUNCTION public.get_user_roles(_user_id UUID)
RETURNS public.app_role[]
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(ARRAY_AGG(role), ARRAY[]::public.app_role[])
  FROM public.user_roles WHERE user_id = _user_id
$$;

-- RLS policies for user_roles
CREATE POLICY "Users can view their own roles"
ON public.user_roles FOR SELECT
TO authenticated
USING (auth.uid() = user_id);

CREATE POLICY "Admins can view all roles"
ON public.user_roles FOR SELECT
TO authenticated
USING (public.has_role(auth.uid(), 'ADMIN'));

CREATE POLICY "Admins can insert roles"
ON public.user_roles FOR INSERT
TO authenticated
WITH CHECK (public.has_role(auth.uid(), 'ADMIN'));

CREATE POLICY "Admins can delete roles"
ON public.user_roles FOR DELETE
TO authenticated
USING (public.has_role(auth.uid(), 'ADMIN'));

-- Profiles table
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT,
  full_name TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own profile"
ON public.profiles FOR SELECT TO authenticated
USING (auth.uid() = id);

CREATE POLICY "Admins can view all profiles"
ON public.profiles FOR SELECT TO authenticated
USING (public.has_role(auth.uid(), 'ADMIN'));

CREATE POLICY "Users can update own profile"
ON public.profiles FOR UPDATE TO authenticated
USING (auth.uid() = id);

-- Trigger: on signup create profile, first user becomes ADMIN
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE PLPGSQL
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  user_count INTEGER;
BEGIN
  INSERT INTO public.profiles (id, email, full_name)
  VALUES (NEW.id, NEW.email, COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.email));

  SELECT COUNT(*) INTO user_count FROM public.profiles;
  IF user_count = 1 THEN
    INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'ADMIN');
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER on_auth_user_created
AFTER INSERT ON auth.users
FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Wagons table
CREATE TABLE public.wagons (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  wagon_number TEXT NOT NULL,
  asa_arrival_time TIMESTAMPTZ,
  platform_number TEXT,
  balance_ndfz_time TIMESTAMPTZ,
  asa_dispatch_time TIMESTAMPTZ,
  train_number_asa TEXT,
  fosfor_arrival_time TIMESTAMPTZ,
  cargo_submit_time TIMESTAMPTZ,
  cargo_operations TEXT,
  request_submit_time TIMESTAMPTZ,
  track_assignment_time TIMESTAMPTZ,
  fosfor_dispatch_time TIMESTAMPTZ,
  train_number_fosfor TEXT,
  asa_return_arrival_time TIMESTAMPTZ,
  asa_handover_time TIMESTAMPTZ,
  note TEXT,
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX wagons_wagon_number_idx ON public.wagons (wagon_number);
CREATE INDEX wagons_created_at_idx ON public.wagons (created_at DESC);

ALTER TABLE public.wagons ENABLE ROW LEVEL SECURITY;

-- Anyone authenticated can view wagons
CREATE POLICY "Authenticated users can view wagons"
ON public.wagons FOR SELECT TO authenticated
USING (true);

-- Anyone authenticated can insert (creates a wagon record)
CREATE POLICY "Authenticated users can insert wagons"
ON public.wagons FOR INSERT TO authenticated
WITH CHECK (auth.uid() = created_by);

-- Anyone authenticated can update (field-level enforcement happens client-side + via column-level via trigger below)
CREATE POLICY "Authenticated users can update wagons"
ON public.wagons FOR UPDATE TO authenticated
USING (true);

-- Only ADMIN can delete
CREATE POLICY "Admins can delete wagons"
ON public.wagons FOR DELETE TO authenticated
USING (public.has_role(auth.uid(), 'ADMIN'));

-- Trigger: enforce role-based field updates server-side
CREATE OR REPLACE FUNCTION public.enforce_wagon_field_permissions()
RETURNS TRIGGER
LANGUAGE PLPGSQL
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  is_admin BOOLEAN;
  is_asu BOOLEAN;
  is_office BOOLEAN;
  is_dispatch BOOLEAN;
  is_station BOOLEAN;
BEGIN
  is_admin := public.has_role(auth.uid(), 'ADMIN');
  IF is_admin THEN
    NEW.updated_at := now();
    RETURN NEW;
  END IF;

  is_asu := public.has_role(auth.uid(), 'ASU');
  is_office := public.has_role(auth.uid(), 'OFFICE');
  is_dispatch := public.has_role(auth.uid(), 'DISPATCH');
  is_station := public.has_role(auth.uid(), 'STATION');

  -- ASU fields
  IF NEW.asa_arrival_time IS DISTINCT FROM OLD.asa_arrival_time AND NOT is_asu THEN
    RAISE EXCEPTION 'Нет прав на редактирование asa_arrival_time';
  END IF;
  IF NEW.asa_dispatch_time IS DISTINCT FROM OLD.asa_dispatch_time AND NOT is_asu THEN
    RAISE EXCEPTION 'Нет прав на редактирование asa_dispatch_time';
  END IF;
  IF NEW.train_number_asa IS DISTINCT FROM OLD.train_number_asa AND NOT is_asu THEN
    RAISE EXCEPTION 'Нет прав на редактирование train_number_asa';
  END IF;
  IF NEW.asa_return_arrival_time IS DISTINCT FROM OLD.asa_return_arrival_time AND NOT is_asu THEN
    RAISE EXCEPTION 'Нет прав на редактирование asa_return_arrival_time';
  END IF;
  IF NEW.asa_handover_time IS DISTINCT FROM OLD.asa_handover_time AND NOT is_asu THEN
    RAISE EXCEPTION 'Нет прав на редактирование asa_handover_time';
  END IF;

  -- OFFICE fields
  IF NEW.balance_ndfz_time IS DISTINCT FROM OLD.balance_ndfz_time AND NOT is_office THEN
    RAISE EXCEPTION 'Нет прав на редактирование balance_ndfz_time';
  END IF;
  IF NEW.note IS DISTINCT FROM OLD.note AND NOT is_office THEN
    RAISE EXCEPTION 'Нет прав на редактирование note';
  END IF;

  -- DISPATCH fields
  IF NEW.fosfor_dispatch_time IS DISTINCT FROM OLD.fosfor_dispatch_time AND NOT is_dispatch THEN
    RAISE EXCEPTION 'Нет прав на редактирование fosfor_dispatch_time';
  END IF;
  IF NEW.train_number_fosfor IS DISTINCT FROM OLD.train_number_fosfor AND NOT is_dispatch THEN
    RAISE EXCEPTION 'Нет прав на редактирование train_number_fosfor';
  END IF;

  -- STATION fields
  IF NEW.platform_number IS DISTINCT FROM OLD.platform_number AND NOT is_station THEN
    RAISE EXCEPTION 'Нет прав на редактирование platform_number';
  END IF;
  IF NEW.fosfor_arrival_time IS DISTINCT FROM OLD.fosfor_arrival_time AND NOT is_station THEN
    RAISE EXCEPTION 'Нет прав на редактирование fosfor_arrival_time';
  END IF;
  IF NEW.cargo_submit_time IS DISTINCT FROM OLD.cargo_submit_time AND NOT is_station THEN
    RAISE EXCEPTION 'Нет прав на редактирование cargo_submit_time';
  END IF;
  IF NEW.cargo_operations IS DISTINCT FROM OLD.cargo_operations AND NOT is_station THEN
    RAISE EXCEPTION 'Нет прав на редактирование cargo_operations';
  END IF;
  IF NEW.request_submit_time IS DISTINCT FROM OLD.request_submit_time AND NOT is_station THEN
    RAISE EXCEPTION 'Нет прав на редактирование request_submit_time';
  END IF;
  IF NEW.track_assignment_time IS DISTINCT FROM OLD.track_assignment_time AND NOT is_station THEN
    RAISE EXCEPTION 'Нет прав на редактирование track_assignment_time';
  END IF;

  -- wagon_number can only be changed by ADMIN
  IF NEW.wagon_number IS DISTINCT FROM OLD.wagon_number THEN
    RAISE EXCEPTION 'Только ADMIN может менять номер вагона';
  END IF;

  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER wagons_enforce_field_perms
BEFORE UPDATE ON public.wagons
FOR EACH ROW EXECUTE FUNCTION public.enforce_wagon_field_permissions();

-- Realtime
ALTER TABLE public.wagons REPLICA IDENTITY FULL;

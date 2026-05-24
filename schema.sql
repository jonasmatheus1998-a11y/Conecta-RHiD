create extension if not exists pgcrypto with schema extensions;

create table if not exists public.conecta_admins (
  id uuid primary key default gen_random_uuid(),
  email text not null unique,
  name text not null,
  password_hash text not null,
  created_at timestamptz not null default now()
);

create table if not exists public.conecta_employees (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  role text not null,
  email text not null unique,
  code text not null unique,
  password_hash text not null,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.conecta_records (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid not null references public.conecta_employees(id),
  action text not null check (action in ('entrada', 'intervalo', 'retorno', 'saida')),
  timestamp timestamptz not null default now(),
  date date not null default ((now() at time zone 'America/Sao_Paulo')::date),
  latitude double precision not null,
  longitude double precision not null,
  accuracy double precision not null,
  location jsonb not null,
  photo text not null,
  created_at timestamptz not null default now()
);

create table if not exists public.conecta_sessions (
  token uuid primary key default gen_random_uuid(),
  type text not null check (type in ('admin', 'employee')),
  employee_id uuid references public.conecta_employees(id),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '12 hours')
);

alter table public.conecta_admins enable row level security;
alter table public.conecta_employees enable row level security;
alter table public.conecta_records enable row level security;
alter table public.conecta_sessions enable row level security;

revoke all on public.conecta_admins from anon, authenticated;
revoke all on public.conecta_employees from anon, authenticated;
revoke all on public.conecta_records from anon, authenticated;
revoke all on public.conecta_sessions from anon, authenticated;

insert into public.conecta_admins (email, name, password_hash)
select 'admin@conecta.com', 'Administrador', extensions.crypt('admin123', extensions.gen_salt('bf'))
where not exists (select 1 from public.conecta_admins where email = 'admin@conecta.com');

insert into public.conecta_employees (name, role, email, code, password_hash)
select 'Funcionário 1', 'Equipe', 'funcionario1@conectaiba.com.br', 'CET-001', extensions.crypt('123456', extensions.gen_salt('bf'))
where not exists (select 1 from public.conecta_employees where code = 'CET-001');

insert into public.conecta_employees (name, role, email, code, password_hash)
select 'Funcionário 2', 'Equipe', 'funcionario2@conectaiba.com.br', 'CET-002', extensions.crypt('123456', extensions.gen_salt('bf'))
where not exists (select 1 from public.conecta_employees where code = 'CET-002');

insert into public.conecta_employees (name, role, email, code, password_hash)
select 'Funcionário 3', 'Equipe', 'funcionario3@conectaiba.com.br', 'CET-003', extensions.crypt('123456', extensions.gen_salt('bf'))
where not exists (select 1 from public.conecta_employees where code = 'CET-003');

insert into public.conecta_employees (name, role, email, code, password_hash)
select 'Funcionário 4', 'Equipe', 'funcionario4@conectaiba.com.br', 'CET-004', extensions.crypt('123456', extensions.gen_salt('bf'))
where not exists (select 1 from public.conecta_employees where code = 'CET-004');

insert into public.conecta_employees (name, role, email, code, password_hash)
select 'Funcionário 5', 'Equipe', 'funcionario5@conectaiba.com.br', 'CET-005', extensions.crypt('123456', extensions.gen_salt('bf'))
where not exists (select 1 from public.conecta_employees where code = 'CET-005');

create or replace function public.conecta_employee_json(p_employee public.conecta_employees)
returns jsonb
language sql
stable
as $$
  select jsonb_build_object(
    'id', p_employee.id,
    'name', p_employee.name,
    'role', p_employee.role,
    'email', p_employee.email,
    'code', p_employee.code,
    'active', p_employee.active,
    'hasPassword', p_employee.password_hash is not null
  );
$$;

create or replace function public.conecta_record_json(p_record public.conecta_records)
returns jsonb
language sql
stable
as $$
  select jsonb_build_object(
    'id', p_record.id,
    'employeeId', p_record.employee_id,
    'action', p_record.action,
    'timestamp', p_record.timestamp,
    'date', p_record.date,
    'location', p_record.location,
    'photo', p_record.photo
  );
$$;

create or replace function public.conecta_require_session(p_token uuid)
returns public.conecta_sessions
language plpgsql
security definer
set search_path = public
as $$
declare
  v_session public.conecta_sessions;
begin
  delete from public.conecta_sessions where expires_at < now();

  select * into v_session
  from public.conecta_sessions
  where token = p_token and expires_at >= now();

  if v_session.token is null then
    raise exception 'Sessão inválida ou expirada.';
  end if;

  return v_session;
end;
$$;

create or replace function public.login_conecta(p_mode text, p_identifier text, p_password text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_admin public.conecta_admins;
  v_employee public.conecta_employees;
  v_token uuid;
begin
  if p_mode = 'admin' then
    select * into v_admin
    from public.conecta_admins
    where lower(email) = lower(trim(p_identifier));

    if v_admin.id is null or v_admin.password_hash <> extensions.crypt(p_password, v_admin.password_hash) then
      raise exception 'Login de administrador inválido.';
    end if;

    insert into public.conecta_sessions(type)
    values ('admin')
    returning token into v_token;

    return jsonb_build_object(
      'token', v_token,
      'type', 'admin',
      'employeeId', null,
      'user', jsonb_build_object('name', v_admin.name, 'role', 'Admin')
    );
  end if;

  select * into v_employee
  from public.conecta_employees
  where lower(email) = lower(trim(p_identifier)) and active = true;

  if v_employee.id is null or v_employee.password_hash <> extensions.crypt(p_password, v_employee.password_hash) then
    raise exception 'E-mail ou senha do funcionário inválidos.';
  end if;

  insert into public.conecta_sessions(type, employee_id)
  values ('employee', v_employee.id)
  returning token into v_token;

  return jsonb_build_object(
    'token', v_token,
    'type', 'employee',
    'employeeId', v_employee.id,
    'user', public.conecta_employee_json(v_employee)
  );
end;
$$;

create or replace function public.logout_conecta(p_token uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  delete from public.conecta_sessions where token = p_token;
  return jsonb_build_object('ok', true);
end;
$$;

create or replace function public.state_conecta(p_token uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_session public.conecta_sessions;
  v_employees jsonb;
  v_records jsonb;
begin
  v_session := public.conecta_require_session(p_token);

  if v_session.type = 'admin' then
    select coalesce(jsonb_agg(public.conecta_employee_json(e) order by e.name), '[]'::jsonb)
    into v_employees
    from public.conecta_employees e;

    select coalesce(jsonb_agg(public.conecta_record_json(r) order by r.timestamp), '[]'::jsonb)
    into v_records
    from public.conecta_records r;
  else
    select coalesce(jsonb_agg(public.conecta_employee_json(e) order by e.name), '[]'::jsonb)
    into v_employees
    from public.conecta_employees e
    where e.id = v_session.employee_id;

    select coalesce(jsonb_agg(public.conecta_record_json(r) order by r.timestamp), '[]'::jsonb)
    into v_records
    from public.conecta_records r
    where r.employee_id = v_session.employee_id;
  end if;

  return jsonb_build_object('employees', v_employees, 'records', v_records);
end;
$$;

create or replace function public.save_employee_conecta(
  p_token uuid,
  p_id uuid,
  p_name text,
  p_role text,
  p_email text,
  p_code text,
  p_password text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_session public.conecta_sessions;
  v_employee public.conecta_employees;
  v_code text;
begin
  v_session := public.conecta_require_session(p_token);
  if v_session.type <> 'admin' then
    raise exception 'Acesso restrito ao administrador.';
  end if;

  if trim(coalesce(p_name, '')) = '' or trim(coalesce(p_role, '')) = '' or trim(coalesce(p_email, '')) = '' then
    raise exception 'Nome, cargo e e-mail são obrigatórios.';
  end if;

  if trim(p_email) !~* '^[^@\s]+@[^@\s]+\.[^@\s]+$' then
    raise exception 'Informe um e-mail válido para o funcionário.';
  end if;

  v_code := nullif(trim(coalesce(p_code, '')), '');
  if v_code is null then
    v_code := upper(regexp_replace(split_part(trim(p_email), '@', 1), '[^a-zA-Z0-9]+', '', 'g'));
    if v_code = '' then
      v_code := 'FUNC' || substr(extensions.gen_random_uuid()::text, 1, 8);
    end if;
    v_code := 'CET-' || left(v_code, 12);
  end if;

  if p_id is not null and exists (select 1 from public.conecta_employees where id = p_id) then
    update public.conecta_employees
    set name = trim(p_name),
        role = trim(p_role),
        email = lower(trim(p_email)),
        code = v_code,
        password_hash = case when coalesce(p_password, '') = '' then password_hash else extensions.crypt(p_password, extensions.gen_salt('bf')) end,
        updated_at = now()
    where id = p_id
    returning * into v_employee;
  else
    if coalesce(p_password, '') = '' then
      raise exception 'Senha é obrigatória para novo funcionário.';
    end if;

    insert into public.conecta_employees(name, role, email, code, password_hash)
    values (trim(p_name), trim(p_role), lower(trim(p_email)), v_code, extensions.crypt(p_password, extensions.gen_salt('bf')))
    returning * into v_employee;
  end if;

  return jsonb_build_object('employee', public.conecta_employee_json(v_employee));
end;
$$;

create or replace function public.toggle_employee_conecta(p_token uuid, p_employee_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_session public.conecta_sessions;
  v_employee public.conecta_employees;
begin
  v_session := public.conecta_require_session(p_token);
  if v_session.type <> 'admin' then
    raise exception 'Acesso restrito ao administrador.';
  end if;

  update public.conecta_employees
  set active = not active,
      updated_at = now()
  where id = p_employee_id
  returning * into v_employee;

  if v_employee.id is null then
    raise exception 'Funcionário não encontrado.';
  end if;

  return jsonb_build_object('employee', public.conecta_employee_json(v_employee));
end;
$$;

create or replace function public.save_record_conecta(
  p_token uuid,
  p_employee_id uuid,
  p_action text,
  p_location jsonb,
  p_photo text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_session public.conecta_sessions;
  v_employee_id uuid;
  v_last_action text;
  v_record public.conecta_records;
  v_latitude double precision;
  v_longitude double precision;
  v_accuracy double precision;
begin
  v_session := public.conecta_require_session(p_token);
  v_employee_id := case when v_session.type = 'admin' then p_employee_id else v_session.employee_id end;

  if not exists (select 1 from public.conecta_employees where id = v_employee_id and active = true) then
    raise exception 'Funcionário inválido.';
  end if;

  if p_action not in ('entrada', 'intervalo', 'retorno', 'saida') then
    raise exception 'Tipo de registro inválido.';
  end if;

  v_latitude := (p_location->>'latitude')::double precision;
  v_longitude := (p_location->>'longitude')::double precision;
  v_accuracy := (p_location->>'accuracy')::double precision;

  if v_latitude is null or v_longitude is null or v_accuracy is null or coalesce(p_photo, '') not like 'data:image/%' then
    raise exception 'Foto e GPS são obrigatórios.';
  end if;

  select action into v_last_action
  from public.conecta_records
  where employee_id = v_employee_id
    and date = ((now() at time zone 'America/Sao_Paulo')::date)
  order by timestamp desc
  limit 1;

  if not (
    (p_action = 'entrada' and (v_last_action is null or v_last_action = 'saida')) or
    (p_action = 'intervalo' and v_last_action in ('entrada', 'retorno')) or
    (p_action = 'retorno' and v_last_action = 'intervalo') or
    (p_action = 'saida' and v_last_action in ('entrada', 'retorno'))
  ) then
    raise exception 'Registro inválido agora.';
  end if;

  insert into public.conecta_records(employee_id, action, latitude, longitude, accuracy, location, photo)
  values (v_employee_id, p_action, v_latitude, v_longitude, v_accuracy, p_location, p_photo)
  returning * into v_record;

  return jsonb_build_object('record', public.conecta_record_json(v_record));
end;
$$;

create or replace function public.backup_conecta(p_token uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_session public.conecta_sessions;
begin
  v_session := public.conecta_require_session(p_token);
  if v_session.type <> 'admin' then
    raise exception 'Acesso restrito ao administrador.';
  end if;

  return jsonb_build_object(
    'exportedAt', now(),
    'employees', (
      select coalesce(jsonb_agg(public.conecta_employee_json(e) order by e.name), '[]'::jsonb)
      from public.conecta_employees e
    ),
    'records', (
      select coalesce(jsonb_agg(public.conecta_record_json(r) order by r.timestamp), '[]'::jsonb)
      from public.conecta_records r
    )
  );
end;
$$;

grant execute on function public.login_conecta(text, text, text) to anon, authenticated;
grant execute on function public.logout_conecta(uuid) to anon, authenticated;
grant execute on function public.state_conecta(uuid) to anon, authenticated;
grant execute on function public.save_employee_conecta(uuid, uuid, text, text, text, text, text) to anon, authenticated;
grant execute on function public.toggle_employee_conecta(uuid, uuid) to anon, authenticated;
grant execute on function public.save_record_conecta(uuid, uuid, text, jsonb, text) to anon, authenticated;
grant execute on function public.backup_conecta(uuid) to anon, authenticated;

revoke execute on function public.conecta_require_session(uuid) from public, anon, authenticated;

alter table public.conecta_employees
  add column if not exists email text;

update public.conecta_employees
set email = lower(code) || '@conectaiba.com.br'
where email is null or trim(email) = '';

alter table public.conecta_employees
  alter column email set not null;

create unique index if not exists conecta_employees_email_lower_key
  on public.conecta_employees (lower(email));

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

drop function if exists public.save_employee_conecta(uuid, uuid, text, text, text, text);

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

grant execute on function public.login_conecta(text, text, text) to anon, authenticated;
grant execute on function public.save_employee_conecta(uuid, uuid, text, text, text, text, text) to anon, authenticated;

notify pgrst, 'reload schema';

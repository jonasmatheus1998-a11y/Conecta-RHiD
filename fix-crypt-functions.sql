create extension if not exists pgcrypto with schema extensions;

update public.conecta_admins
set password_hash = extensions.crypt('admin123', extensions.gen_salt('bf'))
where email = 'admin@conecta.com'
  and password_hash not like '$2%';

update public.conecta_employees
set password_hash = extensions.crypt('123456', extensions.gen_salt('bf'))
where code in ('CET-001', 'CET-002', 'CET-003', 'CET-004', 'CET-005')
  and password_hash not like '$2%';

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
  where lower(code) = lower(trim(p_identifier)) and active = true;

  if v_employee.id is null or v_employee.password_hash <> extensions.crypt(p_password, v_employee.password_hash) then
    raise exception 'Código ou senha do funcionário inválidos.';
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

create or replace function public.save_employee_conecta(
  p_token uuid,
  p_id uuid,
  p_name text,
  p_role text,
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
begin
  v_session := public.conecta_require_session(p_token);
  if v_session.type <> 'admin' then
    raise exception 'Acesso restrito ao administrador.';
  end if;

  if trim(coalesce(p_name, '')) = '' or trim(coalesce(p_role, '')) = '' or trim(coalesce(p_code, '')) = '' then
    raise exception 'Nome, cargo e código são obrigatórios.';
  end if;

  if p_id is not null and exists (select 1 from public.conecta_employees where id = p_id) then
    update public.conecta_employees
    set name = trim(p_name),
        role = trim(p_role),
        code = trim(p_code),
        password_hash = case when coalesce(p_password, '') = '' then password_hash else extensions.crypt(p_password, extensions.gen_salt('bf')) end,
        updated_at = now()
    where id = p_id
    returning * into v_employee;
  else
    if coalesce(p_password, '') = '' then
      raise exception 'Senha é obrigatória para novo funcionário.';
    end if;

    insert into public.conecta_employees(name, role, code, password_hash)
    values (trim(p_name), trim(p_role), trim(p_code), extensions.crypt(p_password, extensions.gen_salt('bf')))
    returning * into v_employee;
  end if;

  return jsonb_build_object('employee', public.conecta_employee_json(v_employee));
end;
$$;

grant execute on function public.login_conecta(text, text, text) to anon, authenticated;
grant execute on function public.save_employee_conecta(uuid, uuid, text, text, text, text) to anon, authenticated;

notify pgrst, 'reload schema';

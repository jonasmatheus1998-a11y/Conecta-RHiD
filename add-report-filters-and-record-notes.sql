alter table public.conecta_records
  add column if not exists note text;

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
    'photo', p_record.photo,
    'note', p_record.note
  );
$$;

drop function if exists public.save_record_conecta(uuid, uuid, text, jsonb, text);

create or replace function public.save_record_conecta(
  p_token uuid,
  p_employee_id uuid,
  p_action text,
  p_location jsonb,
  p_photo text,
  p_note text
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

  insert into public.conecta_records(employee_id, action, latitude, longitude, accuracy, location, photo, note)
  values (v_employee_id, p_action, v_latitude, v_longitude, v_accuracy, p_location, p_photo, nullif(trim(coalesce(p_note, '')), ''))
  returning * into v_record;

  return jsonb_build_object('record', public.conecta_record_json(v_record));
end;
$$;

grant execute on function public.save_record_conecta(uuid, uuid, text, jsonb, text, text) to anon, authenticated;

notify pgrst, 'reload schema';

-- Activity Logs migration for the Apartment Management System.
-- Run this file in Supabase SQL Editor after the existing schema.sql.

create table if not exists public.activity_logs (
  id bigint generated always as identity primary key,
  user_id uuid references public.profiles(id) on delete set null,
  actor_name text not null default 'Unknown user',
  actor_role text,
  module text not null,
  action text not null,
  description text not null,
  entity_type text,
  entity_id text,
  old_values jsonb,
  new_values jsonb,
  created_at timestamptz not null default now()
);

create index if not exists activity_logs_created_at_idx
  on public.activity_logs(created_at desc);
create index if not exists activity_logs_user_id_idx
  on public.activity_logs(user_id, created_at desc);
create index if not exists activity_logs_module_action_idx
  on public.activity_logs(module, action, created_at desc);

alter table public.activity_logs enable row level security;

 drop policy if exists "activity logs admin read" on public.activity_logs;
create policy "activity logs admin read" on public.activity_logs
  for select to authenticated
  using (public.current_app_role() = 'admin');

revoke all on public.activity_logs from anon, authenticated;
grant select on public.activity_logs to authenticated;

-- The trigger runs as its owner so ordinary users cannot insert, edit, or
-- delete audit history directly. It records the authenticated actor and full
-- row snapshots for the application tables below.
create or replace function public.write_activity_log()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_old jsonb;
  v_new jsonb;
  v_actor_id uuid;
  v_actor_name text := 'System';
  v_actor_role text;
  v_module text;
  v_action text;
  v_entity_id text;
  v_entity_label text;
  v_description text;
begin
  if tg_op = 'INSERT' then
    v_old := null;
    v_new := to_jsonb(new);
  elsif tg_op = 'UPDATE' then
    v_old := to_jsonb(old);
    v_new := to_jsonb(new);
    if v_old = v_new then
      return new;
    end if;
  else
    v_old := to_jsonb(old);
    v_new := null;
  end if;

  v_actor_id := auth.uid();
  if v_actor_id is not null then
    select coalesce(nullif(p.full_name, ''), p.email, 'Unknown user'), p.role::text
      into v_actor_name, v_actor_role
      from public.profiles p
      where p.id = v_actor_id;
  end if;

  v_module := case tg_table_name
    when 'profiles' then 'Accounts'
    when 'units' then 'Units'
    when 'tenants' then 'Tenants'
    when 'bills' then 'Billing'
    when 'payments' then 'Payments'
    when 'maintenance_requests' then 'Maintenance'
    when 'maintenance_updates' then 'Maintenance'
    else 'System'
  end;

  v_entity_id := coalesce(v_new ->> 'id', v_old ->> 'id');
  v_entity_label := coalesce(
    v_new ->> 'receipt_no', v_old ->> 'receipt_no',
    v_new ->> 'bill_no', v_old ->> 'bill_no',
    v_new ->> 'request_no', v_old ->> 'request_no',
    v_new ->> 'unit_number', v_old ->> 'unit_number',
    nullif(concat_ws(' ', coalesce(v_new ->> 'first_name', v_old ->> 'first_name'), coalesce(v_new ->> 'last_name', v_old ->> 'last_name')), ''),
    v_entity_id
  );

  if tg_op = 'INSERT' then
    v_action := case when tg_table_name = 'payments' then 'Recorded' else 'Created' end;
  elsif tg_op = 'DELETE' then
    v_action := 'Deleted';
  elsif (v_old ? 'status') and (v_new ->> 'status') is distinct from (v_old ->> 'status') then
    v_action := case when v_new ->> 'status' = 'completed' then 'Completed' else 'Status Changed' end;
  else
    v_action := 'Updated';
  end if;

  v_description := v_action || ' ' || lower(v_module);
  if v_entity_label is not null then
    v_description := v_description || ' · ' || v_entity_label;
  end if;

  insert into public.activity_logs (
    user_id, actor_name, actor_role, module, action, description,
    entity_type, entity_id, old_values, new_values
  ) values (
    v_actor_id, coalesce(v_actor_name, 'Unknown user'), v_actor_role,
    v_module, v_action, v_description, tg_table_name, v_entity_id,
    v_old, v_new
  );

  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

-- Recreate triggers safely so this migration can be applied again.
do $$
declare
  t text;
begin
  foreach t in array array[
    'profiles', 'units', 'tenants', 'bills', 'payments',
    'maintenance_requests', 'maintenance_updates'
  ] loop
    execute format('drop trigger if exists activity_log_%I on public.%I', t, t);
    execute format(
      'create trigger activity_log_%I after insert or update or delete on public.%I for each row execute function public.write_activity_log()',
      t, t
    );
  end loop;
end;
$$;

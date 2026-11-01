-- Apartment Management System: Supabase PostgreSQL schema
-- Run once in Supabase SQL Editor on a new project.

create extension if not exists pgcrypto;

create type public.app_role as enum ('admin', 'tenant');
create type public.unit_status as enum ('vacant', 'occupied', 'maintenance');
create type public.tenant_status as enum ('active', 'inactive');
create type public.bill_status as enum ('unpaid', 'partially_paid', 'paid', 'void');
create type public.payment_method as enum ('cash', 'bank_transfer', 'e_wallet', 'other');
create type public.maintenance_category as enum ('plumbing', 'electrical', 'structural', 'appliance', 'cleaning', 'other');
create type public.maintenance_priority as enum ('low', 'normal', 'high', 'urgent');
create type public.maintenance_status as enum ('pending', 'in_progress', 'completed', 'cancelled');

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text not null default '',
  email text not null unique,
  role public.app_role not null default 'tenant',
  created_at timestamptz not null default now()
);

create table public.units (
  id bigint generated always as identity primary key,
  unit_number text not null unique,
  monthly_rent numeric(12,2) not null check (monthly_rent >= 0),
  status public.unit_status not null default 'vacant',
  description text,
  created_at timestamptz not null default now()
);

create table public.tenants (
  id bigint generated always as identity primary key,
  user_id uuid unique references auth.users(id) on delete set null,
  unit_id bigint references public.units(id) on delete restrict,
  first_name text not null,
  last_name text not null,
  phone text,
  email text not null unique,
  address text,
  move_in_date date not null default current_date,
  move_out_date date,
  status public.tenant_status not null default 'active',
  created_at timestamptz not null default now(),
  check (move_out_date is null or move_out_date >= move_in_date)
);

create unique index one_active_tenant_per_unit
on public.tenants(unit_id)
where status = 'active' and unit_id is not null;

create table public.bills (
  id bigint generated always as identity primary key,
  bill_no text not null unique default ('BILL-' || to_char(now(), 'YYYYMMDD') || '-' || upper(substr(encode(gen_random_bytes(4), 'hex'), 1, 8))),
  tenant_id bigint not null references public.tenants(id) on delete restrict,
  billing_month date not null,
  issue_date date not null default current_date,
  due_date date not null,
  amount numeric(12,2) not null check (amount >= 0),
  description text not null default 'Monthly rent',
  status public.bill_status not null default 'unpaid',
  created_at timestamptz not null default now(),
  check (billing_month = date_trunc('month', billing_month)::date),
  check (due_date >= issue_date),
  unique (tenant_id, billing_month)
);

create table public.payments (
  id bigint generated always as identity primary key,
  receipt_no text not null unique default ('RCP-' || to_char(now(), 'YYYYMMDD') || '-' || upper(substr(encode(gen_random_bytes(4), 'hex'), 1, 8))),
  bill_id bigint not null references public.bills(id) on delete restrict,
  amount numeric(12,2) not null check (amount > 0),
  payment_date date not null default current_date,
  payment_method public.payment_method not null default 'cash',
  reference_no text,
  recorded_by uuid references public.profiles(id) on delete set null,
  notes text,
  created_at timestamptz not null default now()
);

create table public.maintenance_requests (
  id bigint generated always as identity primary key,
  request_no text not null unique default ('MR-' || to_char(now(), 'YYYYMMDD') || '-' || upper(substr(encode(gen_random_bytes(4), 'hex'), 1, 8))),
  tenant_id bigint not null references public.tenants(id) on delete restrict,
  unit_id bigint not null references public.units(id) on delete restrict,
  title text not null,
  description text not null,
  category public.maintenance_category not null default 'other',
  priority public.maintenance_priority not null default 'normal',
  status public.maintenance_status not null default 'pending',
  request_date timestamptz not null default now(),
  completed_at timestamptz,
  resolution_notes text,
  created_at timestamptz not null default now()
);

create table public.maintenance_updates (
  id bigint generated always as identity primary key,
  request_id bigint not null references public.maintenance_requests(id) on delete cascade,
  updated_by uuid references public.profiles(id) on delete set null,
  old_status public.maintenance_status,
  new_status public.maintenance_status not null,
  remarks text,
  created_at timestamptz not null default now()
);

create index tenants_unit_id_idx on public.tenants(unit_id);
create index tenants_name_idx on public.tenants(last_name, first_name);
create index bills_tenant_status_due_idx on public.bills(tenant_id, status, due_date);
create index payments_bill_id_idx on public.payments(bill_id);
create index maintenance_status_date_idx on public.maintenance_requests(status, request_date desc);
create index maintenance_tenant_id_idx on public.maintenance_requests(tenant_id);
create index maintenance_unit_id_idx on public.maintenance_requests(unit_id);
create index maintenance_updates_request_id_idx on public.maintenance_updates(request_id, created_at desc);


-- Prevent payments from exceeding the bill total, and keep bill status in sync.
create or replace function public.check_payment_amount()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  bill_total numeric(12,2);
  already_paid numeric(12,2);
begin
  select amount into bill_total
  from public.bills
  where id = new.bill_id
  for update;

  if bill_total is null then
    raise exception 'Bill not found.';
  end if;

  select coalesce(sum(amount), 0) into already_paid
  from public.payments
  where bill_id = new.bill_id
    and (tg_op = 'INSERT' or id <> new.id);

  if already_paid + new.amount > bill_total then
    raise exception 'Payment exceeds the remaining bill balance.';
  end if;

  return new;
end;
$$;

create trigger payment_amount_guard
before insert or update on public.payments
for each row execute function public.check_payment_amount();

create or replace function public.refresh_bill_status()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  target_bill_id bigint;
  bill_total numeric(12,2);
  paid_total numeric(12,2);
begin
  target_bill_id := coalesce(new.bill_id, old.bill_id);

  select amount into bill_total from public.bills where id = target_bill_id;
  select coalesce(sum(amount), 0) into paid_total
  from public.payments where bill_id = target_bill_id;

  update public.bills
  set status = case
    when status = 'void' then 'void'::public.bill_status
    when paid_total >= bill_total then 'paid'::public.bill_status
    when paid_total > 0 then 'partially_paid'::public.bill_status
    else 'unpaid'::public.bill_status
  end
  where id = target_bill_id;

  if tg_op = 'UPDATE' and old.bill_id <> new.bill_id then
    select amount into bill_total from public.bills where id = old.bill_id;
    select coalesce(sum(amount), 0) into paid_total
    from public.payments where bill_id = old.bill_id;
    update public.bills
    set status = case
      when status = 'void' then 'void'::public.bill_status
      when paid_total >= bill_total then 'paid'::public.bill_status
      when paid_total > 0 then 'partially_paid'::public.bill_status
      else 'unpaid'::public.bill_status
    end
    where id = old.bill_id;
  end if;

  return null;
end;
$$;

create trigger payment_status_refresh
after insert or update or delete on public.payments
for each row execute function public.refresh_bill_status();

-- Create a profile automatically when an Auth user is created.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, full_name, email, role)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'full_name', ''),
    coalesce(new.email, ''),
    'tenant'
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created
after insert on auth.users
for each row execute procedure public.handle_new_user();

-- Helper: current user's role. SECURITY DEFINER avoids recursive RLS on profiles.
create or replace function public.current_app_role()
returns public.app_role
language sql
stable
security definer
set search_path = ''
as $$
  select role from public.profiles where id = auth.uid()
$$;

create or replace function public.current_tenant_id()
returns bigint
language sql
stable
security definer
set search_path = ''
as $$
  select id from public.tenants where user_id = auth.uid() limit 1
$$;

alter table public.profiles enable row level security;
alter table public.units enable row level security;
alter table public.tenants enable row level security;
alter table public.bills enable row level security;
alter table public.payments enable row level security;
alter table public.maintenance_requests enable row level security;
alter table public.maintenance_updates enable row level security;

-- Profiles: users see their own profile; admins can see/manage all profiles.
create policy "profile self read" on public.profiles
for select to authenticated
using (id = auth.uid() or public.current_app_role() = 'admin');

create policy "profile admin update" on public.profiles
for update to authenticated
using (public.current_app_role() = 'admin')
with check (public.current_app_role() = 'admin');

-- Units: tenants can see their assigned unit; admins can manage all units.
create policy "units read for admin or assigned tenant" on public.units
for select to authenticated
using (
  public.current_app_role() = 'admin'
  or exists (select 1 from public.tenants t where t.unit_id = units.id and t.user_id = auth.uid() and t.status = 'active')
);
create policy "units admin insert" on public.units
for insert to authenticated with check (public.current_app_role() = 'admin');
create policy "units admin update" on public.units
for update to authenticated using (public.current_app_role() = 'admin') with check (public.current_app_role() = 'admin');
create policy "units admin delete" on public.units
for delete to authenticated using (public.current_app_role() = 'admin');

-- Tenant rows: tenants see only their own; admins manage all.
create policy "tenants read own or admin" on public.tenants
for select to authenticated
using (user_id = auth.uid() or public.current_app_role() = 'admin');
create policy "tenants admin insert" on public.tenants
for insert to authenticated with check (public.current_app_role() = 'admin');
create policy "tenants admin update" on public.tenants
for update to authenticated using (public.current_app_role() = 'admin') with check (public.current_app_role() = 'admin');
create policy "tenants admin delete" on public.tenants
for delete to authenticated using (public.current_app_role() = 'admin');

-- Bills: tenant can read bills belonging to their linked tenant record.
create policy "bills read own or admin" on public.bills
for select to authenticated
using (public.current_app_role() = 'admin' or tenant_id = public.current_tenant_id());
create policy "bills admin insert" on public.bills
for insert to authenticated with check (public.current_app_role() = 'admin');
create policy "bills admin update" on public.bills
for update to authenticated using (public.current_app_role() = 'admin') with check (public.current_app_role() = 'admin');
create policy "bills admin delete" on public.bills
for delete to authenticated using (public.current_app_role() = 'admin');

-- Payments: tenants see payments on their own bills; admins manage.
create policy "payments read own or admin" on public.payments
for select to authenticated
using (
  public.current_app_role() = 'admin'
  or exists (select 1 from public.bills b where b.id = payments.bill_id and b.tenant_id = public.current_tenant_id())
);
create policy "payments admin insert" on public.payments
for insert to authenticated with check (public.current_app_role() = 'admin');
create policy "payments admin update" on public.payments
for update to authenticated using (public.current_app_role() = 'admin') with check (public.current_app_role() = 'admin');
create policy "payments admin delete" on public.payments
for delete to authenticated using (public.current_app_role() = 'admin');

-- Maintenance: tenants can create/read their own requests, admins manage all.
create policy "maintenance read own or admin" on public.maintenance_requests
for select to authenticated
using (public.current_app_role() = 'admin' or tenant_id = public.current_tenant_id());
create policy "maintenance tenant create own" on public.maintenance_requests
for insert to authenticated
with check (
  tenant_id = public.current_tenant_id()
  and exists (select 1 from public.tenants t where t.id = maintenance_requests.tenant_id and t.unit_id = maintenance_requests.unit_id and t.user_id = auth.uid() and t.status = 'active')
);
create policy "maintenance admin insert" on public.maintenance_requests
for insert to authenticated with check (public.current_app_role() = 'admin');
create policy "maintenance admin update" on public.maintenance_requests
for update to authenticated using (public.current_app_role() = 'admin') with check (public.current_app_role() = 'admin');
create policy "maintenance admin delete" on public.maintenance_requests
for delete to authenticated using (public.current_app_role() = 'admin');

-- Updates: tenants can read updates for their own requests; only admins can write updates.
create policy "maintenance updates read own or admin" on public.maintenance_updates
for select to authenticated
using (
  public.current_app_role() = 'admin'
  or exists (
    select 1 from public.maintenance_requests mr
    where mr.id = maintenance_updates.request_id
      and mr.tenant_id = public.current_tenant_id()
  )
);
create policy "maintenance updates admin insert" on public.maintenance_updates
for insert to authenticated
with check (public.current_app_role() = 'admin' and updated_by = auth.uid());
create policy "maintenance updates admin update" on public.maintenance_updates
for update to authenticated using (public.current_app_role() = 'admin') with check (public.current_app_role() = 'admin');
create policy "maintenance updates admin delete" on public.maintenance_updates
for delete to authenticated using (public.current_app_role() = 'admin');

grant usage on schema public to authenticated;
grant select, insert, update, delete on public.profiles, public.units, public.tenants, public.bills, public.payments, public.maintenance_requests, public.maintenance_updates to authenticated;
grant usage, select on all sequences in schema public to authenticated;

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

-- Proprietários reais: nenhum registro de titularidade é inventado nesta migração.
-- Aplicar somente no corte coordenado com a versão que usa o papel nova7_app.
revoke create on schema public from public;
create schema nova7_private;
revoke all on schema nova7_private from public;
do $$ begin
 if not exists(select 1 from pg_roles where rolname='nova7_app') then create role nova7_app nologin nosuperuser nocreatedb nocreaterole noinherit nobypassrls; end if;
 if exists(select 1 from pg_roles where rolname='nova7_app'and(rolsuper or rolbypassrls or rolcreatedb or rolcreaterole))then raise exception 'Papel nova7_app preexistente com privilégios incompatíveis.';end if;
 alter role nova7_app nologin noinherit;
 execute format('grant nova7_app to %I',current_user);
end $$;
alter table users add column is_platform_admin boolean not null default false,
 add column created_by uuid references users(id) on delete set null;
update users set is_platform_admin=true where role='admin';
alter table users drop constraint users_role_check;
alter table users add constraint users_role_check check(role in ('admin','owner','manager','employee','editor','viewer'));
create table owners (
 id uuid primary key default gen_random_uuid(),
 name text not null check(length(name) between 2 and 160),
 email text, phone text, document text,
 status text not null default 'active' check(status in ('active','suspended')),
 notes text not null default '',
 created_by uuid references users(id),created_at timestamptz not null default now(),updated_at timestamptz not null default now()
);
create table owner_user_links (
 owner_id uuid not null references owners(id) on delete restrict,
 user_id uuid not null references users(id) on delete restrict,
 active boolean not null default true,created_at timestamptz not null default now(),
 primary key(owner_id,user_id)
);
create index owner_user_links_user_idx on owner_user_links(user_id) where active;
create table subscriptions (
 id uuid primary key default gen_random_uuid(),owner_id uuid not null unique references owners(id),
 plan_name text not null check(length(plan_name) between 1 and 120),
 status text not null default 'active' check(status in ('active','suspended','cancelled')),
 starts_on date not null default current_date,ends_on date,
 updated_at timestamptz not null default now(),check(ends_on is null or ends_on>=starts_on)
);
create table subscription_limits (
 owner_id uuid primary key references owners(id),
 max_companies integer not null check(max_companies between 1 and 10000),
 max_branches integer not null check(max_branches between 1 and 100000),
 max_users integer not null check(max_users between 1 and 100000)
);
alter table brands rename to companies;
alter table companies add column owner_id uuid references owners(id),
 add column ownership_status text not null default 'unverified' check(ownership_status in ('unverified','confirmed')),
 add column segment text not null default '',add column legal_name text,add column document text,
 add column email text,add column phone text,add column active boolean not null default true,
 add constraint companies_ownership_shape check((owner_id is null and ownership_status='unverified') or (owner_id is not null and ownership_status='confirmed'));
create index companies_owner_idx on companies(owner_id);
create view brands with(security_invoker=true) as select * from companies;
alter table branches add column company_id uuid generated always as (brand_id) stored not null;
create table employee_memberships (
 id uuid primary key default gen_random_uuid(),user_id uuid not null references users(id),
 company_id uuid not null references companies(id),branch_id uuid,
 role text not null check(role in ('manager','employee','viewer')),
 permissions jsonb not null default '{}'::jsonb,
 active boolean not null default true,created_by uuid references users(id),created_at timestamptz not null default now(),
 foreign key(branch_id,company_id) references branches(id,brand_id)
);
create unique index employee_memberships_scope_idx on employee_memberships(user_id,company_id,coalesce(branch_id,'00000000-0000-0000-0000-000000000000'::uuid));
create index employee_memberships_user_idx on employee_memberships(user_id,company_id,branch_id) where active;
-- Só vínculos explícitos do modelo anterior são preservados; null não vira acesso a todas as empresas.
insert into employee_memberships(user_id,company_id,role,permissions)
 select u.id,c.id,case when u.role='viewer' then 'viewer' else 'employee' end,
 jsonb_build_object('planning',case when u.role='viewer' then 'read' else 'write' end,'products',case when u.role='viewer' then 'read' else 'write' end,'promotions',case when u.role='viewer' then 'read' else 'write' end,'media',case when u.role='viewer' then 'read' else 'write' end,'results',case when u.role='viewer' then 'read' else 'write' end,'design',case when u.role='viewer' then 'read' else 'write' end)
 from users u join companies c on c.id=any(u.brand_ids) where not u.is_platform_admin;
create table ownership_transfers (
 id uuid primary key default gen_random_uuid(),company_id uuid not null references companies(id),
 previous_owner_id uuid references owners(id),new_owner_id uuid not null references owners(id),
 reason text not null check(length(reason) between 5 and 1000),changed_by uuid not null references users(id),changed_at timestamptz not null default now()
);
create table branch_product_prices (
 company_id uuid not null references companies(id),branch_id uuid not null,product_id uuid not null references products(id),
 price numeric(12,2) not null check(price>=0),stock numeric(14,3),updated_at timestamptz not null default now(),
 primary key(branch_id,product_id),foreign key(branch_id,company_id) references branches(id,brand_id)
);
-- Sessão própria: o cliente nunca fornece UUID de ator como prova de autorização.
-- O servidor injeta apenas o hash do cookie validado e o escopo solicitado por transação.
create function nova7_private.actor() returns uuid language sql stable security definer set search_path='' as $$
 select u.id from public.sessions s join public.users u on u.id=s.user_id
 where s.token_hash=current_setting('nova7.session_hash',true) and s.revoked_at is null and s.expires_at>now() and u.active
 and (u.is_platform_admin or not exists(select 1 from public.owner_user_links l join public.owners o on o.id=l.owner_id where l.user_id=u.id and l.active and o.status='suspended')) limit 1
$$;
create function nova7_private.platform_admin() returns boolean language sql stable security definer set search_path='' as $$
 select coalesce((select is_platform_admin from public.users where id=nova7_private.actor()),false)
$$;
create function nova7_private.owns_owner(target uuid) returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.owner_user_links l join public.owners o on o.id=l.owner_id where l.user_id=nova7_private.actor() and l.owner_id=target and l.active and o.status='active')
$$;
create function nova7_private.company_access(target uuid,unit uuid,feature text,writing boolean) returns boolean language plpgsql stable security definer set search_path='' as $$
declare actor_id uuid:=nova7_private.actor();owner uuid;begin
 if actor_id is null then return false;end if;
 if nova7_private.platform_admin() then return true;end if;
 if target is null then return false;end if;
 select c.owner_id into owner from public.companies c join public.owners o on o.id=c.owner_id join public.subscriptions s on s.owner_id=o.id where c.id=target and c.active and o.status='active' and s.status='active' and s.starts_on<=current_date and (s.ends_on is null or s.ends_on>=current_date);
 if owner is null then return false;end if;
 if unit is not null and not exists(select 1 from public.branches b where b.id=unit and b.brand_id=target and b.active)then return false;end if;
 if nova7_private.owns_owner(owner)then return true;end if;
 return exists(select 1 from public.employee_memberships m where m.user_id=actor_id and m.company_id=target and m.active
  and (m.branch_id is null or unit=m.branch_id or (unit is null and not writing))
  and (m.branch_id is null or exists(select 1 from public.branches b where b.id=m.branch_id and b.active))
  and (m.role='manager' or (not writing and (m.role='viewer' or m.permissions->>feature in ('read','write'))) or (writing and m.role<>'viewer' and m.permissions->>feature='write')));
end $$;
create function nova7_private.active_company() returns uuid language sql stable security definer set search_path='' as $$
 select c.id from public.companies c where c.slug=current_setting('nova7.company_slug',true) and nova7_private.company_access(c.id,null,'context',false) limit 1
$$;
create function nova7_private.active_branch() returns uuid language sql stable security definer set search_path='' as $$
 select b.id from public.branches b where b.id::text=current_setting('nova7.branch_id',true) and b.brand_id=nova7_private.active_company() and nova7_private.company_access(b.brand_id,b.id,'context',false) limit 1
$$;
create function nova7_private.manage_company(target uuid) returns boolean language sql stable security definer set search_path='' as $$
 select nova7_private.platform_admin() or exists(select 1 from public.companies c where c.id=target and nova7_private.owns_owner(c.owner_id) and nova7_private.company_access(c.id,null,'context',false)) or exists(select 1 from public.employee_memberships m where m.company_id=target and m.user_id=nova7_private.actor() and m.active and m.branch_id is null and m.role='manager' and nova7_private.company_access(target,null,'context',false))
$$;
create function nova7_private.visible_user(target uuid) returns boolean language sql stable security definer set search_path='' as $$
 select nova7_private.platform_admin() or target=nova7_private.actor() or exists(select 1 from public.users u where u.id=target and u.created_by=nova7_private.actor() and not u.is_platform_admin) or exists(select 1 from public.employee_memberships m where m.user_id=target and m.active and nova7_private.manage_company(m.company_id))
$$;

alter table account_metric_snapshots add column company_id uuid generated always as (brand_id) stored;

alter table approvals add column company_id uuid generated always as (brand_id) stored;

alter table brand_kits add column company_id uuid generated always as (brand_id) stored;

alter table brand_targets add column company_id uuid generated always as (brand_id) stored;

alter table campaign_instances add column company_id uuid generated always as (brand_id) stored;

alter table campaign_links add column company_id uuid generated always as (brand_id) stored;

alter table campaign_templates add column company_id uuid generated always as (brand_id) stored;

alter table campaigns add column company_id uuid generated always as (brand_id) stored;

alter table content_asset_links add column company_id uuid generated always as (brand_id) stored;

alter table content_requests add column company_id uuid generated always as (brand_id) stored;

alter table external_publications add column company_id uuid generated always as (brand_id) stored;

alter table insight_decisions add column company_id uuid generated always as (brand_id) stored;

alter table inspirations add column company_id uuid generated always as (brand_id) stored;

alter table integration_accounts add column company_id uuid generated always as (brand_id) stored;

alter table integration_sync_runs add column company_id uuid generated always as (brand_id) stored;

alter table knowledge add column company_id uuid generated always as (brand_id) stored;

alter table media_assets add column company_id uuid generated always as (brand_id) stored;

alter table notification_events add column company_id uuid generated always as (brand_id) stored;

alter table plan_imports add column company_id uuid generated always as (brand_id) stored;

alter table posts add column company_id uuid generated always as (brand_id) stored;

alter table presentations add column company_id uuid generated always as (brand_id) stored;

alter table promo_campaigns add column company_id uuid generated always as (brand_id) stored;

alter table promo_grouping_memory add column company_id uuid generated always as (brand_id) stored;

alter table promo_grouping_rules add column company_id uuid generated always as (brand_id) stored;

alter table promo_imports add column company_id uuid generated always as (brand_id) stored;

alter table promo_library add column company_id uuid generated always as (brand_id) stored;

alter table reference_accounts add column company_id uuid generated always as (brand_id) stored;

alter table reports add column company_id uuid generated always as (brand_id) stored;

alter table research_notes add column company_id uuid generated always as (brand_id) stored;
alter table products add column company_id uuid references companies(id);
alter table product_images add column company_id uuid references companies(id);
alter table promo_themes add column company_id uuid references companies(id);
alter table integration_credentials add column company_id uuid references companies(id);
alter table products add column branch_id uuid references branches(id);
alter table product_images add column branch_id uuid references branches(id);
alter table promo_campaigns add column branch_id uuid references branches(id);
alter table promo_imports add column branch_id uuid references branches(id);
alter table campaigns add column branch_id uuid references branches(id);
alter table knowledge add column branch_id uuid references branches(id);
alter table insight_decisions add column branch_id uuid references branches(id);
alter table integration_sync_runs add column branch_id uuid references branches(id);
alter table research_notes add column branch_id uuid references branches(id);
alter table promo_themes add column visibility text not null default 'legacy' check(visibility in ('legacy','company','platform'));
alter table promo_themes alter column visibility set default 'company';
alter table promo_library add column visibility text not null default 'legacy' check(visibility in ('legacy','company','platform'));
alter table promo_library alter column visibility set default 'company';
update promo_library set visibility='company' where brand_id is not null;
alter table promo_campaigns add column visibility text not null default 'legacy' check(visibility in ('legacy','company','platform'));
alter table promo_campaigns alter column visibility set default 'company';
update promo_campaigns set visibility='company' where brand_id is not null;

alter table integration_accounts drop constraint integration_accounts_provider_kind_account_name_key;
alter table integration_accounts add constraint integration_accounts_company_account_key unique nulls not distinct(provider,kind,account_name,brand_id);
alter table integration_credentials add column id uuid not null default gen_random_uuid();
alter table integration_credentials drop constraint integration_credentials_pkey;
alter table integration_credentials add primary key(id);
alter table integration_credentials add constraint integration_credentials_scope_key unique nulls not distinct(provider,company_id);
drop index products_ean_idx;
create unique index products_ean_idx on products(company_id,ean) where ean is not null;
drop index products_name_noean_idx;
create unique index products_name_noean_idx on products(company_id,name_key) where ean is null;
drop index product_images_sha_idx;
create unique index product_images_sha_idx on product_images(company_id,coalesce(product_id,'00000000-0000-0000-0000-000000000000'::uuid),sha256);
alter table promo_library drop constraint promo_library_sha256_key;
create unique index promo_library_company_sha_idx on promo_library(coalesce(company_id,'00000000-0000-0000-0000-000000000000'::uuid),sha256);

create function nova7_private.parent_spec(t text) returns text[] language sql immutable set search_path='' as $$ select case t
when 'approval_events' then array['approvals','approval_id']
when 'campaign_template_deliverables' then array['campaign_templates','template_id']
when 'content_versions' then array['posts','post_id']
when 'media_asset_tags' then array['media_assets','asset_id']
when 'media_blobs' then array['media_assets','asset_id']
when 'notification_user_state' then array['notification_events','event_id']
when 'post_checklist_items' then array['posts','post_id']
when 'post_comments' then array['posts','post_id']
when 'post_products' then array['posts','post_id']
when 'post_status_events' then array['posts','post_id']
when 'presentation_chunks' then array['presentations','presentation_id']
when 'promo_assets' then array['promo_campaigns','campaign_id']
when 'promo_items' then array['promo_campaigns','campaign_id']
when 'promo_item_audit' then array['promo_campaigns','campaign_id']
when 'promo_versions' then array['promo_campaigns','campaign_id']
when 'studio_pages' then array['promo_campaigns','campaign_id']
when 'promo_theme_assets' then array['promo_themes','theme_id']
when 'promo_theme_arts' then array['promo_themes','theme_id']
when 'promo_theme_versions' then array['promo_themes','theme_id']
when 'publication_metric_snapshots' then array['external_publications','publication_id']
else null end $$;

create function nova7_private.record(t text,ident text) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare r jsonb;begin
 if t not in ('approvals','branches','campaign_templates','campaigns','companies','content_versions','external_publications','media_assets','notification_events','posts','presentations','product_images','products','promo_campaigns','promo_library','promo_themes') then return null;end if;
 execute format('select to_jsonb(r) from public.%I r where id::text=$1',t) into r using ident;return r;
end $$;
create function nova7_private.company_of(t text,r jsonb) returns uuid language plpgsql stable security definer set search_path='' as $$
declare spec text[];begin
 if r is null then return null;end if;
 if t='companies' then return (r->>'id')::uuid;end if;
 if r->>'company_id' is not null then return (r->>'company_id')::uuid;end if;
 if r->>'brand_id' is not null then return (r->>'brand_id')::uuid;end if;
 spec:=nova7_private.parent_spec(t);if spec is null then return null;end if;
 return nova7_private.company_of(spec[1],nova7_private.record(spec[1],r->>spec[2]));
end $$;
create function nova7_private.branch_of(t text,r jsonb) returns uuid language plpgsql stable security definer set search_path='' as $$
declare spec text[];begin
 if r is null then return null;end if;
 if t='branches'then return(r->>'id')::uuid;end if;
 if r->>'branch_id'is not null then return(r->>'branch_id')::uuid;end if;
 spec:=nova7_private.parent_spec(t);if spec is null then return null;end if;
 return nova7_private.branch_of(spec[1],nova7_private.record(spec[1],r->>spec[2]));
end $$;
create function nova7_private.feature(t text) returns text language sql immutable set search_path='' as $$ select case
 when t in ('products','product_images','post_products','branch_product_prices')then 'products'
 when t like 'promo_%' or t='studio_pages'then 'promotions'
 when t in ('integration_accounts','integration_credentials','integration_sync_runs','external_publications','publication_metric_snapshots','account_metric_snapshots','brand_targets','reports','insight_decisions','presentations','presentation_chunks')then 'results'
 when t in ('media_assets','media_blobs','media_asset_tags','content_asset_links')then 'media'
 when t='brand_kits'then 'design'
 else 'planning' end $$;
create function nova7_private.row_access(t text,r jsonb,writing boolean) returns boolean language plpgsql stable security definer set search_path='' as $$
declare uid uuid:=nova7_private.actor();c uuid;b uuid;spec text[];parent jsonb;active_c uuid;active_b uuid;begin
 if uid is null then return false;end if;
 if t='users'then return case when writing then nova7_private.platform_admin() or(r->>'id')::uuid=uid or(r->>'created_by')::uuid=uid else nova7_private.visible_user((r->>'id')::uuid)end;end if;
 if t='sessions'then return nova7_private.platform_admin() or(r->>'user_id')::uuid=uid;end if;
 if t in ('login_attempts','alert_sync_state')then return nova7_private.platform_admin();end if;
 if t='audit_events'then return nova7_private.platform_admin() or(r->>'user_id')::uuid=uid;end if;
 if t='owners'then return nova7_private.platform_admin() or(not writing and nova7_private.owns_owner((r->>'id')::uuid));end if;
 if t='owner_user_links'then return nova7_private.platform_admin() or(not writing and(r->>'user_id')::uuid=uid);end if;
 if t in ('subscriptions','subscription_limits')then return nova7_private.platform_admin() or(not writing and nova7_private.owns_owner((r->>'owner_id')::uuid));end if;
 if t='ownership_transfers'then return nova7_private.platform_admin();end if;
 if t='employee_memberships'then return nova7_private.platform_admin() or nova7_private.manage_company((r->>'company_id')::uuid) or(not writing and(r->>'user_id')::uuid=uid);end if;
 if t='companies'then return case when writing then nova7_private.platform_admin() or nova7_private.owns_owner((r->>'owner_id')::uuid) else nova7_private.company_access((r->>'id')::uuid,null,'context',false)end;end if;
 if t='branches'then return case when writing then nova7_private.manage_company((r->>'brand_id')::uuid) or nova7_private.company_access((r->>'brand_id')::uuid,(r->>'id')::uuid,'branch_admin',true) else nova7_private.company_access((r->>'brand_id')::uuid,(r->>'id')::uuid,'context',false)end;end if;
 if t in ('external_sources','external_holidays','external_ipca','cmed_products','external_imports')then return not writing or nova7_private.platform_admin();end if;
 if t='notification_user_state' and(r->>'user_id')::uuid<>uid then return false;end if;
 spec:=nova7_private.parent_spec(t);
 if spec is not null then
  parent:=nova7_private.record(spec[1],r->>spec[2]);if parent is null then return false;end if;
  return nova7_private.row_access(spec[1],parent,writing);
 end if;
 if t='promo_themes'and writing and r->>'official_code'is not null then return nova7_private.manage_company((r->>'company_id')::uuid);end if;
 if r->>'visibility'='platform'then return not writing or nova7_private.platform_admin();end if;
 c:=nova7_private.company_of(t,r);b:=nova7_private.branch_of(t,r);
 if c is null then return nova7_private.platform_admin();end if;
 active_c:=nova7_private.active_company();active_b:=nova7_private.active_branch();
 if active_c is not null and c<>active_c then return false;end if;
 if active_c is null and not nova7_private.platform_admin()then return false;end if;
 if active_b is not null and b is not null and b<>active_b then return false;end if;
 if t in ('promo_grouping_rules','promo_grouping_memory','integration_credentials','integration_accounts','brand_kits')and writing then return nova7_private.manage_company(c);end if;
 return nova7_private.company_access(c,b,nova7_private.feature(t),writing);
end $$;

create function nova7_private.guard_company() returns trigger language plpgsql security definer set search_path='' as $$
declare limits record;company_count int;branch_count int;users_count int;reason text;begin
 if new.owner_id is null then
  if tg_op='INSERT' or old.owner_id is not null then raise exception 'Uma empresa precisa de proprietário confirmado.' using errcode='23514';end if;
  return new;
 end if;
 new.ownership_status:='confirmed';
 if tg_op='UPDATE' and new.owner_id is distinct from old.owner_id then
  reason:=nullif(current_setting('nova7.transfer_reason',true),'');
  if not nova7_private.platform_admin() or length(coalesce(reason,''))<5 then raise exception 'Transferência exige administrador Nova7 e motivo auditável.' using errcode='42501';end if;
 end if;
 perform 1 from public.owners where id=new.owner_id and status='active' for update;
 if not found then raise exception 'Proprietário inexistente ou suspenso.';end if;
 select l.* into limits from public.subscription_limits l join public.subscriptions s on s.owner_id=l.owner_id where l.owner_id=new.owner_id and s.status='active' and s.starts_on<=current_date and(s.ends_on is null or s.ends_on>=current_date);
 if not found then raise exception 'Configure o contrato e os limites do proprietário antes da empresa.';end if;
 select count(*) into company_count from public.companies where owner_id=new.owner_id and id<>new.id;
 if company_count+1>limits.max_companies then raise exception 'Limite de empresas do proprietário atingido.';end if;
 if tg_op='UPDATE' and new.owner_id is distinct from old.owner_id then
  select count(*)into branch_count from public.branches b join public.companies c on c.id=b.brand_id where c.owner_id=new.owner_id or c.id=new.id;
  if branch_count>limits.max_branches then raise exception 'A transferência ultrapassa o limite de filiais do novo proprietário.';end if;
  select count(distinct user_id)into users_count from(
   select l.user_id from public.owner_user_links l where l.owner_id=new.owner_id and l.active
   union select m.user_id from public.employee_memberships m join public.companies c on c.id=m.company_id where m.active and c.owner_id=new.owner_id and c.id<>new.id
  )q;
  if users_count>limits.max_users then raise exception 'A transferência ultrapassa o limite de usuários do novo proprietário.';end if;
  insert into public.ownership_transfers(company_id,previous_owner_id,new_owner_id,reason,changed_by)values(new.id,old.owner_id,new.owner_id,reason,nova7_private.actor());
  update public.employee_memberships set active=false where company_id=new.id;
 end if;
 return new;
end $$;
create trigger company_owner_guard before insert or update on companies for each row execute function nova7_private.guard_company();
create function nova7_private.guard_branch() returns trigger language plpgsql security definer set search_path='' as $$
declare owner uuid;max_count int;used int;begin
 if tg_op='UPDATE'and new.brand_id is distinct from old.brand_id then raise exception 'Filial não pode mudar de empresa por edição comum.';end if;
 select owner_id into owner from public.companies where id=new.brand_id;
 if owner is null then raise exception 'Confirme o proprietário da empresa antes de cadastrar filiais.';end if;
 perform 1 from public.owners where id=owner for update;
 if tg_op='INSERT'then
  select max_branches into max_count from public.subscription_limits where owner_id=owner;
  select count(*)into used from public.branches b join public.companies c on c.id=b.brand_id where c.owner_id=owner;
  if max_count is null or used>=max_count then raise exception 'Limite de filiais do proprietário atingido.';end if;
 end if;
 return new;
end $$;
create trigger branch_owner_guard before insert or update on branches for each row execute function nova7_private.guard_branch();
create function nova7_private.guard_membership()returns trigger language plpgsql security definer set search_path='' as $$
declare owner uuid;max_count int;used int;begin
 select owner_id into owner from public.companies where id=new.company_id;
 if owner is null then raise exception 'A empresa precisa de proprietário antes de vincular funcionários.';end if;
 if new.branch_id is not null and not exists(select 1 from public.branches where id=new.branch_id and brand_id=new.company_id)then raise exception 'A filial não pertence à empresa.';end if;
 if not nova7_private.platform_admin() and exists(select 1 from public.users where id=new.user_id and is_platform_admin)then raise exception 'Um proprietário não pode alterar vínculos da administração Nova7.';end if;
 perform 1 from public.owners where id=owner for update;
 if new.active then
  select max_users into max_count from public.subscription_limits where owner_id=owner;
  select count(distinct id)into used from(select l.user_id as id from public.owner_user_links l where l.owner_id=owner and l.active union select m.user_id from public.employee_memberships m join public.companies c on c.id=m.company_id where c.owner_id=owner and m.active union select new.user_id)u;
  if max_count is null or used>max_count then raise exception 'Limite de usuários do proprietário atingido.';end if;
 end if;
 return new;
end $$;
create trigger membership_limit_guard before insert or update on employee_memberships for each row execute function nova7_private.guard_membership();
create function nova7_private.guard_owner_login()returns trigger language plpgsql security definer set search_path='' as $$
declare maximum int;used int;begin
 perform 1 from public.owners where id=new.owner_id for update;
 if new.active then
  select max_users into maximum from public.subscription_limits where owner_id=new.owner_id;
  select count(distinct id)into used from(
   select l.user_id as id from public.owner_user_links l where l.owner_id=new.owner_id and l.active
   union select m.user_id from public.employee_memberships m join public.companies c on c.id=m.company_id where c.owner_id=new.owner_id and m.active
   union select new.user_id
  )q;
  if maximum is null or used>maximum then raise exception 'Configure o contrato e o limite de usuários antes de vincular o login do proprietário.';end if;
 end if;
 return new;
end $$;
create trigger owner_login_limit_guard before insert or update on owner_user_links for each row execute function nova7_private.guard_owner_login();
create function nova7_private.guard_user()returns trigger language plpgsql security definer set search_path='' as $$
declare uid uuid:=nova7_private.actor();begin
 if uid is null and session_user=current_user and current_setting('role',true) in('none','')then return new;end if;
 if tg_op='INSERT'then
  if not nova7_private.platform_admin()and(new.is_platform_admin or new.role not in('employee','viewer'))then raise exception 'Perfil de plataforma ou proprietário não pode ser criado por funcionário.';end if;
  new.created_by:=uid;
 elsif not nova7_private.platform_admin()then
  if new.is_platform_admin is distinct from old.is_platform_admin or new.role is distinct from old.role or new.active is distinct from old.active or new.brand_ids is distinct from old.brand_ids then raise exception 'Não é permitido elevar privilégios pela conta de usuário.'using errcode='42501';end if;
  if new.id<>uid then raise exception 'Credenciais de outro usuário exigem administração Nova7.'using errcode='42501';end if;
 end if;
 if tg_op='UPDATE'and old.is_platform_admin and old.active and(not new.is_platform_admin or not new.active)and(select count(*)from public.users where is_platform_admin and active and id<>old.id)=0 then raise exception 'Mantenha ao menos um administrador Nova7 ativo.';end if;
 return new;
end $$;
create trigger user_privilege_guard before insert or update on users for each row execute function nova7_private.guard_user();

-- Contexto ativo validado independentemente do seletor; não amplia as permissões.
create or replace function nova7_private.active_company()returns uuid language plpgsql stable security definer set search_path='' as $$
declare requested_slug text:=coalesce(current_setting('nova7.company_slug',true),'');c uuid;begin
 if requested_slug<>''then select id into c from public.companies where companies.slug=requested_slug and nova7_private.company_access(id,null,'context',false);return c;end if;
 if nova7_private.platform_admin()then return null;end if;
 select id into c from public.companies where nova7_private.company_access(id,null,'context',false)order by name,id limit 1;return c;
end $$;
create or replace function nova7_private.active_branch()returns uuid language plpgsql stable security definer set search_path='' as $$
declare ident text:=coalesce(current_setting('nova7.branch_id',true),'');c uuid:=nova7_private.active_company();b uuid;uid uuid:=nova7_private.actor();begin
 if ident<>''then select id into b from public.branches where id::text=ident and brand_id=c and nova7_private.company_access(c,id,'context',false);return b;end if;
 if nova7_private.platform_admin()or exists(select 1 from public.companies where id=c and nova7_private.owns_owner(owner_id))or exists(select 1 from public.employee_memberships where user_id=uid and company_id=c and branch_id is null and active)then return null;end if;
 select m.branch_id into b from public.employee_memberships m join public.branches br on br.id=m.branch_id where m.user_id=uid and m.company_id=c and m.active and br.active order by br.name limit 1;return b;
end $$;
-- Papéis de contexto são leitura de estrutura, não permissão de resultados ou edição.
create or replace function nova7_private.company_access(target uuid,unit uuid,feature text,writing boolean)returns boolean language plpgsql stable security definer set search_path='' as $$
declare actor_id uuid:=nova7_private.actor();owner uuid;begin
 if actor_id is null then return false;end if;
 if nova7_private.platform_admin()then return true;end if;
 if target is null then return false;end if;
 select c.owner_id into owner from public.companies c join public.owners o on o.id=c.owner_id join public.subscriptions s on s.owner_id=o.id where c.id=target and c.active and o.status='active'and s.status='active'and s.starts_on<=current_date and(s.ends_on is null or s.ends_on>=current_date);
 if owner is null then return false;end if;
 if unit is not null and not exists(select 1 from public.branches b where b.id=unit and b.brand_id=target and b.active)then return false;end if;
 if nova7_private.owns_owner(owner)then return true;end if;
 return exists(select 1 from public.employee_memberships m where m.user_id=actor_id and m.company_id=target and m.active and(m.branch_id is null or unit=m.branch_id or(unit is null and not writing))and(m.branch_id is null or exists(select 1 from public.branches where id=m.branch_id and active))and((not writing and(feature='context'or m.permissions->>feature in('read','write')))or(writing and m.role<>'viewer'and m.permissions->>feature='write')));
end $$;

create or replace function nova7_private.record(t text,ident text)returns jsonb language plpgsql stable security definer set search_path='' as $$
declare r jsonb;begin
 if t in('users','sessions','login_attempts','audit_events','integration_credentials')then return null;end if;
 if not exists(select 1 from information_schema.columns where table_schema='public'and table_name=t and column_name='id')then return null;end if;
 execute format('select to_jsonb(r)from public.%I r where id::text=$1',t)into r using ident;return r;
end $$;
create function nova7_private.bind_tenant()returns trigger language plpgsql security definer set search_path='' as $$
declare r jsonb:=to_jsonb(new);prior jsonb;patch jsonb:='{}';c uuid;prior_c uuid;b uuid;parent jsonb;spec text[];fk record;parent_c uuid;value text;ref text;active_c uuid;begin
 if tg_op='UPDATE'then prior:=to_jsonb(old);end if;
 c:=nova7_private.company_of(tg_table_name,r);b:=nova7_private.branch_of(tg_table_name,r);
 if r->>'visibility'='platform'then
  if not nova7_private.platform_admin()then raise exception 'Templates globais são gerenciados pela administração Nova7.'using errcode='42501';end if;
  if tg_table_name='promo_campaigns'and r->>'kind'<>'template'then raise exception 'Apenas modelos universais podem pertencer à plataforma.';end if;
  if c is not null then raise exception 'Um template global não pode conter vínculo privado de empresa.';end if;
 elsif tg_table_name in('products','product_images','promo_themes','promo_library','promo_campaigns','promo_imports','integration_credentials')then
  if tg_table_name='product_images'and r->>'product_id'is not null then
   parent:=nova7_private.record('products',r->>'product_id');parent_c:=nova7_private.company_of('products',parent);
   if parent_c is null then raise exception 'Classifique o produto legado antes de usar sua foto.';end if;
   if c is not null and c<>parent_c then raise exception 'A foto pertence a outra empresa.';end if;c:=parent_c;
  end if;
  if c is null then c:=nova7_private.active_company();end if;
  if c is null then raise exception 'Selecione uma empresa autorizada antes de gravar este recurso.';end if;
  if r?'brand_id'then patch:=patch||jsonb_build_object('brand_id',c);else patch:=patch||jsonb_build_object('company_id',c);end if;
  if r?'visibility'then patch:=patch||jsonb_build_object('visibility','company');end if;
  if r?'branch_id'and b is null then patch:=patch||jsonb_build_object('branch_id',nova7_private.active_branch());end if;
  new:=jsonb_populate_record(new,patch);r:=to_jsonb(new);-- generated company_id is calculated after this trigger
  if r->>'brand_id'is not null then c:=(r->>'brand_id')::uuid;end if;
 end if;
 if tg_op='UPDATE'then
  prior_c:=nova7_private.company_of(tg_table_name,prior);
  if c is distinct from prior_c and not(nova7_private.platform_admin()and length(coalesce(current_setting('nova7.transfer_reason',true),''))>=5)then raise exception 'Classificação ou transferência entre empresas exige administração e motivo.'using errcode='42501';end if;
 end if;
 if c is not null and not exists(select 1 from public.companies where id=c and owner_id is not null)and tg_op='INSERT'then raise exception 'Confirme o proprietário da empresa antes de cadastrar seus dados.';end if;
 b:=nova7_private.branch_of(tg_table_name,r);
 -- Every single-column link to company data must stay in that company. Global templates are the sole explicit exception.
 for fk in select a.attname as col,p.relname as parent from pg_constraint k join pg_class p on p.oid=k.confrelid join pg_attribute a on a.attrelid=k.conrelid and a.attnum=k.conkey[1]where k.conrelid=tg_relid and k.contype='f'and cardinality(k.conkey)=1 loop
  if fk.parent in('users','owners','subscriptions','external_sources','external_holidays','external_ipca','cmed_products','external_imports')then continue;end if;
  value:=r->>fk.col;if value is null then continue;end if;
  parent:=nova7_private.record(fk.parent,value);if parent is null then continue;end if;
  parent_c:=nova7_private.company_of(fk.parent,parent);
  if parent->>'visibility'='platform'then continue;end if;
  if nova7_private.branch_of(fk.parent,parent)is not null and nova7_private.branch_of(fk.parent,parent)is distinct from b then raise exception 'Vínculo privado de filial fora do escopo do registro.'using errcode='42501';end if;
  if c is not null and parent_c is distinct from c then raise exception 'Não é permitido vincular registros de empresas diferentes.'using errcode='42501';end if;
 end loop;
 if r?'photo_image_ids'then
  for ref in select jsonb_array_elements_text(coalesce(r->'photo_image_ids','[]'))loop
   parent:=nova7_private.record('product_images',ref);if nova7_private.branch_of('product_images',parent)is not null and nova7_private.branch_of('product_images',parent)is distinct from b then raise exception 'Fotografia privada de outra filial.'using errcode='42501';end if;if nova7_private.company_of('product_images',parent)is distinct from c then raise exception 'Foto fora da empresa da oferta.'using errcode='42501';end if;
  end loop;
 end if;
 return new;
end $$;
-- Security-definer helpers are private authorization decisions, never public RPCs.
revoke all on all functions in schema nova7_private from public;
do $$declare r text;begin
 foreach r in array array['anon','authenticated','service_role']loop
  if exists(select 1 from pg_roles where rolname=r)then
   execute format('revoke all on schema nova7_private from %I',r);
   execute format('revoke all on all functions in schema nova7_private from %I',r);
  end if;
 end loop;
end $$;
grant usage on schema public,nova7_private to nova7_app;
grant execute on function nova7_private.row_access(text,jsonb,boolean),nova7_private.actor(),nova7_private.platform_admin(),nova7_private.active_company(),nova7_private.active_branch(),nova7_private.manage_company(uuid),nova7_private.owns_owner(uuid)to nova7_app;
do $$declare t record;r text;fields text;row_json text;begin
 for t in select tablename from pg_tables where schemaname='public'and tablename<>'schema_migrations'loop
  execute format('alter table public.%I enable row level security',t.tablename);
  execute format('revoke all on public.%I from public',t.tablename);
  foreach r in array array['anon','authenticated','service_role']loop if exists(select 1 from pg_roles where rolname=r)then execute format('revoke all on public.%I from %I',t.tablename,r);end if;end loop;
  execute format('grant select,insert,update,delete on public.%I to nova7_app',t.tablename);
  -- Policies only serialize authorization keys, never image/file bytes or password hashes.
  select string_agg(format('%L,%I.%I',column_name,t.tablename,column_name),',' order by ordinal_position)into fields
   from information_schema.columns where table_schema='public'and table_name=t.tablename
   and column_name=any(array['id','company_id','brand_id','branch_id','owner_id','user_id','created_by','visibility','official_code','approval_id','template_id','post_id','asset_id','event_id','presentation_id','campaign_id','theme_id','publication_id']);
  row_json:='jsonb_build_object('||coalesce(fields,'')||')';
  execute format('create policy nova7_read on public.%I for select to nova7_app using(nova7_private.row_access(%L,%s,false))',t.tablename,t.tablename,row_json);
  execute format('create policy nova7_insert on public.%I for insert to nova7_app with check(nova7_private.row_access(%L,%s,true))',t.tablename,t.tablename,row_json);
  execute format('create policy nova7_update on public.%I for update to nova7_app using(nova7_private.row_access(%L,%s,true))with check(nova7_private.row_access(%L,%s,true))',t.tablename,t.tablename,row_json,t.tablename,row_json);
  execute format('create policy nova7_delete on public.%I for delete to nova7_app using(nova7_private.row_access(%L,%s,true))',t.tablename,t.tablename,row_json);
  if t.tablename not in('users','sessions','login_attempts','audit_events','owners','owner_user_links','subscriptions','subscription_limits','companies','branches','employee_memberships','ownership_transfers','external_sources','external_holidays','external_ipca','external_imports','cmed_products','alert_sync_state')then execute format('create trigger tenant_link_guard before insert or update on public.%I for each row execute function nova7_private.bind_tenant()',t.tablename);end if;
 end loop;
end $$;
grant select,insert,update,delete on brands to nova7_app;
grant usage,select on all sequences in schema public to nova7_app;
-- Never expose password/session-token hashes through ordinary application queries.
revoke select on users,sessions from nova7_app;
grant select(id,username,username_normalized,role,active,created_at,password_changed_at,display_name,must_change_password,email,brand_ids,is_platform_admin,created_by)on users to nova7_app;
grant select(id,user_id,created_at,expires_at,revoked_at,ip,user_agent)on sessions to nova7_app;
-- Production connections use a dedicated login, provisioned with a secret only at the approved cutover.
do $$begin
 if not exists(select 1 from pg_roles where rolname='nova7_runtime')then create role nova7_runtime nologin nosuperuser nocreatedb nocreaterole inherit nobypassrls;end if;
 if exists(select 1 from pg_roles where rolname='nova7_runtime'and(rolsuper or rolbypassrls or rolcreatedb or rolcreaterole))then raise exception 'Papel nova7_runtime preexistente com privilégios incompatíveis.';end if;
 alter role nova7_runtime nologin inherit;
 grant nova7_app to nova7_runtime;
end $$;

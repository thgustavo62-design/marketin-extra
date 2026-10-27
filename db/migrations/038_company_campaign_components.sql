-- Componentes privados da identidade da empresa. A migração não associa empresas a donos.
alter table promo_themes add column official_code text;
alter table promo_themes drop constraint promo_themes_name_key;
create unique index promo_themes_company_name_idx on promo_themes(coalesce(company_id,'00000000-0000-0000-0000-000000000000'::uuid),name);
create unique index promo_themes_official_idx on promo_themes(company_id,official_code) where official_code is not null;
create table campaign_components(
 id uuid primary key default gen_random_uuid(),company_id uuid not null references companies(id),
 code text not null,name text not null,kind text not null,config jsonb not null,
 theme_id uuid references promo_themes(id),version integer not null default 1,
 created_by uuid references users(id),created_at timestamptz not null default now(),
 unique(company_id,code)
);
alter table campaign_components enable row level security;
revoke all on campaign_components from public;
do $$declare r text;begin
 foreach r in array array['anon','authenticated','service_role']loop
  if exists(select 1 from pg_roles where rolname=r)then execute format('revoke all on campaign_components from %I',r);end if;
 end loop;
end $$;
grant select,insert,update,delete on campaign_components to nova7_app;
create policy component_read on campaign_components for select to nova7_app using(nova7_private.row_access('promo_themes',jsonb_build_object('company_id',company_id),false));
create policy component_insert on campaign_components for insert to nova7_app with check(nova7_private.manage_company(company_id));
create policy component_update on campaign_components for update to nova7_app using(nova7_private.manage_company(company_id))with check(nova7_private.manage_company(company_id));
create policy component_delete on campaign_components for delete to nova7_app using(nova7_private.manage_company(company_id));
create trigger tenant_link_guard before insert or update on campaign_components for each row execute function nova7_private.bind_tenant();
create function nova7_private.official_model_guard()returns trigger language plpgsql security definer set search_path='' as $$
begin
 if (new.official_code is not null or(tg_op='UPDATE'and old.official_code is not null))and not nova7_private.manage_company(new.company_id)then raise exception 'Somente administradores autorizados da empresa podem modificar modelos oficiais.'using errcode='42501';end if;
 return new;
end $$;
revoke all on function nova7_private.official_model_guard()from public;
create trigger official_model_guard before insert or update on promo_themes for each row execute function nova7_private.official_model_guard();
-- Added after official_code exists: ordinary promotion editors may read the
-- official model, but only company administrators may change or delete it.
create policy official_model_insert on promo_themes as restrictive for insert to nova7_app
 with check(official_code is null or nova7_private.manage_company(company_id));
create policy official_model_update on promo_themes as restrictive for update to nova7_app
 using(official_code is null or nova7_private.manage_company(company_id))
 with check(official_code is null or nova7_private.manage_company(company_id));
create policy official_model_delete on promo_themes as restrictive for delete to nova7_app
 using(official_code is null or nova7_private.manage_company(company_id));

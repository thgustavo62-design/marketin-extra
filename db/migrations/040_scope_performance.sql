set local lock_timeout='3s';
-- Cache verified actor, company and branch grants per SQL statement; keep RLS enabled.
-- Resolve the authenticated scope once per statement through a policy initPlan.
create or replace function nova7_private.access_context() returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare uid uuid:=nova7_private.actor(); adm boolean; c uuid; b uuid;
 companies jsonb:='{}'; branches jsonb:='{}'; memberships jsonb:='[]'; owners jsonb:='[]';
begin
 if uid is null then return jsonb_build_object('actor',null,'admin',false);end if;
 select u.is_platform_admin into adm from public.users u where u.id=uid;
 c:=nova7_private.active_company();b:=nova7_private.active_branch();
 if not coalesce(adm,false)then
  select coalesce(jsonb_agg(l.owner_id),'[]')into owners
   from public.owner_user_links l join public.owners o on o.id=l.owner_id
   where l.user_id=uid and l.active and o.status='active';
  select coalesce(jsonb_object_agg(co.id::text,jsonb_build_object('owned',owners ? co.owner_id::text)),'{}')into companies
   from public.companies co join public.owners o on o.id=co.owner_id
   join public.subscriptions s on s.owner_id=o.id
   where co.active and o.status='active' and s.status='active' and s.starts_on<=current_date
    and(s.ends_on is null or s.ends_on>=current_date)
    and(owners ? co.owner_id::text or exists(select 1 from public.employee_memberships m where m.user_id=uid and m.company_id=co.id and m.active));
  select coalesce(jsonb_object_agg(br.id::text,br.brand_id::text),'{}')into branches
   from public.branches br where br.active and companies ? br.brand_id::text;
  select coalesce(jsonb_agg(jsonb_build_object('company',m.company_id,'branch',m.branch_id,'role',m.role,'permissions',m.permissions)),'[]')into memberships
   from public.employee_memberships m where m.user_id=uid and m.active and companies ? m.company_id::text
    and(m.branch_id is null or branches ? m.branch_id::text);
 end if;
 return jsonb_build_object('actor',uid,'admin',coalesce(adm,false),'company',c,'branch',b,
  'companies',companies,'branches',branches,'memberships',memberships,'owners',owners);
end $$;
revoke all on function nova7_private.access_context()from public;
grant execute on function nova7_private.access_context()to nova7_app;

create or replace function nova7_private.company_access_context(target uuid,unit uuid,feature text,writing boolean,ctx jsonb)
returns boolean language plpgsql immutable set search_path='' as $$
begin
 if ctx->>'actor'is null then return false;end if;
 if coalesce((ctx->>'admin')::boolean,false)then return true;end if;
 if target is null or not(ctx->'companies' ? target::text)then return false;end if;
 if unit is not null and ctx->'branches'->>unit::text is distinct from target::text then return false;end if;
 if coalesce((ctx->'companies'->target::text->>'owned')::boolean,false)then return true;end if;
 return exists(select 1 from jsonb_array_elements(ctx->'memberships')m
  where m->>'company'=target::text
   and(m->>'branch'is null or m->>'branch'=unit::text or(unit is null and not writing))
   and((not writing and(feature='context'or m->'permissions'->>feature in('read','write')))
    or(writing and m->>'role'<>'viewer'and m->'permissions'->>feature='write')));
end $$;
revoke all on function nova7_private.company_access_context(uuid,uuid,text,boolean,jsonb)from public;
grant execute on function nova7_private.company_access_context(uuid,uuid,text,boolean,jsonb)to nova7_app;

CREATE OR REPLACE FUNCTION nova7_private.row_access(t text, r jsonb, writing boolean, ctx jsonb)
 RETURNS boolean
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare uid uuid:=(ctx->>'actor')::uuid;c uuid;b uuid;spec text[];parent jsonb;active_c uuid;active_b uuid;begin
 if uid is null then return false;end if;
 if t='users'then return case when writing then coalesce((ctx->>'admin')::boolean,false) or(r->>'id')::uuid=uid or(r->>'created_by')::uuid=uid else nova7_private.visible_user((r->>'id')::uuid)end;end if;
 if t='sessions'then return coalesce((ctx->>'admin')::boolean,false) or(r->>'user_id')::uuid=uid;end if;
 if t in ('login_attempts','alert_sync_state')then return coalesce((ctx->>'admin')::boolean,false);end if;
 if t='audit_events'then return coalesce((ctx->>'admin')::boolean,false) or(r->>'user_id')::uuid=uid;end if;
 if t='owners'then return coalesce((ctx->>'admin')::boolean,false) or(not writing and nova7_private.owns_owner((r->>'id')::uuid));end if;
 if t='owner_user_links'then return coalesce((ctx->>'admin')::boolean,false) or(not writing and(r->>'user_id')::uuid=uid);end if;
 if t in ('subscriptions','subscription_limits')then return coalesce((ctx->>'admin')::boolean,false) or(not writing and nova7_private.owns_owner((r->>'owner_id')::uuid));end if;
 if t='ownership_transfers'then return coalesce((ctx->>'admin')::boolean,false);end if;
 if t='employee_memberships'then return coalesce((ctx->>'admin')::boolean,false) or nova7_private.manage_company((r->>'company_id')::uuid) or(not writing and(r->>'user_id')::uuid=uid);end if;
 if t='companies'then return case when writing then coalesce((ctx->>'admin')::boolean,false) or nova7_private.owns_owner((r->>'owner_id')::uuid) else nova7_private.company_access((r->>'id')::uuid,null,'context',false)end;end if;
 if t='branches'then return case when writing then nova7_private.manage_company((r->>'brand_id')::uuid) or nova7_private.company_access((r->>'brand_id')::uuid,(r->>'id')::uuid,'branch_admin',true) else nova7_private.manage_company((r->>'brand_id')::uuid) or nova7_private.company_access((r->>'brand_id')::uuid,(r->>'id')::uuid,'context',false)end;end if;
 if t in ('external_sources','external_holidays','external_ipca','cmed_products','external_imports')then return not writing or coalesce((ctx->>'admin')::boolean,false);end if;
 if t='notification_user_state' and(r->>'user_id')::uuid<>uid then return false;end if;
 spec:=nova7_private.parent_spec(t);
 if spec is not null then
  parent:=nova7_private.record(spec[1],r->>spec[2]);if parent is null then return false;end if;
  return nova7_private.row_access(spec[1],parent,writing,ctx);
 end if;
 if t='promo_themes'and writing and r->>'official_code'is not null then return nova7_private.manage_company((r->>'company_id')::uuid);end if;
 if r->>'visibility'='platform'then return not writing or coalesce((ctx->>'admin')::boolean,false);end if;
 c:=nova7_private.company_of(t,r);b:=nova7_private.branch_of(t,r);
 if c is null then return coalesce((ctx->>'admin')::boolean,false);end if;
 active_c:=(ctx->>'company')::uuid;active_b:=(ctx->>'branch')::uuid;
 if active_c is not null and c<>active_c then return false;end if;
 if active_c is null and not coalesce((ctx->>'admin')::boolean,false)then return false;end if;
 if active_b is not null and b is not null and b<>active_b then return false;end if;
 if t in ('promo_grouping_rules','promo_grouping_memory','integration_credentials','integration_accounts','brand_kits')and writing then return nova7_private.manage_company(c);end if;
 return nova7_private.company_access_context(c,b,nova7_private.feature(t),writing,ctx);
end $function$
;
revoke all on function nova7_private.row_access(text,jsonb,boolean,jsonb)from public;
grant execute on function nova7_private.row_access(text,jsonb,boolean,jsonb)to nova7_app;
create or replace function nova7_private.row_access(t text,r jsonb,writing boolean)returns boolean
language sql stable security definer set search_path='' as $$
 select nova7_private.row_access(t,r,writing,nova7_private.access_context())
$$;
do $migration$ declare p record;u text;w text;cmd text;begin
 for p in select *from pg_policies where schemaname='public'and policyname in('nova7_read','nova7_insert','nova7_update','nova7_delete')loop
  u:=p.qual;w:=p.with_check;
  if u is not null and u like 'nova7_private.row_access(%'and u not like '%access_context()%'then u:=left(u,length(u)-1)||',(select nova7_private.access_context()))';end if;
  if w is not null and w like 'nova7_private.row_access(%'and w not like '%access_context()%'then w:=left(w,length(w)-1)||',(select nova7_private.access_context()))';end if;
  cmd:=format('alter policy %I on %I.%I',p.policyname,p.schemaname,p.tablename);
  if u is not null then cmd:=cmd||' using('||u||')';end if;
  if w is not null then cmd:=cmd||' with check('||w||')';end if;
  execute cmd;
 end loop;
end $migration$;
CREATE OR REPLACE FUNCTION nova7_private.bind_tenant()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare r jsonb:=to_jsonb(new);prior jsonb;patch jsonb:='{}';c uuid;prior_c uuid;b uuid;parent jsonb;spec text[];fk record;parent_c uuid;value text;ref text;active_c uuid;legacy_admin_edit boolean:=false;begin
 if tg_op='UPDATE'then prior:=to_jsonb(old);end if;
 c:=nova7_private.company_of(tg_table_name,r);b:=nova7_private.branch_of(tg_table_name,r);
 -- Preserve quarantined historical campaigns without silently assigning a company.
 legacy_admin_edit:=tg_table_name='promo_campaigns'and tg_op='UPDATE'
  and prior->>'brand_id'is null and r->>'brand_id'is null
  and prior->>'visibility'='legacy'and r->>'visibility'='legacy'
  and prior->>'id'=r->>'id'and prior->>'kind'=r->>'kind'
  and(prior->>'branch_id')is not distinct from(r->>'branch_id')
  and nova7_private.platform_admin();
 if r->>'visibility'='platform'then
  if not nova7_private.platform_admin()then raise exception 'Templates globais são gerenciados pela administração Nova7.'using errcode='42501';end if;
  if tg_table_name='promo_campaigns'and r->>'kind'<>'template'then raise exception 'Apenas modelos universais podem pertencer à plataforma.';end if;
  if c is not null then raise exception 'Um template global não pode conter vínculo privado de empresa.';end if;
 elsif not legacy_admin_edit and tg_table_name in('products','product_images','promo_themes','promo_library','promo_campaigns','promo_imports','integration_credentials')then
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
end $function$
;

-- Unclassified catalog rows have always been platform-admin-only.
-- Keep that rule as an initPlan instead of dispatching a row function 8,872 times.
alter policy nova7_read on public.products using(
 case when company_id is null then(select nova7_private.platform_admin())
 else nova7_private.row_access('products',jsonb_build_object('id',id,'created_by',created_by,'company_id',company_id,'branch_id',branch_id),false,(select nova7_private.access_context()))end);
alter policy nova7_read on public.product_images using(
 case when company_id is null then(select nova7_private.platform_admin())
 else nova7_private.row_access('product_images',jsonb_build_object('id',id,'created_by',created_by,'company_id',company_id,'branch_id',branch_id),false,(select nova7_private.access_context()))end);

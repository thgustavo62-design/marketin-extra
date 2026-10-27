-- Managers and owners can read the branch they are inserting with RETURNING.
-- PostgreSQL checks SELECT policy before a STABLE lookup can see that new row.
-- Employee reads still require the explicit branch membership check.
create or replace function nova7_private.row_access(t text,r jsonb,writing boolean) returns boolean language plpgsql stable security definer set search_path='' as $$
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
 if t='branches'then return case when writing then nova7_private.manage_company((r->>'brand_id')::uuid) or nova7_private.company_access((r->>'brand_id')::uuid,(r->>'id')::uuid,'branch_admin',true) else nova7_private.manage_company((r->>'brand_id')::uuid) or nova7_private.company_access((r->>'brand_id')::uuid,(r->>'id')::uuid,'context',false)end;end if;
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

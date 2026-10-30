-- Public institutional content is separate from every customer's operational data.
set local lock_timeout = '3s';
create table nova7_private.public_presentation (
  singleton boolean primary key default true check (singleton),
  public_token text not null check (public_token ~ '^[A-Za-z0-9_-]{43}$'),
  token_hash text not null unique check (token_hash ~ '^[a-f0-9]{64}$'),
  published boolean not null default false,
  whatsapp_phone text not null check (whatsapp_phone ~ '^55[1-9][0-9]9[0-9]{8}$'),
  cta_message text not null check (length(cta_message) between 1 and 300),
  version integer not null default 1 check (version > 0),
  updated_at timestamptz not null default now()
);
alter table nova7_private.public_presentation enable row level security;
revoke all on nova7_private.public_presentation from public, anon, authenticated;
grant select, insert, update on nova7_private.public_presentation to nova7_app;
create policy platform_admin_only on nova7_private.public_presentation
  for all to nova7_app
  using ((select nova7_private.platform_admin()))
  with check ((select nova7_private.platform_admin()));

-- Deliberately narrow capability read: anonymous visitors prove possession of a
-- 256-bit public link, not an authenticated identity. The definer can return only
-- the approved contact fields of the currently published singleton. It never
-- reads companies, users, campaigns, credentials or other operational tables.
create function nova7_private.resolve_public_presentation(p_hash text)
returns table (whatsapp_phone text, cta_message text)
language sql stable security definer set search_path = ''
as $function$
  select p.whatsapp_phone, p.cta_message
  from nova7_private.public_presentation p
  where p.singleton and p.published and p.token_hash = p_hash
    and p_hash ~ '^[a-f0-9]{64}$'
$function$;
revoke all on function nova7_private.resolve_public_presentation(text) from public, anon, authenticated;
grant execute on function nova7_private.resolve_public_presentation(text) to nova7_app;

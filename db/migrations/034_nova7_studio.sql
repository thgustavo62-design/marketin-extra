-- Shared Fabric documents for free designs and automatic promotions; legacy layers remain intact.
create table studio_pages (
 campaign_id uuid not null references promo_campaigns(id) on delete cascade,
 format text not null check(format in ('story','feed','a4')),
 page integer not null check(page between 0 and 199),
 scene jsonb not null check(jsonb_typeof(scene)='object'),
 revision integer not null default 1 check(revision>0),
 source_hash text not null,
 updated_by uuid references users(id) on delete set null,
 updated_at timestamptz not null default now(),
 primary key(campaign_id,format,page)
);
alter table studio_pages enable row level security;
-- No public policies: authenticated Next.js server actions use the existing direct Postgres connection.

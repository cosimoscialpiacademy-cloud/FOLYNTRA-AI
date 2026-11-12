-- FOLYNTRA AI starter database PostgreSQL/Supabase
-- Eseguire in Supabase SQL editor, verificare policy con utenti di test separati.
-- Non memorizza segreti API in chiaro.
create extension if not exists pgcrypto;

create table if not exists public.projects (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  marketplace text not null default 'amazon.it',
  locale text not null default 'it-IT',
  status text not null default 'draft' check(status in ('draft','research','writing','review','export_ready','published_by_user')),
  niche_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.niches (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  keyword text not null,
  buyer_persona text,
  marketplace text not null,
  status text not null default 'hypothesis' check(status in ('hypothesis','researched','selected')),
  scores jsonb not null default '{}'::jsonb,
  confidence numeric(5,2) not null default 0 check(confidence >= 0 and confidence <= 100),
  commentary text,
  created_at timestamptz not null default now()
);

alter table public.projects drop constraint if exists projects_niche_fk;
alter table public.projects add constraint projects_niche_fk foreign key(niche_id) references public.niches(id) on delete set null;

create table if not exists public.market_evidence (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  niche_id uuid not null references public.niches(id) on delete cascade,
  metric text not null,
  numeric_value numeric,
  text_value text,
  unit text,
  source_type text not null check(source_type in ('observed','estimated','imported','demo','missing')),
  source_name text not null,
  source_url text,
  observed_at timestamptz,
  methodology text,
  created_at timestamptz not null default now()
);

create table if not exists public.books (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  project_id uuid not null references public.projects(id) on delete cascade,
  title text not null default 'Senza titolo',
  subtitle text,
  author_name text,
  format_kind text not null default 'nonfiction' check(format_kind in ('nonfiction','workbook','cookbook','fiction','illustrated')),
  metadata jsonb not null default '{}'::jsonb,
  outline jsonb not null default '[]'::jsonb,
  ai_generated_text boolean not null default false,
  ai_generated_images boolean not null default false,
  ai_generated_translations boolean not null default false,
  human_reviewed boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.chapters (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  book_id uuid not null references public.books(id) on delete cascade,
  position integer not null check(position > 0),
  title text not null,
  content_md text not null default '',
  word_count integer not null default 0 check(word_count >= 0),
  status text not null default 'draft' check(status in ('draft','generating','generated','reviewed','locked')),
  ai_generated boolean not null default false,
  updated_at timestamptz not null default now(),
  unique(book_id, position)
);

create table if not exists public.book_assets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  book_id uuid not null references public.books(id) on delete cascade,
  asset_kind text not null,
  storage_path text not null,
  source_name text,
  license_info text,
  generated_by_ai boolean not null default false,
  created_at timestamptz not null default now()
);

create table if not exists public.generation_jobs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  book_id uuid references public.books(id) on delete cascade,
  job_type text not null,
  status text not null default 'queued' check(status in ('queued','running','succeeded','failed','cancelled')),
  progress integer not null default 0 check(progress between 0 and 100),
  idempotency_key text not null,
  error_public text,
  result jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(user_id,idempotency_key)
);

create table if not exists public.export_artifacts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  book_id uuid not null references public.books(id) on delete cascade,
  artifact_type text not null,
  storage_path text not null,
  sha256 text,
  qa jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.ad_campaign_plans (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  book_id uuid not null references public.books(id) on delete cascade,
  marketplace text not null,
  plan jsonb not null default '{}'::jsonb,
  status text not null default 'planning' check(status in ('planning','manual_ready','api_approved','active_verified')),
  created_at timestamptz not null default now()
);

create table if not exists public.sales_entries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  book_id uuid not null references public.books(id) on delete cascade,
  sales_date date not null,
  marketplace text not null,
  units integer not null default 0 check(units>=0),
  royalty_amount numeric(14,2) not null default 0,
  currency text not null,
  source_type text not null default 'manual' check(source_type in ('manual','user_kdp_csv','api_authorized')),
  created_at timestamptz not null default now()
);

create table if not exists public.cost_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  book_id uuid references public.books(id) on delete set null,
  provider text not null,
  activity text not null,
  input_tokens integer,
  output_tokens integer,
  cost_minor integer not null default 0,
  currency text not null default 'EUR',
  recorded_at timestamptz not null default now()
);

create index if not exists idx_projects_user on public.projects(user_id);
create index if not exists idx_niches_user on public.niches(user_id);
create index if not exists idx_books_project on public.books(project_id);
create index if not exists idx_chapters_book on public.chapters(book_id,position);
create index if not exists idx_jobs_user_status on public.generation_jobs(user_id,status);
create index if not exists idx_sales_book_date on public.sales_entries(book_id,sales_date);


-- ---------------------------------------------------------------------------
-- Integrazioni FOLYNTRA Fase A (additive rispetto allo starter).
-- ---------------------------------------------------------------------------
-- Dati completi della nicchia (segnali con provenienza, concorrenti, rischi).
alter table public.niches add column if not exists data jsonb not null default '{}'::jsonb;
-- Dati editoriali del capitolo non coperti dalle colonne (riassunto, sezioni, parole obiettivo, origine).
alter table public.chapters add column if not exists meta jsonb not null default '{}'::jsonb;
-- Costi AI in USD con precisione sub-centesimo e modello usato.
alter table public.cost_events add column if not exists cost_usd numeric(12,6) not null default 0;
alter table public.cost_events add column if not exists model text;
-- Il riordino dei capitoli avviene con upsert singoli: il vincolo unico su (book_id, position)
-- lo renderebbe impossibile senza transazione. Resta l'indice idx_chapters_book.
alter table public.chapters drop constraint if exists chapters_book_id_position_key;

create table if not exists public.chapter_revisions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  book_id uuid not null references public.books(id) on delete cascade,
  chapter_id uuid not null references public.chapters(id) on delete cascade,
  content_md text not null default '',
  word_count integer not null default 0 check(word_count >= 0),
  reason text not null default 'salvataggio',
  created_at timestamptz not null default now()
);
create table if not exists public.activity_log (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  book_id uuid references public.books(id) on delete cascade,
  message text not null,
  created_at timestamptz not null default now()
);
create index if not exists idx_revisions_chapter on public.chapter_revisions(chapter_id, created_at);
create index if not exists idx_activity_user on public.activity_log(user_id, created_at);
create index if not exists idx_costs_book on public.cost_events(book_id);
create index if not exists idx_exports_book on public.export_artifacts(book_id);

-- EVERY table must enforce row ownership, and linked writes must not cross tenant boundaries.
-- Below permissive policies are narrowed by WITH CHECK verifying parent rows where relevant.
do $$
declare tbl text;
begin
  foreach tbl in array array['projects','niches','market_evidence','books','chapters','chapter_revisions','activity_log','book_assets','generation_jobs','export_artifacts','ad_campaign_plans','sales_entries','cost_events']
  loop
    execute format('alter table public.%I enable row level security', tbl);
    execute format('drop policy if exists %I on public.%I', 'owner_all_'||tbl, tbl);
    execute format('create policy %I on public.%I for all to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()))', 'owner_all_'||tbl, tbl);
  end loop;
end $$;

-- CRITICAL: prevent user_id=self referencing parent objects owned by another user.
-- Migrate these restrictions before any public deployment.
create or replace function public.owns_project(p_id uuid) returns boolean language sql stable security invoker as $$
  select exists(select 1 from public.projects where id=p_id and user_id=(select auth.uid()));
$$;
create or replace function public.owns_niche(n_id uuid) returns boolean language sql stable security invoker as $$
  select exists(select 1 from public.niches where id=n_id and user_id=(select auth.uid()));
$$;
create or replace function public.owns_book(b_id uuid) returns boolean language sql stable security invoker as $$
  select exists(select 1 from public.books where id=b_id and user_id=(select auth.uid()));
$$;

-- Reinforce linked-object INSERT/UPDATE constraints; `user_id` alone is insufficient.
drop policy if exists project_niche_consistency on public.projects;
create policy project_niche_consistency on public.projects as restrictive for all to authenticated
  using (niche_id is null or public.owns_niche(niche_id))
  with check (niche_id is null or public.owns_niche(niche_id));
drop policy if exists evidence_niche_consistency on public.market_evidence;
create policy evidence_niche_consistency on public.market_evidence as restrictive for all to authenticated
  using (public.owns_niche(niche_id)) with check(public.owns_niche(niche_id));
drop policy if exists book_project_consistency on public.books;
create policy book_project_consistency on public.books as restrictive for all to authenticated
  using (public.owns_project(project_id)) with check(public.owns_project(project_id));
drop policy if exists chapters_book_consistency on public.chapters;
create policy chapters_book_consistency on public.chapters as restrictive for all to authenticated
  using (public.owns_book(book_id)) with check(public.owns_book(book_id));
drop policy if exists assets_book_consistency on public.book_assets;
create policy assets_book_consistency on public.book_assets as restrictive for all to authenticated
  using (public.owns_book(book_id)) with check(public.owns_book(book_id));
drop policy if exists jobs_book_consistency on public.generation_jobs;
create policy jobs_book_consistency on public.generation_jobs as restrictive for all to authenticated
  using (book_id is null or public.owns_book(book_id)) with check(book_id is null or public.owns_book(book_id));
drop policy if exists exports_book_consistency on public.export_artifacts;
create policy exports_book_consistency on public.export_artifacts as restrictive for all to authenticated
  using (public.owns_book(book_id)) with check(public.owns_book(book_id));
drop policy if exists adplans_book_consistency on public.ad_campaign_plans;
create policy adplans_book_consistency on public.ad_campaign_plans as restrictive for all to authenticated
  using (public.owns_book(book_id)) with check(public.owns_book(book_id));
drop policy if exists sales_book_consistency on public.sales_entries;
create policy sales_book_consistency on public.sales_entries as restrictive for all to authenticated
  using (public.owns_book(book_id)) with check(public.owns_book(book_id));
drop policy if exists costs_book_consistency on public.cost_events;
create policy costs_book_consistency on public.cost_events as restrictive for all to authenticated
  using (book_id is null or public.owns_book(book_id)) with check(book_id is null or public.owns_book(book_id));

drop policy if exists revisions_book_consistency on public.chapter_revisions;
create policy revisions_book_consistency on public.chapter_revisions as restrictive for all to authenticated
  using (public.owns_book(book_id)) with check(public.owns_book(book_id));
drop policy if exists activity_book_consistency on public.activity_log;
create policy activity_book_consistency on public.activity_log as restrictive for all to authenticated
  using (book_id is null or public.owns_book(book_id)) with check(book_id is null or public.owns_book(book_id));

-- For production: configure private Supabase Storage buckets and path-based RLS,
-- webhook auth, rate limits, credit control, audit trails, and tests with 2 users.

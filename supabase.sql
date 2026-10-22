-- Fôlego: banco da turma. Cole tudo no Supabase > SQL Editor > Run.

create table if not exists public.activities (
  id          text primary key,
  user_id     uuid not null default auth.uid() references auth.users(id) on delete cascade,
  group_code  text not null check (char_length(group_code) between 1 and 40),
  nick        text not null check (char_length(nick) between 1 and 30),
  type        text not null check (type in ('run','walk','bike')),
  distance_m  real not null check (distance_m >= 0 and distance_m < 500000),
  duration_s  integer not null check (duration_s >= 0 and duration_s < 172800),
  elapsed_s   integer,
  elev_gain   real default 0,
  started_at  timestamptz not null,
  day         date not null,
  track       jsonb,
  splits      jsonb,
  has_track   boolean default false,
  created_at  timestamptz default now()
);
create index if not exists activities_group_time on public.activities (group_code, started_at desc);

create table if not exists public.kudos (
  activity_id text not null references public.activities(id) on delete cascade,
  user_id     uuid not null default auth.uid() references auth.users(id) on delete cascade,
  nick        text,
  created_at  timestamptz default now(),
  primary key (activity_id, user_id)
);

alter table public.activities enable row level security;
alter table public.kudos enable row level security;

-- Todo mundo logado (inclusive login anônimo, sem conta) lê; cada um só mexe no que é seu.
drop policy if exists "ler treinos" on public.activities;
drop policy if exists "criar meus treinos" on public.activities;
drop policy if exists "editar meus treinos" on public.activities;
drop policy if exists "apagar meus treinos" on public.activities;
create policy "ler treinos"          on public.activities for select to authenticated using (true);
create policy "criar meus treinos"   on public.activities for insert to authenticated with check (user_id = auth.uid());
create policy "editar meus treinos"  on public.activities for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "apagar meus treinos"  on public.activities for delete to authenticated using (user_id = auth.uid());

drop policy if exists "ler aplausos" on public.kudos;
drop policy if exists "aplaudir" on public.kudos;
drop policy if exists "desaplaudir" on public.kudos;
create policy "ler aplausos"  on public.kudos for select to authenticated using (true);
create policy "aplaudir"      on public.kudos for insert to authenticated with check (user_id = auth.uid());
create policy "desaplaudir"   on public.kudos for delete to authenticated using (user_id = auth.uid());

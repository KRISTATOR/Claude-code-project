-- Milestone 6: registrations.
--
-- Personal data, deliberately kept out of `records`, search and exports
-- (docs/PLAN.md §3.1). Minimal fields; organizers read and write everything;
-- the person a registration belongs to can read it and fill in only their
-- allergies and emergency contact, through update_my_registration().
-- Rows are hard-deleted (CLAUDE.md: personal data is never soft-deleted).

create table public.registrations (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references public.teams (id) on delete cascade,
  game_id uuid not null references public.records (id) on delete cascade,
  person_id uuid references public.people (id) on delete set null,
  character_id uuid references public.records (id) on delete set null,
  name text not null default '' check (char_length(name) <= 200),
  status text not null default 'applied'
    check (status in ('applied', 'confirmed', 'paid', 'assigned', 'cancelled')),
  is_minor boolean not null default false,
  consent_on_file boolean not null default false,
  allergens text[] not null default '{}' check (cardinality(allergens) <= 20),
  allergies text not null default '' check (char_length(allergies) <= 2000),
  emergency_contact text not null default '' check (char_length(emergency_contact) <= 500),
  note text not null default '' check (char_length(note) <= 4000),
  rev integer not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index registrations_team_idx on public.registrations (team_id);
create index registrations_person_idx on public.registrations (person_id);

-- The game, the character and the person must belong to the registration's team.
create function private.registrations_before_write()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  if not exists (
    select 1 from public.records g where g.id = new.game_id and g.team_id = new.team_id and g.kind = 'game'
  ) then
    raise exception 'game_id must point to a game of the same team';
  end if;
  if new.character_id is not null and not exists (
    select 1 from public.records c
    where c.id = new.character_id and c.team_id = new.team_id and c.kind = 'character'
  ) then
    raise exception 'character_id must point to a character of the same team';
  end if;
  if new.person_id is not null and not exists (
    select 1 from public.people p where p.id = new.person_id and p.team_id = new.team_id
  ) then
    raise exception 'person_id must point to a person of the same team';
  end if;
  if tg_op = 'UPDATE' then
    if new.team_id <> old.team_id then
      raise exception 'registrations cannot move between teams';
    end if;
    new.rev := old.rev + 1;
    new.created_at := old.created_at;
  else
    new.rev := 1;
    new.created_at := now();
  end if;
  new.updated_at := now();
  return new;
end
$$;

create trigger registrations_before_write
before insert or update on public.registrations
for each row execute function private.registrations_before_write();

alter table public.registrations enable row level security;

create policy registrations_select on public.registrations for select to authenticated
  using (
    private.is_organizer(team_id)
    or (person_id is not null and person_id = private.member_person(team_id, (select auth.uid())))
  );
create policy registrations_write on public.registrations for all to authenticated
  using (private.is_organizer(team_id)) with check (private.is_organizer(team_id));

revoke all on public.registrations from anon;
grant select, insert, update, delete on public.registrations to authenticated;

-- The one thing a player or NPC actor may change: their own allergies and
-- emergency contact (rule 8: no writes through RLS for them).
create function public.update_my_registration(
  p_registration uuid,
  p_allergens text[],
  p_allergies text,
  p_emergency_contact text
)
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  reg public.registrations;
begin
  select * into reg from public.registrations where id = p_registration;
  if not found
     or reg.person_id is null
     or reg.person_id is distinct from private.member_person(reg.team_id, auth.uid()) then
    raise exception 'not your registration' using errcode = '42501';
  end if;
  update public.registrations
  set allergens = coalesce(p_allergens, '{}'),
      allergies = coalesce(p_allergies, ''),
      emergency_contact = coalesce(p_emergency_contact, '')
  where id = p_registration;
end
$$;

revoke all on function public.update_my_registration(uuid, text[], text, text) from public, anon;
grant execute on function public.update_my_registration(uuid, text[], text, text) to authenticated;

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    alter publication supabase_realtime add table public.registrations;
  end if;
end $$;

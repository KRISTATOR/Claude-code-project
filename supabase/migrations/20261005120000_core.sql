-- Zázemí core schema (Milestone 1a): teams, people, members, invites, and the
-- generic `records` model with its secrecy rules. See docs/PLAN.md §2.4 and §3.
--
-- Security model in one sentence: read access to a record is decided by
-- private.can_read_as(), and every policy, RPC and preview calls it.

create schema if not exists private;
revoke all on schema private from public;
grant usage on schema private to authenticated;

-- ---------------------------------------------------------------------------
-- Types
-- ---------------------------------------------------------------------------

create type public.member_role as enum ('organizer', 'npc', 'player');
create type public.visibility as enum ('organizers', 'specific', 'everyone');

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------

create table public.teams (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(btrim(name)) between 1 and 120),
  settings jsonb not null default '{}'::jsonb check (jsonb_typeof(settings) = 'object'),
  min_app_version text not null default '0.0.0',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- The team roster. A person may exist without an account (a player who never
-- installs the app) and be linked to one later.
create table public.people (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references public.teams (id) on delete cascade,
  display_name text not null check (char_length(btrim(display_name)) between 1 and 120),
  user_id uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  unique (team_id, user_id)
);
create index people_team_idx on public.people (team_id);

create table public.team_members (
  team_id uuid not null references public.teams (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  person_id uuid not null references public.people (id),
  role public.member_role not null,
  joined_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (team_id, user_id),
  unique (team_id, person_id)
);
create index team_members_user_idx on public.team_members (user_id);

create table public.invites (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references public.teams (id) on delete cascade,
  code text not null unique,
  role public.member_role not null,
  person_id uuid references public.people (id) on delete set null,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  expires_at timestamptz not null,
  max_uses integer not null default 1 check (max_uses between 1 and 200),
  use_count integer not null default 0 check (use_count >= 0),
  revoked_at timestamptz
);
create index invites_team_idx on public.invites (team_id);

create table public.records (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references public.teams (id) on delete cascade,
  kind text not null check (kind ~ '^[a-z][a-z_]{1,40}$'),
  world_id uuid references public.records (id) on delete cascade,
  game_id uuid references public.records (id) on delete cascade,
  parent_id uuid references public.records (id) on delete cascade,
  title text not null default '' check (char_length(title) <= 300),
  data jsonb not null default '{}'::jsonb check (jsonb_typeof(data) = 'object'),
  visibility public.visibility not null default 'organizers',
  -- Rule R5: a child that inherits the audience of its parent's attached people.
  inherit_audience boolean not null default false,
  sort_key text not null default '',
  tags text[] not null default '{}',
  rev integer not null default 1,
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now(),
  updated_by uuid,
  updated_at timestamptz not null default now(),
  deleted_by uuid,
  deleted_at timestamptz
);
create index records_team_updated_idx on public.records (team_id, updated_at);
create index records_parent_idx on public.records (parent_id);
create index records_game_idx on public.records (game_id);
create index records_world_idx on public.records (world_id);
create index records_kind_idx on public.records (team_id, kind);

-- Organizer-only fields of a record (RLS works on rows, never on columns).
create table public.record_secrets (
  record_id uuid primary key references public.records (id) on delete cascade,
  team_id uuid not null references public.teams (id) on delete cascade,
  data jsonb not null default '{}'::jsonb check (jsonb_typeof(data) = 'object'),
  rev integer not null default 1,
  updated_by uuid,
  updated_at timestamptz not null default now()
);

-- Rule R3: who may read a record with visibility = 'specific'.
create table public.record_access (
  id uuid primary key default gen_random_uuid(),
  record_id uuid not null references public.records (id) on delete cascade,
  team_id uuid not null references public.teams (id) on delete cascade,
  person_id uuid references public.people (id) on delete cascade,
  member_role public.member_role,
  updated_at timestamptz not null default now(),
  check ((person_id is null) <> (member_role is null)),
  check (member_role is null or member_role <> 'organizer')
);
create unique index record_access_person_uq on public.record_access (record_id, person_id) where person_id is not null;
create unique index record_access_role_uq on public.record_access (record_id, member_role) where member_role is not null;
create index record_access_team_idx on public.record_access (team_id);

-- Rule R4: people attached to a record (player of a character, actor of an NPC).
create table public.record_people (
  record_id uuid not null references public.records (id) on delete cascade,
  team_id uuid not null references public.teams (id) on delete cascade,
  person_id uuid not null references public.people (id) on delete cascade,
  relation text not null check (relation in ('player', 'actor')),
  updated_at timestamptz not null default now(),
  primary key (record_id, person_id, relation)
);
create index record_people_person_idx on public.record_people (person_id);
create index record_people_team_idx on public.record_people (team_id);

-- [[links]], map objects, hooks: kept in sync by the client or triggers.
create table public.record_links (
  team_id uuid not null references public.teams (id) on delete cascade,
  from_id uuid not null references public.records (id) on delete cascade,
  to_id uuid not null references public.records (id) on delete cascade,
  kind text not null default 'mention' check (kind ~ '^[a-z][a-z_]{1,40}$'),
  updated_at timestamptz not null default now(),
  primary key (from_id, to_id, kind)
);
create index record_links_to_idx on public.record_links (to_id);
create index record_links_team_idx on public.record_links (team_id);

create table public.record_history (
  id bigint generated always as identity primary key,
  team_id uuid not null references public.teams (id) on delete cascade,
  record_id uuid not null,
  actor uuid,
  at timestamptz not null default now(),
  op text not null check (op in ('insert', 'update', 'delete', 'secret')),
  before jsonb,
  after jsonb
);
create index record_history_record_idx on public.record_history (record_id, at desc);

-- ---------------------------------------------------------------------------
-- Membership helpers (security definer: they read team_members past its RLS)
-- ---------------------------------------------------------------------------

create function private.member_role(p_team uuid, p_user uuid)
returns public.member_role
language sql stable security definer set search_path = ''
as $$
  select m.role from public.team_members m where m.team_id = p_team and m.user_id = p_user
$$;

create function private.member_person(p_team uuid, p_user uuid)
returns uuid
language sql stable security definer set search_path = ''
as $$
  select m.person_id from public.team_members m where m.team_id = p_team and m.user_id = p_user
$$;

create function private.is_member(p_team uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (select 1 from public.team_members m where m.team_id = p_team and m.user_id = auth.uid())
$$;

create function private.is_organizer(p_team uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.team_members m
    where m.team_id = p_team and m.user_id = auth.uid() and m.role = 'organizer'
  )
$$;

-- ---------------------------------------------------------------------------
-- THE access rule. Everything that decides "may this person read this record"
-- calls this function: table policies, storage policies, view-as-player and
-- who-can-see. Keep it the only place (CLAUDE.md, hard rule 5).
-- ---------------------------------------------------------------------------

create function private.can_read_as(p_role public.member_role, p_person uuid, r public.records)
returns boolean
language plpgsql stable security definer set search_path = ''
as $$
declare
  container public.records;
begin
  -- Not a member of the team: nothing.
  if p_role is null then
    return false;
  end if;
  -- R1: organizers see everything, including the trash.
  if p_role = 'organizer' then
    return true;
  end if;
  -- The trash is for organizers only.
  if r.deleted_at is not null then
    return false;
  end if;
  -- A record inside a game or world you cannot see is hidden too, so a secret
  -- upcoming game cannot leak through its contents.
  if r.game_id is not null then
    select * into container from public.records where id = r.game_id;
    if not found or not private.can_read_as(p_role, p_person, container) then
      return false;
    end if;
  elsif r.world_id is not null then
    select * into container from public.records where id = r.world_id;
    if not found or not private.can_read_as(p_role, p_person, container) then
      return false;
    end if;
  end if;
  -- R2: everyone in the team.
  if r.visibility = 'everyone' then
    return true;
  end if;
  -- R3: listed people or groups.
  if r.visibility = 'specific' and exists (
    select 1 from public.record_access a
    where a.record_id = r.id
      and ((p_person is not null and a.person_id = p_person) or a.member_role = p_role)
  ) then
    return true;
  end if;
  if p_person is null then
    return false;
  end if;
  -- R4: attached people (player of a character, actor of an NPC).
  if exists (
    select 1 from public.record_people rp where rp.record_id = r.id and rp.person_id = p_person
  ) then
    return true;
  end if;
  -- R5: children that inherit their parent's attached people.
  if r.inherit_audience and r.parent_id is not null and exists (
    select 1 from public.record_people rp where rp.record_id = r.parent_id and rp.person_id = p_person
  ) then
    return true;
  end if;
  -- R6: a relationship is readable by the players of the sides that know of it.
  --     data: { from_id, to_id, known_by: 'both' | 'from' | 'to' }
  if r.kind = 'relationship' then
    if coalesce(r.data ->> 'known_by', 'both') in ('both', 'from') and exists (
      select 1 from public.record_people rp
      where rp.record_id = nullif(r.data ->> 'from_id', '')::uuid and rp.person_id = p_person
    ) then
      return true;
    end if;
    if coalesce(r.data ->> 'known_by', 'both') in ('both', 'to') and exists (
      select 1 from public.record_people rp
      where rp.record_id = nullif(r.data ->> 'to_id', '')::uuid and rp.person_id = p_person
    ) then
      return true;
    end if;
  end if;
  return false;
exception
  when invalid_text_representation then
    -- Malformed ids in relationship data never grant access.
    return false;
end
$$;

-- The current user's view of a record.
create function private.can_read(r public.records)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select private.can_read_as(
    private.member_role(r.team_id, auth.uid()),
    private.member_person(r.team_id, auth.uid()),
    r
  )
$$;

create function private.can_read_id(p_record uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select coalesce((select private.can_read(r) from public.records r where r.id = p_record), false)
$$;

revoke all on all functions in schema private from public;
grant execute on all functions in schema private to authenticated;

-- ---------------------------------------------------------------------------
-- Triggers: timestamps, revisions, integrity, history
-- ---------------------------------------------------------------------------

create function private.touch_updated_at()
returns trigger
language plpgsql set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end
$$;

create trigger teams_touch before update on public.teams for each row execute function private.touch_updated_at();
create trigger people_touch before update on public.people for each row execute function private.touch_updated_at();
create trigger team_members_touch before update on public.team_members for each row execute function private.touch_updated_at();
create trigger invites_touch before update on public.invites for each row execute function private.touch_updated_at();
create trigger record_access_touch before update on public.record_access for each row execute function private.touch_updated_at();
create trigger record_people_touch before update on public.record_people for each row execute function private.touch_updated_at();

create function private.records_before_write()
returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  ref public.records;
begin
  if tg_op = 'UPDATE' then
    if new.team_id <> old.team_id then
      raise exception 'records cannot move between teams';
    end if;
    new.rev := old.rev + 1;
    new.created_by := old.created_by;
    new.created_at := old.created_at;
    new.updated_by := auth.uid();
    new.updated_at := now();
    if new.deleted_at is not null and old.deleted_at is null then
      new.deleted_by := auth.uid();
    elsif new.deleted_at is null then
      new.deleted_by := null;
    end if;
  else
    new.rev := 1;
    new.created_by := coalesce(auth.uid(), new.created_by);
    new.created_at := now();
    new.updated_by := new.created_by;
    new.updated_at := now();
  end if;

  if new.world_id is not null then
    select * into ref from public.records where id = new.world_id;
    if not found or ref.team_id <> new.team_id or ref.kind <> 'world' then
      raise exception 'world_id must point to a world of the same team';
    end if;
  end if;
  if new.game_id is not null then
    select * into ref from public.records where id = new.game_id;
    if not found or ref.team_id <> new.team_id or ref.kind <> 'game' then
      raise exception 'game_id must point to a game of the same team';
    end if;
  end if;
  if new.parent_id is not null then
    if new.parent_id = new.id then
      raise exception 'a record cannot be its own parent';
    end if;
    select * into ref from public.records where id = new.parent_id;
    if not found or ref.team_id <> new.team_id then
      raise exception 'parent_id must point to a record of the same team';
    end if;
  end if;
  if new.kind = 'game' and new.world_id is null then
    raise exception 'a game must belong to a world';
  end if;
  return new;
end
$$;

create trigger records_before_write
before insert or update on public.records
for each row execute function private.records_before_write();

create function private.records_history()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  insert into public.record_history (team_id, record_id, actor, op, before, after)
  values (
    coalesce(new.team_id, old.team_id),
    coalesce(new.id, old.id),
    auth.uid(),
    lower(tg_op),
    case when tg_op = 'INSERT' then null else to_jsonb(old) end,
    case when tg_op = 'DELETE' then null else to_jsonb(new) end
  );
  return null;
end
$$;

create trigger records_history
after insert or update or delete on public.records
for each row execute function private.records_history();

create function private.secrets_before_write()
returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  owner_team uuid;
begin
  select team_id into owner_team from public.records where id = new.record_id;
  if owner_team is null or owner_team <> new.team_id then
    raise exception 'record_secrets.team_id must match its record';
  end if;
  new.rev := case when tg_op = 'UPDATE' then old.rev + 1 else 1 end;
  new.updated_by := auth.uid();
  new.updated_at := now();
  insert into public.record_history (team_id, record_id, actor, op, before, after)
  values (new.team_id, new.record_id, auth.uid(), 'secret',
          case when tg_op = 'UPDATE' then old.data else null end, new.data);
  return new;
end
$$;

create trigger record_secrets_before_write
before insert or update on public.record_secrets
for each row execute function private.secrets_before_write();

-- Child tables must stay inside the team of the record they point at.
create function private.child_team_check()
returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  owner_team uuid;
  person_team uuid;
begin
  if tg_table_name = 'record_links' then
    select team_id into owner_team from public.records where id = new.from_id;
    if owner_team is distinct from new.team_id
       or (select team_id from public.records where id = new.to_id) is distinct from new.team_id then
      raise exception 'links must stay inside one team';
    end if;
  else
    select team_id into owner_team from public.records where id = new.record_id;
    if owner_team is distinct from new.team_id then
      raise exception 'team_id must match the record';
    end if;
    if new.person_id is not null then
      select team_id into person_team from public.people where id = new.person_id;
      if person_team is distinct from new.team_id then
        raise exception 'person must belong to the same team';
      end if;
    end if;
  end if;
  new.updated_at := now();
  return new;
end
$$;

create trigger record_access_team_check before insert or update on public.record_access
for each row execute function private.child_team_check();
create trigger record_people_team_check before insert or update on public.record_people
for each row execute function private.child_team_check();
create trigger record_links_team_check before insert or update on public.record_links
for each row execute function private.child_team_check();

-- ---------------------------------------------------------------------------
-- Row-level security
-- ---------------------------------------------------------------------------

alter table public.teams enable row level security;
alter table public.people enable row level security;
alter table public.team_members enable row level security;
alter table public.invites enable row level security;
alter table public.records enable row level security;
alter table public.record_secrets enable row level security;
alter table public.record_access enable row level security;
alter table public.record_people enable row level security;
alter table public.record_links enable row level security;
alter table public.record_history enable row level security;

-- Teams: members read; organizers rename. Created only through create_team().
create policy teams_select on public.teams for select to authenticated
  using (private.is_member(id));
create policy teams_update on public.teams for update to authenticated
  using (private.is_organizer(id)) with check (private.is_organizer(id));

-- People: organizers see the whole roster; others see themselves and the
-- organizers (whose names appear on locks and history).
create policy people_select on public.people for select to authenticated
  using (
    private.is_organizer(team_id)
    or (user_id = (select auth.uid()))
    or (
      private.is_member(team_id)
      and exists (
        select 1 from public.team_members m
        where m.person_id = people.id and m.role = 'organizer'
      )
    )
  );
create policy people_insert on public.people for insert to authenticated
  with check (private.is_organizer(team_id) and user_id is null);
create policy people_update on public.people for update to authenticated
  using (private.is_organizer(team_id)) with check (private.is_organizer(team_id));

-- Members: organizers see all; others see their own row and the organizers.
-- Changes go through set_member_role() / remove_member().
create policy team_members_select on public.team_members for select to authenticated
  using (
    private.is_organizer(team_id)
    or user_id = (select auth.uid())
    or (role = 'organizer' and private.is_member(team_id))
  );

-- Invites: organizers only. Created through create_invite().
create policy invites_select on public.invites for select to authenticated
  using (private.is_organizer(team_id));
create policy invites_update on public.invites for update to authenticated
  using (private.is_organizer(team_id)) with check (private.is_organizer(team_id));

-- Records: the single access rule for reading; organizers write.
create policy records_select on public.records for select to authenticated
  using (private.can_read(records));
create policy records_insert on public.records for insert to authenticated
  with check (private.is_organizer(team_id));
create policy records_update on public.records for update to authenticated
  using (private.is_organizer(team_id)) with check (private.is_organizer(team_id));
create policy records_delete on public.records for delete to authenticated
  using (private.is_organizer(team_id));

-- Secrets: organizers only, always.
create policy record_secrets_all on public.record_secrets for all to authenticated
  using (private.is_organizer(team_id)) with check (private.is_organizer(team_id));

-- Child rows are visible with their record; organizers write.
create policy record_access_select on public.record_access for select to authenticated
  using (private.is_organizer(team_id));
create policy record_access_write on public.record_access for all to authenticated
  using (private.is_organizer(team_id)) with check (private.is_organizer(team_id));

create policy record_people_select on public.record_people for select to authenticated
  using (
    private.is_organizer(team_id)
    or person_id = private.member_person(team_id, (select auth.uid()))
  );
create policy record_people_write on public.record_people for all to authenticated
  using (private.is_organizer(team_id)) with check (private.is_organizer(team_id));

create policy record_links_select on public.record_links for select to authenticated
  using (private.can_read_id(from_id));
create policy record_links_write on public.record_links for all to authenticated
  using (private.is_organizer(team_id)) with check (private.is_organizer(team_id));

create policy record_history_select on public.record_history for select to authenticated
  using (private.is_organizer(team_id));

-- No anonymous access to anything.
revoke all on all tables in schema public from anon;
grant select, insert, update, delete on all tables in schema public to authenticated;
revoke insert, update, delete on public.record_history from authenticated;
revoke insert, delete on public.teams, public.team_members, public.invites from authenticated;
revoke update on public.team_members from authenticated;

-- ---------------------------------------------------------------------------
-- Server functions (RPC)
-- ---------------------------------------------------------------------------

create function public.create_team(p_name text, p_display_name text)
returns uuid
language plpgsql security definer set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
  v_team uuid;
  v_person uuid;
begin
  if v_user is null then
    raise exception 'not signed in' using errcode = '28000';
  end if;
  if (select count(*) from public.team_members where user_id = v_user and role = 'organizer') >= 5 then
    raise exception 'too many teams' using errcode = 'P0001';
  end if;
  insert into public.teams (name) values (btrim(p_name)) returning id into v_team;
  insert into public.people (team_id, display_name, user_id)
    values (v_team, btrim(p_display_name), v_user) returning id into v_person;
  insert into public.team_members (team_id, user_id, person_id, role)
    values (v_team, v_user, v_person, 'organizer');
  return v_team;
end
$$;

-- Readable invite codes like "LIPNO-7K3Q": no 0/O or 1/I to avoid confusion.
create function private.random_code(p_length integer)
returns text
language plpgsql volatile set search_path = ''
as $$
declare
  alphabet constant text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  result text := '';
begin
  for i in 1..p_length loop
    result := result || substr(alphabet, 1 + floor(random() * length(alphabet))::integer, 1);
  end loop;
  return result;
end
$$;

create function public.create_invite(
  p_team uuid,
  p_role public.member_role,
  p_person uuid default null,
  p_days integer default 14,
  p_max_uses integer default 1
)
returns text
language plpgsql security definer set search_path = ''
as $$
declare
  v_code text;
begin
  if not private.is_organizer(p_team) then
    raise exception 'only organizers can invite' using errcode = '42501';
  end if;
  if p_days < 1 or p_days > 365 then
    raise exception 'invalid expiry' using errcode = '22023';
  end if;
  if p_person is not null and not exists (
    select 1 from public.people where id = p_person and team_id = p_team and user_id is null and deleted_at is null
  ) then
    raise exception 'person must be an unlinked member of the roster' using errcode = '22023';
  end if;
  loop
    v_code := private.random_code(5) || '-' || private.random_code(4);
    exit when not exists (select 1 from public.invites where code = v_code);
  end loop;
  insert into public.invites (team_id, code, role, person_id, created_by, expires_at, max_uses)
  values (p_team, v_code, p_role, p_person, auth.uid(), now() + make_interval(days => p_days), p_max_uses);
  return v_code;
end
$$;

create function public.join_team(p_code text, p_display_name text)
returns uuid
language plpgsql security definer set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
  v_invite public.invites;
  v_person uuid;
begin
  if v_user is null then
    raise exception 'not signed in' using errcode = '28000';
  end if;
  select * into v_invite from public.invites
  where code = upper(btrim(p_code))
  for update;
  if not found or v_invite.revoked_at is not null or v_invite.expires_at < now()
     or v_invite.use_count >= v_invite.max_uses then
    raise exception 'invalid or expired invite' using errcode = 'P0002';
  end if;
  if exists (select 1 from public.team_members where team_id = v_invite.team_id and user_id = v_user) then
    return v_invite.team_id;
  end if;

  if v_invite.person_id is not null then
    update public.people set user_id = v_user
    where id = v_invite.person_id and user_id is null
    returning id into v_person;
  end if;
  if v_person is null then
    insert into public.people (team_id, display_name, user_id)
    values (v_invite.team_id, btrim(p_display_name), v_user)
    returning id into v_person;
  end if;
  insert into public.team_members (team_id, user_id, person_id, role)
  values (v_invite.team_id, v_user, v_person, v_invite.role);
  update public.invites set use_count = use_count + 1 where id = v_invite.id;
  return v_invite.team_id;
end
$$;

create function public.set_member_role(p_team uuid, p_user uuid, p_role public.member_role)
returns void
language plpgsql security definer set search_path = ''
as $$
begin
  if not private.is_organizer(p_team) then
    raise exception 'only organizers can change roles' using errcode = '42501';
  end if;
  if p_role <> 'organizer' and (
    select count(*) from public.team_members
    where team_id = p_team and role = 'organizer' and user_id <> p_user
  ) = 0 then
    raise exception 'the team needs at least one organizer' using errcode = 'P0001';
  end if;
  update public.team_members set role = p_role where team_id = p_team and user_id = p_user;
end
$$;

create function public.remove_member(p_team uuid, p_user uuid)
returns void
language plpgsql security definer set search_path = ''
as $$
begin
  if not private.is_organizer(p_team) then
    raise exception 'only organizers can remove members' using errcode = '42501';
  end if;
  if (
    select count(*) from public.team_members
    where team_id = p_team and role = 'organizer' and user_id <> p_user
  ) = 0 then
    raise exception 'the team needs at least one organizer' using errcode = 'P0001';
  end if;
  delete from public.team_members where team_id = p_team and user_id = p_user;
  -- The roster entry stays (it may be cast in games) but is unlinked.
  update public.people set user_id = null where team_id = p_team and user_id = p_user;
end
$$;

-- Role a person would have: their member role, or "player" if they have no account yet.
create function private.person_role(p_team uuid, p_person uuid)
returns public.member_role
language sql stable security definer set search_path = ''
as $$
  select coalesce(
    (select m.role from public.team_members m where m.team_id = p_team and m.person_id = p_person),
    'player'::public.member_role
  )
$$;

-- "View as player": exactly the ids RLS would return for that person.
create function public.visible_record_ids(p_team uuid, p_person uuid)
returns setof uuid
language plpgsql stable security definer set search_path = ''
as $$
declare
  v_role public.member_role;
begin
  if not private.is_organizer(p_team) then
    raise exception 'only organizers can preview' using errcode = '42501';
  end if;
  if not exists (select 1 from public.people where id = p_person and team_id = p_team) then
    raise exception 'unknown person' using errcode = '22023';
  end if;
  v_role := private.person_role(p_team, p_person);
  return query
    select r.id from public.records r
    where r.team_id = p_team and private.can_read_as(v_role, p_person, r);
end
$$;

-- "Kdo to vidí?": everyone on the roster who can read a record.
create function public.record_readers(p_record uuid)
returns table (person_id uuid, display_name text, role public.member_role, has_account boolean)
language plpgsql stable security definer set search_path = ''
as $$
declare
  r public.records;
begin
  select * into r from public.records where id = p_record;
  if not found or not private.is_organizer(r.team_id) then
    raise exception 'only organizers can see readers' using errcode = '42501';
  end if;
  return query
    select p.id, p.display_name, private.person_role(r.team_id, p.id), p.user_id is not null
    from public.people p
    where p.team_id = r.team_id
      and p.deleted_at is null
      and private.can_read_as(private.person_role(r.team_id, p.id), p.id, r)
    order by p.display_name;
end
$$;

-- Used by the admin-set-password Edge Function before it touches auth.users.
create function public.can_reset_password(p_team uuid, p_user uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select private.is_organizer(p_team)
     and exists (select 1 from public.team_members where team_id = p_team and user_id = p_user)
$$;

revoke all on function public.create_team(text, text) from public, anon;
revoke all on function public.create_invite(uuid, public.member_role, uuid, integer, integer) from public, anon;
revoke all on function public.join_team(text, text) from public, anon;
revoke all on function public.set_member_role(uuid, uuid, public.member_role) from public, anon;
revoke all on function public.remove_member(uuid, uuid) from public, anon;
revoke all on function public.visible_record_ids(uuid, uuid) from public, anon;
revoke all on function public.record_readers(uuid) from public, anon;
revoke all on function public.can_reset_password(uuid, uuid) from public, anon;
grant execute on function public.create_team(text, text) to authenticated;
grant execute on function public.create_invite(uuid, public.member_role, uuid, integer, integer) to authenticated;
grant execute on function public.join_team(text, text) to authenticated;
grant execute on function public.set_member_role(uuid, uuid, public.member_role) to authenticated;
grant execute on function public.remove_member(uuid, uuid) to authenticated;
grant execute on function public.visible_record_ids(uuid, uuid) to authenticated;
grant execute on function public.record_readers(uuid) to authenticated;
grant execute on function public.can_reset_password(uuid, uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Realtime: used only as a "something changed" poke (RLS still applies).
-- ---------------------------------------------------------------------------

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    alter publication supabase_realtime add table
      public.teams, public.people, public.team_members, public.records,
      public.record_secrets, public.record_access, public.record_people, public.record_links;
  end if;
end $$;

-- Milestone 7: the live game.
--
-- Two append-only logs: the backstage event log and tracker readings
-- (wounds, blood loss, drunkenness… per character over time). Rows get their
-- id on the client, and the server functions below ignore an id they have
-- already seen, so the offline outbox can replay them safely
-- (docs/PLAN.md §2.10). The live crew (organizers and NPC actors) reads and
-- writes them; players never see them. Organizers may delete a wrong entry.

create function private.is_crew(p_team uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.team_members m
    where m.team_id = p_team and m.user_id = auth.uid() and m.role in ('organizer', 'npc')
  )
$$;
revoke all on function private.is_crew(uuid) from public;
grant execute on function private.is_crew(uuid) to authenticated;

create table public.event_log (
  id uuid primary key,
  team_id uuid not null references public.teams (id) on delete cascade,
  game_id uuid not null references public.records (id) on delete cascade,
  kind text not null check (kind in ('note', 'phase', 'block', 'delivered', 'incident')),
  text text not null default '' check (char_length(text) <= 4000),
  record_id uuid references public.records (id) on delete set null,
  -- When it happened, by the clock of the computer that logged it.
  at timestamptz not null,
  author_id uuid,
  author_person uuid references public.people (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index event_log_team_idx on public.event_log (team_id, updated_at);
create index event_log_game_idx on public.event_log (game_id, at);

create table public.tracker_readings (
  id uuid primary key,
  team_id uuid not null references public.teams (id) on delete cascade,
  game_id uuid not null references public.records (id) on delete cascade,
  definition_id uuid not null references public.records (id) on delete cascade,
  -- The character or NPC the value belongs to.
  subject_id uuid not null references public.records (id) on delete cascade,
  value numeric,
  text text not null default '' check (char_length(text) <= 500),
  at timestamptz not null,
  author_id uuid,
  author_person uuid references public.people (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index tracker_readings_team_idx on public.tracker_readings (team_id, updated_at);
create index tracker_readings_subject_idx on public.tracker_readings (definition_id, subject_id, at);

alter table public.event_log enable row level security;
alter table public.tracker_readings enable row level security;

create policy event_log_select on public.event_log for select to authenticated
  using (private.is_crew(team_id));
create policy event_log_delete on public.event_log for delete to authenticated
  using (private.is_organizer(team_id));
create policy tracker_readings_select on public.tracker_readings for select to authenticated
  using (private.is_crew(team_id));
create policy tracker_readings_delete on public.tracker_readings for delete to authenticated
  using (private.is_organizer(team_id));

revoke all on public.event_log, public.tracker_readings from anon;
-- No insert or update grant: rows arrive only through the functions below.
revoke insert, update on public.event_log, public.tracker_readings from authenticated;
grant select, delete on public.event_log, public.tracker_readings to authenticated;

-- The game a record belongs to, if the caller is crew and may read the record.
create function private.crew_record(p_record uuid)
returns public.records
language plpgsql stable security definer set search_path = ''
as $$
declare
  r public.records;
begin
  select * into r from public.records where id = p_record and deleted_at is null;
  if not found or not private.is_crew(r.team_id) or not private.can_read(r) then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  return r;
end
$$;
revoke all on function private.crew_record(uuid) from public;
grant execute on function private.crew_record(uuid) to authenticated;

create function public.append_event(
  p_id uuid,
  p_game uuid,
  p_kind text,
  p_text text,
  p_record uuid,
  p_at timestamptz
)
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  game public.records;
  linked public.records;
begin
  if exists (select 1 from public.event_log where id = p_id) then
    return;
  end if;
  game := private.crew_record(p_game);
  if game.kind <> 'game' then
    raise exception 'p_game must be a game' using errcode = '22023';
  end if;
  if p_record is not null then
    linked := private.crew_record(p_record);
    if linked.team_id <> game.team_id then
      raise exception 'not allowed' using errcode = '42501';
    end if;
  end if;
  insert into public.event_log (id, team_id, game_id, kind, text, record_id, at, author_id, author_person)
  values (
    p_id, game.team_id, game.id, p_kind, coalesce(p_text, ''), p_record, coalesce(p_at, now()),
    auth.uid(), private.member_person(game.team_id, auth.uid())
  )
  on conflict (id) do nothing;
end
$$;

create function public.record_reading(
  p_id uuid,
  p_definition uuid,
  p_subject uuid,
  p_value numeric,
  p_text text,
  p_at timestamptz
)
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  definition public.records;
  subject public.records;
begin
  if exists (select 1 from public.tracker_readings where id = p_id) then
    return;
  end if;
  definition := private.crew_record(p_definition);
  subject := private.crew_record(p_subject);
  if definition.kind <> 'tracker_definition' or definition.game_id is null
     or subject.kind not in ('character', 'npc') or subject.team_id <> definition.team_id then
    raise exception 'a reading needs a tracker of a game and a character or NPC'
      using errcode = '22023';
  end if;
  insert into public.tracker_readings
    (id, team_id, game_id, definition_id, subject_id, value, text, at, author_id, author_person)
  values (
    p_id, definition.team_id, definition.game_id, definition.id, subject.id, p_value,
    coalesce(p_text, ''), coalesce(p_at, now()),
    auth.uid(), private.member_person(definition.team_id, auth.uid())
  )
  on conflict (id) do nothing;
end
$$;

-- "Doručeno": marks a prop document delivered, or a run-of-show beat or an NPC
-- appearance done, and logs it. p_event makes a replay a no-op.
create function public.mark_delivered(p_event uuid, p_record uuid, p_at timestamptz)
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  r public.records;
begin
  if exists (select 1 from public.event_log where id = p_event) then
    return;
  end if;
  r := private.crew_record(p_record);
  if r.game_id is null or r.kind not in ('prop_document', 'beat', 'npc_appearance') then
    raise exception 'only documents, beats and NPC appearances of a game can be delivered'
      using errcode = '22023';
  end if;
  update public.records
  set data = case
    when kind = 'prop_document' then data || '{"status": "delivered"}'::jsonb
    else data || '{"done": true}'::jsonb
  end
  where id = r.id;
  insert into public.event_log (id, team_id, game_id, kind, text, record_id, at, author_id, author_person)
  values (
    p_event, r.team_id, r.game_id, 'delivered', r.title, r.id, coalesce(p_at, now()),
    auth.uid(), private.member_person(r.team_id, auth.uid())
  )
  on conflict (id) do nothing;
end
$$;

revoke all on function public.append_event(uuid, uuid, text, text, uuid, timestamptz) from public, anon;
revoke all on function public.record_reading(uuid, uuid, uuid, numeric, text, timestamptz) from public, anon;
revoke all on function public.mark_delivered(uuid, uuid, timestamptz) from public, anon;
grant execute on function public.append_event(uuid, uuid, text, text, uuid, timestamptz) to authenticated;
grant execute on function public.record_reading(uuid, uuid, uuid, numeric, text, timestamptz) to authenticated;
grant execute on function public.mark_delivered(uuid, uuid, timestamptz) to authenticated;

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    alter publication supabase_realtime add table public.event_log, public.tracker_readings;
  end if;
end $$;

-- Zázemí shared drive (Milestone 1b): file versions, check-out locks, extracted
-- text for search, and the Storage bucket with its policies.
-- See docs/PLAN.md §2.6. Files and folders are records (kind 'file' / 'folder'),
-- so they share visibility, links and history with everything else.
--
-- Storage object names: <team_id>/<file_record_id>/<version_id>

-- ---------------------------------------------------------------------------
-- Bucket
-- ---------------------------------------------------------------------------

insert into storage.buckets (id, name, public, file_size_limit)
values ('files', 'files', false, 52428800)
on conflict (id) do nothing;

-- Part `p_index` (1-based) of an object name as a uuid, or null.
create function private.path_uuid(p_name text, p_index integer)
returns uuid
language plpgsql immutable set search_path = ''
as $$
begin
  return (string_to_array(p_name, '/'))[p_index]::uuid;
exception
  when others then
    return null;
end
$$;

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------

create table public.file_versions (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references public.teams (id) on delete cascade,
  file_id uuid not null references public.records (id) on delete cascade,
  no integer not null check (no >= 1),
  storage_path text not null,
  size bigint not null check (size >= 0),
  sha256 text not null check (sha256 ~ '^[0-9a-f]{64}$'),
  mime text not null default 'application/octet-stream',
  -- The check-out session that produced it. While the session runs, each save
  -- replaces this row's object (one version per session, docs/PLAN.md §1.10).
  session_id uuid,
  -- "Uložit jako verzi": the next save of the session starts a new version.
  kept boolean not null default false,
  base_version_id uuid references public.file_versions (id) on delete set null,
  -- Saved by someone whose lock had been taken over meanwhile.
  is_conflict boolean not null default false,
  pinned boolean not null default false,
  label text not null default '' check (char_length(label) <= 200),
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (file_id, no)
);
create index file_versions_file_idx on public.file_versions (file_id, no desc);
create index file_versions_team_idx on public.file_versions (team_id);

create table public.file_locks (
  file_id uuid primary key references public.records (id) on delete cascade,
  team_id uuid not null references public.teams (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  display_name text not null,
  machine text not null default '',
  session_id uuid not null,
  acquired_at timestamptz not null default now(),
  heartbeat_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index file_locks_team_idx on public.file_locks (team_id);

create table public.file_text (
  file_id uuid primary key references public.records (id) on delete cascade,
  team_id uuid not null references public.teams (id) on delete cascade,
  version_id uuid references public.file_versions (id) on delete set null,
  text text not null default '' check (char_length(text) <= 2000000),
  updated_at timestamptz not null default now()
);
create index file_text_team_updated_idx on public.file_text (team_id, updated_at);

create trigger file_versions_touch before update on public.file_versions
for each row execute function private.touch_updated_at();
create trigger file_text_touch before insert or update on public.file_text
for each row execute function private.touch_updated_at();

-- file_text and file_versions must belong to a file of the same team.
create function private.file_child_check()
returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  f public.records;
begin
  select * into f from public.records where id = new.file_id;
  if not found or f.kind <> 'file' or f.team_id <> new.team_id then
    raise exception 'must belong to a file of the same team';
  end if;
  return new;
end
$$;

create trigger file_text_check before insert or update on public.file_text
for each row execute function private.file_child_check();
create trigger file_versions_check before insert or update on public.file_versions
for each row execute function private.file_child_check();

-- The current version of a file can never be deleted.
create function private.protect_current_version()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  if exists (
    select 1 from public.records r
    where r.id = old.file_id and r.data ->> 'current_version_id' = old.id::text
  ) then
    raise exception 'the current version cannot be deleted';
  end if;
  return old;
end
$$;

create trigger file_versions_protect before delete on public.file_versions
for each row execute function private.protect_current_version();

-- ---------------------------------------------------------------------------
-- Row-level security
-- ---------------------------------------------------------------------------

alter table public.file_versions enable row level security;
alter table public.file_locks enable row level security;
alter table public.file_text enable row level security;

create policy file_versions_select on public.file_versions for select to authenticated
  using (private.can_read_id(file_id));
create policy file_versions_update on public.file_versions for update to authenticated
  using (private.is_organizer(team_id)) with check (private.is_organizer(team_id));
create policy file_versions_delete on public.file_versions for delete to authenticated
  using (private.is_organizer(team_id));

create policy file_locks_select on public.file_locks for select to authenticated
  using (private.can_read_id(file_id));

create policy file_text_select on public.file_text for select to authenticated
  using (private.can_read_id(file_id));
create policy file_text_write on public.file_text for all to authenticated
  using (private.is_organizer(team_id)) with check (private.is_organizer(team_id));

revoke all on public.file_versions, public.file_locks, public.file_text from anon;
grant select, update, delete on public.file_versions to authenticated;
grant select on public.file_locks to authenticated;
grant select, insert, update, delete on public.file_text to authenticated;

-- Storage objects follow the file record's visibility; organizers write.
create policy zazemi_files_select on storage.objects for select to authenticated
  using (bucket_id = 'files' and private.can_read_id(private.path_uuid(name, 2)));
create policy zazemi_files_insert on storage.objects for insert to authenticated
  with check (
    bucket_id = 'files'
    and private.is_organizer(private.path_uuid(name, 1))
    and private.path_uuid(name, 3) is not null
    and exists (
      select 1 from public.records r
      where r.id = private.path_uuid(name, 2)
        and r.team_id = private.path_uuid(name, 1)
        and r.kind = 'file'
    )
  );
create policy zazemi_files_delete on storage.objects for delete to authenticated
  using (bucket_id = 'files' and private.is_organizer(private.path_uuid(name, 1)));

-- ---------------------------------------------------------------------------
-- Check-out / check-in
-- ---------------------------------------------------------------------------

-- A lock nobody has refreshed for this long is stale (crashed app, dead laptop).
create function private.lock_ttl()
returns interval
language sql immutable set search_path = ''
as $$ select interval '10 minutes' $$;

create function private.file_for_write(p_file uuid)
returns public.records
language plpgsql stable security definer set search_path = ''
as $$
declare
  f public.records;
begin
  select * into f from public.records where id = p_file;
  if not found or f.kind <> 'file' or not private.is_organizer(f.team_id) then
    raise exception 'only organizers can edit files' using errcode = '42501';
  end if;
  if f.deleted_at is not null then
    raise exception 'file is in the trash' using errcode = 'P0001';
  end if;
  return f;
end
$$;

-- Takes the lock; fails with "locked by <name>" while someone else holds a
-- fresh one. Returns the new session id.
create function public.checkout_file(p_file uuid, p_machine text default '')
returns uuid
language plpgsql security definer set search_path = ''
as $$
declare
  f public.records;
  existing public.file_locks;
  v_session uuid := gen_random_uuid();
  v_name text;
begin
  f := private.file_for_write(p_file);
  select * into existing from public.file_locks where file_id = p_file for update;
  if found and existing.user_id <> auth.uid() and existing.heartbeat_at > now() - private.lock_ttl() then
    raise exception 'locked by %', existing.display_name using errcode = 'P0003';
  end if;
  select p.display_name into v_name
  from public.team_members m join public.people p on p.id = m.person_id
  where m.team_id = f.team_id and m.user_id = auth.uid();
  insert into public.file_locks (file_id, team_id, user_id, display_name, machine, session_id)
  values (p_file, f.team_id, auth.uid(), coalesce(v_name, '?'), left(coalesce(p_machine, ''), 100), v_session)
  on conflict (file_id) do update
    set user_id = excluded.user_id,
        display_name = excluded.display_name,
        machine = excluded.machine,
        session_id = excluded.session_id,
        acquired_at = now(),
        heartbeat_at = now(),
        updated_at = now();
  return v_session;
end
$$;

-- Keeps the lock alive. False means the lock was lost (released or taken over).
create function public.heartbeat_lock(p_file uuid, p_session uuid)
returns boolean
language plpgsql security definer set search_path = ''
as $$
begin
  update public.file_locks
  set heartbeat_at = now(), updated_at = now()
  where file_id = p_file and session_id = p_session and user_id = auth.uid();
  return found;
end
$$;

create function public.release_lock(p_file uuid, p_session uuid)
returns void
language plpgsql security definer set search_path = ''
as $$
begin
  delete from public.file_locks where file_id = p_file and session_id = p_session and user_id = auth.uid();
end
$$;

-- Any organizer may free a lock (e.g. a crashed laptop at the farm).
create function public.force_release_lock(p_file uuid)
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  f public.records;
begin
  select * into f from public.records where id = p_file;
  if not found or not private.is_organizer(f.team_id) then
    raise exception 'only organizers can release locks' using errcode = '42501';
  end if;
  delete from public.file_locks where file_id = p_file;
end
$$;

-- Records an uploaded object as a version. With a session that still holds
-- the lock, the session's working version is replaced (its old object path is
-- returned for deletion). Without the lock, or when the file changed since
-- `p_base`, the version is stored as a conflict and the current version stays.
create function public.commit_file_version(
  p_file uuid,
  p_version uuid,
  p_size bigint,
  p_sha256 text,
  p_mime text,
  p_session uuid default null,
  p_base uuid default null,
  p_label text default ''
)
returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  f public.records;
  v_path text;
  v_lock public.file_locks;
  v_holds boolean := false;
  v_foreign boolean := false;
  v_current uuid;
  v_conflict boolean := false;
  v_existing public.file_versions;
  v_replaced text;
  v_no integer;
begin
  f := private.file_for_write(p_file);
  v_path := f.team_id::text || '/' || p_file::text || '/' || p_version::text;
  if not exists (select 1 from storage.objects where bucket_id = 'files' and name = v_path) then
    raise exception 'upload the object first' using errcode = 'P0001';
  end if;

  select * into v_lock from public.file_locks where file_id = p_file for update;
  if found then
    v_holds := p_session is not null and v_lock.session_id = p_session and v_lock.user_id = auth.uid();
    v_foreign := not v_holds and v_lock.heartbeat_at > now() - private.lock_ttl();
  end if;
  v_current := nullif(f.data ->> 'current_version_id', '')::uuid;

  if p_session is not null and not v_holds then
    v_conflict := true;
  elsif p_session is null and v_foreign then
    raise exception 'locked by %', v_lock.display_name using errcode = 'P0003';
  elsif p_base is not null and v_current is not null and p_base <> v_current and not v_holds then
    v_conflict := true;
  end if;

  if not v_conflict and p_session is not null then
    select * into v_existing from public.file_versions
    where file_id = p_file and session_id = p_session and not kept and not is_conflict
    order by no desc limit 1
    for update;
  end if;

  if v_existing.id is not null then
    v_replaced := v_existing.storage_path;
    update public.file_versions
    set storage_path = v_path, size = p_size, sha256 = p_sha256, mime = p_mime,
        created_at = now(), created_by = auth.uid(), label = coalesce(nullif(p_label, ''), label)
    where id = v_existing.id;
    v_no := v_existing.no;
    -- Keep the row id stable; the new object belongs to it from now on.
    p_version := v_existing.id;
  else
    select coalesce(max(no), 0) + 1 into v_no from public.file_versions where file_id = p_file;
    insert into public.file_versions (
      id, team_id, file_id, no, storage_path, size, sha256, mime, session_id,
      base_version_id, is_conflict, label
    ) values (
      p_version, f.team_id, p_file, v_no, v_path, p_size, p_sha256, p_mime, p_session,
      coalesce(p_base, v_current), v_conflict, coalesce(p_label, '')
    );
  end if;

  if not v_conflict then
    update public.records
    set data = data || jsonb_build_object(
      'current_version_id', p_version,
      'current_version_no', v_no,
      'size', p_size,
      'sha256', p_sha256,
      'mime', p_mime
    )
    where id = p_file;
  end if;

  return jsonb_build_object(
    'version_id', p_version,
    'no', v_no,
    'conflict', v_conflict,
    'replaced_path', v_replaced
  );
end
$$;

-- "Uložit jako verzi": freeze the session's working version.
create function public.keep_session_version(p_file uuid, p_session uuid)
returns void
language plpgsql security definer set search_path = ''
as $$
begin
  perform private.file_for_write(p_file);
  update public.file_versions set kept = true
  where file_id = p_file and session_id = p_session and not is_conflict;
end
$$;

-- Bytes stored for a team (all versions), for the storage meter.
create function public.storage_usage(p_team uuid)
returns bigint
language plpgsql stable security definer set search_path = ''
as $$
begin
  if not private.is_organizer(p_team) then
    raise exception 'only organizers can see storage usage' using errcode = '42501';
  end if;
  return coalesce((select sum(size) from public.file_versions where team_id = p_team), 0);
end
$$;

do $$
declare
  fn text;
begin
  foreach fn in array array[
    'public.checkout_file(uuid, text)',
    'public.heartbeat_lock(uuid, uuid)',
    'public.release_lock(uuid, uuid)',
    'public.force_release_lock(uuid)',
    'public.commit_file_version(uuid, uuid, bigint, text, text, uuid, uuid, text)',
    'public.keep_session_version(uuid, uuid)',
    'public.storage_usage(uuid)'
  ] loop
    execute format('revoke all on function %s from public, anon', fn);
    execute format('grant execute on function %s to authenticated', fn);
  end loop;
end $$;

revoke all on function private.path_uuid(text, integer) from public;
grant execute on function private.path_uuid(text, integer) to authenticated;
revoke all on function private.file_for_write(uuid) from public;
revoke all on function private.lock_ttl() from public;
grant execute on function private.lock_ttl() to authenticated;

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    alter publication supabase_realtime add table public.file_locks, public.file_text;
  end if;
end $$;

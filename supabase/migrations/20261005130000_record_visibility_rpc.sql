-- Changing who can see a record touches two tables (records.visibility and
-- record_access); do it atomically so a record is never briefly wider open.
create function public.set_record_visibility(
  p_record uuid,
  p_visibility public.visibility,
  p_people uuid[] default '{}',
  p_roles public.member_role[] default '{}'
)
returns integer
language plpgsql security definer set search_path = ''
as $$
declare
  r public.records;
begin
  select * into r from public.records where id = p_record for update;
  if not found or not private.is_organizer(r.team_id) then
    raise exception 'only organizers can change visibility' using errcode = '42501';
  end if;
  if exists (
    select 1 from unnest(coalesce(p_people, '{}')) as p(id)
    where not exists (select 1 from public.people pp where pp.id = p.id and pp.team_id = r.team_id)
  ) then
    raise exception 'unknown person' using errcode = '22023';
  end if;
  if 'organizer' = any(coalesce(p_roles, '{}')) then
    raise exception 'organizers always see everything' using errcode = '22023';
  end if;

  delete from public.record_access where record_id = p_record;
  if p_visibility = 'specific' then
    insert into public.record_access (record_id, team_id, person_id)
      select p_record, r.team_id, p.id from unnest(coalesce(p_people, '{}')) as p(id);
    insert into public.record_access (record_id, team_id, member_role)
      select p_record, r.team_id, x.role from unnest(coalesce(p_roles, '{}')) as x(role);
  end if;
  update public.records set visibility = p_visibility where id = p_record;
  return (select rev from public.records where id = p_record);
end
$$;

revoke all on function public.set_record_visibility(uuid, public.visibility, uuid[], public.member_role[]) from public, anon;
grant execute on function public.set_record_visibility(uuid, public.visibility, uuid[], public.member_role[]) to authenticated;

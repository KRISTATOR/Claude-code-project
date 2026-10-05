-- Milestone 3: backlinks.
--
-- record_links of kind 'mention' mirror the [[links]] in each record's data:
-- TipTap "wikiLink" nodes with the target's id in attrs.id (src/core/richtext.ts).
-- A trigger keeps them in step, so backlinks cannot drift from the text.
-- Only same-team targets are linked; organizer-only text (record_secrets) is
-- never scanned, so a link cannot reveal anything players may not read.

create function private.sync_record_links()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  if tg_op = 'UPDATE' and new.data is not distinct from old.data then
    return null;
  end if;
  delete from public.record_links where from_id = new.id and kind = 'mention';
  insert into public.record_links (team_id, from_id, to_id, kind)
  select distinct new.team_id, new.id, target.id, 'mention'
  from jsonb_path_query(new.data, 'strict $.** ? (@.type == "wikiLink").attrs.id') as link (value)
  join public.records target
    on target.id::text = link.value #>> '{}' and target.team_id = new.team_id
  where target.id <> new.id;
  return null;
end
$$;

create trigger records_links
after insert or update of data on public.records
for each row execute function private.sync_record_links();

-- A link is visible only when both ends are: otherwise a backlink list would
-- reveal that a hidden record exists.
drop policy record_links_select on public.record_links;
create policy record_links_select on public.record_links for select to authenticated
  using (private.can_read_id(from_id) and private.can_read_id(to_id));

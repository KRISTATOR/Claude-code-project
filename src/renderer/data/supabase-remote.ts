import { classifyError, type Remote, type SelectOptions, type SyncTable } from './remote';
import { errorFields, type Client } from './supabase';

/** Hosted Supabase returns at most 1000 rows per request. */
const PAGE = 1000;

const ORDER: Record<SyncTable, string> = {
  teams: 'id',
  people: 'id',
  team_members: 'user_id',
  invites: 'id',
  records: 'id',
  record_secrets: 'record_id',
  record_access: 'id',
  record_people: 'record_id',
  record_links: 'from_id',
  file_locks: 'file_id',
  file_text: 'file_id',
};

export class SupabaseRemote implements Remote {
  constructor(private readonly client: Client) {}

  async selectAll(table: SyncTable, options: SelectOptions = {}): Promise<unknown[]> {
    const rows: unknown[] = [];
    for (let from = 0; ; from += PAGE) {
      let query = this.client.from(table).select(options.columns ?? '*');
      if (options.eq) query = query.eq(options.eq.column, options.eq.value);
      if (options.since) query = query.gte('updated_at', options.since);
      // A stable order keeps pagination correct while rows change.
      const orderColumn = options.since ? 'updated_at' : ORDER[table];
      query = query.order(orderColumn, { ascending: true });
      if (orderColumn !== ORDER[table]) query = query.order(ORDER[table], { ascending: true });
      let response: {
        data: unknown;
        error: { message: string; code?: string } | null;
        status: number;
      };
      try {
        // The engine re-syncs on its own schedule; library retries (up to ~7 s)
        // would only delay noticing that we are offline.
        response = await query.range(from, from + PAGE - 1).retry(false);
      } catch (thrown) {
        throw classifyError(thrown);
      }
      if (response.error) throw classifyError(errorFields(response.error, response.status));
      const page = Array.isArray(response.data) ? (response.data as unknown[]) : [];
      rows.push(...page);
      if (page.length < PAGE) return rows;
    }
  }
}

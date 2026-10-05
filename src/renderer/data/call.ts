import { classifyError } from './remote';

/** Plain fields of a Supabase/PostgREST error, for classifyError(). */
export function errorFields(
  error: { message: string; code?: string | undefined } | null,
  status: number,
): { message: string; code?: string; status: number } {
  const fields: { message: string; code?: string; status: number } = {
    message: error?.message ?? 'unknown error',
    status,
  };
  if (error?.code) fields.code = error.code;
  return fields;
}

export interface Response {
  data: unknown;
  error: { message: string; code?: string } | null;
  status: number;
}

/** Awaits a Supabase call; returns its data as `unknown` (parse it with zod). */
export async function call(promise: PromiseLike<Response>): Promise<unknown> {
  let response: Response;
  try {
    response = await promise;
  } catch (thrown) {
    throw classifyError(thrown);
  }
  if (response.error) throw classifyError(errorFields(response.error, response.status));
  return response.data;
}

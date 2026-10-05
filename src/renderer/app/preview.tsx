import { createContext, useContext, type ReactNode } from 'react';
import type { MemberRole, RecordRow } from '@core/model';

/**
 * "Zobrazit jako hráč" (docs/PLAN.md §2.4): the organizer's cache filtered to
 * exactly the ids the server says that person can read (the same access
 * function RLS uses), read-only, without organizer-only parts.
 */
export interface Preview {
  personId: string;
  name: string;
  role: MemberRole;
  visibleIds: Set<string>;
}

const PreviewContext = createContext<Preview | null>(null);

export function PreviewProvider({
  preview,
  children,
}: {
  preview: Preview | null;
  children: ReactNode;
}) {
  return <PreviewContext.Provider value={preview}>{children}</PreviewContext.Provider>;
}

export function usePreview(): Preview | null {
  return useContext(PreviewContext);
}

/** Filters records to what the previewed person may read (no-op outside preview). */
export function useRecordFilter(): (record: Pick<RecordRow, 'id'>) => boolean {
  const preview = usePreview();
  return preview ? (record) => preview.visibleIds.has(record.id) : () => true;
}

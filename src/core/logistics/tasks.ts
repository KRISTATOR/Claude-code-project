import { readData, taskKind, taskStatuses } from '../kinds';
import type { RecordRow } from '../model';
import { compareCzech } from '../text';

/** Open tasks first, then by due date (undated last), then by title. */
export function sortTasks(tasks: readonly RecordRow[]): RecordRow[] {
  return [...tasks].sort((a, b) => {
    const da = readData(taskKind, a);
    const db = readData(taskKind, b);
    const done = Number(da.status === 'done') - Number(db.status === 'done');
    if (done !== 0) return done;
    if (da.due !== db.due) {
      if (da.due === null) return 1;
      if (db.due === null) return -1;
      return da.due < db.due ? -1 : 1;
    }
    return (
      taskStatuses.indexOf(db.status) - taskStatuses.indexOf(da.status) ||
      compareCzech(a.title, b.title)
    );
  });
}

/** Not done and due before `today` (yyyy-mm-dd, local). */
export function isOverdue(task: RecordRow, today: string): boolean {
  const data = readData(taskKind, task);
  return data.status !== 'done' && data.due !== null && data.due < today;
}

/** Today's date as yyyy-mm-dd in local time. */
export function localDay(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

/**
 * Recognising the lock files desktop office suites create next to an open
 * document (docs/PLAN.md §2.6). Each checked-out file gets its own folder, so
 * any lock file in that folder means "still open".
 *
 *  - Microsoft Office: "~$" + name (Word shortens long names: "~$pis 12.docx")
 *  - LibreOffice: ".~lock." + name + "#"
 */
export function isOfficeLockFile(fileName: string): boolean {
  return fileName.startsWith('~$') || (fileName.startsWith('.~lock.') && fileName.endsWith('#'));
}

/** Temporary files Office writes while saving; never the document itself. */
export function isOfficeTempFile(fileName: string): boolean {
  return /^~WR[LD]\d+\.tmp$/i.test(fileName) || /\.tmp$/i.test(fileName) || /^~\$/.test(fileName);
}

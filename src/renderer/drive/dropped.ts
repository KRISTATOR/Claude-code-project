/** A file plus its folder path relative to what was dropped ("Dopisy/Fáze III"). */
export interface PickedFile {
  folders: string[];
  file: File;
}

/** Files from <input type="file" webkitdirectory> keep their relative path. */
export function fromInput(list: FileList | null): PickedFile[] {
  return [...(list ?? [])].map((file) => {
    const relative = file.webkitRelativePath || file.name;
    const parts = relative.split('/').filter(Boolean);
    return { folders: parts.slice(0, -1), file };
  });
}

/** Drag and drop: walks dropped folders recursively. */
export async function fromDrop(items: DataTransferItemList): Promise<PickedFile[]> {
  const entries = [...items]
    .map((item) => item.webkitGetAsEntry())
    .filter((entry): entry is FileSystemEntry => entry !== null);
  const result: PickedFile[] = [];
  for (const entry of entries) await walk(entry, [], result);
  return result;
}

async function walk(entry: FileSystemEntry, folders: string[], out: PickedFile[]): Promise<void> {
  if (entry.isFile) {
    const file = await new Promise<File>((resolve, reject) => {
      (entry as FileSystemFileEntry).file(resolve, reject);
    });
    if (!isJunk(file.name)) out.push({ folders, file });
    return;
  }
  if (!entry.isDirectory) return;
  const reader = (entry as FileSystemDirectoryEntry).createReader();
  const path = [...folders, entry.name];
  for (;;) {
    const batch = await new Promise<FileSystemEntry[]>((resolve, reject) => {
      reader.readEntries(resolve, reject);
    });
    if (batch.length === 0) break;
    for (const child of batch) await walk(child, path, out);
  }
}

/** Office lock files and OS clutter are never uploaded. */
export function isJunk(name: string): boolean {
  return (
    name.startsWith('~$') || name === 'Thumbs.db' || name === 'desktop.ini' || name === '.DS_Store'
  );
}

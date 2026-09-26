// Files with the path they had inside a dropped or chosen folder, so the
// server can show "photos/lab-01.jpg" rather than a bare name.

export interface PathedFile {
  file: File;
  path: string;
}

export function fromList(list: FileList | File[]): PathedFile[] {
  return Array.from(list).map((f) => ({ file: f, path: (f as File & { webkitRelativePath?: string }).webkitRelativePath || f.name }));
}

/** Reads a drop, walking into folders dragged from the desktop. */
export async function fromDrop(dt: DataTransfer): Promise<PathedFile[]> {
  const out: PathedFile[] = [];
  const walk = async (entry: FileSystemEntry, prefix: string): Promise<void> => {
    if (entry.isFile) {
      const f = await new Promise<File>((res, rej) => (entry as FileSystemFileEntry).file(res, rej));
      out.push({ file: f, path: prefix + f.name });
    } else if (entry.isDirectory) {
      const reader = (entry as FileSystemDirectoryEntry).createReader();
      // readEntries returns at most 100 entries per call; keep reading until it returns none.
      for (;;) {
        const batch = await new Promise<FileSystemEntry[]>((res, rej) => reader.readEntries(res, rej));
        if (!batch.length) break;
        for (const en of batch) await walk(en, prefix + entry.name + "/");
      }
    }
  };
  // Entries and files must be taken synchronously, before the first await, or the browser clears them.
  const files = Array.from(dt.files);
  const items = dt.items ? Array.from(dt.items) : [];
  const entries = items.map((it) => (typeof it.webkitGetAsEntry === "function" ? it.webkitGetAsEntry() : null)).filter((e): e is FileSystemEntry => !!e);
  if (!entries.length) return fromList(files);
  for (const en of entries) await walk(en, "");
  return out;
}

/** True when the page runs inside another page, such as VS Code's preview pane. */
export function framed(): boolean {
  try {
    return window.self !== window.top;
  } catch {
    return true;
  }
}

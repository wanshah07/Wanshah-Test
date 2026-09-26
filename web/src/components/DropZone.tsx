import { useRef, useState } from "react";
import { fromDrop, fromList, type PathedFile } from "../lib/files";

export function DropZone({ onFiles, busy, compact }: { onFiles: (files: PathedFile[]) => void; busy?: boolean; compact?: boolean }) {
  const [over, setOver] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const dirRef = useRef<HTMLInputElement>(null);
  const take = (files: PathedFile[]) => {
    if (files.length) onFiles(files);
  };
  return (
    <div
      className={"drop" + (over ? " over" : "") + (compact ? " compact" : "")}
      onDragOver={(e) => {
        e.preventDefault();
        setOver(true);
      }}
      onDragLeave={() => setOver(false)}
      onDrop={async (e) => {
        e.preventDefault();
        setOver(false);
        take(await fromDrop(e.dataTransfer));
      }}
    >
      <p style={{ fontWeight: 600, marginBottom: 6 }}>Drop files or folders here</p>
      {!compact && <p className="small muted" style={{ marginBottom: 14 }}>PDF, Word, PowerPoint, Excel, CSV, Markdown, text, HTML, images, zip. Folders are read recursively.</p>}
      <div className="row" style={{ justifyContent: "center" }}>
        <button className="btn btn-ghost btn-sm" onClick={() => fileRef.current?.click()} disabled={busy}>Choose files</button>
        <button className="btn btn-ghost btn-sm" onClick={() => dirRef.current?.click()} disabled={busy}>Choose a folder</button>
        {busy && <span className="spin" />}
      </div>
      <input ref={fileRef} type="file" multiple hidden onChange={(e) => { if (e.target.files) take(fromList(e.target.files)); e.target.value = ""; }} />
      <input ref={dirRef} type="file" multiple hidden {...({ webkitdirectory: "", directory: "" } as Record<string, string>)} onChange={(e) => { if (e.target.files) take(fromList(e.target.files)); e.target.value = ""; }} />
    </div>
  );
}

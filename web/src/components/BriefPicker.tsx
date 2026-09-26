import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { BRIEF_AUDIENCES, BRIEF_INCLUDES, BRIEF_PURPOSES, type BriefChoice } from "@slidecraft/shared";
import { api, type SavedPrompt } from "../api";

export interface BriefValue {
  purposes: string[];
  include: string[];
  audiences: string[];
  text: string;
  audienceText: string;
  /** Ids of saved prompts ticked for this deck. */
  prompts: string[];
}

export const EMPTY_BRIEF: BriefValue = { purposes: [], include: [], audiences: [], text: "", audienceText: "", prompts: [] };

/** The ids of saved prompts marked "tick by default". */
export async function defaultPromptIds(): Promise<string[]> {
  try {
    return (await api.prompts()).filter((p) => p.isDefault).map((p) => p.id);
  } catch {
    return [];
  }
}

function Chips({ list, value, onChange }: { list: BriefChoice[]; value: string[]; onChange: (v: string[]) => void }) {
  return (
    <div className="chips">
      {list.map((c) => {
        const on = value.includes(c.id);
        return (
          <label key={c.id} className={"chip" + (on ? " on" : "")}>
            <input type="checkbox" checked={on} onChange={() => onChange(on ? value.filter((x) => x !== c.id) : [...value, c.id])} />
            {c.label}
          </label>
        );
      })}
    </div>
  );
}

/** Tick what the deck is for, what it must carry and who it is for. Typing is optional. */
export function BriefPicker({ value, onChange, compact }: { value: BriefValue; onChange: (v: BriefValue) => void; compact?: boolean }) {
  const set = (patch: Partial<BriefValue>) => onChange({ ...value, ...patch });
  const [saved, setSaved] = useState<SavedPrompt[]>([]);
  useEffect(() => {
    const load = () => api.prompts().then(setSaved).catch(() => {});
    load();
    // Prompts added in the other tab show up on coming back.
    window.addEventListener("focus", load);
    return () => window.removeEventListener("focus", load);
  }, []);
  return (
    <div className="stack">
      <div>
        <b className="small">Your saved prompts</b> <span className="small muted">{saved.length ? "Tick the ones this deck should follow." : ""} <Link to="/prompts" target="_blank" rel="noopener">{saved.length ? "Manage" : "Add your own instructions for every deck"}</Link></span>
        {saved.length > 0 && <Chips list={saved.map((p) => ({ id: p.id, label: p.name, line: p.text }))} value={value.prompts} onChange={(prompts) => set({ prompts })} />}
      </div>
      <div>
        <b className="small">What is the deck for?</b> <span className="small muted">Tick one or more.</span>
        <Chips list={BRIEF_PURPOSES} value={value.purposes} onChange={(purposes) => set({ purposes })} />
      </div>
      <div>
        <b className="small">It must include</b> <span className="small muted">Optional.</span>
        <Chips list={BRIEF_INCLUDES} value={value.include} onChange={(include) => set({ include })} />
      </div>
      <div>
        <b className="small">Who is in the room?</b> <span className="small muted">Optional.</span>
        <Chips list={BRIEF_AUDIENCES} value={value.audiences} onChange={(audiences) => set({ audiences })} />
        <input type="text" value={value.audienceText} onChange={(e) => set({ audienceText: e.target.value })} placeholder="Anyone else? e.g. KOL dermatologists in Klang Valley" style={{ marginTop: 8 }} />
      </div>
      <label className="f">
        Anything to add <span className="h">Optional. Name the product, the instrument, numbers you already know. The more concrete, the fewer [SAHKAN] markers.</span>
        <textarea value={value.text} onChange={(e) => set({ text: e.target.value })} rows={compact ? 3 : 5} placeholder="e.g. Our toner has 2% salicylic acid; what does the 2026 amendment change for it?" />
      </label>
    </div>
  );
}

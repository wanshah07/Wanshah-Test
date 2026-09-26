import { BRIEF_AUDIENCES, BRIEF_INCLUDES, BRIEF_PURPOSES, type BriefChoice } from "@slidecraft/shared";

export interface BriefValue {
  purposes: string[];
  include: string[];
  audiences: string[];
  text: string;
  audienceText: string;
}

export const EMPTY_BRIEF: BriefValue = { purposes: [], include: [], audiences: [], text: "", audienceText: "" };

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
  return (
    <div className="stack">
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

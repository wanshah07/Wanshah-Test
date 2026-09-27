import { FEATURE_LABELS, VISUAL_FEATURES, type Features } from "@slidecraft/shared";

const EXTRAS = (Object.keys(FEATURE_LABELS) as (keyof Features)[]).filter((k) => !VISUAL_FEATURES.includes(k));

/** Every visual device on, for Auto: the person unticks what they never want. */
export function allVisuals(f: Features): Features {
  return { ...f, ...Object.fromEntries(VISUAL_FEATURES.map((k) => [k, true])) };
}

/**
 * The choice of what may go on the slides: charts, figures, maps and every other device, then the
 * deck extras. In Auto only the devices show; the AI picks the extras.
 */
export function FeatureChoices({ features, onChange, auto, compact }: { features: Features; onChange: (f: Features) => void; auto: boolean; compact?: boolean }) {
  const box = (k: keyof Features) =>
    compact ? (
      <label key={k} className="row small" style={{ gap: 6 }} title={FEATURE_LABELS[k].help}>
        <input type="checkbox" checked={features[k]} onChange={(e) => onChange({ ...features, [k]: e.target.checked })} />
        {FEATURE_LABELS[k].label}
      </label>
    ) : (
      <label key={k} className={"toggle" + (features[k] ? " on" : "")}>
        <input type="checkbox" checked={features[k]} onChange={(e) => onChange({ ...features, [k]: e.target.checked })} />
        <div><b>{FEATURE_LABELS[k].label}</b><span>{FEATURE_LABELS[k].help}</span></div>
      </label>
    );
  const all = VISUAL_FEATURES.every((k) => features[k]);
  return (
    <div className="stack" style={{ gap: compact ? 4 : 10 }} data-testid="feature-choices">
      <div className="row" style={{ justifyContent: "space-between" }}>
        <b className={compact ? "small" : undefined}>On the slides</b>
        <button type="button" className="btn btn-quiet btn-xs" onClick={() => onChange(all ? { ...features, ...Object.fromEntries(VISUAL_FEATURES.map((k) => [k, false])) } : allVisuals(features))}>{all ? "Untick all" : "Tick all"}</button>
      </div>
      <span className="small muted">{auto ? "Auto uses each ticked device where your material can fill it. Untick what you never want." : "The writer uses each ticked device at least once where the sources can fill it honestly."}</span>
      <div className="grid c2" style={{ gap: compact ? 4 : undefined }}>{VISUAL_FEATURES.map(box)}</div>
      {!auto && (
        <>
          <b className={compact ? "small" : undefined}>Deck extras</b>
          <div className="grid c2" style={{ gap: compact ? 4 : undefined }}>{EXTRAS.map(box)}</div>
        </>
      )}
    </div>
  );
}

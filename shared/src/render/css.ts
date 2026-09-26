// Slide stylesheet. The canvas is 1920x1080 and the editor scales it with a
// transform, so every size here is in canvas pixels. Colours and fonts come in
// as custom properties set on the slide root by render/html.ts.
export const SLIDE_CSS = `
.sc-slide{position:relative;width:1920px;height:1080px;overflow:hidden;box-sizing:border-box;
  background:var(--bg);color:var(--ink);font-family:var(--font-body),system-ui,sans-serif;
  font-size:32px;line-height:1.35;-webkit-font-smoothing:antialiased}
.sc-slide *{box-sizing:border-box}
.sc-slide.sc-style-gradient{background:linear-gradient(135deg,var(--bg) 0%,color-mix(in srgb,var(--brand) 22%,var(--bg)) 100%)}
.sc-slide .sc-body{position:absolute;inset:96px 120px 120px 120px;display:flex;flex-direction:column;gap:28px}
.sc-slide.sc-style-panel .sc-body{background:var(--surface);border:2px solid var(--line);border-radius:var(--radius);
  padding:64px 80px;inset:72px 96px 104px 96px;box-shadow:0 10px 30px rgba(23,50,79,.08)}
.sc-slide .sc-h{font-family:var(--font-display),Georgia,serif;font-weight:600;font-size:64px;line-height:1.12;
  letter-spacing:-.01em;margin:0;color:var(--ink)}
.sc-slide .sc-h .sc-kicker{display:block;font-family:var(--font-body);font-size:24px;font-weight:600;letter-spacing:.12em;
  text-transform:uppercase;color:var(--brand-deep);margin-bottom:14px}
.sc-slide .sc-rule{width:120px;height:8px;border-radius:4px;background:linear-gradient(90deg,var(--brand),var(--brand-deep));flex:none}
.sc-slide .sc-content{flex:1;min-height:0;overflow:hidden;display:flex;flex-direction:column}
.sc-slide p{margin:0}
.sc-slide ul.sc-bullets{list-style:none;margin:0;padding:0;display:flex;flex-direction:column;gap:.55em}
.sc-slide ul.sc-bullets li{position:relative;padding-left:1.25em;color:var(--ink)}
.sc-slide ul.sc-bullets li::before{content:"";position:absolute;left:0;top:.52em;width:.5em;height:.5em;border-radius:50%;background:var(--brand)}
.sc-slide ul.sc-bullets.n-few{font-size:42px}
.sc-slide ul.sc-bullets.n-some{font-size:36px}
.sc-slide ul.sc-bullets.n-many{font-size:30px;gap:.4em}
.sc-slide .sc-prose{font-size:36px;color:var(--ink);max-width:1500px;white-space:pre-line}
.sc-slide .sc-cols{display:grid;grid-template-columns:1fr 1fr;gap:48px;flex:1;min-height:0}
.sc-slide .sc-col{background:color-mix(in srgb,var(--surface) 70%,var(--bg));border:2px solid var(--line);border-radius:var(--radius);
  padding:40px 44px;display:flex;flex-direction:column;gap:20px;min-height:0;overflow:hidden}
.sc-slide.sc-style-panel .sc-col{background:var(--bg)}
.sc-slide .sc-col h3{margin:0;font-family:var(--font-display);font-weight:600;font-size:36px;color:var(--brand-deep)}
.sc-slide .sc-col ul.sc-bullets{font-size:30px}
.sc-slide .sc-fig{flex:1;min-height:0;display:flex;align-items:center;justify-content:center}
.sc-slide .sc-fig svg{width:100%;height:100%}
.sc-slide .sc-fig img{width:100%;height:100%;object-fit:contain;border-radius:calc(var(--radius) * .6)}
.sc-slide .sc-cap{font-size:24px;color:var(--muted)}
.sc-slide table.sc-table{border-collapse:separate;border-spacing:0;width:100%;font-size:28px;background:var(--surface);
  border:2px solid var(--line);border-radius:var(--radius);overflow:hidden}
.sc-slide table.sc-table th{background:color-mix(in srgb,var(--brand) 14%,var(--surface));color:var(--brand-deep);font-weight:600;
  text-align:left;padding:18px 24px;font-size:26px;letter-spacing:.02em}
.sc-slide table.sc-table td{padding:16px 24px;border-top:2px solid var(--line);vertical-align:top;color:var(--ink)}
.sc-slide table.sc-table.rows-many{font-size:24px}
.sc-slide table.sc-table.rows-many td,.sc-slide table.sc-table.rows-many th{padding:10px 20px}
.sc-slide .sc-kpis{display:grid;grid-template-columns:repeat(var(--kpi-n,3),1fr);gap:36px;flex:1;align-content:center}
.sc-slide .sc-kpi{background:var(--surface);border:2px solid var(--line);border-radius:var(--radius);padding:44px 40px;
  box-shadow:0 6px 24px rgba(23,50,79,.06)}
.sc-slide .sc-kpi .v{font-family:var(--font-display);font-size:96px;font-weight:600;line-height:1;color:var(--brand-deep);letter-spacing:-.02em}
.sc-slide .sc-kpi .l{font-size:28px;font-weight:600;color:var(--ink);margin-top:18px}
.sc-slide .sc-kpi .n{font-size:24px;color:var(--muted);margin-top:8px}
.sc-slide .sc-quote{flex:1;display:flex;flex-direction:column;justify-content:center;gap:36px;max-width:1500px}
.sc-slide .sc-quote .q{font-family:var(--font-display);font-size:64px;line-height:1.25;font-weight:500;color:var(--ink)}
.sc-slide .sc-quote .q::before{content:"\\201C";color:var(--brand);margin-right:.1em}
.sc-slide .sc-quote .by{font-size:30px;color:var(--ink2)}
.sc-slide .sc-cite{position:absolute;left:120px;right:300px;bottom:44px;font-size:20px;color:var(--muted);line-height:1.3}
.sc-slide.sc-style-panel .sc-cite{left:96px}
.sc-slide .sc-cite span{display:block}
.sc-slide .sc-foot{position:absolute;right:120px;bottom:44px;font-size:20px;color:var(--muted);display:flex;gap:24px;align-items:center}
.sc-slide .sc-num{font-weight:600;color:var(--ink2)}
.sc-slide .sc-logo{position:absolute;top:44px;left:120px;height:56px}
.sc-slide .sc-logo img{height:100%;width:auto}
/* title */
.sc-slide.sc-title .sc-body,.sc-slide.sc-closing .sc-body{justify-content:center;gap:40px;inset:0;padding:160px 160px;border:0;box-shadow:none;background:transparent;border-radius:0}
.sc-slide.sc-title .sc-h,.sc-slide.sc-closing .sc-h{font-size:108px;line-height:1.05;max-width:1500px}
.sc-slide.sc-title .sc-sub,.sc-slide.sc-closing .sc-sub{font-size:40px;color:var(--ink2);max-width:1400px;line-height:1.35}
.sc-slide.sc-title::after,.sc-slide.sc-closing::after{content:"";position:absolute;right:-160px;top:-160px;width:720px;height:720px;border-radius:50%;
  background:radial-gradient(circle at 40% 40%,color-mix(in srgb,var(--brand) 35%,transparent),transparent 70%);pointer-events:none}
.sc-slide.sc-title .sc-cite{display:none}
/* section */
.sc-slide.sc-section .sc-body{justify-content:center;gap:24px;inset:0;padding:0 160px;border:0;box-shadow:none;background:transparent;border-radius:0}
.sc-slide.sc-section{background:linear-gradient(135deg,var(--brand-deep),var(--brand))}
.sc-slide.sc-section .sc-h{color:#fff;font-size:96px}
.sc-slide.sc-section .sc-h .sc-kicker{color:rgba(255,255,255,.75)}
.sc-slide.sc-section .sc-sub{color:rgba(255,255,255,.85);font-size:36px}
.sc-slide.sc-section .sc-rule{background:#fff}
.sc-slide.sc-section .sc-foot,.sc-slide.sc-section .sc-cite{color:rgba(255,255,255,.7)}
.sc-slide.sc-section .sc-num{color:#fff}
/* image */
.sc-slide .sc-placeholder{flex:1;border:3px dashed var(--line);border-radius:var(--radius);display:flex;align-items:center;justify-content:center;
  text-align:center;padding:60px;color:var(--muted);font-size:28px;background:color-mix(in srgb,var(--surface) 60%,transparent)}
.sc-slide .sc-dek{font-size:30px;color:var(--ink2);margin-top:-12px;max-width:1600px;line-height:1.35}
.sc-slide .sc-cards{display:grid;grid-template-columns:repeat(var(--cols,3),1fr);gap:28px;flex:1;min-height:0;align-content:start}
.sc-slide .sc-card{background:var(--surface);border:2px solid var(--line);border-radius:var(--radius);padding:30px 34px;display:flex;flex-direction:column;gap:12px;min-height:0;overflow:hidden;
  box-shadow:0 6px 24px rgba(23,50,79,.05);border-top:8px solid var(--brand)}
.sc-slide .sc-card .top{display:flex;align-items:center;justify-content:space-between;gap:12px}
.sc-slide .sc-card .no{width:52px;height:52px;border-radius:50%;background:var(--brand);color:#fff;font-weight:700;font-size:28px;display:grid;place-items:center;flex:none}
.sc-slide .sc-card .hd{font-family:var(--font-display);font-weight:600;font-size:34px;line-height:1.2;color:var(--ink)}
.sc-slide .sc-card .dt{font-size:26px;color:var(--ink2);line-height:1.4}
.sc-slide .sc-badge{display:inline-block;padding:4px 14px;border-radius:999px;font-size:20px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;white-space:nowrap}
.sc-slide .sc-badge.v-good{background:#E3F5EA;color:#0F5A34}
.sc-slide .sc-badge.v-mid{background:#FFF1D6;color:#7A4B00}
.sc-slide .sc-badge.v-bad{background:#FDECEC;color:#8C2323}
.sc-slide .sc-badge.v-plain{background:color-mix(in srgb,var(--brand) 14%,var(--surface));color:var(--brand-deep)}
.sc-slide mark.sahkan{background:#FFE8A3;color:#6B4E00;border-radius:6px;padding:0 .2em}
.sc-slide code{font-family:ui-monospace,Menlo,Consolas,monospace;font-size:.9em;background:color-mix(in srgb,var(--line) 50%,transparent);padding:0 .25em;border-radius:6px}
`;

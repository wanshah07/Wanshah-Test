// Slide stylesheet. The canvas is 1920x1080 and the editor scales it with a
// transform, so every size here is in canvas pixels. Colours and fonts come in
// as custom properties set on the slide root by render/html.ts.
const RAW_CSS = `
.sc-slide{position:relative;width:1920px;height:1080px;overflow:hidden;box-sizing:border-box;
  background:var(--bg);color:var(--ink);font-family:var(--font-body),system-ui,sans-serif;
  font-size:32px;line-height:1.35;-webkit-font-smoothing:antialiased;overflow-wrap:break-word}
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
.sc-slide .sc-cards{display:grid;grid-template-columns:repeat(var(--cols,3),1fr);gap:calc(28px * var(--k, 1));flex:1;min-height:0;align-content:start}
.sc-slide .sc-card{background:var(--surface);border:2px solid var(--line);border-radius:var(--radius);padding:calc(30px * var(--k, 1)) calc(34px * var(--k, 1));display:flex;flex-direction:column;gap:calc(12px * var(--k, 1));min-height:0;overflow:hidden;
  box-shadow:0 6px 24px rgba(23,50,79,.05);border-top:8px solid var(--brand)}
.sc-slide .sc-card .top{display:flex;align-items:center;justify-content:space-between;gap:12px}
.sc-slide .sc-card .no{width:calc(52px * var(--k, 1));height:calc(52px * var(--k, 1));border-radius:50%;background:var(--brand);color:#fff;font-weight:700;font-size:28px;display:grid;place-items:center;flex:none}
.sc-slide .sc-card .hd{font-family:var(--font-display);font-weight:600;font-size:34px;line-height:1.2;color:var(--ink)}
.sc-slide .sc-card .dt{font-size:26px;color:var(--ink2);line-height:1.4}
.sc-slide .sc-badge{display:inline-block;padding:4px 14px;border-radius:999px;font-size:20px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;white-space:nowrap}
.sc-slide .sc-badge.v-good{background:#E3F5EA;color:#0F5A34}
.sc-slide .sc-badge.v-mid{background:#FFF1D6;color:#7A4B00}
.sc-slide .sc-badge.v-bad{background:#FDECEC;color:#8C2323}
.sc-slide .sc-badge.v-plain{background:color-mix(in srgb,var(--brand) 14%,var(--surface));color:var(--brand-deep)}
.sc-slide .sc-diagram{flex:1;min-height:0;display:flex;flex-direction:column;justify-content:center}
.sc-slide .sc-flow{display:grid;grid-template-columns:repeat(var(--per,4),1fr);column-gap:56px;row-gap:64px}
.sc-slide .sc-step{position:relative;background:var(--surface);border:2px solid var(--line);border-radius:var(--radius);padding:26px 28px;display:flex;flex-direction:column;gap:10px;min-width:0}
.sc-slide .sc-step .no{width:48px;height:48px;border-radius:50%;background:var(--brand);color:#fff;font-weight:700;font-size:24px;display:grid;place-items:center}
.sc-slide .sc-step .lb{font-weight:600;font-size:28px;line-height:1.25;color:var(--ink)}
.sc-slide .sc-step .dt{font-size:22px;line-height:1.35;color:var(--ink2)}
.sc-slide .sc-step.a-right::after{content:"";position:absolute;right:-46px;top:50%;width:0;height:0;border-top:14px solid transparent;border-bottom:14px solid transparent;border-left:22px solid var(--brand-deep);transform:translateY(-50%)}
.sc-slide .sc-step.a-down::after{content:"";position:absolute;bottom:-50px;left:50%;width:0;height:0;border-left:14px solid transparent;border-right:14px solid transparent;border-top:22px solid var(--brand-deep);transform:translateX(-50%)}
.sc-slide .sc-tl{position:relative;display:grid;grid-template-columns:repeat(var(--n,4),1fr);gap:24px}
.sc-slide .sc-tl::before{content:"";position:absolute;left:0;right:0;top:18px;height:8px;border-radius:4px;background:var(--line)}
.sc-slide .sc-ev{position:relative;padding-top:60px;text-align:center;min-width:0}
.sc-slide .sc-ev .dot{position:absolute;top:6px;left:50%;width:32px;height:32px;margin-left:-16px;border-radius:50%;background:var(--brand);border:6px solid var(--surface)}
.sc-slide .sc-ev .wh{font-weight:700;font-size:26px;color:var(--brand-deep)}
.sc-slide .sc-ev .lb{font-size:24px;line-height:1.35;color:var(--ink);margin-top:8px}
.sc-slide table.sc-matrix thead th{text-align:center}
.sc-slide table.sc-matrix th.rh{background:transparent;color:var(--ink);text-align:left}
.sc-slide table.sc-matrix td{text-align:center;color:var(--ink2);font-size:24px}
.sc-slide table.sc-matrix .mk{display:inline-grid;place-items:center;width:44px;height:44px;border-radius:50%;font-weight:700;font-size:26px}
.sc-slide table.sc-matrix .mk.yes{background:var(--brand);color:#fff}
.sc-slide table.sc-matrix .mk.no{background:var(--line);color:var(--ink2)}
.sc-slide code{font-family:ui-monospace,Menlo,Consolas,monospace;font-size:.9em;background:color-mix(in srgb,var(--line) 50%,transparent);padding:0 .25em;border-radius:6px}
/* card colours from the theme's series */
.sc-slide .sc-card{border-top-color:var(--cc,var(--brand))}
.sc-slide .sc-card .no{background:var(--cc,var(--brand))}
/* verdict badge beside the title */
.sc-slide .sc-headrow{display:flex;align-items:flex-start;justify-content:space-between;gap:32px;flex:none}
.sc-slide .sc-headtxt{display:flex;flex-direction:column;gap:28px;min-width:0}
.sc-slide .sc-vbadge{font-size:24px;padding:10px 24px;margin-top:6px;flex:none}
/* theme tag, top right */
.sc-slide .sc-tag{position:absolute;top:40px;right:120px;font-size:18px;font-weight:700;letter-spacing:.14em;text-transform:uppercase;color:var(--muted);max-width:900px;text-align:right}
/* capitals and dark title slides */
.sc-slide.sc-upper .sc-h{text-transform:uppercase;letter-spacing:.01em}
.sc-slide.sc-dark{background:var(--brand-deep)}
.sc-slide.sc-dark .sc-h{color:#fff}
.sc-slide.sc-dark .sc-h .sc-kicker{color:rgba(255,255,255,.75)}
.sc-slide.sc-dark .sc-sub{color:rgba(255,255,255,.85)}
.sc-slide.sc-dark .sc-foot,.sc-slide.sc-dark .sc-cite,.sc-slide.sc-dark .sc-tag{color:rgba(255,255,255,.7)}
.sc-slide.sc-dark .sc-num{color:#fff}
.sc-slide.sc-dark .sc-hero .hs{background:rgba(255,255,255,.08);border-color:rgba(255,255,255,.18)}
.sc-slide.sc-dark .sc-hero .v{color:#fff}
.sc-slide.sc-dark .sc-hero .l{color:rgba(255,255,255,.8)}
/* hero stats on the title slide */
.sc-slide .sc-hero{display:grid;grid-template-columns:repeat(auto-fit,minmax(0,1fr));gap:28px;max-width:1500px}
.sc-slide .sc-hero .hs{border:2px solid var(--line);border-radius:var(--radius);padding:24px 30px;background:color-mix(in srgb,var(--surface) 70%,transparent)}
.sc-slide .sc-hero .v{font-family:var(--font-display);font-size:64px;font-weight:700;line-height:1;color:var(--brand-deep)}
.sc-slide .sc-hero .l{font-size:24px;color:var(--ink2);margin-top:10px}
/* side panels */
.sc-slide .sc-row{flex:1;min-height:0;display:flex;gap:40px}
.sc-slide .sc-main{flex:1;min-width:0;min-height:0;display:flex;flex-direction:column;gap:20px}
.sc-slide .sc-asides{width:520px;flex:none;display:flex;flex-direction:column;gap:24px;min-height:0;overflow:hidden}
.sc-slide .sc-aside{background:color-mix(in srgb,var(--brand) 9%,var(--surface));border-left:8px solid var(--brand);border-radius:var(--radius);padding:28px 32px;min-height:0;overflow:hidden}
.sc-slide .sc-aside.a2{background:color-mix(in srgb,var(--accent) 11%,var(--surface));border-left-color:var(--accent)}
.sc-slide .sc-aside h4{margin:0 0 14px;font-size:22px;font-weight:700;letter-spacing:.12em;text-transform:uppercase;color:var(--brand-deep)}
.sc-slide .sc-aside ul{margin:0;padding-left:1.1em;font-size:25px;line-height:1.35;color:var(--ink);display:flex;flex-direction:column;gap:.4em}
/* callout banner */
.sc-slide .sc-callout{flex:none;background:var(--brand-deep);color:#fff;border-radius:var(--radius);padding:24px 40px;font-size:30px;font-weight:600;line-height:1.3}
/* ring gauges */
.sc-slide .sc-rings{display:grid;grid-template-columns:repeat(var(--kpi-n,3),1fr);gap:36px;flex:1;min-height:0;align-content:center;justify-items:center}
.sc-slide .sc-ring{display:flex;flex-direction:column;align-items:center;text-align:center;gap:12px;min-width:0}
.sc-slide .sc-ring .g{position:relative;width:calc(300px * var(--k, 1));height:calc(300px * var(--k, 1))}
.sc-slide .sc-ring svg{width:100%;height:100%}
.sc-slide .sc-ring .v{position:absolute;inset:0;display:grid;place-items:center;font-family:var(--font-display);font-size:64px;font-weight:700;color:var(--brand-deep);letter-spacing:-.02em}
.sc-slide .sc-ring .l{font-size:28px;font-weight:600;color:var(--ink);max-width:380px}
.sc-slide .sc-ring .n{font-size:22px;color:var(--muted);max-width:380px}
/* fact sheet */
.sc-slide .sc-facts{display:flex;flex-direction:column;background:var(--surface);border:2px solid var(--line);border-radius:var(--radius);overflow:hidden;min-height:0}
.sc-slide .sc-facts .fr{display:grid;grid-template-columns:minmax(260px,30%) 1fr;border-top:2px solid var(--line)}
.sc-slide .sc-facts .fr:first-child{border-top:0}
.sc-slide .sc-facts .fl{padding:18px 28px;background:color-mix(in srgb,var(--brand) 9%,var(--surface));font-size:21px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:var(--brand-deep)}
.sc-slide .sc-facts .fv{padding:16px 28px;font-size:28px;line-height:1.35;color:var(--ink)}
.sc-slide .sc-facts .fr.hl .fl{background:color-mix(in srgb,var(--accent) 24%,var(--surface))}
.sc-slide .sc-facts .fr.hl .fv{background:color-mix(in srgb,var(--accent) 12%,var(--surface));font-weight:600}
/* picture gallery */
.sc-slide .sc-gallery{display:grid;grid-template-columns:repeat(var(--gc,3),1fr);gap:28px;flex:1;min-height:0;grid-auto-rows:1fr}
.sc-slide .sc-gallery .gi{margin:0;display:flex;flex-direction:column;gap:12px;min-height:0;min-width:0}
.sc-slide .sc-gallery .ph{flex:1;min-height:0;border-radius:calc(var(--radius) * .6);overflow:hidden;background:var(--surface);border:2px solid var(--line);display:flex}
.sc-slide .sc-gallery .ph img{width:100%;height:100%;object-fit:cover;display:block}
.sc-slide .sc-gallery .ph .sc-placeholder{border:0;font-size:22px;padding:20px}
.sc-slide .sc-gallery figcaption{font-size:22px;line-height:1.3;color:var(--ink2);flex:none}
/* country map */
.sc-slide .sc-mapwrap{flex:1;min-height:0;display:flex;gap:48px}
.sc-slide .sc-mapbox{flex:1.4;min-width:0;min-height:0;display:flex;align-items:center;justify-content:center}
.sc-slide .sc-map{display:grid;gap:10px;height:100%;max-width:100%;aspect-ratio:var(--ar)}
.sc-slide .sc-map .tile{border-radius:calc(var(--radius) * .4);display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center;padding:4px;min-width:0;min-height:0;overflow:hidden;line-height:1.1}
.sc-slide .sc-map .tile b{font-size:26px;font-weight:700}
.sc-slide .sc-map .tile span{font-size:15px;font-weight:600;margin-top:4px;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}
.sc-slide .t-good{background:#2E9E6A;color:#fff}
.sc-slide .t-mid{background:#E8A13B;color:#2B1B00}
.sc-slide .t-bad{background:#D64545;color:#fff}
.sc-slide .t-info{background:var(--brand);color:#fff}
.sc-slide .t-none{background:color-mix(in srgb,var(--line) 70%,var(--surface));color:var(--muted)}
.sc-slide .sc-mapkey{flex:1;min-width:0;min-height:0;overflow:hidden;display:flex;flex-direction:column;gap:14px}
.sc-slide .sc-mapkey .lg{font-size:24px;font-weight:600;color:var(--ink2)}
.sc-slide .sc-mapkey ul{list-style:none;margin:0;padding:0;display:flex;flex-direction:column;gap:14px;font-size:26px;color:var(--ink)}
.sc-slide .sc-mapkey li{position:relative;padding-left:40px;line-height:1.3}
.sc-slide .sc-mapkey .sw{position:absolute;left:0;top:6px;width:24px;height:24px;border-radius:6px}
.sc-slide .sc-mapkey .nt{display:block;font-size:21px;color:var(--muted)}
/* mechanism map */
.sc-slide .sc-hub{display:grid;grid-template-columns:1fr auto 1fr;grid-template-rows:minmax(0,1fr);gap:56px;align-items:center;flex:1;min-height:0}
.sc-slide .sc-hub .side{display:flex;flex-direction:column;gap:22px;justify-content:center;min-width:0;max-height:100%;overflow:hidden}
.sc-slide .sc-hub .side.l{margin-right:-56px;padding-right:56px}
.sc-slide .sc-hub .side.r{margin-left:-56px;padding-left:56px}
.sc-slide .sc-hub .nw{position:relative;min-width:0}
.sc-slide .sc-hub .node{background:var(--surface);border:2px solid var(--line);border-radius:var(--radius);padding:18px 24px}
.sc-slide .sc-hub .side.l .node{text-align:right;border-right:6px solid var(--brand)}
.sc-slide .sc-hub .side.r .node{border-left:6px solid var(--brand)}
.sc-slide .sc-hub .side.l .nw::after{content:"";position:absolute;top:50%;right:-56px;width:52px;height:3px;background:var(--line)}
.sc-slide .sc-hub .side.r .nw::before{content:"";position:absolute;top:50%;left:-56px;width:52px;height:3px;background:var(--line)}
.sc-slide .sc-hub .node .lb{font-weight:700;font-size:28px;color:var(--ink);line-height:1.2}
.sc-slide .sc-hub .node .dt{font-size:22px;color:var(--ink2);line-height:1.3;margin-top:4px}
.sc-slide .sc-hub .disc{width:340px;height:340px;border-radius:50%;display:grid;place-items:center;text-align:center;padding:36px;
  background:radial-gradient(circle at 35% 30%,var(--brand),var(--brand-deep));color:#fff;font-family:var(--font-display);font-weight:700;font-size:36px;line-height:1.15;
  box-shadow:0 0 0 18px color-mix(in srgb,var(--brand) 16%,transparent)}
.sc-slide .sc-pills{display:flex;flex-wrap:wrap;gap:16px;justify-content:center;margin-top:28px;flex:none}
.sc-slide .sc-pills span{background:color-mix(in srgb,var(--brand) 14%,var(--surface));color:var(--brand-deep);border-radius:999px;padding:10px 26px;font-size:24px;font-weight:700}
/* funnel */
.sc-slide .sc-funnel{display:grid;grid-template-columns:repeat(var(--n,4),1fr);gap:0;align-items:start}
.sc-slide .sc-funnel .stage{display:flex;flex-direction:column;align-items:center;text-align:center;gap:12px;min-width:0}
.sc-slide .sc-funnel .chev{width:100%;height:calc(170px * var(--k, 1));display:grid;place-items:center;padding:0 60px;
  background:color-mix(in srgb,var(--brand-deep) calc(100% - var(--i) * 16%),var(--brand));color:#fff;
  clip-path:polygon(0 0,calc(100% - 48px) 0,100% 50%,calc(100% - 48px) 100%,0 100%,48px 50%)}
.sc-slide .sc-pal .sc-funnel .stage:nth-child(8n+1) .chev{background:var(--p0)}
.sc-slide .sc-pal .sc-funnel .stage:nth-child(8n+2) .chev{background:var(--p1)}
.sc-slide .sc-pal .sc-funnel .stage:nth-child(8n+3) .chev{background:var(--p2)}
.sc-slide .sc-pal .sc-funnel .stage:nth-child(8n+4) .chev{background:var(--p3)}
.sc-slide .sc-pal .sc-funnel .stage:nth-child(8n+5) .chev{background:var(--p4)}
.sc-slide .sc-pal .sc-funnel .stage:nth-child(8n+6) .chev{background:var(--p5)}
.sc-slide .sc-pal .sc-funnel .stage:nth-child(8n+7) .chev{background:var(--p6)}
.sc-slide .sc-funnel .stage.first .chev{clip-path:polygon(0 0,calc(100% - 48px) 0,100% 50%,calc(100% - 48px) 100%,0 100%)}
.sc-slide .sc-funnel .v{font-family:var(--font-display);font-size:64px;font-weight:700;line-height:1}
.sc-slide .sc-funnel .lb{font-size:26px;font-weight:600;color:var(--ink);padding:0 16px;line-height:1.25}
.sc-slide .sc-funnel .rate{font-size:22px;color:var(--muted)}
/* equation */
.sc-slide .sc-eq{display:flex;align-items:stretch;justify-content:center;gap:20px}
.sc-slide .sc-eq .term{flex:1;min-width:0;background:var(--surface);border:2px solid var(--line);border-radius:var(--radius);padding:30px 24px;text-align:center;display:flex;flex-direction:column;justify-content:center;gap:12px}
.sc-slide .sc-eq .term .v{font-family:var(--font-display);font-size:72px;font-weight:700;line-height:1;color:var(--brand-deep)}
.sc-slide .sc-eq .term .lb{font-size:26px;color:var(--ink2);line-height:1.3}
.sc-slide .sc-eq .term.res{background:var(--brand-deep);border-color:var(--brand-deep)}
.sc-slide .sc-eq .term.res .v,.sc-slide .sc-eq .term.res .lb{color:#fff}
.sc-slide .sc-eq .op{align-self:center;font-size:64px;font-weight:700;color:var(--brand);flex:none}
/* bloom: the house style. Light slides on a white-to-tint wash with a teal bloom top right and an amber
   one bottom left; dark cover and close with a teal glow; borderless cards with a soft wide shadow. */
.sc-slide .sc-dots{position:absolute;inset:0;width:100%;height:100%;pointer-events:none}
.sc-slide.sc-style-bloom{background:
  radial-gradient(900px 760px at 100% 0%,color-mix(in srgb,var(--brand) 16%,transparent),transparent 70%),
  radial-gradient(820px 660px at 0% 100%,color-mix(in srgb,var(--accent) 9%,transparent),transparent 70%),
  linear-gradient(135deg,#FFFFFF 0%,color-mix(in srgb,var(--brand) 10%,#FFFFFF) 100%)}
.sc-slide.sc-style-bloom.sc-dark,.sc-slide.sc-style-bloom.sc-section{background:
  radial-gradient(1200px 900px at 70% 40%,color-mix(in srgb,var(--brand) 40%,transparent),transparent 65%),
  radial-gradient(900px 640px at 0% 100%,color-mix(in srgb,var(--accent) 16%,transparent),transparent 70%),
  linear-gradient(120deg,var(--ink) 0%,var(--brand-deep) 50%,var(--ink) 100%)}
.sc-slide.sc-style-bloom.sc-title::after,.sc-slide.sc-style-bloom.sc-closing::after{display:none}
.sc-slide.sc-style-bloom .sc-rule{display:none}
.sc-slide.sc-style-bloom .sc-h .sc-kicker{color:var(--accent);letter-spacing:.16em;font-weight:700}
.sc-slide.sc-style-bloom.sc-dark .sc-h .sc-kicker,.sc-slide.sc-style-bloom.sc-section .sc-h .sc-kicker{color:color-mix(in srgb,var(--accent) 70%,#FFD27A)}
.sc-slide.sc-style-bloom.sc-dark .sc-h .l2{color:var(--glow)}
.sc-slide.sc-style-bloom .sc-card,.sc-slide.sc-style-bloom .sc-kpi,.sc-slide.sc-style-bloom .sc-step,.sc-slide.sc-style-bloom .sc-col,
.sc-slide.sc-style-bloom .sc-eq .term:not(.res),.sc-slide.sc-style-bloom .sc-hub .node,.sc-slide.sc-style-bloom .sc-facts,.sc-slide.sc-style-bloom table.sc-table{
  border-color:transparent;box-shadow:0 27px 75px rgba(11,27,58,.09)}
.sc-slide.sc-style-bloom .sc-card{border-top-width:2px}
.sc-slide.sc-style-bloom .sc-card:nth-child(even),.sc-slide.sc-style-bloom .sc-kpi:nth-child(even),.sc-slide.sc-style-bloom .sc-step:nth-child(even),.sc-slide.sc-style-bloom .sc-col:nth-child(even){
  background:color-mix(in srgb,var(--brand) 7%,#FFFFFF);box-shadow:0 18px 50px rgba(11,27,58,.06)}
.sc-slide.sc-style-bloom .sc-hub .side.l .node,.sc-slide.sc-style-bloom .sc-hub .side.r .node{border-left-width:2px;border-right-width:2px}
.sc-slide.sc-style-bloom .sc-aside{border-left-width:0;border-radius:var(--radius);background:color-mix(in srgb,var(--brand) 8%,#FFFFFF)}
.sc-slide.sc-style-bloom .sc-aside.a2{background:color-mix(in srgb,var(--accent) 9%,#FFFFFF)}
.sc-slide.sc-style-bloom .sc-callout{border-radius:999px;background:linear-gradient(90deg,var(--brand),color-mix(in srgb,var(--brand) 60%,var(--glow)));
  font-family:var(--font-quote),Georgia,serif;font-style:italic;font-weight:400;font-size:36px;text-align:center;padding:18px 56px}
.sc-slide.sc-style-bloom .sc-cite{font-style:italic}
.sc-slide.sc-style-bloom.sc-dark .sc-hero .hs{background:rgba(255,255,255,.08);border-color:rgba(255,255,255,.16)}
/* takeaways on the closing slide */
.sc-slide .sc-chips{display:flex;flex-wrap:wrap;gap:20px;max-width:1600px}
.sc-slide .sc-chips span{padding:16px 30px;border-radius:999px;font-size:26px;font-weight:600;background:color-mix(in srgb,var(--brand) 10%,var(--surface));color:var(--ink);border:2px solid var(--line)}
.sc-slide.sc-dark .sc-chips span{background:rgba(255,255,255,.1);border-color:rgba(255,255,255,.22);color:#fff}
`;

// Every font size is a multiple of --k (and the source lines of --kc), which
// fitSlide() lowers until nothing on the slide overflows. At --k:1 the slide
// looks exactly as designed.
export const SLIDE_CSS = RAW_CSS.replace(/(\.sc-cite\{[^}]*?)font-size:(\d+)px/, "$1font-size:calc($2px * var(--kc, 1))").replace(/font-size:(\d+)px/g, "font-size:calc($1px * var(--k, 1))");

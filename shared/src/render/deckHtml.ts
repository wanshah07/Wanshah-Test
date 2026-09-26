import type { Deck } from "../deck.js";
import { esc } from "./escape.js";
import { SLIDE_CSS } from "./css.js";
import { renderDeckSlides } from "./html.js";
import { fitSlide } from "./fit.js";
import { fontsUrl } from "../theme.js";

// A self-contained HTML deck: every slide, keyboard and click navigation,
// speaker notes on N, the fonts linked. Pictures arrive as data URIs from the
// server so the file opens anywhere with no network beyond the fonts.
export function renderDeckHtml(deck: Deck, mediaUrl: (id: string) => string): string {
  const slides = renderDeckSlides(deck, mediaUrl);
  const fonts = fontsUrl(deck.theme);
  const notes = deck.slides.map((s) => s.notes ?? "");
  return `<!doctype html>
<html lang="${deck.lang}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(deck.title)}</title>
${fonts ? `<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="stylesheet" href="${fonts}">` : ""}
<style>
html,body{margin:0;height:100%;background:#0b1620;color:#f1f5fb;font-family:Inter,system-ui,sans-serif;overflow:hidden}
#stage{position:fixed;inset:0;display:flex;align-items:center;justify-content:center}
#frame{position:relative;flex:none;width:1920px;height:1080px;transform-origin:center;box-shadow:0 26px 60px rgba(0,0,0,.58)}
#frame > .sc-slide{position:absolute;inset:0;display:none}
#frame > .sc-slide.on{display:block}
#hud{position:fixed;left:0;right:0;bottom:0;padding:10px 18px;font-size:13px;color:#9badc7;display:flex;gap:18px;justify-content:space-between;
  background:linear-gradient(transparent,rgba(0,0,0,.4));pointer-events:none;transition:opacity .4s}
#hud.hide{opacity:0}
#notes{position:fixed;right:0;top:0;bottom:0;width:min(420px,40vw);background:rgba(11,22,32,.96);color:#f1f5fb;padding:24px;
  font-size:16px;line-height:1.55;overflow:auto;display:none;border-left:1px solid rgba(255,255,255,.16);white-space:pre-line}
#notes.on{display:block}
#notes h4{margin:0 0 8px;font-weight:600;color:#9badc7;font-size:12px;letter-spacing:.1em;text-transform:uppercase}
#grid{position:fixed;inset:0;background:rgba(11,22,32,.96);display:none;overflow:auto;padding:24px;gap:16px;grid-template-columns:repeat(auto-fill,minmax(240px,1fr))}
#grid.on{display:grid}
#grid .th{position:relative;aspect-ratio:16/9;overflow:hidden;border-radius:10px;border:2px solid transparent;cursor:pointer;background:#fff}
#grid .th.cur{border-color:#4898d8}
#grid .th > .sc-slide{transform:scale(calc(240/1920));transform-origin:top left;position:absolute;left:0;top:0}
#grid .th .n{position:absolute;left:8px;bottom:6px;font-size:12px;color:#fff;background:rgba(0,0,0,.55);padding:2px 8px;border-radius:999px}
${SLIDE_CSS}
</style>
</head>
<body>
<div id="stage"><div id="frame">${slides.map((h, i) => (i === 0 ? h.replace('class="sc-slide', 'class="sc-slide on') : h)).join("\n")}</div></div>
<aside id="notes"><h4>Notes</h4><div id="notesBody"></div></aside>
<div id="grid"></div>
<div id="hud"><span id="pos"></span><span>← → navigate · N notes · G grid · F fullscreen</span></div>
<script>
(function(){
  var notes=${JSON.stringify(notes)};
  var frame=document.getElementById('frame'),slides=Array.prototype.slice.call(frame.children);
  var i=0,hud=document.getElementById('hud'),pos=document.getElementById('pos'),nb=document.getElementById('notesBody'),np=document.getElementById('notes'),grid=document.getElementById('grid');
  function fit(){var np2=np.classList.contains('on')?np.offsetWidth:0;var w=window.innerWidth-np2,h=window.innerHeight;var s=Math.min(w/1920,h/1080);frame.style.transform='scale('+s+')';frame.style.marginRight=np2+'px'}
  function show(n){i=Math.max(0,Math.min(slides.length-1,n));slides.forEach(function(s,k){s.classList.toggle('on',k===i)});pos.textContent=(i+1)+' / '+slides.length;nb.textContent=notes[i]||'';location.hash='#'+(i+1);
    Array.prototype.forEach.call(grid.children,function(t,k){t.classList.toggle('cur',k===i)})}
  function buildGrid(){slides.forEach(function(s,k){var t=document.createElement('div');t.className='th';t.innerHTML=s.outerHTML.replace(' on"','"');t.firstChild.style.display='block';var n=document.createElement('span');n.className='n';n.textContent=k+1;t.appendChild(n);t.onclick=function(){grid.classList.remove('on');show(k)};grid.appendChild(t)})}
  var hideT;function poke(){hud.classList.remove('hide');clearTimeout(hideT);hideT=setTimeout(function(){hud.classList.add('hide')},2500)}
  document.addEventListener('keydown',function(e){
    if(e.key==='ArrowRight'||e.key==='PageDown'||e.key===' ')show(i+1);
    else if(e.key==='ArrowLeft'||e.key==='PageUp')show(i-1);
    else if(e.key==='Home')show(0);else if(e.key==='End')show(slides.length-1);
    else if(e.key.toLowerCase()==='n'){np.classList.toggle('on');fit()}
    else if(e.key.toLowerCase()==='g'){grid.classList.toggle('on')}
    else if(e.key.toLowerCase()==='f'){if(document.fullscreenElement)document.exitFullscreen();else document.documentElement.requestFullscreen()}
    else if(e.key==='Escape'){grid.classList.remove('on')}
    else return;poke()});
  document.getElementById('stage').addEventListener('click',function(e){show(e.clientX<window.innerWidth/3?i-1:i+1);poke()});
  document.addEventListener('mousemove',poke);
  window.addEventListener('resize',fit);
  var fitSlide=${fitSlide.toString()};
  function fitAll(){slides.forEach(function(s){fitSlide(s)})}
  function start(){fitAll();buildGrid();var h=parseInt((location.hash||'#1').slice(1),10);fit();show(isNaN(h)?0:h-1);poke()}
  // Fit once the fonts are in, so the measurement matches what is shown.
  var started=false;function go(){if(!started){started=true;start()}}
  if(document.fonts&&document.fonts.ready){document.fonts.ready.then(go);setTimeout(go,3000)}else go();
})();
</script>
</body>
</html>`;
}

// Shrinks a rendered slide's text until nothing overflows or is clipped.
//
// The slide stylesheet sizes every font as a multiple of --k (source lines of
// --kc). This lowers --k in small steps until the body, the content area and
// every panel, card, tile and column hold their text, then does the same for
// the source lines so they never run into the body. It measures layout sizes,
// which a CSS transform (the editor's zoom) does not change.
//
// Self-contained on purpose: the exported HTML deck embeds its source text.

export interface FitResult {
  /** The text scale used, 1 when the slide already fitted. */
  scale: number;
  /** True when even the smallest scale could not hold the text. */
  overflow: boolean;
  /** True when the text had to go below half size: it fits, but too small to read comfortably. */
  tooSmall: boolean;
}

export function fitSlide(slide: HTMLElement, min = 0.25): FitResult {
  const hidden = getComputedStyle(slide).display === "none";
  const prev = { display: slide.style.display, visibility: slide.style.visibility };
  if (hidden) {
    slide.style.display = "block";
    slide.style.visibility = "hidden";
  }
  const q = (sel: string) => Array.prototype.slice.call(slide.querySelectorAll(sel)) as HTMLElement[];
  const boxes = q(".sc-body, .sc-content, .sc-col, .sc-card, .sc-kpi, .sc-cards, .sc-kpis, .sc-quote, .sc-fig, .sc-cols, .sc-diagram, table.sc-table");
  const spills = (el: HTMLElement) => el.scrollHeight > el.clientHeight + 2 || el.scrollWidth > el.clientWidth + 2;
  // The body is a fixed-height column: its own overflow catches a heading too tall to leave room.
  const body = slide.querySelector(".sc-body") as HTMLElement | null;
  // Centred content (title slides) overflows at the top as well as the bottom, which scroll
  // sizes do not see, so every block in the body must also sit inside its padding.
  const outside = () => {
    if (!body) return false;
    const cs = getComputedStyle(body);
    const top = parseFloat(cs.paddingTop) || 0;
    const bottom = body.clientHeight - (parseFloat(cs.paddingBottom) || 0);
    return (Array.prototype.slice.call(body.children) as HTMLElement[]).some((c) => c.offsetParent === body && (c.offsetTop < top - 2 || c.offsetTop + c.offsetHeight > bottom + 2));
  };
  const over = () => boxes.some(spills) || outside();
  const set = (k: number) => slide.style.setProperty("--k", String(Math.round(k * 100) / 100));

  let k = 1;
  set(k);
  while (over() && k > min + 1e-9) {
    k = Math.max(min, k - 0.04);
    set(k);
  }
  // The coarse steps can overshoot: creep back up while it still fits.
  if (k < 1 && !over()) {
    let up = k;
    while (up + 0.01 < 1) {
      set(up + 0.01);
      if (over()) break;
      up += 0.01;
    }
    k = up;
    set(k);
  }
  const overflow = over();

  // Source lines sit under the body; shrink them until they clear it.
  const cite = slide.querySelector(".sc-cite") as HTMLElement | null;
  if (cite && body && getComputedStyle(cite).display !== "none") {
    const clear = () => cite.offsetTop >= body.offsetTop + body.offsetHeight - 2 && cite.offsetTop + cite.offsetHeight <= slide.clientHeight;
    let kc = 1;
    slide.style.setProperty("--kc", "1");
    while (!clear() && kc > 0.6) {
      kc = Math.max(0.6, kc - 0.05);
      slide.style.setProperty("--kc", String(Math.round(kc * 100) / 100));
    }
  }

  if (hidden) {
    slide.style.display = prev.display;
    slide.style.visibility = prev.visibility;
  }
  slide.setAttribute("data-fit", overflow ? "over" : k < 0.5 ? "small" : k < 1 ? "shrunk" : "ok");
  return { scale: k, overflow, tooSmall: k < 0.5 };
}

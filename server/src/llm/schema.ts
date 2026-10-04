// JSON Schema for OpenAI strict structured output. Strict mode wants every
// property listed as required and additionalProperties:false, so optional
// fields are nullable rather than absent. normaliseSlide() drops the nulls.

const str = { type: "string" };
const nstr = { type: ["string", "null"] };
const strArr = { type: "array", items: str };
const labelDetail = { type: "object", additionalProperties: false, properties: { label: str, detail: nstr }, required: ["label", "detail"] };
const valueLabel = { type: "object", additionalProperties: false, properties: { value: str, label: str }, required: ["value", "label"] };

export const SLIDE_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    layout: { type: "string", enum: ["title", "section", "bullets", "two-column", "chart", "table", "diagram", "image", "quote", "kpi", "cards", "facts", "gallery", "map", "closing"] },
    kicker: nstr,
    title: str,
    subtitle: nstr,
    body: nstr,
    bullets: strArr,
    leftHeading: nstr,
    rightHeading: nstr,
    bulletsRight: strArr,
    chart: {
      type: ["object", "null"],
      additionalProperties: false,
      properties: {
        kind: { type: "string", enum: ["bar", "column", "line", "area", "pie", "doughnut"] },
        categories: strArr,
        series: { type: "array", items: { type: "object", additionalProperties: false, properties: { name: str, values: { type: "array", items: { type: "number" } } }, required: ["name", "values"] } },
        unit: nstr,
        source: nstr,
        highlight: nstr,
      },
      required: ["kind", "categories", "series", "unit", "source", "highlight"],
    },
    table: {
      type: ["object", "null"],
      additionalProperties: false,
      properties: { header: strArr, rows: { type: "array", items: strArr }, source: nstr },
      required: ["header", "rows", "source"],
    },
    diagram: {
      type: ["object", "null"],
      additionalProperties: false,
      properties: {
        kind: { type: "string", enum: ["flow", "timeline", "matrix", "hub", "funnel", "equation"] },
        steps: { type: "array", items: labelDetail },
        events: { type: "array", items: { type: "object", additionalProperties: false, properties: { when: str, label: str }, required: ["when", "label"] } },
        rows: strArr,
        cols: strArr,
        cells: { type: "array", items: strArr },
        center: nstr,
        nodes: { type: "array", items: labelDetail },
        pills: strArr,
        stages: { type: "array", items: valueLabel },
        terms: { type: "array", items: valueLabel },
        result: { ...valueLabel, type: ["object", "null"] },
      },
      required: ["kind", "steps", "events", "rows", "cols", "cells", "center", "nodes", "pills", "stages", "terms", "result"],
    },
    kpi: { type: "array", items: { type: "object", additionalProperties: false, properties: { label: str, value: str, note: nstr }, required: ["label", "value", "note"] } },
    cards: { type: "array", items: { type: "object", additionalProperties: false, properties: { heading: str, detail: nstr, tag: nstr }, required: ["heading", "detail", "tag"] } },
    image: {
      type: ["object", "null"],
      additionalProperties: false,
      properties: { prompt: nstr, caption: nstr, sourceName: nstr },
      required: ["prompt", "caption", "sourceName"],
    },
    quote: { type: ["object", "null"], additionalProperties: false, properties: { text: str, by: nstr }, required: ["text", "by"] },
    facts: { type: "array", items: { type: "object", additionalProperties: false, properties: { label: str, value: str, highlight: { type: "boolean" } }, required: ["label", "value", "highlight"] } },
    gallery: { type: "array", items: { type: "object", additionalProperties: false, properties: { prompt: nstr, caption: nstr, sourceName: nstr }, required: ["prompt", "caption", "sourceName"] } },
    map: {
      type: ["object", "null"],
      additionalProperties: false,
      properties: {
        region: { type: "string", enum: ["asean", "asia", "world"] },
        areas: { type: "array", items: { type: "object", additionalProperties: false, properties: { code: str, status: str, note: nstr }, required: ["code", "status", "note"] } },
        legend: nstr,
        source: nstr,
      },
      required: ["region", "areas", "legend", "source"],
    },
    kpiStyle: { type: ["string", "null"], enum: ["tiles", "rings", null] },
    badge: nstr,
    callout: nstr,
    aside: { type: "array", items: { type: "object", additionalProperties: false, properties: { heading: str, items: strArr }, required: ["heading", "items"] } },
    notes: nstr,
    citations: strArr,
  },
  required: ["layout", "kicker", "title", "subtitle", "body", "bullets", "leftHeading", "rightHeading", "bulletsRight", "chart", "table", "diagram", "kpi", "cards", "image", "quote", "facts", "gallery", "map", "kpiStyle", "badge", "callout", "aside", "notes", "citations"],
};

export const DECK_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    title: str,
    subtitle: nstr,
    slides: { type: "array", items: SLIDE_SCHEMA },
  },
  required: ["title", "subtitle", "slides"],
};

const bool = { type: "boolean" };

export const PLAN_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    title: nstr,
    angle: str,
    audience: str,
    slides: { type: "integer" },
    features: {
      type: "object",
      additionalProperties: false,
      properties: { charts: bool, tables: bool, diagrams: bool, kpis: bool, sections: bool, summary: bool, qa: bool },
      required: ["charts", "tables", "diagrams", "kpis", "sections", "summary", "qa"],
    },
    reason: str,
    // The storyline: the deck's arc in one sentence, then one entry per slide in order.
    arc: str,
    storyline: {
      type: "array",
      items: { type: "object", additionalProperties: false, properties: { title: str, point: str, layout: str }, required: ["title", "point", "layout"] },
    },
  },
  required: ["title", "angle", "audience", "slides", "features", "reason", "arc", "storyline"],
};

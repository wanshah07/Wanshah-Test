// JSON Schema for OpenAI strict structured output. Strict mode wants every
// property listed as required and additionalProperties:false, so optional
// fields are nullable rather than absent. normaliseSlide() drops the nulls.

const str = { type: "string" };
const nstr = { type: ["string", "null"] };
const strArr = { type: "array", items: str };

export const SLIDE_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    layout: { type: "string", enum: ["title", "section", "bullets", "two-column", "chart", "table", "diagram", "image", "quote", "kpi", "closing"] },
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
      },
      required: ["kind", "categories", "series", "unit", "source"],
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
        kind: { type: "string", enum: ["flow", "timeline", "matrix"] },
        steps: { type: "array", items: { type: "object", additionalProperties: false, properties: { label: str, detail: nstr }, required: ["label", "detail"] } },
        events: { type: "array", items: { type: "object", additionalProperties: false, properties: { when: str, label: str }, required: ["when", "label"] } },
        rows: strArr,
        cols: strArr,
        cells: { type: "array", items: strArr },
      },
      required: ["kind", "steps", "events", "rows", "cols", "cells"],
    },
    kpi: { type: "array", items: { type: "object", additionalProperties: false, properties: { label: str, value: str, note: nstr }, required: ["label", "value", "note"] } },
    image: {
      type: ["object", "null"],
      additionalProperties: false,
      properties: { prompt: nstr, caption: nstr, sourceName: nstr },
      required: ["prompt", "caption", "sourceName"],
    },
    quote: { type: ["object", "null"], additionalProperties: false, properties: { text: str, by: nstr }, required: ["text", "by"] },
    notes: nstr,
    citations: strArr,
  },
  required: ["layout", "title", "subtitle", "body", "bullets", "leftHeading", "rightHeading", "bulletsRight", "chart", "table", "diagram", "kpi", "image", "quote", "notes", "citations"],
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

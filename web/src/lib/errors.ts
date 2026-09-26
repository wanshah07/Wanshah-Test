// Turns a writer failure into what went wrong and what to do, in plain words.

export interface Explained {
  what: string;
  todo: string;
  settings: boolean;
  /** The user may choose to go on anyway: pictures the writer cannot read. */
  anyway?: boolean;
}

export function explainFailure(raw: string): Explained {
  const m = raw || "Unknown error";
  if (/cannot read pictures|pictures_unreadable/i.test(m)) return { what: m, todo: "Paste the text or table from those pictures as a text source, upload the original PDF or Word file, or pick a writer model that reads pictures (Settings, Test shows which). Or write anyway: the pictures then appear only as slide pictures.", settings: true, anyway: true };
  if (/no (openai )?key|no_key/i.test(m)) return { what: "There is no writer key.", todo: "Add a key in Settings (OpenAI or Mireld), press Test, then try again.", settings: true };
  if (/did not answer|timed? ?out|timeout|silent/i.test(m)) return { what: "The writer endpoint did not answer in time.", todo: "Try again. If it keeps happening, check the endpoint with Test in Settings, or switch provider.", settings: true };
  if (/\b401\b|invalid.*key|key not valid|API_KEY_INVALID|incorrect api key|unauthori[sz]ed|missing api key/i.test(m)) return { what: "The writer refused the key.", todo: "Check the key in Settings and press Test. A key saved for one provider does not work on another.", settings: true };
  if (/limit: 0\b/i.test(m)) return { what: "This model is not included in the provider's free tier.", todo: "In Settings, press Test and pick a writer model from the list (on Google Gemini, a plain Flash model, not one with image, tts or live in its name), save, and try again. Or turn on billing with the provider.", settings: true };
  if (/\b429\b|rate limit|quota|insufficient|credit/i.test(m)) return { what: "The provider says the account is over its limit or out of credit.", todo: "Wait a minute and try again, or top up the account with the provider.", settings: false };
  if (/model.*(not found|does not exist)|unknown model|model name|\b404\b/i.test(m)) return { what: "The writer model name is not offered by this endpoint.", todo: "In Settings, press Test and click one of the models it lists.", settings: true };
  if (/cut off by the token limit|length/i.test(m)) return { what: "The answer was too long for the model.", todo: "Ask for fewer slides, or remove some sources, then try again.", settings: false };
  if (/not JSON|refused every request shape|unsupported/i.test(m)) return { what: "The model did not answer in the format Slidecraft needs.", todo: "Try again, or pick a stronger writer model in Settings.", settings: true };
  if (/already_running|already running/i.test(m)) return { what: "This deck is already being written.", todo: "Wait for it to finish; the page updates by itself.", settings: false };
  if (/could not reach|fetch failed|ENOTFOUND|ECONNREFUSED|network/i.test(m)) return { what: "The writer endpoint could not be reached from where Slidecraft runs.", todo: "Try again. If it keeps failing, test the endpoint in Settings or switch provider.", settings: true };
  return { what: m, todo: "Try again. If the same thing happens, send this message to support.", settings: false };
}

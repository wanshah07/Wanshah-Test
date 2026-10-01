/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_SUPABASE_URL?: string;
  readonly VITE_SUPABASE_ANON_KEY?: string;
  readonly VITE_BASE?: string;
  /** The models people may pick on the team link: "id=Label, id2". From the AI_MODELS repository variable. */
  readonly VITE_AI_MODELS?: string;
  /** The default writer model, from the OPENAI_MODEL repository variable. */
  readonly VITE_AI_DEFAULT?: string;
}

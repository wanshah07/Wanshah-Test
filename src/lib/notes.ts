import raw from '@/data/notes.json';

/* Nota regulatori yang sudah diterbitkan: tarikh, domain, sudut, instrumen
 * yang dipetik, dan pautan ke post sebenar. TIADA caption di sini, sengaja.
 *
 * Fail ini disunting tangan (atau oleh Studio) apabila satu post keluar.
 * Ia menggantikan bundle Hermes yang dibuang pada 5 September 2026. */
export type Note = {
  date: string;
  domain: string;
  angle: string;
  citation: string;
  links: { channel: string; url: string }[];
};

export const notes = raw as Note[];

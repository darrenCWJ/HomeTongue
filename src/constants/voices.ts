export interface Voice {
  id: string;
  name: string;
  gender: "female" | "male";
  accent: string;
  desc: string;
}

export const VOICES: Voice[] = [
  // Female
  { id: "n4xdXKggn5lFcXFYE4TA", name: "Chloe Chan", gender: "female", accent: "Hong Kong", desc: "Cantonese mother tongue, friendly" },
  { id: "xDISamJf8LV5rG5A2te1", name: "Aki",        gender: "female", accent: "Hong Kong", desc: "Deep, mature, sassy" },
  { id: "YxbjaPemDJV2xlfvkiIG", name: "Yun",        gender: "female", accent: "Mandarin",  desc: "Elegant, sweet, gentle" },
  // Male
  { id: "OjkyUe8dIihIFvOisuvM", name: "Tung Wong",          gender: "male", accent: "Hong Kong", desc: "Young, conversational, humorous" },
  { id: "R5E9sH7cGUEbuu7YE7K7", name: "Lucky Chan",         gender: "male", accent: "Hong Kong", desc: "Professional, warm, reassuring" },
  { id: "cHDwXsKG0qHMNLIjOusN", name: "Lucky Chan (Intense)", gender: "male", accent: "Hong Kong", desc: "Expressive, dramatic narrator" },
];

export const DEFAULT_VOICE_ID = VOICES[0].id;

import type { VoiceKey } from "../hooks/useGoogleTTS";

export interface Voice {
  id: VoiceKey;
  name: string;
  gender: "female" | "male";
  style: string;
  desc: string;
}

export const VOICES: Voice[] = [
  // Female
  { id: "zephyr",  name: "Zephyr",  gender: "female", style: "Bright",    desc: "Bright, clear, natural" },
  { id: "aoede",   name: "Aoede",   gender: "female", style: "Breezy",    desc: "Light, breezy, warm" },
  { id: "kore",    name: "Kore",    gender: "female", style: "Firm",      desc: "Confident, professional" },
  { id: "sulafat", name: "Sulafat", gender: "female", style: "Warm",      desc: "Warm, expressive, soothing" },
  { id: "leda",    name: "Leda",    gender: "female", style: "Youthful",  desc: "Youthful, energetic" },
  // Male
  { id: "puck",    name: "Puck",    gender: "male",   style: "Upbeat",    desc: "Lively, fun, upbeat" },
  { id: "charon",  name: "Charon",  gender: "male",   style: "Informative", desc: "Clear, calm, informative" },
  { id: "fenrir",  name: "Fenrir",  gender: "male",   style: "Excitable", desc: "Energetic, expressive" },
  { id: "orus",    name: "Orus",    gender: "male",   style: "Firm",      desc: "Firm, dependable, professional" },
  { id: "achird",  name: "Achird",  gender: "male",   style: "Friendly",  desc: "Friendly, approachable" },
];

export const DEFAULT_VOICE_ID: VoiceKey = "zephyr";

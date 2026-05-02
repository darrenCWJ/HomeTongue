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
  { id: "zephyr",       name: "Jamie", gender: "female", style: "Bright",   desc: "Bright, clear, natural" },
  { id: "aoede",        name: "Sarah", gender: "female", style: "Breezy",   desc: "Light, breezy, warm" },
  { id: "vindemiatrix", name: "Lucy",  gender: "female", style: "Gentle",   desc: "Mature, refined, composed" },
  // Male
  { id: "puck",   name: "Tom",   gender: "male", style: "Upbeat",      desc: "Lively, fun, upbeat" },
  { id: "charon", name: "John",  gender: "male", style: "Informative", desc: "Clear, calm, informative" },
  { id: "fenrir", name: "Harry", gender: "male", style: "Excitable",   desc: "Mature, bold, expressive" },
];

export const DEFAULT_VOICE_ID: VoiceKey = "zephyr";

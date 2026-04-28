import { useRef } from "react";
import { DEFAULT_VOICE_ID } from "../constants/voices";

const API_KEY = import.meta.env.VITE_ELEVEN_LABS_API as string;
const BASE_URL = "https://api.elevenlabs.io/v1";
const TTS_MODEL = "eleven_multilingual_v2";

export function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

function dataUrlToBlob(dataUrl: string): Blob {
  const [header, base64] = dataUrl.split(",");
  const mime = header.match(/:(.*?);/)?.[1] ?? "audio/mpeg";
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return new Blob([bytes], { type: mime });
}

export function playDataUrl(dataUrl: string): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    const objectUrl = URL.createObjectURL(dataUrlToBlob(dataUrl));
    const audio = new Audio(objectUrl);
    const cleanup = () => URL.revokeObjectURL(objectUrl);
    audio.onended = () => { cleanup(); resolve(); };
    audio.onerror = () => { cleanup(); reject(new Error("Audio playback failed")); };
    audio.play().catch((err) => { cleanup(); reject(err); });
  });
}

export async function speakTextAndCapture(
  text: string,
  voiceId = DEFAULT_VOICE_ID
): Promise<{ audioDataUrl: string; play: () => Promise<void> }> {
  const response = await fetch(`${BASE_URL}/text-to-speech/${voiceId}`, {
    method: "POST",
    headers: {
      "xi-api-key": API_KEY,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      text,
      model_id: TTS_MODEL,
      voice_settings: { stability: 0.5, similarity_boost: 0.75 },
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`TTS failed (${response.status}): ${error}`);
  }

  const audioBlob = await response.blob();
  const audioDataUrl = await blobToDataUrl(audioBlob);
  const audioUrl = URL.createObjectURL(audioBlob);

  const play = () =>
    new Promise<void>((resolve, reject) => {
      const audio = new Audio(audioUrl);
      audio.onended = () => { URL.revokeObjectURL(audioUrl); resolve(); };
      audio.onerror = () => { URL.revokeObjectURL(audioUrl); reject(new Error("Audio playback failed")); };
      audio.play().catch(reject);
    });

  return { audioDataUrl, play };
}

export async function transcribeAudio(audioBlob: Blob): Promise<string> {
  const formData = new FormData();
  formData.append("file", audioBlob, "recording.webm");
  formData.append("model_id", "scribe_v1");

  const response = await fetch(`${BASE_URL}/speech-to-text`, {
    method: "POST",
    headers: { "xi-api-key": API_KEY },
    body: formData,
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`STT failed (${response.status}): ${error}`);
  }

  const data = await response.json();
  return (data.text as string).trim();
}

export async function speakText(
  text: string,
  voiceId = DEFAULT_VOICE_ID
): Promise<void> {
  const response = await fetch(`${BASE_URL}/text-to-speech/${voiceId}`, {
    method: "POST",
    headers: {
      "xi-api-key": API_KEY,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      text,
      model_id: TTS_MODEL,
      voice_settings: { stability: 0.5, similarity_boost: 0.75 },
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`TTS failed (${response.status}): ${error}`);
  }

  const audioBlob = await response.blob();
  const audioUrl = URL.createObjectURL(audioBlob);
  const audio = new Audio(audioUrl);

  await new Promise<void>((resolve, reject) => {
    audio.onended = () => {
      URL.revokeObjectURL(audioUrl);
      resolve();
    };
    audio.onerror = () => {
      URL.revokeObjectURL(audioUrl);
      reject(new Error("Audio playback failed"));
    };
    audio.play().catch(reject);
  });
}

export function useAudioRecorder() {
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);

  const startRecording = async (): Promise<void> => {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    const mediaRecorder = new MediaRecorder(stream);
    mediaRecorderRef.current = mediaRecorder;
    chunksRef.current = [];

    mediaRecorder.ondataavailable = (event) => {
      if (event.data.size > 0) {
        chunksRef.current.push(event.data);
      }
    };

    mediaRecorder.start();
  };

  const stopRecording = (): Promise<Blob> => {
    return new Promise((resolve, reject) => {
      const mediaRecorder = mediaRecorderRef.current;
      if (!mediaRecorder) {
        reject(new Error("No active recording"));
        return;
      }

      mediaRecorder.onstop = () => {
        const mimeType = mediaRecorder.mimeType || "audio/webm";
        const audioBlob = new Blob(chunksRef.current, { type: mimeType });
        mediaRecorder.stream.getTracks().forEach((track) => track.stop());
        resolve(audioBlob);
      };

      mediaRecorder.stop();
    });
  };

  return { startRecording, stopRecording };
}

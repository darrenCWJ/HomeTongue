import { useRef } from "react";

const API_KEY = import.meta.env.VITE_ELEVEN_LABS_API as string;
const BASE_URL = "https://api.elevenlabs.io/v1";

// Multilingual v2 model handles Cantonese well
const TTS_MODEL = "eleven_multilingual_v2";
// Rachel voice — clear, neutral, works well for both English and Cantonese
const DEFAULT_VOICE_ID = "21m00Tcm4TlvDq8ikWAM";

export function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

export function playDataUrl(dataUrl: string): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    const audio = new Audio(dataUrl);
    audio.onended = resolve;
    audio.onerror = () => reject(new Error("Audio playback failed"));
    audio.play().catch(reject);
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

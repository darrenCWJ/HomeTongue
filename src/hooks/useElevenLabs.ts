import { useRef } from "react";
import { DEFAULT_VOICE_ID } from "../constants/voices";

const API_KEY = import.meta.env.VITE_ELEVEN_LABS_API as string;
const BASE_URL = "https://api.elevenlabs.io/v1";

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

export async function cloneVoice(blob: Blob, name: string): Promise<string> {
  const formData = new FormData();
  formData.append("name", name);
  formData.append("files", blob, "voice-sample.webm");
  formData.append("description", "User recorded voice clone");

  const response = await fetch(`${BASE_URL}/voices/add`, {
    method: "POST",
    headers: { "xi-api-key": API_KEY },
    body: formData,
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Voice cloning failed (${response.status}): ${error}`);
  }

  const data = await response.json();
  return data.voice_id as string;
}

export async function deleteClonedVoice(voiceId: string): Promise<void> {
  await fetch(`${BASE_URL}/voices/${voiceId}`, {
    method: "DELETE",
    headers: { "xi-api-key": API_KEY },
  });
}

export function useAudioRecorder() {
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);

  const startRecording = async (): Promise<void> => {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    const preferredTypes = ["audio/webm", "audio/mp4", "audio/ogg", "audio/wav"];
    const mimeType = preferredTypes.find((t) => MediaRecorder.isTypeSupported(t));
    const mediaRecorder = mimeType
      ? new MediaRecorder(stream, { mimeType })
      : new MediaRecorder(stream);
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

export async function blobToWav(blob: Blob): Promise<Blob> {
  const arrayBuffer = await blob.arrayBuffer();
  const audioCtx = new AudioContext();
  const decoded = await audioCtx.decodeAudioData(arrayBuffer);
  const numChannels = 1;
  const sampleRate = decoded.sampleRate;
  const samples = decoded.getChannelData(0);
  const buffer = new ArrayBuffer(44 + samples.length * 2);
  const view = new DataView(buffer);
  const writeStr = (offset: number, s: string) => { for (let i = 0; i < s.length; i++) view.setUint8(offset + i, s.charCodeAt(i)); };
  writeStr(0, "RIFF");
  view.setUint32(4, 36 + samples.length * 2, true);
  writeStr(8, "WAVE");
  writeStr(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, numChannels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * numChannels * 2, true);
  view.setUint16(32, numChannels * 2, true);
  view.setUint16(34, 16, true);
  writeStr(36, "data");
  view.setUint32(40, samples.length * 2, true);
  for (let i = 0; i < samples.length; i++) {
    const s = Math.max(-1, Math.min(1, samples[i]));
    view.setInt16(44 + i * 2, s < 0 ? s * 0x8000 : s * 0x7FFF, true);
  }
  await audioCtx.close();
  return new Blob([buffer], { type: "audio/wav" });
}

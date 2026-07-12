import { useEffect, useRef } from "react";

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
    audio.onended = () => {
      cleanup();
      resolve();
    };
    audio.onerror = () => {
      cleanup();
      reject(new Error("Audio playback failed"));
    };
    audio.play().catch((err) => {
      cleanup();
      reject(err);
    });
  });
}

export function useAudioRecorder() {
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);

  // Release the microphone if the component unmounts mid-recording
  useEffect(() => {
    return () => {
      const recorder = mediaRecorderRef.current;
      if (!recorder) return;
      try {
        if (recorder.state !== "inactive") recorder.stop();
      } catch {
        // recorder already stopped
      }
      recorder.stream.getTracks().forEach((track) => track.stop());
      mediaRecorderRef.current = null;
    };
  }, []);

  const startRecording = async (): Promise<void> => {
    // Guard against re-entrant calls (e.g. a rapid double-tap firing both
    // touch and mouse events): stop and fully release any recorder that is
    // still active so its mic stream is never orphaned (mic light stuck on).
    const existing = mediaRecorderRef.current;
    if (existing && existing.state !== "inactive") {
      try {
        existing.stop();
      } catch {
        // recorder already stopped
      }
      existing.stream.getTracks().forEach((track) => track.stop());
      mediaRecorderRef.current = null;
    }

    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    const preferredTypes = ["audio/webm", "audio/mp4", "audio/ogg", "audio/wav"];
    const mimeType = preferredTypes.find((t) => MediaRecorder.isTypeSupported(t));
    const mediaRecorder = mimeType ? new MediaRecorder(stream, { mimeType }) : new MediaRecorder(stream);
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
      if (mediaRecorder.state === "inactive") {
        mediaRecorder.stream.getTracks().forEach((track) => track.stop());
        reject(new Error("Recording already stopped"));
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

// Speech-to-text models operate at 16 kHz internally, so resampling here
// loses no accuracy while cutting upload size ~3x (fits Vercel's 4.5MB
// request-body limit for much longer recordings).
const WAV_SAMPLE_RATE = 16_000;

export async function blobToWav(blob: Blob): Promise<Blob> {
  const arrayBuffer = await blob.arrayBuffer();
  // Browsers cap concurrent AudioContexts (~4-6); always close, even when
  // decodeAudioData rejects, or repeated failures exhaust the pool and
  // `new AudioContext()` starts throwing.
  const audioCtx = new AudioContext();
  let decoded: AudioBuffer;
  try {
    decoded = await audioCtx.decodeAudioData(arrayBuffer);
  } finally {
    await audioCtx.close().catch(() => {});
  }

  // Resample to 16 kHz mono (OfflineAudioContext downmixes channels)
  const offline = new OfflineAudioContext(1, Math.ceil(decoded.duration * WAV_SAMPLE_RATE), WAV_SAMPLE_RATE);
  const source = offline.createBufferSource();
  source.buffer = decoded;
  source.connect(offline.destination);
  source.start();
  const rendered = await offline.startRendering();

  const numChannels = 1;
  const sampleRate = WAV_SAMPLE_RATE;
  const samples = rendered.getChannelData(0);
  const buffer = new ArrayBuffer(44 + samples.length * 2);
  const view = new DataView(buffer);
  const writeStr = (offset: number, s: string) => {
    for (let i = 0; i < s.length; i++) view.setUint8(offset + i, s.charCodeAt(i));
  };
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
    view.setInt16(44 + i * 2, s < 0 ? s * 0x8000 : s * 0x7fff, true);
  }
  return new Blob([buffer], { type: "audio/wav" });
}

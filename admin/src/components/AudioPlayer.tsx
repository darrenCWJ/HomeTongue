import { useState } from "react";
import { createRecordingUrl } from "../lib/reviewApi";

interface AudioPlayerProps {
  /** Storage object path in the private "recordings" bucket. */
  path: string;
}

type LoadState = "idle" | "loading" | "ready" | "error";

/**
 * Lazy audio player: recordings live in a private bucket, so the signed URL
 * (valid 5 minutes) is only created when the reviewer asks to listen.
 */
export function AudioPlayer({ path }: AudioPlayerProps) {
  const [state, setState] = useState<LoadState>("idle");
  const [url, setUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    setState("loading");
    setError(null);
    try {
      const signedUrl = await createRecordingUrl(path);
      setUrl(signedUrl);
      setState("ready");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load audio");
      setState("error");
    }
  }

  if (state === "ready" && url) {
    // eslint-disable-next-line jsx-a11y/media-has-caption -- the recording IS the artifact under review (reviewers listen to verify the transcript beside it); no caption track can exist for it
    return <audio className="audio-player" controls src={url} preload="metadata" />;
  }

  return (
    <div className="audio-loader">
      <button className="btn btn-secondary btn-small" onClick={() => void load()} disabled={state === "loading"}>
        {state === "loading" ? "Loading audio…" : state === "error" ? "Retry audio" : "Load audio"}
      </button>
      {state === "error" && error && <span className="inline-error">{error}</span>}
    </div>
  );
}

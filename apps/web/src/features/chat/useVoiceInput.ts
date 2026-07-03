import { useEffect, useRef, useState } from "react";

// Minimal typings for the Web Speech API (not in the standard DOM lib, prefixed on Chrome).
interface SpeechResultLike {
  0: { transcript: string };
}
interface SpeechEventLike {
  results: ArrayLike<SpeechResultLike>;
}
interface SpeechErrorLike {
  error?: string;
}
interface RecognitionLike {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  onresult: ((e: SpeechEventLike) => void) | null;
  onend: (() => void) | null;
  onerror: ((e: SpeechErrorLike) => void) | null;
  start(): void;
  stop(): void;
}
type RecognitionCtor = new () => RecognitionLike;

function getRecognition(): RecognitionCtor | null {
  const w = window as unknown as {
    SpeechRecognition?: RecognitionCtor;
    webkitSpeechRecognition?: RecognitionCtor;
  };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

/** Human-readable message for a SpeechRecognition error code. */
function messageForError(code: string | undefined): string {
  switch (code) {
    case "not-allowed":
    case "service-not-allowed":
      return "Microphone access is blocked. Allow it in your browser settings, then try again.";
    case "audio-capture":
      return "No microphone was found.";
    case "no-speech":
      return "Didn't catch anything. Try again.";
    case "network":
      return "Voice input isn't available in this window. Open Entrives in a Chrome or Edge tab.";
    default:
      return "Voice input stopped. Try again.";
  }
}

/**
 * Voice-to-text for the composer. `toggle(currentText)` starts/stops dictation,
 * appending the live transcript onto whatever was already typed. Verifies mic
 * access up front so a blocked mic surfaces a clear message instead of a silent
 * no-op (some embedded browsers, e.g. the desktop app preview, deny the mic).
 */
export function useVoiceInput(onTranscript: (text: string) => void) {
  const [listening, setListening] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const supported = typeof window !== "undefined" && !!getRecognition();
  const recRef = useRef<RecognitionLike | null>(null);
  const baseRef = useRef("");

  useEffect(() => () => recRef.current?.stop(), []);

  async function toggle(currentText: string) {
    const Ctor = getRecognition();
    if (!Ctor) return;
    if (listening) {
      recRef.current?.stop();
      return;
    }
    setError(null);

    // Prompt for / verify mic permission first so a denied mic gives a clear
    // message rather than a recognition that silently never starts.
    try {
      const md = navigator.mediaDevices;
      if (md?.getUserMedia) {
        const stream = await md.getUserMedia({ audio: true });
        stream.getTracks().forEach((t) => t.stop());
      }
    } catch {
      setError("Microphone access is blocked. Allow it in your browser settings, then try again.");
      return;
    }

    const rec = new Ctor();
    rec.lang = "en-US";
    rec.continuous = true;
    rec.interimResults = true;
    baseRef.current = currentText.trim();
    rec.onresult = (e) => {
      let txt = "";
      for (let i = 0; i < e.results.length; i++) txt += e.results[i][0].transcript;
      onTranscript((baseRef.current ? baseRef.current + " " : "") + txt);
    };
    rec.onend = () => setListening(false);
    rec.onerror = (e) => {
      setError(messageForError(e?.error));
      setListening(false);
    };
    recRef.current = rec;
    try {
      rec.start();
      setListening(true);
    } catch {
      setError("Couldn't start voice input. Try again.");
    }
  }

  return { listening, supported, error, toggle };
}

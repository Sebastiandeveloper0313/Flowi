import { useEffect, useRef, useState } from "react";

// Minimal typings for the Web Speech API (not in the standard DOM lib, prefixed on Chrome).
interface SpeechResultLike {
  0: { transcript: string };
}
interface SpeechEventLike {
  results: ArrayLike<SpeechResultLike>;
}
interface RecognitionLike {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  onresult: ((e: SpeechEventLike) => void) | null;
  onend: (() => void) | null;
  onerror: (() => void) | null;
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

/**
 * Voice-to-text for the composer. `toggle(currentText)` starts/stops dictation,
 * appending the live transcript onto whatever was already typed.
 */
export function useVoiceInput(onTranscript: (text: string) => void) {
  const [listening, setListening] = useState(false);
  const supported = typeof window !== "undefined" && !!getRecognition();
  const recRef = useRef<RecognitionLike | null>(null);
  const baseRef = useRef("");

  useEffect(() => () => recRef.current?.stop(), []);

  function toggle(currentText: string) {
    const Ctor = getRecognition();
    if (!Ctor) return;
    if (listening) {
      recRef.current?.stop();
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
    rec.onerror = () => setListening(false);
    recRef.current = rec;
    rec.start();
    setListening(true);
  }

  return { listening, supported, toggle };
}

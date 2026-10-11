"use client";

import { useEffect, useRef, useState } from "react";
import { DriverVoiceUpdates, type DriverVoiceSnapshot } from "@/lib/driverVoice";

export default function DriverVoiceToggle({
  active, className = "", ...snapshot
}: DriverVoiceSnapshot & { active: boolean; className?: string }) {
  const [supported, setSupported] = useState<boolean | null>(null);
  const [enabled, setEnabled] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const updatesRef = useRef(new DriverVoiceUpdates());
  const utteranceRef = useRef<SpeechSynthesisUtterance | null>(null);
  const enabledRef = useRef(false);

  const stop = () => {
    const utterance = utteranceRef.current;
    if (utterance) {
      utterance.onerror = null;
      utteranceRef.current = null;
      window.speechSynthesis.cancel();
    }
  };
  const speak = (text: string) => {
    stop();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = "en";
    utterance.rate = 1;
    utterance.onerror = (event) => {
      if (utteranceRef.current !== utterance || !enabledRef.current) return;
      console.error("Driver voice update failed:", event.error);
      setError("Voice update failed. Tap Sound on to retry.");
      enabledRef.current = false;
      setEnabled(false);
      stop();
    };
    utterance.onend = () => {
      if (utteranceRef.current === utterance) utteranceRef.current = null;
    };
    utteranceRef.current = utterance;
    try {
      window.speechSynthesis.speak(utterance);
    } catch (cause) {
      console.error("Could not start driver voice:", cause);
      setError("Voice update failed. Tap Sound on to retry.");
      enabledRef.current = false;
      setEnabled(false);
      stop();
    }
  };

  useEffect(() => {
    setSupported("speechSynthesis" in window && "SpeechSynthesisUtterance" in window);
    return () => {
      enabledRef.current = false;
      const utterance = utteranceRef.current;
      if (utterance) {
        utterance.onerror = null;
        window.speechSynthesis.cancel();
      }
    };
  }, []);

  useEffect(() => {
    if (!active) {
      enabledRef.current = false;
      setEnabled(false);
      stop();
      return;
    }
    if (!enabledRef.current) return;
    const message = updatesRef.current.update(snapshot, Date.now());
    if (message) speak(message);
    // Only new trip data triggers announcements, never speech callbacks or UI state.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, snapshot.tripId, snapshot.status, snapshot.remainingKm, snapshot.trafficMessage, snapshot.gpsError]);

  return (
    <div className={`max-w-56 ${className}`}>
      <button type="button" aria-pressed={enabled}
        aria-label={enabled ? "Mute driver voice updates" : "Enable driver voice updates"}
        disabled={!supported || !active}
        onClick={() => {
          const next = !enabledRef.current;
          enabledRef.current = next;
          setEnabled(next);
          setError(null);
          if (next) speak(updatesRef.current.reset(snapshot, Date.now()));
          else stop();
        }}
        className={`flex min-h-12 items-center gap-2 whitespace-nowrap rounded-xl border border-outline-variant px-3 text-sm font-medium shadow-md disabled:opacity-50 ${
          enabled ? "bg-primary text-on-primary hover:bg-primary/90" : "bg-surface text-on-surface hover:bg-surface-container"
        }`}>
        <svg aria-hidden="true" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M11 5L6 9H3v6h3l5 4V5z" />
          {enabled ? <path d="M15 8a6 6 0 010 8m3-11a10 10 0 010 14" /> : <path d="M16 9l5 6m0-6l-5 6" />}
        </svg>
        {enabled ? "Sound on" : "Sound off"}
      </button>
      {supported === false && <p role="status" className="mt-1 rounded-lg bg-surface p-2 text-xs">Voice updates are not supported by this browser.</p>}
      {error && <p role="alert" className="mt-1 rounded-lg bg-surface p-2 text-xs text-error">{error}</p>}
    </div>
  );
}

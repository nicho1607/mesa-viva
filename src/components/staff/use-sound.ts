"use client";

// Preferencia "Sonido" (apagado por defecto, recordada en localStorage) y un pitido corto con
// WebAudio (sin archivos). Cada acceso a localStorage va en try/catch.

import { useCallback, useSyncExternalStore } from "react";

const KEY = "mv:staff:sound";
const listeners = new Set<() => void>();
let cached: boolean | null = null;

function read(): boolean {
  if (cached !== null) return cached;
  try {
    cached = window.localStorage.getItem(KEY) === "on";
  } catch {
    cached = false;
  }
  return cached;
}

function subscribe(fn: () => void) {
  listeners.add(fn);
  const onStorage = (e: StorageEvent) => {
    if (e.key !== KEY) return;
    cached = e.newValue === "on";
    fn();
  };
  window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(fn);
    window.removeEventListener("storage", onStorage);
  };
}

let ctx: AudioContext | null = null;
function audio(): AudioContext | null {
  try {
    ctx ??= new AudioContext();
    if (ctx.state === "suspended") void ctx.resume().catch(() => {});
    return ctx;
  } catch {
    return null;
  }
}

/** Dos tonos cortos (≈ 0,3 s). `urgent` = llamada: más agudo. */
export function beep(urgent = false) {
  const ac = audio();
  if (!ac) return;
  const tones = urgent ? [880, 1175] : [660, 880];
  tones.forEach((freq, i) => {
    const start = ac.currentTime + i * 0.16;
    const osc = ac.createOscillator();
    const gain = ac.createGain();
    osc.type = "sine";
    osc.frequency.value = freq;
    gain.gain.setValueAtTime(0.0001, start);
    gain.gain.exponentialRampToValueAtTime(0.25, start + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.14);
    osc.connect(gain).connect(ac.destination);
    osc.start(start);
    osc.stop(start + 0.15);
  });
}

export function useSoundPreference(): [boolean, (on: boolean) => void] {
  const on = useSyncExternalStore(subscribe, read, () => false);
  const set = useCallback((value: boolean) => {
    cached = value;
    try {
      window.localStorage.setItem(KEY, value ? "on" : "off");
    } catch {
      // sin almacenamiento: la preferencia dura lo que la pestaña
    }
    // Activar desde un clic desbloquea el AudioContext (política de autoplay)
    if (value) audio();
    listeners.forEach((fn) => fn());
  }, []);
  return [on, set];
}

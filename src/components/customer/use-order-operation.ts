"use client";

// Identificador persistente del envío incierto. Permite reintentar tras perder la respuesta
// sin reservar porciones ni crear una ronda por segunda vez.

import { useSyncExternalStore } from "react";

type PendingOperation = { id: string; fingerprint: string };
type Store = {
  get: () => PendingOperation | null;
  subscribe: (fn: () => void) => () => void;
  getOrCreate: (fingerprint: string) => string;
  clear: () => void;
};

const stores = new Map<string, Store>();
const EMPTY = null;

function parse(raw: string | null): PendingOperation | null {
  if (!raw) return null;
  try {
    const value = JSON.parse(raw) as Partial<PendingOperation>;
    if (typeof value.id !== "string" || typeof value.fingerprint !== "string") return null;
    if (!/^[0-9a-f-]{36}$/i.test(value.id) || value.fingerprint.length > 20_000) return null;
    return { id: value.id, fingerprint: value.fingerprint };
  } catch {
    return null;
  }
}

function getStore(token: string): Store {
  if (typeof window === "undefined") {
    return { get: () => EMPTY, subscribe: () => () => {}, getOrCreate: () => crypto.randomUUID(), clear: () => {} };
  }
  let store = stores.get(token);
  if (store) return store;
  const key = `mv:submission:${token}`;
  let state: PendingOperation | null | undefined;
  const listeners = new Set<() => void>();
  const emit = () => listeners.forEach((fn) => fn());
  const write = () => {
    try {
      if (state) window.localStorage.setItem(key, JSON.stringify(state));
      else window.localStorage.removeItem(key);
    } catch {
      // Sin almacenamiento, la idempotencia se conserva mientras viva esta pestaña.
    }
  };
  const onStorage = (event: StorageEvent) => {
    if (event.key !== key) return;
    state = parse(event.newValue);
    emit();
  };
  store = {
    get: () => {
      if (state === undefined) {
        try {
          state = parse(window.localStorage.getItem(key));
        } catch {
          state = null;
        }
      }
      return state;
    },
    subscribe: (fn) => {
      listeners.add(fn);
      if (listeners.size === 1) window.addEventListener("storage", onStorage);
      return () => {
        listeners.delete(fn);
        if (listeners.size === 0) window.removeEventListener("storage", onStorage);
      };
    },
    getOrCreate: (fingerprint) => {
      const current = store!.get();
      if (current?.fingerprint === fingerprint) return current.id;
      state = { id: crypto.randomUUID(), fingerprint };
      write();
      emit();
      return state.id;
    },
    clear: () => {
      state = null;
      write();
      emit();
    },
  };
  stores.set(token, store);
  return store;
}

export function useOrderOperation(token: string) {
  const store = getStore(token);
  const pending = useSyncExternalStore(store.subscribe, store.get, () => EMPTY);
  return { pending, getOrCreate: store.getOrCreate, clear: store.clear };
}

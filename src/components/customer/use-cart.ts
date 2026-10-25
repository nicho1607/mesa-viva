"use client";

// Carrito persistido por mesa en localStorage. Toda lectura/escritura va en try/catch:
// en modo privado o con almacenamiento bloqueado el carrito simplemente vive en memoria.

import { useCallback, useSyncExternalStore } from "react";
import { cartStorageKey, parseCart, serializeCart, type Cart } from "@/lib/cart";

type Store = {
  get: () => Cart;
  set: (updater: (c: Cart) => Cart) => void;
  subscribe: (fn: () => void) => () => void;
};

const EMPTY: Cart = [];
const stores = new Map<string, Store>();

function readStorage(key: string): Cart {
  try {
    return parseCart(window.localStorage.getItem(key));
  } catch {
    return [];
  }
}

function writeStorage(key: string, cart: Cart) {
  try {
    if (cart.length === 0) window.localStorage.removeItem(key);
    else window.localStorage.setItem(key, serializeCart(cart));
  } catch {
    // sin almacenamiento: el carrito sigue en memoria
  }
}

const SERVER_STORE: Store = { get: () => EMPTY, set: () => {}, subscribe: () => () => {} };

function getStore(token: string): Store {
  if (typeof window === "undefined") return SERVER_STORE;
  let store = stores.get(token);
  if (store) return store;
  const key = cartStorageKey(token);
  let state: Cart | null = null;
  const listeners = new Set<() => void>();
  const emit = () => listeners.forEach((fn) => fn());
  const onStorage = (e: StorageEvent) => {
    // otra pestaña de la misma mesa cambió el carrito
    if (e.key !== key) return;
    state = parseCart(e.newValue);
    emit();
  };
  store = {
    get: () => (state ??= readStorage(key)),
    set: (updater) => {
      state = updater(store!.get());
      writeStorage(key, state);
      emit();
    },
    subscribe: (fn) => {
      listeners.add(fn);
      if (listeners.size === 1) window.addEventListener("storage", onStorage);
      return () => {
        listeners.delete(fn);
        if (listeners.size === 0) window.removeEventListener("storage", onStorage);
      };
    },
  };
  stores.set(token, store);
  return store;
}

/** `[cart, update]`: en el servidor (y en la hidratación) el carrito está vacío. */
export function useCart(token: string): [Cart, (updater: (c: Cart) => Cart) => void] {
  const store = getStore(token);
  const cart = useSyncExternalStore(store.subscribe, store.get, () => EMPTY);
  const update = useCallback((updater: (c: Cart) => Cart) => store.set(updater), [store]);
  return [cart, update];
}

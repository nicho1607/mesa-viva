"use client";

import { useEffect, useRef, useState } from "react";
import { useQueryClient, type QueryKey } from "@tanstack/react-query";
import { REALTIME_EVENTS, type RealtimeEvent, type RealtimePayload } from "./events";

const CLOSED_RETRY_MS = 5_000;

/**
 * Abre el stream SSE `url` (p.ej. `/api/events?table=${token}` o `/api/events`) y,
 * ante cualquier evento —y al (re)conectar—, invalida las `queryKeys` indicadas.
 * Devuelve `{ connected }` para mostrar "Reconectando…" cuando sea false.
 */
export function useRealtimeInvalidate(
  url: string,
  queryKeys: QueryKey[],
  onEvent?: (event: RealtimeEvent, payload: RealtimePayload) => void,
): { connected: boolean } {
  const qc = useQueryClient();
  const [connected, setConnected] = useState(false);
  // Refs para no reabrir el stream cuando cambian las referencias en cada render.
  const keysRef = useRef(queryKeys);
  const onEventRef = useRef(onEvent);
  useEffect(() => {
    keysRef.current = queryKeys;
    onEventRef.current = onEvent;
  });

  useEffect(() => {
    let es: EventSource | null = null;
    let retry: ReturnType<typeof setTimeout> | null = null;
    let disposed = false;

    const refresh = () => {
      for (const queryKey of keysRef.current) void qc.invalidateQueries({ queryKey });
    };

    const open = () => {
      if (disposed) return;
      es = new EventSource(url);
      es.onopen = () => setConnected(true);
      // `ready` llega al abrir y cuando el servidor perdió señales: refrescar todo.
      es.addEventListener("ready", () => {
        setConnected(true);
        refresh();
      });
      for (const ev of REALTIME_EVENTS) {
        es.addEventListener(ev, (m) => {
          refresh();
          let payload: RealtimePayload = {};
          try {
            payload = JSON.parse((m as MessageEvent<string>).data) as RealtimePayload;
          } catch {
            // payload inválido: igual refrescamos
          }
          onEventRef.current?.(ev, payload);
        });
      }
      es.onerror = () => {
        setConnected(false);
        // EventSource reintenta solo salvo si quedó CLOSED (p.ej. 401/500): reintentar a mano.
        if (es && es.readyState === EventSource.CLOSED && !disposed) {
          es.close();
          retry = setTimeout(open, CLOSED_RETRY_MS);
        }
      };
    };

    open();
    return () => {
      disposed = true;
      if (retry) clearTimeout(retry);
      es?.close();
    };
  }, [url, qc]);

  return { connected };
}

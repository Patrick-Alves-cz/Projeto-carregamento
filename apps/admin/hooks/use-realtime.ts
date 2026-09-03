"use client";

import { useEffect, useRef, useState } from "react";
import { io, type Socket } from "socket.io-client";
import { getRealtimeUrl, getWsToken } from "@/lib/api-client";

export function useRealtime(onEvent?: (event: { type: string; payload: unknown }) => void) {
  const [connected, setConnected] = useState(false);
  const socketRef = useRef<Socket | null>(null);
  const handlerRef = useRef(onEvent);
  handlerRef.current = onEvent;

  useEffect(() => {
    let active = true;

    void (async () => {
      try {
        const token = await getWsToken();
        if (!active) return;

        const socket = io(getRealtimeUrl(), {
          auth: { token },
          transports: ["websocket"],
        });
        socketRef.current = socket;

        socket.on("connect", () => setConnected(true));
        socket.on("disconnect", () => setConnected(false));

        const forward = (type: string) => (payload: unknown) => {
          handlerRef.current?.({ type, payload });
        };

        socket.on("session.started", forward("session.started"));
        socket.on("session.updated", forward("session.updated"));
        socket.on("meter.value", forward("meter.value"));
        socket.on("session.completed", forward("session.completed"));
        socket.on("session.failed", forward("session.failed"));
        socket.on("charger.status.changed", forward("charger.status.changed"));
        socket.on("connector.status.changed", forward("connector.status.changed"));
        socket.on("session.event", forward("session.event"));
        socket.on("operations.event", forward("operations.event"));
      } catch {
        setConnected(false);
      }
    })();

    return () => {
      active = false;
      socketRef.current?.disconnect();
      socketRef.current = null;
    };
  }, []);

  return { connected, socket: socketRef.current };
}

import { useEffect, useRef } from "react";
import { io, type Socket } from "socket.io-client";
import { getRealtimeUrl, getStoredTokens } from "./api-client";

export function useRealtime(onEvent: (event: { type: string; payload: unknown }) => void) {
  const socketRef = useRef<Socket | null>(null);
  const handlerRef = useRef(onEvent);
  handlerRef.current = onEvent;

  useEffect(() => {
    let active = true;

    void (async () => {
      const tokens = await getStoredTokens();
      if (!tokens?.accessToken || !active) return;

      const socket = io(getRealtimeUrl(), {
        auth: { token: tokens.accessToken },
        transports: ["websocket"],
      });
      socketRef.current = socket;

      const forward = (type: string) => (payload: unknown) => {
        handlerRef.current({ type, payload });
      };

      socket.on("session.updated", forward("session.updated"));
      socket.on("meter.value", forward("meter.value"));
      socket.on("session.completed", forward("session.completed"));
      socket.on("session.failed", forward("session.failed"));
      socket.on("session.event", forward("session.event"));
      socket.on("connector.status.changed", forward("connector.status.changed"));
      socket.on("charger.status.changed", forward("charger.status.changed"));
      socket.on("discovery.updated", forward("discovery.updated"));
    })();

    return () => {
      active = false;
      socketRef.current?.disconnect();
      socketRef.current = null;
    };
  }, []);
}

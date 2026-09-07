import { useEffect, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { RealtimeChannel } from "@supabase/supabase-js";
import type { PunchType } from "@/lib/words";

export const playerId =
  typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : Math.random().toString(36).slice(2);

export type PunchMsg = {
  id: string;
  type: PunchType;
  damage: number;
  streak: number;
  word: string;
  wpm: number;
};

export type RosterEntry = { id: string; name: string; joinedAt: number };

type Handlers = {
  onPunch: (p: PunchMsg) => void;
  onRoster: (roster: RosterEntry[]) => void;
  onStart: (startAt: number) => void;
  onRematch: () => void;
  onStatus: (status: string) => void;
};

export function useBoxingChannel(roomCode: string | null, name: string, handlers: Handlers) {
  const channelRef = useRef<RealtimeChannel | null>(null);
  const h = useRef(handlers);
  h.current = handlers;
  const joinedAt = useRef(Date.now());

  useEffect(() => {
    if (!roomCode) return;
    const channel = supabase.channel(`boxing:${roomCode}`, {
      config: { broadcast: { self: false }, presence: { key: playerId } },
    });

    const known = new Map<string, RosterEntry>();
    known.set(playerId, { id: playerId, name, joinedAt: joinedAt.current });

    const emit = () => {
      const roster = [...known.values()].sort(
        (a, b) => a.joinedAt - b.joinedAt || a.id.localeCompare(b.id),
      );
      h.current.onRoster(roster);
    };

    const remember = (e: RosterEntry) => {
      const prev = known.get(e.id);
      if (prev && prev.name === e.name && prev.joinedAt === e.joinedAt) return;
      known.set(e.id, e);
      emit();
    };

    channel
      .on("broadcast", { event: "punch" }, ({ payload }) => {
        const p = payload as PunchMsg;
        if (p.id !== playerId) h.current.onPunch(p);
      })
      .on("broadcast", { event: "start" }, ({ payload }) => {
        h.current.onStart((payload as { startAt: number }).startAt);
      })
      .on("broadcast", { event: "rematch" }, () => h.current.onRematch())
      .on("broadcast", { event: "hello" }, ({ payload }) => {
        const e = payload as RosterEntry & { reply?: boolean };
        if (e.id === playerId) return;
        remember({ id: e.id, name: e.name, joinedAt: e.joinedAt });
        if (!e.reply) {
          channel.send({
            type: "broadcast",
            event: "hello",
            payload: { id: playerId, name, joinedAt: joinedAt.current, reply: true },
          });
        }
      })
      .on("presence", { event: "sync" }, () => {
        const state = channel.presenceState<{ name: string; joinedAt: number }>();
        const ids = new Set(Object.keys(state));
        for (const [id, metas] of Object.entries(state)) {
          known.set(id, {
            id,
            name: metas[0]?.name ?? "Boxer",
            joinedAt: metas[0]?.joinedAt ?? 0,
          });
        }
        // drop anyone presence says has left (keep self)
        for (const id of [...known.keys()]) {
          if (id !== playerId && !ids.has(id)) known.delete(id);
        }
        emit();
      })
      .subscribe((status) => {
        h.current.onStatus(status);
        if (status === "SUBSCRIBED") {
          channel.track({ name, joinedAt: joinedAt.current });
          channel.send({
            type: "broadcast",
            event: "hello",
            payload: { id: playerId, name, joinedAt: joinedAt.current, reply: false },
          });
        }
      });

    channelRef.current = channel;
    return () => {
      channelRef.current = null;
      supabase.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roomCode]);

  return channelRef;
}

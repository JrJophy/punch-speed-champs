import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Arena } from "./Arena";
import { fightBus, resetFightBus, triggerPunch } from "@/lib/fightBus";
import { punchForStreak, wordSequence, type PunchType } from "@/lib/words";
import { playerId, useBoxingChannel, type PunchMsg, type RosterEntry } from "@/hooks/useBoxingChannel";

type Phase = "lobby" | "waiting" | "countdown" | "fight" | "over";
const MAX_HP = 100;

const PUNCH_LABEL: Record<PunchType, string> = {
  jab: "JAB",
  hook: "HOOK",
  uppercut: "UPPERCUT",
  haymaker: "HAYMAKER",
};

function randomRoom() {
  return Math.random().toString(36).slice(2, 6).toUpperCase();
}

export function BoxingGame() {
  const [name, setName] = useState("");
  const [roomInput, setRoomInput] = useState("");
  const [room, setRoom] = useState<string | null>(null);
  const [status, setStatus] = useState("");
  const [roster, setRoster] = useState<RosterEntry[]>([]);
  const [phase, setPhase] = useState<Phase>("lobby");
  const [startAt, setStartAt] = useState<number | null>(null);
  const [countdown, setCountdown] = useState(3);

  const [myHp, setMyHp] = useState(MAX_HP);
  const [oppHp, setOppHp] = useState(MAX_HP);
  const [streak, setStreak] = useState(0);
  const [index, setIndex] = useState(0);
  const [typed, setTyped] = useState("");
  const [mistake, setMistake] = useState(false);
  const [chars, setChars] = useState(0);
  const [wpm, setWpm] = useState(0);
  const [oppWpm, setOppWpm] = useState(0);
  const [feed, setFeed] = useState<{ id: number; text: string; mine: boolean }[]>([]);
  const feedId = useRef(0);
  const fightStart = useRef(0);
  const inputRef = useRef<HTMLInputElement>(null);

  const words = useMemo(() => (room ? wordSequence(room) : []), [room]);
  const myIdx = roster.findIndex((r) => r.id === playerId);
  const mySlot = myIdx <= 0 ? "red" : "blue";
  const oppSlot = mySlot === "red" ? "blue" : "red";
  const opponent = roster.find((r) => r.id !== playerId);
  const isHost = myIdx === 0;

  const pushFeed = useCallback((text: string, mine: boolean) => {
    feedId.current += 1;
    const id = feedId.current;
    setFeed((f) => [{ id, text, mine }, ...f].slice(0, 5));
  }, []);

  const resetMatch = useCallback(() => {
    resetFightBus();
    setMyHp(MAX_HP);
    setOppHp(MAX_HP);
    setStreak(0);
    setIndex(0);
    setTyped("");
    setChars(0);
    setWpm(0);
    setOppWpm(0);
    setFeed([]);
    setMistake(false);
  }, []);

  const channelRef = useBoxingChannel(room, name || "Boxer", {
    onStatus: setStatus,
    onRoster: setRoster,
    onPunch: (p: PunchMsg) => {
      triggerPunch(oppSlot, p.type, p.damage);
      setOppWpm(p.wpm);
      setMyHp((hp) => Math.max(0, hp - p.damage));
      pushFeed(`${PUNCH_LABEL[p.type]} — ${p.word}`, false);
    },
    onStart: (at) => {
      setPhase((cur) => {
        if (cur === "fight" || cur === "over") return cur;
        resetMatch();
        setStartAt(at);
        return "countdown";
      });
    },
    onRematch: () => {
      resetMatch();
      setPhase("waiting");
    },
  });

  // the bout starts as soon as both fighters are in the room
  useEffect(() => {
    if (phase === "waiting" && roster.length >= 2) {
      const at = Date.now() + 4000;
      if (isHost) {
        channelRef.current?.send({ type: "broadcast", event: "start", payload: { startAt: at } });
      }
      resetMatch();
      setStartAt(at);
      setPhase("countdown");
    }
  }, [phase, roster.length, isHost, channelRef, resetMatch]);

  // countdown ticker
  useEffect(() => {
    if (phase !== "countdown" || startAt == null) return;
    const tick = () => {
      const left = Math.ceil((startAt - Date.now()) / 1000);
      setCountdown(Math.max(0, left));
      if (left <= 0) {
        fightStart.current = Date.now();
        setPhase("fight");
        inputRef.current?.focus();
      }
    };
    tick();
    const t = setInterval(tick, 100);
    return () => clearInterval(t);
  }, [phase, startAt]);

  // live wpm
  useEffect(() => {
    if (phase !== "fight") return;
    const t = setInterval(() => {
      const mins = (Date.now() - fightStart.current) / 60000;
      setWpm(mins > 0 ? Math.round(chars / 5 / mins) : 0);
    }, 500);
    return () => clearInterval(t);
  }, [phase, chars]);

  // knockout
  useEffect(() => {
    if (phase === "fight" && (myHp <= 0 || oppHp <= 0)) {
      setPhase("over");
      fightBus.shake = 1;
    }
  }, [myHp, oppHp, phase]);

  const currentWord = words[index] ?? "";

  const land = useCallback(
    (word: string) => {
      const nextStreak = streak + 1;
      const { type, damage } = punchForStreak(nextStreak);
      setStreak(nextStreak);
      setIndex((i) => i + 1);
      setTyped("");
      setChars((c) => c + word.length + 1);
      setOppHp((hp) => Math.max(0, hp - damage));
      triggerPunch(mySlot, type, damage);
      pushFeed(`${PUNCH_LABEL[type]} — ${word}`, true);
      const mins = (Date.now() - fightStart.current) / 60000;
      const liveWpm = mins > 0 ? Math.round((chars + word.length + 1) / 5 / mins) : 0;
      channelRef.current?.send({
        type: "broadcast",
        event: "punch",
        payload: { id: playerId, type, damage, streak: nextStreak, word, wpm: liveWpm } satisfies PunchMsg,
      });
    },
    [streak, mySlot, chars, channelRef, pushFeed],
  );

  const onChange = (value: string) => {
    if (phase !== "fight") return;
    if (value.endsWith(" ")) {
      const attempt = value.trim();
      if (attempt === currentWord) land(currentWord);
      else {
        setTyped("");
        setStreak(0);
        setMistake(true);
      }
      return;
    }
    setTyped(value);
    const ok = currentWord.startsWith(value);
    setMistake(!ok);
    if (!ok) setStreak(0);
    if (value === currentWord) land(currentWord);
  };

  const join = (code: string) => {
    const clean = code.trim().toUpperCase();
    if (!clean) return;
    setRoom(clean);
    setPhase("waiting");
  };

  const rematch = () => {
    channelRef.current?.send({ type: "broadcast", event: "rematch", payload: {} });
    resetMatch();
    setPhase("waiting");
  };

  const won = phase === "over" && oppHp <= 0;

  if (phase === "lobby") {
    return (
      <main className="relative flex min-h-screen items-center justify-center overflow-hidden bg-background px-4">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_50%_0%,rgba(224,64,47,0.22),transparent_60%)]" />
        <div className="relative w-full max-w-md">
          <p className="font-display text-sm tracking-[0.5em] text-accent">ROUND ONE</p>
          <h1 className="font-display text-6xl leading-[0.9] text-foreground sm:text-7xl">
            KEYSTROKE
            <span className="block text-primary">KNOCKOUT</span>
          </h1>
          <p className="mt-4 text-sm text-muted-foreground">
            Two fighters, one room code. Every word you type clean lands a punch — string them
            together and the jabs turn into hooks, uppercuts and haymakers.
          </p>

          <div className="mt-8 space-y-3">
            <input
              className="fight-input"
              placeholder="Your fighter name"
              value={name}
              maxLength={14}
              onChange={(e) => setName(e.target.value)}
            />
            <input
              className="fight-input uppercase"
              placeholder="Room code"
              value={roomInput}
              maxLength={6}
              onChange={(e) => setRoomInput(e.target.value.toUpperCase())}
              onKeyDown={(e) => e.key === "Enter" && join(roomInput)}
            />
            <div className="flex gap-3">
              <button className="fight-btn flex-1" onClick={() => join(roomInput)}>
                Join fight
              </button>
              <button
                className="fight-btn-ghost flex-1"
                onClick={() => {
                  const code = randomRoom();
                  setRoomInput(code);
                  join(code);
                }}
              >
                Create room
              </button>
            </div>
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="relative h-screen w-screen overflow-hidden bg-background">
      <Arena redDown={mySlot === "red" ? myHp <= 0 : oppHp <= 0} blueDown={mySlot === "blue" ? myHp <= 0 : oppHp <= 0} />

      {/* top HUD */}
      <div className="pointer-events-none absolute inset-x-0 top-0 flex items-start justify-between gap-4 p-4 sm:p-6">
        <FighterBar
          label={name || "You"}
          hp={myHp}
          side="left"
          accent="var(--color-primary)"
          meta={`${wpm} WPM`}
        />
        <div className="text-center">
          <p className="font-display text-xs tracking-[0.4em] text-muted-foreground">ROOM</p>
          <p className="font-display text-3xl tracking-widest text-accent">{room}</p>
          {streak > 1 && phase === "fight" && (
            <p className="font-display text-lg text-primary">COMBO x{streak}</p>
          )}
        </div>
        <FighterBar
          label={opponent?.name ?? "Waiting…"}
          hp={oppHp}
          side="right"
          accent="var(--color-ring-blue)"
          meta={`${oppWpm} WPM`}
        />
      </div>

      {/* punch feed */}
      <div className="pointer-events-none absolute left-4 top-32 space-y-1 sm:left-6">
        {feed.map((f) => (
          <p
            key={f.id}
            className={`font-display text-lg tracking-wider ${f.mine ? "text-primary" : "text-muted-foreground"}`}
          >
            {f.mine ? "▸" : "◂"} {f.text}
          </p>
        ))}
      </div>

      {/* bottom typing bar */}
      <div className="absolute inset-x-0 bottom-0 p-4 sm:p-6">
        <div className="mx-auto max-w-2xl rounded-xl border border-border/60 bg-card/85 p-5 backdrop-blur">
          {phase === "waiting" && (
            <div className="text-center">
              <p className="font-display text-2xl text-foreground">Waiting for a challenger</p>
              <p className="mt-1 text-sm text-muted-foreground">
                Share room code <span className="text-accent">{room}</span> — connection: {status.toLowerCase()}
              </p>
            </div>
          )}

          {phase === "countdown" && (
            <p className="text-center font-display text-5xl text-primary">
              {countdown > 0 ? countdown : "BOX!"}
            </p>
          )}

          {phase === "fight" && (
            <>
              <div className="flex flex-wrap items-baseline justify-center gap-3">
                <span className="font-display text-5xl tracking-wide">
                  {currentWord.split("").map((c, i) => (
                    <span
                      key={i}
                      className={
                        i < typed.length
                          ? typed[i] === c
                            ? "text-primary"
                            : "text-destructive"
                          : "text-foreground"
                      }
                    >
                      {c}
                    </span>
                  ))}
                </span>
                <span className="font-display text-xl text-muted-foreground">
                  {words[index + 1]} {words[index + 2]}
                </span>
              </div>
              <input
                ref={inputRef}
                autoFocus
                autoComplete="off"
                autoCorrect="off"
                spellCheck={false}
                value={typed}
                onChange={(e) => onChange(e.target.value)}
                className={`fight-input mt-4 text-center ${mistake ? "border-destructive" : ""}`}
                placeholder="type here…"
              />
            </>
          )}

          {phase === "over" && (
            <div className="text-center">
              <p className={`font-display text-5xl ${won ? "text-primary" : "text-muted-foreground"}`}>
                {won ? "KNOCKOUT — YOU WIN" : "YOU'RE DOWN"}
              </p>
              <p className="mt-1 text-sm text-muted-foreground">
                {wpm} WPM · best combo landed at x{streak}
              </p>
              <button className="fight-btn mt-4" onClick={rematch}>
                Rematch
              </button>
            </div>
          )}
        </div>
      </div>
    </main>
  );
}

function FighterBar({
  label,
  hp,
  side,
  accent,
  meta,
}: {
  label: string;
  hp: number;
  side: "left" | "right";
  accent: string;
  meta: string;
}) {
  return (
    <div className={`w-40 sm:w-64 ${side === "right" ? "text-right" : ""}`}>
      <p className="truncate font-display text-xl tracking-wide text-foreground">{label}</p>
      <div className="mt-1 h-3 w-full overflow-hidden rounded-full bg-muted">
        <div
          className={`h-full transition-[width] duration-300 ${side === "right" ? "ml-auto" : ""}`}
          style={{ width: `${Math.max(0, hp)}%`, backgroundColor: accent }}
        />
      </div>
      <p className="mt-1 text-xs tracking-widest text-muted-foreground">{meta}</p>
    </div>
  );
}

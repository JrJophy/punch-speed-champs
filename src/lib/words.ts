const WORDS = [
  "jab", "hook", "cross", "guard", "canvas", "corner", "rope", "bell", "round", "clinch",
  "uppercut", "footwork", "counter", "southpaw", "orthodox", "combo", "knockout", "referee",
  "glove", "mouthpiece", "stamina", "rhythm", "pivot", "slip", "parry", "bob", "weave", "feint",
  "power", "speed", "range", "timing", "pressure", "distance", "angle", "shoulder", "hip",
  "breathe", "reset", "advance", "retreat", "double", "triple", "body", "liver", "chin",
  "temple", "ribs", "sweat", "towel", "sparring", "coach", "arena", "crowd", "champion",
  "belt", "title", "contender", "warrior", "grit", "heart", "focus", "silence", "storm",
  "thunder", "iron", "steel", "shadow", "flurry", "engine", "granite", "hammer", "anvil",
  "lightning", "instinct", "reflex", "balance", "posture", "stance", "tempo", "surge",
  "explode", "commit", "recover", "endure", "fight", "brawl", "spar", "swing", "block",
  "dodge", "strike", "impact", "rally", "final", "victory", "defeat", "legend", "ring",
];

function mulberry32(seed: number) {
  return function () {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function seedFromRoom(room: string): number {
  let h = 2166136261;
  for (let i = 0; i < room.length; i++) {
    h ^= room.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/** Deterministic word sequence — both players in a room get the same list. */
export function wordSequence(room: string, count = 200): string[] {
  const rand = mulberry32(seedFromRoom(room));
  const out: string[] = [];
  for (let i = 0; i < count; i++) {
    out.push(WORDS[Math.floor(rand() * WORDS.length)]!);
  }
  return out;
}

export type PunchType = "jab" | "hook" | "uppercut" | "haymaker";

export function punchForStreak(streak: number): { type: PunchType; damage: number } {
  if (streak >= 10) return { type: "haymaker", damage: 14 };
  if (streak >= 6) return { type: "uppercut", damage: 9 };
  if (streak >= 3) return { type: "hook", damage: 6 };
  return { type: "jab", damage: 3.5 };
}

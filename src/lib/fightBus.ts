import type { PunchType } from "./words";

export type FighterSlot = "red" | "blue";
export type Hand = "lead" | "rear";
export type Move =
  | "jab"
  | "cross"
  | "hookL"
  | "hookR"
  | "uppercut"
  | "body"
  | "haymaker";
export type Zone = "head" | "body" | "guard";
export type DefenseKind = "none" | "block" | "slipL" | "slipR" | "duck" | "weave" | "stepBack";

export type PunchState = {
  active: boolean;
  move: Move;
  type: PunchType;
  hand: Hand;
  power: number;
  /** 0 -> 1 progress through the whole anticipation/extension/recovery arc */
  p: number;
  dur: number;
  impactDone: boolean;
};

export type DefenseState = { kind: DefenseKind; p: number; dur: number };

export type FighterState = {
  punch: PunchState;
  defense: DefenseState;
  /** 0..1 hit reaction */
  hurt: number;
  hurtZone: Zone;
  stagger: number;
  combo: number;
  thrown: number;
  down: boolean;
};

export type Impact = {
  id: number;
  x: number;
  y: number;
  z: number;
  power: number;
  zone: Zone;
  life: number;
};

type Bus = {
  red: FighterState;
  blue: FighterState;
  shake: number;
  zoom: number;
  impacts: Impact[];
};

function freshFighter(): FighterState {
  return {
    punch: { active: false, move: "jab", type: "jab", hand: "lead", power: 0, p: 1, dur: 0.4, impactDone: true },
    defense: { kind: "none", p: 1, dur: 0.5 },
    hurt: 0,
    hurtZone: "head",
    stagger: 0,
    combo: 0,
    thrown: 0,
    down: false,
  };
}

/** Shared mutable fight state read every frame inside the 3D scene. */
export const fightBus: Bus = {
  red: freshFighter(),
  blue: freshFighter(),
  shake: 0,
  zoom: 0,
  impacts: [],
};

export const other = (slot: FighterSlot): FighterSlot => (slot === "red" ? "blue" : "red");

const DURATION: Record<Move, number> = {
  jab: 0.36,
  cross: 0.44,
  hookL: 0.5,
  hookR: 0.52,
  uppercut: 0.56,
  body: 0.5,
  haymaker: 0.74,
};

const HAND: Record<Move, Hand> = {
  jab: "lead",
  cross: "rear",
  hookL: "lead",
  hookR: "rear",
  uppercut: "rear",
  body: "rear",
  haymaker: "rear",
};

function pickMove(type: PunchType, thrown: number): Move {
  if (type === "haymaker") return "haymaker";
  if (type === "uppercut") return "uppercut";
  if (type === "hook") return thrown % 2 === 0 ? "hookL" : "hookR";
  // jab family — alternate straight punches, mix in the occasional body shot
  if (thrown % 5 === 4) return "body";
  return thrown % 2 === 0 ? "jab" : "cross";
}

export function triggerPunch(slot: FighterSlot, type: PunchType, damage: number) {
  const me = fightBus[slot];
  const foe = fightBus[other(slot)];
  const move = pickMove(type, me.thrown);
  me.thrown += 1;
  me.combo += 1;
  me.punch = {
    active: true,
    move,
    type,
    hand: HAND[move],
    power: Math.min(1, damage / 14),
    p: 0,
    dur: DURATION[move],
    impactDone: false,
  };

  // the defender reads the shot: sometimes rolls with it, sometimes eats it clean
  if (!foe.down && foe.defense.p >= 1) {
    const r = Math.random();
    const kind: DefenseKind =
      r < 0.18 ? "block" : r < 0.3 ? (Math.random() < 0.5 ? "slipL" : "slipR") : r < 0.38 ? "duck" : "none";
    if (kind !== "none") foe.defense = { kind, p: 0, dur: kind === "block" ? 0.45 : 0.55 };
  }
}

export function resetCombo(slot: FighterSlot) {
  fightBus[slot].combo = 0;
}

let impactId = 0;

export function registerImpact(slot: FighterSlot, x: number, y: number, z: number, power: number, zone: Zone) {
  impactId += 1;
  fightBus.impacts.push({ id: impactId, x, y, z, power, zone, life: 1 });
  if (fightBus.impacts.length > 12) fightBus.impacts.shift();

  const foe = fightBus[other(slot)];
  if (zone !== "guard") {
    foe.hurt = Math.min(1, 0.55 + power * 0.6);
    foe.hurtZone = zone;
    foe.stagger = Math.min(1, power);
  } else {
    foe.hurt = Math.max(foe.hurt, 0.25);
    foe.hurtZone = "guard";
  }
  fightBus.shake = Math.min(1, fightBus.shake + (zone === "guard" ? power * 0.25 : 0.25 + power * 0.75));
  if (power > 0.8 && zone !== "guard") fightBus.zoom = 1;
}

export function setDown(slot: FighterSlot, down: boolean) {
  fightBus[slot].down = down;
}

export function resetFightBus() {
  fightBus.red = freshFighter();
  fightBus.blue = freshFighter();
  fightBus.shake = 0;
  fightBus.zoom = 0;
  fightBus.impacts.length = 0;
}

import type { PunchType } from "./words";

export type FighterSlot = "red" | "blue";

type Visual = {
  punch: Record<FighterSlot, { t: number; power: number; type: PunchType }>;
  hurt: Record<FighterSlot, number>;
  shake: number;
};

/** Shared mutable visual state read every frame inside the 3D scene. */
export const fightBus: Visual = {
  punch: {
    red: { t: 0, power: 0, type: "jab" },
    blue: { t: 0, power: 0, type: "jab" },
  },
  hurt: { red: 0, blue: 0 },
  shake: 0,
};

export function triggerPunch(slot: FighterSlot, type: PunchType, damage: number) {
  const power = Math.min(1, damage / 14);
  fightBus.punch[slot] = { t: 1, power, type };
  fightBus.hurt[slot === "red" ? "blue" : "red"] = 1;
  fightBus.shake = Math.min(1, fightBus.shake + power * 0.8);
}

export function resetFightBus() {
  fightBus.punch.red = { t: 0, power: 0, type: "jab" };
  fightBus.punch.blue = { t: 0, power: 0, type: "jab" };
  fightBus.hurt.red = 0;
  fightBus.hurt.blue = 0;
  fightBus.shake = 0;
}

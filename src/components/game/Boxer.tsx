import { useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { dampV3, ease, noise1, solveLimb } from "@/lib/boxerRig";
import { fightBus, other, registerImpact, type FighterSlot, type Move } from "@/lib/fightBus";

type Props = {
  slot: FighterSlot;
  colors: { trunks: string; skin: string; glove: string };
  down?: boolean;
  scale?: number;
};

// ---- proportions (metres, 1.75 m fighter) ----
const HIP_Y = 0.94;
const THIGH = 0.44;
const SHIN = 0.42;
const CHEST_TOP = 0.5; // above hips
const SHOULDER_X = 0.19;
const UPPER_ARM = 0.29;
const FOREARM = 0.27;
const STANCE_LEAD = new THREE.Vector3(-0.21, 0, 0.26);
const STANCE_REAR = new THREE.Vector3(0.21, 0, -0.24);
const GUARD_L = new THREE.Vector3(-0.16, 1.38, 0.24);
const GUARD_R = new THREE.Vector3(0.15, 1.34, 0.2);

const damp = THREE.MathUtils.damp;

type Waypoint = { t: number; p: [number, number, number] };

/** hand paths in root space: anticipation -> extension -> impact -> recovery */
const PATHS: Record<Move, Waypoint[]> = {
  jab: [
    { t: 0.0, p: [-0.16, 1.38, 0.24] },
    { t: 0.16, p: [-0.19, 1.37, 0.15] },
    { t: 0.45, p: [-0.07, 1.4, 0.58] },
    { t: 0.58, p: [-0.07, 1.39, 0.56] },
    { t: 1.0, p: [-0.16, 1.38, 0.24] },
  ],
  cross: [
    { t: 0.0, p: [0.15, 1.34, 0.2] },
    { t: 0.18, p: [0.19, 1.34, 0.08] },
    { t: 0.48, p: [0.0, 1.4, 0.6] },
    { t: 0.6, p: [0.0, 1.39, 0.58] },
    { t: 1.0, p: [0.15, 1.34, 0.2] },
  ],
  hookL: [
    { t: 0.0, p: [-0.16, 1.38, 0.24] },
    { t: 0.2, p: [-0.3, 1.36, 0.14] },
    { t: 0.35, p: [-0.34, 1.42, 0.36] },
    { t: 0.5, p: [-0.02, 1.44, 0.5] },
    { t: 0.62, p: [0.12, 1.42, 0.42] },
    { t: 1.0, p: [-0.16, 1.38, 0.24] },
  ],
  hookR: [
    { t: 0.0, p: [0.15, 1.34, 0.2] },
    { t: 0.22, p: [0.32, 1.34, 0.06] },
    { t: 0.38, p: [0.34, 1.4, 0.32] },
    { t: 0.52, p: [0.04, 1.43, 0.5] },
    { t: 0.64, p: [-0.12, 1.41, 0.42] },
    { t: 1.0, p: [0.15, 1.34, 0.2] },
  ],
  uppercut: [
    { t: 0.0, p: [0.15, 1.34, 0.2] },
    { t: 0.24, p: [0.18, 1.02, 0.14] },
    { t: 0.5, p: [0.06, 1.3, 0.42] },
    { t: 0.6, p: [0.0, 1.55, 0.36] },
    { t: 1.0, p: [0.15, 1.34, 0.2] },
  ],
  body: [
    { t: 0.0, p: [0.15, 1.34, 0.2] },
    { t: 0.2, p: [0.2, 1.2, 0.08] },
    { t: 0.48, p: [0.02, 1.02, 0.55] },
    { t: 0.6, p: [0.02, 1.02, 0.52] },
    { t: 1.0, p: [0.15, 1.34, 0.2] },
  ],
  haymaker: [
    { t: 0.0, p: [0.15, 1.34, 0.2] },
    { t: 0.3, p: [0.38, 1.24, -0.22] },
    { t: 0.42, p: [0.42, 1.34, 0.02] },
    { t: 0.56, p: [0.1, 1.46, 0.5] },
    { t: 0.66, p: [-0.1, 1.42, 0.55] },
    { t: 1.0, p: [0.15, 1.34, 0.2] },
  ],
};

const IMPACT_AT: Record<Move, number> = {
  jab: 0.45,
  cross: 0.48,
  hookL: 0.55,
  hookR: 0.56,
  uppercut: 0.6,
  body: 0.5,
  haymaker: 0.6,
};

function samplePath(path: Waypoint[], p: number, out: THREE.Vector3) {
  for (let i = 0; i < path.length - 1; i++) {
    const a = path[i]!;
    const b = path[i + 1]!;
    if (p <= b.t || i === path.length - 2) {
      const k = THREE.MathUtils.clamp((p - a.t) / Math.max(b.t - a.t, 1e-4), 0, 1);
      const e = ease.inOut(k);
      out.set(
        a.p[0] + (b.p[0] - a.p[0]) * e,
        a.p[1] + (b.p[1] - a.p[1]) * e,
        a.p[2] + (b.p[2] - a.p[2]) * e,
      );
      return out;
    }
  }
  return out;
}

export function Boxer({ slot, colors, down = false, scale = 1 }: Props) {
  const dir = slot === "red" ? 1 : -1;
  const homeX = slot === "red" ? -1.05 : 1.05;
  const seed = slot === "red" ? 1.7 : 5.3;

  const root = useRef<THREE.Group>(null);
  const hips = useRef<THREE.Group>(null);
  const chest = useRef<THREE.Group>(null);
  const neck = useRef<THREE.Group>(null);
  const head = useRef<THREE.Group>(null);
  const shoulder = { lead: useRef<THREE.Group>(null), rear: useRef<THREE.Group>(null) };
  const upperArm = { lead: useRef<THREE.Group>(null), rear: useRef<THREE.Group>(null) };
  const foreArm = { lead: useRef<THREE.Group>(null), rear: useRef<THREE.Group>(null) };
  const glove = { lead: useRef<THREE.Group>(null), rear: useRef<THREE.Group>(null) };
  const hipJoint = { lead: useRef<THREE.Group>(null), rear: useRef<THREE.Group>(null) };
  const thigh = { lead: useRef<THREE.Group>(null), rear: useRef<THREE.Group>(null) };
  const shin = { lead: useRef<THREE.Group>(null), rear: useRef<THREE.Group>(null) };
  const foot = { lead: useRef<THREE.Group>(null), rear: useRef<THREE.Group>(null) };

  const mats = useMemo(() => {
    const skin = new THREE.MeshStandardMaterial({ color: colors.skin, roughness: 0.62, metalness: 0.02 });
    return {
      skin,
      trunks: new THREE.MeshStandardMaterial({ color: colors.trunks, roughness: 0.78 }),
      glove: new THREE.MeshStandardMaterial({ color: colors.glove, roughness: 0.42 }),
      boot: new THREE.MeshStandardMaterial({ color: "#161219", roughness: 0.6 }),
      trim: new THREE.MeshStandardMaterial({ color: "#e8e2d4", roughness: 0.55 }),
      hair: new THREE.MeshStandardMaterial({ color: "#1a1418", roughness: 0.85 }),
    };
  }, [colors.skin, colors.trunks, colors.glove]);

  // working state
  const s = useMemo(
    () => ({
      handTarget: { lead: GUARD_L.clone(), rear: GUARD_R.clone() },
      handGoal: { lead: GUARD_L.clone(), rear: GUARD_R.clone() },
      footPos: { lead: STANCE_LEAD.clone(), rear: STANCE_REAR.clone() },
      footGoal: { lead: STANCE_LEAD.clone(), rear: STANCE_REAR.clone() },
      footLift: { lead: 0, rear: 0 },
      step: { active: false, which: "lead" as "lead" | "rear", t: 0, dur: 0.28 },
      nextStep: 1.2 + Math.random() * 1.4,
      hipsPos: new THREE.Vector3(0, HIP_Y, 0),
      rootX: 0,
      scratch: new THREE.Vector3(),
      scratch2: new THREE.Vector3(),
      world: new THREE.Vector3(),
      pole: new THREE.Vector3(),
      q: new THREE.Quaternion(),
    }),
    [],
  );

  useFrame(({ clock }, rawDelta) => {
    const delta = Math.min(rawDelta, 0.05);
    const t = clock.getElapsedTime();
    const R = root.current;
    const H = hips.current;
    const C = chest.current;
    const N = neck.current;
    const HD = head.current;
    if (!R || !H || !C || !N || !HD) return;

    const me = fightBus[slot];
    const foe = fightBus[other(slot)];
    me.down = down;

    // ---------- timers ----------
    const punch = me.punch;
    if (punch.active) {
      punch.p += delta / punch.dur;
      if (punch.p >= 1) {
        punch.p = 1;
        punch.active = false;
      }
    }
    const def = me.defense;
    if (def.p < 1) {
      def.p = Math.min(1, def.p + delta / def.dur);
      if (def.p >= 1) def.kind = "none";
    }
    me.hurt = Math.max(0, me.hurt - delta * 2.4);
    me.stagger = Math.max(0, me.stagger - delta * 1.6);

    // ---------- knockdown ----------
    if (down) {
      R.rotation.z = damp(R.rotation.z, dir * -1.3, 5, delta);
      R.rotation.y = damp(R.rotation.y, dir * (Math.PI / 2), 6, delta);
      R.position.y = damp(R.position.y, -0.34, 5, delta);
      s.hipsPos.y = damp(s.hipsPos.y, 0.42, 5, delta);
      H.position.set(0, s.hipsPos.y, 0);
      C.rotation.set(damp(C.rotation.x, 0.5, 5, delta), 0, 0);
      HD.rotation.set(damp(HD.rotation.x, 0.4, 5, delta), 0, 0);
      s.handGoal.lead.set(-0.3, 0.5, 0.3);
      s.handGoal.rear.set(0.3, 0.42, 0.1);
      s.footGoal.lead.set(-0.34, 0.06, 0.34);
      s.footGoal.rear.set(0.32, 0.12, -0.1);
    } else {
      R.rotation.z = damp(R.rotation.z, 0, 6, delta);
      R.position.y = damp(R.position.y, 0, 6, delta);
    }

    // ---------- pose scalars ----------
    const punchP = punch.active || punch.p < 1 ? punch.p : 1;
    const isRear = punch.hand === "rear";
    const active = punch.active;
    const swing = active ? Math.sin(Math.PI * THREE.MathUtils.clamp(punchP / 0.75, 0, 1)) : 0;
    const heavy = punch.move === "haymaker" ? 1.3 : punch.move === "uppercut" ? 1.12 : 1;

    // defensive offsets
    let slipX = 0;
    let duck = 0;
    let leanBack = 0;
    let guardTight = 0;
    if (def.p < 1) {
      const w = Math.sin(Math.PI * def.p);
      if (def.kind === "slipL") slipX = -0.13 * w;
      if (def.kind === "slipR") slipX = 0.13 * w;
      if (def.kind === "duck" || def.kind === "weave") duck = 0.16 * w;
      if (def.kind === "stepBack") leanBack = 0.1 * w;
      if (def.kind === "block") guardTight = w;
    }

    // breathing + shifting weight between the legs
    const breath = Math.sin(t * 2.1 + seed) * 0.012;
    const bounce = Math.abs(Math.sin(t * 2.9 + seed)) * 0.022;
    const sway = noise1(t * 0.6, seed) * 0.03;
    const weight = Math.sin(t * 1.45 + seed * 1.3); // -1 lead .. +1 rear

    // ---------- footwork ----------
    if (!down) {
      s.nextStep -= delta;
      const wantStep = (!s.step.active && s.nextStep <= 0) || (!s.step.active && me.stagger > 0.55);
      if (wantStep) {
        const retreat = me.stagger > 0.4 || def.kind === "stepBack" || Math.random() < 0.3;
        const advance = !retreat && active;
        const which: "lead" | "rear" = retreat ? "rear" : Math.random() < 0.6 ? "lead" : "rear";
        const base = which === "lead" ? STANCE_LEAD : STANCE_REAR;
        const dz = retreat ? -0.14 : advance ? 0.12 : (Math.random() - 0.5) * 0.14;
        const dx = (Math.random() - 0.5) * 0.16;
        s.footGoal[which].set(
          THREE.MathUtils.clamp(base.x + dx, base.x - 0.12, base.x + 0.12),
          0,
          THREE.MathUtils.clamp(s.footPos[which].z + dz, base.z - 0.2, base.z + 0.2),
        );
        s.step = { active: true, which, t: 0, dur: retreat ? 0.22 : 0.28 };
        s.nextStep = 0.9 + Math.random() * 1.5;
      }
      if (s.step.active) {
        s.step.t += delta / s.step.dur;
        const k = THREE.MathUtils.clamp(s.step.t, 0, 1);
        s.footLift[s.step.which] = Math.sin(Math.PI * k) * 0.055;
        if (k >= 1) {
          s.step.active = false;
          s.footLift[s.step.which] = 0;
        }
      }
      // a punch drives weight through the rear foot: heel lifts and pivots
      s.footLift.rear = Math.max(s.footLift.rear, active && isRear ? swing * 0.045 : 0);
      s.footLift.lead = Math.max(s.footLift.lead, active && !isRear ? swing * 0.03 : 0);
    }

    for (const side of ["lead", "rear"] as const) {
      const g = s.footGoal[side];
      const p = s.footPos[side];
      p.x = damp(p.x, g.x, 12, delta);
      p.z = damp(p.z, g.z, 12, delta);
      p.y = damp(p.y, g.y + s.footLift[side], 16, delta);
    }

    // hips ride between the feet, plus lunge/weight transfer
    const lungeZ = active ? swing * (0.055 + punch.power * 0.05) * heavy : 0;
    const midX = (s.footPos.lead.x + s.footPos.rear.x) * 0.5;
    const midZ = (s.footPos.lead.z + s.footPos.rear.z) * 0.5;
    const hipTargetX = midX + slipX + weight * 0.025 + (active ? (isRear ? -0.03 : 0.02) * swing : 0);
    const hipTargetZ = midZ + lungeZ + sway * 0.4 - leanBack * 0.6 - me.hurt * 0.06;
    const hipTargetY = HIP_Y + breath - bounce - duck * 0.9 - me.hurt * 0.03;

    s.hipsPos.x = damp(s.hipsPos.x, hipTargetX, 10, delta);
    s.hipsPos.z = damp(s.hipsPos.z, hipTargetZ, 10, delta);
    if (!down) s.hipsPos.y = damp(s.hipsPos.y, hipTargetY, 11, delta);
    H.position.copy(s.hipsPos);

    // orthodox bladed stance; rear-hand punches rotate hips through the shot
    const baseYaw = 0.4;
    const hipYaw = active ? (isRear ? -0.5 * swing * heavy : 0.16 * swing) : 0;
    H.rotation.y = damp(H.rotation.y, baseYaw + hipYaw + noise1(t * 0.5, seed + 2) * 0.05, 12, delta);
    H.rotation.z = damp(H.rotation.z, (weight * 0.03) - slipX * 0.4, 8, delta);

    if (!down) {
      C.rotation.y = damp(C.rotation.y, (active ? (isRear ? -0.32 : 0.14) * swing * heavy : 0) + noise1(t * 0.8, seed) * 0.05, 13, delta);
      C.rotation.x = damp(
        C.rotation.x,
        0.06 + duck * 0.9 + (punch.move === "body" ? swing * 0.24 : 0) - (punch.move === "uppercut" ? swing * 0.14 : 0) - leanBack * 0.9 + me.hurt * (me.hurtZone === "body" ? 0.3 : -0.16),
        11,
        delta,
      );
      C.rotation.z = damp(C.rotation.z, slipX * 0.9 + (active ? (isRear ? -0.08 : 0.08) * swing : 0), 11, delta);

      const hurtHead = me.hurt * (me.hurtZone === "head" ? 1 : 0.25);
      HD.rotation.x = damp(HD.rotation.x, -0.04 - hurtHead * 0.5 + duck * 0.4 + noise1(t * 1.1, seed + 5) * 0.05, 12, delta);
      HD.rotation.y = damp(HD.rotation.y, -0.22 - (active ? (isRear ? -0.12 : 0.1) * swing : 0) + noise1(t * 0.7, seed + 9) * 0.12, 10, delta);
      HD.rotation.z = damp(HD.rotation.z, slipX * 1.4 - hurtHead * 0.35 * dir, 12, delta);
      N.rotation.x = damp(N.rotation.x, -hurtHead * 0.2, 10, delta);
    }

    // ---------- hand targets ----------
    if (!down) {
      const guardBob = Math.sin(t * 2.9 + seed) * 0.012;
      const gL = s.scratch.copy(GUARD_L);
      const gR = s.scratch2.copy(GUARD_R);
      gL.y += guardBob + guardTight * 0.06 - duck * 0.7;
      gR.y += -guardBob + guardTight * 0.06 - duck * 0.7;
      gL.x += guardTight * 0.05 + slipX;
      gR.x += -guardTight * 0.04 + slipX;
      gL.z += guardTight * -0.04 + noise1(t * 1.3, seed + 3) * 0.015;
      gR.z += guardTight * -0.04 + noise1(t * 1.6, seed + 7) * 0.015;
      s.handGoal.lead.copy(gL);
      s.handGoal.rear.copy(gR);

      if (active || punch.p < 1) {
        const hand = punch.hand;
        samplePath(PATHS[punch.move], punchP, s.scratch);
        s.handGoal[hand].copy(s.scratch);
        // the idle hand tucks in tighter while the other one works
        const idle = hand === "lead" ? "rear" : "lead";
        s.handGoal[idle].y += swing * 0.03;
        s.handGoal[idle].z -= swing * 0.03;
      }
      // hurt hands drop then snap back up
      s.handGoal.lead.y -= me.hurt * 0.05;
      s.handGoal.rear.y -= me.hurt * 0.05;
    }

    dampV3(s.handTarget.lead, s.handGoal.lead, active && punch.hand === "lead" ? 34 : 15, delta);
    dampV3(s.handTarget.rear, s.handGoal.rear, active && punch.hand === "rear" ? 34 : 15, delta);

    // ---------- root drift ----------
    const homeOffset = (me.stagger > 0.2 ? -0.1 * me.stagger : 0) + (active ? swing * 0.05 : 0);
    s.rootX = damp(s.rootX, homeOffset, 6, delta);
    R.position.x = homeX + dir * s.rootX;
    if (!down) R.rotation.y = damp(R.rotation.y, dir * (Math.PI / 2), 10, delta);

    R.updateWorldMatrix(true, true);

    // ---------- IK ----------
    for (const side of ["lead", "rear"] as const) {
      const sh = shoulder[side].current;
      const ua = upperArm[side].current;
      const fa = foreArm[side].current;
      if (!sh || !ua || !fa) continue;
      s.world.copy(s.handTarget[side]);
      R.localToWorld(s.world);
      sh.worldToLocal(s.world);
      s.pole.set(side === "lead" ? -0.5 : 0.5, -1, -0.85).normalize();
      solveLimb(ua, fa, s.world, s.pole, UPPER_ARM, FOREARM);
    }

    for (const side of ["lead", "rear"] as const) {
      const hj = hipJoint[side].current;
      const th = thigh[side].current;
      const sn = shin[side].current;
      const ft = foot[side].current;
      if (!hj || !th || !sn || !ft) continue;
      s.world.copy(s.footPos[side]);
      s.world.y += 0.09; // ankle height
      R.localToWorld(s.world);
      hj.worldToLocal(s.world);
      s.pole.set(side === "lead" ? -0.25 : 0.25, -0.15, 1).normalize();
      solveLimb(th, sn, s.world, s.pole, THIGH, SHIN);

      // keep the foot flat on the canvas instead of dangling with the shin
      sn.updateWorldMatrix(true, false);
      s.q.setFromEuler(new THREE.Euler(0, dir * (Math.PI / 2) + (side === "lead" ? 0.5 : 0.25), 0));
      ft.quaternion.copy(sn.getWorldQuaternion(new THREE.Quaternion()).invert().multiply(s.q));
      const lift = s.footPos[side].y;
      ft.rotation.x += lift * 4;
    }

    // ---------- impact detection ----------
    if (active && !punch.impactDone && punchP >= IMPACT_AT[punch.move]) {
      punch.impactDone = true;
      const g = glove[punch.hand].current;
      if (g) {
        g.getWorldPosition(s.world);
        const reach = Math.abs(s.world.x - (slot === "red" ? 1.05 : -1.05));
        const dodging = foe.defense.kind === "slipL" || foe.defense.kind === "slipR" || foe.defense.kind === "duck";
        const blocked = foe.defense.kind === "block";
        const zone = blocked ? "guard" : punch.move === "body" ? "body" : "head";
        if (!foe.down && !dodging && reach < 1.15) {
          registerImpact(slot, s.world.x, s.world.y, s.world.z, punch.power * (punch.move === "haymaker" ? 1 : 0.8), zone);
        }
      }
    }
  });

  const arm = (side: "lead" | "rear") => {
    const sign = side === "lead" ? -1 : 1;
    return (
      <group key={side} ref={shoulder[side]} position={[sign * SHOULDER_X, CHEST_TOP - 0.06, 0]}>
        <mesh material={mats.skin} castShadow>
          <sphereGeometry args={[0.085, 14, 12]} />
        </mesh>
        <group ref={upperArm[side]}>
          <mesh position={[0, -UPPER_ARM / 2, 0]} material={mats.skin} castShadow>
            <capsuleGeometry args={[0.055, UPPER_ARM - 0.08, 6, 12]} />
          </mesh>
          <group ref={foreArm[side]} position={[0, -UPPER_ARM, 0]}>
            <mesh material={mats.skin} castShadow>
              <sphereGeometry args={[0.055, 12, 10]} />
            </mesh>
            <mesh position={[0, -FOREARM / 2 + 0.02, 0]} material={mats.skin} castShadow>
              <capsuleGeometry args={[0.048, FOREARM - 0.12, 6, 12]} />
            </mesh>
            <mesh position={[0, -FOREARM + 0.09, 0]} material={mats.trim}>
              <cylinderGeometry args={[0.055, 0.055, 0.05, 12]} />
            </mesh>
            <group ref={glove[side]} position={[0, -FOREARM - 0.02, 0]}>
              <mesh material={mats.glove} castShadow>
                <sphereGeometry args={[0.082, 16, 14]} />
              </mesh>
              <mesh position={[0, 0.01, 0.045]} material={mats.glove} castShadow>
                <sphereGeometry args={[0.055, 12, 10]} />
              </mesh>
            </group>
          </group>
        </group>
      </group>
    );
  };

  const leg = (side: "lead" | "rear") => {
    const sign = side === "lead" ? -1 : 1;
    return (
      <group key={side} ref={hipJoint[side]} position={[sign * 0.1, -0.02, 0]}>
        <group ref={thigh[side]}>
          <mesh position={[0, -THIGH / 2, 0]} material={mats.trunks} castShadow>
            <capsuleGeometry args={[0.085, THIGH - 0.2, 6, 12]} />
          </mesh>
          <group ref={shin[side]} position={[0, -THIGH, 0]}>
            <mesh material={mats.skin} castShadow>
              <sphereGeometry args={[0.065, 12, 10]} />
            </mesh>
            <mesh position={[0, -SHIN / 2, 0]} material={mats.skin} castShadow>
              <capsuleGeometry args={[0.058, SHIN - 0.18, 6, 12]} />
            </mesh>
            <group ref={foot[side]} position={[0, -SHIN, 0]}>
              <mesh position={[0, 0.03, 0]} material={mats.boot} castShadow>
                <cylinderGeometry args={[0.062, 0.062, 0.16, 10]} />
              </mesh>
              <mesh position={[0, -0.045, 0.05]} material={mats.boot} castShadow receiveShadow>
                <boxGeometry args={[0.1, 0.07, 0.24]} />
              </mesh>
              <mesh position={[0, 0.12, 0]} material={mats.trim}>
                <cylinderGeometry args={[0.062, 0.062, 0.03, 10]} />
              </mesh>
            </group>
          </group>
        </group>
      </group>
    );
  };

  return (
    <group ref={root} scale={scale} position={[homeX, 0, 0]} rotation={[0, dir * (Math.PI / 2), 0]}>
      <group ref={hips} position={[0, HIP_Y, 0]}>
        {/* pelvis / trunks */}
        <mesh position={[0, -0.04, 0]} material={mats.trunks} castShadow>
          <capsuleGeometry args={[0.135, 0.1, 6, 14]} />
        </mesh>
        <mesh position={[0, 0.06, 0]} material={mats.trim}>
          <cylinderGeometry args={[0.142, 0.14, 0.05, 16]} />
        </mesh>

        <group ref={chest}>
          {/* torso */}
          <mesh position={[0, 0.22, 0]} material={mats.skin} castShadow>
            <capsuleGeometry args={[0.155, 0.22, 8, 16]} />
          </mesh>
          <mesh position={[0, 0.42, 0.03]} material={mats.skin} castShadow>
            <sphereGeometry args={[0.14, 16, 12]} />
          </mesh>

          {arm("lead")}
          {arm("rear")}

          <group ref={neck} position={[0, CHEST_TOP, 0]}>
            <mesh position={[0, 0.035, 0]} material={mats.skin} castShadow>
              <cylinderGeometry args={[0.055, 0.07, 0.09, 12]} />
            </mesh>
            <group ref={head} position={[0, 0.085, 0]}>
              <mesh position={[0, 0.085, 0]} material={mats.skin} castShadow>
                <sphereGeometry args={[0.108, 20, 16]} />
              </mesh>
              <mesh position={[0, 0.14, -0.015]} material={mats.hair} castShadow>
                <sphereGeometry args={[0.105, 16, 12, 0, Math.PI * 2, 0, Math.PI * 0.62]} />
              </mesh>
              <mesh position={[0, 0.07, 0.098]} material={mats.skin}>
                <sphereGeometry args={[0.03, 10, 8]} />
              </mesh>
              {/* mouthguard */}
              <mesh position={[0, 0.035, 0.088]} material={mats.trim}>
                <boxGeometry args={[0.05, 0.018, 0.02]} />
              </mesh>
            </group>
          </group>
        </group>

        {leg("lead")}
        {leg("rear")}
      </group>
      <mesh rotation-x={-Math.PI / 2} position={[0, 0.012, 0]}>
        <ringGeometry args={[0.38, 0.46, 32]} />
        <meshBasicMaterial
          color={slot === "red" ? colors.glove : colors.trunks}
          transparent
          opacity={0.6}
          side={THREE.DoubleSide}
        />
      </mesh>
    </group>
  );
}

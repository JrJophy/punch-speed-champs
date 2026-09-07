import { useRef, useMemo } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { fightBus, type FighterSlot } from "@/lib/fightBus";

type Props = {
  slot: FighterSlot;
  colors: { trunks: string; skin: string; glove: string };
  down?: boolean;
  scale?: number;
};

export function Boxer({ slot, colors, down = false, scale = 1 }: Props) {
  const group = useRef<THREE.Group>(null);
  const torso = useRef<THREE.Group>(null);
  const leadGlove = useRef<THREE.Group>(null);
  const rearGlove = useRef<THREE.Group>(null);
  const head = useRef<THREE.Group>(null);

  const dir = slot === "red" ? 1 : -1; // facing direction along +x
  const homeX = slot === "red" ? -1.15 : 1.15;

  const mats = useMemo(
    () => ({
      skin: new THREE.MeshStandardMaterial({ color: colors.skin, roughness: 0.75 }),
      trunks: new THREE.MeshStandardMaterial({ color: colors.trunks, roughness: 0.55 }),
      glove: new THREE.MeshStandardMaterial({ color: colors.glove, roughness: 0.35 }),
      boot: new THREE.MeshStandardMaterial({ color: "#1b1b1f", roughness: 0.6 }),
    }),
    [colors.skin, colors.trunks, colors.glove],
  );

  useFrame(({ clock }, rawDelta) => {
    const delta = Math.min(rawDelta, 0.05);
    const t = clock.getElapsedTime();
    const g = group.current;
    if (!g) return;

    const p = fightBus.punch[slot];
    const hurt = fightBus.hurt[slot];

    // decay timers
    p.t = Math.max(0, p.t - delta * 3.2);
    fightBus.hurt[slot] = Math.max(0, hurt - delta * 2.6);

    if (down) {
      g.rotation.z = THREE.MathUtils.damp(g.rotation.z, dir * -1.25, 6, delta);
      g.position.y = THREE.MathUtils.damp(g.position.y, -0.55, 6, delta);
      g.position.x = THREE.MathUtils.damp(g.position.x, homeX - dir * 0.4, 6, delta);
      return;
    }

    // idle: bounce on the balls of the feet
    const bob = Math.sin(t * 5.2 + (slot === "red" ? 0 : 1.7)) * 0.05;
    const swayZ = Math.sin(t * 2.6 + (slot === "red" ? 0.4 : 2.1)) * 0.04;

    const punchEase = Math.sin(Math.PI * (1 - p.t)) * (p.t > 0 ? 1 : 0);
    const lunge = punchEase * (0.25 + p.power * 0.55);
    const recoil = hurt * 0.35;

    g.position.y = THREE.MathUtils.damp(g.position.y, bob, 10, delta);
    g.position.x = THREE.MathUtils.damp(g.position.x, homeX + dir * (lunge - recoil), 14, delta);
    g.rotation.z = THREE.MathUtils.damp(g.rotation.z, swayZ - dir * hurt * 0.18, 8, delta);
    g.rotation.y = THREE.MathUtils.damp(
      g.rotation.y,
      dir * (Math.PI / 2) + Math.sin(t * 1.7) * 0.06,
      8,
      delta,
    );

    if (torso.current) {
      torso.current.rotation.y = THREE.MathUtils.damp(
        torso.current.rotation.y,
        punchEase * 0.5 * (p.type === "hook" ? 1.4 : 1),
        14,
        delta,
      );
    }
    if (head.current) {
      head.current.rotation.x = THREE.MathUtils.damp(head.current.rotation.x, hurt * 0.5, 10, delta);
    }

    const usesRear = p.type === "uppercut" || p.type === "haymaker";
    const extend = punchEase * (0.55 + p.power * 0.6);
    const lift = p.type === "uppercut" ? punchEase * 0.45 : 0;
    const arc = p.type === "hook" || p.type === "haymaker" ? punchEase * 0.5 : 0;

    const lead = leadGlove.current;
    const rear = rearGlove.current;
    if (lead) {
      const e = usesRear ? 0 : extend;
      lead.position.z = THREE.MathUtils.damp(lead.position.z, 0.32 + e, 18, delta);
      lead.position.y = THREE.MathUtils.damp(lead.position.y, 0.98 + (usesRear ? 0 : lift), 18, delta);
      lead.position.x = THREE.MathUtils.damp(lead.position.x, -0.3 - (usesRear ? 0 : arc), 18, delta);
    }
    if (rear) {
      const e = usesRear ? extend : 0;
      rear.position.z = THREE.MathUtils.damp(rear.position.z, 0.18 + e, 18, delta);
      rear.position.y = THREE.MathUtils.damp(rear.position.y, 1.0 + (usesRear ? lift : 0), 18, delta);
      rear.position.x = THREE.MathUtils.damp(rear.position.x, 0.32 + (usesRear ? arc : 0), 18, delta);
    }
  });

  return (
    <group ref={group} scale={scale} position={[homeX, 0, 0]} rotation={[0, dir * (Math.PI / 2), 0]}>
      {/* legs */}
      <mesh position={[-0.16, 0.34, 0]} castShadow material={mats.skin}>
        <capsuleGeometry args={[0.11, 0.4, 6, 12]} />
      </mesh>
      <mesh position={[0.16, 0.34, 0]} castShadow material={mats.skin}>
        <capsuleGeometry args={[0.11, 0.4, 6, 12]} />
      </mesh>
      <mesh position={[-0.16, 0.06, 0.03]} castShadow material={mats.boot}>
        <boxGeometry args={[0.16, 0.14, 0.28]} />
      </mesh>
      <mesh position={[0.16, 0.06, 0.03]} castShadow material={mats.boot}>
        <boxGeometry args={[0.16, 0.14, 0.28]} />
      </mesh>

      <group ref={torso}>
        {/* trunks */}
        <mesh position={[0, 0.68, 0]} castShadow material={mats.trunks}>
          <capsuleGeometry args={[0.24, 0.16, 6, 14]} />
        </mesh>
        {/* torso */}
        <mesh position={[0, 1.02, 0]} castShadow material={mats.skin}>
          <capsuleGeometry args={[0.25, 0.34, 6, 14]} />
        </mesh>
        <mesh position={[-0.27, 1.16, 0]} castShadow material={mats.skin}>
          <sphereGeometry args={[0.12, 14, 12]} />
        </mesh>
        <mesh position={[0.27, 1.16, 0]} castShadow material={mats.skin}>
          <sphereGeometry args={[0.12, 14, 12]} />
        </mesh>
        {/* head */}
        <group ref={head} position={[0, 1.5, 0.02]}>
          <mesh castShadow material={mats.skin}>
            <sphereGeometry args={[0.17, 20, 16]} />
          </mesh>
          {/* headgear band */}
          <mesh position={[0, 0.06, 0]} rotation-x={Math.PI / 2} material={mats.trunks}>
            <torusGeometry args={[0.145, 0.035, 10, 24]} />
          </mesh>
          {/* nose guard */}
          <mesh position={[0, -0.02, 0.15]} material={mats.skin}>
            <sphereGeometry args={[0.05, 10, 8]} />
          </mesh>
        </group>
        {/* gloves */}
        <group ref={leadGlove} position={[-0.3, 0.98, 0.32]}>
          <mesh castShadow material={mats.glove}>
            <sphereGeometry args={[0.15, 18, 14]} />
          </mesh>
        </group>
        <group ref={rearGlove} position={[0.32, 1.0, 0.18]}>
          <mesh castShadow material={mats.glove}>
            <sphereGeometry args={[0.15, 18, 14]} />
          </mesh>
        </group>
      </group>
    </group>
  );
}

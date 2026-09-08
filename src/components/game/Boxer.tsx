import { useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import { useGLTF } from "@react-three/drei";
import { clone as cloneSkeleton } from "three/addons/utils/SkeletonUtils.js";
import * as THREE from "three";
import boxerAsset from "@/assets/mike_tyson_boxer.glb.asset.json";
import { fightBus, type FighterSlot } from "@/lib/fightBus";

type Props = {
  slot: FighterSlot;
  colors: { trunks: string; skin: string; glove: string };
  down?: boolean;
  scale?: number;
};

function useNormalizedBoxer(source: THREE.Object3D, targetHeight = 1.75) {
  return useMemo(() => {
    const object = cloneSkeleton(source);
    const bounds = new THREE.Box3().setFromObject(object);
    const size = bounds.getSize(new THREE.Vector3());
    object.scale.setScalar(targetHeight / Math.max(size.y, 0.001));

    const scaledBounds = new THREE.Box3().setFromObject(object);
    const center = scaledBounds.getCenter(new THREE.Vector3());
    object.position.set(-center.x, -scaledBounds.min.y, -center.z);

    object.traverse((child) => {
      if (child instanceof THREE.Mesh) {
        child.castShadow = true;
        child.receiveShadow = true;
      }
    });
    return object;
  }, [source, targetHeight]);
}

export function Boxer({ slot, colors, down = false, scale = 1 }: Props) {
  const group = useRef<THREE.Group>(null);
  const modelPivot = useRef<THREE.Group>(null);
  const { scene } = useGLTF(boxerAsset.url);
  const boxer = useNormalizedBoxer(scene);

  const dir = slot === "red" ? 1 : -1;
  const homeX = slot === "red" ? -1.15 : 1.15;
  const cornerColor = slot === "red" ? colors.glove : colors.trunks;

  useFrame(({ clock }, rawDelta) => {
    const delta = Math.min(rawDelta, 0.05);
    const t = clock.getElapsedTime();
    const root = group.current;
    const pivot = modelPivot.current;
    if (!root || !pivot) return;

    const punch = fightBus.punch[slot];
    const hurt = fightBus.hurt[slot];
    punch.t = Math.max(0, punch.t - delta * 3.2);
    fightBus.hurt[slot] = Math.max(0, hurt - delta * 2.6);

    if (down) {
      root.rotation.z = THREE.MathUtils.damp(root.rotation.z, dir * -1.35, 6, delta);
      root.position.y = THREE.MathUtils.damp(root.position.y, -0.2, 6, delta);
      root.position.x = THREE.MathUtils.damp(root.position.x, homeX - dir * 0.45, 6, delta);
      pivot.rotation.x = THREE.MathUtils.damp(pivot.rotation.x, 0.25, 6, delta);
      return;
    }

    const punchEase = Math.sin(Math.PI * (1 - punch.t)) * (punch.t > 0 ? 1 : 0);
    const heavy = punch.type === "haymaker" ? 1.25 : punch.type === "uppercut" ? 1.08 : 1;
    const bob = Math.sin(t * 5.2 + (slot === "red" ? 0 : 1.7)) * 0.035;

    root.position.y = THREE.MathUtils.damp(root.position.y, bob, 10, delta);
    root.position.x = THREE.MathUtils.damp(
      root.position.x,
      homeX + dir * (punchEase * (0.34 + punch.power * 0.42) - hurt * 0.28),
      14,
      delta,
    );
    root.rotation.z = THREE.MathUtils.damp(root.rotation.z, -dir * hurt * 0.18, 9, delta);
    root.rotation.y = THREE.MathUtils.damp(
      root.rotation.y,
      dir * (Math.PI / 2) + dir * punchEase * 0.22 * heavy,
      13,
      delta,
    );
    pivot.rotation.x = THREE.MathUtils.damp(
      pivot.rotation.x,
      punch.type === "uppercut" ? -punchEase * 0.18 : punchEase * 0.08,
      14,
      delta,
    );
    pivot.rotation.z = THREE.MathUtils.damp(
      pivot.rotation.z,
      dir * punchEase * (punch.type === "hook" || punch.type === "haymaker" ? 0.22 : 0.08),
      14,
      delta,
    );
  });

  return (
    <group ref={group} scale={scale} position={[homeX, 0, 0]} rotation={[0, dir * (Math.PI / 2), 0]}>
      <group ref={modelPivot}>
        <primitive object={boxer} />
      </group>
      <mesh rotation-x={-Math.PI / 2} position={[0, 0.012, 0]}>
        <ringGeometry args={[0.38, 0.46, 32]} />
        <meshBasicMaterial color={cornerColor} transparent opacity={0.72} side={THREE.DoubleSide} />
      </mesh>
    </group>
  );
}

useGLTF.preload(boxerAsset.url);
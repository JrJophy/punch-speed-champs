import { Suspense, useMemo, useRef } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { Environment, Lightformer } from "@react-three/drei";
import * as THREE from "three";
import { Boxer } from "./Boxer";
import { fightBus } from "@/lib/fightBus";

function canvasTexture() {
  const c = document.createElement("canvas");
  c.width = c.height = 512;
  const ctx = c.getContext("2d")!;
  ctx.fillStyle = "#cfc7b4";
  ctx.fillRect(0, 0, 512, 512);
  // grime blotches
  for (let i = 0; i < 900; i++) {
    ctx.fillStyle = `rgba(${90 + Math.random() * 80},${80 + Math.random() * 70},${60 + Math.random() * 60},${Math.random() * 0.12})`;
    const r = 3 + Math.random() * 26;
    ctx.beginPath();
    ctx.arc(Math.random() * 512, Math.random() * 512, r, 0, Math.PI * 2);
    ctx.fill();
  }
  // centre logo ring
  ctx.strokeStyle = "rgba(160,40,30,0.55)";
  ctx.lineWidth = 14;
  ctx.beginPath();
  ctx.arc(256, 256, 130, 0, Math.PI * 2);
  ctx.stroke();
  ctx.strokeStyle = "rgba(20,20,25,0.35)";
  ctx.lineWidth = 6;
  ctx.beginPath();
  ctx.arc(256, 256, 150, 0, Math.PI * 2);
  ctx.stroke();
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

function Ring() {
  const mat = useMemo(() => {
    const tex = canvasTexture();
    return new THREE.MeshStandardMaterial({ map: tex, roughness: 0.92 });
  }, []);

  const posts: [number, number][] = [
    [-3.2, -3.2],
    [3.2, -3.2],
    [-3.2, 3.2],
    [3.2, 3.2],
  ];
  const ropeHeights = [0.55, 0.95, 1.35];

  return (
    <group>
      {/* apron / platform */}
      <mesh position={[0, -0.35, 0]} receiveShadow castShadow>
        <boxGeometry args={[7.6, 0.7, 7.6]} />
        <meshStandardMaterial color="#241f28" roughness={0.9} />
      </mesh>
      <mesh rotation-x={-Math.PI / 2} position={[0, 0.001, 0]} receiveShadow material={mat}>
        <planeGeometry args={[7, 7]} />
      </mesh>

      {posts.map(([x, z], i) => (
        <group key={i} position={[x, 0, z]}>
          <mesh position={[0, 0.85, 0]} castShadow>
            <cylinderGeometry args={[0.09, 0.11, 1.7, 12]} />
            <meshStandardMaterial color="#b0342a" roughness={0.5} metalness={0.15} />
          </mesh>
          <mesh position={[0, 1.75, 0]} castShadow>
            <sphereGeometry args={[0.12, 14, 12]} />
            <meshStandardMaterial color="#d9a441" roughness={0.3} metalness={0.6} />
          </mesh>
        </group>
      ))}

      {ropeHeights.map((h) =>
        [
          { pos: [0, h, -3.2] as const, rot: [0, 0, Math.PI / 2] as const },
          { pos: [-3.2, h, 0] as const, rot: [Math.PI / 2, 0, Math.PI / 2] as const },
          { pos: [3.2, h, 0] as const, rot: [Math.PI / 2, 0, Math.PI / 2] as const },
        ].map((r, i) => (
          <mesh key={`${h}-${i}`} position={r.pos} rotation={r.rot}>
            <cylinderGeometry args={[0.035, 0.035, 6.4, 8]} />
            <meshStandardMaterial color="#e8e2d4" roughness={0.7} />
          </mesh>
        )),
      )}

      {/* floor beyond the ring */}
      <mesh rotation-x={-Math.PI / 2} position={[0, -0.72, 0]} receiveShadow>
        <circleGeometry args={[36, 48]} />
        <meshStandardMaterial color="#0e0c11" roughness={1} />
      </mesh>
    </group>
  );
}

function ImpactFlash() {
  const ref = useRef<THREE.PointLight>(null);
  useFrame((_, rawDelta) => {
    const delta = Math.min(rawDelta, 0.05);
    fightBus.shake = Math.max(0, fightBus.shake - delta * 2.2);
    if (ref.current) ref.current.intensity = fightBus.shake * 26;
  });
  return <pointLight ref={ref} position={[0, 1.3, 0]} color="#ffd7a1" distance={7} intensity={0} />;
}

function CameraRig() {
  const { camera } = useThree();
  const base = useMemo(() => new THREE.Vector3(0, 1.95, 5.6), []);
  useFrame(({ clock }) => {
    const s = fightBus.shake;
    const t = clock.getElapsedTime();
    camera.position.set(
      base.x + Math.sin(t * 41) * s * 0.22,
      base.y + Math.cos(t * 37) * s * 0.18,
      base.z - s * 0.5 + Math.sin(t * 0.35) * 0.25,
    );
    camera.lookAt(0, 1.15, 0);
  });
  return null;
}

export function Arena({ redDown, blueDown }: { redDown: boolean; blueDown: boolean }) {
  return (
    <Canvas
      shadows
      dpr={[1, 1.8]}
      camera={{ position: [0, 1.95, 5.6], fov: 46 }}
      gl={{ antialias: true }}
    >
      <color attach="background" args={["#0a0810"]} />
      <fog attach="fog" args={["#0a0810", 12, 34]} />

      <ambientLight intensity={0.35} color="#8b93b5" />
      <spotLight
        position={[0, 9, 0]}
        angle={0.75}
        penumbra={0.6}
        intensity={90}
        distance={26}
        color="#fff0d2"
        castShadow
        shadow-mapSize-width={1024}
        shadow-mapSize-height={1024}
      />
      <spotLight position={[-6, 6, 5]} angle={0.7} penumbra={1} intensity={40} color="#ff6a4d" />
      <spotLight position={[6, 6, 5]} angle={0.7} penumbra={1} intensity={40} color="#4d8cff" />
      <ImpactFlash />

      <Suspense fallback={null}>
        <Environment>
          <Lightformer intensity={1.4} position={[0, 6, 0]} scale={[8, 8, 1]} />
          <Lightformer
            intensity={0.7}
            color="#8899cc"
            position={[-6, 2, -2]}
            rotation-y={Math.PI / 2}
            scale={[16, 2, 1]}
          />
        </Environment>
        <Ring />
        <Boxer scale={1.25} slot="red" colors={{ trunks: "#c33b2c", skin: "#a9724f", glove: "#e0402f" }} down={redDown} />
        <Boxer scale={1.25} slot="blue" colors={{ trunks: "#2f5bd0", skin: "#8c5a3c", glove: "#3d6ff0" }} down={blueDown} />
      </Suspense>

      <CameraRig />
    </Canvas>
  );
}

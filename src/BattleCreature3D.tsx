import { Canvas, useFrame } from "@react-three/fiber";
import { useRef } from "react";
import { DoubleSide, type Group } from "three";
import type { Creature } from "./game/creatures";

type Props = { creature: Creature; size?: number; flip?: boolean };

type ShapeProps = { creature: Creature };

function Shape({ creature }: ShapeProps) {
  const group = useRef<Group>(null);
  const isDragon = creature.id === "windrake" || creature.id === "lunara";
  const isCat = creature.id === "mystic" || creature.id === "umbra";
  const isBird = creature.id === "frosty" || creature.id === "emberfay";
  const isHeavy = creature.id === "terran" || creature.id === "geo" || creature.id === "ironix";
  const isAquatic = creature.id === "aquarion" || creature.id === "marin";
  const dark = creature.element === "Dark" ? "#211a3b" : "#263744";
  const accent = creature.accent;

  useFrame(({ clock }) => {
    if (group.current) group.current.position.y = Math.sin(clock.elapsedTime * 2.2) * 0.06;
  });

  return (
    <group ref={group} scale={1.08}>
      <mesh position={[0, 0.62, 0]} castShadow>
        {isHeavy ? <dodecahedronGeometry args={[0.58, 1]} /> : <sphereGeometry args={[0.52, 18, 14]} />}
        <meshStandardMaterial color={creature.color} roughness={0.48} metalness={creature.id === "ironix" ? 0.7 : 0.05} />
      </mesh>
      {isAquatic && <mesh position={[0, 0.78, -0.35]} scale={[1.1, 1, 0.35]}><sphereGeometry args={[0.34, 14, 10]} /><meshStandardMaterial color={dark} roughness={0.7} /></mesh>}
      {creature.id === "marin" && <mesh position={[0, 1.05, 0]} scale={[1, 0.8, 0.75]}><sphereGeometry args={[0.5, 18, 12]} /><meshStandardMaterial color={creature.color} transparent opacity={0.88} /></mesh>}
      <mesh position={[0, 1.2, 0.04]} castShadow>
        <sphereGeometry args={[isHeavy ? 0.38 : 0.35, 16, 12]} />
        <meshStandardMaterial color={creature.color} roughness={0.45} />
      </mesh>
      <mesh position={[0, 1.08, 0.32]} scale={[1, 0.65, 0.72]}>
        <sphereGeometry args={[0.18, 12, 8]} />
        <meshStandardMaterial color={accent} roughness={0.4} />
      </mesh>
      {[[-0.14, 1.25, 0.3], [0.14, 1.25, 0.3]].map(([x, y, z]) => (
        <group key={`${x}`}>
          <mesh position={[x, y, z]}><sphereGeometry args={[0.085, 10, 8]} /><meshStandardMaterial color="#fff8e6" /></mesh>
          <mesh position={[x, y, z + 0.06]}><sphereGeometry args={[0.04, 8, 8]} /><meshStandardMaterial color="#151a28" /></mesh>
        </group>
      ))}
      <mesh position={[0, 1.08, 0.47]} rotation={[Math.PI / 2, 0, 0]}><coneGeometry args={[0.055, 0.12, 5]} /><meshStandardMaterial color={dark} /></mesh>
      {[-1, 1].map(side => (
        <group key={side}>
          <mesh position={[side * 0.26, 0.38, 0.12]} scale={[1, 0.8, 1.1]}><sphereGeometry args={[0.16, 10, 8]} /><meshStandardMaterial color={creature.color} /></mesh>
          <mesh position={[side * 0.22, 0.14, 0.18]} scale={[1.2, 0.65, 1.35]}><sphereGeometry args={[0.11, 10, 8]} /><meshStandardMaterial color={dark} /></mesh>
        </group>
      ))}
      {isCat && <mesh position={[0.38, 0.72, -0.3]} rotation={[0, Math.PI / 2, 0]}><torusGeometry args={[0.34, 0.07, 8, 18, Math.PI * 1.55]} /><meshStandardMaterial color={accent} /></mesh>}
      {(isDragon || isBird || creature.id === "buggo" || creature.id === "emberfay") && [-1, 1].map(side => (
        <mesh key={side} position={[side * 0.38, isDragon ? 1.05 : 0.92, -0.14]} rotation={[0, side * 0.3, side * 0.7]}>
          <coneGeometry args={[0.28, isDragon ? 0.78 : 0.62, 5]} />
          <meshStandardMaterial color={accent} transparent opacity={0.88} side={DoubleSide} />
        </mesh>
      ))}
      {isHeavy && <mesh position={[0, 1.35, 0.43]} rotation={[Math.PI / 2, 0, 0]}><coneGeometry args={[0.15, 0.58, 6]} /><meshStandardMaterial color={accent} metalness={0.6} roughness={0.3} /></mesh>}
      {creature.id === "voltix" && <><mesh position={[-0.3, 1.05, 0.25]}><coneGeometry args={[0.11, 0.18, 4]} /><meshStandardMaterial color={accent} emissive={accent} emissiveIntensity={0.6} /></mesh><mesh position={[0.3, 1.05, 0.25]}><coneGeometry args={[0.11, 0.18, 4]} /><meshStandardMaterial color={accent} emissive={accent} emissiveIntensity={0.6} /></mesh></>}
      {creature.id === "marin" && Array.from({ length: 6 }, (_, index) => <mesh key={index} position={[(index - 2.5) * 0.13, 0.28, 0]} rotation={[0, 0, (index - 2.5) * 0.13]}><cylinderGeometry args={[0.045, 0.075, 0.62, 8]} /><meshStandardMaterial color={accent} emissive={accent} emissiveIntensity={0.18} /></mesh>)}
      <mesh position={[0, 0.55, -0.5]} rotation={[-0.6, 0, 0]}><coneGeometry args={[0.11, isDragon ? 0.82 : 0.55, 6]} /><meshStandardMaterial color={creature.element === "Fire" ? accent : creature.color} emissive={creature.element === "Fire" ? accent : "#000000"} emissiveIntensity={0.25} /></mesh>
      {(creature.id === "flamara" || creature.id === "emberfay") && <mesh position={[0, 1.72, 0]}><coneGeometry args={[0.16, 0.5, 6]} /><meshStandardMaterial color={accent} emissive={accent} emissiveIntensity={0.8} /></mesh>}
      <mesh scale={1.34} position={[0, 0.75, 0]}><sphereGeometry args={[0.63, 16, 12]} /><meshBasicMaterial color={accent} transparent opacity={0.08} /></mesh>
    </group>
  );
}

export default function BattleCreature3D({ creature, size = 180, flip = false }: Props) {
  return (
    <div className="battle-creature-3d" style={{ width: size, height: size, transform: flip ? "scaleX(-1)" : undefined }}>
      <Canvas shadows dpr={[1, 1.5]} camera={{ position: [0, 1.15, 4.1], fov: 34 }} onCreated={({ camera }) => camera.lookAt(0, 0.82, 0)}>
        <ambientLight intensity={1.5} />
        <directionalLight castShadow position={[3, 5, 4]} intensity={2.2} color="#fff3d0" />
        <directionalLight position={[-3, 2, 2]} intensity={0.7} color={creature.accent} />
        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.12, 0]} receiveShadow>
          <circleGeometry args={[1.15, 32]} />
          <meshStandardMaterial color="#49685c" roughness={1} transparent opacity={0.72} />
        </mesh>
        <Shape creature={creature} />
      </Canvas>
    </div>
  );
}

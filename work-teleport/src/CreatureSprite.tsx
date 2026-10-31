import type { Creature } from "./game/creatures";

/** Original monster-collecting RPG creature art: bold outlines, layered highlights and
 * a distinct silhouette for each element. No existing franchise character is copied. */
export default function CreatureSprite({ creature, size = 112 }: { creature: Creature; size?: number }) {
  const { color, accent, element, stage } = creature;
  const dark = element === "Fire" ? "#8f3e32" : element === "Water" ? "#245d85" : element === "Grass" ? "#315f42" : element === "Electric" ? "#80651e" : "#594d43";
  const isFinal = stage >= 3;
  const isMid = stage === 2;
  return (
    <svg width={size} height={size} viewBox="0 0 96 96" role="img" aria-label={creature.name} shapeRendering="crispEdges" style={{ overflow: "visible", imageRendering: "pixelated" }}>
      <ellipse cx="48" cy="86" rx="27" ry="6" fill="#152d2b" opacity=".22" />
      {/* elemental aura */}
      <path d="M18 61 Q7 44 21 27 Q27 12 43 17 Q58 4 73 24 Q91 34 78 58 Q86 73 66 79 L29 78 Q12 74 18 61Z" fill={accent} opacity=".19" />
      {element === "Fire" && <g fill="#ffb84d"><path d="M22 54 Q9 39 26 23 Q25 39 38 42 Q32 25 47 9 Q45 31 59 36 Q70 20 69 12 Q86 34 73 51Z"/><path d="M35 48 Q31 35 44 25 Q42 39 54 42 Q61 34 60 27 Q72 45 59 55Z" fill="#fff0a2"/></g>}
      {element === "Water" && <g fill="#9cecff"><path d="M17 38 Q7 24 20 16 Q19 30 31 29 Q41 25 38 13 Q55 27 45 41Z"/><path d="M62 34 Q57 20 72 12 Q68 26 82 29 Q88 41 76 48Z"/></g>}
      {element === "Grass" && <g fill="#9bd779"><path d="M26 35 Q9 23 17 9 Q31 15 32 30 Q39 15 52 12 Q55 30 40 39Z"/><path d="M57 34 Q62 15 80 13 Q83 32 66 42Z"/></g>}
      {element === "Electric" && <g fill="#fff08a"><path d="M69 8 48 38 62 37 48 61 79 29 64 30Z"/><path d="M17 47 7 57 20 55 14 69 31 50Z"/></g>}
      {element === "Earth" && <g fill="#c9b18e"><path d="M22 35 28 12 43 27 51 7 63 29 78 18 76 43Z"/><path d="M14 59 24 45 34 59Z"/></g>}
      {/* tails / fins */}
      {element === "Fire" && <path d="M67 59 Q88 60 83 39 Q78 48 69 43 Q76 56 61 58Z" fill={color} stroke={dark} strokeWidth="4"/>}
      {element === "Water" && <path d="M67 61 Q86 52 83 37 Q94 49 83 62 Q76 69 66 68Z" fill="#76d7ed" stroke={dark} strokeWidth="3"/>}
      {element === "Grass" && <path d="M68 60 Q87 48 84 35 Q95 43 88 58 Q80 69 68 68Z" fill="#75b96d" stroke={dark} strokeWidth="3"/>}
      {element === "Electric" && <path d="M68 61 83 48 77 44 91 30 86 49 93 53 73 72Z" fill="#f4d84d" stroke={dark} strokeWidth="2"/>}
      {element === "Earth" && <path d="M66 61 83 53 88 62 76 73 65 70Z" fill="#a9957b" stroke={dark} strokeWidth="3"/>}
      {/* feet */}
      <path d="M29 68 L26 81 Q25 85 34 85 L43 83 44 70Z M54 69 L54 82 Q55 86 65 84 L71 81 66 67Z" fill={dark}/>
      <path d="M30 78 39 78 39 82 30 82 M57 78 66 78 67 82 57 82" fill={accent}/>
      {/* main body */}
      {element === "Earth" ? <path d="M25 49 31 35 42 31 56 34 69 44 73 62 65 76 31 76 22 64Z" fill={color} stroke={dark} strokeWidth="4"/> :
       <path d="M23 53 Q21 39 33 35 Q38 26 50 29 Q66 27 72 42 Q79 58 68 72 Q57 81 35 75 Q22 69 23 53Z" fill={color} stroke={dark} strokeWidth="4"/>}
      {/* belly / chest */}
      <path d="M34 57 Q47 48 61 57 L63 70 Q49 77 36 69Z" fill={accent} opacity=".95"/>
      <path d="M39 58 Q48 54 57 58" fill="none" stroke="#fff7d6" strokeWidth="2" opacity=".75"/>
      {/* ears / horns / elemental head crest */}
      {element === "Fire" && <g><path d="M27 39 23 18 41 31Z M57 30 75 16 70 42Z" fill={color} stroke={dark} strokeWidth="4"/><path d="M29 25 34 33 27 32 M69 25 63 34 70 32" fill={accent}/></g>}
      {element === "Water" && <g><path d="M28 39 Q13 22 24 13 Q41 21 40 36Z M57 34 Q67 15 80 20 Q79 37 66 43Z" fill="#65c6e2" stroke={dark} strokeWidth="3"/><path d="M25 22 34 33 M74 27 65 37" stroke="#e6fbff" strokeWidth="3"/></g>}
      {element === "Grass" && <g><path d="M34 35 Q19 18 30 8 Q44 17 43 33 Q50 12 65 12 Q68 29 52 39Z" fill="#83c96c" stroke={dark} strokeWidth="3"/><path d="M32 17 41 31 M61 19 51 33" stroke="#d9f5a7" strokeWidth="2"/></g>}
      {element === "Electric" && <g><path d="M29 38 22 20 39 29 47 12 55 31 72 20 67 42Z" fill="#f0d44d" stroke={dark} strokeWidth="3"/><path d="M31 27 40 34 M62 27 56 35" stroke="#fff6b0" strokeWidth="2"/></g>}
      {element === "Earth" && <g><path d="M29 42 26 21 42 31 49 12 58 31 73 22 68 45Z" fill="#b9a184" stroke={dark} strokeWidth="4"/><path d="M38 27 43 35 M61 29 57 37" stroke="#eee0c5" strokeWidth="3"/></g>}
      {/* face */}
      <path d="M31 47 Q37 39 44 45 L43 55 Q36 59 31 52Z M53 45 Q61 39 66 47 L65 54 Q58 59 53 54Z" fill="#fff8e8" stroke={dark} strokeWidth="2"/>
      <ellipse cx="39" cy="49" rx="2.8" ry="4" fill="#263a43"/><ellipse cx="59" cy="49" rx="2.8" ry="4" fill="#263a43"/>
      <rect x="37" y="47" width="1.4" height="1.8" fill="white"/><rect x="57" y="47" width="1.4" height="1.8" fill="white"/>
      <path d="M45 61 Q49 65 53 61" fill="none" stroke={dark} strokeWidth="2.5" strokeLinecap="round"/>
      <path d="M27 58 32 60 M65 60 70 57" stroke="#f5a18b" strokeWidth="3" strokeLinecap="round" opacity=".85"/>
      {/* stage details */}
      {isMid && <path d="M19 51 13 43 21 44 M75 49 83 40 79 54" fill="none" stroke={accent} strokeWidth="4"/>}
      {isFinal && <g fill="none" stroke={accent} strokeWidth="3"><path d="M18 54 8 43 20 46 M77 52 89 40 82 57"/><path d="M43 29 48 20 53 29"/></g>}
      {isFinal && <circle cx="49" cy="64" r="4" fill={accent} stroke={dark} strokeWidth="2"/>}
    </svg>
  );
}

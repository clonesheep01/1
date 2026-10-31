import { useEffect, useMemo, useState } from "react";
import { effectiveness, getCreature, type Element, type Skill } from "./game/creatures";
import type { OwnedCreature, GameSave } from "./game/save";
import CreatureSprite from "./CreatureSprite";
import BattleCreature3D from "./BattleCreature3D";
import { ELEMENT_NAMES, ELEMENT_COLORS } from "./game/creatures";

type Props = { save: GameSave; wildId: string; onSave: (save: GameSave) => void; onClose: () => void };
type Result = "win" | "lose" | "escaped" | "caught" | null;

const maxHp = (id: string, level: number) => Math.max(1, Math.round(getCreature(id).hp + (level - 1) * 3.5));
const clamp = (n: number, min: number, max: number) => Math.max(min, Math.min(max, n));

// AI chooses best move based on type effectiveness
function chooseEnemySkill(wild: ReturnType<typeof getCreature>, playerCreature: ReturnType<typeof getCreature>): Skill {
  let best = wild.skills[0];
  let bestScore = -1;
  for (const skill of wild.skills) {
    if (skill.effect === "heal" || skill.effect === "shield") {
      if (Math.random() < 0.3) { best = skill; bestScore = 999; break; }
      continue;
    }
    const mult = effectiveness(skill.element, playerCreature.element);
    const score = skill.power * mult + (skill.special ? 5 : 0) + Math.random() * 3;
    if (score > bestScore) { best = skill; bestScore = score; }
  }
  return best;
}

export default function Battle({ save, wildId, onSave, onClose }: Props) {
  const wild = getCreature(wildId);
  const [wildLevel] = useState(() => Math.max(2, Math.min(8, 3 + Math.floor(Math.random() * 4))));
  const wildMax = maxHp(wildId, wildLevel);
  const [wildHp, setWildHp] = useState(wildMax);
  const [team, setTeam] = useState<OwnedCreature[]>(() => save.team.map(p => ({
    ...p, currentHp: p.currentHp > 0 ? Math.min(p.currentHp, maxHp(p.speciesId, p.level)) : maxHp(p.speciesId, p.level),
  })));
  const [log, setLog] = useState(`${wild.name} hoang dã xuất hiện! Chọn hành động.`);
  const [result, setResult] = useState<Result>(null);
  const [menu, setMenu] = useState<"main" | "skills" | "items" | "squad">("main");
  const [anim, setAnim] = useState("");
  const [fxLabel, setFxLabel] = useState("");
  const [turn, setTurn] = useState(1);
  const [inventory, setInventory] = useState({ ...save.inventory });
  const [status, setStatus] = useState<{ burn: number; poison: number; stun: number; shield: boolean }>({
    burn: 0, poison: 0, stun: 0, shield: false,
  });
  const [wildStatus, setWildStatus] = useState<{ burn: number; poison: number; stun: number; shield: boolean }>({
    burn: 0, poison: 0, stun: 0, shield: false,
  });
  const [typeHint, setTypeHint] = useState<string>("");

  const active = team.find(p => p.currentHp > 0);
  const player = active ? getCreature(active.speciesId) : null;
  const playerMax = active ? maxHp(active.speciesId, active.level) : 0;
  const finished = result !== null;

  // Show type effectiveness hint
  useEffect(() => {
    if (player && wild) {
      const mult = effectiveness(player.element, wild.element);
      if (mult > 1) setTypeHint(`${ELEMENT_NAMES[player.element]} mạnh chống ${ELEMENT_NAMES[wild.element]} (x${mult})`);
      else if (mult < 1) setTypeHint(`${ELEMENT_NAMES[player.element]} yếu chống ${ELEMENT_NAMES[wild.element]} (x${mult})`);
      else setTypeHint("");
    }
  }, [player, wild]);

  useEffect(() => {
    if (!anim) return;
    const timer = window.setTimeout(() => { setAnim(""); setFxLabel(""); }, 850);
    return () => window.clearTimeout(timer);
  }, [anim, fxLabel]);

  const commit = (nextTeam: OwnedCreature[], nextInventory = inventory) => {
    setTeam(nextTeam);
    setInventory(nextInventory);
    onSave({ ...save, team: nextTeam, inventory: nextInventory });
  };

  const animate = (element: string, label: string) => {
    setAnim(element.toLowerCase());
    setFxLabel(label);
  };

  const finish = (outcome: Exclude<Result, null>, message: string, nextTeam = team, nextInventory = inventory) => {
    setResult(outcome);
    setLog(message);
    commit(nextTeam, nextInventory);
    setMenu("main");
  };

  const awardVictory = (current: OwnedCreature[], extra: string, baseInventory = inventory) => {
    const expGain = 20 + wildLevel * 6;
    let levelMessage = "";
    const next = current.map(p => {
      if (!active || p.uid !== active.uid) return p;
      let exp = p.exp + expGain;
      let level = p.level;
      while (exp >= level * 25) {
        exp -= level * 25;
        level += 1;
        levelMessage += ` ${getCreature(p.speciesId).name} lên cấp ${level}!`;
      }
      return { ...p, level, exp, currentHp: Math.min(maxHp(p.speciesId, level), p.currentHp + 10) };
    });
    const rewardKey = Math.random() < .55 ? "potion" : "captureOrb";
    const nextInv = { ...baseInventory, [rewardKey]: baseInventory[rewardKey] + 1 };
    const rewardName = rewardKey === "potion" ? "Thuốc hồi HP" : "Quả cầu thu phục";
    finish("win", `${wild.name} đã bị đánh bại! +${expGain} EXP.${levelMessage} Nhận thêm 1 ${rewardName}. ${extra}`, next, nextInv);
  };

  const enemyTurn = (current: OwnedCreature[], enemyHealth: number, message: string, state = wildStatus, turnInventory = inventory) => {
    if (enemyHealth <= 0) { awardVictory(current, message, turnInventory); return; }
    const fighter = current.find(p => p.currentHp > 0);
    if (!fighter) { finish("lose", `${message} Đội của bạn đã kiệt sức.`, current); return; }
    const fighterCreature = getCreature(fighter.speciesId);

    // Smart AI: choose best skill
    const enemySkill = chooseEnemySkill(wild, fighterCreature);
    let next = current.map(p => ({ ...p }));
    let note = message;
    let damage = 0;

    if (state.stun > 0) {
      note += ` ${wild.name} bị choáng và bỏ lượt!`;
    } else {
      const atkMult = effectiveness(enemySkill.element, fighterCreature.element);
      const attackStat = wild.atk + wildLevel * 1.5;
      const defenseStat = fighterCreature.def + fighter.level;
      damage = Math.max(1, Math.round((attackStat * 0.72 + enemySkill.power - defenseStat * 0.48) * atkMult * (0.9 + Math.random() * 0.2)));
      if (status.shield) { damage = Math.ceil(damage * 0.45); note += " Khiên giảm sát thương!"; }
      note += ` ${wild.name} dùng ${enemySkill.name}! Gây ${damage} sát thương.`;
      if (atkMult > 1) note += " Siêu hiệu quả!";
      else if (atkMult < 1) note += " Không hiệu quả lắm...";
      if (enemySkill.effect === "burn" || enemySkill.effect === "poison" || enemySkill.effect === "stun") {
        note += ` ${enemySkill.name} gây hiệu ứng trạng thái!`;
      }
      next = next.map(p => p.uid === fighter.uid ? { ...p, currentHp: Math.max(0, p.currentHp - damage) } : p);
    }

    // Status DOT on enemy
    let nextWildStatus = { ...state };
    if (state.burn > 0 || state.poison > 0) {
      const dot = (state.burn > 0 ? 4 : 0) + (state.poison > 0 ? 5 : 0);
      enemyHealth = Math.max(0, enemyHealth - dot);
      note += ` Hiệu ứng trạng thái gây ${dot} sát thương.`;
    }
    nextWildStatus = {
      ...state,
      burn: Math.max(0, state.burn - 1),
      poison: Math.max(0, state.poison - 1),
      stun: Math.max(0, state.stun - 1),
      shield: false,
    };
    setWildStatus(nextWildStatus);
    setStatus(s => ({ ...s, shield: false }));
    setWildHp(enemyHealth);
    setTurn(t => t + 1);
    if (enemyHealth <= 0) { awardVictory(next, note, turnInventory); return; }
    if (!next.some(p => p.currentHp > 0)) { finish("lose", `${note} Đội của bạn đã kiệt sức!`, next, turnInventory); return; }
    commit(next);
    setLog(note);
    setMenu("main");
  };

  const attack = (power: number, element: Element | null, label: string, effect?: string) => {
    if (!active || !player || finished) return;
    const mult = element ? effectiveness(element as never, wild.element) : 1;
    const attackStat = player.atk + active.level;
    const defenseStat = wild.def + wildLevel;
    const damage = Math.max(1, Math.round((attackStat * 0.72 + power - defenseStat * 0.48) * mult * (0.9 + Math.random() * 0.2)));
    const hp = Math.max(0, wildHp - damage);
    animate(element ?? "Earth", label);
    let note = `${player.name} dùng ${label}! Gây ${damage} sát thương.`;
    if (mult > 1) note += " SIÊU HIỆU QUẢ!";
    if (mult < 1) note += " Không hiệu quả lắm...";
    let nextWildStatus = { ...wildStatus };
    if (effect === "burn") nextWildStatus.burn = 3;
    if (effect === "poison") nextWildStatus.poison = 3;
    if (effect === "stun") nextWildStatus.stun = 1;
    setWildStatus(nextWildStatus);
    setWildHp(hp);
    enemyTurn(team, hp, note, nextWildStatus);
  };

  const useSkill = (index: number) => {
    if (!active || !player || finished) return;
    const skill = player.skills[index];
    if (skill.effect === "heal") {
      const amount = Math.round(22 + active.level * 2);
      const next = team.map(p => p.uid === active.uid ? { ...p, currentHp: Math.min(playerMax, p.currentHp + amount) } : p);
      setStatus(s => ({ ...s, shield: false }));
      enemyTurn(next, wildHp, `${player.name} dùng ${skill.name}, hồi ${amount} HP.`);
    } else if (skill.effect === "shield") {
      const nextStatus = { ...status, shield: true };
      setStatus(nextStatus);
      enemyTurn(team, wildHp, `${player.name} dùng ${skill.name}, tạo lá chắn bảo vệ!`, wildStatus);
    } else {
      attack(skill.power, skill.element, skill.name, skill.effect);
    }
  };

  const useItem = (kind: "potion" | "superPotion") => {
    if (!active || finished || inventory[kind] <= 0) return;
    const amount = kind === "potion" ? 30 : 65;
    const healed = Math.min(playerMax - active.currentHp, amount);
    if (healed <= 0) { setLog("Sinh vật đang đầy HP, không cần dùng thuốc."); return; }
    const nextTeam = team.map(p => p.uid === active.uid ? { ...p, currentHp: p.currentHp + healed } : p);
    const nextInv = { ...inventory, [kind]: inventory[kind] - 1 };
    setInventory(nextInv);
    enemyTurn(nextTeam, wildHp, `Dùng ${kind === "potion" ? "Thuốc hồi HP" : "Thuốc hồi HP lớn"}, hồi ${healed} HP.`, wildStatus, nextInv);
  };

  const catchCreature = () => {
    if (finished || inventory.captureOrb <= 0) return;
    const chance = clamp(0.2 + (1 - wildHp / wildMax) * 0.68, 0.08, 0.92);
    const nextInv = { ...inventory, captureOrb: inventory.captureOrb - 1 };
    if (Math.random() < chance) {
      const caught: OwnedCreature = { uid: `pet-${Date.now()}-${Math.floor(Math.random() * 1000)}`, speciesId: wildId, level: wildLevel, exp: 0, currentHp: wildHp };
      const toTeam = save.team.length < 6;
      const nextSave = {
        ...save, team: toTeam ? [...team, caught] : team,
        storage: toTeam ? save.storage : [...save.storage, caught],
        caught: save.caught + 1, inventory: nextInv,
        activeQuests: save.activeQuests,
        completedQuests: save.completedQuests,
      };
      setTeam(nextSave.team);
      setInventory(nextInv);
      onSave(nextSave);
      setResult("caught");
      setLog(`${wild.name} đã được thu phục thành công! ${toTeam ? "Đã gia nhập đội hình." : "Đội đã đủ 6, sinh vật được chuyển vào kho."}`);
      return;
    }
    setInventory(nextInv);
    const message = `${wild.name} thoát khỏi quả cầu! Tỉ lệ bắt: ${Math.round(chance * 100)}%.`;
    enemyTurn(team, wildHp, message, wildStatus, nextInv);
    setLog(message);
  };

  const flee = () => {
    if (finished) return;
    if (Math.random() < 0.7) finish("escaped", "Bạn đã chạy trốn an toàn khỏi trận chiến.");
    else enemyTurn(team, wildHp, "Không thể chạy trốn! Đối thủ chớp lấy cơ hội phản công.");
  };

  const switchCreature = (uid: string) => {
    if (finished || !active || uid === active.uid) return;
    const nextActive = team.find(p => p.uid === uid);
    if (!nextActive || nextActive.currentHp <= 0) return;
    const nextTeam = [nextActive, ...team.filter(p => p.uid !== uid)];
    commit(nextTeam);
    enemyTurn(nextTeam, wildHp, `Bạn đổi sang ${getCreature(nextActive.speciesId).name}.`);
  };

  const activeLabel = useMemo(() => active ? `${player?.name} · Lv.${active.level}` : "Không còn sinh vật", [active, player]);

  return (
    <div className="modal-backdrop">
      <section className="battle-panel">
        <header className="battle-header">
          <div className="battle-title"><span className="battle-mark">VS</span><div><small>CHẠM TRÁN HOANG DÃ · LƯỢT {turn}</small><h2>Trận chiến</h2></div></div>
          <button className="close-btn" onClick={flee} aria-label="Chạy trốn">×</button>
        </header>

        {typeHint && <div className="type-hint">{typeHint}</div>}

        <div className={`battle-arena ${anim ? `cast-${anim}` : ""}`}>
          <div className="battle-ground-mark mark-enemy">WILD</div>
          <div className="battle-wild">
            <div className="battle-stat enemy-stat">
              <div className="stat-top"><b>{wild.name}</b><span>Lv.{wildLevel}</span></div>
              <div className="stat-type" style={{ color: ELEMENT_COLORS[wild.element] }}>{ELEMENT_NAMES[wild.element]}</div>
              <div className="hp-label"><span>HP</span><strong>{wildHp}/{wildMax}</strong></div>
              <div className="hp-track"><i style={{ width: `${Math.max(0, wildHp / wildMax * 100)}%`, background: ELEMENT_COLORS[wild.element] }} /></div>
              {(wildStatus.burn > 0 || wildStatus.poison > 0 || wildStatus.stun > 0) && (
                <div className="status-effects">
                  {wildStatus.burn > 0 && <span className="status-tag burn">Bỏng {wildStatus.burn}</span>}
                  {wildStatus.poison > 0 && <span className="status-tag poison">Độc {wildStatus.poison}</span>}
                  {wildStatus.stun > 0 && <span className="status-tag stun">Choáng {wildStatus.stun}</span>}
                </div>
              )}
            </div>
            <div className="battle-sprite enemy-sprite"><BattleCreature3D creature={wild} size={190} flip /></div>
          </div>
          <div className="battle-player">
            <div className="battle-sprite player-sprite"><BattleCreature3D creature={player ?? getCreature(team[0]?.speciesId ?? wildId)} size={205} /></div>
            <div className="battle-stat player-stat">
              <div className="stat-top"><b>{activeLabel}</b><span>{player ? ELEMENT_NAMES[player.element] : "—"}</span></div>
              <div className="hp-label"><span>HP</span><strong>{active?.currentHp ?? 0}/{playerMax}</strong></div>
              <div className="hp-track"><i style={{ width: `${active ? active.currentHp / playerMax * 100 : 0}%`, background: player ? ELEMENT_COLORS[player.element] : "#888" }} /></div>
              {(status.shield || status.burn > 0 || status.poison > 0 || status.stun > 0) && (
                <div className="status-effects">
                  {status.shield && <span className="status-tag shield">Khiên</span>}
                </div>
              )}
            </div>
          </div>
          {fxLabel && <div className={`battle-fx fx-${anim}`} key={`${anim}-${fxLabel}-${turn}`}><span>{fxLabel}</span><i /><i /><i /></div>}
        </div>

        <div className="battle-log" aria-live="polite">{log}</div>
        {!finished && (
          <>
            {menu === "main" && <div className="battle-actions">
              <button className="action-fight" onClick={() => attack(12, null, "Tấn công")} disabled={!active}><span className="action-icon">✦</span><b>Tấn công</b><small>Đòn cơ bản</small></button>
              <button className="action-skill" onClick={() => setMenu("skills")} disabled={!active}><span className="action-icon">✧</span><b>Kỹ năng</b><small>Chọn chiêu thức</small></button>
              <button className="action-item" onClick={() => setMenu("items")}><span className="action-icon">+</span><b>Vật phẩm</b><small>Dùng đồ hỗ trợ</small></button>
              <button className="action-squad" onClick={() => setMenu("squad")}><span className="action-icon">◆</span><b>Đội hình</b><small>Đổi sinh vật</small></button>
              <button className="action-run" onClick={flee}><span className="action-icon">→</span><b>Bỏ chạy</b><small>Rời trận đấu</small></button>
            </div>}
            {menu === "skills" && <>
              <div className="battle-section-title">KỸ NĂNG CỦA {player?.name ?? "SINH VẬT"}</div>
              <div className="skill-grid">{player?.skills.map((skill, i) => {
                const mult = effectiveness(skill.element, wild.element);
                return (
                  <button className={skill.special ? "special-skill" : ""} key={`${skill.name}-${i}`} onClick={() => useSkill(i)} disabled={!active}>
                    <b>{skill.name}{skill.special && <span className="skill-star"> ✦</span>}</b>
                    <small>{ELEMENT_NAMES[skill.element]} · {skill.power ? `Sức mạnh ${skill.power}` : skill.effect}</small>
                    {mult > 1 && <span className="type-advantage">x{mult} siêu hiệu quả!</span>}
                    {mult < 1 && <span className="type-disadvantage">x{mult} kém hiệu quả</span>}
                  </button>
                );
              })}</div>
              <button className="battle-back" onClick={() => setMenu("main")}>← Quay lại</button>
            </>}
            {menu === "items" && <>
              <div className="battle-section-title">TÚI VẬT PHẨM</div>
              <div className="battle-item-grid">
                <button onClick={() => useItem("potion")} disabled={inventory.potion <= 0 || !active || active.currentHp >= playerMax}><b>Thuốc hồi HP <em>x{inventory.potion}</em></b><small>Hồi tối đa 30 HP</small></button>
                <button onClick={() => useItem("superPotion")} disabled={inventory.superPotion <= 0 || !active || active.currentHp >= playerMax}><b>Thuốc hồi lớn <em>x{inventory.superPotion}</em></b><small>Hồi tối đa 65 HP</small></button>
                <button onClick={catchCreature} disabled={inventory.captureOrb <= 0}><b>Quả cầu thu phục <em>x{inventory.captureOrb}</em></b><small>Tỉ lệ bắt tăng khi đối thủ yếu</small></button>
              </div>
              <button className="battle-back" onClick={() => setMenu("main")}>Quay lại</button>
            </>}
            {menu === "squad" && <>
              <div className="battle-section-title">CHỌN SINH VẬT RA TRẬN</div>
              <div className="battle-squad-grid">{team.map(p => {
                const creature = getCreature(p.speciesId);
                const isActive = active?.uid === p.uid;
                const hpMax = maxHp(p.speciesId, p.level);
                return <button key={p.uid} className={isActive ? "selected" : ""} onClick={() => switchCreature(p.uid)} disabled={isActive || p.currentHp <= 0}>
                  <CreatureSprite creature={creature} size={54} />
                  <span><b>{creature.name}</b><small>Lv.{p.level} · HP {p.currentHp}/{hpMax}</small></span>
                </button>;
              })}</div>
              <button className="battle-back" onClick={() => setMenu("main")}>Quay lại</button>
            </>}
          </>
        )}
        {finished && <div className={`battle-result result-${result}`}>
          <b>{result === "win" ? "🏆 CHIẾN THẮNG!" : result === "lose" ? "💫 THẤT BẠI" : result === "caught" ? "✨ THU PHỤC THÀNH CÔNG!" : "🏃 ĐÃ RÚT LUI"}</b>
          <button className="primary-btn" onClick={onClose}>Tiếp tục hành trình</button>
        </div>}
        <div className="team-mini">{team.map(p => <span key={p.uid} className={p.currentHp > 0 ? "alive" : "fainted"}>{getCreature(p.speciesId).name} · {p.currentHp} HP</span>)}</div>
      </section>
    </div>
  );
}

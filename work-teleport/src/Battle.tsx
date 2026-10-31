import { useEffect, useMemo, useState } from "react";
import { effectiveness, getCreature } from "./game/creatures";
import type { OwnedCreature, GameSave } from "./game/save";
import CreatureSprite from "./CreatureSprite";

type Props = { save: GameSave; wildId: string; onSave: (save: GameSave) => void; onClose: () => void };
type Result = "win" | "lose" | "escaped" | "caught" | null;

const maxHp = (id: string, level: number) => Math.max(1, Math.round(getCreature(id).hp + (level - 1) * 3.5));
const elementName: Record<string, string> = {
  Fire: "Lửa", Water: "Nước", Grass: "Cỏ", Electric: "Điện", Earth: "Đất",
  Ice: "Băng", Wind: "Gió", Psychic: "Tâm linh", Bug: "Côn trùng", Dark: "Bóng tối",
  Ground: "Địa tầng", Metal: "Kim loại", Fairy: "Tiên", Poison: "Độc", Dragon: "Rồng",
};
const clamp = (n: number, min: number, max: number) => Math.max(min, Math.min(max, n));

export default function Battle({ save, wildId, onSave, onClose }: Props) {
  const wild = getCreature(wildId);
  const [wildLevel] = useState(() => Math.max(2, Math.min(8, 3 + Math.floor(Math.random() * 4))));
  const wildMax = maxHp(wildId, wildLevel);
  const [wildHp, setWildHp] = useState(wildMax);
  const [team, setTeam] = useState<OwnedCreature[]>(() => save.team.map(p => ({
    ...p, currentHp: p.currentHp > 0 ? Math.min(p.currentHp, maxHp(p.speciesId, p.level)) : maxHp(p.speciesId, p.level),
  })));
  const [log, setLog] = useState(`${wild.name} hoang dã xuất hiện! Chọn hành động của bạn.`);
  const [result, setResult] = useState<Result>(null);
  const [menu, setMenu] = useState<"main" | "skills" | "items">("main");
  const [anim, setAnim] = useState("");
  const [fxLabel, setFxLabel] = useState("");
  const [turn, setTurn] = useState(1);
  const [inventory, setInventory] = useState({ ...save.inventory });
  const [status, setStatus] = useState<{ burn: number; poison: number; stun: number; shield: boolean }>({
    burn: 0, poison: 0, stun: 0, shield: false,
  });

  const active = team.find(p => p.currentHp > 0);
  const player = active ? getCreature(active.speciesId) : null;
  const playerMax = active ? maxHp(active.speciesId, active.level) : 0;
  const finished = result !== null;
  const teamAlive = team.some(p => p.currentHp > 0);

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
  const enemyTurn = (current: OwnedCreature[], enemyHealth: number, message: string, state = status, turnInventory = inventory) => {
    if (enemyHealth <= 0) { awardVictory(current, message, turnInventory); return; }
    const fighter = current.find(p => p.uid === active?.uid) ?? current.find(p => p.currentHp > 0);
    if (!fighter) { finish("lose", `${message} Đội của bạn đã kiệt sức.`, current); return; }
    let next = current.map(p => ({ ...p }));
    let damage = Math.max(1, Math.round((wild.atk + wildLevel * 1.5 - (getCreature(fighter.speciesId).def + fighter.level) * .55) * (.85 + Math.random() * .3)));
    let note = message;
    if (state.shield) { damage = Math.ceil(damage * .45); note += " Khiên giảm sát thương!"; }
    if (state.stun > 0) {
      damage = 0;
      note += ` ${wild.name} bị choáng và bỏ lượt!`;
    } else {
      next = next.map(p => p.uid === fighter.uid ? { ...p, currentHp: Math.max(0, p.currentHp - damage) } : p);
      note += ` ${wild.name} phản công, gây ${damage} sát thương.`;
    }
    if (state.burn > 0 || state.poison > 0) {
      const dot = (state.burn > 0 ? 4 : 0) + (state.poison > 0 ? 5 : 0);
      enemyHealth = Math.max(0, enemyHealth - dot);
      note += ` Hiệu ứng trạng thái gây ${dot} sát thương.`;
    }
    const nextStatus = {
      ...state,
      burn: Math.max(0, state.burn - 1),
      poison: Math.max(0, state.poison - 1),
      stun: Math.max(0, state.stun - 1),
      shield: false,
    };
    setStatus(nextStatus);
    setWildHp(enemyHealth);
    setTurn(t => t + 1);
    if (enemyHealth <= 0) { awardVictory(next, note, turnInventory); return; }
    if (!next.some(p => p.currentHp > 0)) { finish("lose", `${note} Đội của bạn đã kiệt sức!`, next, turnInventory); return; }
    commit(next);
    setLog(note);
    setMenu("main");
  };

  const attack = (power: number, element: keyof typeof elementName | null, label: string, effect?: string) => {
    if (!active || !player || finished) return;
    const mult = element ? effectiveness(element as never, wild.element) : 1;
    const attackStat = player.atk + active.level;
    const defenseStat = wild.def + wildLevel;
    const damage = Math.max(1, Math.round((attackStat * .72 + power - defenseStat * .48) * mult * (.9 + Math.random() * .2)));
    const hp = Math.max(0, wildHp - damage);
    animate(element ?? "Earth", label);
    let note = `${player.name} ${label.toLowerCase()}! Gây ${damage} sát thương.`;
    if (mult > 1) note += " Siêu hiệu quả!";
    if (mult < 1) note += " Không hiệu quả lắm...";
    let nextStatus = { ...status };
    if (effect === "burn") nextStatus.burn = 3;
    if (effect === "poison") nextStatus.poison = 3;
    if (effect === "stun") nextStatus.stun = 1;
    setStatus(nextStatus);
    setWildHp(hp);
    enemyTurn(team, hp, note, nextStatus);
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
      enemyTurn(team, wildHp, `${player.name} dùng ${skill.name}, tạo lá chắn bảo vệ!`, nextStatus);
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
    enemyTurn(nextTeam, wildHp, `Dùng ${kind === "potion" ? "Thuốc hồi HP" : "Thuốc hồi HP lớn"}, hồi ${healed} HP.`, status, nextInv);
  };

  const catchCreature = () => {
    if (finished || inventory.captureOrb <= 0) return;
    const chance = clamp(.2 + (1 - wildHp / wildMax) * .68, .08, .92);
    const nextInv = { ...inventory, captureOrb: inventory.captureOrb - 1 };
    if (Math.random() < chance) {
      const caught: OwnedCreature = { uid: `pet-${Date.now()}-${Math.floor(Math.random() * 1000)}`, speciesId: wildId, level: wildLevel, exp: 0, currentHp: wildHp };
      const toTeam = save.team.length < 6;
      const nextSave = {
        ...save, team: toTeam ? [...team, caught] : team,
        storage: toTeam ? save.storage : [...save.storage, caught],
        caught: save.caught + 1, inventory: nextInv,
      };
      setTeam(nextSave.team);
      setInventory(nextInv);
      onSave(nextSave);
      setResult("caught");
      setLog(`${wild.name} đã được thu phục thành công! ${toTeam ? "Đã gia nhập đội hình." : "Đội đã đủ 6, sinh vật được chuyển vào kho."}`);
      return;
    }
    setInventory(nextInv);
    const message = `${wild.name} thoát khỏi quả cầu! Tỉ lệ bắt lần này là ${Math.round(chance * 100)}%.`;
    enemyTurn(team, wildHp, message, status);
    // enemyTurn commits the updated inventory as well.
    setLog(message);
  };

  const flee = () => {
    if (finished) return;
    const chance = .7;
    if (Math.random() < chance) finish("escaped", "Bạn đã chạy trốn an toàn khỏi trận chiến.");
    else enemyTurn(team, wildHp, "Không thể chạy trốn! Đối thủ chớp lấy cơ hội phản công.");
  };

  const activeLabel = useMemo(() => active ? `${player?.name} · Lv.${active.level}` : "Không còn sinh vật", [active, player]);

  return (
    <div className="modal-backdrop">
      <section className="battle-panel">
        <header className="panel-head">
          <div><small>CHẠM TRÁN HOANG DÃ · HỆ {elementName[wild.element].toUpperCase()} · LƯỢT {turn}</small><h2>Trận chiến sinh vật</h2></div>
          <button className="close-btn" onClick={flee} aria-label="Chạy trốn">×</button>
        </header>

        <div className={`battle-arena ${anim ? `cast-${anim}` : ""}`}>
          <div className="battle-wild">
            <div className="battle-stat">
              <b>{wild.name}</b><span>Lv.{wildLevel} · {elementName[wild.element]}</span>
              <div className="hp-track"><i style={{ width: `${Math.max(0, wildHp / wildMax * 100)}%` }} /></div>
              <small>HP {wildHp} / {wildMax}</small>
            </div>
            <div className="battle-sprite"><CreatureSprite creature={wild} size={130} /></div>
          </div>
          <div className="battle-player">
            <div className="battle-sprite"><CreatureSprite creature={player ?? getCreature(team[0]?.speciesId ?? wildId)} size={130} /></div>
            <div className="battle-stat">
              <b>{activeLabel}</b><span>{player ? elementName[player.element] : "—"}</span>
              <div className="hp-track"><i style={{ width: `${active ? active.currentHp / playerMax * 100 : 0}%` }} /></div>
              <small>HP {active?.currentHp ?? 0} / {playerMax}</small>
            </div>
          </div>
          {fxLabel && <div className={`battle-fx fx-${anim}`} key={`${anim}-${fxLabel}-${turn}`}><span>{fxLabel}</span><i /><i /><i /></div>}
        </div>

        <div className="battle-log" aria-live="polite">{log}</div>
        {!finished && (
          <>
            {menu === "main" && <div className="battle-actions">
              <button onClick={() => attack(12, null, "Tấn công")} disabled={!active}>⚔ Tấn công</button>
              <button onClick={() => setMenu("skills")} disabled={!active}>✦ Kỹ năng</button>
              <button onClick={() => setMenu("items")}>🎒 Vật phẩm</button>
              <button onClick={flee}>↗ Chạy trốn</button>
            </div>}
            {menu === "skills" && <>
              <div className="battle-section-title">KỸ NĂNG CỦA {player?.name ?? "SINH VẬT"}</div>
              <div className="skill-grid">{player?.skills.map((skill, i) => (
                <button className={skill.special ? "special-skill" : ""} key={`${skill.name}-${i}`} onClick={() => useSkill(i)} disabled={!active}>
                  <b>{skill.name}{skill.special && <span className="skill-star"> ✦</span>}</b>
                  <small>{elementName[skill.element]} · {skill.power ? `Sức mạnh ${skill.power}` : skill.effect}</small>
                </button>
              ))}</div>
              <button className="battle-back" onClick={() => setMenu("main")}>← Quay lại</button>
            </>}
            {menu === "items" && <>
              <div className="battle-section-title">TÚI VẬT PHẨM</div>
              <div className="battle-item-grid">
                <button onClick={() => useItem("potion")} disabled={inventory.potion <= 0 || !active || active.currentHp >= playerMax}>🧪 Thuốc hồi HP <b>x{inventory.potion}</b><small>Hồi tối đa 30 HP</small></button>
                <button onClick={() => useItem("superPotion")} disabled={inventory.superPotion <= 0 || !active || active.currentHp >= playerMax}>💚 Thuốc hồi lớn <b>x{inventory.superPotion}</b><small>Hồi tối đa 65 HP</small></button>
                <button onClick={catchCreature} disabled={inventory.captureOrb <= 0}>🔮 Quả cầu thu phục <b>x{inventory.captureOrb}</b><small>Tỉ lệ tăng khi đối thủ yếu</small></button>
              </div>
              <button className="battle-back" onClick={() => setMenu("main")}>← Quay lại</button>
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

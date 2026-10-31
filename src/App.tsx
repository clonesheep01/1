import { useEffect, useMemo, useRef, useState } from "react";
import { Scene3D, type GameEvent3D } from "./game/Scene3D";
import { CREATURES, getCreature } from "./game/creatures";
import { loadSave, persistSave } from "./game/save";
import type { GameSave, OwnedCreature } from "./game/save";
import { maps, type MapId } from "./game/maps";
import CreatureSprite from "./CreatureSprite";
import Battle from "./Battle";
import ModelViewer from "./ModelViewer";

export default function App() {
  const containerRef = useRef<HTMLDivElement>(null);
  const sceneRef = useRef<Scene3D | null>(null);
  const [mapName, setMapName] = useState("Thị trấn Mộc Miên");
  const [message, setMessage] = useState("Chào mừng đến với Little World 3D!");
  const [dialogue, setDialogue] = useState<string | null>(null);
  const [dialogueName, setDialogueName] = useState<string>("");
  const [encounter, setEncounter] = useState(false);
  const [save, setSave] = useState<GameSave>(() => loadSave());
  const [wildId, setWildId] = useState<string | null>(null);
  const [panel, setPanel] = useState<"team" | "storage" | "dex" | null>(null);
  const [teleportOpen, setTeleportOpen] = useState(false);
  const [teleportFlash, setTeleportFlash] = useState(false);
  const [questPanel, setQuestPanel] = useState<{ title: string; intro: string; npcName: string; questId: string } | null>(null);
  const [questList, setQuestList] = useState(false);
  const [modelViewerOpen, setModelViewerOpen] = useState(false);

  useEffect(() => { persistSave(save); }, [save]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const scene = new Scene3D(container, (event: GameEvent3D) => {
      if (event.type === "map") {
        setMapName(event.name);
        setMessage(event.viaTeleport ? `Dịch chuyển thành công đến ${event.name}.` : `Bạn đã đến ${event.name}.`);
        setDialogue(null);
        const position = sceneRef.current?.getPosition();
        setSave(current => ({
          ...current,
          mapId: event.mapId,
          x: position?.x ?? current.x,
          y: position?.y ?? current.y,
          unlockedMaps: current.unlockedMaps.includes(event.mapId) ? current.unlockedMaps : [...current.unlockedMaps, event.mapId],
        }));
        if (event.viaTeleport) {
          setTeleportFlash(true);
          window.setTimeout(() => setTeleportFlash(false), 650);
          setTeleportOpen(false);
        }
      }
      if (event.type === "dialogue") {
        setDialogue(event.text);
        setDialogueName(event.npcName ?? "NGƯỜI LỮ HÀNH");
      }
      if (event.type === "grass") {
        setEncounter(true);
        setMessage("Cỏ lay động... Có thứ gì đó đang ẩn nấp!");
        window.setTimeout(() => setEncounter(false), 2600);
        const possible = CREATURES.filter(c => c.stage === 1 || Math.random() < 0.12);
        setWildId(possible[Math.floor(Math.random() * possible.length)].id);
      }
      if (event.type === "hint") setMessage(event.text);
      if (event.type === "npc_name") setDialogueName(event.name);
      if (event.type === "quest") {
        setQuestPanel({ title: event.title, intro: event.intro, npcName: event.npcName, questId: event.questId });
        setDialogue(null);
      }
      if (event.type === "quest_progress") {
        setDialogue(event.text);
        setDialogueName(event.npcName);
      }
    }, { mapId: save.mapId, x: save.x, y: save.y }, position => {
      setSave(current => current.mapId === position.mapId && current.x === position.x && current.y === position.y
        ? current
        : { ...current, ...position });
    });
    sceneRef.current = scene;
    scene.setQuestState({ activeQuests: save.activeQuests, completedQuests: save.completedQuests });
    scene.start();

    const onResize = () => scene.resize();
    window.addEventListener("resize", onResize);

    return () => {
      window.removeEventListener("resize", onResize);
      scene.stop();
      sceneRef.current = null;
    };
  }, []);

  // Sync quest state to engine
  useEffect(() => {
    sceneRef.current?.setQuestState({ activeQuests: save.activeQuests, completedQuests: save.completedQuests });
  }, [save.activeQuests, save.completedQuests]);

  // Track catches for quest progress
  const prevCaught = useRef(save.caught);
  useEffect(() => {
    if (save.caught > prevCaught.current) {
      // Auto-advance quest progress when creatures are caught
      setSave(current => {
        const newActive = [...current.activeQuests];
        return { ...current, activeQuests: newActive };
      });
    }
    prevCaught.current = save.caught;
  }, [save.caught]);

  const acceptQuest = () => {
    if (!questPanel) return;
    setSave(s => ({ ...s, activeQuests: [...s.activeQuests, questPanel.questId] }));
    setDialogue(`${questPanel.npcName}: ${questPanel.intro}`);
    setDialogueName(questPanel.npcName);
    setQuestPanel(null);
  };

  const addSave = (next: GameSave) => setSave(next);

  const moveCreature = (pet: OwnedCreature, from: "team" | "storage") => {
    if (from === "team") {
      if (save.team.length <= 1) { setMessage("Bạn cần giữ lại ít nhất 1 sinh vật trong đội."); return; }
      if (save.storage.some(x => x.uid === pet.uid)) return;
      setSave(s => ({ ...s, team: s.team.filter(x => x.uid !== pet.uid), storage: [...s.storage, pet] }));
    } else {
      if (save.team.length >= 6) { setMessage("Đội hình đã đủ 6 sinh vật. Hãy chuyển một sinh vật vào kho trước."); return; }
      setSave(s => ({ ...s, storage: s.storage.filter(x => x.uid !== pet.uid), team: [...s.team, pet] }));
    }
  };

  const caughtIds = useMemo(() => new Set([...save.team, ...save.storage].map(p => p.speciesId)), [save]);

  return (
    <main className="page">
      <header className="topbar">
        <div className="brand"><span className="brand-mark">✦</span><div><strong>LITTLE WORLD 3D</strong><small>PIXEL RPG · CHƯƠNG 01</small></div></div>
        <div className="location"><span className="online-dot" />{mapName}</div>
      </header>

      <section className="game-shell">
        <div className="game-heading">
          <div><span className="eyebrow">HÀNH TRÌNH BẮT ĐẦU</span><h1>Một thế giới nhỏ 3D</h1></div>
          <div className="chapter">02 <span>/ 03</span></div>
        </div>
        <div className="canvas-wrap" style={{ position: "relative", minHeight: "540px" }}>
          <div ref={containerRef} style={{ position: "absolute", inset: 0, borderRadius: "inherit", overflow: "hidden" }} />
          <button className="teleport-trigger" onClick={() => setTeleportOpen(true)} aria-label="Mở dịch chuyển">✦ TELEPORT</button>
          {teleportFlash && <div className="teleport-flash" aria-hidden="true"><span>TELEPORT!</span></div>}
          {encounter && <div className="encounter-toast"><span>✧</span><div><b>Cỏ cao xào xạc!</b><small>Một cuộc chạm trán có thể xảy ra...</small></div></div>}
          {dialogue && (
            <div className="dialogue">
              <div className="dialogue-name">{dialogueName}</div>
              <p>{dialogue}</p>
              <small>Nhấn E hoặc Enter để tiếp tục</small>
              <button onClick={() => { sceneRef.current?.dismissDialogue(); setDialogue(null); }}>Tiếp tục <span>→</span></button>
            </div>
          )}
          <div className="map-chip"><span>◈</span> {mapName}</div>
        </div>
        <div className="underbar">
          <div className="hint"><kbd>W</kbd><kbd>A</kbd><kbd>S</kbd><kbd>D</kbd><span>Di chuyển</span></div>
          <div className="hint"><kbd>↑</kbd><kbd>←</kbd><kbd>↓</kbd><kbd>→</kbd><span>Di chuyển</span></div>
          <div className="hint"><kbd>E</kbd><span>Nói chuyện / tương tác</span></div>
          <div className="status"><i /> Đang khám phá 3D</div>
        </div>
      </section>

      <section className="creature-toolbar">
        <div><b>Đội hình của bạn</b><small>{save.team.length}/6 vị trí · {save.caught} lần thu phục</small></div>
        <div className="toolbar-actions">
          <button onClick={() => setPanel("team")}>Đội hình</button>
          <button onClick={() => setPanel("storage")}>Kho sinh vật ({save.storage.length})</button>
          <button onClick={() => setPanel("dex")}>Bách khoa ({caughtIds.size}/15)</button>
          <button onClick={() => setQuestList(true)}>Nhiệm vụ ({save.activeQuests.length + save.completedQuests.length})</button>
          <button onClick={() => setModelViewerOpen(true)}>Model 3D</button>
        </div>
      </section>

      <section className="team-strip">
        {save.team.map(p => {
          const c = getCreature(p.speciesId);
          const hp = p.currentHp || c.hp + (p.level - 1) * 3.5;
          return (
            <div className="team-card" key={p.uid}>
              <CreatureSprite creature={c} size={58} />
              <div>
                <b>{c.name}</b>
                <small>Lv.{p.level} · {c.element}</small>
                <div className="mini-hp"><i style={{ width: `${Math.min(100, hp / (c.hp + (p.level - 1) * 3.5) * 100)}%` }} /></div>
              </div>
            </div>
          );
        })}
        {save.team.length === 0 && <p className="empty-text">Chưa có sinh vật trong đội. Hãy mở kho để chọn đội hình.</p>}
      </section>

      <section className="bottom-grid">
        <article className="info-card"><div className="card-icon sun">☀</div><div><b>Khám phá tự do 3D</b><p>Đi qua thị trấn, đồng cỏ và khu rừng trong thế giới 3D chiều sâu thật.</p></div></article>
        <article className="info-card"><div className="card-icon leaf">❧</div><div><b>Thu phục sinh vật</b><p>Bước vào cỏ cao để gặp sinh vật hoang dã, chiến đấu và thu phục chúng.</p></div></article>
        <article className="info-card"><div className="card-icon mapicon">⌖</div><div><b>Hệ thống克制</b><p>15 hệ nguyên tố với bảng tương khắc. Dùng kỹ năng đúng hệ để tối ưu sát thương.</p></div></article>
      </section>

      <footer><span>LITTLE WORLD 3D RPG</span><span>PHẦN 2 — 3D & CHIẾN ĐẤU</span></footer>
      <div className="live-message" aria-live="polite">{message}</div>

      {/* Quest acceptance panel */}
      {questPanel && (
        <div className="modal-backdrop" onClick={() => setQuestPanel(null)}>
          <section className="quest-panel" onClick={e => e.stopPropagation()}>
            <header className="panel-head">
              <div><small>NHIỆM VỤ MỚI</small><h2>{questPanel.title}</h2></div>
              <button className="close-btn" onClick={() => setQuestPanel(null)}>×</button>
            </header>
            <div className="quest-content">
              <p className="quest-npc">{questPanel.npcName}</p>
              <p className="quest-intro">{questPanel.intro}</p>
              <div className="quest-actions">
                <button className="primary-btn" onClick={acceptQuest}>Nhận nhiệm vụ</button>
                <button onClick={() => setQuestPanel(null)}>Để sau</button>
              </div>
            </div>
          </section>
        </div>
      )}

      {/* Quest list */}
      {questList && (
        <div className="modal-backdrop" onClick={() => setQuestList(false)}>
          <section className="quest-panel" onClick={e => e.stopPropagation()}>
            <header className="panel-head">
              <div><small>DANH SÁCH</small><h2>Nhiệm vụ</h2></div>
              <button className="close-btn" onClick={() => setQuestList(false)}>×</button>
            </header>
            <div className="quest-list">
              <div>
                <h3>Đang làm</h3>
                {save.activeQuests.length === 0 ? <p className="empty-text">Chưa có nhiệm vụ nào.</p> :
                  save.activeQuests.map(qId => {
                    const npc = Object.values(maps).flatMap(m => m.npcs).find(n => n.quest?.id === qId);
                    return (
                      <article className="quest-item active" key={qId}>
                        <b>{npc?.quest?.title ?? qId}</b>
                        <small>{npc?.name ?? ""}</small>
                        <p>{npc?.quest?.description ?? ""}</p>
                      </article>
                    );
                  })
                }
              </div>
              <div>
                <h3>Hoàn thành</h3>
                {save.completedQuests.length === 0 ? <p className="empty-text">Chưa hoàn thành nhiệm vụ nào.</p> :
                  save.completedQuests.map(qId => {
                    const npc = Object.values(maps).flatMap(m => m.npcs).find(n => n.quest?.id === qId);
                    return (
                      <article className="quest-item done" key={qId}>
                        <b>{npc?.quest?.title ?? qId}</b>
                        <small>{npc?.name ?? ""} · Đã xong</small>
                      </article>
                    );
                  })
                }
              </div>
            </div>
          </section>
        </div>
      )}

      {/* Teleport */}
      {teleportOpen && (
        <div className="modal-backdrop teleport-backdrop" onClick={() => setTeleportOpen(false)}>
          <section className="teleport-panel" onClick={e => e.stopPropagation()}>
            <header className="panel-head">
              <div><small>DI CHUYỂN NHANH</small><h2>Chọn khu vực</h2></div>
              <button className="close-btn" onClick={() => setTeleportOpen(false)}>×</button>
            </header>
            <p className="teleport-note">Dịch chuyển nhanh giữa các khu vực đã khám phá.</p>
            <div className="teleport-destinations">
              {(Object.keys(maps) as MapId[]).filter(id => save.unlockedMaps.includes(id)).map(id => (
                <button key={id} className={`teleport-destination ${save.mapId === id ? "current" : ""}`} disabled={save.mapId === id}
                  onClick={() => { const ok = sceneRef.current?.teleportTo(id); if (!ok) setMessage("Không tìm được điểm xuất hiện an toàn."); }}>
                  <span className="destination-icon">{id === "town" ? "⌂" : id === "meadow" ? "❀" : "♧"}</span>
                  <span><b>{maps[id].name}</b><small>{save.mapId === id ? "Bạn đang ở đây" : "Đã mở khóa · Dịch chuyển ngay"}</small></span>
                  <strong>{save.mapId === id ? "HIỆN TẠI" : "→"}</strong>
                </button>
              ))}
            </div>
            <div className="panel-foot">Dịch chuyển nhanh giữa các khu vực đã khám phá.</div>
          </section>
        </div>
      )}

      {/* Battle */}
      {wildId && <Battle save={save} wildId={wildId} onSave={addSave} onClose={() => setWildId(null)} />}

      {modelViewerOpen && <ModelViewer onClose={() => setModelViewerOpen(false)} />}

      {/* Collection panels */}
      {panel && (
        <div className="modal-backdrop">
          <section className="collection-panel">
            <header className="panel-head">
              <div><small>QUẢN LÝ SINH VẬT</small><h2>{panel === "team" ? "Đội hình" : panel === "storage" ? "Kho sinh vật" : "Bách khoa sinh vật"}</h2></div>
              <button className="close-btn" onClick={() => setPanel(null)}>×</button>
            </header>
            {panel === "dex" ? (
              <div className="dex-grid">
                {CREATURES.map(c => (
                  <article className={`dex-card ${caughtIds.has(c.id) ? "" : "unknown"}`} key={c.id}>
                    <CreatureSprite creature={c} size={72} />
                    <b>{caughtIds.has(c.id) ? c.name : "???"}</b>
                    <small>{caughtIds.has(c.id) ? c.element : "Chưa khám phá"}</small>
                  </article>
                ))}
              </div>
            ) : (
              <div className="collection-list">
                {(panel === "team" ? save.team : save.storage).map(p => {
                  const c = getCreature(p.speciesId);
                  return (
                    <article className="collection-creature" key={p.uid}>
                      <CreatureSprite creature={c} size={74} />
                      <div className="creature-details">
                        <b>{c.name} <span>Lv.{p.level}</span></b>
                        <small>{c.element} · EXP {p.exp}/{p.level * 25}</small>
                        <small>HP {p.currentHp || c.hp + (p.level - 1) * 3.5} · ATK {c.atk + p.level} · DEF {c.def + p.level} · SPD {c.speed + p.level}</small>
                        <p>{c.description}</p>
                      </div>
                      <button onClick={() => moveCreature(p, panel)}>{panel === "team" ? "Gửi vào kho" : "Thêm vào đội"}</button>
                    </article>
                  );
                })}
                {(panel === "team" ? save.team : save.storage).length === 0 && <p className="empty-text">Chưa có sinh vật ở đây.</p>}
              </div>
            )}
            <div className="panel-foot">Đội hình tối đa 6 sinh vật. Sinh vật thu phục khi đội đầy sẽ tự động vào kho.</div>
          </section>
        </div>
      )}
    </main>
  );
}

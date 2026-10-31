import { STARTER_ID } from "./creatures";
import type { MapId } from "./maps";

export type OwnedCreature = {
  uid: string;
  speciesId: string;
  level: number;
  exp: number;
  currentHp: number;
};

export type Inventory = {
  potion: number;
  superPotion: number;
  captureOrb: number;
};

export type GameSave = {
  mapId: MapId;
  x: number;
  y: number;
  unlockedMaps: MapId[];
  team: OwnedCreature[];
  storage: OwnedCreature[];
  caught: number;
  inventory: Inventory;
  activeQuests: string[];
  completedQuests: string[];
};

const KEY = "little-world-rpg-save-v2";
const DEFAULT_INVENTORY: Inventory = { potion: 5, superPotion: 2, captureOrb: 8 };

export function createSave(): GameSave {
  return {
    mapId: "town",
    x: 850,
    y: 650,
    unlockedMaps: ["town", "meadow", "forest"],
    team: [{ uid: `pet-${Date.now()}`, speciesId: STARTER_ID, level: 5, exp: 0, currentHp: 0 }],
    storage: [],
    caught: 1,
    inventory: { ...DEFAULT_INVENTORY },
    activeQuests: [],
    completedQuests: [],
  };
}

/** Migrate saves created before the battle inventory was added. */
export function loadSave(): GameSave {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return createSave();
    const data = JSON.parse(raw) as Partial<GameSave>;
    if (!Array.isArray(data.team) || !Array.isArray(data.storage)) return createSave();
    const validMapIds = ["town", "meadow", "forest"] as const;
    const mapId = validMapIds.includes(data.mapId as (typeof validMapIds)[number]) ? data.mapId as GameSave["mapId"] : "town";
    const unlockedMaps: GameSave["unlockedMaps"] = Array.from(new Set<MapId>(["town", "meadow", "forest", ...(Array.isArray(data.unlockedMaps) ? data.unlockedMaps.filter((id): id is GameSave["mapId"] => validMapIds.includes(id as (typeof validMapIds)[number])) : [])]));
    return {
      mapId,
      x: Number.isFinite(data.x) ? Number(data.x) : 850,
      y: Number.isFinite(data.y) ? Number(data.y) : 650,
      unlockedMaps,
      team: data.team,
      storage: data.storage,
      caught: Number.isFinite(data.caught) ? Number(data.caught) : 1,
      inventory: {
        potion: Math.max(0, Number(data.inventory?.potion ?? DEFAULT_INVENTORY.potion)),
        superPotion: Math.max(0, Number(data.inventory?.superPotion ?? DEFAULT_INVENTORY.superPotion)),
        captureOrb: Math.max(0, Number(data.inventory?.captureOrb ?? DEFAULT_INVENTORY.captureOrb)),
      },
      activeQuests: Array.isArray(data.activeQuests) ? data.activeQuests.filter((q): q is string => typeof q === "string") : [],
      completedQuests: Array.isArray(data.completedQuests) ? data.completedQuests.filter((q): q is string => typeof q === "string") : [],
    };
  } catch {
    return createSave();
  }
}

export function persistSave(save: GameSave) {
  localStorage.setItem(KEY, JSON.stringify(save));
}

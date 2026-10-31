import * as THREE from "three";
import { maps, type MapId, type GameMap, type Obstacle, type NPC } from "./maps";
import { CREATURES, getCreature, type Element, type Creature } from "./creatures";

const TILE = 32;
const WORLD_SCALE = 0.06;

type PlayerState = {
  x: number;
  y: number;
  dir: "up" | "down" | "left" | "right";
  moving: boolean;
};

type QuestState = {
  activeQuests: string[];
  completedQuests: string[];
};

type GameEvent3D =
  | { type: "map"; mapId: MapId; name: string; viaTeleport: boolean }
  | { type: "grass" }
  | { type: "dialogue"; text: string; npcName?: string }
  | { type: "hint"; text: string }
  | { type: "quest"; questId: string; npcName: string; intro: string; title: string }
  | { type: "quest_progress"; questId: string; npcName: string; text: string }
  | { type: "npc_name"; name: string };

export class Scene3D {
  private renderer: THREE.WebGLRenderer;
  private scene: THREE.Scene;
  private camera: THREE.OrthographicCamera;
  private clock: THREE.Clock;
  private rafId: number | null = null;
  private container: HTMLElement;

  private mapId: MapId;
  private map: GameMap;
  private player: PlayerState;
  private playerGroup: THREE.Group;
  private keys: Record<string, boolean> = {};
  private step = 0;
  private frame = 0;
  private grassZones: THREE.Mesh[] = [];
  private grassCooldown = 0;
  private activeNPC: NPC | null = null;
  private dialogueIndex = 0;
  private questState: QuestState = { activeQuests: [], completedQuests: [] };
  private onEvent: (e: GameEvent3D) => void;
  private onPositionChange?: (pos: { mapId: MapId; x: number; y: number }) => void;
  private npcGroups: THREE.Group[] = [];
  private obstacleGroups: THREE.Group[] = [];
  private particleSystem: THREE.Points | null = null;
  private wildCreatureGroups: THREE.Group[] = [];

  constructor(
    container: HTMLElement,
    onEvent: (e: GameEvent3D) => void,
    initial: { mapId: MapId; x: number; y: number },
    onPositionChange?: (pos: { mapId: MapId; x: number; y: number }) => void
  ) {
    this.container = container;
    this.onEvent = onEvent;
    this.onPositionChange = onPositionChange;
    this.mapId = initial.mapId;
    this.map = maps[this.mapId];
    this.player = { x: initial.x, y: initial.y, dir: "down", moving: false };

    const w = container.clientWidth;
    const h = container.clientHeight;

    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
    this.renderer.setSize(w, h);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    container.appendChild(this.renderer.domElement);

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(this.map.base);
    this.scene.fog = new THREE.Fog(this.map.base, 40, 120);

    const viewSize = 22;
    this.camera = new THREE.OrthographicCamera(
      -viewSize * (w / h), viewSize * (w / h),
      viewSize, -viewSize, 1, 200
    );
    this.camera.position.set(0, 50, 30);
    this.camera.lookAt(0, 0, 0);

    this.clock = new THREE.Clock();
    this.playerGroup = new THREE.Group();

    this.setupLighting();
    this.buildWorld();
    this.setupInput();
    this.updateCamera();
  }

  private setupLighting() {
    const ambient = new THREE.AmbientLight(0xffffff, 0.55);
    this.scene.add(ambient);

    const sun = new THREE.DirectionalLight(0xffe8c0, 0.9);
    sun.position.set(40, 80, 30);
    sun.castShadow = true;
    sun.shadow.camera.left = -60;
    sun.shadow.camera.right = 60;
    sun.shadow.camera.top = 60;
    sun.shadow.camera.bottom = -60;
    sun.shadow.camera.near = 1;
    sun.shadow.camera.far = 200;
    sun.shadow.mapSize.set(1024, 1024);
    this.scene.add(sun);

    const fill = new THREE.DirectionalLight(0xa0c0ff, 0.3);
    fill.position.set(-30, 40, -20);
    this.scene.add(fill);
  }

  private toWorld(x: number, y: number): [number, number] {
    return [(x - this.map.width / 2) * WORLD_SCALE, (y - this.map.height / 2) * WORLD_SCALE];
  }

  private buildWorld() {
    this.clearWorld();

    // Ground plane
    const gw = this.map.width * WORLD_SCALE;
    const gh = this.map.height * WORLD_SCALE;
    const groundGeo = new THREE.PlaneGeometry(gw, gh);
    const groundMat = new THREE.MeshStandardMaterial({ color: this.map.base, roughness: 0.9 });
    const ground = new THREE.Mesh(groundGeo, groundMat);
    ground.rotation.x = -Math.PI / 2;
    ground.receiveShadow = true;
    this.scene.add(ground);

    // Path / road
    const pathGeo = new THREE.PlaneGeometry(gw, 4 * WORLD_SCALE);
    const pathMat = new THREE.MeshStandardMaterial({ color: this.map.accent, roughness: 0.95 });
    const pathH = new THREE.Mesh(pathGeo, pathMat);
    const [, py] = this.toWorld(0, 560);
    pathH.rotation.x = -Math.PI / 2;
    pathH.position.set(0, 0.01, py);
    pathH.receiveShadow = true;
    this.scene.add(pathH);

    const pathV = new THREE.Mesh(new THREE.PlaneGeometry(4 * WORLD_SCALE, gh), pathMat);
    const [vx] = this.toWorld(850, 0);
    pathV.rotation.x = -Math.PI / 2;
    pathV.position.set(vx, 0.01, 0);
    pathV.receiveShadow = true;
    this.scene.add(pathV);

    // Grass zones
    this.grassZones = [];
    for (const zone of this.map.zones) {
      if (zone.type === "grass") {
        const zw = zone.w * WORLD_SCALE;
        const zh = zone.h * WORLD_SCALE;
        const gGeo = new THREE.PlaneGeometry(zw, zh);
        const gMat = new THREE.MeshStandardMaterial({ color: 0x3a7a3a, roughness: 0.85, transparent: true, opacity: 0.65 });
        const gMesh = new THREE.Mesh(gGeo, gMat);
        const [wx, wy] = this.toWorld(zone.x + zone.w / 2, zone.y + zone.h / 2);
        gMesh.rotation.x = -Math.PI / 2;
        gMesh.position.set(wx, 0.02, wy);
        gMesh.receiveShadow = true;
        this.scene.add(gMesh);
        this.grassZones.push(gMesh);

        // Grass blades
        for (let i = 0; i < 15; i++) {
          const blade = new THREE.Mesh(
            new THREE.ConeGeometry(0.15, 0.5, 4),
            new THREE.MeshStandardMaterial({ color: 0x4a9a4a })
          );
          const bx = wx + (Math.random() - 0.5) * zw;
          const bz = wy + (Math.random() - 0.5) * zh;
          blade.position.set(bx, 0.25, bz);
          blade.castShadow = true;
          this.scene.add(blade);
        }
      }
    }

    // Obstacles
    this.buildObstacles();
    // Wild creatures
    this.buildWildCreatures();
    // NPCs
    this.buildNPCs();
    // Player
    this.buildPlayer();
    // Ambient particles
    this.buildParticles();
  }

  private clearWorld() {
    while (this.scene.children.length > 0) {
      const child = this.scene.children[0];
      if (child instanceof THREE.Light) { this.scene.remove(child); continue; }
      this.scene.remove(child);
      this.disposeGroup(child);
    }
    this.obstacleGroups = [];
    this.npcGroups = [];
    this.wildCreatureGroups = [];
    this.grassZones = [];
    this.setupLighting();
  }

  private disposeGroup(obj: THREE.Object3D) {
    obj.traverse((child) => {
      if (child instanceof THREE.Mesh) {
        child.geometry?.dispose();
        if (Array.isArray(child.material)) child.material.forEach(m => m.dispose());
        else child.material?.dispose();
      }
    });
  }

  private buildObstacles() {
    for (const o of this.map.obstacles) {
      const group = this.createObstacle(o);
      if (group) {
        const [wx, wy] = this.toWorld(o.x + o.w / 2, o.y + o.h / 2);
        group.position.set(wx, 0, wy);
        this.scene.add(group);
        this.obstacleGroups.push(group);
      }
    }
  }

  private createObstacle(o: Obstacle): THREE.Group | null {
    const g = new THREE.Group();
    const s = WORLD_SCALE * TILE;
    const w = o.w * WORLD_SCALE;
    const h = o.h * WORLD_SCALE;

    switch (o.kind) {
      case "house": {
        const wallMat = new THREE.MeshStandardMaterial({ color: 0xcda878, roughness: 0.85 });
        const roofMat = new THREE.MeshStandardMaterial({ color: 0x8a4a3a, roughness: 0.8 });

        const walls = new THREE.Mesh(new THREE.BoxGeometry(w * 0.8, 2.2, h * 0.8), wallMat);
        walls.position.y = 1.1;
        walls.castShadow = true; walls.receiveShadow = true;
        g.add(walls);

        const roof = new THREE.Mesh(new THREE.ConeGeometry(Math.max(w, h) * 0.65, 1.8, 4), roofMat);
        roof.position.y = 3.1;
        roof.rotation.y = Math.PI / 4;
        roof.castShadow = true;
        g.add(roof);

        const doorMat = new THREE.MeshStandardMaterial({ color: 0x5a3a2a });
        const door = new THREE.Mesh(new THREE.BoxGeometry(0.6, 1.2, 0.1), doorMat);
        door.position.set(0, 0.6, h * 0.4 + 0.05);
        g.add(door);
        break;
      }
      case "tree": {
        const trunkMat = new THREE.MeshStandardMaterial({ color: 0x6b4a2a, roughness: 0.9 });
        const leafMat = new THREE.MeshStandardMaterial({
          color: this.mapId === "forest" ? 0x2a5b40 : 0x47865c,
          roughness: 0.8
        });
        const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.3, 2), trunkMat);
        trunk.position.y = 1; trunk.castShadow = true;
        g.add(trunk);
        const leaves = new THREE.Mesh(new THREE.DodecahedronGeometry(1.4, 0), leafMat);
        leaves.position.y = 3; leaves.castShadow = true;
        g.add(leaves);
        const leaves2 = new THREE.Mesh(new THREE.DodecahedronGeometry(1.0, 0), leafMat);
        leaves2.position.set(0.6, 3.5, 0.3); leaves2.castShadow = true;
        g.add(leaves2);
        break;
      }
      case "rock": {
        const mossy = this.mapId === "forest";
        const rockMat = new THREE.MeshStandardMaterial({
          color: mossy ? 0x6a8a7a : 0x889a92,
          roughness: 0.9, flatShading: true
        });
        const rock = new THREE.Mesh(new THREE.DodecahedronGeometry(0.9, 0), rockMat);
        rock.position.y = 0.7; rock.castShadow = true; rock.receiveShadow = true;
        rock.scale.set(1.2, 0.8, 1);
        g.add(rock);
        break;
      }
      case "fence": {
        const mat = new THREE.MeshStandardMaterial({ color: 0x9b7954, roughness: 0.85 });
        const post = new THREE.Mesh(new THREE.BoxGeometry(w, 0.6, 0.15), mat);
        post.position.y = 0.3; post.castShadow = true;
        g.add(post);
        for (let i = 0; i < 4; i++) {
          const p = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.8, 0.1), mat);
          p.position.set(-w / 2 + i * w / 3, 0.4, 0); p.castShadow = true;
          g.add(p);
        }
        break;
      }
      case "pond": {
        const waterMat = new THREE.MeshStandardMaterial({
          color: 0x3a7ab0, roughness: 0.2, metalness: 0.3,
          transparent: true, opacity: 0.85
        });
        const pond = new THREE.Mesh(new THREE.CircleGeometry(Math.max(w, h) * 0.45, 16), waterMat);
        pond.rotation.x = -Math.PI / 2; pond.position.y = 0.05;
        g.add(pond);
        break;
      }
      case "well": {
        const stoneMat = new THREE.MeshStandardMaterial({ color: 0x8a8a8a, roughness: 0.9 });
        const base = new THREE.Mesh(new THREE.CylinderGeometry(0.6, 0.7, 0.8, 8), stoneMat);
        base.position.y = 0.4; base.castShadow = true;
        g.add(base);
        const roof = new THREE.Mesh(new THREE.ConeGeometry(0.9, 0.8, 4), new THREE.MeshStandardMaterial({ color: 0x8a4a2a }));
        roof.position.y = 2; roof.rotation.y = Math.PI / 4; roof.castShadow = true;
        g.add(roof);
        break;
      }
      case "windmill": {
        const towerMat = new THREE.MeshStandardMaterial({ color: 0xa89070, roughness: 0.85 });
        const tower = new THREE.Mesh(new THREE.CylinderGeometry(0.4, 0.5, 3, 8), towerMat);
        tower.position.y = 1.5; tower.castShadow = true;
        g.add(tower);
        // Blades
        const bladeMat = new THREE.MeshStandardMaterial({ color: 0xe8e0d0 });
        for (let i = 0; i < 4; i++) {
          const blade = new THREE.Mesh(new THREE.BoxGeometry(0.2, 1.8, 0.05), bladeMat);
          blade.position.y = 2.8;
          blade.rotation.z = 0;
          const pivot = new THREE.Group();
          pivot.position.y = 2.8;
          blade.position.y = 1;
          pivot.add(blade);
          pivot.rotation.z = (i * Math.PI) / 2;
          g.add(pivot);
        }
        break;
      }
      case "lantern": {
        const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 1.5, 6),
          new THREE.MeshStandardMaterial({ color: 0x4a4a4a }));
        pole.position.y = 0.75;
        g.add(pole);
        const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.2, 8, 8),
          new THREE.MeshStandardMaterial({ color: 0xf5d878, emissive: 0xf5d878, emissiveIntensity: 0.5 }));
        lamp.position.y = 1.5;
        g.add(lamp);
        break;
      }
      case "flowers": {
        const colors = [0xe85858, 0xf5d878, 0xe880c0, 0x78c8f0];
        for (let i = 0; i < 6; i++) {
          const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.25, 4),
            new THREE.MeshStandardMaterial({ color: 0x3a8a3a }));
          stem.position.set((Math.random() - 0.5) * w, 0.12, (Math.random() - 0.5) * h);
          g.add(stem);
          const bloom = new THREE.Mesh(new THREE.SphereGeometry(0.08, 6, 6),
            new THREE.MeshStandardMaterial({ color: colors[i % colors.length] }));
          bloom.position.set(stem.position.x, 0.25, stem.position.z);
          g.add(bloom);
        }
        break;
      }
      case "mushroom": {
        const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.08, 0.3, 6),
          new THREE.MeshStandardMaterial({ color: 0xe8e0d0 }));
        stem.position.y = 0.15;
        g.add(stem);
        const cap = new THREE.Mesh(new THREE.SphereGeometry(0.22, 8, 6, 0, Math.PI * 2, 0, Math.PI / 2),
          new THREE.MeshStandardMaterial({ color: 0xd04040 }));
        cap.position.y = 0.3; cap.castShadow = true;
        g.add(cap);
        break;
      }
      case "log": {
        const logMat = new THREE.MeshStandardMaterial({ color: 0x7a5a3a, roughness: 0.9 });
        const log = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.2, w * 0.8, 8), logMat);
        log.rotation.z = Math.PI / 2;
        log.position.y = 0.2; log.castShadow = true;
        g.add(log);
        break;
      }
      case "sign": {
        const post = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.8, 0.08),
          new THREE.MeshStandardMaterial({ color: 0x7a5a3a }));
        post.position.y = 0.4;
        g.add(post);
        const board = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.3, 0.06),
          new THREE.MeshStandardMaterial({ color: 0x9a7a4a }));
        board.position.y = 0.8;
        g.add(board);
        break;
      }
      case "bush": {
        const bushMat = new THREE.MeshStandardMaterial({ color: 0x3a7a3a, roughness: 0.85 });
        const b1 = new THREE.Mesh(new THREE.SphereGeometry(0.35, 8, 6), bushMat);
        b1.position.set(-0.15, 0.3, 0); b1.castShadow = true;
        g.add(b1);
        const b2 = new THREE.Mesh(new THREE.SphereGeometry(0.3, 8, 6), bushMat);
        b2.position.set(0.15, 0.25, 0.1); b2.castShadow = true;
        g.add(b2);
        break;
      }
      case "stump": {
        const stumpMat = new THREE.MeshStandardMaterial({ color: 0x7a5a3a, roughness: 0.9 });
        const stump = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.35, 0.4, 8), stumpMat);
        stump.position.y = 0.2; stump.castShadow = true;
        g.add(stump);
        break;
      }
      case "crystal": {
        const crystalMat = new THREE.MeshStandardMaterial({
          color: 0x7acce0, emissive: 0x4a8ca0, emissiveIntensity: 0.4,
          roughness: 0.2, metalness: 0.3, transparent: true, opacity: 0.85
        });
        const crystal = new THREE.Mesh(new THREE.OctahedronGeometry(0.4, 0), crystalMat);
        crystal.position.y = 0.5; crystal.castShadow = true;
        g.add(crystal);
        const crystal2 = new THREE.Mesh(new THREE.OctahedronGeometry(0.2, 0), crystalMat);
        crystal2.position.set(0.2, 0.3, 0.15);
        g.add(crystal2);
        break;
      }
      case "tent": {
        const tentMat = new THREE.MeshStandardMaterial({ color: 0x4a7a5a, roughness: 0.85 });
        const tent = new THREE.Mesh(new THREE.ConeGeometry(0.8, 1.5, 4), tentMat);
        tent.position.y = 0.75; tent.rotation.y = Math.PI / 4; tent.castShadow = true;
        g.add(tent);
        break;
      }
      default:
        return null;
    }
    return g;
  }

  private buildWildCreatures() {
    const DARK: Record<Element, number> = {
      Fire: 0x8f3e32, Water: 0x245d85, Grass: 0x315f42, Electric: 0x80651e,
      Earth: 0x594d43, Ice: 0x3a7a96, Wind: 0x2d8a6a, Psychic: 0x6a4a8f,
      Bug: 0x4d6821, Dark: 0x2a2840, Ground: 0x6b4f30, Metal: 0x4a5862,
      Fairy: 0x9a4a3d, Poison: 0x2d7a93, Dragon: 0x6a4d8f
    };
    const POOLS: Record<string, string[]> = {
      town: ["flamara", "aquarion", "leafy", "voltix", "terran"],
      meadow: ["leafy", "buggo", "windrake", "emberfay", "marin", "frosty"],
      forest: ["buggo", "umbra", "mystic", "geo", "ironix", "lunara"]
    };
    const pool = (POOLS[this.map.id] || CREATURES.map(x => x.id)).map(id => getCreature(id));

    let zi = 0;
    for (const zone of this.map.zones.filter(z => z.type === "grass")) {
      for (let i = 0; i < 3; i++) {
        const cr = pool[(zi * 3 + i) % pool.length];
        const group = this.createCreatureModel(cr, DARK[cr.element]);
        const x = zone.x + zone.w * (0.22 + i * 0.27);
        const y = zone.y + zone.h * (i % 2 === 0 ? 0.38 : 0.68);
        const [wx, wy] = this.toWorld(x, y);
        group.position.set(wx, 0, wy);
        group.userData = { baseY: 0, phase: i * 1.5, creature: cr };
        this.scene.add(group);
        this.wildCreatureGroups.push(group);
      }
      zi++;
    }
  }

  private createCreatureModel(cr: Creature, darkColor: number): THREE.Group {
    return this.createModernCreatureModel(cr, darkColor);

    const g = new THREE.Group();
    const S = 1.6; // scale up creatures for visibility
    const bodyMat = new THREE.MeshStandardMaterial({ color: cr.color, roughness: 0.5, metalness: 0.1 });
    const accentMat = new THREE.MeshStandardMaterial({ color: cr.accent, roughness: 0.4, metalness: 0.1, emissive: cr.accent, emissiveIntensity: 0.05 });
    const darkMat = new THREE.MeshStandardMaterial({ color: darkColor, roughness: 0.6 });
    const eyeWhiteMat = new THREE.MeshStandardMaterial({ color: 0xfff8e8, roughness: 0.3 });
    const eyeMat = new THREE.MeshStandardMaterial({ color: 0x1a1a2a, roughness: 0.2 });
    const glowMat = new THREE.MeshStandardMaterial({ color: cr.accent, emissive: cr.accent, emissiveIntensity: 0.5, transparent: true, opacity: 0.75 });

    const creatureId = cr.id;
    const bodyGeometry: THREE.BufferGeometry = creatureId === "terran" || creatureId === "ironix"
      ? new THREE.DodecahedronGeometry(0.5 * S, 1)
      : creatureId === "marin"
        ? new THREE.SphereGeometry(0.42 * S, 18, 12)
        : creatureId === "geo"
          ? new THREE.SphereGeometry(0.46 * S, 14, 10)
          : new THREE.SphereGeometry(0.45 * S, 16, 12);
    const body = new THREE.Mesh(bodyGeometry, bodyMat);
    body.position.y = 0.7 * S; body.scale.set(
      creatureId === "aquarion" ? 1.15 : creatureId === "terran" ? 1.2 : creatureId === "marin" ? 0.9 : 1,
      creatureId === "ironix" ? 1.15 : creatureId === "marin" ? 1.2 : 0.9,
      creatureId === "windrake" || creatureId === "lunara" ? 0.85 : 1
    ); body.castShadow = true;
    g.add(body);

    // Belly patch
    const belly = new THREE.Mesh(new THREE.SphereGeometry(0.3 * S, 12, 10), accentMat);
    belly.position.set(0, 0.6 * S, 0.18 * S); belly.scale.set(1, 0.8, 0.6);
    g.add(belly);

    const el = cr.element;

    // Head — separate, with larger silhouettes for the biped and dragon-like species
    const headGeometry: THREE.BufferGeometry = creatureId === "ironix"
      ? new THREE.SphereGeometry(0.36 * S, 14, 10)
      : creatureId === "frosty" || creatureId === "mystic"
        ? new THREE.SphereGeometry(0.34 * S, 16, 12)
        : new THREE.SphereGeometry(0.32 * S, 14, 12);
    const head = new THREE.Mesh(headGeometry, bodyMat);
    head.position.set(0, creatureId === "marin" ? 1.08 * S : 1.15 * S, 0.05 * S); head.castShadow = true;
    g.add(head);

    // Snout / muzzle
    const muzzle = new THREE.Mesh(new THREE.SphereGeometry(0.16 * S, 10, 8), accentMat);
    muzzle.position.set(0, 1.05 * S, 0.32 * S); muzzle.scale.set(1, 0.6, 0.8);
    g.add(muzzle);

    // Nose
    const nose = new THREE.Mesh(new THREE.SphereGeometry(0.04 * S, 6, 6), darkMat);
    nose.position.set(0, 1.08 * S, 0.44 * S);
    g.add(nose);

    // Eyes — white + pupil for cuteness
    const eyeWhiteL = new THREE.Mesh(new THREE.SphereGeometry(0.09 * S, 8, 8), eyeWhiteMat);
    eyeWhiteL.position.set(-0.14 * S, 1.22 * S, 0.26 * S); g.add(eyeWhiteL);
    const eyeWhiteR = eyeWhiteL.clone(); eyeWhiteR.position.x = 0.14 * S; g.add(eyeWhiteR);
    const pupilL = new THREE.Mesh(new THREE.SphereGeometry(0.045 * S, 6, 6), eyeMat);
    pupilL.position.set(-0.14 * S, 1.22 * S, 0.33 * S); g.add(pupilL);
    const pupilR = pupilL.clone(); pupilR.position.x = 0.14 * S; g.add(pupilR);
    // Eye shine
    const shineMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
    const shineL = new THREE.Mesh(new THREE.SphereGeometry(0.015 * S, 4, 4), shineMat);
    shineL.position.set(-0.12 * S, 1.25 * S, 0.37 * S); g.add(shineL);
    const shineR = shineL.clone(); shineR.position.x = 0.16 * S; g.add(shineR);

    // Ears / crest / horns — unique per element group
    if (el === "Fire") {
      // Pointed fox ears + flame on head
      const earL = new THREE.Mesh(new THREE.ConeGeometry(0.1 * S, 0.35 * S, 5), bodyMat);
      earL.position.set(-0.18 * S, 1.45 * S, 0); earL.rotation.z = 0.25; earL.castShadow = true; g.add(earL);
      const earR = earL.clone(); earR.position.x = 0.18 * S; earR.rotation.z = -0.25; g.add(earR);
      // Flame on head
      const flame = new THREE.Mesh(new THREE.ConeGeometry(0.12 * S, 0.4 * S, 6), glowMat);
      flame.position.set(0, 1.65 * S, 0); g.add(flame);
      // Tail — fire
      const tail = new THREE.Mesh(new THREE.ConeGeometry(0.14 * S, 0.5 * S, 6), glowMat);
      tail.position.set(0, 0.6 * S, -0.4 * S); tail.rotation.x = -0.6; g.add(tail);
    } else if (el === "Water") {
      // Fin ears + water tail
      const finL = new THREE.Mesh(new THREE.ConeGeometry(0.1 * S, 0.3 * S, 4), accentMat);
      finL.position.set(-0.2 * S, 1.4 * S, 0); finL.rotation.z = 0.3; g.add(finL);
      const finR = finL.clone(); finR.position.x = 0.2 * S; finR.rotation.z = -0.3; g.add(finR);
      // Water droplet on head
      const drop = new THREE.Mesh(new THREE.SphereGeometry(0.1 * S, 8, 8), glowMat);
      drop.position.set(0, 1.55 * S, 0); drop.scale.y = 1.3; g.add(drop);
      // Tail fin
      const tail = new THREE.Mesh(new THREE.ConeGeometry(0.16 * S, 0.4 * S, 6), accentMat);
      tail.position.set(0, 0.5 * S, -0.45 * S); tail.rotation.x = Math.PI / 2; g.add(tail);
    } else if (el === "Grass") {
      // Leaf ears + leaf on head
      const earL = new THREE.Mesh(new THREE.ConeGeometry(0.09 * S, 0.4 * S, 5), accentMat);
      earL.position.set(-0.16 * S, 1.45 * S, 0); earL.rotation.z = 0.2; g.add(earL);
      const earR = earL.clone(); earR.position.x = 0.16 * S; earR.rotation.z = -0.2; g.add(earR);
      // Big leaf on top
      const leaf = new THREE.Mesh(new THREE.ConeGeometry(0.15 * S, 0.5 * S, 5), new THREE.MeshStandardMaterial({ color: 0x4a9a4a, roughness: 0.5 }));
      leaf.position.set(0, 1.75 * S, 0); g.add(leaf);
      // Vine tail
      const tail = new THREE.Mesh(new THREE.CylinderGeometry(0.04 * S, 0.06 * S, 0.4 * S, 6), new THREE.MeshStandardMaterial({ color: 0x3a8a3a }));
      tail.position.set(0, 0.5 * S, -0.35 * S); tail.rotation.x = 0.5; g.add(tail);
    } else if (el === "Electric") {
      // Lightning bolt ears + spark on head
      const earL = new THREE.Mesh(new THREE.ConeGeometry(0.08 * S, 0.3 * S, 4), bodyMat);
      earL.position.set(-0.18 * S, 1.4 * S, 0); earL.rotation.z = 0.3; g.add(earL);
      const earR = earL.clone(); earR.position.x = 0.18 * S; earR.rotation.z = -0.3; g.add(earR);
      // Spark on top
      const spark = new THREE.Mesh(new THREE.OctahedronGeometry(0.12 * S, 0), glowMat);
      spark.position.set(0, 1.6 * S, 0); spark.rotation.y = Math.PI / 4; g.add(spark);
      // Lightning tail
      const tail = new THREE.Mesh(new THREE.ConeGeometry(0.1 * S, 0.35 * S, 4), glowMat);
      tail.position.set(0, 0.55 * S, -0.38 * S); tail.rotation.x = -0.5; g.add(tail);
    } else if (el === "Earth" || el === "Ground") {
      // Sturdy ears + rock on back
      const earL = new THREE.Mesh(new THREE.SphereGeometry(0.1 * S, 6, 6), bodyMat);
      earL.position.set(-0.2 * S, 1.38 * S, 0); g.add(earL);
      const earR = earL.clone(); earR.position.x = 0.2 * S; g.add(earR);
      // Rock hump
      const hump = new THREE.Mesh(new THREE.DodecahedronGeometry(0.2 * S, 0), new THREE.MeshStandardMaterial({ color: 0x8a7a5a, roughness: 0.9, flatShading: true }));
      hump.position.set(0, 0.95 * S, -0.2 * S); hump.castShadow = true; g.add(hump);
    } else if (el === "Ice") {
      // Ice crystal horn + frost ears
      const earL = new THREE.Mesh(new THREE.ConeGeometry(0.09 * S, 0.25 * S, 5), accentMat);
      earL.position.set(-0.18 * S, 1.4 * S, 0); earL.rotation.z = 0.25; g.add(earL);
      const earR = earL.clone(); earR.position.x = 0.18 * S; earR.rotation.z = -0.25; g.add(earR);
      // Ice horn
      const horn = new THREE.Mesh(new THREE.ConeGeometry(0.07 * S, 0.35 * S, 6), glowMat);
      horn.position.set(0, 1.6 * S, 0); g.add(horn);
      // Ice shards on back
      for (let i = 0; i < 3; i++) {
        const shard = new THREE.Mesh(new THREE.ConeGeometry(0.05 * S, 0.15 * S, 4), glowMat);
        shard.position.set((i - 1) * 0.1 * S, 1.0 * S, -0.3 * S); g.add(shard);
      }
    } else if (el === "Wind") {
      // Wing ears + air swirl
      const wingL = new THREE.Mesh(new THREE.ConeGeometry(0.12 * S, 0.35 * S, 4), accentMat);
      wingL.position.set(-0.22 * S, 1.35 * S, 0); wingL.rotation.z = 0.4; g.add(wingL);
      const wingR = wingL.clone(); wingR.position.x = 0.22 * S; wingR.rotation.z = -0.4; g.add(wingR);
      // Swirl on top
      const swirl = new THREE.Mesh(new THREE.TorusGeometry(0.1 * S, 0.03 * S, 6, 12), glowMat);
      swirl.position.set(0, 1.55 * S, 0); swirl.rotation.x = Math.PI / 2; g.add(swirl);
      // Wing tail
      const tail = new THREE.Mesh(new THREE.ConeGeometry(0.12 * S, 0.3 * S, 4), accentMat);
      tail.position.set(0, 0.55 * S, -0.38 * S); tail.rotation.x = -0.4; g.add(tail);
    } else if (el === "Psychic") {
      // Antenna-like ears + glowing orb
      const antL = new THREE.Mesh(new THREE.CylinderGeometry(0.02 * S, 0.03 * S, 0.3 * S, 5), bodyMat);
      antL.position.set(-0.12 * S, 1.5 * S, 0); antL.rotation.z = 0.15; g.add(antL);
      const orbL = new THREE.Mesh(new THREE.SphereGeometry(0.05 * S, 8, 8), glowMat);
      orbL.position.set(-0.15 * S, 1.68 * S, 0); g.add(orbL);
      const antR = antL.clone(); antR.position.x = 0.12 * S; antR.rotation.z = -0.15; g.add(antR);
      const orbR = orbL.clone(); orbR.position.x = 0.15 * S; g.add(orbR);
      // Third eye glow
      const thirdEye = new THREE.Mesh(new THREE.SphereGeometry(0.04 * S, 6, 6), glowMat);
      thirdEye.position.set(0, 1.3 * S, 0.3 * S); g.add(thirdEye);
    } else if (el === "Bug") {
      // Antennae + wing shells
      const antL = new THREE.Mesh(new THREE.CylinderGeometry(0.02 * S, 0.04 * S, 0.35 * S, 5), darkMat);
      antL.position.set(-0.1 * S, 1.5 * S, 0.05 * S); antL.rotation.z = 0.1; g.add(antL);
      const antR = antL.clone(); antR.position.x = 0.1 * S; antR.rotation.z = -0.1; g.add(antR);
      // Wing shells on back
      const shellL = new THREE.Mesh(new THREE.SphereGeometry(0.15 * S, 8, 6), bodyMat);
      shellL.position.set(-0.15 * S, 0.85 * S, -0.3 * S); shellL.scale.set(1, 0.5, 0.8); g.add(shellL);
      const shellR = shellL.clone(); shellR.position.x = 0.15 * S; g.add(shellR);
    } else if (el === "Dark") {
      // Horned ears + shadow aura
      const earL = new THREE.Mesh(new THREE.ConeGeometry(0.1 * S, 0.3 * S, 4), darkMat);
      earL.position.set(-0.18 * S, 1.4 * S, 0); earL.rotation.z = 0.2; g.add(earL);
      const earR = earL.clone(); earR.position.x = 0.18 * S; earR.rotation.z = -0.2; g.add(earR);
      // Shadow orb
      const orb = new THREE.Mesh(new THREE.SphereGeometry(0.08 * S, 8, 8), new THREE.MeshStandardMaterial({ color: 0x6a4a8f, emissive: 0x4a2a6f, emissiveIntensity: 0.4 }));
      orb.position.set(0, 1.55 * S, 0); g.add(orb);
      // Dark tail
      const tail = new THREE.Mesh(new THREE.ConeGeometry(0.1 * S, 0.45 * S, 6), darkMat);
      tail.position.set(0, 0.55 * S, -0.4 * S); tail.rotation.x = -0.5; g.add(tail);
    } else if (el === "Metal") {
      // Metallic ears + steel plate
      const metalMat = new THREE.MeshStandardMaterial({ color: 0xa8b0b8, roughness: 0.3, metalness: 0.7 });
      const earL = new THREE.Mesh(new THREE.BoxGeometry(0.1 * S, 0.2 * S, 0.1 * S), metalMat);
      earL.position.set(-0.18 * S, 1.38 * S, 0); g.add(earL);
      const earR = earL.clone(); earR.position.x = 0.18 * S; g.add(earR);
      // Steel horn
      const horn = new THREE.Mesh(new THREE.ConeGeometry(0.08 * S, 0.3 * S, 6), metalMat);
      horn.position.set(0, 1.6 * S, 0); g.add(horn);
      // Armor plate on back
      const plate = new THREE.Mesh(new THREE.BoxGeometry(0.4 * S, 0.15 * S, 0.3 * S), metalMat);
      plate.position.set(0, 0.9 * S, -0.25 * S); g.add(plate);
    } else if (el === "Fairy") {
      // Heart-shaped ears + fairy wings
      const earL = new THREE.Mesh(new THREE.SphereGeometry(0.1 * S, 6, 6), accentMat);
      earL.position.set(-0.2 * S, 1.38 * S, 0); earL.scale.y = 1.3; g.add(earL);
      const earR = earL.clone(); earR.position.x = 0.2 * S; g.add(earR);
      // Fairy wings
      const wingMat = new THREE.MeshStandardMaterial({ color: 0xffd0e0, transparent: true, opacity: 0.6, emissive: 0xff80a0, emissiveIntensity: 0.2 });
      const wingL = new THREE.Mesh(new THREE.SphereGeometry(0.2 * S, 8, 6), wingMat);
      wingL.position.set(-0.3 * S, 1.0 * S, -0.2 * S); wingL.scale.set(0.8, 1.2, 0.3); g.add(wingL);
      const wingR = wingL.clone(); wingR.position.x = 0.3 * S; g.add(wingR);
      // Star on top
      const star = new THREE.Mesh(new THREE.OctahedronGeometry(0.1 * S, 0), glowMat);
      star.position.set(0, 1.6 * S, 0); g.add(star);
    } else if (el === "Poison") {
      // Droopy ears + toxic bubbles
      const earL = new THREE.Mesh(new THREE.SphereGeometry(0.1 * S, 8, 8), accentMat);
      earL.position.set(-0.2 * S, 1.3 * S, 0); earL.scale.y = 0.7; g.add(earL);
      const earR = earL.clone(); earR.position.x = 0.2 * S; g.add(earR);
      // Toxic bubbles on head
      for (let i = 0; i < 3; i++) {
        const bub = new THREE.Mesh(new THREE.SphereGeometry(0.04 * S + i * 0.01 * S, 6, 6), glowMat);
        bub.position.set((i - 1) * 0.08 * S, 1.5 * S + i * 0.05 * S, 0.1 * S); g.add(bub);
      }
      // Dripping tail
      const tail = new THREE.Mesh(new THREE.SphereGeometry(0.1 * S, 8, 8), glowMat);
      tail.position.set(0, 0.5 * S, -0.35 * S); tail.scale.y = 1.5; g.add(tail);
    } else if (el === "Dragon") {
      // Horned ears + dragon wings
      const hornL = new THREE.Mesh(new THREE.ConeGeometry(0.06 * S, 0.4 * S, 5), darkMat);
      hornL.position.set(-0.12 * S, 1.55 * S, 0); hornL.rotation.z = 0.1; g.add(hornL);
      const hornR = hornL.clone(); hornR.position.x = 0.12 * S; hornR.rotation.z = -0.1; g.add(hornR);
      // Dragon wings
      const wingMat = new THREE.MeshStandardMaterial({ color: cr.color, roughness: 0.4, side: THREE.DoubleSide });
      const wingL = new THREE.Mesh(new THREE.ConeGeometry(0.25 * S, 0.4 * S, 4), wingMat);
      wingL.position.set(-0.3 * S, 1.1 * S, -0.2 * S); wingL.rotation.z = 0.5; wingL.rotation.y = 0.3; g.add(wingL);
      const wingR = wingL.clone(); wingR.position.x = 0.3 * S; wingR.rotation.z = -0.5; wingR.rotation.y = -0.3; g.add(wingR);
      // Dragon tail
      const tail = new THREE.Mesh(new THREE.ConeGeometry(0.1 * S, 0.6 * S, 6), bodyMat);
      tail.position.set(0, 0.5 * S, -0.5 * S); tail.rotation.x = -0.6; g.add(tail);
      const tailTip = new THREE.Mesh(new THREE.ConeGeometry(0.15 * S, 0.2 * S, 6), glowMat);
      tailTip.position.set(0, 0.3 * S, -0.75 * S); tailTip.rotation.x = -0.6; g.add(tailTip);
    } else {
      // Default — round ears
      const earL = new THREE.Mesh(new THREE.SphereGeometry(0.1 * S, 8, 8), bodyMat);
      earL.position.set(-0.2 * S, 1.35 * S, 0); g.add(earL);
      const earR = earL.clone(); earR.position.x = 0.2 * S; g.add(earR);
    }

    // Arms / front legs
    const armMat = bodyMat;
    const armL = new THREE.Mesh(new THREE.SphereGeometry(0.12 * S, 8, 8), armMat);
    armL.position.set(-0.3 * S, 0.45 * S, 0.15 * S); armL.scale.set(1, 0.7, 1); armL.castShadow = true; g.add(armL);
    const armR = armL.clone(); armR.position.x = 0.3 * S; g.add(armR);
    // Paw pads
    const pawL = new THREE.Mesh(new THREE.SphereGeometry(0.06 * S, 6, 6), darkMat);
    pawL.position.set(-0.3 * S, 0.2 * S, 0.2 * S); g.add(pawL);
    const pawR = pawL.clone(); pawR.position.x = 0.3 * S; g.add(pawR);

    // Back legs
    const legL = new THREE.Mesh(new THREE.SphereGeometry(0.14 * S, 8, 8), bodyMat);
    legL.position.set(-0.2 * S, 0.3 * S, -0.15 * S); legL.scale.set(1, 0.8, 1); legL.castShadow = true; g.add(legL);
    const legR = legL.clone(); legR.position.x = 0.2 * S; g.add(legR);
    const footL = new THREE.Mesh(new THREE.SphereGeometry(0.07 * S, 6, 6), darkMat);
    footL.position.set(-0.2 * S, 0.12 * S, -0.1 * S); g.add(footL);
    const footR = footL.clone(); footR.position.x = 0.2 * S; g.add(footR);

    // Signature silhouettes make every species readable at a glance
    if (creatureId === "aquarion") {
      const shellMat = new THREE.MeshStandardMaterial({ color: 0x4b7898, roughness: 0.7 });
      const shell = new THREE.Mesh(new THREE.SphereGeometry(0.3 * S, 12, 8), shellMat);
      shell.position.set(0, 0.72 * S, -0.34 * S); shell.scale.set(1.15, 1, 0.45); shell.castShadow = true; g.add(shell);
      const shellStripe = new THREE.Mesh(new THREE.TorusGeometry(0.15 * S, 0.025 * S, 6, 12), accentMat);
      shellStripe.position.set(0, 0.72 * S, -0.51 * S); shellStripe.rotation.x = Math.PI / 2; g.add(shellStripe);
    } else if (creatureId === "leafy") {
      const leafMat = new THREE.MeshStandardMaterial({ color: 0x5ca34d, roughness: 0.7 });
      const leafBack = new THREE.Mesh(new THREE.SphereGeometry(0.3 * S, 8, 6), leafMat);
      leafBack.position.set(0, 0.95 * S, -0.3 * S); leafBack.scale.set(0.7, 1.35, 0.25); leafBack.rotation.x = -0.35; g.add(leafBack);
      const flower = new THREE.Mesh(new THREE.ConeGeometry(0.18 * S, 0.1 * S, 6), accentMat);
      flower.position.set(0, 1.55 * S, 0.08 * S); flower.rotation.x = Math.PI; g.add(flower);
    } else if (creatureId === "voltix") {
      const boltMat = new THREE.MeshStandardMaterial({ color: 0xf4ca35, emissive: 0xa87516, emissiveIntensity: 0.15 });
      const cheekL = new THREE.Mesh(new THREE.ConeGeometry(0.09 * S, 0.16 * S, 4), boltMat);
      cheekL.position.set(-0.31 * S, 1.08 * S, 0.22 * S); cheekL.rotation.z = Math.PI / 2; g.add(cheekL);
      const cheekR = cheekL.clone(); cheekR.position.x = 0.31 * S; cheekR.rotation.z = -Math.PI / 2; g.add(cheekR);
    } else if (creatureId === "frosty") {
      const wingMat = new THREE.MeshStandardMaterial({ color: 0xbceeff, roughness: 0.55, transparent: true, opacity: 0.9, side: THREE.DoubleSide });
      const wingL = new THREE.Mesh(new THREE.SphereGeometry(0.28 * S, 10, 8), wingMat);
      wingL.position.set(-0.35 * S, 0.75 * S, -0.08 * S); wingL.scale.set(0.55, 1.3, 0.3); wingL.rotation.z = -0.35; g.add(wingL);
      const wingR = wingL.clone(); wingR.position.x = 0.35 * S; wingR.rotation.z = 0.35; g.add(wingR);
      const beak = new THREE.Mesh(new THREE.ConeGeometry(0.08 * S, 0.2 * S, 4), glowMat);
      beak.position.set(0, 1.08 * S, 0.45 * S); beak.rotation.x = Math.PI / 2; g.add(beak);
    } else if (creatureId === "mystic" || creatureId === "umbra") {
      const tailMat = creatureId === "mystic" ? accentMat : darkMat;
      const tailBase = new THREE.Mesh(new THREE.CylinderGeometry(0.1 * S, 0.16 * S, 0.7 * S, 8), tailMat);
      tailBase.position.set(0.35 * S, 0.55 * S, -0.35 * S); tailBase.rotation.z = -0.75; tailBase.castShadow = true; g.add(tailBase);
      const tailTip = new THREE.Mesh(new THREE.SphereGeometry(0.16 * S, 8, 6), tailMat);
      tailTip.position.set(0.72 * S, 0.82 * S, -0.36 * S); g.add(tailTip);
    } else if (creatureId === "buggo") {
      const wingMat = new THREE.MeshStandardMaterial({ color: 0xe4f5a0, transparent: true, opacity: 0.7, side: THREE.DoubleSide });
      const wingL = new THREE.Mesh(new THREE.SphereGeometry(0.27 * S, 10, 8), wingMat);
      wingL.position.set(-0.28 * S, 0.9 * S, -0.23 * S); wingL.scale.set(0.7, 1.2, 0.2); wingL.rotation.z = -0.3; g.add(wingL);
      const wingR = wingL.clone(); wingR.position.x = 0.28 * S; wingR.rotation.z = 0.3; g.add(wingR);
      const stripe = new THREE.Mesh(new THREE.BoxGeometry(0.06 * S, 0.55 * S, 0.5 * S), darkMat);
      stripe.position.set(0, 0.75 * S, -0.35 * S); g.add(stripe);
    } else if (creatureId === "geo") {
      const snout = new THREE.Mesh(new THREE.ConeGeometry(0.16 * S, 0.35 * S, 8), accentMat);
      snout.position.set(0, 1.02 * S, 0.42 * S); snout.rotation.x = Math.PI / 2; g.add(snout);
      const clawMat = new THREE.MeshStandardMaterial({ color: 0x6e5138, roughness: 0.8 });
      for (const x of [-0.3, 0.3]) {
        const claw = new THREE.Mesh(new THREE.ConeGeometry(0.06 * S, 0.22 * S, 5), clawMat);
        claw.position.set(x * S, 0.2 * S, 0.25 * S); claw.rotation.x = Math.PI / 2; g.add(claw);
      }
    } else if (creatureId === "marin") {
      const tentacleMat = new THREE.MeshStandardMaterial({ color: 0x4faec8, roughness: 0.45, emissive: 0x164d62, emissiveIntensity: 0.1 });
      for (let i = 0; i < 6; i++) {
        const tentacle = new THREE.Mesh(new THREE.CylinderGeometry(0.035 * S, 0.07 * S, 0.55 * S, 7), tentacleMat);
        tentacle.position.set((i - 2.5) * 0.12 * S, 0.25 * S, 0.02 * S); tentacle.rotation.z = (i - 2.5) * 0.16; g.add(tentacle);
      }
      const bell = new THREE.Mesh(new THREE.SphereGeometry(0.48 * S, 16, 10, 0, Math.PI * 2, 0, Math.PI * 0.6), bodyMat);
      bell.position.set(0, 0.95 * S, 0); bell.scale.y = 0.8; g.add(bell);
    } else if (creatureId === "ironix") {
      const hornMat = new THREE.MeshStandardMaterial({ color: 0xdbe5ed, roughness: 0.25, metalness: 0.8 });
      const horn = new THREE.Mesh(new THREE.ConeGeometry(0.14 * S, 0.55 * S, 6), hornMat);
      horn.position.set(0, 1.18 * S, 0.42 * S); horn.rotation.x = Math.PI / 2; horn.castShadow = true; g.add(horn);
      const shoulderL = new THREE.Mesh(new THREE.DodecahedronGeometry(0.2 * S, 0), hornMat);
      shoulderL.position.set(-0.38 * S, 0.8 * S, 0); g.add(shoulderL);
      const shoulderR = shoulderL.clone(); shoulderR.position.x = 0.38 * S; g.add(shoulderR);
    } else if (creatureId === "emberfay") {
      const featherMat = new THREE.MeshStandardMaterial({ color: 0xffb45e, roughness: 0.45, emissive: 0x9d3b26, emissiveIntensity: 0.15, side: THREE.DoubleSide });
      for (const x of [-0.34, 0.34]) {
        const wing = new THREE.Mesh(new THREE.ConeGeometry(0.25 * S, 0.7 * S, 5), featherMat);
        wing.position.set(x * S, 1.0 * S, -0.16 * S); wing.rotation.z = x < 0 ? -0.7 : 0.7; wing.rotation.y = x < 0 ? -0.25 : 0.25; g.add(wing);
      }
      const plume = new THREE.Mesh(new THREE.ConeGeometry(0.16 * S, 0.55 * S, 6), glowMat);
      plume.position.set(0, 0.45 * S, -0.5 * S); plume.rotation.x = -0.7; g.add(plume);
    }

    // Elemental aura glow around body
    const auraMat = new THREE.MeshBasicMaterial({ color: cr.accent, transparent: true, opacity: 0.12, side: THREE.BackSide });
    const aura = new THREE.Mesh(new THREE.SphereGeometry(0.6 * S, 12, 10), auraMat);
    aura.position.y = 0.7 * S;
    g.add(aura);

    return g;
  }

  private createModernCreatureModel(cr: Creature, darkColor: number): THREE.Group {
    const g = new THREE.Group();
    const S = 1.7;
    const bodyMat = new THREE.MeshStandardMaterial({ color: cr.color, roughness: 0.48, metalness: cr.id === "ironix" ? 0.65 : 0.05 });
    const accentMat = new THREE.MeshStandardMaterial({ color: cr.accent, roughness: 0.38, emissive: cr.accent, emissiveIntensity: 0.08 });
    const darkMat = new THREE.MeshStandardMaterial({ color: darkColor, roughness: 0.62 });
    const glowMat = new THREE.MeshStandardMaterial({ color: cr.accent, emissive: cr.accent, emissiveIntensity: 0.65 });
    const eyeWhite = new THREE.MeshStandardMaterial({ color: 0xfff9df, roughness: 0.2 });
    const eyeDark = new THREE.MeshStandardMaterial({ color: 0x121826, roughness: 0.2 });
    const wingMat = new THREE.MeshStandardMaterial({ color: cr.accent, roughness: 0.35, transparent: true, opacity: 0.86, side: THREE.DoubleSide });

    const addSphere = (radius: number, position: [number, number, number], material: THREE.Material, scale: [number, number, number] = [1, 1, 1]): THREE.Mesh => {
      const item = new THREE.Mesh(new THREE.SphereGeometry(radius * S, 14, 10), material);
      item.position.set(position[0] * S, position[1] * S, position[2] * S); item.scale.set(...scale); item.castShadow = true; g.add(item); return item;
    };
    const addCone = (radius: number, height: number, position: [number, number, number], material: THREE.Material, rotation: [number, number, number] = [0, 0, 0]): THREE.Mesh => {
      const item = new THREE.Mesh(new THREE.ConeGeometry(radius * S, height * S, 6), material);
      item.position.set(position[0] * S, position[1] * S, position[2] * S); item.rotation.set(...rotation); item.castShadow = true; g.add(item); return item;
    };
    const addBox = (size: [number, number, number], position: [number, number, number], material: THREE.Material, rotation: [number, number, number] = [0, 0, 0]): THREE.Mesh => {
      const item = new THREE.Mesh(new THREE.BoxGeometry(size[0] * S, size[1] * S, size[2] * S), material);
      item.position.set(position[0] * S, position[1] * S, position[2] * S); item.rotation.set(...rotation); item.castShadow = true; g.add(item); return item;
    };
    const addEyes = (y = 1.08, z = 0.28, size = 0.08) => {
      for (const x of [-0.13, 0.13]) {
        addSphere(size, [x, y, z], eyeWhite);
        addSphere(size * 0.48, [x, y, z + 0.06], eyeDark);
      }
    };
    const addTail = (position: [number, number, number], material: THREE.Material, size = 0.42) => {
      addCone(size * 0.28, size, position, material, [-0.65, 0, 0]);
    };
    const addLegs = (wide = 0.24, y = 0.28) => {
      for (const x of [-wide, wide]) {
        addSphere(0.15, [x, y, 0.04], darkMat, [1, 1.2, 1]);
        addSphere(0.11, [x, 0.1, 0.16], darkMat, [1.2, 0.65, 1.4]);
      }
    };

    switch (cr.id) {
      case "flamara": {
        addSphere(0.5, [0, 0.62, 0], bodyMat, [1.15, 0.9, 0.9]);
        addSphere(0.34, [0, 1.12, 0.04], bodyMat);
        addSphere(0.17, [0, 1.02, 0.3], accentMat, [1, 0.65, 0.7]);
        addEyes(1.17, 0.29, 0.075); addLegs(0.25);
        for (const x of [-0.18, 0.18]) addCone(0.12, 0.42, [x, 1.48, 0], bodyMat, [0, 0, x < 0 ? 0.25 : -0.25]);
        addCone(0.17, 0.55, [0, 1.75, -0.02], glowMat);
        addTail([0, 0.7, -0.43], glowMat, 0.8); break;
      }
      case "aquarion": {
        addSphere(0.52, [0, 0.65, 0], bodyMat, [1.15, 0.95, 1]);
        addSphere(0.35, [0, 1.15, 0.03], bodyMat); addSphere(0.18, [0, 1.06, 0.31], accentMat, [1, 0.7, 0.7]);
        addEyes(1.2, 0.3, 0.085); addLegs(0.28);
        addSphere(0.32, [0, 0.8, -0.36], darkMat, [1.15, 1, 0.38]);
        for (const x of [-0.22, 0.22]) addCone(0.1, 0.32, [x, 1.5, 0], accentMat, [0, 0, x < 0 ? 0.35 : -0.35]);
        addTail([0, 0.62, -0.48], accentMat, 0.6); break;
      }
      case "leafy": {
        addSphere(0.43, [0, 0.67, 0], bodyMat, [1, 1.05, 0.9]); addSphere(0.32, [0, 1.16, 0.04], bodyMat);
        addSphere(0.17, [0, 1.05, 0.3], accentMat, [1, 0.65, 0.7]); addEyes(1.21, 0.29, 0.07); addLegs(0.24);
        for (const x of [-0.18, 0.18]) addCone(0.1, 0.48, [x, 1.52, 0], accentMat, [0, 0, x < 0 ? 0.18 : -0.18]);
        addSphere(0.3, [0, 1.03, -0.3], accentMat, [0.6, 1.35, 0.25]); addCone(0.16, 0.45, [0, 1.78, 0], accentMat); addTail([0, 0.62, -0.43], accentMat, 0.65); break;
      }
      case "voltix": {
        addSphere(0.43, [0, 0.67, 0], bodyMat, [1.05, 0.9, 0.85]); addSphere(0.32, [0, 1.15, 0.04], bodyMat);
        addSphere(0.13, [-0.28, 1.04, 0.25], glowMat); addSphere(0.13, [0.28, 1.04, 0.25], glowMat); addEyes(1.19, 0.29, 0.07); addLegs(0.23);
        for (const x of [-0.18, 0.18]) addCone(0.08, 0.4, [x, 1.5, 0], darkMat, [0, 0, x < 0 ? 0.3 : -0.3]);
        addCone(0.13, 0.5, [0, 0.7, -0.48], glowMat, [-0.5, 0, 0]); break;
      }
      case "terran": case "geo": {
        addSphere(0.54, [0, 0.68, 0], bodyMat, [1.2, 0.9, 1]); addSphere(0.34, [0, 1.15, 0.06], bodyMat);
        addSphere(0.17, [0, 1.03, 0.34], accentMat, [1, 0.6, 0.7]); addEyes(1.2, 0.32, 0.065); addLegs(0.3);
        for (const x of [-0.22, 0.22]) addSphere(0.14, [x, 1.5, 0], darkMat, [1, 1.4, 0.8]);
        for (const x of [-0.28, 0.28]) addCone(0.09, 0.3, [x, 0.28, 0.25], accentMat, [Math.PI / 2, 0, 0]);
        addSphere(0.25, [0, 1, -0.3], darkMat, [1.2, 0.9, 0.45]); break;
      }
      case "frosty": {
        addSphere(0.44, [0, 0.65, 0], bodyMat, [0.9, 1.1, 0.9]); addSphere(0.35, [0, 1.2, 0.04], bodyMat); addEyes(1.23, 0.3, 0.075);
        addCone(0.08, 0.2, [0, 1.14, 0.43], glowMat, [Math.PI / 2, 0, 0]); addLegs(0.22);
        for (const x of [-0.32, 0.32]) addSphere(0.26, [x, 0.76, -0.05], accentMat, [0.55, 1.35, 0.3]);
        for (const x of [-0.17, 0.17]) addCone(0.09, 0.38, [x, 1.57, 0], glowMat, [0, 0, x < 0 ? 0.2 : -0.2]); addTail([0, 0.65, -0.4], accentMat, 0.5); break;
      }
      case "windrake": case "lunara": {
        addSphere(0.46, [0, 0.7, 0], bodyMat, [1.15, 0.85, 0.85]); addSphere(0.34, [0, 1.2, 0.05], bodyMat); addEyes(1.25, 0.3, 0.07); addLegs(0.27);
        for (const x of [-0.22, 0.22]) addCone(0.08, 0.42, [x, 1.62, 0], darkMat, [0, 0, x < 0 ? 0.15 : -0.15]);
        for (const x of [-0.38, 0.38]) { const wing = new THREE.Mesh(new THREE.ConeGeometry(0.26 * S, 0.72 * S, 5), wingMat); wing.position.set(x * S, 1.02 * S, -0.12 * S); wing.rotation.z = x < 0 ? -0.75 : 0.75; g.add(wing); }
        addTail([0, 0.55, -0.52], bodyMat, 0.95); addCone(0.14, 0.25, [0, 0.25, -0.8], glowMat, [-0.65, 0, 0]); break;
      }
      case "mystic": case "umbra": {
        addSphere(0.42, [0, 0.67, 0], bodyMat, [1.05, 0.95, 0.85]); addSphere(0.36, [0, 1.18, 0.06], bodyMat); addEyes(1.23, 0.31, 0.08); addLegs(0.25);
        for (const x of [-0.2, 0.2]) addCone(0.1, 0.4, [x, 1.62, 0], bodyMat, [0, 0, x < 0 ? 0.22 : -0.22]);
        const tail = new THREE.Mesh(new THREE.TorusGeometry(0.35 * S, 0.09 * S, 8, 16, Math.PI * 1.5), darkMat); tail.position.set(0.32 * S, 0.75 * S, -0.2 * S); tail.rotation.y = Math.PI / 2; g.add(tail);
        addSphere(0.1, [0, 1.64, 0], glowMat); break;
      }
      case "buggo": {
        addSphere(0.46, [0, 0.65, 0], bodyMat, [1, 0.9, 0.9]); addSphere(0.3, [0, 1.13, 0.04], bodyMat); addEyes(1.2, 0.29, 0.06); addLegs(0.28);
        for (const x of [-0.12, 0.12]) addCone(0.025, 0.38, [x, 1.58, 0.03], darkMat, [0, 0, x < 0 ? 0.16 : -0.16]);
        for (const x of [-0.24, 0.24]) { const wing = new THREE.Mesh(new THREE.SphereGeometry(0.26 * S, 10, 8), wingMat); wing.position.set(x * S, 0.95 * S, -0.25 * S); wing.scale.set(0.7, 1.1, 0.25); g.add(wing); }
        addBox([0.08, 0.5, 0.45], [0, 0.72, -0.36], darkMat); break;
      }
      case "marin": {
        addSphere(0.48, [0, 1.0, 0], bodyMat, [1, 0.85, 0.7]); addEyes(1.15, 0.3, 0.065);
        for (let i = 0; i < 6; i++) { const x = (i - 2.5) * 0.13; addCone(0.055, 0.6, [x, 0.33, 0.02], glowMat, [0, 0, (i - 2.5) * 0.13]); }
        for (const x of [-0.22, 0.22]) addSphere(0.12, [x, 1.47, 0], accentMat); break;
      }
      case "ironix": {
        addSphere(0.56, [0, 0.7, 0], bodyMat, [1.2, 1.05, 1]); addSphere(0.37, [0, 1.25, 0.06], bodyMat); addEyes(1.28, 0.33, 0.065); addLegs(0.3);
        addCone(0.15, 0.6, [0, 1.35, 0.44], accentMat, [Math.PI / 2, 0, 0]);
        for (const x of [-0.4, 0.4]) addSphere(0.22, [x, 0.9, 0], accentMat, [0.8, 1.2, 0.7]);
        for (const x of [-0.18, 0.18]) addCone(0.11, 0.4, [x, 1.75, 0], darkMat, [0, 0, x < 0 ? 0.15 : -0.15]); break;
      }
      case "emberfay": {
        addSphere(0.43, [0, 0.7, 0], bodyMat, [1, 0.9, 0.8]); addSphere(0.34, [0, 1.2, 0.04], bodyMat); addEyes(1.24, 0.3, 0.075); addLegs(0.22);
        for (const x of [-0.3, 0.3]) { const wing = new THREE.Mesh(new THREE.ConeGeometry(0.25 * S, 0.72 * S, 5), wingMat); wing.position.set(x * S, 1.02 * S, -0.18 * S); wing.rotation.z = x < 0 ? -0.65 : 0.65; g.add(wing); }
        addCone(0.15, 0.48, [0, 1.65, 0], glowMat); addTail([0, 0.58, -0.5], glowMat, 0.85); break;
      }
      default: {
        addSphere(0.46, [0, 0.68, 0], bodyMat); addSphere(0.34, [0, 1.16, 0], bodyMat); addEyes(); addLegs(); addTail([0, 0.6, -0.45], accentMat); break;
      }
    }

    const aura = new THREE.Mesh(new THREE.SphereGeometry(0.72 * S, 16, 12), new THREE.MeshBasicMaterial({ color: cr.accent, transparent: true, opacity: 0.08, side: THREE.BackSide }));
    aura.position.y = 0.8 * S; g.add(aura);
    return g;
  }

  private buildNPCs() {
    for (const npc of this.map.npcs) {
      const group = this.createNPCModel(npc);
      const [wx, wy] = this.toWorld(npc.x, npc.y);
      group.position.set(wx, 0, wy);
      group.userData = { npc, phase: Math.random() * Math.PI * 2 };
      this.scene.add(group);
      this.npcGroups.push(group);

      // Quest marker floating above
      if (npc.quest) {
        const markerGroup = new THREE.Group();
        let markerColor = 0xffcc00; // ! available
        if (this.questState.completedQuests.includes(npc.quest.id)) markerColor = 0x44dd44;
        else if (this.questState.activeQuests.includes(npc.quest.id)) markerColor = 0x4488ff;

        const marker = new THREE.Mesh(
          new THREE.SphereGeometry(0.12, 8, 8),
          new THREE.MeshStandardMaterial({ color: markerColor, emissive: markerColor, emissiveIntensity: 0.3 })
        );
        marker.position.y = 2.2;
        markerGroup.add(marker);
        markerGroup.position.copy(group.position);
        markerGroup.userData = { isMarker: true, npcGroup: group };
        this.scene.add(markerGroup);
      }
    }
  }

  private createNPCModel(npc: NPC): THREE.Group {
    const g = new THREE.Group();
    const S = 1.35;

    let bodyColor = 0x6a8a9a;
    if (npc.outfit === "lab-coat") bodyColor = 0xe8e8e8;
    else if (npc.outfit === "elder") bodyColor = 0x6b6b6b;
    else if (npc.outfit === "ranger") bodyColor = 0x4a6a3a;
    else if (npc.outfit === "farmer") bodyColor = 0xb8a060;
    else if (npc.outfit === "kid") bodyColor = 0x7bb8d0;
    else if (npc.outfit === "merchant") bodyColor = 0xb0506a;
    else if (npc.outfit === "guitar") bodyColor = 0x9a5a3a;

    const bodyMat = new THREE.MeshStandardMaterial({ color: bodyColor, roughness: 0.75 });
    const skinMat = new THREE.MeshStandardMaterial({ color: 0xe8bd91, roughness: 0.7 });
    const hairMat = new THREE.MeshStandardMaterial({ color: npc.hair, roughness: 0.8 });
    const legMat = new THREE.MeshStandardMaterial({ color: 0x473e48, roughness: 0.8 });
    const eyeMat = new THREE.MeshStandardMaterial({ color: 0x1a1a2a, roughness: 0.2 });
    const shoeMat = new THREE.MeshStandardMaterial({ color: 0x3a3a4a, roughness: 0.7 });

    // Body
    const body = new THREE.Mesh(new THREE.BoxGeometry(0.5 * S, 0.65 * S, 0.38 * S), bodyMat);
    body.position.y = 0.72 * S; body.castShadow = true;
    g.add(body);

    // Head
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.24 * S, 14, 12), skinMat);
    head.position.y = 1.28 * S; head.castShadow = true;
    g.add(head);

    // Hair
    const hair = new THREE.Mesh(new THREE.SphereGeometry(0.26 * S, 14, 12, 0, Math.PI * 2, 0, Math.PI * 0.55), hairMat);
    hair.position.y = 1.33 * S; g.add(hair);

    // Hat for specific outfits
    if (npc.outfit === "elder") {
      const hat = new THREE.Mesh(new THREE.CylinderGeometry(0.22 * S, 0.26 * S, 0.12 * S, 8), hairMat);
      hat.position.y = 1.52 * S; g.add(hat);
    } else if (npc.outfit === "ranger") {
      const hatBrim = new THREE.Mesh(new THREE.CylinderGeometry(0.28 * S, 0.28 * S, 0.03 * S, 8), new THREE.MeshStandardMaterial({ color: 0x3a5a2a }));
      hatBrim.position.y = 1.48 * S; g.add(hatBrim);
      const hatTop = new THREE.Mesh(new THREE.CylinderGeometry(0.18 * S, 0.2 * S, 0.15 * S, 8), new THREE.MeshStandardMaterial({ color: 0x4a6a3a }));
      hatTop.position.y = 1.57 * S; g.add(hatTop);
    } else if (npc.outfit === "merchant") {
      const scarf = new THREE.Mesh(new THREE.TorusGeometry(0.14 * S, 0.05 * S, 6, 12), new THREE.MeshStandardMaterial({ color: 0x804060 }));
      scarf.position.y = 1.1 * S; scarf.rotation.x = Math.PI / 2; g.add(scarf);
    }

    // Arms
    const armL = new THREE.Mesh(new THREE.BoxGeometry(0.14 * S, 0.5 * S, 0.14 * S), bodyMat);
    armL.position.set(-0.32 * S, 0.72 * S, 0); armL.castShadow = true;
    g.add(armL);
    const armR = armL.clone(); armR.position.x = 0.32 * S; g.add(armR);

    // Hands
    const handL = new THREE.Mesh(new THREE.SphereGeometry(0.06 * S, 8, 8), skinMat);
    handL.position.set(-0.32 * S, 0.45 * S, 0); g.add(handL);
    const handR = handL.clone(); handR.position.x = 0.32 * S; g.add(handR);

    // Legs
    const legL = new THREE.Mesh(new THREE.BoxGeometry(0.16 * S, 0.42 * S, 0.16 * S), legMat);
    legL.position.set(-0.13 * S, 0.21 * S, 0); legL.castShadow = true;
    g.add(legL);
    const legR = legL.clone(); legR.position.x = 0.13 * S; g.add(legR);

    // Shoes
    const shoeL = new THREE.Mesh(new THREE.BoxGeometry(0.18 * S, 0.09 * S, 0.22 * S), shoeMat);
    shoeL.position.set(-0.13 * S, 0.04 * S, 0.04 * S); g.add(shoeL);
    const shoeR = shoeL.clone(); shoeR.position.x = 0.13 * S; g.add(shoeR);

    // Eyes — white + pupil
    const eyeWhiteL = new THREE.Mesh(new THREE.SphereGeometry(0.04 * S, 8, 8), new THREE.MeshStandardMaterial({ color: 0xfff8e8, roughness: 0.2 }));
    eyeWhiteL.position.set(-0.09 * S, 1.28 * S, 0.2 * S); g.add(eyeWhiteL);
    const eyeWhiteR = eyeWhiteL.clone(); eyeWhiteR.position.x = 0.09 * S; g.add(eyeWhiteR);
    const pupilL = new THREE.Mesh(new THREE.SphereGeometry(0.02 * S, 6, 6), eyeMat);
    pupilL.position.set(-0.09 * S, 1.28 * S, 0.23 * S); g.add(pupilL);
    const pupilR = pupilL.clone(); pupilR.position.x = 0.09 * S; g.add(pupilR);

    // Mouth
    const mouth = new THREE.Mesh(new THREE.BoxGeometry(0.05 * S, 0.012 * S, 0.02 * S), new THREE.MeshStandardMaterial({ color: 0xa06050 }));
    mouth.position.set(0, 1.2 * S, 0.22 * S); g.add(mouth);

    // Outfit-specific accessories
    if (npc.outfit === "lab-coat") {
      // Pocket
      const pocket = new THREE.Mesh(new THREE.BoxGeometry(0.1 * S, 0.12 * S, 0.02 * S), new THREE.MeshStandardMaterial({ color: 0xd0d0d0 }));
      pocket.position.set(0.15 * S, 0.7 * S, 0.2 * S); g.add(pocket);
      // Glasses
      const glassL = new THREE.Mesh(new THREE.TorusGeometry(0.04 * S, 0.008 * S, 4, 8), new THREE.MeshStandardMaterial({ color: 0x333333 }));
      glassL.position.set(-0.09 * S, 1.28 * S, 0.23 * S); glassL.rotation.x = Math.PI / 2; g.add(glassL);
      const glassR = glassL.clone(); glassR.position.x = 0.09 * S; g.add(glassR);
    } else if (npc.outfit === "guitar") {
      // Guitar body
      const guitar = new THREE.Mesh(new THREE.SphereGeometry(0.12 * S, 10, 8), new THREE.MeshStandardMaterial({ color: 0x8a5a3a, roughness: 0.4 }));
      guitar.position.set(0.15 * S, 0.7 * S, 0.25 * S); guitar.scale.set(1, 1.3, 0.3); g.add(guitar);
      const neck = new THREE.Mesh(new THREE.BoxGeometry(0.04 * S, 0.3 * S, 0.04 * S), new THREE.MeshStandardMaterial({ color: 0x6a4a2a }));
      neck.position.set(0.15 * S, 0.95 * S, 0.3 * S); g.add(neck);
    } else if (npc.outfit === "farmer") {
      // Straw hat
      const strawHat = new THREE.Mesh(new THREE.CylinderGeometry(0.3 * S, 0.3 * S, 0.04 * S, 10), new THREE.MeshStandardMaterial({ color: 0xd8c060, roughness: 0.9 }));
      strawHat.position.y = 1.5 * S; g.add(strawHat);
      const strawTop = new THREE.Mesh(new THREE.SphereGeometry(0.18 * S, 10, 6, 0, Math.PI * 2, 0, Math.PI * 0.4), new THREE.MeshStandardMaterial({ color: 0xc8a850 }));
      strawTop.position.y = 1.52 * S; g.add(strawTop);
    } else if (npc.outfit === "kid") {
      // Small cap
      const kidCap = new THREE.Mesh(new THREE.SphereGeometry(0.24 * S, 10, 8, 0, Math.PI * 2, 0, Math.PI * 0.35), new THREE.MeshStandardMaterial({ color: 0x6aa0d0 }));
      kidCap.position.y = 1.36 * S; g.add(kidCap);
    }

    g.scale.setScalar(S);
    return g;
  }

  private buildPlayer() {
    const g = new THREE.Group();
    const S = 1.35; // scale up player for visibility

    const legMat = new THREE.MeshStandardMaterial({ color: 0x2a3a6a, roughness: 0.8 });
    const shoeMat = new THREE.MeshStandardMaterial({ color: 0x2a2a3a, roughness: 0.7 });
    const jacketMat = new THREE.MeshStandardMaterial({ color: 0x2a6dc4, roughness: 0.65 });
    const whiteMat = new THREE.MeshStandardMaterial({ color: 0xf0f0f0, roughness: 0.5 });
    const skinMat = new THREE.MeshStandardMaterial({ color: 0xe8bd91, roughness: 0.7 });
    const hairMat = new THREE.MeshStandardMaterial({ color: 0x2a2520, roughness: 0.8 });
    const capMat = new THREE.MeshStandardMaterial({ color: 0xe24a3a, roughness: 0.5 });
    const strapMat = new THREE.MeshStandardMaterial({ color: 0x5a8a3a, roughness: 0.8 });
    const eyeMat = new THREE.MeshStandardMaterial({ color: 0x1a1a2a, roughness: 0.2 });
    const packMat = new THREE.MeshStandardMaterial({ color: 0x4a8a3a, roughness: 0.8 });

    // Legs - dark blue pants
    const legL = new THREE.Mesh(new THREE.BoxGeometry(0.16 * S, 0.45 * S, 0.16 * S), legMat);
    legL.position.set(-0.14 * S, 0.22 * S, 0); legL.castShadow = true;
    g.add(legL);
    const legR = legL.clone(); legR.position.x = 0.14 * S; g.add(legR);

    // Shoes
    const shoeL = new THREE.Mesh(new THREE.BoxGeometry(0.18 * S, 0.1 * S, 0.22 * S), shoeMat);
    shoeL.position.set(-0.14 * S, 0.05 * S, 0.04 * S); shoeL.castShadow = true; g.add(shoeL);
    const shoeR = shoeL.clone(); shoeR.position.x = 0.14 * S; g.add(shoeR);

    // Blue jacket body
    const body = new THREE.Mesh(new THREE.BoxGeometry(0.56 * S, 0.6 * S, 0.4 * S), jacketMat);
    body.position.y = 0.7 * S; body.castShadow = true;
    g.add(body);

    // White collar stripe
    const stripe = new THREE.Mesh(new THREE.BoxGeometry(0.12 * S, 0.6 * S, 0.42 * S), whiteMat);
    stripe.position.y = 0.7 * S;
    g.add(stripe);

    // Yellow collar
    const collar = new THREE.Mesh(new THREE.BoxGeometry(0.58 * S, 0.08 * S, 0.42 * S), new THREE.MeshStandardMaterial({ color: 0xe8c84a, roughness: 0.5 }));
    collar.position.y = 1.02 * S;
    g.add(collar);

    // Arms
    const armL = new THREE.Mesh(new THREE.BoxGeometry(0.14 * S, 0.48 * S, 0.14 * S), jacketMat);
    armL.position.set(-0.35 * S, 0.7 * S, 0); armL.castShadow = true;
    g.add(armL);
    const armR = armL.clone(); armR.position.x = 0.35 * S; g.add(armR);

    // Hands
    const handL = new THREE.Mesh(new THREE.SphereGeometry(0.07 * S, 8, 8), skinMat);
    handL.position.set(-0.35 * S, 0.44 * S, 0); g.add(handL);
    const handR = handL.clone(); handR.position.x = 0.35 * S; g.add(handR);

    // Backpack (behind body)
    const pack = new THREE.Mesh(new THREE.BoxGeometry(0.35 * S, 0.4 * S, 0.18 * S), packMat);
    pack.position.set(0, 0.7 * S, -0.28 * S); pack.castShadow = true;
    g.add(pack);

    // Backpack straps (over shoulders)
    const strapL2 = new THREE.Mesh(new THREE.BoxGeometry(0.07 * S, 0.45 * S, 0.03 * S), strapMat);
    strapL2.position.set(-0.2 * S, 0.72 * S, -0.2 * S); g.add(strapL2);
    const strapR2 = strapL2.clone(); strapR2.position.x = 0.2 * S; g.add(strapR2);

    // Head
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.24 * S, 14, 12), skinMat);
    head.position.y = 1.3 * S; head.castShadow = true;
    g.add(head);

    // Hair — black, back and sides
    const hair = new THREE.Mesh(new THREE.SphereGeometry(0.26 * S, 14, 12, 0, Math.PI * 2, 0, Math.PI * 0.5), hairMat);
    hair.position.y = 1.34 * S; g.add(hair);
    // Side hair
    const sideHairL = new THREE.Mesh(new THREE.BoxGeometry(0.04 * S, 0.15 * S, 0.2 * S), hairMat);
    sideHairL.position.set(-0.23 * S, 1.25 * S, 0); g.add(sideHairL);
    const sideHairR = sideHairL.clone(); sideHairR.position.x = 0.23 * S; g.add(sideHairR);

    // Red cap dome
    const cap = new THREE.Mesh(new THREE.SphereGeometry(0.25 * S, 14, 10, 0, Math.PI * 2, 0, Math.PI * 0.42), capMat);
    cap.position.y = 1.36 * S; cap.castShadow = true; g.add(cap);

    // Cap brim (front)
    const brim = new THREE.Mesh(new THREE.BoxGeometry(0.26 * S, 0.05 * S, 0.16 * S), new THREE.MeshStandardMaterial({ color: 0xc03830, roughness: 0.5 }));
    brim.position.set(0.06 * S, 1.3 * S, 0.2 * S); brim.castShadow = true; g.add(brim);

    // White cap front panel
    const capFront = new THREE.Mesh(new THREE.BoxGeometry(0.16 * S, 0.08 * S, 0.03 * S), whiteMat);
    capFront.position.set(0.06 * S, 1.34 * S, 0.25 * S); g.add(capFront);

    // Green badge on cap
    const badge = new THREE.Mesh(new THREE.CircleGeometry(0.04 * S, 8), new THREE.MeshStandardMaterial({ color: 0x4a9a5a, emissive: 0x2a6a3a, emissiveIntensity: 0.2 }));
    badge.position.set(0.06 * S, 1.36 * S, 0.27 * S); g.add(badge);

    // Eyes — white + pupil
    const eyeWhiteL = new THREE.Mesh(new THREE.SphereGeometry(0.05 * S, 8, 8), new THREE.MeshStandardMaterial({ color: 0xfff8e8, roughness: 0.2 }));
    eyeWhiteL.position.set(-0.08 * S, 1.3 * S, 0.2 * S); g.add(eyeWhiteL);
    const eyeWhiteR = eyeWhiteL.clone(); eyeWhiteR.position.x = 0.08 * S; g.add(eyeWhiteR);
    const pupilL = new THREE.Mesh(new THREE.SphereGeometry(0.025 * S, 6, 6), eyeMat);
    pupilL.position.set(-0.08 * S, 1.3 * S, 0.24 * S); g.add(pupilL);
    const pupilR = pupilL.clone(); pupilR.position.x = 0.08 * S; g.add(pupilR);
    // Eye shine
    const shineL = new THREE.Mesh(new THREE.SphereGeometry(0.01 * S, 4, 4), new THREE.MeshBasicMaterial({ color: 0xffffff }));
    shineL.position.set(-0.07 * S, 1.32 * S, 0.26 * S); g.add(shineL);
    const shineR = shineL.clone(); shineR.position.x = 0.09 * S; g.add(shineR);

    // Mouth — small smile
    const mouth = new THREE.Mesh(new THREE.BoxGeometry(0.06 * S, 0.015 * S, 0.02 * S), new THREE.MeshStandardMaterial({ color: 0xa06050 }));
    mouth.position.set(0, 1.22 * S, 0.22 * S); g.add(mouth);

    this.playerGroup = g;
    const [wx, wy] = this.toWorld(this.player.x, this.player.y);
    g.position.set(wx, 0, wy);
    g.scale.setScalar(S);
    this.scene.add(g);
  }

  private buildParticles() {
    const count = 60;
    const positions = new Float32Array(count * 3);
    const colors = new Float32Array(count * 3);

    for (let i = 0; i < count; i++) {
      positions[i * 3] = (Math.random() - 0.5) * 60;
      positions[i * 3 + 1] = Math.random() * 8 + 1;
      positions[i * 3 + 2] = (Math.random() - 0.5) * 60;

      if (this.mapId === "town") {
        colors[i * 3] = 0.9; colors[i * 3 + 1] = 0.8; colors[i * 3 + 2] = 0.5;
      } else if (this.mapId === "meadow") {
        colors[i * 3] = 1; colors[i * 3 + 1] = 0.9; colors[i * 3 + 2] = 0.6;
      } else {
        colors[i * 3] = 0.6; colors[i * 3 + 1] = 1; colors[i * 3 + 2] = 0.6;
      }
    }

    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    geo.setAttribute("color", new THREE.BufferAttribute(colors, 3));

    const mat = new THREE.PointsMaterial({
      size: 0.12, vertexColors: true, transparent: true, opacity: 0.6,
      blending: THREE.AdditiveBlending
    });

    this.particleSystem = new THREE.Points(geo, mat);
    this.scene.add(this.particleSystem);
  }

  private setupInput() {
    window.addEventListener("keydown", this.onKeyDown);
    window.addEventListener("keyup", this.onKeyUp);
  }

  private onKeyDown = (e: KeyboardEvent) => {
    const k = e.key.toLowerCase();
    if (["w", "a", "s", "d", "arrowup", "arrowleft", "arrowdown", "arrowright", "e", "enter"].includes(k)) {
      e.preventDefault();
      this.keys[k] = true;
      if (k === "e" || k === "enter") this.interact();
    }
  };

  private onKeyUp = (e: KeyboardEvent) => {
    this.keys[e.key.toLowerCase()] = false;
  };

  private interact() {
    if (this.activeNPC) {
      if (this.activeNPC.quest) {
        const npcName = this.activeNPC.name;
        this.onEvent({ type: "npc_name", name: npcName });
        const q = this.activeNPC.quest;
        const isActive = this.questState.activeQuests.includes(q.id);
        const isDone = this.questState.completedQuests.includes(q.id);
        if (isDone) {
          this.activeNPC = null;
          this.onEvent({ type: "dialogue", text: "Cảm ơn cháu đã hoàn thành nhiệm vụ!", npcName });
          return;
        }
        if (isActive) {
          this.activeNPC = null;
          this.onEvent({ type: "quest_progress", questId: q.id, npcName, text: q.progressLine(this.questProgressCount(q)) });
          return;
        }
        this.activeNPC = null;
        this.onEvent({ type: "quest", questId: q.id, npcName, intro: q.introLine, title: q.title });
        return;
      }
      this.dialogueIndex++;
      if (this.dialogueIndex >= this.activeNPC.lines.length) { this.dismissDialogue(); return; }
      this.onEvent({ type: "dialogue", text: this.activeNPC.lines[this.dialogueIndex], npcName: this.activeNPC.name });
      return;
    }
    const npc = this.map.npcs.find(n => Math.hypot(n.x - this.player.x, n.y - this.player.y) < 66);
    if (npc) {
      this.activeNPC = npc;
      this.dialogueIndex = 0;
      if (npc.quest) {
        const q = npc.quest;
        const isDone = this.questState.completedQuests.includes(q.id);
        const isActive = this.questState.activeQuests.includes(q.id);
        this.onEvent({ type: "npc_name", name: npc.name });
        if (isDone) { this.onEvent({ type: "dialogue", text: "Cảm ơn cháu đã hoàn thành nhiệm vụ!", npcName: npc.name }); return; }
        if (isActive) { this.onEvent({ type: "quest_progress", questId: q.id, npcName: npc.name, text: q.progressLine(this.questProgressCount(q)) }); return; }
        this.onEvent({ type: "quest", questId: q.id, npcName: npc.name, intro: q.introLine, title: q.title });
        return;
      }
      this.onEvent({ type: "dialogue", text: npc.lines[0], npcName: npc.name });
      return;
    }
    this.onEvent({ type: "hint", text: "Không có ai ở gần để trò chuyện." });
  }

  private questProgressCount(q: NPC["quest"]): number { if (!q) return 0; return q.targetCount; }

  dismissDialogue() { this.activeNPC = null; this.dialogueIndex = 0; }

  setQuestState(state: QuestState) { this.questState = state; this.buildNPCs(); }

  private updateCamera() {
    const [wx, wy] = this.toWorld(this.player.x, this.player.y);
    this.camera.position.set(wx, 35, wy + 25);
    this.camera.lookAt(wx, 0, wy);
  }

  private checkCollision(x: number, y: number): boolean {
    const margin = 20;
    for (const o of this.map.obstacles) {
      if (x > o.x - margin && x < o.x + o.w + margin && y > o.y - margin && y < o.y + o.h + margin) return true;
    }
    if (x < 30 || x > this.map.width - 30 || y < 30 || y > this.map.height - 30) return true;
    return false;
  }

  private inGrassZone(x: number, y: number): boolean {
    for (const z of this.map.zones) {
      if (z.type === "grass" && x > z.x && x < z.x + z.w && y > z.y && y < z.y + z.h) return true;
    }
    return false;
  }

  teleportTo(mapId: MapId): boolean {
    this.mapId = mapId;
    this.map = maps[mapId];
    this.scene.background = new THREE.Color(this.map.base);
    this.scene.fog = new THREE.Fog(this.map.base, 40, 120);
    this.buildWorld();
    this.updateCamera();
    this.onEvent({ type: "map", mapId, name: this.map.name, viaTeleport: true });
    this.onPositionChange?.({ mapId, x: this.player.x, y: this.player.y });
    return true;
  }

  getPosition() { return { mapId: this.mapId, x: this.player.x, y: this.player.y }; }

  private update(dt: number) {
    this.frame++;
    const speed = 2.5;
    let dx = 0, dy = 0;
    if (this.keys["w"] || this.keys["arrowup"]) { dy = -speed; this.player.dir = "up"; }
    if (this.keys["s"] || this.keys["arrowdown"]) { dy = speed; this.player.dir = "down"; }
    if (this.keys["a"] || this.keys["arrowleft"]) { dx = -speed; this.player.dir = "left"; }
    if (this.keys["d"] || this.keys["arrowright"]) { dx = speed; this.player.dir = "right"; }

    if (dx !== 0 && dy !== 0) { dx *= 0.707; dy *= 0.707; }
    this.player.moving = dx !== 0 || dy !== 0;

    if (this.player.moving) {
      this.step += dt * 8;
      const nx = this.player.x + dx;
      const ny = this.player.y + dy;
      if (!this.checkCollision(nx, this.player.y)) this.player.x = nx;
      if (!this.checkCollision(this.player.x, ny)) this.player.y = ny;

      this.onPositionChange?.({ mapId: this.mapId, x: this.player.x, y: this.player.y });

      // Grass encounter
      if (this.inGrassZone(this.player.x, this.player.y)) {
        this.grassCooldown -= dt;
        if (this.grassCooldown <= 0 && Math.random() < 0.012) {
          this.grassCooldown = 2.5;
          this.onEvent({ type: "grass" });
        }
      }
    }

    // Player rotation based on direction
    const [pwx, pwy] = this.toWorld(this.player.x, this.player.y);
    this.playerGroup.position.x = pwx;
    this.playerGroup.position.z = pwy;
    const bob = this.player.moving ? Math.sin(this.step * 2) * 0.08 : Math.sin(this.frame * 0.045) * 0.04;
    this.playerGroup.position.y = bob;
    if (this.player.dir === "left") this.playerGroup.rotation.y = -Math.PI / 2;
    else if (this.player.dir === "right") this.playerGroup.rotation.y = Math.PI / 2;
    else if (this.player.dir === "up") this.playerGroup.rotation.y = 0;
    else this.playerGroup.rotation.y = Math.PI;

    // Wild creature bobbing
    for (const g of this.wildCreatureGroups) {
      const phase = g.userData.phase as number;
      g.position.y = Math.sin(this.frame * 0.055 + phase) * 0.1;
      g.rotation.y += dt * 0.3;
    }

    // NPC bobbing
    for (const g of this.npcGroups) {
      const phase = g.userData.phase as number;
      g.position.y = Math.sin(this.frame * 0.04 + phase) * 0.05;
    }

    // Particle animation
    if (this.particleSystem) {
      const pos = this.particleSystem.geometry.attributes.position as THREE.BufferAttribute;
      const arr = pos.array as Float32Array;
      for (let i = 0; i < arr.length; i += 3) {
        arr[i + 1] -= dt * 0.5;
        if (arr[i + 1] < 0.5) arr[i + 1] = 9;
        arr[i] += Math.sin(this.frame * 0.02 + i) * 0.01;
      }
      pos.needsUpdate = true;
    }

    // Crystal glow
    for (const g of this.obstacleGroups) {
      g.traverse((child) => {
        if (child instanceof THREE.Mesh && child.material instanceof THREE.MeshStandardMaterial) {
          if (child.material.emissive && child.material.emissive.getHex() === 0x4a8ca0) {
            child.material.emissiveIntensity = 0.3 + Math.sin(this.frame * 0.03) * 0.2;
          }
        }
      });
    }

    this.updateCamera();
  }

  start() {
    const loop = () => {
      this.rafId = requestAnimationFrame(loop);
      const dt = Math.min(this.clock.getDelta(), 0.05);
      this.update(dt);
      this.renderer.render(this.scene, this.camera);
    };
    loop();
  }

  stop() {
    if (this.rafId !== null) cancelAnimationFrame(this.rafId);
    this.rafId = null;
    window.removeEventListener("keydown", this.onKeyDown);
    window.removeEventListener("keyup", this.onKeyUp);
    this.renderer.dispose();
    if (this.renderer.domElement.parentElement === this.container) {
      this.container.removeChild(this.renderer.domElement);
    }
  }

  resize() {
    const w = this.container.clientWidth;
    const h = this.container.clientHeight;
    this.renderer.setSize(w, h);
    const viewSize = 22;
    this.camera.left = -viewSize * (w / h);
    this.camera.right = viewSize * (w / h);
    this.camera.top = viewSize;
    this.camera.bottom = -viewSize;
    this.camera.updateProjectionMatrix();
  }
}

export type { GameEvent3D, QuestState, PlayerState };

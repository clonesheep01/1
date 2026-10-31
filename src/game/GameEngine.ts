import { GameMap, MapId, maps, NPC, TILE, OutfitKind } from "./maps";
import { CREATURES, getCreature, Element } from "./creatures";
export type GameEvent = { type:"map"; name:string; mapId:MapId; viaTeleport?:boolean } | { type:"dialogue"; text:string; npcName?:string } | { type:"grass" } | { type:"hint"; text:string } | { type:"quest"; questId:string; npcName:string; intro:string; title:string } | { type:"quest_progress"; questId:string; npcName:string; text:string } | { type:"quest_complete"; questId:string; npcName:string; reward:string; text:string } | { type:"npc_name"; name:string };
type Direction = "down" | "up" | "left" | "right";
const clamp=(v:number,min:number,max:number)=>Math.max(min,Math.min(max,v));
const hashStr=(s:string)=>{let h=0;for(let i=0;i<s.length;i++)h=(h*31+s.charCodeAt(i))|0;return (h>>>0)%100/100*6;};

export class GameEngine {
  private ctx: CanvasRenderingContext2D;
  private frame=0; private raf=0; private last=0; private keys=new Set<string>();
  private player={x:850,y:650,speed:190,dir:"down" as Direction,moving:false};
  private map:GameMap=maps.town; private camera={x:0,y:0}; private dialogueIndex=0; private activeNPC:NPC|null=null;
  private grassCooldown=0; private step=0; private running=false; private saveClock=0;
  private questState: { activeQuests: string[]; completedQuests: string[] } = { activeQuests: [], completedQuests: [] };
  constructor(private canvas:HTMLCanvasElement,private onEvent:(event:GameEvent)=>void,initialState?:{mapId:MapId;x:number;y:number},private onPosition?:(state:{mapId:MapId;x:number;y:number})=>void){
    const ctx=canvas.getContext("2d"); if(!ctx) throw new Error("Canvas không được hỗ trợ"); this.ctx=ctx;
    this.ctx.imageSmoothingEnabled=false;
    if(initialState && maps[initialState.mapId]){this.map=maps[initialState.mapId];this.player.x=clamp(initialState.x,20,this.map.width-20);this.player.y=clamp(initialState.y,20,this.map.height-20);}
    window.addEventListener("keydown",this.keyDown); window.addEventListener("keyup",this.keyUp); window.addEventListener("blur",this.clearKeys);
  }
  setQuestState(s:{activeQuests:string[];completedQuests:string[]}){this.questState=s;}
  start(){this.running=true;this.last=performance.now();this.loop(this.last);}
  stop(){this.running=false;cancelAnimationFrame(this.raf);window.removeEventListener("keydown",this.keyDown);window.removeEventListener("keyup",this.keyUp);window.removeEventListener("blur",this.clearKeys);}
  dismissDialogue(){this.activeNPC=null;this.dialogueIndex=0;}
  getPosition(){return {mapId:this.map.id,x:Math.round(this.player.x),y:Math.round(this.player.y)};}
  teleportTo(mapId:MapId){
    const destination=maps[mapId];if(!destination)return false;
    const spawns:Record<MapId,{x:number;y:number}>={town:{x:850,y:650},meadow:{x:900,y:600},forest:{x:900,y:650}};
    const spawn=spawns[mapId];
    const blocked=(x:number,y:number)=>destination.obstacles.some(o=>x-12<o.x+o.w&&x+12>o.x&&y-10<o.y+o.h&&y+10>o.y);
    let x=spawn.x,y=spawn.y;
    if(blocked(x,y)){let found=false;for(let r=1;r<=8&&!found;r++)for(const [dx,dy] of [[r*36,0],[-r*36,0],[0,r*36],[0,-r*36],[r*24,r*24],[-r*24,r*24]]){const nx=clamp(spawn.x+dx,20,destination.width-20),ny=clamp(spawn.y+dy,20,destination.height-20);if(!blocked(nx,ny)){x=nx;y=ny;found=true;break;}}if(!found)return false;}
    this.map=destination;this.player.x=x;this.player.y=y;this.player.moving=false;this.keys.clear();
    this.camera.x=clamp(x-this.canvas.width/2,0,destination.width-this.canvas.width);this.camera.y=clamp(y-this.canvas.height/2,0,destination.height-this.canvas.height);
    this.onEvent({type:"map",name:destination.name,mapId,viaTeleport:true});this.onPosition?.(this.getPosition());return true;
  }
  private clearKeys=()=>this.keys.clear();
  private keyDown=(e:KeyboardEvent)=>{const k=e.key.toLowerCase();if(["w","a","s","d","arrowup","arrowdown","arrowleft","arrowright"," ","e","enter"].includes(k))e.preventDefault();this.keys.add(k);if((k==="e"||k==="enter")&&!e.repeat)this.interact();};
  private keyUp=(e:KeyboardEvent)=>this.keys.delete(e.key.toLowerCase());
  private loop=(now:number)=>{if(!this.running)return;const dt=Math.min((now-this.last)/1000,.04);this.last=now;this.update(dt);this.draw();this.raf=requestAnimationFrame(this.loop);};
  private update(dt:number){
    this.frame++;this.grassCooldown=Math.max(0,this.grassCooldown-dt);this.saveClock+=dt;if(this.saveClock>=1){this.saveClock=0;this.onPosition?.(this.getPosition());}
    let dx=0,dy=0; if(this.keys.has("a")||this.keys.has("arrowleft"))dx--;if(this.keys.has("d")||this.keys.has("arrowright"))dx++;if(this.keys.has("w")||this.keys.has("arrowup"))dy--;if(this.keys.has("s")||this.keys.has("arrowdown"))dy++;
    const len=Math.hypot(dx,dy)||1;dx=dx/len*this.player.speed*dt;dy=dy/len*this.player.speed*dt;
    this.player.moving=!!(dx||dy);if(this.player.moving){if(Math.abs(dx)>Math.abs(dy))this.player.dir=dx>0?"right":"left";else this.player.dir=dy>0?"down":"up";this.step+=dt*9;}
    this.move(dx,0);this.move(0,dy);
    this.player.x=clamp(this.player.x,20,this.map.width-20);this.player.y=clamp(this.player.y,20,this.map.height-20);
    const cw=this.canvas.width,ch=this.canvas.height;this.camera.x=clamp(this.player.x-cw/2,0,this.map.width-cw);this.camera.y=clamp(this.player.y-ch/2,0,this.map.height-ch);
    if(this.grassCooldown===0&&this.map.zones.some(z=>z.type==="grass"&&this.inside(this.player.x,this.player.y,z))&&Math.random()<.012){this.grassCooldown=5;this.onEvent({type:"grass"});}
  }
  private move(dx:number,dy:number){const nx=this.player.x+dx,ny=this.player.y+dy;const box={x:nx-10,y:ny-8,w:20,h:16};if(!this.map.obstacles.some(o=>box.x<o.x+o.w&&box.x+box.w>o.x&&box.y<o.y+o.h&&box.y+box.h>o.y)){this.player.x=nx;this.player.y=ny;}}
  private inside(x:number,y:number,z:{x:number;y:number;w:number;h:number}){return x>z.x&&x<z.x+z.w&&y>z.y&&y<z.y+z.h;}
  private interact(){
    if(this.activeNPC){
      if(this.activeNPC.quest){
        const npcName=this.activeNPC.name;
        this.onEvent({type:"npc_name",name:npcName});
        const q=this.activeNPC.quest;
        const isActive=this.questState.activeQuests.includes(q.id);
        const isDone=this.questState.completedQuests.includes(q.id);
        if(isDone){this.activeNPC=null;this.onEvent({type:"dialogue",text:"Cảm ơn cháu đã hoàn thành nhiệm vụ!",npcName:npcName});return;}
        if(isActive){this.activeNPC=null;this.onEvent({type:"quest_progress",questId:q.id,npcName:npcName,text:q.progressLine(this.questProgressCount(q))});return;}
        this.activeNPC=null;this.onEvent({type:"quest",questId:q.id,npcName:npcName,intro:q.introLine,title:q.title});return;
      }
      this.dialogueIndex++;
      if(this.dialogueIndex>=this.activeNPC.lines.length){this.dismissDialogue();return;}
      this.onEvent({type:"dialogue",text:this.activeNPC.lines[this.dialogueIndex]});return;
    }
    const npc=this.map.npcs.find(n=>Math.hypot(n.x-this.player.x,n.y-this.player.y)<66);
    if(npc){
      this.activeNPC=npc;this.dialogueIndex=0;
      if(npc.quest){
        const q=npc.quest;
        const isDone=this.questState.completedQuests.includes(q.id);
        const isActive=this.questState.activeQuests.includes(q.id);
        this.onEvent({type:"npc_name",name:npc.name});
        if(isDone){this.onEvent({type:"dialogue",text:"Cảm ơn cháu đã hoàn thành nhiệm vụ!",npcName:npc.name});return;}
        if(isActive){this.onEvent({type:"quest_progress",questId:q.id,npcName:npc.name,text:q.progressLine(this.questProgressCount(q))});return;}
        this.onEvent({type:"quest",questId:q.id,npcName:npc.name,intro:q.introLine,title:q.title});return;
      }
      this.onEvent({type:"dialogue",text:npc.lines[0],npcName:npc.name});return;
    }
    this.onEvent({type:"hint",text:"Không có ai ở gần để trò chuyện."});
  }
  private questProgressCount(q:NPC["quest"]):number{ if(!q) return 0; return q.targetCount; }
  private draw(){const c=this.ctx,w=this.canvas.width,h=this.canvas.height;c.clearRect(0,0,w,h);c.save();c.translate(-Math.floor(this.camera.x),-Math.floor(this.camera.y));this.drawGround();this.drawZones();this.drawWildCreatures();this.drawObstacles();this.drawNPCs();this.drawPlayer();this.drawDecor();c.restore();this.drawVignette();}
  private drawGround(){const c=this.ctx,m=this.map;c.fillStyle=m.base;c.fillRect(0,0,m.width,m.height);
    // texture tiles differ per map
    const isForest=m.id==="forest",isMeadow=m.id==="meadow",isTown=m.id==="town";
    const texColor=isForest?"#5d8968":isMeadow?"#9ac77b":"#8bc17e";
    const speckColor=isForest?"#4a7355":isMeadow?"#7fb562":"#719f6b";
    for(let y=0;y<m.height/TILE;y++)for(let x=0;x<m.width/TILE;x++){const v=(x*17+y*31+(x*y)%13)%11;if(v===0){c.fillStyle=texColor;c.fillRect(x*TILE+5,y*TILE+8,3,3);}else if(v===3){c.fillStyle=speckColor;c.fillRect(x*TILE+22,y*TILE+19,2,3);}else if(v===6){c.fillStyle=texColor;c.fillRect(x*TILE+15,y*TILE+12,2,2);}}
    // roads — town has cobblestone, meadow has dirt path, forest has mossy trail
    c.fillStyle=m.accent;c.fillRect(0,560,m.width,70);c.fillRect(850,0,70,m.height);
    c.fillStyle="#e6d29a";c.fillRect(0,584,m.width,22);c.fillRect(872,0,22,m.height);
    if(isTown){c.fillStyle="#b4a078";c.fillRect(0,585,m.width,20);c.fillRect(875,0,20,m.height);
      // cobblestone dots on the road
      for(let x=20;x<m.width;x+=60)c.fillStyle="#a8926a",c.fillRect(x,592,6,6),c.fillRect(x+30,592,6,6);
      for(let y=20;y<m.height;y+=60)c.fillStyle="#a8926a",c.fillRect(882,y,6,6),c.fillRect(882,y+30,6,6);
    }
    if(isMeadow){c.fillStyle="#c9b870";c.fillRect(0,585,m.width,20);c.fillRect(875,0,20,m.height);
      // wildflower specks along path
      for(let x=10;x<m.width;x+=80)c.fillStyle="#e8c46b",c.fillRect(x,590,4,4),c.fillStyle="#d98b72",c.fillRect(x+40,590,4,4);
    }
    if(isForest){c.fillStyle="#9a8a5a";c.fillRect(0,585,m.width,20);c.fillRect(875,0,20,m.height);
      // mossy patches on trail
      for(let x=15;x<m.width;x+=70)c.fillStyle="#5a8a5a",c.fillRect(x,588,8,5),c.fillRect(x+35,588,6,4);
      for(let y=15;y<m.height;y+=70)c.fillStyle="#5a8a5a",c.fillRect(880,y,5,8),c.fillRect(880,y+35,4,6);
    }
  }
  private drawZones(){const c=this.ctx;for(const z of this.map.zones){if(z.type==="grass"){c.fillStyle="rgba(47,112,58,.24)";c.fillRect(z.x,z.y,z.w,z.h);for(let x=z.x+8;x<z.x+z.w;x+=17)for(let y=z.y+8;y<z.y+z.h;y+=19){c.fillStyle="#4f9957";c.fillRect(x,y,3,7);c.fillStyle="#b2d67a";c.fillRect(x+3,y+2,2,4);}}}}
  private drawWildCreatures(){
    const c=this.ctx;
    const DARK:Record<Element,string>={Fire:"#8f3e32",Water:"#245d85",Grass:"#315f42",Electric:"#80651e",Earth:"#594d43",Ice:"#3a7a96",Wind:"#2d8a6a",Psychic:"#6a4a8f",Bug:"#4d6821",Dark:"#2a2840",Ground:"#6b4f30",Metal:"#4a5862",Fairy:"#9a4a3d",Poison:"#2d7a93",Dragon:"#6a4d8f"};
    const POOLS:Record<string,string[]>={town:["flamara","aquarion","leafy","voltix","terran"],meadow:["leafy","buggo","windrake","emberfay","marin","frosty"],forest:["buggo","umbra","mystic","geo","ironix","lunara"]};
    const pool=(POOLS[this.map.id]||CREATURES.map(x=>x.id)).map(id=>getCreature(id));
    let zi=0;
    for(const zone of this.map.zones.filter(z=>z.type==="grass")){
      for(let i=0;i<3;i++){
        const cr=pool[(zi*3+i)%pool.length];
        const el=cr.element,body=cr.color,light=cr.accent,dark=DARK[el];
        const x=Math.round(zone.x+zone.w*(.22+i*.27));
        const y=Math.round(zone.y+zone.h*(i%2===0?.38:.68));
        const bob=Math.sin(this.frame*.055+i*2)*2;
        const yy=Math.round(y+bob);
        c.save();
        c.fillStyle="rgba(24,48,34,.28)";c.beginPath();c.ellipse(x,y+13,13,4,0,0,Math.PI*2);c.fill();
        // ears / elemental crest
        c.fillStyle=body;c.strokeStyle=dark;c.lineWidth=2;c.beginPath();
        if(el==="Fire"){c.moveTo(x-9,yy-5);c.lineTo(x-13,yy-20);c.lineTo(x-3,yy-12);c.lineTo(x+5,yy-12);c.lineTo(x+13,yy-20);c.lineTo(x+10,yy-4);}
        else if(el==="Water"){c.moveTo(x-10,yy-5);c.quadraticCurveTo(x-20,yy-21,x-7,yy-19);c.quadraticCurveTo(x+1,yy-13,x+2,yy-5);c.moveTo(x+4,yy-5);c.quadraticCurveTo(x+9,yy-22,x+17,yy-14);c.quadraticCurveTo(x+17,yy-6,x+10,yy-3);}
        else if(el==="Grass"){c.moveTo(x-10,yy-5);c.quadraticCurveTo(x-17,yy-22,x-4,yy-18);c.lineTo(x+1,yy-7);c.quadraticCurveTo(x+8,yy-25,x+16,yy-18);c.lineTo(x+10,yy-4);}
        else if(el==="Electric"){c.moveTo(x-11,yy-5);c.lineTo(x-12,yy-17);c.lineTo(x-3,yy-12);c.lineTo(x+1,yy-22);c.lineTo(x+6,yy-11);c.lineTo(x+14,yy-17);c.lineTo(x+10,yy-4);}
        else if(el==="Earth"){c.moveTo(x-12,yy-4);c.lineTo(x-9,yy-18);c.lineTo(x-1,yy-12);c.lineTo(x+4,yy-22);c.lineTo(x+9,yy-11);c.lineTo(x+14,yy-16);c.lineTo(x+11,yy-3);}
        else if(el==="Ice"){c.moveTo(x-10,yy-5);c.lineTo(x-14,yy-22);c.lineTo(x-5,yy-14);c.lineTo(x-1,yy-20);c.lineTo(x+4,yy-14);c.lineTo(x+9,yy-22);c.lineTo(x+10,yy-4);}
        else if(el==="Wind"){c.moveTo(x-11,yy-5);c.quadraticCurveTo(x-20,yy-18,x-8,yy-16);c.quadraticCurveTo(x-2,yy-10,x-1,yy-5);c.moveTo(x+2,yy-5);c.quadraticCurveTo(x+8,yy-24,x+18,yy-14);c.quadraticCurveTo(x+16,yy-8,x+9,yy-3);}
        else if(el==="Psychic"){c.moveTo(x-9,yy-4);c.quadraticCurveTo(x-18,yy-22,x-3,yy-18);c.quadraticCurveTo(x+1,yy-12,x+1,yy-5);c.moveTo(x+2,yy-5);c.quadraticCurveTo(x+8,yy-26,x+16,yy-16);c.quadraticCurveTo(x+14,yy-8,x+8,yy-3);}
        else if(el==="Bug"){c.moveTo(x-7,yy-4);c.lineTo(x-9,yy-20);c.lineTo(x-4,yy-20);c.lineTo(x-2,yy-4);c.moveTo(x+2,yy-4);c.lineTo(x+4,yy-20);c.lineTo(x+9,yy-20);c.lineTo(x+7,yy-4);}
        else if(el==="Dark"){c.moveTo(x-10,yy-4);c.lineTo(x-12,yy-20);c.lineTo(x-2,yy-14);c.lineTo(x+1,yy-22);c.lineTo(x+5,yy-14);c.lineTo(x+12,yy-20);c.lineTo(x+10,yy-4);}
        else if(el==="Ground"){c.moveTo(x-10,yy-4);c.quadraticCurveTo(x-16,yy-20,x-6,yy-18);c.quadraticCurveTo(x-1,yy-12,x,yy-5);c.moveTo(x+2,yy-5);c.quadraticCurveTo(x+4,yy-24,x+14,yy-18);c.quadraticCurveTo(x+12,yy-8,x+8,yy-3);}
        else if(el==="Metal"){c.moveTo(x-9,yy-4);c.lineTo(x-12,yy-22);c.lineTo(x-3,yy-14);c.lineTo(x+1,yy-24);c.lineTo(x+5,yy-14);c.lineTo(x+12,yy-22);c.lineTo(x+9,yy-4);}
        else if(el==="Fairy"){c.moveTo(x-10,yy-5);c.quadraticCurveTo(x-18,yy-20,x-4,yy-17);c.quadraticCurveTo(x+1,yy-12,x+1,yy-5);c.moveTo(x+2,yy-5);c.quadraticCurveTo(x+5,yy-25,x+16,yy-16);c.quadraticCurveTo(x+15,yy-8,x+9,yy-3);}
        else if(el==="Poison"){c.moveTo(x-9,yy-4);c.quadraticCurveTo(x-14,yy-20,x-5,yy-16);c.lineTo(x,yy-8);c.quadraticCurveTo(x+6,yy-24,x+14,yy-16);c.lineTo(x+9,yy-4);}
        else if(el==="Dragon"){c.moveTo(x-10,yy-5);c.lineTo(x-14,yy-20);c.lineTo(x-4,yy-14);c.lineTo(x-1,yy-22);c.lineTo(x+4,yy-14);c.lineTo(x+14,yy-20);c.lineTo(x+10,yy-4);}
        c.closePath();c.fill();c.stroke();
        // rounded body with outline
        c.fillStyle=body;c.beginPath();c.ellipse(x,yy+2,12,13,0,0,Math.PI*2);c.fill();c.stroke();
        c.fillStyle=light;c.beginPath();c.ellipse(x,yy+7,7,7,0,0,Math.PI*2);c.fill();
        // paws
        c.fillStyle=dark;c.fillRect(x-9,yy+10,6,5);c.fillRect(x+4,yy+10,6,5);
        // eyes and muzzle
        c.fillStyle="#fff8e8";c.fillRect(x-7,yy-3,5,6);c.fillRect(x+2,yy-3,5,6);
        c.fillStyle="#263b43";c.fillRect(x-5,yy-1,2,3);c.fillRect(x+4,yy-1,2,3);
        c.fillStyle=dark;c.fillRect(x-2,yy+5,4,2);
        // small elemental sparkle
        c.fillStyle=light;
        if(el==="Fire"){c.beginPath();c.moveTo(x,yy-25);c.lineTo(x+4,yy-18);c.lineTo(x,yy-14);c.lineTo(x-3,yy-20);c.fill();}
        else if(el==="Water"){c.beginPath();c.arc(x+14,yy-13,3,0,Math.PI*2);c.fill();}
        else if(el==="Grass"){c.fillRect(x-2,yy-23,5,5);c.fillRect(x+2,yy-25,4,3);}
        else if(el==="Electric"){c.beginPath();c.moveTo(x+10,yy-22);c.lineTo(x+4,yy-12);c.lineTo(x+10,yy-14);c.lineTo(x+7,yy-7);c.lineTo(x+16,yy-18);c.lineTo(x+10,yy-17);c.fill();}
        else if(el==="Earth"){c.fillRect(x-5,yy-22,10,5);}
        else if(el==="Ice"){c.fillRect(x-1,yy-25,2,10);c.fillRect(x-6,yy-21,10,2);c.fillRect(x-5,yy-24,8,2);}
        else if(el==="Wind"){c.beginPath();c.arc(x+8,yy-20,5,0,Math.PI*1.6);c.fill();c.beginPath();c.arc(x-6,yy-18,3,0,Math.PI*1.6);c.fill();}
        else if(el==="Psychic"){c.beginPath();c.arc(x,yy-22,4,0,Math.PI*2);c.fill();c.fillRect(x-7,yy-23,2,2);c.fillRect(x+5,yy-23,2,2);}
        else if(el==="Bug"){c.fillRect(x-6,yy-24,3,3);c.fillRect(x-1,yy-26,3,3);c.fillRect(x+4,yy-24,3,3);}
        else if(el==="Dark"){c.beginPath();c.arc(x+8,yy-20,5,.4,Math.PI*1.4);c.fill();c.beginPath();c.arc(x-7,yy-20,4,.4,Math.PI*1.4);c.fill();}
        else if(el==="Ground"){c.fillRect(x-6,yy-22,3,3);c.fillRect(x-1,yy-24,3,3);c.fillRect(x+4,yy-22,3,3);}
        else if(el==="Metal"){c.fillRect(x-1,yy-26,2,8);c.fillRect(x-5,yy-22,10,2);}
        else if(el==="Fairy"){c.beginPath();c.moveTo(x,yy-26);c.lineTo(x+3,yy-20);c.lineTo(x,yy-16);c.lineTo(x-3,yy-20);c.fill();c.beginPath();c.arc(x+8,yy-18,2,0,Math.PI*2);c.fill();}
        else if(el==="Poison"){c.beginPath();c.moveTo(x,yy-26);c.quadraticCurveTo(x+4,yy-20,x,yy-16);c.quadraticCurveTo(x-4,yy-20,x,yy-26);c.fill();}
        else if(el==="Dragon"){c.beginPath();c.moveTo(x,yy-28);c.lineTo(x+5,yy-18);c.lineTo(x,yy-14);c.lineTo(x-4,yy-20);c.fill();}
        // name label
        c.font="bold 10px monospace";c.textAlign="center";c.lineWidth=3;c.strokeStyle="#18302b";c.strokeText(cr.name,x,y-27);c.fillStyle="#fff0c7";c.fillText(cr.name,x,y-27);
        c.restore();
      }
      zi++;
    }
  }
  private drawObstacles(){const c=this.ctx,m=this.map;for(const o of m.obstacles){const ox=o.x,oy=o.y,ow=o.w,oh=o.h;
      if(o.kind==="house"){c.fillStyle="#8b5e4c";c.fillRect(ox,oy+48,ow,oh-48);c.fillStyle="#bd7960";c.fillRect(ox-12,oy+34,ow+24,28);c.fillStyle="#604c4b";c.beginPath();c.moveTo(ox-18,oy+42);c.lineTo(ox+ow/2,oy-22);c.lineTo(ox+ow+18,oy+42);c.closePath();c.fill();c.fillStyle="#e9c58b";c.fillRect(ox+ow/2-18,oy+oh-65,36,65);c.fillStyle="#a7c5bd";c.fillRect(ox+24,oy+78,32,30);c.fillRect(ox+ow-56,oy+78,32,30);
        c.fillStyle="#7a4a3a";c.fillRect(ox+ow-50,oy-10,20,25);
        c.fillStyle="#f5d878";c.fillRect(ox+24,oy+78,32,30);c.fillRect(ox+ow-56,oy+78,32,30);
        c.fillStyle="#a7c5bd";c.fillRect(ox+28,oy+82,24,22);c.fillRect(ox+ow-52,oy+82,24,22);
      }
      else if(o.kind==="tree"){const isForest=m.id==="forest";
        c.fillStyle="#76533c";c.fillRect(ox+ow/2-12,oy+50,24,oh-45);
        c.fillStyle="#5a4030";c.fillRect(ox+ow/2+4,oy+52,6,oh-48);
        c.fillStyle=isForest?"#2a5b40":"#326b50";c.fillRect(ox+7,oy+22,ow-14,65);
        c.fillStyle=isForest?"#38704a":"#47865c";c.fillRect(ox+17,oy+4,ow-34,52);
        c.fillStyle=isForest?"#4a8a5a":"#6ca36b";c.fillRect(ox+25,oy+13,16,12);
        if(isForest){c.fillStyle="#3a6840";c.fillRect(ox-5,oy+30,ow+10,30);c.fillStyle="#4a8a5a";c.fillRect(ox+5,oy+15,ow-10,25);}
      }
      else if(o.kind==="rock"){const mossy=m.id==="forest";
        c.fillStyle="#647a78";c.fillRect(ox+12,oy+18,ow-24,oh-18);
        c.fillStyle="#91a49a";c.fillRect(ox+22,oy+8,ow-44,25);
        c.fillStyle="#526b68";c.fillRect(ox+18,oy+oh-20,ow-36,10);
        if(mossy){c.fillStyle="#5a8a5a";c.fillRect(ox+22,oy+6,ow-44,8);c.fillRect(ox+12,oy+16,10,6);}
      }
      else if(o.kind==="fence"){c.fillStyle="#9b7954";c.fillRect(ox,oy,ow,oh);for(let x=ox+8;x<ox+ow;x+=20)c.fillRect(x,oy-6,5,oh+12);
        c.fillStyle="#7a5e40";c.fillRect(ox,oy,ow,4);c.fillRect(ox,oy+oh-4,ow,4);
      }
      else if(o.kind==="pond"){c.fillStyle="#3a7ab0";c.beginPath();c.ellipse(ox+ow/2,oy+oh/2,ow/2,oh/2,0,0,Math.PI*2);c.fill();
        c.fillStyle="#5aa0d0";c.beginPath();c.ellipse(ox+ow/2,oy+oh/2-4,ow/2-8,oh/2-8,0,0,Math.PI*2);c.fill();
        c.fillStyle="rgba(255,255,255,.3)";c.fillRect(ox+ow*0.3,oy+oh*0.3,ow*0.15,2);c.fillRect(ox+ow*0.5,oy+oh*0.5,ow*0.12,2);
        c.fillStyle="#4a9a5a";c.beginPath();c.arc(ox+ow*0.2,oy+oh*0.7,6,0,Math.PI*2);c.fill();c.beginPath();c.arc(ox+ow*0.7,oy+oh*0.3,5,0,Math.PI*2);c.fill();
      }
      else if(o.kind==="well"){c.fillStyle="#6b6b6b";c.fillRect(ox+5,oy+20,ow-10,oh-20);
        c.fillStyle="#8a8a8a";c.fillRect(ox+8,oy+22,ow-16,oh-26);
        c.fillStyle="#3a5a6a";c.beginPath();c.ellipse(ox+ow/2,oy+24,(ow-16)/2,8,0,0,Math.PI*2);c.fill();
        c.fillStyle="#7a5a3a";c.fillRect(ox+3,oy-5,4,25);c.fillRect(ox+ow-7,oy-5,4,25);
        c.fillStyle="#8a4a2a";c.beginPath();c.moveTo(ox-8,oy-2);c.lineTo(ox+ow/2,oy-25);c.lineTo(ox+ow+8,oy-2);c.closePath();c.fill();
        c.fillStyle="#4a3a2a";c.fillRect(ox+ow/2-1,oy-10,2,14);
      }
      else if(o.kind==="windmill"){c.fillStyle="#a89070";c.fillRect(ox+30,oy+60,30,oh-60);
        c.fillStyle="#8a7a5a";c.fillRect(ox+28,oy+58,34,oh-58);
        c.fillStyle="#5a3a2a";c.fillRect(ox+36,oy+oh-30,18,25);
        c.fillStyle="#8a4a2a";c.beginPath();c.moveTo(ox+20,oy+65);c.lineTo(ox+45,oy+35);c.lineTo(ox+70,oy+65);c.closePath();c.fill();
        c.save();c.translate(ox+45,oy+50);c.rotate(this.frame*0.02);
        c.fillStyle="#e8e0d0";for(let i=0;i<4;i++){c.save();c.rotate(i*Math.PI/2);c.fillRect(-3,-28,6,28);c.fillStyle="#c0b8a0";c.fillRect(-3,-28,6,4);c.restore();}
        c.fillStyle="#6a6a6a";c.beginPath();c.arc(0,0,5,0,Math.PI*2);c.fill();c.restore();
        c.fillStyle="#f5d878";c.fillRect(ox+36,oy+75,10,10);c.fillRect(ox+44,oy+95,10,10);
      }
      else if(o.kind==="lantern"){c.fillStyle="#4a4a4a";c.fillRect(ox+7,oy+15,6,oh-15);
        c.fillStyle="#3a3a3a";c.fillRect(ox+4,oy+10,12,5);
        c.fillStyle="#f5d878";c.fillRect(ox+3,oy-5,14,18);
        c.fillStyle="#e8c050";c.fillRect(ox+5,oy-3,10,14);
        c.fillStyle="rgba(245,216,120,.15)";c.beginPath();c.arc(ox+10,oy+4,18,0,Math.PI*2);c.fill();
        c.fillStyle="#3a3a3a";c.fillRect(ox+3,oy-8,14,4);
      }
      else if(o.kind==="flowers"){const colors=["#e85858","#f5d878","#e880c0","#78c8f0","#f0a058"];const seed=(ox*7+oy*3)%colors.length;
        for(let i=0;i<6;i++){const fx=ox+8+(i*7)%(ow-16),fy=oy+6+(i*5)%(oh-12);
          c.fillStyle="#3a8a3a";c.fillRect(fx,fy+4,2,8);
          c.fillStyle=colors[(seed+i)%colors.length];c.beginPath();c.arc(fx+1,fy,4,0,Math.PI*2);c.fill();
          c.fillStyle="#fff0a0";c.fillRect(fx,fy-1,3,3);
        }
      }
      else if(o.kind==="mushroom"){c.fillStyle="#e8e0d0";c.fillRect(ox+10,oy+8,8,oh-8);
        c.fillStyle="#d04040";c.beginPath();c.ellipse(ox+14,oy+8,14,10,0,0,Math.PI*2);c.fill();
        c.fillStyle="#f0f0f0";c.fillRect(ox+8,oy+4,3,3);c.fillRect(ox+18,oy+6,3,2);c.fillRect(ox+14,oy+2,2,2);
        c.fillStyle="#e8e0d0";c.fillRect(ox+1,oy+14,5,oh-14);c.fillStyle="#c080d0";c.beginPath();c.ellipse(ox+3,oy+14,6,5,0,0,Math.PI*2);c.fill();
      }
      else if(o.kind=="log"){c.fillStyle="#7a5a3a";c.fillRect(ox,oy+8,ow,oh-8);
        c.fillStyle="#9a7a5a";c.fillRect(ox,oy+6,ow,6);
        c.fillStyle="#a88a6a";c.fillRect(ox+2,oy+10,8,oh-14);c.fillRect(ox+ow-10,oy+10,8,oh-14);
        c.fillStyle="#6a4a2a";c.beginPath();c.arc(ox+6,oy+oh/2,3,0,Math.PI*2);c.fill();c.beginPath();c.arc(ox+ow-6,oy+oh/2,3,0,Math.PI*2);c.fill();
        c.fillStyle="#5a8a5a";c.fillRect(ox+15,oy+6,ow-30,3);c.fillRect(ox+20,oy+oh-4,ow-40,3);
      }
      else if(o.kind=="sign"){c.fillStyle="#7a5a3a";c.fillRect(ox+8,oy+25,8,oh-25);
        c.fillStyle="#9a7a4a";c.fillRect(ox-4,oy,ow+8,22);
        c.fillStyle="#7a5a3a";c.fillRect(ox-4,oy,ow+8,3);c.fillRect(ox-4,oy+19,ow+8,3);
        c.fillStyle="#5a3a2a";c.fillRect(ox,oy+7,ow-6,5);c.beginPath();c.moveTo(ox+ow-6,oy+4);c.lineTo(ox+ow+2,oy+9);c.lineTo(ox+ow-6,oy+14);c.closePath();c.fill();
      }
      else if(o.kind=="bush"){c.fillStyle="#3a7a3a";c.beginPath();c.arc(ox+ow*0.3,oy+oh*0.6,ow*0.3,0,Math.PI*2);c.fill();
        c.beginPath();c.arc(ox+ow*0.65,oy+oh*0.5,ow*0.28,0,Math.PI*2);c.fill();
        c.beginPath();c.arc(ox+ow*0.5,oy+oh*0.35,ow*0.25,0,Math.PI*2);c.fill();
        c.fillStyle="#4a9a4a";c.beginPath();c.arc(ox+ow*0.35,oy+oh*0.45,ow*0.15,0,Math.PI*2);c.fill();
        c.beginPath();c.arc(ox+ow*0.6,oy+oh*0.35,ow*0.12,0,Math.PI*2);c.fill();
        if(m.id=="forest"){c.fillStyle="#c04060";c.fillRect(ox+ow*0.3,oy+oh*0.4,3,3);c.fillRect(ox+ow*0.55,oy+oh*0.3,3,3);}
      }
      else if(o.kind=="stump"){c.fillStyle="#7a5a3a";c.beginPath();c.ellipse(ox+ow/2,oy+10,ow/2,oh*0.3,0,0,Math.PI*2);c.fill();
        c.fillStyle="#8a6a4a";c.fillRect(ox+2,oy+10,ow-4,oh-10);
        c.fillStyle="#a88a6a";c.beginPath();c.ellipse(ox+ow/2,oy+10,ow/2-3,oh*0.2,0,0,Math.PI*2);c.fill();
        c.fillStyle="#8a6a4a";c.beginPath();c.arc(ox+ow/2,oy+10,3,0,Math.PI*2);c.fill();c.beginPath();c.arc(ox+ow/2,oy+10,7,0,Math.PI*2);c.fill();
        c.fillStyle="#7a5a3a";c.beginPath();c.arc(ox+ow/2,oy+10,4,0,Math.PI*2);c.fill();
        c.fillStyle="#5a8a5a";c.fillRect(ox+4,oy+12,6,3);c.fillRect(ox+ow-12,oy+14,6,3);
      }
      else if(o.kind=="crystal"){const t=this.frame*0.03;
        const glow=0.7+Math.sin(t+ox*0.01)*0.3;
        c.fillStyle=`rgba(120,200,220,${glow*0.2})`;c.beginPath();c.arc(ox+ow/2,oy+oh/2,ow,0,Math.PI*2);c.fill();
        c.fillStyle="#7acce0";c.beginPath();c.moveTo(ox+ow/2,oy);c.lineTo(ox+ow,oy+oh*0.6);c.lineTo(ox+ow*0.7,oy+oh);c.lineTo(ox+ow*0.3,oy+oh);c.lineTo(ox,oy+oh*0.6);c.closePath();c.fill();
        c.fillStyle="#a0e8ff";c.beginPath();c.moveTo(ox+ow/2,oy+2);c.lineTo(ox+ow*0.8,oy+oh*0.5);c.lineTo(ox+ow/2,oy+oh*0.8);c.lineTo(ox+ow*0.3,oy+oh*0.5);c.closePath();c.fill();
        c.fillStyle="#e0f8ff";c.beginPath();c.moveTo(ox+ow/2,oy+4);c.lineTo(ox+ow*0.6,oy+oh*0.4);c.lineTo(ox+ow/2,oy+oh*0.6);c.lineTo(ox+ow*0.42,oy+oh*0.4);c.closePath();c.fill();
      }
      else if(o.kind=="tent"){c.fillStyle="#3a5a4a";c.beginPath();c.moveTo(ox,oy+oh);c.lineTo(ox+ow/2,oy);c.lineTo(ox+ow,oy+oh);c.closePath();c.fill();
        c.fillStyle="#4a7a5a";c.beginPath();c.moveTo(ox+5,oy+oh);c.lineTo(ox+ow/2,oy+10);c.lineTo(ox+ow-5,oy+oh);c.closePath();c.fill();
        c.fillStyle="#2a3a2a";c.beginPath();c.moveTo(ox+ow/2-12,oy+oh);c.lineTo(ox+ow/2,oy+oh-30);c.lineTo(ox+ow/2+12,oy+oh);c.closePath();c.fill();
        c.fillStyle="#d04040";c.fillRect(ox+ow/2-1,oy-8,2,12);c.fillRect(ox+ow/2+1,oy-8,8,5);
      }
    }}
  private drawNPCs(){const c=this.ctx;for(const n of this.map.npcs){this.drawNPC(n.x,n.y,n.color,n.hair,n.outfit);c.font="bold 12px monospace";c.textAlign="center";c.fillStyle="#263d3b";c.fillText(n.name,n.x,n.y-27);const near=Math.hypot(n.x-this.player.x,n.y-this.player.y)<75;const q=n.quest;let marker:string|null=null;
    if(q){if(this.questState.completedQuests.includes(q.id))marker="\u2714";else if(this.questState.activeQuests.includes(q.id))marker="?";else marker="!";}
    else if(near)marker="!";
    if(marker){c.fillStyle="#fff1c7";c.fillRect(n.x-8,n.y-50,16,14);c.fillStyle="#52604d";c.fillText(marker,n.x,n.y-39);}}}
  private drawPlayer(){const bob=this.player.moving?Math.sin(this.step*2)*2:Math.sin(this.frame*.045)*1.2;this.drawSatoshi(this.player.x,this.player.y,bob);}
  // Satoshi-style: red cap with white front, blue jacket, tanned skin
  private drawSatoshi(x:number,y:number,bob=0){const c=this.ctx,yy=Math.round(y+bob),walking=this.player.moving,leg=walking?Math.sin(this.step*2)*3:0;
    c.fillStyle="rgba(30,48,43,.22)";c.fillRect(x-11,y+8,22,6);
    // legs - dark blue pants
    c.fillStyle="#2a3a6a";c.fillRect(x-8,yy+4+leg,6,8);c.fillRect(x+2,yy+4-leg,6,8);
    // shoes
    c.fillStyle="#3a3a4a";c.fillRect(x-9,yy+11+leg,7,3);c.fillRect(x+2,yy+11-leg,7,3);
    // blue jacket body
    c.fillStyle="#2a6dc4";c.fillRect(x-10,yy-10,20,17);
    // white collar / stripe down front
    c.fillStyle="#e8e8e8";c.fillRect(x-2,yy-10,4,17);
    // jacket sleeves (arms)
    c.fillStyle="#2a6dc4";c.fillRect(x-12,yy-8,3,12);c.fillRect(x+9,yy-8,3,12);
    // hands
    c.fillStyle="#e8bd91";c.fillRect(x-12,yy+3,3,3);c.fillRect(x+9,yy+3,3,3);
    // skin face
    c.fillStyle="#e8bd91";c.fillRect(x-8,yy-23,16,15);
    // hair (black) sideburns/back
    c.fillStyle="#2a2520";c.fillRect(x-9,yy-23,2,12);c.fillRect(x+7,yy-23,2,12);
    // red cap
    c.fillStyle="#e24a3a";c.fillRect(x-11,yy-27,22,5);
    c.fillRect(x-9,yy-30,18,4);
    // cap brim (front)
    c.fillStyle="#c03830";c.fillRect(x+1,yy-26,10,3);
    // white cap front panel
    c.fillStyle="#f0f0f0";c.fillRect(x+1,yy-29,8,3);
    // green badge on cap
    c.fillStyle="#4a9a5a";c.fillRect(x+3,yy-29,3,2);
    // eyes - direction-aware
    c.fillStyle="#263b43";const eyeX=this.player.dir==="left"?-5:this.player.dir==="right"?4:2;c.fillRect(x+eyeX,yy-17,3,3);
    if(this.player.dir!=="right")c.fillRect(x+eyeX+6,yy-17,3,3);
    // mouth
    c.fillStyle="#a08070";c.fillRect(x-1,yy-12,3,1);
    // backpack strap
    c.fillStyle="#5a8a3a";c.fillRect(x-10,yy-6,3,10);c.fillRect(x+7,yy-6,3,10);
  }
  private drawNPC(x:number,y:number,color:string,hair:string,outfit:OutfitKind){const c=this.ctx,yy=y,bob=Math.sin(this.frame*.04+hashStr(outfit))*1.5,yyb=Math.round(yy+bob),leg=0;
    c.fillStyle="rgba(30,48,43,.22)";c.fillRect(x-11,y+8,22,6);
    // legs
    c.fillStyle="#473e48";c.fillRect(x-8,yyb+4,6,8);c.fillRect(x+2,yyb+4,6,8);
    // shoes
    c.fillStyle="#3a3a4a";c.fillRect(x-9,yyb+11,7,3);c.fillRect(x+2,yyb+11,7,3);
    // body (outfit-dependent)
    let bodyColor=color;let sleeveColor=color;
    if(outfit==="lab-coat"){bodyColor="#e8e8e8";sleeveColor="#e8e8e8";}
    else if(outfit=="elder"){bodyColor="#6b6b6b";sleeveColor="#5a5a5a";}
    else if(outfit=="ranger"){bodyColor="#4a6a3a";sleeveColor="#4a6a3a";}
    else if(outfit=="farmer"){bodyColor="#b8a060";sleeveColor="#b8a060";}
    else if(outfit=="kid"){bodyColor="#7bb8d0";sleeveColor="#6aa0b8";}
    else if(outfit==="merchant"){bodyColor="#b0506a";sleeveColor="#a04060";}
    else if(outfit=="guitar"){bodyColor="#9a5a3a";sleeveColor="#8a4a2a";}
    c.fillStyle=bodyColor;c.fillRect(x-10,yyb-10,20,17);
    // arms
    c.fillStyle=sleeveColor;c.fillRect(x-12,yyb-8,3,12);c.fillRect(x+9,yyb-8,3,12);
    // hands
    c.fillStyle="#e8bd91";c.fillRect(x-12,yyb+3,3,3);c.fillRect(x+9,yyb+3,3,3);
    // skin face
    c.fillStyle="#e8bd91";c.fillRect(x-8,yyb-23,16,15);
    // hair
    c.fillStyle=hair;
    if(outfit=="elder")c.fillRect(x-10,yyb-29,20,8);
    else if(outfit=="kid")c.fillRect(x-9,yyb-27,18,6);
    else if(outfit=="ranger")c.fillRect(x-10,yyb-28,20,7);
    else if(outfit=="farmer")c.fillRect(x-10,yyb-28,20,6);
    else if(outfit=="merchant")c.fillRect(x-10,yyb-29,20,8);
    else if(outfit=="lab-coat")c.fillRect(x-10,yyb-27,20,5);
    else if(outfit=="guitar")c.fillRect(x-10,yyb-27,20,6);
    else c.fillRect(x-10,yyb-27,20,6);
    // outfit-specific extras
    if(outfit==="lab-coat"){c.fillStyle="#a0a0a0";c.fillRect(x-3,yyb-10,6,17);}
    if(outfit=="guitar"){c.fillStyle="#8a5a3a";c.fillRect(x-6,yyb-2,12,7);c.fillStyle="#6a4a2a";c.fillRect(x-4,yyb,8,3);}
    if(outfit=="ranger"){c.fillStyle="#3a5a2a";c.fillRect(x-10,yyb-15,20,3);}
    if(outfit=="elder")c.fillRect(x-3,yyb+4,6,2);
    if(outfit=="kid")c.fillRect(x-3,yyb-8,6,3);
    // eyes (static, facing down)
    c.fillStyle="#263b43";c.fillRect(x-5,yyb-17,3,3);c.fillRect(x+4,yyb-17,3,3);
    c.fillStyle="#fff8e8";c.fillRect(x-5,yyb-17,1,1);c.fillRect(x+4,yyb-17,1,1);
    c.fillStyle="#a08070";c.fillRect(x-1,yyb-12,3,1);
  }
  private drawDecor(){const c=this.ctx,m=this.map;
    // map-specific ambient particles
    for(let i=0;i<40;i++){const x=(i*173+91)%m.width,y=(i*239+127)%m.height;if(m.obstacles.some(o=>x>o.x-25&&x<o.x+o.w+25&&y>o.y-25&&y<o.y+o.h+25))continue;
      if(m.id==="town"){// falling leaves
        const fy=(y+this.frame*0.3)%m.height;c.fillStyle=i%2?"#f1d58d":"#e7a98c";c.fillRect(x,fy,3,3);c.fillRect(x+3,fy-3,3,3);
      }else if(m.id=="meadow"){// pollen/firefly sparkles
        const fx=x+Math.sin(this.frame*0.02+i)*3;c.fillStyle=i%3==0?"#fff0a0":"#e8c46b";c.fillRect(fx,y,2,2);
      }else{// forest fireflies
        const fx=x+Math.sin(this.frame*0.03+i)*4,fy=y+Math.cos(this.frame*0.02+i)*3;
        c.fillStyle=i%2?"#a0f0a0":"#80d080";c.fillRect(fx,fy,2,2);
        if(i%5==0){c.fillStyle="rgba(160,240,160,.3)";c.beginPath();c.arc(fx,fy,4,0,Math.PI*2);c.fill();}
      }
    }
    // per-map ground patches
    if(m.id=="town"){// grass tufts near houses
      for(let i=0;i<20;i++){const x=(i*211+50)%m.width,y=(i*97+400)%m.height;if(m.obstacles.some(o=>x>o.x-15&&x<o.x+o.w+15&&y>o.y-15&&y<o.y+o.h+15))continue;c.fillStyle="#6aa86a";c.fillRect(x,y,2,4);c.fillRect(x+2,y+1,2,3);}
    }else if(m.id=="meadow"){// sun spots
      for(let i=0;i<15;i++){const x=(i*167+80)%m.width,y=(i*113+100)%m.height;if(m.obstacles.some(o=>x>o.x-20&&x<o.x+o.w+20&&y>o.y-20&&y<o.y+o.h+20))continue;c.fillStyle="rgba(255,240,180,.12)";c.beginPath();c.arc(x,y,18,0,Math.PI*2);c.fill();}
    }else{// forest fog patches
      for(let i=0;i<12;i++){const x=(i*191+60)%m.width,y=(i*137+200)%m.height;if(m.obstacles.some(o=>x>o.x-20&&x<o.x+o.w+20&&y>o.y-20&&y<o.y+o.h+20))continue;c.fillStyle="rgba(160,200,170,.08)";c.beginPath();c.arc(x,y,25,0,Math.PI*2);c.fill();}
    }
  }
  private drawVignette(){const c=this.ctx,g=c.createRadialGradient(480,260,140,480,270,600);g.addColorStop(0,"rgba(0,0,0,0)");g.addColorStop(1,"rgba(15,35,39,.22)");c.fillStyle=g;c.fillRect(0,0,this.canvas.width,this.canvas.height);}
}

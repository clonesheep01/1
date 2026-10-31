import { GameMap, MapId, maps, NPC, TILE } from "./maps";
export type GameEvent = { type:"map"; name:string; mapId:MapId; viaTeleport?:boolean } | { type:"dialogue"; text:string } | { type:"grass" } | { type:"hint"; text:string };
type Direction = "down" | "up" | "left" | "right";
const clamp=(v:number,min:number,max:number)=>Math.max(min,Math.min(max,v));

export class GameEngine {
  private ctx: CanvasRenderingContext2D;
  private frame=0; private raf=0; private last=0; private keys=new Set<string>();
  private player={x:850,y:650,speed:190,dir:"down" as Direction,moving:false};
  private map:GameMap=maps.town; private camera={x:0,y:0}; private dialogueIndex=0; private activeNPC:NPC|null=null;
  private grassCooldown=0; private step=0; private running=false; private saveClock=0;
  constructor(private canvas:HTMLCanvasElement,private onEvent:(event:GameEvent)=>void,initialState?:{mapId:MapId;x:number;y:number},private onPosition?:(state:{mapId:MapId;x:number;y:number})=>void){
    const ctx=canvas.getContext("2d"); if(!ctx) throw new Error("Canvas không được hỗ trợ"); this.ctx=ctx;
    this.ctx.imageSmoothingEnabled=false;
    if(initialState && maps[initialState.mapId]){this.map=maps[initialState.mapId];this.player.x=clamp(initialState.x,20,this.map.width-20);this.player.y=clamp(initialState.y,20,this.map.height-20);}
    window.addEventListener("keydown",this.keyDown); window.addEventListener("keyup",this.keyUp); window.addEventListener("blur",this.clearKeys);
  }
  start(){this.running=true;this.last=performance.now();this.loop(this.last);}
  stop(){this.running=false;cancelAnimationFrame(this.raf);window.removeEventListener("keydown",this.keyDown);window.removeEventListener("keyup",this.keyUp);window.removeEventListener("blur",this.clearKeys);}
  dismissDialogue(){this.activeNPC=null;this.dialogueIndex=0;}
  getPosition(){return {mapId:this.map.id,x:Math.round(this.player.x),y:Math.round(this.player.y)};}
  teleportTo(mapId:MapId){
    const destination=maps[mapId];if(!destination)return false;
    const spawns:Record<MapId,{x:number;y:number}>={town:{x:1600,y:620},meadow:{x:160,y:590},forest:{x:900,y:150}};
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
    for(const z of this.map.zones.filter(z=>z.type==="portal"))if(this.inside(this.player.x,this.player.y,z)){this.usePortal(z);break;}
  }
  private move(dx:number,dy:number){const nx=this.player.x+dx,ny=this.player.y+dy;const box={x:nx-10,y:ny-8,w:20,h:16};if(!this.map.obstacles.some(o=>box.x<o.x+o.w&&box.x+box.w>o.x&&box.y<o.y+o.h&&box.y+box.h>o.y)){this.player.x=nx;this.player.y=ny;}}
  private inside(x:number,y:number,z:{x:number;y:number;w:number;h:number}){return x>z.x&&x<z.x+z.w&&y>z.y&&y<z.y+z.h;}
  private interact(){if(this.activeNPC){this.dialogueIndex++;if(this.dialogueIndex>=this.activeNPC.lines.length){this.dismissDialogue();return;}this.onEvent({type:"dialogue",text:this.activeNPC.lines[this.dialogueIndex]});return;}
    const npc=this.map.npcs.find(n=>Math.hypot(n.x-this.player.x,n.y-this.player.y)<66);if(npc){this.activeNPC=npc;this.dialogueIndex=0;this.onEvent({type:"dialogue",text:npc.lines[0]});return;}
    this.onEvent({type:"hint",text:"Không có ai ở gần để trò chuyện."});
  }
  private usePortal(z:{x:number;y:number;w:number;h:number}){let next:MapId|null=null;if(this.map.id==="town")next=this.player.y<200?"forest":"meadow";else if(this.map.id==="meadow")next=this.player.x<200?"town":"forest";else next="town";if(!next)return;
    this.map=maps[next];if(next==="meadow"){this.player.x=160;this.player.y=590;}else if(next==="forest"){this.player.x=900;this.player.y=150;}else{this.player.x=1600;this.player.y=620;}
    this.camera.x=clamp(this.player.x-this.canvas.width/2,0,this.map.width-this.canvas.width);this.camera.y=clamp(this.player.y-this.canvas.height/2,0,this.map.height-this.canvas.height);this.onEvent({type:"map",name:this.map.name,mapId:this.map.id});
  }
  private draw(){const c=this.ctx,w=this.canvas.width,h=this.canvas.height;c.clearRect(0,0,w,h);c.save();c.translate(-Math.floor(this.camera.x),-Math.floor(this.camera.y));this.drawGround();this.drawZones();this.drawWildCreatures();this.drawObstacles();this.drawNPCs();this.drawPlayer();this.drawDecor();c.restore();this.drawVignette();}
  private drawGround(){const c=this.ctx,m=this.map;c.fillStyle=m.base;c.fillRect(0,0,m.width,m.height);for(let y=0;y<m.height/TILE;y++)for(let x=0;x<m.width/TILE;x++){const v=(x*17+y*31+(x*y)%13)%11;if(v===0){c.fillStyle=this.map.id==="forest"?"#5d8968":this.map.id==="meadow"?"#9ac77b":"#8bc17e";c.fillRect(x*TILE+5,y*TILE+8,3,3);}else if(v===3){c.fillStyle="#719f6b";c.fillRect(x*TILE+22,y*TILE+19,2,3);}}
    c.fillStyle=m.accent;c.fillRect(0,560,m.width,70);c.fillRect(850,0,70,m.height);c.fillStyle="#e6d29a";c.fillRect(0,584,m.width,22);c.fillRect(872,0,22,m.height);
    if(m.id==="town"){c.fillStyle="#b4a078";c.fillRect(0,585,m.width,20);c.fillRect(875,0,20,m.height);}
  }
  private drawZones(){const c=this.ctx;for(const z of this.map.zones){if(z.type==="grass"){c.fillStyle="rgba(47,112,58,.24)";c.fillRect(z.x,z.y,z.w,z.h);for(let x=z.x+8;x<z.x+z.w;x+=17)for(let y=z.y+8;y<z.y+z.h;y+=19){c.fillStyle="#4f9957";c.fillRect(x,y,3,7);c.fillStyle="#b2d67a";c.fillRect(x+3,y+2,2,4);}}else{c.fillStyle="rgba(239,219,139,.2)";c.fillRect(z.x,z.y,z.w,z.h);c.strokeStyle="#f5df9b";c.lineWidth=3;c.strokeRect(z.x+3,z.y+3,z.w-6,z.h-6);c.fillStyle="#fff0b8";c.fillRect(z.x+z.w/2-3,z.y+z.h/2-3,6,6);}}}
  private drawWildCreatures(){
    const c=this.ctx;
    const species=[
      {key:"fire",name:"Tàn Miêu",body:"#e87543",light:"#ffd27b",dark:"#873d31"},
      {key:"water",name:"Bọt Bông",body:"#4da9d0",light:"#c5f3ff",dark:"#245b80"},
      {key:"grass",name:"Mầm Rêu",body:"#69a95d",light:"#d1ed91",dark:"#315e42"},
      {key:"electric",name:"Điện Chồn",body:"#dfbd3e",light:"#fff2a0",dark:"#80651e"},
      {key:"earth",name:"Cuội Con",body:"#9a8269",light:"#e5d0ac",dark:"#594d43"}
    ];
    for(const zone of this.map.zones.filter(z=>z.type==="grass")){
      for(let i=0;i<3;i++){
        const sp=species[(i+(this.map.id==="forest"?2:this.map.id==="meadow"?0:1))%species.length];
        const x=Math.round(zone.x+zone.w*(.22+i*.27));
        const y=Math.round(zone.y+zone.h*(i%2===0?.38:.68));
        const bob=Math.sin(this.frame*.055+i*2)*2;
        const yy=Math.round(y+bob);
        c.save();
        c.fillStyle="rgba(24,48,34,.28)";c.beginPath();c.ellipse(x,y+13,13,4,0,0,Math.PI*2);c.fill();
        // distinctive ears / elemental crest
        c.fillStyle=sp.body;c.strokeStyle=sp.dark;c.lineWidth=2;
        c.beginPath();
        if(sp.key==="fire"){c.moveTo(x-9,yy-5);c.lineTo(x-13,yy-20);c.lineTo(x-3,yy-12);c.lineTo(x+5,yy-12);c.lineTo(x+13,yy-20);c.lineTo(x+10,yy-4);}
        else if(sp.key==="water"){c.moveTo(x-10,yy-5);c.quadraticCurveTo(x-20,yy-21,x-7,yy-19);c.quadraticCurveTo(x+1,yy-13,x+2,yy-5);c.moveTo(x+4,yy-5);c.quadraticCurveTo(x+9,yy-22,x+17,yy-14);c.quadraticCurveTo(x+17,yy-6,x+10,yy-3);}
        else if(sp.key==="grass"){c.moveTo(x-10,yy-5);c.quadraticCurveTo(x-17,yy-22,x-4,yy-18);c.lineTo(x+1,yy-7);c.quadraticCurveTo(x+8,yy-25,x+16,yy-18);c.lineTo(x+10,yy-4);}
        else if(sp.key==="electric"){c.moveTo(x-11,yy-5);c.lineTo(x-12,yy-17);c.lineTo(x-3,yy-12);c.lineTo(x+1,yy-22);c.lineTo(x+6,yy-11);c.lineTo(x+14,yy-17);c.lineTo(x+10,yy-4);}
        else{c.moveTo(x-12,yy-4);c.lineTo(x-9,yy-18);c.lineTo(x-1,yy-12);c.lineTo(x+4,yy-22);c.lineTo(x+9,yy-11);c.lineTo(x+14,yy-16);c.lineTo(x+11,yy-3);}
        c.closePath();c.fill();c.stroke();
        // rounded body with outline
        c.fillStyle=sp.body;c.beginPath();c.ellipse(x,yy+2,12,13,0,0,Math.PI*2);c.fill();c.stroke();
        c.fillStyle=sp.light;c.beginPath();c.ellipse(x,yy+7,7,7,0,0,Math.PI*2);c.fill();
        // paws
        c.fillStyle=sp.dark;c.fillRect(x-9,yy+10,6,5);c.fillRect(x+4,yy+10,6,5);
        // eyes and muzzle
        c.fillStyle="#fff8e8";c.fillRect(x-7,yy-3,5,6);c.fillRect(x+2,yy-3,5,6);
        c.fillStyle="#263b43";c.fillRect(x-5,yy-1,2,3);c.fillRect(x+4,yy-1,2,3);
        c.fillStyle=sp.dark;c.fillRect(x-2,yy+5,4,2);
        // small elemental sparkle
        c.fillStyle=sp.light;
        if(sp.key==="fire"){c.beginPath();c.moveTo(x,yy-25);c.lineTo(x+4,yy-18);c.lineTo(x,yy-14);c.lineTo(x-3,yy-20);c.fill();}
        if(sp.key==="water"){c.beginPath();c.arc(x+14,yy-13,3,0,Math.PI*2);c.fill();}
        if(sp.key==="grass"){c.fillRect(x-2,yy-23,5,5);c.fillRect(x+2,yy-25,4,3);}
        if(sp.key==="electric"){c.beginPath();c.moveTo(x+10,yy-22);c.lineTo(x+4,yy-12);c.lineTo(x+10,yy-14);c.lineTo(x+7,yy-7);c.lineTo(x+16,yy-18);c.lineTo(x+10,yy-17);c.fill();}
        if(sp.key==="earth"){c.fillRect(x-5,yy-22,10,5);}
        c.font="bold 10px monospace";c.textAlign="center";c.lineWidth=3;c.strokeStyle="#18302b";c.strokeText(sp.name,x,y-27);c.fillStyle="#fff0c7";c.fillText(sp.name,x,y-27);
        c.restore();
      }
    }
  }
  private drawObstacles(){const c=this.ctx;for(const o of this.map.obstacles){if(o.kind==="house"){c.fillStyle="#8b5e4c";c.fillRect(o.x,o.y+48,o.w,o.h-48);c.fillStyle="#bd7960";c.fillRect(o.x-12,o.y+34,o.w+24,28);c.fillStyle="#604c4b";c.beginPath();c.moveTo(o.x-18,o.y+42);c.lineTo(o.x+o.w/2,o.y-22);c.lineTo(o.x+o.w+18,o.y+42);c.closePath();c.fill();c.fillStyle="#e9c58b";c.fillRect(o.x+o.w/2-18,o.y+o.h-65,36,65);c.fillStyle="#a7c5bd";c.fillRect(o.x+24,o.y+78,32,30);c.fillRect(o.x+o.w-56,o.y+78,32,30);}
      else if(o.kind==="tree"){c.fillStyle="#76533c";c.fillRect(o.x+o.w/2-12,o.y+50,24,o.h-45);c.fillStyle="#326b50";c.fillRect(o.x+7,o.y+22,o.w-14,65);c.fillStyle="#47865c";c.fillRect(o.x+17,o.y+4,o.w-34,52);c.fillStyle="#6ca36b";c.fillRect(o.x+25,o.y+13,16,12);}
      else if(o.kind==="rock"){c.fillStyle="#647a78";c.fillRect(o.x+12,o.y+18,o.w-24,o.h-18);c.fillStyle="#91a49a";c.fillRect(o.x+22,o.y+8,o.w-44,25);c.fillStyle="#526b68";c.fillRect(o.x+18,o.y+o.h-20,o.w-36,10);}
      else{c.fillStyle="#9b7954";c.fillRect(o.x,o.y,o.w,o.h);for(let x=o.x+8;x<o.x+o.w;x+=20)c.fillRect(x,o.y-6,5,o.h+12);}
    }}
  private drawNPCs(){const c=this.ctx;for(const n of this.map.npcs){this.drawPerson(n.x,n.y,n.color,false);c.font="bold 12px monospace";c.textAlign="center";c.fillStyle="#263d3b";c.fillText(n.name,n.x,n.y-27);if(Math.hypot(n.x-this.player.x,n.y-this.player.y)<75){c.fillStyle="#fff1c7";c.fillRect(n.x-8,n.y-50,16,14);c.fillStyle="#52604d";c.fillText("!",n.x,n.y-39);}}}
  private drawPlayer(){const bob=this.player.moving?Math.sin(this.step*2)*2:Math.sin(this.frame*.045)*1.2;this.drawPerson(this.player.x,this.player.y,"#75a9bd",true,bob);}
  private drawPerson(x:number,y:number,color:string,hero:boolean,bob=0){const c=this.ctx,yy=Math.round(y+bob),walking=this.player.moving&&hero,leg=walking?Math.sin(this.step*2)*3:0;c.fillStyle="rgba(30,48,43,.22)";c.fillRect(x-11,y+8,22,6);c.fillStyle="#473e48";c.fillRect(x-8,yy+4+leg,6,8);c.fillRect(x+2,yy+4-leg,6,8);c.fillStyle=color;c.fillRect(x-10,yy-10,20,17);c.fillStyle="#e8bd91";c.fillRect(x-8,yy-23,16,15);c.fillStyle=hero?"#594b58":"#554b43";c.fillRect(x-9,yy-25,18,6);c.fillRect(x-11,yy-21,4,8);c.fillStyle="#34434a";const eyeX=this.player.dir==="left"?-5:this.player.dir==="right"?4:2;c.fillRect(x+eyeX,yy-17,3,3);if(hero){c.fillStyle="#d6e6d8";c.fillRect(x-10,yy-7,20,3);}}
  private drawDecor(){const c=this.ctx;for(let i=0;i<32;i++){const x=(i*173+91)%this.map.width,y=(i*239+127)%this.map.height;if(this.map.obstacles.some(o=>x>o.x-20&&x<o.x+o.w+20&&y>o.y-20&&y<o.y+o.h+20))continue;c.fillStyle=i%2?"#f1d58d":"#e7a98c";c.fillRect(x,y,3,3);c.fillRect(x+3,y-3,3,3);}}
  private drawVignette(){const c=this.ctx,g=c.createRadialGradient(480,260,140,480,270,600);g.addColorStop(0,"rgba(0,0,0,0)");g.addColorStop(1,"rgba(15,35,39,.22)");c.fillStyle=g;c.fillRect(0,0,this.canvas.width,this.canvas.height);}
}
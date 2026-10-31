export type MapId = "town" | "meadow" | "forest";
export type NPC = { x: number; y: number; name: string; lines: string[]; color: string };
export type Obstacle = { x: number; y: number; w: number; h: number; kind: "tree" | "house" | "rock" | "fence" };
export type Zone = { x: number; y: number; w: number; h: number; type: "grass" | "portal" };
export type GameMap = { id: MapId; name: string; width: number; height: number; base: string; accent: string; obstacles: Obstacle[]; npcs: NPC[]; zones: Zone[] };

export const TILE = 32;
export const maps: Record<MapId, GameMap> = {
  town: {
    id: "town", name: "Thị trấn Mộc Miên", width: 1800, height: 1200, base: "#83b978", accent: "#d6bd82",
    obstacles: [
      {x:180,y:130,w:190,h:150,kind:"house"},{x:470,y:110,w:190,h:150,kind:"house"},{x:1300,y:130,w:210,h:160,kind:"house"},
      {x:900,y:100,w:70,h:100,kind:"tree"},{x:1080,y:360,w:75,h:105,kind:"tree"},{x:300,y:760,w:75,h:105,kind:"tree"},
      {x:1450,y:760,w:75,h:105,kind:"tree"},{x:800,y:850,w:100,h:90,kind:"rock"},
      {x:80,y:500,w:90,h:25,kind:"fence"},{x:1650,y:500,w:90,h:25,kind:"fence"}
    ],
    npcs: [{x:720,y:500,name:"Mira",lines:["Xin chào! Chào mừng bạn đến thị trấn Mộc Miên.","Phía đông là đồng cỏ xanh. Hãy cẩn thận khi đi vào cỏ cao nhé!"],color:"#d98b72"},{x:1150,y:690,name:"Ông Bảy",lines:["Khu rừng phía bắc có rất nhiều điều kỳ lạ.","Người ta nói những bụi cỏ đôi khi chuyển động dù không có gió..."],color:"#e0b85e"}],
    zones: [{x:1670,y:590,w:80,h:100,type:"portal"},{x:850,y:35,w:100,h:70,type:"portal"}]
  },
  meadow: {
    id:"meadow",name:"Đồng cỏ Ánh Dương",width:1800,height:1200,base:"#8fbd72",accent:"#d7c47c",
    obstacles:[{x:230,y:230,w:90,h:100,kind:"tree"},{x:570,y:760,w:90,h:100,kind:"tree"},{x:1280,y:210,w:90,h:100,kind:"tree"},{x:1450,y:800,w:100,h:110,kind:"rock"},{x:950,y:500,w:80,h:90,kind:"rock"}],
    npcs:[{x:500,y:440,name:"Lúa",lines:["Đồng cỏ này đẹp nhất vào buổi sáng.","Đừng ngạc nhiên nếu cỏ cao rung lên nhé!"],color:"#e8c46b"}],
    zones:[{x:100,y:430,w:400,h:300,type:"grass"},{x:700,y:170,w:450,h:360,type:"grass"},{x:1180,y:650,w:430,h:350,type:"grass"},{x:20,y:550,w:70,h:100,type:"portal"},{x:1680,y:550,w:80,h:100,type:"portal"}]
  },
  forest:{
    id:"forest",name:"Rừng Thì Thầm",width:1800,height:1200,base:"#527d60",accent:"#b4a77a",
    obstacles:[{x:120,y:120,w:100,h:125,kind:"tree"},{x:300,y:380,w:100,h:125,kind:"tree"},{x:550,y:100,w:100,h:125,kind:"tree"},{x:800,y:310,w:100,h:125,kind:"tree"},{x:1100,y:130,w:100,h:125,kind:"tree"},{x:1450,y:350,w:100,h:125,kind:"tree"},{x:250,y:850,w:100,h:125,kind:"tree"},{x:700,y:800,w:100,h:125,kind:"tree"},{x:1250,y:850,w:100,h:125,kind:"tree"},{x:1600,y:900,w:100,h:125,kind:"tree"}],
    npcs:[{x:920,y:650,name:"Người gác rừng",lines:["Khu rừng luôn ghi nhớ dấu chân của người lữ hành.","Hãy quan sát những bụi cỏ. Biết đâu bạn sẽ tìm thấy điều thú vị."],color:"#b8c6a0"}],
    zones:[{x:450,y:550,w:300,h:260,type:"grass"},{x:1050,y:500,w:400,h:330,type:"grass"},{x:850,y:20,w:90,h:80,type:"portal"}]
  }
};
export type MapId = "town" | "meadow" | "forest";
export type OutfitKind = "red-cap" | "guitar" | "farmer" | "ranger" | "lab-coat" | "elder" | "kid" | "merchant";
export type Quest = {
  id: string;
  title: string;
  description: string;
  targetCreatureId?: string;
  targetCount: number;
  reward: string;
  introLine: string;
  progressLine: (n: number) => string;
  doneLine: string;
};
export type NPC = {
  x: number; y: number; name: string;
  lines: string[];
  color: string;
  hair: string;
  outfit: OutfitKind;
  quest?: Quest;
};
export type ObstacleKind = "tree" | "house" | "rock" | "fence" | "pond" | "well" | "windmill" | "lantern" | "flowers" | "mushroom" | "log" | "sign" | "bush" | "tent" | "crystal" | "stump";
export type Obstacle = { x: number; y: number; w: number; h: number; kind: ObstacleKind };
export type Zone = { x: number; y: number; w: number; h: number; type: "grass" };
export type GameMap = { id: MapId; name: string; width: number; height: number; base: string; accent: string; obstacles: Obstacle[]; npcs: NPC[]; zones: Zone[] };

export const TILE = 32;
export const maps: Record<MapId, GameMap> = {
  town: {
    id: "town", name: "Thị trấn Mộc Miên", width: 1800, height: 1200, base: "#83b978", accent: "#d6bd82",
    obstacles: [
      // houses along the top
      {x:180,y:130,w:190,h:150,kind:"house"},{x:470,y:110,w:190,h:150,kind:"house"},{x:1300,y:130,w:210,h:160,kind:"house"},
      // trees scattered
      {x:900,y:100,w:70,h:100,kind:"tree"},{x:1080,y:360,w:75,h:105,kind:"tree"},{x:300,y:760,w:75,h:105,kind:"tree"},
      {x:1450,y:760,w:75,h:105,kind:"tree"},
      // central well
      {x:830,y:870,w:80,h:70,kind:"well"},
      // fences
      {x:80,y:500,w:90,h:25,kind:"fence"},{x:1650,y:500,w:90,h:25,kind:"fence"},
      // lanterns near paths
      {x:250,y:600,w:20,h:55,kind:"lantern"},{x:1500,y:620,w:20,h:55,kind:"lantern"},
      // flower beds
      {x:120,y:250,w:40,h:30,kind:"flowers"},{x:700,y:280,w:40,h:30,kind:"flowers"},{x:1400,y:250,w:40,h:30,kind:"flowers"},
      // signs
      {x:580,y:620,w:24,h:48,kind:"sign"},
      // bushes
      {x:1000,y:200,w:50,h:40,kind:"bush"},{x:1600,y:850,w:50,h:40,kind:"bush"},
      // small pond
      {x:50,y:800,w:120,h:80,kind:"pond"},
    ],
    npcs: [
      {x:720,y:500,name:"Mira",lines:["Xin chào! Chào mừng bạn đến thị trấn Mộc Miên.","Phía đông là đồng cỏ xanh. Hãy cẩn thận khi đi vào cỏ cao nhé!"],color:"#d98b72",hair:"#3a2820",outfit:"guitar"},
      {x:1150,y:690,name:"Ông Bảy",lines:["Khu rừng phía bắc có rất nhiều điều kỳ lạ.","Người ta nói những bụi cỏ đôi khi chuyển động dù không có gió..."],color:"#e0b85e",hair:"#888888",outfit:"elder"},
      {x:420,y:350,name:"Tiến sĩ Cây",lines:["Chào cháu! Ta là nhà nghiên cứu sinh vật.","Nhiệm vụ của ta: thu phục một sinh vật hệ Cỏ."],color:"#a8c5bd",hair:"#6b6b6b",outfit:"lab-coat",
        quest:{id:"q_grass",title:"Khám phá hệ Cỏ",description:"Thu phục 1 sinh vật hệ Cỏ để giúp Tiến sĩ Cây nghiên cứu.",targetCount:1,targetCreatureId:"leafy",reward:"Nhận 3 Quả cầu thu phục",introLine:"Cháu ơi, ta đang nghiên cứu hệ Cỏ. Thu phục cho ta một Leafy nhé! Khi xong, quay lại gặp ta.",progressLine:(n:number)=>`Đã thu phục ${n}/1 sinh vật hệ Cỏ. Cố lên cháu!`,doneLine:"Tuyệt vời! Cháu đã mang về một Leafy. Đây là phần thưởng: 3 Quả cầu thu phục!"}},
      {x:1500,y:350,name:"Bà Thương",lines:["Ta bán đồ đây. Nhiệm vụ của ta: thu phục 2 sinh vật bất kỳ."],color:"#e8a0b0",hair:"#aa5566",outfit:"merchant",
        quest:{id:"q_catch2",title:"Thu phục sinh vật",description:"Thu phục 2 sinh vật hoang dã bất kỳ.",targetCount:2,reward:"Nhận 2 Bình thuốc",introLine:"Cháu hãy thử thu phục 2 sinh vật hoang dã giúp bà nhé. Quay lại khi xong!",progressLine:(n:number)=>`Đã thu phục ${n}/2 sinh vật. Còn nữa cháu nhé!`,doneLine:"Giỏi lắm! Đây là 2 Bình thuốc cho cháu."}}
    ],
    zones: []
  },
  meadow: {
    id:"meadow",name:"Đồng cỏ Ánh Dương",width:1800,height:1200,base:"#8fbd72",accent:"#d7c47c",
    obstacles:[
      // scattered trees
      {x:230,y:230,w:90,h:100,kind:"tree"},{x:570,y:760,w:90,h:100,kind:"tree"},{x:1280,y:210,w:90,h:100,kind:"tree"},
      // rocks
      {x:1450,y:800,w:100,h:110,kind:"rock"},{x:950,y:500,w:80,h:90,kind:"rock"},
      // windmill — landmark
      {x:200,y:380,w:90,h:160,kind:"windmill"},
      // large pond
      {x:1300,y:500,w:180,h:120,kind:"pond"},
      // flowers everywhere
      {x:350,y:600,w:40,h:30,kind:"flowers"},{x:600,y:400,w:40,h:30,kind:"flowers"},{x:1100,y:720,w:40,h:30,kind:"flowers"},{x:1400,y:300,w:40,h:30,kind:"flowers"},{x:500,y:850,w:40,h:30,kind:"flowers"},
      // bushes
      {x:100,y:200,w:50,h:40,kind:"bush"},{x:1600,y:400,w:50,h:40,kind:"bush"},{x:1200,y:850,w:50,h:40,kind:"bush"},
      // fence around a farm patch
      {x:400,y:620,w:100,h:25,kind:"fence"},
      // sign post
      {x:780,y:600,w:24,h:48,kind:"sign"},
      // log
      {x:1100,y:420,w:80,h:35,kind:"log"},
    ],
    npcs:[
      {x:500,y:440,name:"Lúa",lines:["Đồng cỏ này đẹp nhất vào buổi sáng.","Đừng ngạc nhiên nếu cỏ cao rung lên nhé!"],color:"#e8c46b",hair:"#5a4a2a",outfit:"farmer"},
      {x:850,y:300,name:"Bé Mây",lines:["Anh ơi! Anh có thể giúp em thu phục sinh vật không?"],color:"#7bb8d0",hair:"#3a2a4a",outfit:"kid",
        quest:{id:"q_water",title:"Tìm sinh vật nước",description:"Thu phục 1 sinh vật hệ Nước cho Bé Mây.",targetCount:1,targetCreatureId:"aquarion",reward:"Nhận 3 Bình thuốc",introLine:"Em rất thích sinh vật hệ Nước! Anh thu phục giúp em một Aquarion nhé?",progressLine:(n:number)=>`Đã thu phục ${n}/1 sinh vật hệ Nước. Anh cố lên nhé!`,doneLine:"Anh thật tuyệt! Em cảm ơn anh. Đây là 3 Bình thuốc!"}}
    ],
    zones:[{x:100,y:430,w:400,h:300,type:"grass"},{x:700,y:170,w:450,h:360,type:"grass"},{x:1180,y:650,w:430,h:350,type:"grass"}]
  },
  forest:{
    id:"forest",name:"Rừng Thì Thầm",width:1800,height:1200,base:"#527d60",accent:"#b4a77a",
    obstacles:[
      // dense trees
      {x:120,y:120,w:100,h:125,kind:"tree"},{x:300,y:380,w:100,h:125,kind:"tree"},{x:550,y:100,w:100,h:125,kind:"tree"},{x:800,y:310,w:100,h:125,kind:"tree"},{x:1100,y:130,w:100,h:125,kind:"tree"},{x:1450,y:350,w:100,h:125,kind:"tree"},{x:250,y:850,w:100,h:125,kind:"tree"},{x:700,y:800,w:100,h:125,kind:"tree"},{x:1250,y:850,w:100,h:125,kind:"tree"},{x:1600,y:900,w:100,h:125,kind:"tree"},
      // mushrooms
      {x:450,y:300,w:30,h:25,kind:"mushroom"},{x:950,y:700,w:30,h:25,kind:"mushroom"},{x:1300,y:600,w:30,h:25,kind:"mushroom"},{x:350,y:700,w:30,h:25,kind:"mushroom"},
      // logs
      {x:650,y:460,w:80,h:35,kind:"log"},{x:1380,y:700,w:80,h:35,kind:"log"},
      // stumps
      {x:500,y:250,w:35,h:30,kind:"stump"},{x:1200,y:450,w:35,h:30,kind:"stump"},
      // mossy rocks
      {x:900,y:500,w:70,h:75,kind:"rock"},{x:1500,y:800,w:70,h:75,kind:"rock"},
      // crystals — magical forest touch
      {x:850,y:850,w:30,h:45,kind:"crystal"},{x:1400,y:500,w:30,h:45,kind:"crystal"},{x:200,y:600,w:30,h:45,kind:"crystal"},
      // bush thickets
      {x:400,y:800,w:60,h:45,kind:"bush"},{x:1100,y:800,w:60,h:45,kind:"bush"},
      // sign
      {x:750,y:600,w:24,h:48,kind:"sign"},
      // tent — ranger camp
      {x:1050,y:780,w:100,h:90,kind:"tent"},
    ],
    npcs:[
      {x:920,y:650,name:"Người gác rừng",lines:["Khu rừng luôn ghi nhớ dấu chân của người lữ hành.","Hãy quan sát những bụi cỏ. Biết đâu bạn sẽ tìm thấy điều thú vị."],color:"#b8c6a0",hair:"#3a3520",outfit:"ranger"},
      {x:600,y:780,name:"Lão Hổ Rừng",lines:["Ta bảo vệ khu rừng này. Nhiệm vụ: thu phục 3 sinh vật."],color:"#c08850",hair:"#4a3020",outfit:"elder",
        quest:{id:"q_catch3",title:"Bảo vệ rừng",description:"Thu phục 3 sinh vật hoang dã để giúp Lão Hổ Rừng.",targetCount:3,reward:"Nhận 5 Quả cầu thu phục",introLine:"Cháu muốn giúp ta bảo vệ rừng? Hãy thu phục 3 sinh vật hoang dã. Quay lại khi xong!",progressLine:(n:number)=>`Đã thu phục ${n}/3 sinh vật. Rừng cần cháu!`,doneLine:"Tuyệt! Cháu đã giúp ta rất nhiều. Đây là 5 Quả cầu thu phục!"}}
    ],
    zones:[{x:450,y:550,w:300,h:260,type:"grass"},{x:1050,y:500,w:400,h:330,type:"grass"}]
  }
};

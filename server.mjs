import http from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { randomUUID, createHash } from 'node:crypto';
import { WebSocketServer, WebSocket } from 'ws';
import { loadSavedWorld, persistWorld, closeStorage } from './storage.mjs';

const PORT = Number(process.env.PORT || 3000);
const ROOT = join(process.cwd(), 'public');
const MAX_MESSAGE = 8192;
const TICK_MS = 120;
const MOVE_STEP = 18;

const SKILLS = ['combat','wood','mine','fish','gather','smith','cook','fletch'];
const INV_KEYS = ['logs','copper','rawFish','herbs','bars','food','moon'];

const WORLD_DEFS = [
  {
    id:0,name:'Greenmeadow',subtitle:'The First Vale',req:1,w:1600,h:1100,theme:'meadow',spawn:{x:330,y:550},
    water:[{x:650,y:0,w:125,h:455},{x:650,y:645,w:125,h:455}],
    buildings:[
      {x:955,y:185,w:210,h:150,label:'The Copper Kettle',kind:'shop'},
      {x:1225,y:195,w:190,h:145,label:'Vale Bank',kind:'bank'},
      {x:1010,y:720,w:230,h:150,label:'Mira’s Hall',kind:'hall'}
    ],
    nodes:[
      ['g-tree-1','tree',215,205],['g-tree-2','tree',330,170],['g-tree-3','tree',465,235],['g-tree-4','tree',245,865],['g-tree-5','tree',380,910],['g-tree-6','tree',520,835],
      ['g-rock-1','rock',840,150],['g-rock-2','rock',850,290],['g-rock-3','rock',900,405],['g-rock-4','rock',1380,840],
      ['g-fish-1','fish',620,315],['g-fish-2','fish',805,760],['g-fish-3','fish',620,900],
      ['g-herb-1','herb',500,520],['g-herb-2','herb',440,650],['g-herb-3','herb',1260,620],['g-herb-4','herb',1390,680]
    ],
    npcs:[
      {id:'mira',type:'quest',name:'Elder Mira',x:1110,y:690,quest:'first_steps',look:'sage'},
      {id:'lyra',type:'shop',name:'Merchant Lyra',x:1060,y:370,look:'merchant'},
      {id:'orrin',type:'bank',name:'Banker Orrin',x:1315,y:385,look:'banker'},
      {id:'jory',type:'quest',name:'Fisher Jory',x:585,y:430,quest:'jory_catch',look:'fisher'},
      {id:'tessa',type:'quest',name:'Baker Tessa',x:900,y:535,quest:'tessa_yeast',look:'merchant'},
      {id:'perrin',type:'quest',name:'Perrin Quill',x:1210,y:535,quest:'perrin_ledger',look:'banker'},
      {id:'brin',type:'quest',name:'Farmer Brin',x:280,y:620,quest:'brin_foxes',look:'fisher'},
      {id:'odo',type:'quest',name:'Carpenter Odo',x:420,y:390,quest:'odo_song',look:'merchant'},
      {id:'sela',type:'quest',name:'Lantern Keeper Sela',x:825,y:680,quest:'sela_lights',look:'sage'},
      {id:'vey',type:'quest',name:'Auntie Vey',x:1400,y:600,quest:'vey_tea',look:'sage'},
      {id:'pip',type:'quest',name:'Pip',x:930,y:905,quest:'pip_rat_crown',look:'fisher'},
      {id:'doran',type:'quest',name:'Miner Doran',x:850,y:460,quest:'doran_first_vein',look:'guard'},
      {id:'gate-iron',type:'gate',name:'Iron Hills Gate',x:1510,y:545,to:1,look:'gate'}
    ],
    monsters:[
      ['g-rat-1','rat','Giant Rat',350,760,1,34],['g-rat-2','rat','Giant Rat',520,720,1,34],['g-fox-1','fox','Wild Fox',880,900,2,42],['g-fox-2','fox','Wild Fox',1410,910,2,42]
    ]
  },
  {
    id:1,name:'Iron Hills',subtitle:'The Broken Range',req:18,w:1750,h:1150,theme:'hills',spawn:{x:190,y:575},
    water:[],
    buildings:[
      {x:260,y:185,w:220,h:145,label:'Wayfarer Camp',kind:'camp'},
      {x:520,y:190,w:195,h:145,label:'Hill Exchange',kind:'shop'}
    ],
    nodes:[
      ['i-tree-1','tree',330,800],['i-tree-2','tree',470,865],['i-tree-3','tree',610,820],['i-tree-4','tree',760,920],
      ['i-rock-1','rock',850,180],['i-rock-2','rock',1010,220],['i-rock-3','rock',1160,160],['i-rock-4','rock',1280,290],['i-rock-5','rock',940,790],['i-rock-6','rock',1130,865],
      ['i-fish-1','fish',410,500],['i-fish-2','fish',560,540],
      ['i-herb-1','herb',820,590],['i-herb-2','herb',1040,560],['i-herb-3','herb',1390,720]
    ],
    npcs:[
      {id:'arden',type:'quest',name:'Guard Arden',x:455,y:430,quest:'goblin_problem',look:'guard'},
      {id:'hollis',type:'shop',name:'Trader Hollis',x:610,y:375,look:'merchant'},
      {id:'nessa',type:'quest',name:'Scout Nessa',x:735,y:455,quest:'nessa_promise',look:'scout'},
      {id:'cora',type:'quest',name:'Miner Cora',x:980,y:355,quest:'cora_lost_pick',look:'guard'},
      {id:'fen',type:'quest',name:'Shepherd Fen',x:1370,y:760,quest:'fen_wolf_bell',look:'fisher'},
      {id:'iven',type:'quest',name:'Scholar Iven',x:1180,y:390,quest:'iven_goblin_poet',look:'sage'},
      {id:'bera',type:'quest',name:'Cook Bera',x:350,y:365,quest:'bera_supper',look:'merchant'},
      {id:'kett',type:'quest',name:'Woodcutter Kett',x:585,y:760,quest:'kett_ironwood',look:'guard'},
      {id:'sol',type:'quest',name:'Cartographer Sol',x:1490,y:410,quest:'sol_compass',look:'scout'},
      {id:'rusk',type:'quest',name:'Mason Rusk',x:730,y:250,quest:'rusk_burial',look:'guard'},
      {id:'wynn',type:'quest',name:'Fletcher Wynn',x:700,y:625,quest:'wynn_bow',look:'scout'},
      {id:'gate-green',type:'gate',name:'Greenmeadow Road',x:90,y:575,to:0,look:'gate'},
      {id:'gate-ruins',type:'gate',name:'Ashen Ruins Pass',x:1660,y:575,to:2,look:'gate'}
    ],
    monsters:[
      ['i-gob-1','goblin','Hill Goblin',900,520,7,82],['i-gob-2','goblin','Hill Goblin',1110,470,7,82],['i-gob-3','goblin','Hill Goblin',1260,650,8,90],
      ['i-wolf-1','wolf','Dire Wolf',840,940,9,98],['i-wolf-2','wolf','Dire Wolf',1430,900,9,98]
    ]
  },
  {
    id:2,name:'Ashen Ruins',subtitle:'The Cinder Crown',req:35,w:1800,h:1200,theme:'ruins',spawn:{x:190,y:600},
    water:[{x:765,y:380,w:270,h:200,lava:true}],
    buildings:[
      {x:1110,y:160,w:280,h:180,label:'Shattered Temple',kind:'ruin'},
      {x:1230,y:850,w:300,h:175,label:'Warden’s Court',kind:'ruin'}
    ],
    nodes:[
      ['a-tree-1','tree',380,250],['a-tree-2','tree',520,290],['a-tree-3','tree',480,940],
      ['a-rock-1','rock',690,220],['a-rock-2','rock',850,190],['a-rock-3','rock',1040,270],['a-rock-4','rock',1580,260],['a-rock-5','rock',1510,760],
      ['a-fish-1','fish',740,480],['a-fish-2','fish',1060,485],
      ['a-herb-1','herb',700,820],['a-herb-2','herb',960,900],['a-herb-3','herb',1490,500]
    ],
    npcs:[
      {id:'elowen',type:'quest',name:'Sage Elowen',x:400,y:600,quest:'ruin_heart',look:'sage'},
      {id:'cael',type:'quest',name:'Echo of Cael',x:1040,y:575,quest:'cael_name',look:'ghost'},
      {id:'edda',type:'quest',name:'Botanist Edda',x:560,y:760,quest:'edda_ash_garden',look:'sage'},
      {id:'varo',type:'quest',name:'Sentinel Varo',x:1180,y:740,quest:'varo_last_watch',look:'guard'},
      {id:'tev',type:'quest',name:'Salvager Tev',x:1510,y:650,quest:'tev_brute',look:'merchant'},
      {id:'numa',type:'quest',name:'Priest Numa',x:1240,y:365,quest:'numa_offering',look:'sage'},
      {id:'orla',type:'quest',name:'Smith Orla',x:690,y:620,quest:'orla_blade_memory',look:'guard'},
      {id:'maelin',type:'quest',name:'Cook Maelin',x:670,y:385,quest:'maelin_emberfish',look:'merchant'},
      {id:'kess',type:'quest',name:'Hunter Kess',x:1510,y:1040,quest:'kess_warden',look:'scout'},
      {id:'sen',type:'quest',name:'Archivist Sen',x:960,y:310,quest:'sen_letters',look:'sage'},
      {id:'gate-iron-back',type:'gate',name:'Iron Hills Pass',x:90,y:600,to:1,look:'gate'}
    ],
    monsters:[
      ['a-skel-1','skeleton','Ash Skeleton',880,720,15,150],['a-skel-2','skeleton','Ash Skeleton',1120,650,15,150],['a-brute-1','brute','Ruin Brute',1430,540,17,190],
      ['a-boss','warden','Ash Warden',1380,980,22,340]
    ]
  }
];

const world = { players:new Map(), sockets:new Map(), zones:new Map(), chat:[] };
let saveTimer = null;

function cleanName(value){
  const s=String(value||'').replace(/[<>\u0000-\u001f]/g,'').trim().slice(0,18);
  return s || 'Wanderer';
}
function cleanChat(value){return String(value||'').replace(/[<>\u0000-\u001f]/g,'').trim().slice(0,220)}
function xpNeeded(lv){return Math.round(100*Math.pow(1.28,lv-1))}
function totalLevel(p){return Object.values(p.skills).reduce((n,s)=>n+s.lv,0)}
function maxHp(p){return p.baseHp+(p.gear.armor==='bronze'?15:0)}
function weaponBonus(p){return p.gear.weapon==='moon'?8:p.gear.weapon==='bronze'?3:p.gear.weapon==='oakbow'?2:0}
function freshSkills(){return Object.fromEntries(SKILLS.map(k=>[k,{lv:1,xp:0}]))}
function emptyInv(){return Object.fromEntries(INV_KEYS.map(k=>[k,0]))}
function emptyBank(){return Object.fromEntries(INV_KEYS.map(k=>[k,0]))}

const SIDE_QUEST_DEFS = [
  {
    "id": "tessa_yeast",
    "npc": "Baker Tessa",
    "title": "The Bread That Refused to Rise",
    "type": "Greenmeadow side story",
    "region": "Greenmeadow",
    "zone": 0,
    "icon": "🍞",
    "chapter": "A Very Flat Morning",
    "startLines": [
      "Every loaf I baked this morning came out flat enough to slide under a locked door.",
      "My starter smells fine, the ovens are hot, and I have blamed three apprentices who do not actually exist.",
      "The only thing missing is sweetleaf. Bring me four bundles of herbs. If the bread still fails, I will be forced to blame the weather."
    ],
    "objectives": [
      {
        "type": "item",
        "item": "herbs",
        "amount": 4,
        "label": "sweetleaf herbs",
        "consume": true
      }
    ],
    "progressLines": [
      "The dough is still sitting there looking smug.",
      "I need four bundles of herbs before I can prove the bread is the problem and not me."
    ],
    "completeChapter": "Loaves With Ambition",
    "completeLines": [
      "There. Look at that rise. Magnificent. Slightly threatening, even.",
      "I owe the apprentices an apology, which will be difficult because, again, they do not exist.",
      "Take this coin and some food. You saved breakfast, which is a more important kind of heroism than people admit."
    ],
    "postLines": [
      "The bread is behaving again.",
      "I still do not trust the third loaf from the left."
    ],
    "reward": {
      "coins": 85,
      "food": 2
    },
    "rewardText": "85 coins + 2 cooked food",
    "readyCue": "You have enough sweetleaf for Tessa’s stubborn dough."
  },
  {
    "id": "perrin_ledger",
    "npc": "Perrin Quill",
    "title": "Copper in the Margins",
    "type": "Greenmeadow mystery",
    "region": "Greenmeadow",
    "zone": 0,
    "icon": "📒",
    "chapter": "A Ledger With Teeth",
    "startLines": [
      "Someone has been altering the Copper Kettle’s account book. Tiny changes. One coin here, two there.",
      "I would blame Lyra, but she cheats honestly and loudly. This is subtler.",
      "The false entries all mention copper weights. Bring me six pieces of copper ore so I can compare the marks stamped into them."
    ],
    "objectives": [
      {
        "type": "item",
        "item": "copper",
        "amount": 6,
        "label": "copper ore",
        "consume": true
      }
    ],
    "progressLines": [
      "Numbers lie less convincingly when you put the metal beside them.",
      "Six pieces of copper should be enough to compare the maker marks."
    ],
    "completeChapter": "The Honest Thief",
    "completeLines": [
      "Ah. Same stamp on every piece: old Vale Bank stock.",
      "Orrin has been rounding down the tavern’s debts for families who cannot pay. Technically fraud. Also technically kindness.",
      "I will correct the ledger. Quietly. Some crimes are improved by accurate bookkeeping rather than punishment."
    ],
    "postLines": [
      "The ledger balances now.",
      "No, I will not tell Lyra why."
    ],
    "reward": {
      "coins": 110
    },
    "rewardText": "110 coins",
    "readyCue": "Perrin can now compare the copper maker marks."
  },
  {
    "id": "brin_foxes",
    "npc": "Farmer Brin",
    "title": "Foxes, Hens, and Other Negotiations",
    "type": "Greenmeadow farm story",
    "region": "Greenmeadow",
    "zone": 0,
    "icon": "🦊",
    "chapter": "Terms of Surrender",
    "startLines": [
      "The foxes have discovered my hens and the hens have discovered screaming.",
      "I tried fences. I tried bells. I tried explaining property law to a fox.",
      "Drive off four Wild Foxes near the eastern fields. Do not bring me tails. I want them frightened, not made into furniture."
    ],
    "objectives": [
      {
        "type": "kill",
        "kind": "fox",
        "amount": 4,
        "label": "Wild Foxes"
      }
    ],
    "progressLines": [
      "The hens are still holding emergency meetings.",
      "Keep the foxes away from the east field and maybe everyone will sleep tonight."
    ],
    "completeChapter": "A Fragile Peace",
    "completeLines": [
      "Quiet. Listen to that. No screaming hens.",
      "I moved the feed bins too. Turns out the foxes were not masterminds; I was simply storing grain beside an unlocked fence.",
      "Take this. You did the brave part. I did the embarrassing part."
    ],
    "postLines": [
      "The foxes stay near the treeline now.",
      "One of them watches me like it remembers the property-law conversation."
    ],
    "reward": {
      "coins": 120,
      "food": 1
    },
    "rewardText": "120 coins + 1 cooked food",
    "readyCue": "The eastern field is quiet. Brin will want to hear that."
  },
  {
    "id": "odo_song",
    "npc": "Carpenter Odo",
    "title": "The Singing Floorboard",
    "type": "Greenmeadow oddity",
    "region": "Greenmeadow",
    "zone": 0,
    "icon": "🪵",
    "chapter": "A House That Hums",
    "startLines": [
      "Mira’s hall has a floorboard that sings whenever anyone lies on it.",
      "Useful, you would think. It is not. It mostly humiliates people during meetings.",
      "I need ten good logs to replace the whole section before the council starts meeting outdoors."
    ],
    "objectives": [
      {
        "type": "item",
        "item": "logs",
        "amount": 10,
        "label": "oak logs",
        "consume": true
      }
    ],
    "progressLines": [
      "The board sang twice this morning. Once for taxes, once for someone claiming not to have eaten the last honey cake.",
      "Ten logs. Straight grain if the forest is feeling generous."
    ],
    "completeChapter": "Silence Underfoot",
    "completeLines": [
      "Perfect fit. Step there and tell me something untrue.",
      "...Nothing. Wonderful.",
      "I kept one sliver of the old board. It hums when I say I am going to throw it away, so apparently we are both trapped in this relationship."
    ],
    "postLines": [
      "Mira’s meetings are quieter now.",
      "Not more honest. Just quieter."
    ],
    "reward": {
      "coins": 135,
      "xp": {
        "skill": "wood",
        "amount": 80
      }
    },
    "rewardText": "135 coins + Woodcutting XP",
    "readyCue": "Odo has enough timber to silence the hall."
  },
  {
    "id": "sela_lights",
    "npc": "Lantern Keeper Sela",
    "title": "Lights on the Water",
    "type": "Greenmeadow folklore",
    "region": "Greenmeadow",
    "zone": 0,
    "icon": "🏮",
    "chapter": "Six Ripples After Sunset",
    "startLines": [
      "People keep reporting blue lights drifting over the river after sunset.",
      "Ghosts, smugglers, moon insects—everyone has a theory. I have a lantern and very little patience.",
      "Fish six times along the Greenmeadow river. The lights always appear where the water is disturbed. Watch the surface for anything unusual."
    ],
    "objectives": [
      {
        "type": "gather",
        "item": "rawFish",
        "amount": 6,
        "label": "river catches",
        "zone": 0
      }
    ],
    "progressLines": [
      "The lights were reported again last night, downstream of the bridge.",
      "Keep disturbing the water. Whatever is there seems curious."
    ],
    "completeChapter": "A Jar of Stars",
    "completeLines": [
      "You saw them too? Good. That means I am not losing my mind in a professionally inconvenient way.",
      "They are tiny moon-moths skimming the water for fish scales. Harmless. Beautiful, even.",
      "I am putting up a sign that says GHOSTS so visitors stop trying to catch them in jars."
    ],
    "postLines": [
      "The moon-moths are back tonight.",
      "The GHOSTS sign is working better than expected."
    ],
    "reward": {
      "coins": 95,
      "xp": {
        "skill": "fish",
        "amount": 70
      }
    },
    "rewardText": "95 coins + Fishing XP",
    "readyCue": "You have seen enough river disturbances to report back to Sela."
  },
  {
    "id": "vey_tea",
    "npc": "Auntie Vey",
    "title": "Tea for a Terrible Mood",
    "type": "Greenmeadow character story",
    "region": "Greenmeadow",
    "zone": 0,
    "icon": "🫖",
    "chapter": "Medicinal, Allegedly",
    "startLines": [
      "Banker Orrin has been frowning so hard I am worried his face will stay that way.",
      "He says he is fine. This is how I know he is not.",
      "Bring me six herbs. I will make tea strong enough to convince him that feelings are not accounting errors."
    ],
    "objectives": [
      {
        "type": "item",
        "item": "herbs",
        "amount": 6,
        "label": "herbs",
        "consume": true
      }
    ],
    "progressLines": [
      "Orrin walked past and said he was 'operational.' People are not mills.",
      "Six herbs. Bitter ones. Cheerful tea is suspicious."
    ],
    "completeChapter": "Balanced Books, Unbalanced Feelings",
    "completeLines": [
      "Excellent. This will taste like wet bark and regret.",
      "Orrin will complain, drink every drop, and then accidentally tell me what is bothering him.",
      "Kindness works best when disguised as something medicinal."
    ],
    "postLines": [
      "Orrin smiled yesterday.",
      "Only once, but I counted it."
    ],
    "reward": {
      "coins": 105,
      "food": 1
    },
    "rewardText": "105 coins + 1 cooked food",
    "readyCue": "Vey has enough herbs to weaponize tea."
  },
  {
    "id": "pip_rat_crown",
    "npc": "Pip",
    "title": "The Rat King of Greenmeadow",
    "type": "Greenmeadow tall tale",
    "region": "Greenmeadow",
    "zone": 0,
    "icon": "👑",
    "chapter": "A Crown Made of Spoons",
    "startLines": [
      "There is a Rat King under the bridge. I saw him. Huge. Terrible. Crown made of spoons.",
      "Mum says it was three rats standing on a sack. Mum was not there.",
      "Defeat five Giant Rats and look for royal evidence. If you find a spoon, that counts."
    ],
    "objectives": [
      {
        "type": "kill",
        "kind": "rat",
        "amount": 5,
        "label": "Giant Rats"
      }
    ],
    "progressLines": [
      "A true king would have guards. That is probably why there are so many rats.",
      "Five should be enough to make the monarchy reveal itself."
    ],
    "completeChapter": "The Abdication",
    "completeLines": [
      "No crown? No spoon? Hm.",
      "Then the Rat King fled before you arrived. Cowardly but strategically sound.",
      "Here. This is my emergency treasure. Do not tell Mum I paid a mercenary."
    ],
    "postLines": [
      "I have revised the story. The Rat King escaped on a boat.",
      "It was a very small boat."
    ],
    "reward": {
      "coins": 75
    },
    "rewardText": "75 coins",
    "readyCue": "Pip’s alleged rat monarchy has been thoroughly challenged."
  },
  {
    "id": "doran_first_vein",
    "npc": "Miner Doran",
    "title": "The First Vein",
    "type": "Greenmeadow profession quest",
    "region": "Greenmeadow",
    "zone": 0,
    "icon": "⛏️",
    "chapter": "Stone Has a Language",
    "startLines": [
      "Anyone can swing a pick. Mining starts when you learn when not to.",
      "Copper here runs in thin veins. Follow the color, listen to the ring, stop before the stone goes dead.",
      "Reach Mining level 4. Then come back and tell me what the rock sounds like."
    ],
    "objectives": [
      {
        "type": "skill",
        "skill": "mine",
        "amount": 4,
        "label": "Mining level"
      }
    ],
    "progressLines": [
      "Do not count swings. Listen for the change in tone.",
      "When your Mining reaches level 4, you will understand why old miners tap walls before they trust them."
    ],
    "completeChapter": "A Better Ear",
    "completeLines": [
      "There. You hear it now, do you not? That hollow note behind the copper.",
      "Good. The pick is the easy part. The hard part is knowing what the mountain is willing to give.",
      "Keep this coin. Consider it tuition refunded."
    ],
    "postLines": [
      "Still listening before you swing? Good.",
      "That habit will save you more than tools."
    ],
    "reward": {
      "coins": 125,
      "xp": {
        "skill": "mine",
        "amount": 90
      }
    },
    "rewardText": "125 coins + Mining XP"
  },
  {
    "id": "cora_lost_pick",
    "npc": "Miner Cora",
    "title": "The Pickaxe With My Name On It",
    "type": "Iron Hills side story",
    "region": "Iron Hills",
    "zone": 1,
    "icon": "⛏️",
    "chapter": "Borrowed Forever",
    "startLines": [
      "Someone borrowed my good pickaxe and returned a terrible one painted the same color.",
      "I carved my name into the handle. They sanded it off. This is now personal.",
      "Bring me ten pieces of copper from the upper rocks. The chip pattern will tell me which crew has been using my pick."
    ],
    "objectives": [
      {
        "type": "item",
        "item": "copper",
        "amount": 10,
        "label": "copper ore",
        "consume": true
      }
    ],
    "progressLines": [
      "Bad tools make liars out of good miners.",
      "Ten ore pieces from these hills should carry enough pick marks to identify the thief."
    ],
    "completeChapter": "Signed in Stone",
    "completeLines": [
      "See these crescent chips? Hollis’s caravan crew. Knew it.",
      "I am not angry they borrowed it. I am angry they returned a fake and expected me not to notice.",
      "I will retrieve my pick. Politely, at first."
    ],
    "postLines": [
      "Got the pick back.",
      "They also apologized to the fake one, somehow."
    ],
    "reward": {
      "coins": 170,
      "xp": {
        "skill": "mine",
        "amount": 120
      }
    },
    "rewardText": "170 coins + Mining XP",
    "readyCue": "Cora has enough pick marks to identify the borrower."
  },
  {
    "id": "fen_wolf_bell",
    "npc": "Shepherd Fen",
    "title": "The Bell in the Wolf Den",
    "type": "Iron Hills rescue story",
    "region": "Iron Hills",
    "zone": 1,
    "icon": "🔔",
    "chapter": "A Sound That Should Not Be There",
    "startLines": [
      "One of my sheep came back without her neck bell. The bell keeps ringing from the wolf country at night.",
      "I know what that probably means. I also know I cannot sleep while it keeps ringing.",
      "Drive off four Dire Wolves. If the bell is still there, I want it back. Some things deserve a burial even if they are only brass."
    ],
    "objectives": [
      {
        "type": "kill",
        "kind": "wolf",
        "amount": 4,
        "label": "Dire Wolves"
      }
    ],
    "progressLines": [
      "Heard it again last night. Three rings, then silence.",
      "The den is south of the ridge. Be careful."
    ],
    "completeChapter": "One Last Ring",
    "completeLines": [
      "You found it. Thank you.",
      "The sheep was named Clover. Stubborn creature. Ate half my coat once.",
      "I will hang the bell by the gate. Not as a warning. Just so the hill remembers her."
    ],
    "postLines": [
      "Clover’s bell catches the wind sometimes.",
      "It sounds better here."
    ],
    "reward": {
      "coins": 210,
      "food": 2
    },
    "rewardText": "210 coins + 2 cooked food",
    "readyCue": "The wolf den is quiet enough for Fen to recover Clover’s bell."
  },
  {
    "id": "iven_goblin_poet",
    "npc": "Scholar Iven",
    "title": "The Goblin Poet",
    "type": "Iron Hills comedy mystery",
    "region": "Iron Hills",
    "zone": 1,
    "icon": "📜",
    "chapter": "Rhyme at Spearpoint",
    "startLines": [
      "Do not laugh. One of the goblin raiders is writing poetry.",
      "We found verses nailed to caravan wheels. Mostly threats, but with surprisingly competent meter.",
      "Defeat six Hill Goblins and look for more scraps. I need enough samples to identify whether we have one poet or an entire literary movement."
    ],
    "objectives": [
      {
        "type": "kill",
        "kind": "goblin",
        "amount": 6,
        "label": "Hill Goblins"
      }
    ],
    "progressLines": [
      "The latest verse rhymes 'plunder' with 'thunder.' Predictable, but structurally sound.",
      "Six goblins should produce a useful sample size."
    ],
    "completeChapter": "Anonymous, Unfortunately",
    "completeLines": [
      "Bad news: there are at least four poets.",
      "Worse news: one is improving.",
      "I am archiving the verses under Military Intelligence so no one asks why I spent public funds on goblin rhyme analysis."
    ],
    "postLines": [
      "A new poem appeared on my door.",
      "I refuse to admit the ending was effective."
    ],
    "reward": {
      "coins": 190
    },
    "rewardText": "190 coins",
    "readyCue": "Iven now has a statistically irresponsible amount of goblin poetry."
  },
  {
    "id": "bera_supper",
    "npc": "Cook Bera",
    "title": "Supper Above the Clouds",
    "type": "Iron Hills cooking story",
    "region": "Iron Hills",
    "zone": 1,
    "icon": "🥘",
    "chapter": "The Patrol Pot",
    "startLines": [
      "Ridge patrol has eaten dried roots for four nights. Morale is becoming a security problem.",
      "I promised them stew before realizing I had no fish and almost no herbs.",
      "Bring five raw fish and three herbs. I will turn them into something that convinces guards life is worth defending."
    ],
    "objectives": [
      {
        "type": "item",
        "item": "rawFish",
        "amount": 5,
        "label": "raw fish",
        "consume": true
      },
      {
        "type": "item",
        "item": "herbs",
        "amount": 3,
        "label": "herbs",
        "consume": true
      }
    ],
    "progressLines": [
      "The pot is hot and tragically empty.",
      "Five fish and three herbs. I can lie about the rest of the ingredients."
    ],
    "completeChapter": "A Bowl Worth Guarding",
    "completeLines": [
      "That smell should carry all the way to the eastern watch.",
      "Food does not win battles, but hungry people lose them faster.",
      "Take a bowl for yourself. You did more than half the work."
    ],
    "postLines": [
      "Patrol sent the pot back scraped clean.",
      "That is the closest guards come to poetry."
    ],
    "reward": {
      "coins": 180,
      "food": 4,
      "xp": {
        "skill": "cook",
        "amount": 110
      }
    },
    "rewardText": "180 coins + 4 food + Cooking XP",
    "readyCue": "Bera finally has enough for the patrol stew."
  },
  {
    "id": "kett_ironwood",
    "npc": "Woodcutter Kett",
    "title": "An Axe for My Father",
    "type": "Iron Hills family story",
    "region": "Iron Hills",
    "zone": 1,
    "icon": "🪓",
    "chapter": "The Handle He Never Finished",
    "startLines": [
      "My father left me an axe head and half a handle. Said he would finish it after winter.",
      "Winter lasted longer than he did.",
      "I am ready to finish it myself. Bring twelve strong logs. I have had the iron for years; turns out the wood was the harder part."
    ],
    "objectives": [
      {
        "type": "item",
        "item": "logs",
        "amount": 12,
        "label": "logs",
        "consume": true
      }
    ],
    "progressLines": [
      "I kept the axe head wrapped in his old scarf.",
      "Twelve logs gives me room to ruin a few before I get the handle right."
    ],
    "completeChapter": "Finished Work",
    "completeLines": [
      "It is not how he would have shaped it.",
      "That bothered me for a minute. Then I realized that is the point. He started it. I finished it.",
      "Here. Take what is left of the timber money. I think I can finally use the axe now."
    ],
    "postLines": [
      "Cuts clean.",
      "Feels like mine. That surprised me."
    ],
    "reward": {
      "coins": 230,
      "xp": {
        "skill": "wood",
        "amount": 140
      }
    },
    "rewardText": "230 coins + Woodcutting XP",
    "readyCue": "Kett has enough timber to finish the old axe."
  },
  {
    "id": "sol_compass",
    "npc": "Cartographer Sol",
    "title": "North Is Missing",
    "type": "Iron Hills exploration story",
    "region": "Iron Hills",
    "zone": 1,
    "icon": "🧭",
    "chapter": "A Compass That Disagrees",
    "startLines": [
      "Every compass on the ridge points three degrees east after sunset. Three degrees exactly.",
      "No magnetic storm does that politely.",
      "Train Gathering to level 5. I need someone who notices small environmental changes to compare the plants, stones, and wind with my maps."
    ],
    "objectives": [
      {
        "type": "skill",
        "skill": "gather",
        "amount": 5,
        "label": "Gathering level"
      }
    ],
    "progressLines": [
      "The needle is wrong again tonight.",
      "Reach Gathering level 5. I need your eyes trained before I trust what they report."
    ],
    "completeChapter": "A Mountain That Remembers",
    "completeLines": [
      "You noticed the herbs leaning east even without wind. Good.",
      "There is a buried line of old Moonstone markers under the ridge. The compasses are following them.",
      "Not dangerous. Not yet. But maps should include the things mountains remember."
    ],
    "postLines": [
      "I marked the Moonstone line in blue ink.",
      "Future cartographers can decide whether I was clever or paranoid."
    ],
    "reward": {
      "coins": 200,
      "xp": {
        "skill": "gather",
        "amount": 130
      }
    },
    "rewardText": "200 coins + Gathering XP"
  },
  {
    "id": "rusk_burial",
    "npc": "Mason Rusk",
    "title": "Bronze for the Nameless",
    "type": "Iron Hills memorial quest",
    "region": "Iron Hills",
    "zone": 1,
    "icon": "🪦",
    "chapter": "Markers Without Names",
    "startLines": [
      "There are six graves above the old pass with no names left on the stones.",
      "I cannot give them names I do not know. I can at least give them markers that will survive another century.",
      "Bring four bronze bars. I will cast simple plates: Here lies someone who mattered."
    ],
    "objectives": [
      {
        "type": "item",
        "item": "bars",
        "amount": 4,
        "label": "bronze bars",
        "consume": true
      }
    ],
    "progressLines": [
      "Stone forgets faster than people think.",
      "Four bars will make enough plates for the graves."
    ],
    "completeChapter": "Someone Who Mattered",
    "completeLines": [
      "Done. No dates. No invented histories.",
      "Just six plates that say someone stood here, lived here, and was worth remembering.",
      "Thank you for not asking me to make the words grander."
    ],
    "postLines": [
      "The plates caught frost this morning.",
      "For once, the ridge looked gentle."
    ],
    "reward": {
      "coins": 240,
      "xp": {
        "skill": "smith",
        "amount": 120
      }
    },
    "rewardText": "240 coins + Smithing XP",
    "readyCue": "Rusk has enough bronze to mark the nameless graves."
  },
  {
    "id": "wynn_bow",
    "npc": "Fletcher Wynn",
    "title": "One Straight Shot",
    "type": "Iron Hills profession quest",
    "region": "Iron Hills",
    "zone": 1,
    "icon": "🏹",
    "chapter": "Wood, String, Patience",
    "startLines": [
      "A bow is not a bent stick. If you think it is, please stand very far away from me while you make one.",
      "Craft and equip an Oak Shortbow. Do it properly. I will know if Hollis sold it to you because his grips are always crooked."
    ],
    "objectives": [
      {
        "type": "gear",
        "slot": "weapon",
        "value": "oakbow",
        "amount": 1,
        "label": "Oak Shortbow equipped"
      }
    ],
    "progressLines": [
      "Split the grain cleanly. Do not fight the curve.",
      "Come back when an Oak Shortbow is in your hands."
    ],
    "completeChapter": "The Bow Bends, Not the Archer",
    "completeLines": [
      "Let me see the grip... string... limbs. Hm.",
      "Annoyingly good for a first serious bow.",
      "Remember: the weapon stores patience and releases it all at once. Try to do the same."
    ],
    "postLines": [
      "Still straight. Good.",
      "Hollis asked if I had insulted his grips again. I said no convincingly."
    ],
    "reward": {
      "coins": 260,
      "xp": {
        "skill": "fletch",
        "amount": 180
      }
    },
    "rewardText": "260 coins + Fletching XP"
  },
  {
    "id": "edda_ash_garden",
    "npc": "Botanist Edda",
    "title": "A Garden in Ash",
    "type": "Ashen Ruins life story",
    "region": "Ashen Ruins",
    "zone": 2,
    "icon": "🌱",
    "chapter": "Green Where Nothing Should Be",
    "startLines": [
      "Everyone studies what died here. I am interested in what refused to.",
      "Small silver-leaf plants are growing between the temple stones. They survive heat that cooks leather.",
      "Bring me eight bundles of herbs from the ruins. I want to compare their roots before someone decides resilience is a resource to exploit."
    ],
    "objectives": [
      {
        "type": "item",
        "item": "herbs",
        "amount": 8,
        "label": "ruin herbs",
        "consume": true
      }
    ],
    "progressLines": [
      "Do not pull the smallest plants. Let stubborn things become older.",
      "Eight mature bundles should be enough."
    ],
    "completeChapter": "The Stubborn Green",
    "completeLines": [
      "Look at these roots. They wrapped themselves around ash-glass and turned poison into mineral salt.",
      "The ruins are not healing quickly. They are healing anyway.",
      "People like dramatic miracles. I prefer this kind: tiny, ugly, persistent."
    ],
    "postLines": [
      "The silver-leaf patch doubled.",
      "Slowly. Quietly. Perfect."
    ],
    "reward": {
      "coins": 310,
      "xp": {
        "skill": "gather",
        "amount": 180
      }
    },
    "rewardText": "310 coins + Gathering XP",
    "readyCue": "Edda has enough ruin herbs to study the silver-leaf roots."
  },
  {
    "id": "varo_last_watch",
    "npc": "Sentinel Varo",
    "title": "The Last Watch",
    "type": "Ashen Ruins duty story",
    "region": "Ashen Ruins",
    "zone": 2,
    "icon": "🛡️",
    "chapter": "A Post No One Assigned",
    "startLines": [
      "I stand watch here because somebody should. No captain ordered it. No banner claims it.",
      "The skeletons keep walking the old patrol paths. Perhaps habit survives death better than memory.",
      "Put five Ash Skeletons down. I want one night where neither the living nor the dead mistake duty for destiny."
    ],
    "objectives": [
      {
        "type": "kill",
        "kind": "skeleton",
        "amount": 5,
        "label": "Ash Skeletons"
      }
    ],
    "progressLines": [
      "They always rise facing the old temple.",
      "Five patrol echoes. Then we both rest."
    ],
    "completeChapter": "Watch Relieved",
    "completeLines": [
      "Quiet.",
      "I had forgotten ruins could make that sound.",
      "Take the coin. I am sitting down for exactly one hour, and if the world ends during it, the world can file a complaint."
    ],
    "postLines": [
      "I kept the one-hour promise.",
      "It was excellent. I may repeat the offense."
    ],
    "reward": {
      "coins": 340,
      "food": 2
    },
    "rewardText": "340 coins + 2 cooked food",
    "readyCue": "Varo finally has a quiet stretch of wall to watch."
  },
  {
    "id": "tev_brute",
    "npc": "Salvager Tev",
    "title": "The Door That Walked Away",
    "type": "Ashen Ruins salvage comedy",
    "region": "Ashen Ruins",
    "zone": 2,
    "icon": "🚪",
    "chapter": "Architectural Theft",
    "startLines": [
      "A Ruin Brute tore the bronze door off my excavation tent and wandered away wearing it like a shield.",
      "That sentence has ruined my week.",
      "Defeat three Ruin Brutes. One of them—or a close relative—should have enough fittings for me to reconstruct the door."
    ],
    "objectives": [
      {
        "type": "kill",
        "kind": "brute",
        "amount": 3,
        "label": "Ruin Brutes"
      }
    ],
    "progressLines": [
      "I am currently sleeping in a tent with a curtain made from a map.",
      "Three brutes. I need hinges, dignity, or ideally both."
    ],
    "completeChapter": "A Door, Technically",
    "completeLines": [
      "These fittings are mine. I recognize the dent where I dropped a hammer on one.",
      "The new door is heavier and significantly less likely to become clothing.",
      "I have added 'brute-resistant hinges' to my professional expertise."
    ],
    "postLines": [
      "Door still attached.",
      "I check every morning."
    ],
    "reward": {
      "coins": 390,
      "bars": 0
    },
    "rewardText": "390 coins",
    "readyCue": "Tev can finally rebuild the door that became armor."
  },
  {
    "id": "numa_offering",
    "npc": "Priest Numa",
    "title": "An Offering With No God",
    "type": "Ashen Ruins spiritual story",
    "region": "Ashen Ruins",
    "zone": 2,
    "icon": "💎",
    "chapter": "The Empty Altar",
    "startLines": [
      "This altar predates every god-name carved into the later temple walls.",
      "People left Moonstones here not as payment, but as promises: light kept for someone returning home.",
      "Bring one Moonstone. I will not tell you who to dedicate it to. Some names should remain yours."
    ],
    "objectives": [
      {
        "type": "item",
        "item": "moon",
        "amount": 1,
        "label": "Moonstone",
        "consume": true
      }
    ],
    "progressLines": [
      "There is no hurry.",
      "An offering made only to finish a task is just inventory management."
    ],
    "completeChapter": "A Light Left Behind",
    "completeLines": [
      "Place it there.",
      "No prayer required.",
      "For a moment the stone remembers every hand that warmed this altar. Then it becomes simply yours among them."
    ],
    "postLines": [
      "Your Moonstone still glows faintly on the altar.",
      "No one has touched it."
    ],
    "reward": {
      "coins": 420,
      "xp": {
        "skill": "gather",
        "amount": 120
      }
    },
    "rewardText": "420 coins + Gathering XP",
    "readyCue": "You are carrying a Moonstone worthy of Numa’s old altar."
  },
  {
    "id": "orla_blade_memory",
    "npc": "Smith Orla",
    "title": "A Blade That Remembers Heat",
    "type": "Ashen Ruins smithing story",
    "region": "Ashen Ruins",
    "zone": 2,
    "icon": "⚒️",
    "chapter": "Temper Twice",
    "startLines": [
      "Bronze from these ruins rings differently after sunset. Metal remembers temperature better than people remember pain.",
      "Bring me eight bronze bars. I want to reforge an old training blade using the temple’s cooling trough.",
      "If it cracks, we learn something. If it sings, we learn something worse."
    ],
    "objectives": [
      {
        "type": "item",
        "item": "bars",
        "amount": 8,
        "label": "bronze bars",
        "consume": true
      }
    ],
    "progressLines": [
      "The trough is cold despite the lava twenty paces away.",
      "Eight bars. Uniform ones, if possible."
    ],
    "completeChapter": "The Second Temper",
    "completeLines": [
      "Hear that tone? Too pure for ordinary bronze.",
      "The trough is carrying Moonstone resonance through the metal. The old smiths were not just cooling blades—they were tuning them.",
      "I will keep the test blade. You keep the lesson and the coin."
    ],
    "postLines": [
      "The blade still hums at dusk.",
      "I wrapped the rack in leather so it would stop waking me."
    ],
    "reward": {
      "coins": 450,
      "xp": {
        "skill": "smith",
        "amount": 220
      }
    },
    "rewardText": "450 coins + Smithing XP",
    "readyCue": "Orla has enough bronze for the temple-forge experiment."
  },
  {
    "id": "maelin_emberfish",
    "npc": "Cook Maelin",
    "title": "Dinner From a Lava Pool",
    "type": "Ashen Ruins cooking comedy",
    "region": "Ashen Ruins",
    "zone": 2,
    "icon": "🐟",
    "chapter": "Against Better Judgment",
    "startLines": [
      "Before you say anything: yes, fish live in the hot pools. No, I do not know why.",
      "They taste smoky before cooking. This is either convenient or deeply concerning.",
      "Catch five fish in the Ashen Ruins. I am making stew for science, which is what cooks say when nobody volunteers to eat first."
    ],
    "objectives": [
      {
        "type": "gather",
        "item": "rawFish",
        "amount": 5,
        "label": "Ashen fish catches",
        "zone": 2
      }
    ],
    "progressLines": [
      "The pot is ready. My courage is not.",
      "Five catches from the ruins should be enough for a controlled culinary mistake."
    ],
    "completeChapter": "Surprisingly Edible",
    "completeLines": [
      "...That is good.",
      "I resent that it is good.",
      "Apparently the mineral water seasons them from the inside. I have spent twenty years salting fish manually like a fool."
    ],
    "postLines": [
      "Emberfish stew is selling out.",
      "I have chosen not to tell customers where the fish live."
    ],
    "reward": {
      "coins": 360,
      "food": 5,
      "xp": {
        "skill": "cook",
        "amount": 180
      }
    },
    "rewardText": "360 coins + 5 food + Cooking XP",
    "readyCue": "Maelin has enough impossible fish for the experiment."
  },
  {
    "id": "kess_warden",
    "npc": "Hunter Kess",
    "title": "Once More, With Preparation",
    "type": "Ashen Ruins challenge quest",
    "region": "Ashen Ruins",
    "zone": 2,
    "icon": "🔥",
    "chapter": "The Warden’s Measure",
    "startLines": [
      "Everyone talks about defeating the Ash Warden like victory makes it ordinary afterward.",
      "It does not. It reforms because the ruins still remember the shape of the fight.",
      "Defeat the Ash Warden once while you are here. Not for glory. I am measuring how quickly its armor rebuilds."
    ],
    "objectives": [
      {
        "type": "kill",
        "kind": "warden",
        "amount": 1,
        "label": "Ash Warden"
      }
    ],
    "progressLines": [
      "Do not rush it. I need a clean observation more than a quick corpse.",
      "One Warden defeat. I will watch the ash settle."
    ],
    "completeChapter": "The Shape Returns",
    "completeLines": [
      "Seventeen seconds before the first armor plate began to reform.",
      "That is faster than last month. The ruins are learning.",
      "I wish I had a comforting interpretation. I have several alarming ones instead."
    ],
    "postLines": [
      "Seventeen seconds.",
      "I keep hoping the number will get larger."
    ],
    "reward": {
      "coins": 600,
      "moon": 1
    },
    "rewardText": "600 coins + 1 Moonstone",
    "readyCue": "Kess saw the Warden fall and has the timing she needed."
  },
  {
    "id": "sen_letters",
    "npc": "Archivist Sen",
    "title": "Letters Never Sent",
    "type": "Ashen Ruins history story",
    "region": "Ashen Ruins",
    "zone": 2,
    "icon": "✉️",
    "chapter": "Mail for the Dead",
    "startLines": [
      "The keeper barracks had a mail chest. Most letters burned. Some fused into the armor of the dead.",
      "I am not interested in military secrets. I am interested in birthdays, complaints, bad jokes, ordinary life.",
      "Defeat four Ash Skeletons. If any memory-ash carries words, bring the fragments back."
    ],
    "objectives": [
      {
        "type": "kill",
        "kind": "skeleton",
        "amount": 4,
        "label": "Ash Skeletons"
      }
    ],
    "progressLines": [
      "History preserves kings because kings pay for stone.",
      "Four keeper echoes. I am looking for the people nobody carved into monuments."
    ],
    "completeChapter": "Dear Home",
    "completeLines": [
      "This one begins, 'Dear Mum, the temple food is still terrible.'",
      "That may be the most valuable line I have found all year.",
      "I will copy every fragment and read the names aloud before I archive them. No one should become only a uniform."
    ],
    "postLines": [
      "I found another joke in the margins.",
      "It was bad. I am preserving it anyway."
    ],
    "reward": {
      "coins": 380
    },
    "rewardText": "380 coins",
    "readyCue": "Sen has enough memory fragments to reconstruct the lost letters."
  }
];
const SIDE_QUESTS = Object.fromEntries(SIDE_QUEST_DEFS.map(q=>[q.id,q]));

function freshQuests(){
  return {
    first_steps:{stage:0,ratKills:0,storyVersion:3},
    goblin_problem:{stage:0,kills:0,storyVersion:3},
    ruin_heart:{stage:0,skeletonKills:0,wardenKills:0,storyVersion:3},
    jory_catch:{stage:0,fishCaught:0,storyVersion:1},
    nessa_promise:{stage:0,wolfKills:0,storyVersion:1},
    cael_name:{stage:0,skeletonKills:0,storyVersion:1},
    ...Object.fromEntries(SIDE_QUEST_DEFS.map(q=>[q.id,{stage:0,progress:{},storyVersion:1}]))
  }
}
function appearanceFromToken(token){
  let hash=0;for(const c of token)hash=(hash*31+c.charCodeAt(0))>>>0;
  const shirts=['#587cc8','#a55f79','#5e9c78','#9c724f','#745f9e','#b86f4c'];
  const hairs=['#3c2d25','#7f5636','#cf9e58','#1e2026','#744533'];
  return {shirt:shirts[hash%shirts.length],hair:hairs[(hash>>>4)%hairs.length],skin:['#d9a075','#bc7e59','#f0c29b','#8e5d43'][(hash>>>8)%4]};
}
function freshPlayer(token,name='Wanderer'){
  const zone=WORLD_DEFS[0];
  return {token,name:cleanName(name),coins:25,hp:40,baseHp:40,zone:0,x:zone.spawn.x,y:zone.spawn.y,dir:'down',kills:0,
    skills:freshSkills(),inv:emptyInv(),bank:emptyBank(),gear:{weapon:'rusty',armor:'traveler',pet:false},quests:freshQuests(),appearance:appearanceFromToken(token),
    online:false,lastSeen:Date.now(),createdAt:Date.now(),cooldowns:{move:0,action:0,chat:0}}
}
function initZone(def){
  const nodes=new Map(def.nodes.map(([id,type,x,y])=>[id,{id,type,x,y,active:true,respawnAt:0}]));
  const monsters=new Map(def.monsters.map(([id,kind,name,x,y,lv,hp])=>[id,{id,kind,name,x,y,spawnX:x,spawnY:y,lv,hp,maxHp:hp,alive:true,respawnAt:0,nextTurn:Date.now()+500+Math.random()*1500,vx:0,vy:0}]));
  return {def,nodes,monsters};
}
for(const def of WORLD_DEFS)world.zones.set(def.id,initZone(def));

function addXp(p,key,amount){
  const s=p.skills[key];if(!s)return false;
  s.xp+=amount;let leveled=false;
  while(s.xp>=xpNeeded(s.lv)){
    s.xp-=xpNeeded(s.lv);s.lv++;leveled=true;
    if(key==='combat'){p.baseHp+=2;p.hp=Math.min(maxHp(p),p.hp+2)}
  }
  return leveled;
}
function publicZone(def){
  return {id:def.id,name:def.name,subtitle:def.subtitle,req:def.req,w:def.w,h:def.h,theme:def.theme,water:def.water,buildings:def.buildings,npcs:def.npcs,spawn:def.spawn};
}
function publicPlayer(p){return {token:createHash('sha256').update(p.token).digest('hex'),name:p.name,zone:p.zone,x:p.x,y:p.y,dir:p.dir,total:totalLevel(p),combat:p.skills.combat.lv,hp:p.hp,maxHp:maxHp(p),gear:p.gear,appearance:p.appearance}}
function privatePlayer(p){return {...publicPlayer(p),coins:p.coins,kills:p.kills,skills:p.skills,inv:p.inv,bank:p.bank,quests:p.quests,questBook:buildQuestBook(p)}}
function zoneSnapshot(zoneId){
  const z=world.zones.get(zoneId);
  return {type:'world',zone:zoneId,players:[...world.players.values()].filter(p=>p.online&&p.zone===zoneId).map(publicPlayer),nodes:[...z.nodes.values()].map(n=>({id:n.id,active:n.active,respawnAt:n.respawnAt})),monsters:[...z.monsters.values()].map(m=>({id:m.id,kind:m.kind,name:m.name,x:m.x,y:m.y,lv:m.lv,hp:m.hp,maxHp:m.maxHp,alive:m.alive,respawnAt:m.respawnAt}))};
}
function send(ws,obj){if(ws?.readyState===WebSocket.OPEN)ws.send(JSON.stringify(obj))}
function broadcastAll(obj){const data=JSON.stringify(obj);for(const ws of world.sockets.keys())if(ws.readyState===WebSocket.OPEN)ws.send(data)}
function broadcastZone(zoneId,obj=zoneSnapshot(zoneId)){const data=JSON.stringify(obj);for(const [ws,token] of world.sockets){const p=world.players.get(token);if(p?.online&&p.zone===zoneId&&ws.readyState===WebSocket.OPEN)ws.send(data)}}
function sendState(ws,p,message=null,extra={}){send(ws,{type:'state',player:privatePlayer(p),message,...extra})}
function sendZone(ws,p){const z=world.zones.get(p.zone);send(ws,{type:'zone',zone:publicZone(z.def),nodes:[...z.nodes.values()].map(n=>({id:n.id,type:n.type,x:n.x,y:n.y}))});send(ws,zoneSnapshot(p.zone))}
function reportSaveError(error){console.error('Character save failed:',error.code||error.name)}
function noteSave(){clearTimeout(saveTimer);saveTimer=setTimeout(()=>saveWorld().catch(reportSaveError),350)}
async function saveWorld(){
  const players=[...world.players.values()].map(({cooldowns,...p})=>({...p,online:false}));
  await persistWorld({players});
}
async function loadWorld(){
  try{
    const data=await loadSavedWorld();
    for(const saved of data.players||[]){
      const base=freshPlayer(saved.token,saved.name);const p={...base,...saved,online:false,cooldowns:{move:0,action:0,chat:0}};
      p.skills={...freshSkills(),...(saved.skills||{})};p.inv={...emptyInv(),...(saved.inv||{})};p.bank={...emptyBank(),...(saved.bank||{})};
      const fq=freshQuests(),sq=saved.quests||{};
      p.quests=Object.fromEntries(Object.entries(fq).map(([qid,baseQ])=>[qid,{...baseQ,...(sq[qid]||{})}]));
      for(const qid of ['first_steps','goblin_problem','ruin_heart']){const q=p.quests[qid];q.storyVersion=3;}
      const oldGear=saved.gear||{};
      p.gear={
        weapon:oldGear.weapon||(oldGear.moonBlade?'moon':oldGear.bronzeSword?'bronze':oldGear.bow?'oakbow':'rusty'),
        armor:oldGear.armor||(oldGear.bronzeArmor?'bronze':'traveler'),
        pet:!!oldGear.pet
      };
      p.appearance={...base.appearance,...(saved.appearance||{})};
      world.players.set(p.token,p);
    }
  }catch(error){console.error('Cannot load character progress:',error.code||error.name);throw error}
}
await loadWorld();

function zoneDef(id){return WORLD_DEFS.find(z=>z.id===id)}
function distance(a,b){return Math.hypot(a.x-b.x,a.y-b.y)}
function clamp(n,a,b){return Math.max(a,Math.min(b,n))}
function circleRect(x,y,r,rect){const cx=clamp(x,rect.x,rect.x+rect.w),cy=clamp(y,rect.y,rect.y+rect.h);return Math.hypot(x-cx,y-cy)<r}
function blocked(zoneId,x,y){
  const d=zoneDef(zoneId);if(!d)return true;if(x<35||y<35||x>d.w-35||y>d.h-35)return true;
  for(const w of d.water||[]){if(circleRect(x,y,18,w))return true}
  for(const b of d.buildings||[]){const doorway={x:b.x+b.w/2-32,y:b.y+b.h-12,w:64,h:20};if(circleRect(x,y,18,b)&&!circleRect(x,y,18,doorway))return true}
  return false;
}
function respawnPoint(zoneId){const d=zoneDef(zoneId);return {x:d.spawn.x,y:d.spawn.y}}
function checkDeath(p){
  if(p.hp>0)return null;const lost=Math.floor(p.coins*.1);p.coins-=lost;p.hp=maxHp(p);const sp=respawnPoint(p.zone);p.x=sp.x;p.y=sp.y;return `You fall in battle and wake at camp, losing ${lost} coins.`;
}
function actionReady(p,kind='action',ms=450){const now=Date.now();p.cooldowns=p.cooldowns||{move:0,action:0,chat:0};if(now-(p.cooldowns[kind]||0)<ms)return false;p.cooldowns[kind]=now;return true}
function resourceInfo(type){return ({tree:{skill:'wood',item:'logs',label:'oak logs',xp:18,respawn:7000},rock:{skill:'mine',item:'copper',label:'copper ore',xp:20,respawn:8000},fish:{skill:'fish',item:'rawFish',label:'raw fish',xp:19,respawn:5000},herb:{skill:'gather',item:'herbs',label:'herbs',xp:17,respawn:6500}})[type]}
function findStatic(zoneId,id){const z=world.zones.get(zoneId);const node=z.nodes.get(id);if(node)return {kind:'node',obj:node};const npc=z.def.npcs.find(n=>n.id===id);if(npc)return {kind:'npc',obj:npc};const monster=z.monsters.get(id);if(monster)return {kind:'monster',obj:monster};return null}
function questStatus(p,id){return p.quests[id]||{stage:0}}
function storyPanel(title,quest,chapter,lines,objective='',status='',reward=''){
  return {title,quest,chapter,lines:lines.map(text=>({speaker:title,text})),objective,status,reward};
}

function objectiveKey(obj,i){return obj.key||`${obj.type}:${obj.kind||obj.item||obj.skill||obj.slot||i}`}
function objectiveCurrent(p,q,obj,i=0){
  if(obj.type==='item')return p.inv[obj.item]||0;
  if(obj.type==='kill'||obj.type==='gather')return q.progress?.[objectiveKey(obj,i)]||0;
  if(obj.type==='skill')return p.skills[obj.skill]?.lv||1;
  if(obj.type==='total')return totalLevel(p);
  if(obj.type==='coins')return p.coins;
  if(obj.type==='gear')return p.gear?.[obj.slot]===obj.value?1:0;
  if(obj.type==='pet')return p.gear?.pet?1:0;
  return 0;
}
function genericReady(p,q,def){return def.objectives.every((o,i)=>objectiveCurrent(p,q,o,i)>=(o.amount||1))}
function genericStatus(p,q,def){return def.objectives.map((o,i)=>`${Math.min(o.amount||1,objectiveCurrent(p,q,o,i))}/${o.amount||1} ${o.label||o.type}`).join(' · ')}
function consumeGenericObjectives(p,def){for(const o of def.objectives){if(o.type==='item'&&o.consume!==false)p.inv[o.item]=Math.max(0,(p.inv[o.item]||0)-o.amount);if(o.type==='coins')p.coins=Math.max(0,p.coins-o.amount)}}
function applyQuestReward(p,reward={}){if(reward.coins)p.coins+=reward.coins;if(reward.food)p.inv.food+=reward.food;if(reward.moon)p.inv.moon+=reward.moon;if(reward.xp?.skill)addXp(p,reward.xp.skill,reward.xp.amount||0)}
function genericQuestTalk(p,def){
  const q=p.quests[def.id]||(p.quests[def.id]={stage:0,progress:{},storyVersion:1});q.progress=q.progress||{};
  if(q.stage===0){q.stage=1;return storyPanel(def.npc,def.title,def.chapter,def.startLines,def.objectives.map(o=>o.label).join(' · '),genericStatus(p,q,def),def.rewardText||'')}
  if(q.stage===1){
    if(genericReady(p,q,def)){consumeGenericObjectives(p,def);applyQuestReward(p,def.reward);q.stage=2;return storyPanel(def.npc,def.title,def.completeChapter,def.completeLines,'Quest complete.','Complete',def.rewardText||'')}
    return storyPanel(def.npc,def.title,def.chapter,def.progressLines||def.startLines.slice(-2),def.objectives.map(o=>o.label).join(' · '),genericStatus(p,q,def),'')
  }
  return storyPanel(def.npc,def.title,'Afterward',def.postLines||['The matter is settled.'],'Quest complete.','Complete','')
}
function updateGenericKill(p,m){
  let cue='';
  for(const def of SIDE_QUEST_DEFS){const q=p.quests[def.id];if(!q||q.stage!==1)continue;q.progress=q.progress||{};let changed=false;
    def.objectives.forEach((o,i)=>{if(o.type!=='kill')return;if(o.zone!=null&&o.zone!==p.zone)return;const kinds=o.kinds||[o.kind];if(!kinds.includes(m.kind))return;const k=objectiveKey(o,i);q.progress[k]=Math.min(o.amount,(q.progress[k]||0)+1);changed=true});
    if(changed&&genericReady(p,q,def))cue+=` ${def.readyCue||`Return to ${def.npc}.`}`;
  }
  return cue;
}
function updateGenericGather(p,item,nodeType,amount,zoneId){
  let cue='';
  for(const def of SIDE_QUEST_DEFS){const q=p.quests[def.id];if(!q||q.stage!==1)continue;q.progress=q.progress||{};let changed=false;
    def.objectives.forEach((o,i)=>{if(o.type!=='gather')return;if(o.zone!=null&&o.zone!==zoneId)return;if(o.item&&o.item!==item)return;if(o.nodeType&&o.nodeType!==nodeType)return;const k=objectiveKey(o,i);q.progress[k]=Math.min(o.amount,(q.progress[k]||0)+amount);changed=true});
    if(changed&&genericReady(p,q,def))cue+=` ${def.readyCue||`Return to ${def.npc}.`}`;
  }
  return cue;
}
function specialQuestBook(p){
  const q=p.quests;
  const first=q.first_steps||{stage:0,ratKills:0};const gob=q.goblin_problem||{stage:0,kills:0};const ruin=q.ruin_heart||{stage:0,skeletonKills:0,wardenKills:0};const jory=q.jory_catch||{stage:0,fishCaught:0};const nessa=q.nessa_promise||{stage:0,wolfKills:0};const cael=q.cael_name||{stage:0,skeletonKills:0};
  return [
    {id:'first_steps',icon:'🌿',region:'Greenmeadow',type:'Regional story',title:'The Bell Beneath the Bridge',stage:first.stage,done:first.stage>=3,ready:first.stage===1?(p.inv.logs>=5&&p.inv.copper>=3):first.stage===2?(first.ratKills||0)>=3:false,chapter:first.stage===0?'Not started':first.stage===1?'A Note in the River':first.stage===2?'Teeth in the Reeds':'Complete — The Cinder Mark',description:first.stage===0?'Speak with Elder Mira.':first.stage===1?'Repair the damaged bridge so Mira can inspect the bell beneath it.':first.stage===2?'Clear the rats carrying black glass from the riverbank.':'Greenmeadow’s bridge is safe, but the bell left a warning.',status:first.stage===0?'Speak with Elder Mira':first.stage===1?`${Math.min(5,p.inv.logs)}/5 logs · ${Math.min(3,p.inv.copper)}/3 copper`:first.stage===2?`${first.ratKills||0}/3 Giant Rats`:'Complete'},
    {id:'jory_catch',icon:'🎣',region:'Greenmeadow',type:'Side story',title:'The One That Got Away',stage:jory.stage,done:jory.stage>=2,ready:jory.stage===1&&(jory.fishCaught||0)>=5,chapter:jory.stage===0?'Not started':jory.stage===1?'A Fisherman’s Emergency':'Complete — The Terrible Truth',description:jory.stage===0?'Fisher Jory has accused a fish of theft.':jory.stage===1?'Catch fish and look for Jory’s missing brass lure.':'The fish have been mostly cleared of criminal charges.',status:jory.stage===0?'Speak with Fisher Jory':jory.stage===1?`${jory.fishCaught||0}/5 fish caught`:'Complete'},
    {id:'goblin_problem',icon:'⛰️',region:'Iron Hills',type:'Regional story',title:'Smoke on the Ridge',stage:gob.stage,done:gob.stage>=3,ready:gob.stage===1?(gob.kills||0)>=5:gob.stage===2?p.inv.herbs>=4:false,chapter:gob.stage===0?'Not started':gob.stage===1?'Raiders Who Leave Nothing':gob.stage===2?'The Scout Who Came Back':'Complete — Wake the Crown',description:gob.stage===0?'Speak with Guard Arden.':gob.stage===1?'The goblins are stealing maps rather than supplies.':gob.stage===2?'Gather medicine for the scout who followed them.':'The raiding band is broken and the ridge has its answer.',status:gob.stage===0?'Speak with Guard Arden':gob.stage===1?`${gob.kills||0}/5 Hill Goblins`:gob.stage===2?`${Math.min(4,p.inv.herbs)}/4 herbs`:'Complete'},
    {id:'nessa_promise',icon:'🏹',region:'Iron Hills',type:'Side story',title:'A Scout’s Promise',stage:nessa.stage,done:nessa.stage>=3,ready:nessa.stage===1?(nessa.wolfKills||0)>=3:nessa.stage===2?p.inv.herbs>=3:false,chapter:nessa.stage===0?'Not started':nessa.stage===1?'The Closed Trail':nessa.stage===2?'Medicine for Mara':'Complete — Delivered Without Thanks',description:nessa.stage===0?'Scout Nessa needs help keeping an old promise.':nessa.stage===1?'Clear the Dire Wolves blocking the healer’s trail.':nessa.stage===2?'Gather herbs for Mara’s supply bundle.':'The trail is open and Mara has her medicine.',status:nessa.stage===0?'Speak with Scout Nessa':nessa.stage===1?`${nessa.wolfKills||0}/3 Dire Wolves`:nessa.stage===2?`${Math.min(3,p.inv.herbs)}/3 herbs`:'Complete'},
    {id:'ruin_heart',icon:'🔥',region:'Ashen Ruins',type:'Regional story',title:'The Cinder Crown',stage:ruin.stage,done:ruin.stage>=3,ready:ruin.stage===1?(ruin.skeletonKills||0)>=2:ruin.stage===2?((ruin.wardenKills||0)>=1&&p.inv.moon>=1):false,chapter:ruin.stage===0?'Not started':ruin.stage===1?'Voices That Forgot Their Names':ruin.stage===2?'A Guardian in Chains':'Complete — When the Bell Answers',description:ruin.stage===0?'Speak with Sage Elowen.':ruin.stage===1?'Quiet keeper echoes so Elowen can read their memory-ash.':ruin.stage===2?'Defeat the Ash Warden while carrying a Moonstone.':'The Warden is free and the Cinder Crown is broken.',status:ruin.stage===0?'Speak with Sage Elowen':ruin.stage===1?`${ruin.skeletonKills||0}/2 Ash Skeletons`:ruin.stage===2?`Warden ${(ruin.wardenKills||0)>=1?'✓':'—'} · Moonstone ${p.inv.moon>=1?'✓':'—'}`:'Complete'},
    {id:'cael_name',icon:'👻',region:'Ashen Ruins',type:'Side story',title:'A Name in Ash',stage:cael.stage,done:cael.stage>=2,ready:cael.stage===1&&(cael.skeletonKills||0)>=3,chapter:cael.stage===0?'Not started':cael.stage===1?'The Missing Word':'Complete — Lysa',description:cael.stage===0?'The Echo of Cael has forgotten one important name.':cael.stage===1?'Break keeper armor so Cael can hear memory fragments.':'Cael recovered his sister’s name.',status:cael.stage===0?'Speak with the Echo of Cael':cael.stage===1?`${cael.skeletonKills||0}/3 Ash Skeletons`:'Complete'}
  ];
}
function buildQuestBook(p){
  const special=specialQuestBook(p);const side=SIDE_QUEST_DEFS.map(def=>{const q=p.quests[def.id]||{stage:0,progress:{}};return {id:def.id,icon:def.icon,region:def.region,type:def.type,title:def.title,stage:q.stage,done:q.stage>=2,ready:q.stage===1&&genericReady(p,q,def),chapter:q.stage===0?'Not started':q.stage===1?def.chapter:`Complete — ${def.completeChapter}`,description:q.stage===0?`Speak with ${def.npc}.`:q.stage===1?(def.progressLines?.[0]||def.startLines.at(-1)):(def.postLines?.[0]||'Quest complete.'),status:q.stage===0?`Speak with ${def.npc}`:q.stage===1?genericStatus(p,q,def):'Complete'};});
  const order={Greenmeadow:0,'Iron Hills':1,'Ashen Ruins':2};return [...special,...side].sort((a,b)=>(order[a.region]-order[b.region])||a.title.localeCompare(b.title));
}

function questTalk(p,id){
  if(id==='first_steps'){
    const q=p.quests.first_steps;
    if(q.stage===0){
      q.stage=1;q.ratKills=0;
      return storyPanel('Elder Mira','The Bell Beneath the Bridge','Chapter I — A Note in the River',[
        'You are new to Greenmeadow, so I will spare you the village version of the story. The bridge did not simply break.',
        'Three nights ago, the old warning bell beneath it rang by itself. At dawn we found the western supports split apart—and black glass dust ground into the timber.',
        'That bell has not sounded since the Cinder War. I would like very much to believe this is a coincidence.',
        'Help me repair the bridge first. Bring five oak logs and three pieces of copper ore. Once the crossing is safe, we can find out what the river is trying to tell us.'
      ],'Gather 5 oak logs and 3 copper ore.','The bridge cannot be inspected safely until the supports are repaired.','100 coins, 3 cooked food, and the next chapter');
    }
    if(q.stage===1){
      if(p.inv.logs>=5&&p.inv.copper>=3){
        p.inv.logs-=5;p.inv.copper-=3;q.stage=2;q.ratKills=0;
        return storyPanel('Elder Mira','The Bell Beneath the Bridge','Chapter II — Teeth in the Reeds',[
          'Good. Hold that beam there... yes. The bridge will stand.',
          'I climbed beneath the stonework while you were fitting the copper. The bell is still hanging there, but someone has carved a fresh symbol into it: a crown surrounded by flame.',
          'The rats nesting in the reeds have been dragging away scraps from beneath the bridge. I saw the same black glass caught in their fur.',
          'Clear out three Giant Rats near the river. If they have swallowed or carried anything important, we need it before the current does.'
        ],'Defeat 3 Giant Rats in Greenmeadow.','The repaired bridge revealed a cinder-crown mark beneath the old bell.','Mira will examine what you find');
      }
      return storyPanel('Elder Mira','The Bell Beneath the Bridge','Chapter I — A Note in the River',[
        `We are close, but not close enough. I still need ${Math.max(0,5-p.inv.logs)} more logs and ${Math.max(0,3-p.inv.copper)} more copper ore.`,
        'Do not rush the river for my sake. Greenmeadow has waited years for trouble; it can wait another afternoon for careful hands.'
      ],'Gather 5 oak logs and 3 copper ore.',`${Math.min(5,p.inv.logs)}/5 logs · ${Math.min(3,p.inv.copper)}/3 copper`,'');
    }
    if(q.stage===2){
      if((q.ratKills||0)>=3){
        q.stage=3;p.coins+=100;p.inv.food+=3;
        return storyPanel('Elder Mira','The Bell Beneath the Bridge','Epilogue — The Cinder Mark',[
          'There. On this shard—see the groove? That is no natural glass. It was poured around a Moonstone and shattered on purpose.',
          'The cinder-crown mark belongs to an old order that guarded the Ashen Ruins. They vanished after the war. Or we thought they did.',
          'Guard Arden in the Iron Hills has been sending me reports of organized goblin raids. I dismissed his worries as mountain nerves. I will not make that mistake twice.',
          'Take these supplies. Whatever caused that mark has moved on, and Greenmeadow can breathe again—for now.'
        ],'Quest complete. Seek Guard Arden in the Iron Hills when you are ready.','The bridge is safe, but the old bell has connected Greenmeadow to something stirring in the east.','100 coins + 3 cooked food');
      }
      return storyPanel('Elder Mira','The Bell Beneath the Bridge','Chapter II — Teeth in the Reeds',[
        `The reeds are still moving. You have dealt with ${q.ratKills||0} of the 3 Giant Rats I saw nesting by the bridge.`,
        'If you find black glass among them, do not touch the sharp edge with bare skin. Old Moonstone work has a habit of remembering heat.'
      ],'Defeat 3 Giant Rats in Greenmeadow.',`${q.ratKills||0}/3 Giant Rats defeated`,'');
    }
    return storyPanel('Elder Mira','The Bell Beneath the Bridge','After the Bell',[
      'The bridge creaks like an old man again, which is exactly how a bridge should sound.',
      'But some nights I still hear that bell beneath the water. One note. Then silence.',
      'You solved Greenmeadow’s problem. Do not let anyone convince you every strange thing in Embervale must have the same cause.'
    ],'Continue the main story in the Iron Hills.','Complete','');
  }

  if(id==='goblin_problem'){
    const q=p.quests.goblin_problem;
    if(q.stage===0){
      q.stage=1;q.kills=0;
      return storyPanel('Guard Arden','Smoke on the Ridge','Chapter I — Raiders Who Leave Nothing',[
        'You look capable. Good. I need someone who is not already exhausted from three nights on the ridge.',
        'The goblins have changed. They used to steal food, boots, anything not nailed down. Now they raid caravans and leave the cargo untouched.',
        'What they take are maps, old mining records, and anything marked with the crest of the Ashen Ruins. Someone taught them exactly what to look for.',
        'Thin their raiding band. Defeat five Hill Goblins. Watch their weapons and packs for the cinder-crown mark Mira found.'
      ],'Defeat 5 Hill Goblins.','The raids appear to be searches, not robberies.','250 coins and story progression');
    }
    if(q.stage===1){
      if((q.kills||0)>=5){
        q.stage=2;
        return storyPanel('Guard Arden','Smoke on the Ridge','Chapter II — The Scout Who Came Back',[
          'You found the mark. So did Nessa.',
          'She followed one of their runners toward the eastern pass and came back half-conscious. Before she collapsed, she kept repeating the same words: “Wake the Crown.”',
          'Our healer is out of supplies. Bring me four herbs from the hills. If Nessa wakes, she may be able to tell us what waits beyond that pass.',
          'And before you ask—yes. I am afraid of the answer.'
        ],'Gather 4 herbs in the Iron Hills and return to Arden.','A wounded scout heard the goblins speak of “waking the Crown.”','');
      }
      return storyPanel('Guard Arden','Smoke on the Ridge','Chapter I — Raiders Who Leave Nothing',[
        `The patrol counted ${q.kills||0} of the 5 goblins I asked you to stop.`,
        'Do not mistake them for mindless raiders. They are carrying orders. That makes whoever wrote the orders the real enemy.'
      ],'Defeat 5 Hill Goblins.',`${q.kills||0}/5 Hill Goblins defeated`,'');
    }
    if(q.stage===2){
      if(p.inv.herbs>=4){
        p.inv.herbs-=4;q.stage=3;p.coins+=250;if(p.gear.weapon==='rusty')p.gear.weapon='bronze';
        return storyPanel('Guard Arden','Smoke on the Ridge','Epilogue — Wake the Crown',[
          'Nessa is awake. Barely, but she is awake.',
          'She saw figures in ash-colored robes leading the goblins through the eastern pass. They were carrying pieces of a broken Moonstone seal toward the ruins.',
          'The words “Wake the Crown” are not a threat. They are an instruction.',
          'Take this coin—and my spare bronze blade if yours is worse. The pass to the Ashen Ruins is open to skilled travelers. Find Sage Elowen there. She studied the old wardens before anyone else believed they mattered.'
        ],'Quest complete. Seek Sage Elowen in the Ashen Ruins.','The goblin raids were supplying a ritual intended to awaken something called the Crown.','250 coins + Bronze Sword if needed');
      }
      return storyPanel('Guard Arden','Smoke on the Ridge','Chapter II — The Scout Who Came Back',[
        `Nessa is holding on. We still need ${Math.max(0,4-p.inv.herbs)} more herbs.`,
        'She wakes for a few seconds at a time and reaches for her sword. Whatever she saw in the pass followed her home in her dreams.'
      ],'Gather 4 herbs in the Iron Hills.',`${Math.min(4,p.inv.herbs)}/4 herbs`,'');
    }
    return storyPanel('Guard Arden','Smoke on the Ridge','After the Smoke',[
      'Nessa is walking again. She complains about the food, so I consider her fully recovered.',
      'The goblin raids have slowed, but no one here believes the danger passed. We only learned where it went.',
      'If you reach Elowen, tell her Arden finally believes every ridiculous story she ever told me about the Cinder Crown.'
    ],'Continue the story in the Ashen Ruins.','Complete','');
  }

  if(id==='ruin_heart'){
    const q=p.quests.ruin_heart;
    if(q.stage===0){
      q.stage=1;q.skeletonKills=0;q.wardenKills=0;
      return storyPanel('Sage Elowen','The Cinder Crown','Chapter I — Voices That Forgot Their Names',[
        'You came into the Ashen Ruins willingly. Either you are brave, reckless, or very poorly informed. Any of the three may be useful.',
        'The Ash Warden was not a tyrant. It was a guardian—bound to the Cinder Crown so it could keep the Moonstone vault asleep.',
        'Someone has been rebuilding that Crown piece by piece. The dead are waking because they remember the command carved into it, but not who gave the command.',
        'Destroy two Ash Skeletons. Their armor sometimes holds memory-ash. Bring those memories back to me, and we may learn who touched the Crown.'
      ],'Defeat 2 Ash Skeletons.','The undead may preserve fragments of the ritual that awakened the ruins.','1000 coins + Moonstone Blade at the end of the story');
    }
    if(q.stage===1){
      if((q.skeletonKills||0)>=2){
        q.stage=2;
        return storyPanel('Sage Elowen','The Cinder Crown','Chapter II — A Guardian in Chains',[
          'I can hear it in the ash you brought back. The command is incomplete, but the voice is clear enough.',
          'The robed figures did not wake the Warden to serve them. They woke it in pain so it would break the vault open trying to obey two commands at once.',
          'That means killing the Warden is not enough. Its bond must be severed at the moment it falls.',
          'Defeat the Ash Warden and carry one Moonstone when you return. I can use the stone to break the Crown’s hold instead of letting it choose another guardian.'
        ],'Defeat the Ash Warden and possess 1 Moonstone.','The Ash Warden is a victim of the Crown, not its master.','');
      }
      return storyPanel('Sage Elowen','The Cinder Crown','Chapter I — Voices That Forgot Their Names',[
        `You have quieted ${q.skeletonKills||0} of the 2 Ash Skeletons whose memories I need.`,
        'Listen when they fall. Sometimes the last sound is a name. The Crown took even that from most of them.'
      ],'Defeat 2 Ash Skeletons.',`${q.skeletonKills||0}/2 Ash Skeletons defeated`,'');
    }
    if(q.stage===2){
      if((q.wardenKills||0)>=1&&p.inv.moon>=1){
        p.inv.moon--;q.stage=3;p.coins+=1000;p.gear.weapon='moon';
        return storyPanel('Sage Elowen','The Cinder Crown','Finale — When the Bell Answers',[
          'Set the Moonstone here. Do not let go until I tell you.',
          'There—the Crown is trying to bind itself to the nearest living will. Let it pull. Let it think it has won.',
          'Now.',
          '...It is done. The Warden is free, and the Crown is nothing but cooling metal.',
          'I shaped the remaining Moonstone around your blade. Not as a trophy. As a reminder: power that demands a prisoner is never protection.',
          'There is one thing I cannot explain. When the Crown broke, something beneath the ruins rang once—like a bell heard through very deep water.',
          'This chapter is finished. The ruins will always have more stories, but they do not all belong to us.'
        ],'Quest complete. The main Embervale story currently ends here.','The Ash Warden was freed and the Cinder Crown destroyed.','1000 coins + Moonstone Blade');
      }
      return storyPanel('Sage Elowen','The Cinder Crown','Chapter II — A Guardian in Chains',[
        `Warden defeated: ${(q.wardenKills||0)>=1?'yes':'not yet'}. Moonstone carried: ${p.inv.moon>=1?'yes':'not yet'}.`,
        'We need both. The Warden must fall while a free Moonstone is close enough for me to redirect the bond.'
      ],'Defeat the Ash Warden and possess 1 Moonstone.',`Warden ${(q.wardenKills||0)>=1?'✓':'—'} · Moonstone ${p.inv.moon>=1?'✓':'—'}`,'');
    }
    return storyPanel('Sage Elowen','The Cinder Crown','After the Crown',[
      'The dead have grown quieter. Even the lava sounds less angry, if lava can be accused of having moods.',
      'I keep thinking about that final bell. Mira heard one beneath her bridge. I heard one beneath a mountain of ruins.',
      'For now, Embervale has earned a little peace. Use it while it lasts.'
    ],'Quest complete. The Ashen Ruins are quieter, though never truly empty.','Complete','');
  }
  if(id==='jory_catch'){
    const q=p.quests.jory_catch;
    if(q.stage===0){
      q.stage=1;q.fishCaught=0;
      return storyPanel('Fisher Jory','The One That Got Away','A Fisherman’s Emergency',[
        'I need your help with a criminal. Silver scales, smug little eyes, about this long. Stole my best brass lure right off the line.',
        'Before you ask: yes, I am accusing a fish of theft. I have witnesses. They are also fish, which has complicated the trial.',
        'Catch five fish from the Greenmeadow river. If the thief is among them, my lure should turn up. If not, at least we have dinner.'
      ],'Catch 5 fish from Greenmeadow fishing spots.','Jory is hunting a fish that stole his lucky lure.','90 coins + 2 cooked fish');
    }
    if(q.stage===1){
      if((q.fishCaught||0)>=5){
        q.stage=2;p.coins+=90;p.inv.food+=2;
        return storyPanel('Fisher Jory','The One That Got Away','The Terrible Truth',[
          'There it is! My brass lure. Knew I was not imagining things.',
          '...That is awkward. See the bite marks? Not fish teeth. Otter.',
          'I have spent three days publicly accusing the river’s entire fish population of organized theft.',
          'Keep that detail between us. Take the coin, take the cooked fish, and if anyone asks, the culprit was enormous.'
        ],'Quest complete.',`${q.fishCaught||0}/5 fish caught`,'90 coins + 2 cooked fish');
      }
      return storyPanel('Fisher Jory','The One That Got Away','A Fisherman’s Emergency',[
        `You have caught ${q.fishCaught||0} of the 5 fish I need checked.`,
        'Do not be fooled by the innocent-looking ones. That is exactly how a professional operates.'
      ],'Catch 5 fish from Greenmeadow fishing spots.',`${q.fishCaught||0}/5 fish caught`,'');
    }
    return storyPanel('Fisher Jory','The One That Got Away','After the Investigation',[
      'I apologized to the fish. Most of them accepted. One is holding a grudge.',
      'The otter has not returned my other lure, so I am choosing to call this a partial victory.'
    ],'Quest complete.','Complete','');
  }

  if(id==='nessa_promise'){
    const q=p.quests.nessa_promise;
    if(q.stage===0){
      q.stage=1;q.wolfKills=0;
      return storyPanel('Scout Nessa','A Scout’s Promise','The Closed Trail',[
        'There is an old healer named Mara beyond the southern ridge. She patched me up when I was a stupid recruit and refused payment.',
        'I promised I would keep her supply trail open. Then the dire wolves moved in, and Arden decided “being eaten” is not an acceptable scouting method.',
        'Clear three Dire Wolves from the lower trail. I can handle the rest once the pack stops treating the road like a pantry.'
      ],'Defeat 3 Dire Wolves in the Iron Hills.','Nessa wants to reopen a supply trail she promised to protect.','220 coins + a second chapter');
    }
    if(q.stage===1){
      if((q.wolfKills||0)>=3){
        q.stage=2;
        return storyPanel('Scout Nessa','A Scout’s Promise','Medicine for Mara',[
          'Trail is open. Good work.',
          'One more thing. Mara will pretend she needs nothing, which is how you know she needs everything.',
          'Bring me three herbs. I will pack them with the next supply bundle and tell her they were “accidentally” left at her door.'
        ],'Gather 3 herbs and return to Nessa.','The wolves are gone; Nessa still needs medicine for the healer beyond the ridge.','220 coins + 2 cooked food');
      }
      return storyPanel('Scout Nessa','A Scout’s Promise','The Closed Trail',[
        `You have cleared ${q.wolfKills||0} of 3 Dire Wolves from Mara’s trail.`,
        'They hunt in the low ground near dusk. Do not let them circle behind you.'
      ],'Defeat 3 Dire Wolves in the Iron Hills.',`${q.wolfKills||0}/3 Dire Wolves defeated`,'');
    }
    if(q.stage===2){
      if(p.inv.herbs>=3){
        p.inv.herbs-=3;q.stage=3;p.coins+=220;p.inv.food+=2;
        return storyPanel('Scout Nessa','A Scout’s Promise','Delivered Without Thanks',[
          'Perfect. Mara will complain that I sent too much, then use every leaf.',
          'When I was sixteen, she told me a promise is just a map you draw for your future self. You still have to walk it.',
          'Thanks for helping me walk this one.'
        ],'Quest complete.','Mara’s trail is open and her medicines are on the way.','220 coins + 2 cooked food');
      }
      return storyPanel('Scout Nessa','A Scout’s Promise','Medicine for Mara',[
        `I still need ${Math.max(0,3-p.inv.herbs)} more herbs for Mara’s supply bundle.`,
        'She likes the sharp-smelling hill variety. Says it tastes terrible, which apparently means it is medicinal.'
      ],'Gather 3 herbs and return to Nessa.',`${Math.min(3,p.inv.herbs)}/3 herbs`,'');
    }
    return storyPanel('Scout Nessa','A Scout’s Promise','After the Trail',[
      'Mara sent a note back. It says, “Tell Nessa I did not need the herbs.”',
      'Under that she wrote three pages describing exactly how she used them. That woman has not changed.'
    ],'Quest complete.','Complete','');
  }

  if(id==='cael_name'){
    const q=p.quests.cael_name;
    if(q.stage===0){
      q.stage=1;q.skeletonKills=0;
      return storyPanel('Echo of Cael','A Name in Ash','The Missing Word',[
        'I remember my post. I remember the temple doors. I remember dying.',
        'There is one thing the Crown took more thoroughly than my life: my sister’s name.',
        'Three of the Ash Skeletons nearby wore the same keeper seal as I did. Their memory-ash may still carry fragments of our oath—and perhaps the word I lost.',
        'Break their armor. Bring the memories close enough for me to hear.'
      ],'Defeat 3 Ash Skeletons.','Cael wants to recover a single name erased by the Cinder Crown.','350 coins + 1 Moonstone');
    }
    if(q.stage===1){
      if((q.skeletonKills||0)>=3){
        q.stage=2;p.coins+=350;p.inv.moon+=1;
        return storyPanel('Echo of Cael','A Name in Ash','Lysa',[
          'Lysa.',
          'That was it. Lysa.',
          'She hated temple duty. Sang badly on purpose. Put honey in my boots the morning I was promoted.',
          'I had a whole life, and the Crown reduced it to orders. You gave one piece back.',
          'Take this Moonstone. It was mine once. I would rather it become part of someone’s future than another monument to my past.'
        ],'Quest complete.','Cael remembers his sister: Lysa.','350 coins + 1 Moonstone');
      }
      return storyPanel('Echo of Cael','A Name in Ash','The Missing Word',[
        `${q.skeletonKills||0} of the 3 keeper echoes have fallen.`,
        'Each one leaves a sound behind. Not speech. More like a door almost opening.'
      ],'Defeat 3 Ash Skeletons.',`${q.skeletonKills||0}/3 Ash Skeletons defeated`,'');
    }
    return storyPanel('Echo of Cael','A Name in Ash','A Memory Kept',[
      'Lysa.',
      'I say it sometimes just to prove the Crown does not own it anymore.'
    ],'Quest complete.','Complete','');
  }

  if(SIDE_QUESTS[id])return genericQuestTalk(p,SIDE_QUESTS[id]);
  return storyPanel('Adventurer','Roadside Words','', ['Safe travels.']);
}
function npcTalk(p,id){
  const first=p.quests.first_steps?.stage||0,gob=p.quests.goblin_problem?.stage||0,ruin=p.quests.ruin_heart?.stage||0;
  if(id==='jory'){
    const lines=first<2?[
      'River has been wrong for three nights. Fish bite before the hook touches water, then vanish like they remembered an appointment.',
      'Mira says not to frighten newcomers with river stories. So naturally I am telling you immediately.'
    ]:first<3?[
      'Saw you under the bridge. Brave place to put your head, with those rats about.',
      'My grandfather said that bell only rings when the old roads east are opening. He also said onions cure curses, so judge his wisdom accordingly.'
    ]:[
      'Bridge looks better. River does not.',
      'If you head east, remember this: water carries sound farther than roads carry footsteps.'
    ];
    return storyPanel('Fisher Jory','Greenmeadow Voices','By the River',lines,'','Local conversation','');
  }
  if(id==='nessa'){
    const lines=gob<2?[
      'Arden told me to stay in camp. Arden has been telling me that since we were sixteen.',
      'The goblins are scouting, not hunting. Watch which direction they look when they think no one is watching.'
    ]:gob===2?[
      'I am apparently supposed to be unconscious. Do me a favor and do not tell Arden I am sitting up.',
      'Ash-colored robes. Three people, maybe four. They kept saying “wake the Crown.” One of them had no shadow in the firelight.'
    ]:[
      'I owe you for the herbs. Arden will call it “supporting the patrol.” I call it owing you.',
      'If you go through the eastern pass, do not follow voices that know your name before you introduce yourself.'
    ];
    return storyPanel('Scout Nessa','Iron Hills Voices','At the Wayfarer Camp',lines,'','Local conversation','');
  }
  if(id==='cael'){
    const lines=ruin<2?[
      '...not another keeper...',
      'The Crown remembers commands. We remembered pain. Do not confuse memory with loyalty.'
    ]:ruin<3?[
      'The Warden still hears two masters. One is dead. One was never alive.',
      'Break the command, wanderer. Do not merely break the body that carries it.'
    ]:[
      'Quiet. I had forgotten quiet.',
      'Elowen cannot hear me anymore. Tell her... no. Let the living keep one mystery that does not hurt them.'
    ];
    return storyPanel('Echo of Cael','Ashen Voices','A Memory in the Ruins',lines,'','A lingering echo from the Cinder War','');
  }
  return storyPanel('Traveler','Roadside Words','', ['The road is long. Keep your boots dry.']);
}
function npcGreeting(p,id){
  if(id==='lyra'){
    const st=p.quests.first_steps?.stage||0;
    return st<1?'First week in Greenmeadow? Buy food before pride convinces you that you do not need it.':st<3?'Mira has you working on that bridge, does she? She always pays in purpose first and coin second.':'You are the one who found the cinder mark. Wonderful. Nothing improves business like an ancient mystery and nervous travelers.';
  }
  if(id==='hollis'){
    const st=p.quests.goblin_problem?.stage||0;
    return st<1?'If you came for mountain bargains, I have them. If you came for mountain safety, ask someone who lies for a living.':st<3?'Arden is buying bandages faster than I can stock them. Whatever you are doing out there, try to need fewer holes patched.':'Raid traffic is down and honest travelers are back. I would thank you, but gratitude ruins my reputation as a trader.';
  }
  if(id==='orrin'){
    return 'Vale Bank rule number one: if it glows, hums, whispers, or claims to be your ancestor, it goes in a separate vault. Moonstones qualify for three of those.';
  }
  return 'Welcome. Take a look around.';
}
function shopBuy(p,item){
  const stock={food:{price:12,label:'Cooked Fish',apply:()=>p.inv.food++},bar:{price:18,label:'Bronze Bar',apply:()=>p.inv.bars++},bronze:{price:180,label:'Bronze Sword',apply:()=>p.gear.weapon='bronze'},armor:{price:240,label:'Bronze Armor',apply:()=>{p.gear.armor='bronze';p.hp=maxHp(p)}}};
  const s=stock[item];if(!s)return 'That item is not sold here.';if(item==='bronze'&&p.gear.weapon!=='rusty')return 'You already have a better weapon.';if(item==='armor'&&p.gear.armor==='bronze')return 'You already own bronze armor.';if(p.coins<s.price)return `You need ${s.price-p.coins} more coins.`;p.coins-=s.price;s.apply();return `Purchased ${s.label} for ${s.price} coins.`;
}
function sellBasic(p){const gain=p.inv.logs*3+p.inv.copper*4+p.inv.rawFish*3+p.inv.herbs*5;p.inv.logs=p.inv.copper=p.inv.rawFish=p.inv.herbs=0;p.coins+=gain;return gain?`Sold basic resources for ${gain} coins.`:'You have no basic resources to sell.'}
function craft(p,recipe){
  if(recipe==='smelt'){if(p.inv.copper<2)return 'You need 2 copper ore.';p.inv.copper-=2;p.inv.bars++;addXp(p,'smith',24);return 'You smelt a bronze bar.'}
  if(recipe==='cook'){if(p.inv.rawFish<1)return 'You need raw fish.';p.inv.rawFish--;p.inv.food++;addXp(p,'cook',20);return 'You cook a fish.'}
  if(recipe==='sword'){if(p.gear.weapon!=='rusty')return 'You already have a stronger weapon.';if(p.inv.bars<4)return 'You need 4 bronze bars.';p.inv.bars-=4;p.gear.weapon='bronze';addXp(p,'smith',85);return 'You forge and equip a Bronze Sword.'}
  if(recipe==='armor'){if(p.gear.armor==='bronze')return 'You already own Bronze Armor.';if(p.inv.bars<6)return 'You need 6 bronze bars.';p.inv.bars-=6;p.gear.armor='bronze';p.hp=maxHp(p);addXp(p,'smith',120);return 'You forge Bronze Armor.'}
  if(recipe==='bow'){if(p.gear.weapon==='oakbow'||p.gear.weapon==='moon')return 'You already have that tier of weapon or better.';if(p.inv.logs<8)return 'You need 8 logs.';p.inv.logs-=8;p.gear.weapon='oakbow';addXp(p,'fletch',95);return 'You fletch and equip an Oak Shortbow.'}
  if(recipe==='moon'){if(p.gear.weapon==='moon')return 'You already wield the Moonstone Blade.';if(p.inv.moon<1||p.inv.bars<10)return 'You need 1 Moonstone and 10 bronze bars.';p.inv.moon--;p.inv.bars-=10;p.gear.weapon='moon';addXp(p,'smith',300);return 'You forge and equip the Moonstone Blade.'}
  return 'Unknown recipe.';
}
function bankTransfer(p,mode,key,amount){
  if(!INV_KEYS.includes(key))return 'Unknown item.';amount=clamp(Math.floor(Number(amount)||0),1,9999);
  if(mode==='deposit'){const n=Math.min(amount,p.inv[key]);if(!n)return 'Nothing to deposit.';p.inv[key]-=n;p.bank[key]+=n;return `Deposited ${n} ${key}.`}
  if(mode==='withdraw'){const n=Math.min(amount,p.bank[key]);if(!n)return 'Nothing to withdraw.';p.bank[key]-=n;p.inv[key]+=n;return `Withdrew ${n} ${key}.`}
  return 'Unknown bank action.';
}
function updateQuestKill(p,m){
  let cue='';
  if(m.kind==='rat'&&p.quests.first_steps.stage===2){const q=p.quests.first_steps;q.ratKills=Math.min(3,(q.ratKills||0)+1);if(q.ratKills===3)cue=' A sliver of black glass falls from its nest. Mira needs to see this.';}
  if(m.kind==='goblin'&&p.quests.goblin_problem.stage===1){const q=p.quests.goblin_problem;q.kills=Math.min(5,(q.kills||0)+1);if(q.kills===5)cue=' The last goblin carries a scrap marked with a burning crown. Return to Arden.';}
  if(m.kind==='skeleton'&&p.quests.ruin_heart.stage===1){const q=p.quests.ruin_heart;q.skeletonKills=Math.min(2,(q.skeletonKills||0)+1);if(q.skeletonKills===2)cue=' Pale ash coils from the broken armor like a half-remembered voice. Elowen can read it.';}
  if(m.kind==='warden'&&p.quests.ruin_heart.stage===2){const q=p.quests.ruin_heart;q.wardenKills=(q.wardenKills||0)+1;cue=' The Cinder Crown cracks as the Warden falls. Bring a Moonstone to Elowen before the bond reforms.';}
  if(m.kind==='wolf'&&p.quests.nessa_promise?.stage===1){const q=p.quests.nessa_promise;q.wolfKills=Math.min(3,(q.wolfKills||0)+1);if(q.wolfKills===3)cue+=' The lower trail is clear. Return to Nessa.';}
  if(m.kind==='skeleton'&&p.quests.cael_name?.stage===1){const q=p.quests.cael_name;q.skeletonKills=Math.min(3,(q.skeletonKills||0)+1);if(q.skeletonKills===3)cue+=' The last echo leaves behind a whispered syllable. Cael may recognize it.';}
  cue+=updateGenericKill(p,m);
  return cue;
}

function mime(path){return ({'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.json':'application/json; charset=utf-8','.svg':'image/svg+xml','.webmanifest':'application/manifest+json','.png':'image/png','.ico':'image/x-icon'})[extname(path)]||'application/octet-stream'}
const server=http.createServer(async(req,res)=>{
  if(req.url==='/healthz'){res.writeHead(200,{'Content-Type':'application/json','Cache-Control':'no-store'});return res.end(JSON.stringify({status:'ok'}))}
  try{
    const raw=(req.url||'/').split('?')[0];const rel=raw==='/'?'index.html':raw.replace(/^\/+/, '');const safe=normalize(rel).replace(/^(\.\.(\/|\\|$))+/, '');const path=join(ROOT,safe);
    if(!path.startsWith(ROOT)){res.writeHead(403);return res.end('Forbidden')}
    const info=await stat(path);if(!info.isFile())throw new Error('not file');const body=await readFile(path);
    res.writeHead(200,{'Content-Type':mime(path),'Cache-Control':extname(path)==='.html'?'no-cache':'public, max-age=300'});res.end(body);
  }catch{res.writeHead(404,{'Content-Type':'text/plain; charset=utf-8'});res.end('Not found')}
});

const wss=new WebSocketServer({server,maxPayload:MAX_MESSAGE});
wss.on('connection',ws=>{
  world.sockets.set(ws,null);send(ws,{type:'hello',message:'Connected to Embervale Online.'});
  ws.on('message',raw=>{
    let msg;try{msg=JSON.parse(String(raw))}catch{return}
    const token=world.sockets.get(ws);let p=token?world.players.get(token):null;
    if(msg.type==='join'){
      let id=String(msg.token||'').replace(/[^a-zA-Z0-9_-]/g,'').slice(0,80);if(id.length<12)id=randomUUID();
      p=world.players.get(id)||freshPlayer(id,msg.name);p.name=cleanName(msg.name||p.name);p.online=true;p.lastSeen=Date.now();p.cooldowns={move:0,action:0,chat:0};
      const def=zoneDef(p.zone)||WORLD_DEFS[0];p.zone=def.id;p.x=clamp(Number(p.x)||def.spawn.x,40,def.w-40);p.y=clamp(Number(p.y)||def.spawn.y,40,def.h-40);
      world.players.set(id,p);world.sockets.set(ws,id);send(ws,{type:'joined',token:id});sendState(ws,p,'Welcome to Embervale Online.');sendZone(ws,p);send(ws,{type:'chatHistory',chat:world.chat.slice(-60)});broadcastZone(p.zone);noteSave();return;
    }
    if(!p){send(ws,{type:'error',message:'Join the world first.'});return}
    if(msg.type==='move'){
      if(!actionReady(p,'move',55))return;let dx=Number(msg.dx)||0,dy=Number(msg.dy)||0;const mag=Math.hypot(dx,dy);if(mag>1){dx/=mag;dy/=mag}if(Math.abs(dx)<.01&&Math.abs(dy)<.01)return;
      const nx=p.x+dx*MOVE_STEP,ny=p.y+dy*MOVE_STEP;if(!blocked(p.zone,nx,ny)){p.x=nx;p.y=ny;if(Math.abs(dx)>Math.abs(dy))p.dir=dx>0?'right':'left';else p.dir=dy>0?'down':'up'}p.lastSeen=Date.now();return;
    }
    if(msg.type==='interact'){
      if(!actionReady(p,'action',400))return;const found=findStatic(p.zone,String(msg.id||''));if(!found)return;
      if(distance(p,found.obj)>95){sendState(ws,p,'Move a little closer first.');return}
      if(found.kind==='node'){
        const n=found.obj,info=resourceInfo(n.type);if(!n.active){sendState(ws,p,'That resource is recovering.');return}
        const amount=Math.random()<0.18+p.zone*0.04?2:1;p.inv[info.item]+=amount;addXp(p,info.skill,(info.xp+p.zone*5)*amount);n.active=false;n.respawnAt=Date.now()+info.respawn;
        let text=`You gather ${amount} ${info.label}.`;
        text+=updateGenericGather(p,info.item,n.type,amount,p.zone);
        if(p.zone===0&&n.type==='fish'&&p.quests.jory_catch?.stage===1){const q=p.quests.jory_catch;q.fishCaught=Math.min(5,(q.fishCaught||0)+amount);if(q.fishCaught>=5)text+=' Something brass flashes between the fish scales. Jory will want to see this.';}
        if(p.zone===2&&Math.random()<0.04){p.inv.moon++;text+=' ✨ You uncover a Moonstone!'}
        if(info.item==='herbs'&&p.quests.goblin_problem.stage===2&&p.inv.herbs>=4)text+=' You now have enough herbs for Arden’s healer.';
        if(info.item==='herbs'&&p.quests.nessa_promise?.stage===2&&p.inv.herbs>=3)text+=' You have enough herbs for Nessa’s supply bundle.';
        sendState(ws,p,text,{fx:{x:n.x,y:n.y,kind:n.type}});broadcastZone(p.zone);noteSave();return;
      }
      if(found.kind==='npc'){
        const n=found.obj;
        if(n.type==='quest'){const dialog=questTalk(p,n.quest);sendState(ws,p,null,{panel:{type:'dialog',...dialog}});noteSave();return}
        if(n.type==='talk'){const dialog=npcTalk(p,n.id);sendState(ws,p,null,{panel:{type:'dialog',...dialog}});return}
        if(n.type==='shop'){sendState(ws,p,null,{panel:{type:'shop',title:n.name,greeting:npcGreeting(p,n.id)}});return}
        if(n.type==='bank'){sendState(ws,p,null,{panel:{type:'bank',title:n.name,greeting:npcGreeting(p,n.id)}});return}
        if(n.type==='gate'){
          const target=zoneDef(n.to);if(totalLevel(p)<target.req){sendState(ws,p,`You need total level ${target.req} to enter ${target.name}.`);return}
          const old=p.zone;p.zone=target.id;const sp=target.spawn;p.x=sp.x;p.y=sp.y;sendState(ws,p,`You travel to ${target.name}.`);sendZone(ws,p);broadcastZone(old);broadcastZone(p.zone);noteSave();return;
        }
      }
      return;
    }
    if(msg.type==='attack'){
      if(!actionReady(p,'action',650))return;const z=world.zones.get(p.zone),m=z.monsters.get(String(msg.id||''));if(!m||!m.alive)return;if(distance(p,m)>100){sendState(ws,p,'Move closer to attack.');return}
      const heavy=!!msg.heavy;if(heavy&&Math.random()<0.26){let ret=Math.max(0,Math.floor(Math.random()*(3+m.lv*.45)));p.hp-=ret;const death=checkDeath(p);sendState(ws,p,death||`Your heavy strike misses. ${m.name}${ret?` hits you for ${ret}`:' misses its counterattack'}.`);broadcastZone(p.zone);noteSave();return}
      const damage=(heavy?5+Math.floor(Math.random()*8):2+Math.floor(Math.random()*5))+Math.floor(p.skills.combat.lv*(heavy?.42:.3))+weaponBonus(p);m.hp=Math.max(0,m.hp-damage);let text=`You hit ${m.name} for ${damage}.`;
      if(m.hp<=0){m.alive=false;m.respawnAt=Date.now()+(m.kind==='warden'?15000:7000);p.kills++;const questCue=updateQuestKill(p,m);const coins=8+m.lv*3+Math.floor(Math.random()*10);p.coins+=coins;addXp(p,'combat',30+m.lv*5);if(Math.random()<.18)p.inv.food++;if((p.zone>=1&&Math.random()<.07)||m.kind==='warden'){p.inv.moon++;text+=' ✨ Moonstone drop!'}if(!p.gear.pet&&p.kills>=20&&Math.random()<.055){p.gear.pet=true;text+=' 🐾 An Ember Fox begins following you!'}text+=` ${m.name} is defeated. +${coins} coins.`;if(questCue)text+=questCue;broadcastZone(p.zone,{type:'event',zone:p.zone,message:`${p.name} defeated ${m.name}!`,x:m.x,y:m.y,kind:'defeat'});
      }else{const ret=Math.max(0,Math.floor(Math.random()*(3+m.lv*.45)));p.hp-=ret;text+=ret?` It hits you back for ${ret}.`:' It misses its counterattack.';const death=checkDeath(p);if(death)text+=' '+death}
      sendState(ws,p,text,{fx:{x:m.x,y:m.y,kind:'hit',damage}});broadcastZone(p.zone);noteSave();return;
    }
    if(msg.type==='eat'){
      if(!actionReady(p,'action',300))return;if(p.inv.food<1){sendState(ws,p,'You have no cooked food.');return}if(p.hp>=maxHp(p)){sendState(ws,p,'You are already at full health.');return}p.inv.food--;p.hp=Math.min(maxHp(p),p.hp+14);sendState(ws,p,'You eat cooked fish and restore 14 health.');noteSave();return;
    }
    if(msg.type==='rest'){
      if(!actionReady(p,'action',1000))return;p.hp=maxHp(p);sendState(ws,p,'You rest by the campfire and recover fully.');noteSave();return;
    }
    if(msg.type==='craft'){if(!actionReady(p,'action',300))return;sendState(ws,p,craft(p,String(msg.recipe||'')));noteSave();return}
    if(msg.type==='shopBuy'){if(!actionReady(p,'action',250))return;const shopNpc=world.zones.get(p.zone)?.def.npcs.find(n=>n.type==='shop');sendState(ws,p,shopBuy(p,String(msg.item||'')),{panel:{type:'shop',title:shopNpc?.name||'Merchant',greeting:shopNpc?npcGreeting(p,shopNpc.id):'Take a look around.'}});noteSave();return}
    if(msg.type==='sellBasic'){if(!actionReady(p,'action',250))return;const shopNpc=world.zones.get(p.zone)?.def.npcs.find(n=>n.type==='shop');sendState(ws,p,sellBasic(p),{panel:{type:'shop',title:shopNpc?.name||'Merchant',greeting:shopNpc?npcGreeting(p,shopNpc.id):'Take a look around.'}});noteSave();return}
    if(msg.type==='bank'){if(!actionReady(p,'action',150))return;const bankNpc=world.zones.get(p.zone)?.def.npcs.find(n=>n.type==='bank');sendState(ws,p,bankTransfer(p,String(msg.mode||''),String(msg.key||''),msg.amount),{panel:{type:'bank',title:bankNpc?.name||'Vale Bank',greeting:bankNpc?npcGreeting(p,bankNpc.id):'Your belongings are secure.'}});noteSave();return}
    if(msg.type==='appearance'){
      const allowedShirts=['#587cc8','#a55f79','#5e9c78','#9c724f','#745f9e','#b86f4c'];const shirt=String(msg.shirt||'');if(allowedShirts.includes(shirt))p.appearance.shirt=shirt;sendState(ws,p,'Appearance updated.');broadcastZone(p.zone);noteSave();return;
    }
    if(msg.type==='chat'){
      if(!actionReady(p,'chat',800))return;const text=cleanChat(msg.text);if(!text)return;const message={id:randomUUID(),name:p.name,zone:p.zone,text,time:Date.now()};world.chat.push(message);world.chat=world.chat.slice(-80);broadcastAll({type:'chat',message});return;
    }
  });
  ws.on('close',()=>{const token=world.sockets.get(ws);world.sockets.delete(ws);const p=token?world.players.get(token):null;if(p){p.online=false;p.lastSeen=Date.now();broadcastZone(p.zone);noteSave()}});
});

setInterval(()=>{
  const now=Date.now();
  for(const [zoneId,z] of world.zones){
    for(const n of z.nodes.values())if(!n.active&&now>=n.respawnAt){n.active=true;n.respawnAt=0}
    for(const m of z.monsters.values()){
      if(!m.alive){if(now>=m.respawnAt){m.alive=true;m.hp=m.maxHp;m.x=m.spawnX;m.y=m.spawnY;m.nextTurn=now+600}continue}
      if(now>=m.nextTurn){const a=Math.random()*Math.PI*2,speed=m.kind==='warden'?8:12;m.vx=Math.cos(a)*speed;m.vy=Math.sin(a)*speed;m.nextTurn=now+700+Math.random()*1600}
      const nx=m.x+m.vx*.22,ny=m.y+m.vy*.22;const homeDist=Math.hypot(nx-m.spawnX,ny-m.spawnY);if(homeDist<170&&!blocked(zoneId,nx,ny)){m.x=nx;m.y=ny}else{m.vx*=-1;m.vy*=-1}
    }
    if([...world.players.values()].some(p=>p.online&&p.zone===zoneId))broadcastZone(zoneId);
  }
},TICK_MS);

setInterval(()=>saveWorld().catch(reportSaveError),30000);
let stopping=false;
async function shutdown(){if(stopping)return;stopping=true;clearTimeout(saveTimer);server.close();for(const ws of wss.clients)ws.close(1001,'Server restarting');try{await saveWorld();await closeStorage();process.exit(0)}catch(error){reportSaveError(error);process.exit(1)}}
process.on('SIGINT',shutdown);
process.on('SIGTERM',shutdown);

server.listen(PORT,'0.0.0.0',()=>console.log(`Embervale Online listening on port ${PORT}`));

(() => {

const canvas = document.getElementById("c");
const ctx = canvas.getContext("2d");

const statusEl = document.getElementById("status");
const scoreEl  = document.getElementById("score");
const speedEl  = document.getElementById("speed");
const tauntEl  = document.getElementById("taunt");

const W = canvas.width;
const H = canvas.height;

/* ----- scene bands ----- */

const SKY_END   = 120;
const OCEAN_END = 190;
const SAND_END  = 215;

const ROAD_TOP  = 215;
const ROAD_H    = 20;

const GRASS_TOP = ROAD_TOP + ROAD_H;

/* ----- physics ----- */

const groundY = ROAD_TOP + ROAD_H;

const gravity = 2200;
const jumpVel = 410;
const jumpCut = 0.45;

/* ----- speeds ----- */

const baseScroll = 320;
const speedRamp  = 0.045;
const spawnBase  = 0.95;

/* ----- Jared frames ----- */

const RUN_FRAMES  = 8;
const JUMP_FRAMES = 9;
const SLIDE_FRAMES = 6;

const RUN_FPS   = 12;
const JUMP_FPS  = 14;
const SLIDE_FPS = 14;

/* ----- dog ----- */

const DOG_FRAMES = 6;
const DOG_FPS = 10;
const DOG_SPEED = 1.12;

/* ----- draw sizes ----- */

const JARED_DRAW = 64;
const DOG_DRAW   = 56;
const TREE_DRAW  = 200;

const sprites = {
  run:[], jump:[], slide:[], dog:[],
  tree:null,
  loaded:0,
  total: RUN_FRAMES + JUMP_FRAMES + SLIDE_FRAMES + DOG_FRAMES + 1,
  ready:false,
  firstError:null
};

function load(path){
  const i = new Image();
  i.onload=()=>{sprites.loaded++;if(sprites.loaded>=sprites.total)sprites.ready=true;updateStatus();};
  i.onerror=()=>{sprites.firstError=path;updateStatus();};
  i.src=path;
  return i;
}

for(let i=0;i<RUN_FRAMES;i++)  sprites.run.push(load(`assets/jared/run_${i}.png`));
for(let i=0;i<JUMP_FRAMES;i++) sprites.jump.push(load(`assets/jared/jump_${i}.png`));
for(let i=0;i<SLIDE_FRAMES;i++)sprites.slide.push(load(`assets/jared/runslide_${i}.png`));
for(let i=0;i<DOG_FRAMES;i++)  sprites.dog.push(load(`assets/dog/dog_${i}.png`));

sprites.tree = load("assets/shrubbery/coconut_tree_1.png");

function updateStatus(){
  if(sprites.firstError) statusEl.textContent="Missing: "+sprites.firstError;
  else if(!sprites.ready) statusEl.textContent=`Loading ${sprites.loaded}/${sprites.total}`;
  else statusEl.textContent="Ready";
}

/* ---------- state ---------- */

let running=false, gameOver=false;
let time=0, tPrev=performance.now();
let score=0, scrollMul=1;

const player = {
  x:120,
  y:groundY,
  vy:0,
  w:28,
  h:44,
  onGround:true,

  sliding:false,
  slideT:0
};

let runT=0, jumpT=0;

const obs=[];
let spawnTimer=0;

const trees=[{x:650},{x:980},{x:1310},{x:1700}];

/* ---------- slide hitbox table ---------- */

function slideHeight(frame){
  const full = player.h;
  const low  = 18;

  if(frame===0||frame===5) return full;
  if(frame===1||frame===4) return (full+low)/2;
  return low;
}

/* ---------- input ---------- */

function start(){
  if(!sprites.ready)return;
  if(!running && !gameOver){running=true;statusEl.textContent="Go!";}
}

function jump(){
  start();
  if(gameOver||!player.onGround||player.sliding)return;
  player.vy=-jumpVel;
  player.onGround=false;
  jumpT=0;
}

function endJump(){
  if(player.vy<0) player.vy*=jumpCut;
}

function startSlide(){
  start();
  if(!player.onGround||player.sliding||gameOver)return;
  player.sliding=true;
  player.slideT=0;
}

window.addEventListener("keydown",e=>{
  if(e.code==="Space"||e.code==="ArrowUp"){e.preventDefault();jump();}
  if(e.code==="ArrowDown"){e.preventDefault();startSlide();}
  if(e.code==="KeyR")reset();
});

window.addEventListener("keyup",e=>{
  if(e.code==="Space"||e.code==="ArrowUp") endJump();
});

canvas.addEventListener("pointerdown",e=>{
  if(e.button===2) startSlide();
  else jump();
});

canvas.addEventListener("contextmenu",e=>e.preventDefault());

canvas.addEventListener("pointerup",endJump);

/* ---------- helpers ---------- */

function rand(a,b){return Math.random()*(b-a)+a;}

function spawnGroundCoco(){
  obs.push({type:"ground",x:W+40,y:groundY-6,w:26,h:22});
}

function spawnBat(){
  obs.push({type:"bat",x:W+40,y:rand(140,190),w:26,h:14,flap:0});
}

function spawnFall(treeX){
  obs.push({type:"fall",x:treeX,y:60,r:12,vy:rand(420,700)});
}

function spawnDog(){
  obs.push({type:"dog",x:W+60,y:groundY,hitW:34,hitH:22,animT:0});
}

function chooseSpawn(){
  const r=Math.random();
  if(r<0.18) spawnDog();
  else if(r<0.35) spawnBat();
  else if(r<0.6){
    const t=trees.find(t=>t.x>player.x+200)||trees[0];
    spawnFall(t.x);
  }
  else spawnGroundCoco();
}

/* ---------- collision ---------- */

function playerRect(){
  let h=player.h;

  if(player.sliding){
    const f=Math.min(5,Math.floor(player.slideT*SLIDE_FPS));
    h=slideHeight(f);
  }

  return {x:player.x,y:player.y-h,w:player.w,h};
}

function overlap(a,b){
  return a.x<b.x+b.w&&a.x+a.w>b.x&&a.y<b.y+b.h&&a.y+a.h>b.y;
}

function hit(){
  const pr=playerRect();
  for(const o of obs){
    if(o.type==="ground"){
      if(overlap(pr,{x:o.x,y:o.y,w:o.w,h:o.h}))return true;
    }
    if(o.type==="bat"){
      if(overlap(pr,{x:o.x,y:o.y-o.h,w:o.w,h:o.h}))return true;
    }
    if(o.type==="fall"){
      if(overlap(pr,{x:o.x-o.r,y:o.y-o.r,w:o.r*2,h:o.r*2}))return true;
    }
    if(o.type==="dog"){
      if(overlap(pr,{x:o.x,y:o.y-o.hitH,w:o.hitW,h:o.hitH}))return true;
    }
  }
  return false;
}

/* ---------- update ---------- */

function update(dt){

  time+=dt;
  scrollMul=1+time*speedRamp;
  const scroll=baseScroll*scrollMul;

  score+=dt*10*scrollMul;

  runT+=player.onGround&&!player.sliding?dt:0;
  jumpT+=!player.onGround?dt:0;

  if(player.sliding){
    player.slideT+=dt;
    if(player.slideT>SLIDE_FRAMES/SLIDE_FPS){
      player.sliding=false;
    }
  }

  player.vy+=gravity*dt;
  player.y+=player.vy*dt;

  if(player.y>=groundY){
    player.y=groundY;
    player.vy=0;
    player.onGround=true;
  }else player.onGround=false;

  for(const t of trees)t.x-=scroll*dt;
  const maxX=Math.max(...trees.map(t=>t.x));
  for(const t of trees) if(t.x<-TREE_DRAW) t.x=maxX+rand(260,420);

  spawnTimer-=dt;
  const every=Math.max(.38,spawnBase/Math.sqrt(scrollMul));
  if(spawnTimer<=0){chooseSpawn();spawnTimer=every;}

  for(const o of obs){
    if(o.type==="ground") o.x-=scroll*dt;
    if(o.type==="bat"){
      o.x-=scroll*1.15*dt;
      o.flap+=dt*10;
      o.y+=Math.sin(o.flap)*10*dt;
    }
    if(o.type==="fall"){
      o.x-=scroll*dt;
      o.y+=o.vy*dt;
      if(o.y>=groundY-6){
        o.type="ground";
        o.y=groundY-6;
        o.w=26;o.h=22;
      }
    }
    if(o.type==="dog"){
      o.x-=scroll*DOG_SPEED*dt;
      o.animT+=dt;
    }
  }

  for(let i=obs.length-1;i>=0;i--) if(obs[i].x<-120)obs.splice(i,1);

  if(hit()){
    running=false;
    gameOver=true;
    statusEl.textContent="Game over – press R";
  }

  scoreEl.textContent=Math.floor(score);
  speedEl.textContent=scrollMul.toFixed(1)+"x";
}

/* ---------- drawing ---------- */

function drawBackground(){

  const g=ctx.createLinearGradient(0,0,0,H);
  g.addColorStop(0,"#6ad4ff");
  g.addColorStop(1,"#e9f9ff");
  ctx.fillStyle=g;
  ctx.fillRect(0,0,W,SKY_END);

  ctx.fillStyle="#1e8cc4";
  ctx.fillRect(0,SKY_END,W,OCEAN_END-SKY_END);

  ctx.fillStyle="#f0d79a";
  ctx.fillRect(0,OCEAN_END,W,SAND_END-OCEAN_END);

  ctx.fillStyle="#caa06a";
  ctx.fillRect(0,ROAD_TOP,W,ROAD_H);

  ctx.fillStyle="#2f9b57";
  ctx.fillRect(0,GRASS_TOP,W,H-GRASS_TOP);
}

function treeDraw(x){
  const img=sprites.tree;
  const y=ROAD_TOP- TREE_DRAW + 4;
  ctx.imageSmoothingEnabled=false;
  ctx.drawImage(img,x-TREE_DRAW/2,y,TREE_DRAW,TREE_DRAW);
  ctx.imageSmoothingEnabled=true;
}

function jaredFrame(){
  if(player.sliding){
    return sprites.slide[Math.min(5,Math.floor(player.slideT*SLIDE_FPS))];
  }
  if(!player.onGround){
    return sprites.jump[Math.min(JUMP_FRAMES-1,Math.floor(jumpT*JUMP_FPS))];
  }
  return sprites.run[Math.floor(runT*RUN_FPS)%RUN_FRAMES];
}

function drawPlayer(){
  const img=jaredFrame();
  ctx.drawImage(img,player.x-14,player.y-JARED_DRAW+6,JARED_DRAW,JARED_DRAW);
}

function drawDog(o){
  const f=Math.floor(o.animT*DOG_FPS)%DOG_FRAMES;
  ctx.drawImage(sprites.dog[f],o.x-10,groundY-DOG_DRAW+6,DOG_DRAW,DOG_DRAW);
}

/* ---------- main draw ---------- */

function draw(){
  ctx.clearRect(0,0,W,H);

  drawBackground();

  for(const t of trees) treeDraw(t.x);

  drawPlayer();

  for(const o of obs){
    if(o.type==="ground"){
      ctx.fillStyle="#6b3b1c";
      ctx.fillRect(o.x,o.y,o.w,o.h);
    }
    if(o.type==="bat"){
      ctx.fillStyle="#222";
      ctx.fillRect(o.x,o.y-10,10,10);
    }
    if(o.type==="fall"){
      ctx.fillStyle="#6b3b1c";
      ctx.beginPath();ctx.arc(o.x,o.y,o.r,0,Math.PI*2);ctx.fill();
    }
    if(o.type==="dog") drawDog(o);
  }

  if(!sprites.ready){
    ctx.fillStyle="rgba(0,0,0,.4)";
    ctx.fillRect(0,0,W,H);
    ctx.fillStyle="#fff";
    ctx.fillText("Loading…",420,150);
  }
}

function loop(t){
  const dt=Math.min(.033,(t-tPrev)/1000);
  tPrev=t;

  if(running&&!gameOver&&sprites.ready)update(dt);
  draw();
  requestAnimationFrame(loop);
}

function reset(){
  running=false;gameOver=false;time=0;score=0;scrollMul=1;
  obs.length=0;spawnTimer=0;
  player.y=groundY;player.vy=0;player.sliding=false;
  runT=jumpT=0;
  trees[0].x=650;trees[1].x=980;trees[2].x=1310;trees[3].x=1700;
}

tauntEl.textContent="Coconut apprentice";

reset();
requestAnimationFrame(loop);

})();

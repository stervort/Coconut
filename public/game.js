(() => {

  const canvas = document.getElementById("c");
  const ctx = canvas.getContext("2d");

  const statusEl = document.getElementById("status");
  const scoreEl  = document.getElementById("score");
  const speedEl  = document.getElementById("speed");
  const tauntEl  = document.getElementById("taunt");
  const leaderboardEl = document.getElementById("leaderboard");

  const W = canvas.width;
  const H = canvas.height;

  // --------------------
  // Global leaderboard (API)
  // --------------------
  const HS_LIMIT = 10;

  async function apiGetScores() {
    const r = await fetch("/api/scores", { method: "GET" });
    if (!r.ok) throw new Error("Failed to load scores");
    const j = await r.json();
    return Array.isArray(j.scores) ? j.scores : [];
  }

  async function apiSubmitScore(name, score, achievement) {
    const r = await fetch("/api/scores", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, score, achievement })
    });
    if (!r.ok) throw new Error("Failed to submit score");
    return await r.json();
  }

  function fmtDate(iso) {
    try {
      const d = new Date(iso);
      if (Number.isNaN(d.getTime())) return "";
      return d.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "2-digit" });
    } catch {
      return "";
    }
  }

  function renderHighScores(list) {
    if (!leaderboardEl) return;

    if (!list || list.length === 0) {
      leaderboardEl.innerHTML = `
        <h3>Top 10</h3>
        <div style="opacity:.85">No scores yet. Be the first!</div>
      `;
      return;
    }

    const items = list.slice(0, HS_LIMIT).map((e, i) => {
      const name = (e.name || "Unknown").toString().replace(/[<>]/g, "");
      const score = Math.floor(Number(e.score) || 0);
      const ach = (e.achievement || "Coconut apprentice").toString().replace(/[<>]/g, "");
      const date = fmtDate(e.created_at);

      return `
        <li>
          <div class="lb-left">
            <div class="lb-name">${i + 1}. ${name}</div>
            <div class="lb-meta">${ach}${date ? " • " + date : ""}</div>
          </div>
          <div class="lb-score">${score}</div>
        </li>
      `;
    }).join("");

    leaderboardEl.innerHTML = `
      <h3>Top 10</h3>
      <ol>${items}</ol>
    `;
  }

  async function refreshLeaderboard() {
    try {
      const list = await apiGetScores();
      renderHighScores(list);
      return list;
    } catch (e) {
      console.error(e);
      if (leaderboardEl) {
        leaderboardEl.innerHTML = `<h3>Top 10</h3><div style="opacity:.85">Could not load leaderboard.</div>`;
      }
      return [];
    }
  }

  // initial load
  refreshLeaderboard();

  // --------------------
  // Scene / physics
  // --------------------
  const SKY_END   = 120;
  const OCEAN_END = 190;
  const SAND_END  = 215;

  const ROAD_TOP  = 215;
  const ROAD_H    = 20;

  const GRASS_TOP = ROAD_TOP + ROAD_H;

  const groundY = ROAD_TOP + ROAD_H;
  const gravity = 2200;

  const jumpVel = 410;
  const jumpCut = 0.45;

  const baseScroll = 320;
  const speedRamp  = 0.045;
  const spawnBase  = 0.95;

  const RUN_FRAMES   = 8;
  const JUMP_FRAMES  = 9;
  const SLIDE_FRAMES = 6;

  const RUN_FPS   = 12;
  const JUMP_FPS  = 14;

  const SLIDE_IN_FPS   = 16;
  const SLIDE_OUT_FPS  = 16;
  const SLIDE_HOLD_MAX = 3.0;
  const SLIDE_HOLD_FRAMES = [2, 3];

  const DOG_FRAMES = 6;
  const DOG_FPS    = 10;
  const DOG_SPEED  = 1.12;

  const BAT_FRAMES = 14;
  const BAT_FPS    = 18;
  const BAT_DRAW   = 64;
  const BAT_HIT_W  = 36;
  const BAT_HIT_H  = 18;

  const JARED_DRAW = 64;
  const DOG_DRAW   = 56;
  const DOG_Y_OFFSET = 10;

  const TREE_DRAW  = 200;
  const TREE_PATH  = "assets/shrubbery/coconut_tree_1.png";

  const COCONUT_PATH = "assets/shrubbery/coconut_1.png";
  const COCONUT_GROUND_DRAW = 32;
  const COCONUT_FALL_DRAW   = 28;

  const COCONUT_GROUND_Y_OFFSET = 20;
  const COCONUT_LAND_Y_OFFSET   = 22;

  const sprites = {
    run:[], jump:[], slide:[], dog:[], bat:[],
    tree:null,
    coconut:null,
    loaded:0,
    total: RUN_FRAMES + JUMP_FRAMES + SLIDE_FRAMES + DOG_FRAMES + BAT_FRAMES + 2,
    ready:false,
    firstError:null
  };

  function load(path){
    const i = new Image();
    i.onload = () => {
      sprites.loaded++;
      if (sprites.loaded >= sprites.total) sprites.ready = true;
      updateStatus();
    };
    i.onerror = () => {
      if (!sprites.firstError) sprites.firstError = path;
      updateStatus();
      console.error("Missing:", path);
    };
    i.src = path;
    return i;
  }

  for (let i=0;i<RUN_FRAMES;i++)   sprites.run.push(load(`assets/jared/run_${i}.png`));
  for (let i=0;i<JUMP_FRAMES;i++)  sprites.jump.push(load(`assets/jared/jump_${i}.png`));
  for (let i=0;i<SLIDE_FRAMES;i++) sprites.slide.push(load(`assets/jared/runslide_${i}.png`));
  for (let i=0;i<DOG_FRAMES;i++)   sprites.dog.push(load(`assets/dog/dog_${i}.png`));
  for (let i=0;i<BAT_FRAMES;i++)   sprites.bat.push(load(`assets/bat/bat_${i}.png`));

  sprites.tree = load(TREE_PATH);
  sprites.coconut = load(COCONUT_PATH);

  function updateStatus(){
    if (sprites.firstError) statusEl.textContent = "Missing: " + sprites.firstError;
    else if (!sprites.ready) statusEl.textContent = `Loading ${sprites.loaded}/${sprites.total}`;
    else statusEl.textContent = "Ready";
  }

  // --------------------
  // Game state
  // --------------------
  let running=false, gameOver=false;
  let time=0, tPrev=performance.now();
  let score=0, scrollMul=1;
  let gameOverHandled=false;

  const player = {
    x:120,
    y:groundY,
    vy:0,
    w:28,
    h:44,
    onGround:true,

    slideHeld:false,
    slideQueued:false,   // <-- queue slide if pressed mid-air
    slideState:"none",
    slideFrame:0,
    slideAccum:0,
    slideHoldT:0
  };

  let runT=0, jumpT=0;

  const obs=[];
  let spawnTimer=0;

  const trees=[{x:650},{x:980},{x:1310},{x:1700}];

  function slideHeight(frame){
    const full = player.h;
    const low  = 18;
    if (frame===0 || frame===5) return full;
    if (frame===1 || frame===4) return (full + low) / 2;
    return low;
  }

  function achievementForScore(s) {
    if (s >= 1800) return "Jared, destroyer of coconuts 👑";
    if (s >= 1300) return "Samoa sprint legend ⚡";
    if (s >= 900)  return "Bat dodger 🦇";
    if (s >= 500)  return "Coconut dodger 🥥";
    if (s >= 200)  return "Tree trainee 🌴";
    return "Coconut apprentice";
  }

  // --------------------
  // Input
  // --------------------
  function start(){
    if(!sprites.ready) return;
    if(!running && !gameOver){
      running=true;
      statusEl.textContent="Go!";
    }
  }

  function jump(){
    start();
    if (gameOver || !player.onGround) return;
    if (player.slideState !== "none") return;

    player.vy = -jumpVel;
    player.onGround = false;
    jumpT = 0;
  }

  function endJump(){
    if (player.vy < 0) player.vy *= jumpCut;
  }

  function startSlideNow(){
    if (player.slideState === "none") {
      player.slideState = "in";
      player.slideFrame = 0;
      player.slideAccum = 0;
      player.slideHoldT = 0;
    }
  }

  function beginSlide(){
    start();
    if (gameOver) return;

    player.slideHeld = true;

    // If in air, queue it so it starts immediately on landing
    if (!player.onGround) {
      player.slideQueued = true;
      return;
    }

    startSlideNow();
  }

  function releaseSlide(){
    player.slideHeld = false;

    // If still airborne and not sliding yet, cancel queue
    if (!player.onGround && player.slideState === "none") {
      player.slideQueued = false;
      return;
    }

    if (player.slideState === "hold" || player.slideState === "in") {
      player.slideState = "out";
      player.slideFrame = Math.max(player.slideFrame, 4);
      player.slideAccum = 0;
    }
  }

  window.addEventListener("keydown", (e) => {
    if (e.code === "Space" || e.code === "ArrowUp") { e.preventDefault(); jump(); }
    if (e.code === "ArrowDown") { e.preventDefault(); beginSlide(); }
    if (e.code === "KeyR") reset();
  });

  window.addEventListener("keyup", (e) => {
    if (e.code === "Space" || e.code === "ArrowUp") endJump();
    if (e.code === "ArrowDown") releaseSlide();
  });

  canvas.addEventListener("pointerdown", (e) => {
    if (e.button === 2) beginSlide();
    else jump();
  });

  canvas.addEventListener("pointerup", (e) => {
    if (e.button === 2) releaseSlide();
    if (e.button === 0) endJump();
  });

  canvas.addEventListener("contextmenu", (e) => e.preventDefault());

  // --------------------
  // Spawning
  // --------------------
  function rand(a,b){ return Math.random()*(b-a)+a; }

  function spawnGroundCoco(){
    obs.push({type:"ground", x:W+40, y:groundY-COCONUT_GROUND_Y_OFFSET, w:26, h:22});
  }

  function spawnBat(){
    obs.push({
      type:"bat",
      x:W+60,
      y:rand(135, 195),
      hitW: BAT_HIT_W,
      hitH: BAT_HIT_H,
      animT: 0,
      wiggleT: Math.random() * 10
    });
  }

  function spawnFall(treeX){
    obs.push({type:"fall", x:treeX, y:60, r:12, vy:rand(420,700)});
  }

  function spawnDog(){
    obs.push({type:"dog", x:W+60, y:groundY + DOG_Y_OFFSET, hitW:34, hitH:22, animT:0});
  }

  function chooseSpawn(){
    const r = Math.random();
    if (r < 0.18) spawnDog();
    else if (r < 0.35) spawnBat();
    else if (r < 0.60) {
      const t = trees.find(t=>t.x>player.x+200) || trees[0];
      spawnFall(t.x);
    } else spawnGroundCoco();
  }

  // --------------------
  // Collision
  // --------------------
  function playerRect(){
    let h = player.h;
    if (player.slideState !== "none") h = slideHeight(player.slideFrame);
    return { x: player.x, y: player.y - h, w: player.w, h };
  }

  function overlap(a,b){
    return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
  }

  function hit(){
    const pr = playerRect();

    for(const o of obs){
      if (o.type==="ground") {
        if (overlap(pr, {x:o.x,y:o.y,w:o.w,h:o.h})) return true;
      }
      if (o.type==="bat") {
        if (overlap(pr, {x:o.x, y:o.y - o.hitH, w:o.hitW, h:o.hitH})) return true;
      }
      if (o.type==="fall") {
        if (overlap(pr, {x:o.x-o.r,y:o.y-o.r,w:o.r*2,h:o.r*2})) return true;
      }
      if (o.type==="dog") {
        if (overlap(pr, {x:o.x,y:o.y-o.hitH,w:o.hitW,h:o.hitH})) return true;
      }
    }
    return false;
  }

  // --------------------
  // Slide state machine
  // --------------------
  function updateSlide(dt){
    if (player.slideState === "none") return;

    if (player.slideState === "in") {
      player.slideAccum += dt * SLIDE_IN_FPS;
      while (player.slideAccum >= 1) {
        player.slideAccum -= 1;
        player.slideFrame = Math.min(2, player.slideFrame + 1);
      }
      if (player.slideFrame >= 2) {
        player.slideState = "hold";
        player.slideHoldT = 0;
        player.slideAccum = 0;
      }
      if (!player.slideHeld && player.slideFrame >= 1) {
        player.slideState = "out";
        player.slideFrame = 4;
        player.slideAccum = 0;
      }
      return;
    }

    if (player.slideState === "hold") {
      player.slideHoldT += dt;

      player.slideAccum += dt * 6;
      if (player.slideAccum >= 1) {
        player.slideAccum = 0;
        player.slideFrame = (player.slideFrame === SLIDE_HOLD_FRAMES[0]) ? SLIDE_HOLD_FRAMES[1] : SLIDE_HOLD_FRAMES[0];
      }

      if (!player.slideHeld || player.slideHoldT >= SLIDE_HOLD_MAX) {
        player.slideState = "out";
        player.slideFrame = 4;
        player.slideAccum = 0;
      }
      return;
    }

    if (player.slideState === "out") {
      player.slideAccum += dt * SLIDE_OUT_FPS;
      while (player.slideAccum >= 1) {
        player.slideAccum -= 1;
        player.slideFrame = Math.min(5, player.slideFrame + 1);
      }
      if (player.slideFrame >= 5) {
        player.slideState = "none";
        player.slideFrame = 0;
        player.slideAccum = 0;
        player.slideHoldT = 0;

        // If still holding down, start sliding again immediately
        if (player.slideHeld && player.onGround) startSlideNow();
      }
    }
  }

  // --------------------
  // Game over -> submit score if Top 10
  // --------------------
  async function handleGameOver(){
    if (gameOverHandled) return;
    gameOverHandled = true;

    const finalScore = Math.floor(score);
    const ach = achievementForScore(finalScore);

    // Load current top 10 to decide whether to prompt for name
    const list = await refreshLeaderboard();
    const min = (list.length >= HS_LIMIT) ? Math.floor(Number(list[list.length - 1]?.score || 0)) : -1;
    const qualifies = (list.length < HS_LIMIT) || (finalScore > min);

    if (!qualifies) return;

    let name = window.prompt("New High Score! Enter your name:", "");
    if (!name || !name.trim()) name = "Unknown";
    name = name.trim().slice(0, 18);

    try {
      const res = await apiSubmitScore(name, finalScore, ach);
      if (res && Array.isArray(res.scores)) renderHighScores(res.scores);
      else await refreshLeaderboard();
    } catch (e) {
      console.error(e);
    }
  }

  // --------------------
  // Update loop
  // --------------------
  function update(dt){
    time += dt;

    scrollMul = 1 + time * speedRamp;
    const scroll = baseScroll * scrollMul;

    score += dt * 10 * scrollMul;

    if (player.onGround && player.slideState==="none") runT += dt;
    if (!player.onGround) jumpT += dt;

    updateSlide(dt);

    const wasInAir = !player.onGround;

    // physics
    player.vy += gravity * dt;
    player.y += player.vy * dt;

    if (player.y >= groundY) {
      player.y = groundY;
      player.vy = 0;
      player.onGround = true;

      // queued slide triggers instantly on landing
      if (wasInAir && player.slideState === "none" && (player.slideQueued || player.slideHeld)) {
        player.slideQueued = false;
        startSlideNow();
      }
    } else {
      player.onGround = false;
    }

    // trees
    for (const t of trees) t.x -= scroll * dt;
    const maxX = Math.max(...trees.map(t => t.x));
    for (const t of trees) {
      if (t.x < -TREE_DRAW) t.x = maxX + rand(260, 420);
    }

    // spawning
    spawnTimer -= dt;
    const every = Math.max(0.38, spawnBase / Math.sqrt(scrollMul));
    if (spawnTimer <= 0) {
      chooseSpawn();
      spawnTimer = every;
    }

    // obstacles move
    for (const o of obs) {
      if (o.type === "ground") o.x -= scroll * dt;

      if (o.type === "bat") {
        o.x -= scroll * 1.20 * dt;
        o.animT += dt;
        o.wiggleT += dt * 6.5;
        o.y += Math.sin(o.wiggleT) * 10 * dt;
      }

      if (o.type === "fall") {
        o.x -= scroll * dt;
        o.y += o.vy * dt;

        const landY = groundY - COCONUT_LAND_Y_OFFSET;
        if (o.y >= landY) {
          o.type = "ground";
          o.y = landY;
          o.w = 26;
          o.h = 22;
        }
      }

      if (o.type === "dog") {
        o.x -= scroll * DOG_SPEED * dt;
        o.animT += dt;
        o.y = groundY + DOG_Y_OFFSET;
      }
    }

    // cleanup
    for (let i = obs.length - 1; i >= 0; i--) {
      if (obs[i].x < -200) obs.splice(i, 1);
    }

    if (hit()) {
      running = false;
      gameOver = true;
      statusEl.textContent = "Game over – press R";
      handleGameOver();
    }

    scoreEl.textContent = Math.floor(score);
    speedEl.textContent = scrollMul.toFixed(1) + "x";

    // taunt
    const s = Math.floor(score);
    tauntEl.textContent = achievementForScore(s);
  }

  // --------------------
  // Drawing
  // --------------------
  function drawBackground(){
    // Sky
    const g = ctx.createLinearGradient(0,0,0,SKY_END);
    g.addColorStop(0,"#6ad4ff");
    g.addColorStop(1,"#e9f9ff");
    ctx.fillStyle = g;
    ctx.fillRect(0,0,W,SKY_END);

    // Ocean
    ctx.fillStyle = "#1e8cc4";
    ctx.fillRect(0, SKY_END, W, OCEAN_END - SKY_END);

    // wave pixels
    const old = ctx.imageSmoothingEnabled;
    ctx.imageSmoothingEnabled = false;
    const tile = 8;
    const drift = Math.floor((time * 22) % tile);
    for (let row=0; row<2; row++){
      const y = SKY_END + 18 + row * 18;
      for (let x=-tile; x<W+tile; x+=tile){
        const phase = ((x + drift) / tile) | 0;
        if (phase % 5 === 0) {
          ctx.fillStyle = "rgba(220,255,255,0.35)";
          ctx.fillRect(x + drift + 2, y, 3, 2);
        }
      }
    }
    ctx.imageSmoothingEnabled = old;

    // Sand
    ctx.fillStyle = "#f0d79a";
    ctx.fillRect(0, OCEAN_END, W, SAND_END - OCEAN_END);

    // Road
    ctx.fillStyle = "#2b2b2b";
    ctx.fillRect(0, ROAD_TOP, W, ROAD_H);
    ctx.fillStyle = "rgba(255,255,255,0.35)";
    for (let x = 0; x < W; x += 40) {
      ctx.fillRect(x + 10, ROAD_TOP + ROAD_H/2 - 1, 18, 2);
    }

    // Grass
    ctx.fillStyle = "#2f9b57";
    ctx.fillRect(0, GRASS_TOP, W, H - GRASS_TOP);
  }

  function treeDraw(x){
    const img = sprites.tree;
    const y = ROAD_TOP - TREE_DRAW + 4;
    ctx.imageSmoothingEnabled = false;
    if (img && img.complete && img.naturalWidth > 0) {
      ctx.drawImage(img, x - TREE_DRAW/2, y, TREE_DRAW, TREE_DRAW);
    }
    ctx.imageSmoothingEnabled = true;
  }

  function jaredFrame(){
    if (player.slideState !== "none") return sprites.slide[player.slideFrame] || sprites.run[0];
    if (!player.onGround) {
      const idx = Math.min(JUMP_FRAMES - 1, Math.floor(jumpT * JUMP_FPS));
      return sprites.jump[idx] || sprites.run[0];
    }
    return sprites.run[Math.floor(runT * RUN_FPS) % RUN_FRAMES] || sprites.run[0];
  }

  function drawPlayer(){
    const img = jaredFrame();
    if (!img || !img.complete || img.naturalWidth === 0) return;
    ctx.drawImage(img, player.x - 14, player.y - JARED_DRAW + 6, JARED_DRAW, JARED_DRAW);
  }

  function drawDog(o){
    const f = Math.floor(o.animT * DOG_FPS) % DOG_FRAMES;
    const img = sprites.dog[f];
    if (!img || !img.complete || img.naturalWidth === 0) return;
    ctx.drawImage(img, o.x - 14, o.y - DOG_DRAW + 6, DOG_DRAW, DOG_DRAW);
  }

  function drawGroundCoconut(o){
    const img = sprites.coconut;
    if (img && img.complete && img.naturalWidth > 0) {
      ctx.imageSmoothingEnabled = false;
      const x = o.x - 2;
      const y = o.y - (COCONUT_GROUND_DRAW - o.h);
      ctx.drawImage(img, x, y, COCONUT_GROUND_DRAW, COCONUT_GROUND_DRAW);
      ctx.imageSmoothingEnabled = true;
    } else {
      ctx.fillStyle = "#6b3b1c";
      ctx.fillRect(o.x, o.y, o.w, o.h);
    }
  }

  function drawFallingCoconut(o){
    const img = sprites.coconut;
    if (img && img.complete && img.naturalWidth > 0) {
      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(img, o.x - COCONUT_FALL_DRAW/2, o.y - COCONUT_FALL_DRAW/2, COCONUT_FALL_DRAW, COCONUT_FALL_DRAW);
      ctx.imageSmoothingEnabled = true;
    } else {
      ctx.fillStyle="#6b3b1c";
      ctx.beginPath();
      ctx.arc(o.x, o.y, o.r, 0, Math.PI*2);
      ctx.fill();
    }
  }

  function drawBat(o){
    const img = sprites.bat[Math.floor(o.animT * BAT_FPS) % BAT_FRAMES];
    if (!img || !img.complete || img.naturalWidth === 0) {
      ctx.fillStyle = "#222";
      ctx.fillRect(o.x, o.y - o.hitH, o.hitW, o.hitH);
      return;
    }
    ctx.imageSmoothingEnabled = false;
    const dx = o.x - (BAT_DRAW - o.hitW)/2;
    const dy = (o.y - o.hitH) - (BAT_DRAW - o.hitH)/2;
    ctx.drawImage(img, dx, dy, BAT_DRAW, BAT_DRAW);
    ctx.imageSmoothingEnabled = true;
  }

  function draw(){
    ctx.clearRect(0,0,W,H);
    drawBackground();
    for (const t of trees) treeDraw(t.x);

    drawPlayer();

    for (const o of obs) {
      if (o.type==="ground") drawGroundCoconut(o);
      else if (o.type==="fall") drawFallingCoconut(o);
      else if (o.type==="dog") drawDog(o);
      else if (o.type==="bat") drawBat(o);
    }

    if(!sprites.ready){
      ctx.fillStyle="rgba(0,0,0,.4)";
      ctx.fillRect(0,0,W,H);
      ctx.fillStyle="#fff";
      ctx.font="16px sans-serif";
      ctx.fillText("Loading…", 410, 150);
    }
  }

  function loop(t){
    const dt = Math.min(0.033, (t - tPrev) / 1000);
    tPrev = t;
    if (running && !gameOver && sprites.ready) update(dt);
    draw();
    requestAnimationFrame(loop);
  }

  function reset(){
    running=false; gameOver=false; time=0; score=0; scrollMul=1;
    obs.length=0; spawnTimer=0;
    gameOverHandled=false;

    player.y=groundY; player.vy=0; player.onGround=true;

    player.slideHeld=false;
    player.slideQueued=false;
    player.slideState="none";
    player.slideFrame=0;
    player.slideAccum=0;
    player.slideHoldT=0;

    runT=0; jumpT=0;

    trees[0].x=650; trees[1].x=980; trees[2].x=1310; trees[3].x=1700;

    tauntEl.textContent="Coconut apprentice";
    scoreEl.textContent="0";
    speedEl.textContent="1.0x";
    statusEl.textContent = sprites.ready ? "Ready" : "Loading…";
  }

  reset();
  requestAnimationFrame(loop);

})();

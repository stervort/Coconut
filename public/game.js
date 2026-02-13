(() => {
  const canvas = document.getElementById("c");
  const ctx = canvas.getContext("2d");

  const statusEl = document.getElementById("status");
  const scoreEl  = document.getElementById("score");
  const speedEl  = document.getElementById("speed");
  const tauntEl  = document.getElementById("taunt");
  const leaderboardEl = document.getElementById("leaderboard");

  // name overlay UI
  const overlayEl = document.getElementById("nameOverlay");
  const nameInput = document.getElementById("nameInput");
  const submitBtn = document.getElementById("submitNameBtn");
  const skipBtn   = document.getElementById("skipNameBtn");
  const overlaySub = document.getElementById("nameOverlaySub");

  const W = canvas.width;
  const H = canvas.height;

  // -------------------------
  // Leaderboard API (global)
  // -------------------------
  const HS_LIMIT = 10;

  async function apiGetScores() {
    const r = await fetch("/api/scores");
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
    } catch { return ""; }
  }

  function renderHighScores(list) {
    if (!leaderboardEl) return;

    if (!list || list.length === 0) {
      leaderboardEl.innerHTML = `<h3>Top 10</h3><div style="opacity:.85">No scores yet. Be the first!</div>`;
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

    leaderboardEl.innerHTML = `<h3>Top 10</h3><ol>${items}</ol>`;
  }

  async function refreshLeaderboard() {
    try {
      const list = await apiGetScores();
      renderHighScores(list);
      return list;
    } catch (e) {
      console.error(e);
      if (leaderboardEl) leaderboardEl.innerHTML = `<h3>Top 10</h3><div style="opacity:.85">Could not load leaderboard.</div>`;
      return [];
    }
  }

  refreshLeaderboard();

  // -------------------------
  // In-page high score entry
  // -------------------------
  let pendingHighScore = null;

  function showNameOverlay(score, achievement) {
    pendingHighScore = { score, achievement };
    if (overlaySub) overlaySub.textContent = `Score: ${score} • ${achievement}`;
    overlayEl?.classList.add("show");
    overlayEl?.setAttribute("aria-hidden", "false");
    if (nameInput) {
      nameInput.value = "";
      setTimeout(() => nameInput.focus(), 0);
    }
  }

  function hideNameOverlay() {
    overlayEl?.classList.remove("show");
    overlayEl?.setAttribute("aria-hidden", "true");
  }

  async function submitNameFromOverlay(useName) {
    if (!pendingHighScore) return;

    let name = (useName ?? "").toString().trim();
    if (!name) name = "Unknown";
    name = name.slice(0, 18);

    const { score, achievement } = pendingHighScore;
    pendingHighScore = null;
    hideNameOverlay();

    try {
      const res = await apiSubmitScore(name, score, achievement);
      if (res && Array.isArray(res.scores)) renderHighScores(res.scores);
      else await refreshLeaderboard();
    } catch (e) {
      console.error(e);
      await refreshLeaderboard();
    }
  }

  submitBtn?.addEventListener("click", () => submitNameFromOverlay(nameInput?.value));
  skipBtn?.addEventListener("click", () => submitNameFromOverlay("Unknown"));
  nameInput?.addEventListener("keydown", (e) => {
    if (e.key === "Enter") submitNameFromOverlay(nameInput.value);
    if (e.key === "Escape") submitNameFromOverlay("Unknown");
  });
  overlayEl?.addEventListener("click", (e) => {
    if (e.target === overlayEl) submitNameFromOverlay("Unknown");
  });

  // -------------------------
  // Scene bands
  // -------------------------
  const SKY_END   = 120;
  const OCEAN_END = 190;
  const SAND_END  = 215;

  const ROAD_TOP  = 215;
  const ROAD_H    = 20;
  const GRASS_TOP = ROAD_TOP + ROAD_H;

  // -------------------------
  // Physics / speed
  // -------------------------
  const groundY = ROAD_TOP + ROAD_H;
  const gravity = 2200;

  // IMPORTANT: your normal jump setting
  const BASE_JUMP_VEL = 700;
  const BOOST_JUMP_VEL = 900;

  const jumpCut = 0.45;

  const baseScroll = 320;
  const speedRamp  = 0.045;
  const spawnBase  = 0.95;

  // -------------------------
  // Animations & assets
  // -------------------------
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

  // Drinks
  const ITEM_DRAW = 32;
  const PROTEIN_PATH = "assets/items/protein_shake.png";
  const PINA_PATH    = "assets/items/pina_colada.png";
  const DRINK_SPAWN_CHANCE = 0.10; // 10% of spawns become drinks (tweak)

  // Inventory
  const INVENTORY_MAX = 3;

  // Effects
  let timeScale = 1.0; // slow motion multiplier (affects EVERYTHING incl jump)
  const SLOWMO_SCALE = 0.65;
  const SLOWMO_DURATION = 6.0;

  const protein = { active:false, timer:0, immune:false };
  const slowmo  = { active:false, timer:0 };

  // Popups
  const popups = []; // {text, t, x, y}

  // Bubbles particles for pina
  const bubbles = []; // {x,y,vx,vy,t,life}

  const sprites = {
    run:[], jump:[], slide:[], dog:[], bat:[],
    tree:null, coconut:null,
    protein:null, pina:null,
    loaded:0,
    total: RUN_FRAMES + JUMP_FRAMES + SLIDE_FRAMES + DOG_FRAMES + BAT_FRAMES + 4,
    ready:false,
    firstError:null
  };

  function load(path){
    const i = new Image();
    i.onload = () => { sprites.loaded++; if (sprites.loaded >= sprites.total) sprites.ready = true; updateStatus(); };
    i.onerror = () => { if (!sprites.firstError) sprites.firstError = path; updateStatus(); console.error("Missing:", path); };
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
  sprites.protein = load(PROTEIN_PATH);
  sprites.pina = load(PINA_PATH);

  function updateStatus(){
    if (sprites.firstError) statusEl.textContent = "Missing: " + sprites.firstError;
    else if (!sprites.ready) statusEl.textContent = `Loading ${sprites.loaded}/${sprites.total}`;
    else statusEl.textContent = "Ready";
  }

  // -------------------------
  // Game state
  // -------------------------
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
    slideQueued:false,
    slideState:"none",
    slideFrame:0,
    slideAccum:0,
    slideHoldT:0
  };

  let runT=0, jumpT=0;

  const obs=[]; // obstacles + items
  let spawnTimer=0;

  const trees=[{x:650},{x:980},{x:1310},{x:1700}];

  const inventory = []; // FIFO: push, shift

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

  // -------------------------
  // Input
  // -------------------------
  function start(){
    if(!sprites.ready) return;
    if(!running && !gameOver){
      running=true;
      statusEl.textContent="Go!";
    }
  }

  function currentJumpVel(){
    // If protein is active, boost jump (and keep immunity)
    if (protein.active) return BOOST_JUMP_VEL;
    return BASE_JUMP_VEL;
  }

  function jump(){
    start();
    if (gameOver || !player.onGround) return;
    if (player.slideState !== "none") return;

    player.vy = -currentJumpVel();
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

    if (!player.onGround) { player.slideQueued = true; return; }
    startSlideNow();
  }

  function releaseSlide(){
    player.slideHeld = false;

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

  function useInventory(){
    start();
    if (gameOver) return;
    if (inventory.length === 0) return;

    const item = inventory.shift();
    if (item === "protein") {
      protein.active = true;
      protein.timer = 7.0;
      protein.immune = true;
      addPopup("PROTEIN SHAKE!");
    } else if (item === "pina") {
      slowmo.active = true;
      slowmo.timer = SLOWMO_DURATION;
      timeScale = SLOWMO_SCALE;
      addPopup("PINA COLADA!");
    }
  }

  function throwInventory(){
    start();
    if (gameOver) return;
    if (inventory.length === 0) return;
    inventory.shift();
    addPopup("YEET!");
  }

  window.addEventListener("keydown", (e) => {
    if (overlayEl?.classList.contains("show")) { e.preventDefault(); return; }

    if (e.code === "Space" || e.code === "ArrowUp") { e.preventDefault(); jump(); }
    if (e.code === "ArrowDown") { e.preventDefault(); beginSlide(); }

    // NEW
    if (e.code === "ArrowLeft")  { e.preventDefault(); useInventory(); }
    if (e.code === "ArrowRight") { e.preventDefault(); throwInventory(); }

    if (e.code === "KeyR") reset();
  });

  window.addEventListener("keyup", (e) => {
    if (overlayEl?.classList.contains("show")) return;
    if (e.code === "Space" || e.code === "ArrowUp") endJump();
    if (e.code === "ArrowDown") releaseSlide();
  });

  canvas.addEventListener("pointerdown", (e) => {
    if (overlayEl?.classList.contains("show")) return;
    if (e.button === 2) beginSlide();
    else jump();
  });

  canvas.addEventListener("pointerup", (e) => {
    if (overlayEl?.classList.contains("show")) return;
    if (e.button === 2) releaseSlide();
    if (e.button === 0) endJump();
  });

  canvas.addEventListener("contextmenu", (e) => e.preventDefault());

  // -------------------------
  // Helpers
  // -------------------------
  function rand(a,b){ return Math.random()*(b-a)+a; }

  function addPopup(text){
    popups.push({ text, t:0, x: W/2, y: 92 });
  }

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

  function spawnDrink(kind){
    // same lane/height as ground coconuts
    obs.push({
      type: kind === "protein" ? "drink_protein" : "drink_pina",
      x: W + 60,
      y: groundY - COCONUT_GROUND_Y_OFFSET, // align to coconut lane
      w: 26,
      h: 22
    });
  }

  function chooseSpawn(){
    // sometimes spawn a drink instead of obstacle
    if (Math.random() < DRINK_SPAWN_CHANCE) {
      spawnDrink(Math.random() < 0.5 ? "protein" : "pina");
      return;
    }

    const r = Math.random();
    if (r < 0.18) spawnDog();
    else if (r < 0.35) spawnBat();
    else if (r < 0.60) {
      const t = trees.find(t=>t.x>player.x+200) || trees[0];
      spawnFall(t.x);
    } else spawnGroundCoco();
  }

  // -------------------------
  // Collision
  // -------------------------
  function playerRect(){
    let h = player.h;
    if (player.slideState !== "none") h = slideHeight(player.slideFrame);
    return { x: player.x, y: player.y - h, w: player.w, h };
  }

  function overlap(a,b){
    return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
  }

  function hitObstacleOrPickup(){
    const pr = playerRect();

    for(const o of obs){
      if (o.kicked) continue;

      if (o.type==="ground") {
        if (overlap(pr, {x:o.x,y:o.y,w:o.w,h:o.h})) return { kind:"obstacle", obj:o };
      }
      if (o.type==="bat") {
        if (overlap(pr, {x:o.x, y:o.y - o.hitH, w:o.hitW, h:o.hitH})) return { kind:"obstacle", obj:o };
      }
      if (o.type==="fall") {
        if (overlap(pr, {x:o.x-o.r,y:o.y-o.r,w:o.r*2,h:o.r*2})) return { kind:"obstacle", obj:o };
      }
      if (o.type==="dog") {
        if (overlap(pr, {x:o.x,y:o.y-o.hitH,w:o.hitW,h:o.hitH})) return { kind:"obstacle", obj:o };
      }
      if (o.type==="drink_protein" || o.type==="drink_pina") {
        if (overlap(pr, {x:o.x,y:o.y,w:o.w,h:o.h})) return { kind:"drink", obj:o };
      }
    }
    return null;
  }

  function kickObstacle(o){
    // yeet it to the right
    o.kicked = true;
    o.vx = 1100;
    o.vy = -250 - Math.random()*200;
    o.spin = (Math.random() < 0.5 ? -1 : 1) * (5 + Math.random()*6);
    o.rot = 0;
  }

  // -------------------------
  // Slide state machine
  // -------------------------
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

        if (player.slideHeld && player.onGround) startSlideNow();
      }
    }
  }

  // -------------------------
  // Game over -> overlay
  // -------------------------
  async function handleGameOver(){
    if (gameOverHandled) return;
    gameOverHandled = true;

    const finalScore = Math.floor(score);
    const ach = achievementForScore(finalScore);

    const list = await refreshLeaderboard();
    const min = (list.length >= HS_LIMIT) ? Math.floor(Number(list[list.length - 1]?.score || 0)) : -1;
    const qualifies = (list.length < HS_LIMIT) || (finalScore > min);

    if (!qualifies) return;
    showNameOverlay(finalScore, ach);
  }

  // -------------------------
  // Update loop
  // -------------------------
  function update(dtRaw){
    time += dtRaw;

    // apply slow motion scaling to everything (including physics)
    // (you said you’re OK with slow-mo jump too)
    const dt = dtRaw * timeScale;

    // effects timers
    if (slowmo.active) {
      slowmo.timer -= dtRaw; // countdown in real time
      if (slowmo.timer <= 0) {
        slowmo.active = false;
        timeScale = 1.0;
      }
    }

    if (protein.active) {
      protein.timer -= dtRaw;
      if (protein.timer <= 0) {
        protein.active = false;
        protein.immune = false;
      }
    }

    // speed ramp (use real time so game still ramps up even in slowmo)
    scrollMul = 1 + time * speedRamp;

    const scroll = baseScroll * scrollMul; // base speed
    const scrollStep = scroll * dt;        // affected by slow-mo

    score += dtRaw * 10 * scrollMul; // keep score based on real time * difficulty

    // animations
    if (player.onGround && player.slideState==="none") runT += dt;
    if (!player.onGround) jumpT += dt;

    updateSlide(dt);

    // physics (slow motion affects it because dt is scaled)
    const wasInAir = !player.onGround;

    player.vy += gravity * dt;
    player.y += player.vy * dt;

    if (player.y >= groundY) {
      player.y = groundY;
      player.vy = 0;
      player.onGround = true;

      if (wasInAir && player.slideState === "none" && (player.slideQueued || player.slideHeld)) {
        player.slideQueued = false;
        startSlideNow();
      }
    } else {
      player.onGround = false;
    }

    // trees move with world
    for (const t of trees) t.x -= scrollStep;
    const maxX = Math.max(...trees.map(t => t.x));
    for (const t of trees) if (t.x < -TREE_DRAW) t.x = maxX + rand(260, 420);

    // spawn timing scales with slow motion (so fewer things spawn in slowmo)
    spawnTimer -= dt;
    const every = Math.max(0.38, spawnBase / Math.sqrt(scrollMul));
    if (spawnTimer <= 0) {
      chooseSpawn();
      spawnTimer = every;
    }

    // move obstacles/items
    for (const o of obs) {
      if (o.kicked) {
        // kicked objects fly right/up then fall
        o.x += (o.vx || 900) * dt;
        o.y += (o.vy || -200) * dt;
        o.vy = (o.vy || -200) + 1200 * dt;
        o.rot = (o.rot || 0) + (o.spin || 6) * dt;
        continue;
      }

      if (o.type === "ground") o.x -= scrollStep;

      if (o.type === "bat") {
        o.x -= (scroll * 1.20) * dt;
        o.animT += dt;
        o.wiggleT += dt * 6.5;
        o.y += Math.sin(o.wiggleT) * 10 * dt;
      }

      if (o.type === "fall") {
        o.x -= scrollStep;
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
        o.x -= (scroll * DOG_SPEED) * dt;
        o.animT += dt;
        o.y = groundY + DOG_Y_OFFSET;
      }

      if (o.type === "drink_protein" || o.type === "drink_pina") {
        o.x -= scrollStep;
      }
    }

    // popups
    for (let i = popups.length - 1; i >= 0; i--) {
      popups[i].t += dtRaw;
      if (popups[i].t > 1.2) popups.splice(i, 1);
    }

    // bubble particles
    if (slowmo.active) {
      // spawn a few bubbles near head
      if (Math.random() < 0.45) {
        bubbles.push({
          x: player.x + 6 + rand(-6, 10),
          y: (player.y - JARED_DRAW + 12) + rand(-6, 6),
          vx: rand(-10, 10),
          vy: rand(-40, -70),
          t: 0,
          life: rand(0.6, 1.2)
        });
      }
    }
    for (let i = bubbles.length - 1; i >= 0; i--) {
      const b = bubbles[i];
      b.t += dt;
      b.x += b.vx * dt;
      b.y += b.vy * dt;
      b.vy += 30 * dt;
      if (b.t > b.life) bubbles.splice(i, 1);
    }

    // cleanup
    for (let i = obs.length - 1; i >= 0; i--) {
      if (obs[i].x < -240 || obs[i].x > W + 1200 || obs[i].y > H + 400) obs.splice(i, 1);
    }

    // collisions (obstacles vs items)
    const hit = hitObstacleOrPickup();
    if (hit) {
      if (hit.kind === "drink") {
        // pickup
        const idx = obs.indexOf(hit.obj);
        if (idx >= 0) obs.splice(idx, 1);

        if (inventory.length < INVENTORY_MAX) {
          inventory.push(hit.obj.type === "drink_protein" ? "protein" : "pina");
          addPopup(hit.obj.type === "drink_protein" ? "GOT PROTEIN!" : "GOT PINA!");
        } else {
          addPopup("INVENTORY FULL!");
        }
      } else {
        // obstacle collision
        if (protein.immune) {
          kickObstacle(hit.obj);
          addPopup("SMASH!");
          score += 25; // little bonus
        } else {
          running = false;
          gameOver = true;
          statusEl.textContent = "Game over – press R";
          handleGameOver();
        }
      }
    }

    scoreEl.textContent = Math.floor(score);
    speedEl.textContent = (scrollMul).toFixed(1) + "x";
    tauntEl.textContent = achievementForScore(Math.floor(score));
  }

  // -------------------------
  // Drawing
  // -------------------------
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

    // Wave pixels
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
    for (let x = 0; x < W; x += 40) ctx.fillRect(x + 10, ROAD_TOP + ROAD_H/2 - 1, 18, 2);

    // Grass
    ctx.fillStyle = "#2f9b57";
    ctx.fillRect(0, GRASS_TOP, W, H - GRASS_TOP);
  }

  function treeDraw(x){
    const img = sprites.tree;
    const y = ROAD_TOP - TREE_DRAW + 4;
    ctx.imageSmoothingEnabled = false;
    if (img && img.complete && img.naturalWidth > 0) ctx.drawImage(img, x - TREE_DRAW/2, y, TREE_DRAW, TREE_DRAW);
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

    // draw Jared
    ctx.drawImage(img, player.x - 14, player.y - JARED_DRAW + 6, JARED_DRAW, JARED_DRAW);

    // sickly tint when slowmo active
    if (slowmo.active) {
      ctx.save();
      ctx.globalAlpha = 0.18;
      ctx.fillStyle = "#4cff7a";
      ctx.fillRect(player.x - 18, player.y - JARED_DRAW + 4, 44, 52);
      ctx.restore();
    }

    // protein glow when immune
    if (protein.immune) {
      ctx.save();
      ctx.globalAlpha = 0.22;
      ctx.fillStyle = "#ffd84a";
      ctx.beginPath();
      ctx.arc(player.x + 6, player.y - 34, 16, 0, Math.PI*2);
      ctx.fill();
      ctx.restore();
    }
  }

  function drawDog(o){
    const f = Math.floor((o.animT || 0) * DOG_FPS) % DOG_FRAMES;
    const img = sprites.dog[f];
    if (!img || !img.complete || img.naturalWidth === 0) return;

    if (o.kicked) {
      ctx.save();
      ctx.translate(o.x, o.y - 10);
      ctx.rotate(o.rot || 0);
      ctx.drawImage(img, -DOG_DRAW/2, -DOG_DRAW/2, DOG_DRAW, DOG_DRAW);
      ctx.restore();
      return;
    }

    ctx.drawImage(img, o.x - 14, o.y - DOG_DRAW + 6, DOG_DRAW, DOG_DRAW);
  }

  function drawGroundCoconut(o){
    const img = sprites.coconut;
    ctx.imageSmoothingEnabled = false;

    if (o.kicked) {
      ctx.save();
      ctx.translate(o.x, o.y);
      ctx.rotate(o.rot || 0);
      if (img && img.complete && img.naturalWidth > 0) ctx.drawImage(img, -16, -16, 32, 32);
      else { ctx.fillStyle="#6b3b1c"; ctx.fillRect(-12,-10,24,20); }
      ctx.restore();
      ctx.imageSmoothingEnabled = true;
      return;
    }

    if (img && img.complete && img.naturalWidth > 0) {
      const x = o.x - 2;
      const y = o.y - (COCONUT_GROUND_DRAW - o.h);
      ctx.drawImage(img, x, y, COCONUT_GROUND_DRAW, COCONUT_GROUND_DRAW);
    } else {
      ctx.fillStyle = "#6b3b1c";
      ctx.fillRect(o.x, o.y, o.w, o.h);
    }
    ctx.imageSmoothingEnabled = true;
  }

  function drawFallingCoconut(o){
    const img = sprites.coconut;
    ctx.imageSmoothingEnabled = false;

    if (o.kicked) {
      ctx.save();
      ctx.translate(o.x, o.y);
      ctx.rotate(o.rot || 0);
      if (img && img.complete && img.naturalWidth > 0) ctx.drawImage(img, -14, -14, 28, 28);
      else { ctx.fillStyle="#6b3b1c"; ctx.beginPath(); ctx.arc(0,0,12,0,Math.PI*2); ctx.fill(); }
      ctx.restore();
      ctx.imageSmoothingEnabled = true;
      return;
    }

    if (img && img.complete && img.naturalWidth > 0) {
      ctx.drawImage(img, o.x - COCONUT_FALL_DRAW/2, o.y - COCONUT_FALL_DRAW/2, COCONUT_FALL_DRAW, COCONUT_FALL_DRAW);
    } else {
      ctx.fillStyle="#6b3b1c";
      ctx.beginPath();
      ctx.arc(o.x, o.y, o.r, 0, Math.PI*2);
      ctx.fill();
    }
    ctx.imageSmoothingEnabled = true;
  }

  function drawBat(o){
    const img = sprites.bat[Math.floor((o.animT || 0) * BAT_FPS) % BAT_FRAMES];
    if (!img || !img.complete || img.naturalWidth === 0) {
      ctx.fillStyle = "#222";
      ctx.fillRect(o.x, o.y - o.hitH, o.hitW, o.hitH);
      return;
    }

    ctx.imageSmoothingEnabled = false;

    if (o.kicked) {
      ctx.save();
      ctx.translate(o.x, o.y);
      ctx.rotate(o.rot || 0);
      ctx.drawImage(img, -BAT_DRAW/2, -BAT_DRAW/2, BAT_DRAW, BAT_DRAW);
      ctx.restore();
      ctx.imageSmoothingEnabled = true;
      return;
    }

    const dx = o.x - (BAT_DRAW - o.hitW)/2;
    const dy = (o.y - o.hitH) - (BAT_DRAW - o.hitH)/2;
    ctx.drawImage(img, dx, dy, BAT_DRAW, BAT_DRAW);
    ctx.imageSmoothingEnabled = true;
  }

  function drawDrink(o){
    const img = (o.type === "drink_protein") ? sprites.protein : sprites.pina;
    ctx.imageSmoothingEnabled = false;

    const x = o.x - 4;
    const y = o.y - (ITEM_DRAW - o.h) - 6;

    if (img && img.complete && img.naturalWidth > 0) {
      ctx.drawImage(img, x, y, ITEM_DRAW, ITEM_DRAW);
    } else {
      ctx.fillStyle = (o.type === "drink_protein") ? "#ffd84a" : "#ff7ad9";
      ctx.fillRect(x+8, y+6, 16, 20);
    }
    ctx.imageSmoothingEnabled = true;
  }

  function drawPopups(){
    for (const p of popups) {
      const t = p.t; // real-time seconds
      const alpha = Math.max(0, 1 - t / 1.2);
      const scale = 1 + Math.sin(Math.min(1, t) * Math.PI) * 0.12;

      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.translate(p.x, p.y);
      ctx.scale(scale, scale);

      ctx.font = "bold 28px sans-serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";

      // outline
      ctx.lineWidth = 6;
      ctx.strokeStyle = "rgba(0,0,0,0.65)";
      ctx.strokeText(p.text, 0, 0);

      // fill
      ctx.fillStyle = "#ffffff";
      ctx.fillText(p.text, 0, 0);

      ctx.restore();
    }
  }

  function drawBubbles(){
    if (!slowmo.active) return;
    ctx.save();
    ctx.globalAlpha = 0.55;
    ctx.imageSmoothingEnabled = false;
    for (const b of bubbles) {
      const r = 2 + (b.t / b.life) * 2;
      ctx.strokeStyle = "rgba(220,255,255,0.85)";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.arc(b.x, b.y, r, 0, Math.PI*2);
      ctx.stroke();
    }
    ctx.restore();
  }

  function drawInventory(){
    // bottom-left inside canvas
    const pad = 10;
    const y = H - 18;
    ctx.save();
    ctx.font = "bold 12px sans-serif";
    ctx.textAlign = "left";
    ctx.textBaseline = "middle";
    ctx.fillStyle = "rgba(0,0,0,0.35)";
    ctx.fillRect(8, H - 44, 260, 36);
    ctx.fillStyle = "#fff";
    ctx.fillText("Inventory (FIFO):", pad + 4, H - 30);

    // icons
    let x = pad + 110;
    for (let i = 0; i < INVENTORY_MAX; i++) {
      ctx.fillStyle = "rgba(255,255,255,0.10)";
      ctx.fillRect(x, H - 40, 26, 26);

      const item = inventory[i];
      if (item) {
        const img = item === "protein" ? sprites.protein : sprites.pina;
        if (img && img.complete && img.naturalWidth > 0) {
          ctx.imageSmoothingEnabled = false;
          ctx.drawImage(img, x - 3, H - 43, 32, 32);
          ctx.imageSmoothingEnabled = true;
        } else {
          ctx.fillStyle = item === "protein" ? "#ffd84a" : "#ff7ad9";
          ctx.fillRect(x + 8, H - 34, 10, 14);
        }
      }
      x += 32;
    }

    // effect indicators
    ctx.fillStyle = "#fff";
    const flags = [];
    if (protein.immune) flags.push("PROTEIN ON");
    if (slowmo.active) flags.push("PINA ON");
    if (flags.length) ctx.fillText(flags.join(" • "), pad + 4, y);

    ctx.restore();
  }

  function draw(){
    ctx.clearRect(0,0,W,H);
    drawBackground();

    for (const t of trees) treeDraw(t.x);

    drawPlayer();
    drawBubbles();

    for (const o of obs) {
      if (o.type==="ground") drawGroundCoconut(o);
      else if (o.type==="fall") drawFallingCoconut(o);
      else if (o.type==="dog") drawDog(o);
      else if (o.type==="bat") drawBat(o);
      else if (o.type==="drink_protein" || o.type==="drink_pina") drawDrink(o);
    }

    drawPopups();
    drawInventory();

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

    inventory.length = 0;
    popups.length = 0;
    bubbles.length = 0;

    protein.active=false; protein.timer=0; protein.immune=false;
    slowmo.active=false; slowmo.timer=0;
    timeScale = 1.0;

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

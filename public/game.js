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

  function overlayOpen() {
    return overlayEl?.classList.contains("show");
  }

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
  const DRINK_SPAWN_CHANCE = 0.10;

  // Inventory
  const INVENTORY_MAX = 3;

  // Effects
  let timeScale = 1.0;
  const SLOWMO_SCALE = 0.65;
  const SLOWMO_DURATION = 6.0;

  const protein = { active:false, timer:0, immune:false };
  const slowmo  = { active:false, timer:0 };

  // Popups
  const popups = []; // {text, t, x, y}

  // Bubbles particles for pina
  const bubbles = []; // {x,y,vx,vy,t,life}

  // -------------------------
  // Fix for non-transparent pina PNG (color-key near-white)
  // -------------------------
  function makeColorKeyImage(img, threshold = 245) {
    const c = document.createElement("canvas");
    c.width = img.naturalWidth || img.width;
    c.height = img.naturalHeight || img.height;
    const ictx = c.getContext("2d", { willReadFrequently: true });
    ictx.drawImage(img, 0, 0);
    const data = ictx.getImageData(0, 0, c.width, c.height);
    const d = data.data;
    for (let i = 0; i < d.length; i += 4) {
      const r = d[i], g = d[i+1], b = d[i+2];
      // remove near-white pixels
      if (r >= threshold && g >= threshold && b >= threshold) d[i+3] = 0;
    }
    ictx.putImageData(data, 0, 0);
    const out = new Image();
    out.src = c.toDataURL("image/png");
    return out;
  }

  const sprites = {
    run:[], jump:[], slide:[], dog:[], bat:[],
    tree:null, coconut:null,
    protein:null, pina:null, pinaFixed:null,
    loaded:0,
    total: RUN_FRAMES + JUMP_FRAMES + SLIDE_FRAMES + DOG_FRAMES + BAT_FRAMES + 4,
    ready:false,
    firstError:null
  };

  function load(path, onLoadExtra){
    const i = new Image();
    i.onload = () => {
      try { onLoadExtra?.(i); } catch {}
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
  sprites.protein = load(PROTEIN_PATH);

  // pina: build a transparent-fixed version at load time
  sprites.pina = load(PINA_PATH, (img) => {
    sprites.pinaFixed = makeColorKeyImage(img, 245);
  });

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

  const inventory = []; // FIFO

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

  function addPopup(text){
    popups.push({ text, t:0, x: W/2, y: 92 });
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
      addPopup("Protein Shake!");
    } else if (item === "pina") {
      slowmo.active = true;
      slowmo.timer = SLOWMO_DURATION;
      timeScale = SLOWMO_SCALE;
      addPopup("Pina Colada!");
    }
  }

  function throwInventory(){
    start();
    if (gameOver) return;
    if (inventory.length === 0) return;
    inventory.shift();
    addPopup("YEET!");
  }

  // FIXED: do NOT preventDefault for everything when overlay is open.
  // Only block the game control keys so typing works.
  window.addEventListener("keydown", (e) => {
    if (overlayOpen()) {
      const block = ["Space", "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"];
      if (block.includes(e.code)) e.preventDefault();
      return;
    }

    if (e.code === "Space" || e.code === "ArrowUp") { e.preventDefault(); jump(); }
    if (e.code === "ArrowDown") { e.preventDefault(); beginSlide(); }

    if (e.code === "ArrowLeft")  { e.preventDefault(); useInventory(); }
    if (e.code === "ArrowRight") { e.preventDefault(); throwInventory(); }

    if (e.code === "KeyR") reset();
  });

  window.addEventListener("keyup", (e) => {
    if (overlayOpen()) return;
    if (e.code === "Space" || e.code === "ArrowUp") endJump();
    if (e.code === "ArrowDown") releaseSlide();
  });

  canvas.addEventListener("pointerdown", (e) => {
    if (overlayOpen()) return;
    if (e.button === 2) beginSlide();
    else jump();
  });

  canvas.addEventListener("pointerup", (e) => {
    if (overlayOpen()) return;
    if (e.button === 2) releaseSlide();
    if (e.button === 0) endJump();
  });

  canvas.addEventListener("contextmenu", (e) => e.preventDefault());

  // -------------------------
  // Spawning / movement / collision etc.
  // (same as your previous version – only changed texts + pina rendering)
  // -------------------------
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

  function spawnDrink(kind){
    obs.push({
      type: kind === "protein" ? "drink_protein" : "drink_pina",
      x: W + 60,
      y: groundY - COCONUT_GROUND_Y_OFFSET,
      w: 26,
      h: 22
    });
  }

  function chooseSpawn(){
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

      if (o.type==="ground" && overlap(pr, {x:o.x,y:o.y,w:o.w,h:o.h})) return { kind:"obstacle", obj:o };
      if (o.type==="bat" && overlap(pr, {x:o.x, y:o.y - o.hitH, w:o.hitW, h:o.hitH})) return { kind:"obstacle", obj:o };
      if (o.type==="fall" && overlap(pr, {x:o.x-o.r,y:o.y-o.r,w:o.r*2,h:o.r*2})) return { kind:"obstacle", obj:o };
      if (o.type==="dog" && overlap(pr, {x:o.x,y:o.y-o.hitH,w:o.hitW,h:o.hitH})) return { kind:"obstacle", obj:o };

      if ((o.type==="drink_protein" || o.type==="drink_pina") && overlap(pr, {x:o.x,y:o.y,w:o.w,h:o.h})) {
        return { kind:"drink", obj:o };
      }
    }
    return null;
  }

  function kickObstacle(o){
    o.kicked = true;
    o.vx = 1100;
    o.vy = -250 - Math.random()*200;
    o.spin = (Math.random() < 0.5 ? -1 : 1) * (5 + Math.random()*6);
    o.rot = 0;
  }

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
        player.slideFrame = (player.slideFrame === 2) ? 3 : 2;
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

  const popups = [];
  const bubbles = [];

  function update(dtRaw){
    time += dtRaw;
    const dt = dtRaw * timeScale;

    // effect timers in real time
    if (slowmo.active) {
      slowmo.timer -= dtRaw;
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

    scrollMul = 1 + time * speedRamp;
    const scroll = baseScroll * scrollMul;
    const scrollStep = scroll * dt;

    score += dtRaw * 10 * scrollMul;

    if (player.onGround && player.slideState==="none") runT += dt;
    if (!player.onGround) jumpT += dt;

    updateSlide(dt);

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

    for (const t of trees) t.x -= scrollStep;
    const maxX = Math.max(...trees.map(t => t.x));
    for (const t of trees) if (t.x < -TREE_DRAW) t.x = maxX + rand(260, 420);

    spawnTimer -= dt;
    const every = Math.max(0.38, spawnBase / Math.sqrt(scrollMul));
    if (spawnTimer <= 0) {
      chooseSpawn();
      spawnTimer = every;
    }

    for (const o of obs) {
      if (o.kicked) {
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

    for (let i = popups.length - 1; i >= 0; i--) {
      popups[i].t += dtRaw;
      if (popups[i].t > 1.2) popups.splice(i, 1);
    }

    // pickup / hit
    const hit = hitObstacleOrPickup();
    if (hit) {
      if (hit.kind === "drink") {
        const idx = obs.indexOf(hit.obj);
        if (idx >= 0) obs.splice(idx, 1);

        if (inventory.length < INVENTORY_MAX) {
          inventory.push(hit.obj.type === "drink_protein" ? "protein" : "pina");
          addPopup(hit.obj.type === "drink_protein" ? "Got Protein Shake!" : "Got Pina Colada!");
        } else {
          addPopup("Inventory Full!");
        }
      } else {
        if (protein.immune) {
          kickObstacle(hit.obj);
          addPopup("SMASH!");
          score += 25;
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

  function drawBackground(){
    const g = ctx.createLinearGradient(0,0,0,SKY_END);
    g.addColorStop(0,"#6ad4ff");
    g.addColorStop(1,"#e9f9ff");
    ctx.fillStyle = g;
    ctx.fillRect(0,0,W,SKY_END);

    ctx.fillStyle = "#1e8cc4";
    ctx.fillRect(0, SKY_END, W, OCEAN_END - SKY_END);

    ctx.fillStyle = "#f0d79a";
    ctx.fillRect(0, OCEAN_END, W, SAND_END - OCEAN_END);

    ctx.fillStyle = "#2b2b2b";
    ctx.fillRect(0, ROAD_TOP, W, ROAD_H);

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
    ctx.drawImage(img, player.x - 14, player.y - JARED_DRAW + 6, JARED_DRAW, JARED_DRAW);
  }

  function drawDrink(o){
    // Use the fixed (transparent) pina version if available
    const img = (o.type === "drink_protein") ? sprites.protein : (sprites.pinaFixed || sprites.pina);
    ctx.imageSmoothingEnabled = false;
    const x = o.x - 4;
    const y = o.y - (ITEM_DRAW - o.h) - 6;
    if (img && img.complete && img.naturalWidth > 0) ctx.drawImage(img, x, y, ITEM_DRAW, ITEM_DRAW);
    else {
      ctx.fillStyle = (o.type === "drink_protein") ? "#ffd84a" : "#ff7ad9";
      ctx.fillRect(x+8, y+6, 16, 20);
    }
    ctx.imageSmoothingEnabled = true;
  }

  function draw(){
    ctx.clearRect(0,0,W,H);
    drawBackground();
    for (const t of trees) treeDraw(t.x);
    drawPlayer();
    for (const o of obs) {
      if (o.type==="drink_protein" || o.type==="drink_pina") drawDrink(o);
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

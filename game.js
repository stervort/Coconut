(() => {
  const canvas = document.getElementById("c");
  const ctx = canvas.getContext("2d");
  const statusEl = document.getElementById("status");
  const scoreEl = document.getElementById("score");
  const speedEl = document.getElementById("speed");
  const tauntEl = document.getElementById("taunt");

  // --- Game constants
  const W = canvas.width, H = canvas.height;
  const groundY = 245;
  const gravity = 2200;

  // Jump: half height + variable (tap/hold)
  const jumpVel = 410;
  const jumpCut = 0.45;

  const baseScroll = 320;
  const speedRamp = 0.045;
  const spawnBase = 0.95;

  // --- PNG frame animation setup (your counts)
  const RUN_FRAMES = 8;   // run_0..run_7
  const JUMP_FRAMES = 9;  // jump_0..jump_8
  const RUN_FPS = 12;
  const JUMP_FPS = 14;

  const sprites = {
    run: [],
    jump: [],
    loaded: 0,
    total: RUN_FRAMES + JUMP_FRAMES,
    ready: false,
    firstError: null,
  };

  function setLoadingText() {
    if (sprites.ready) {
      statusEl.textContent = "Ready";
      return;
    }
    if (sprites.firstError) {
      statusEl.textContent = `Missing sprite: ${sprites.firstError}`;
      return;
    }
    statusEl.textContent = `Loading sprites… (${sprites.loaded}/${sprites.total})`;
  }

  function loadFrame(path) {
    const img = new Image();
    img.onload = () => {
      sprites.loaded++;
      if (sprites.loaded >= sprites.total) sprites.ready = true;
      setLoadingText();
    };
    img.onerror = () => {
      if (!sprites.firstError) sprites.firstError = path;
      setLoadingText();
      console.error("Failed to load sprite:", path);
    };
    img.src = path;
    return img;
  }

  for (let i = 0; i < RUN_FRAMES; i++) sprites.run.push(loadFrame(`assets/jared/run_${i}.png`));
  for (let i = 0; i < JUMP_FRAMES; i++) sprites.jump.push(loadFrame(`assets/jared/jump_${i}.png`));
  setLoadingText();

  // --- State
  let running = false;
  let gameOver = false;
  let tPrev = performance.now();
  let time = 0;
  let score = 0;
  let scrollMul = 1;

  // Player (collision box)
  const player = {
    x: 120,
    y: groundY,
    w: 28,
    h: 44,
    vy: 0,
    onGround: true,
    duck: false,
  };

  // Animation timers
  let runAnimT = 0;
  let jumpAnimT = 0;

  // Obstacles
  const obs = [];
  let spawnTimer = 0;

  // Decorative trees (still shapes)
  const trees = [{ x: 650 }, { x: 980 }, { x: 1310 }, { x: 1700 }];

  // --- Parallax bushes (NEW)
  // Two layers: mid (slower), foreground (faster, lush)
  const midBushes = [];
  const fgBushes = [];
  let midBushTimer = 0;
  let fgBushTimer = 0;

  // Bush settings
  const MID_FACTOR = 0.45; // parallax speed factor (slower)
  const FG_FACTOR = 1.15;  // foreground moves a bit faster than ground (feels close)
  const COVER_BUSH_CHANCE = 0.12; // chance ground coconut gets a cover bush

  function reset() {
    running = false;
    gameOver = false;
    time = 0;
    score = 0;
    scrollMul = 1;
    obs.length = 0;
    spawnTimer = 0;

    player.y = groundY;
    player.vy = 0;
    player.onGround = true;
    player.duck = false;

    runAnimT = 0;
    jumpAnimT = 0;

    trees[0].x = 650;
    trees[1].x = 980;
    trees[2].x = 1310;
    trees[3].x = 1700;

    // reset bushes
    midBushes.length = 0;
    fgBushes.length = 0;
    midBushTimer = 0;
    fgBushTimer = 0;

    // seed some bushes
    seedBushes();

    scoreEl.textContent = "0";
    speedEl.textContent = "1.0x";
    tauntEl.textContent = "Coconut apprentice";
    setLoadingText();
    draw();
  }

  function seedBushes() {
    // Mid bushes
    let x = 0;
    while (x < W + 300) {
      midBushes.push(makeBush(x + rand(0, 80), 0 /*type*/, false));
      x += rand(140, 260);
    }
    // Foreground bushes
    x = 0;
    while (x < W + 300) {
      fgBushes.push(makeBush(x + rand(0, 70), 1 /*type*/, false));
      x += rand(120, 220);
    }
  }

  // --- Input
  function startIfNeeded() {
    if (!sprites.ready) return;
    if (!running && !gameOver) {
      running = true;
      statusEl.textContent = "Go!";
    }
  }

  function jump() {
    startIfNeeded();
    if (gameOver || !sprites.ready) return;
    if (player.onGround) {
      player.vy = -jumpVel;
      player.onGround = false;
      jumpAnimT = 0;
    }
  }

  function endJumpEarly() {
    if (!player.onGround && player.vy < 0) player.vy *= jumpCut;
  }

  function setDuck(v) {
    startIfNeeded();
    if (gameOver || !sprites.ready) return;
    player.duck = v;
  }

  window.addEventListener("keydown", (e) => {
    if (e.code === "Space" || e.code === "ArrowUp") {
      e.preventDefault();
      jump();
    } else if (e.code === "ArrowDown") {
      e.preventDefault();
      setDuck(true);
    } else if (e.code === "KeyR") {
      reset();
    }
  });

  window.addEventListener("keyup", (e) => {
    if (e.code === "ArrowDown") setDuck(false);
    if (e.code === "Space" || e.code === "ArrowUp") endJumpEarly();
  });

  canvas.addEventListener("pointerdown", () => jump());
  canvas.addEventListener("pointerup", endJumpEarly);
  canvas.addEventListener("pointercancel", endJumpEarly);
  canvas.addEventListener("pointerleave", endJumpEarly);

  // --- Helpers
  function rand(min, max) { return Math.random() * (max - min) + min; }

  function spawnGroundCoco() {
    const o = {
      type: "groundCoco",
      x: W + 40,
      y: groundY + 8,
      r: 14,
      hitW: 26, hitH: 22
    };
    obs.push(o);

    // Sometimes spawn a lush foreground bush that partially covers it
    if (Math.random() < COVER_BUSH_CHANCE) {
      fgBushes.push(makeCoverBushForCoconut(o));
    }
  }

  function spawnBat() {
    const y = rand(140, 210);
    obs.push({
      type: "bat",
      x: W + 60,
      y,
      w: 26, h: 14, // tweakable hitbox
      flap: 0
    });
  }

  function spawnFallCoco(treeX) {
    obs.push({
      type: "fallCoco",
      x: treeX,
      y: 70,
      r: 12,
      vy: rand(420, 700)
    });
  }

  function chooseSpawn() {
    const pFall = Math.min(0.65, 0.25 + (scrollMul - 1) * 0.18);
    const pBat  = Math.min(0.45, 0.12 + (scrollMul - 1) * 0.12);
    const roll = Math.random();

    if (roll < pBat) {
      spawnBat();
    } else if (roll < pBat + pFall) {
      const tree = trees.find(tr => tr.x > player.x + 200) || trees[0];
      spawnFallCoco(tree.x);
    } else {
      spawnGroundCoco();
    }

    if (scrollMul > 2.1 && Math.random() < 0.18) spawnGroundCoco();
  }

  function rectsOverlap(ax, ay, aw, ah, bx, by, bw, bh) {
    return ax < bx + bw && ax + aw > bx && ay < by + bh && ay + ah > by;
  }

  function playerRect() {
    const duckH = player.duck ? 26 : player.h;
    return { x: player.x, y: player.y - duckH, w: player.w, h: duckH };
  }

  function checkCollisions() {
    const pr = playerRect();
    for (const o of obs) {
      if (o.type === "groundCoco") {
        const bx = o.x - o.hitW / 2, by = o.y - o.hitH / 2;
        if (rectsOverlap(pr.x, pr.y, pr.w, pr.h, bx, by, o.hitW, o.hitH)) return true;
      } else if (o.type === "bat") {
        const bx = o.x, by = o.y - o.h;
        if (rectsOverlap(pr.x, pr.y, pr.w, pr.h, bx, by, o.w, o.h)) return true;
      } else if (o.type === "fallCoco") {
        const bx = o.x - o.r, by = o.y - o.r;
        if (rectsOverlap(pr.x, pr.y, pr.w, pr.h, bx, by, o.r * 2, o.r * 2)) return true;
      }
    }
    return false;
  }

  // --- Bush generation (NEW)
  // type: 0 = mid, 1 = foreground
  function makeBush(x, type, isCover) {
    const baseY = type === 0 ? 210 : 232;
    const w = type === 0 ? rand(90, 170) : rand(110, 210);
    const h = type === 0 ? rand(26, 44) : rand(38, 70);
    const puffCount = Math.floor(type === 0 ? rand(4, 7) : rand(6, 10));
    const puffs = [];

    for (let i = 0; i < puffCount; i++) {
      puffs.push({
        ox: rand(-w * 0.45, w * 0.45),
        oy: rand(-h * 0.45, h * 0.10),
        rx: rand(w * 0.10, w * 0.22),
        ry: rand(h * 0.35, h * 0.70),
      });
    }

    return {
      kind: "bush",
      layer: type,
      x,
      y: baseY,
      w,
      h,
      puffs,
      isCover: !!isCover,
      // subtle sway
      swaySeed: rand(0, Math.PI * 2)
    };
  }

  function makeCoverBushForCoconut(coco) {
    // Place a foreground bush slightly in front of the coconut
    // so it hides the lower half/side.
    const b = makeBush(coco.x + rand(-18, 14), 1, true);
    b.y = 235;                // slightly lower so it overlaps the coconut
    b.w = rand(120, 190);
    b.h = rand(46, 78);
    return b;
  }

  function moveBushLayer(arr, dt, scroll, factor) {
    for (const b of arr) b.x -= scroll * factor * dt;

    // remove offscreen
    for (let i = arr.length - 1; i >= 0; i--) {
      if (arr[i].x < -400) arr.splice(i, 1);
    }
  }

  // --- Update
  function update(dt) {
    time += dt;

    scrollMul = 1 + time * speedRamp;
    const scroll = baseScroll * scrollMul;

    score += dt * (10 * scrollMul);
    const s = Math.floor(score);
    scoreEl.textContent = s.toString();
    speedEl.textContent = `${scrollMul.toFixed(1)}x`;

    let taunt = "Coconut apprentice";
    if (s >= 200)  taunt = "Tree trainee 🌴";
    if (s >= 500)  taunt = "Coconut dodger 🥥";
    if (s >= 900)  taunt = "Bat dodger 🦇";
    if (s >= 1300) taunt = "Samoa sprint legend ⚡";
    if (s >= 1800) taunt = "Jared, destroyer of coconuts 👑";
    tauntEl.textContent = taunt;

    // Anim timers
    if (player.onGround) runAnimT += dt;
    else jumpAnimT += dt;

    // player physics
    player.vy += gravity * dt;
    player.y += player.vy * dt;
    if (player.y >= groundY) {
      player.y = groundY;
      player.vy = 0;
      player.onGround = true;
    } else {
      player.onGround = false;
    }

    // move trees
    for (const tr of trees) tr.x -= scroll * dt;

    // recycle trees
    const maxTreeX = Math.max(...trees.map(t => t.x));
    for (const tr of trees) {
      if (tr.x < -40) tr.x = maxTreeX + rand(240, 420);
    }

    // spawn bushes periodically
    midBushTimer -= dt;
    fgBushTimer -= dt;

// Mid bushes (very occasional)
if (midBushTimer <= 0) {
  midBushes.push(makeBush(W + rand(80, 160), 0, false));
  midBushTimer = rand(4.5, 7.5);
}

// Foreground bushes (one or two once in a while)
if (fgBushTimer <= 0) {
  const count = Math.random() < 0.35 ? 2 : 1;

  for (let i = 0; i < count; i++) {
    fgBushes.push(
      makeBush(W + rand(80, 160) + i * rand(50, 90), 1, false)
    );
  }

  fgBushTimer = rand(3.5, 6.5);
}

    // move bush layers with parallax
    moveBushLayer(midBushes, dt, scroll, MID_FACTOR);
    moveBushLayer(fgBushes, dt, scroll, FG_FACTOR);

    // spawn obstacles
    spawnTimer -= dt;
    const spawnEvery = Math.max(0.38, spawnBase / Math.sqrt(scrollMul));
    if (spawnTimer <= 0) {
      chooseSpawn();
      spawnTimer = spawnEvery * rand(0.65, 1.1);
    }

    // update obstacles
    for (const o of obs) {
      if (o.type === "groundCoco") {
        o.x -= scroll * dt;
      } else if (o.type === "bat") {
        o.x -= (scroll * 1.15) * dt;
        o.flap += dt * 10;
        o.y += Math.sin(o.flap) * 10 * dt;
      } else if (o.type === "fallCoco") {
        o.x -= scroll * dt;
        o.y += o.vy * dt;
        if (o.y >= groundY + 6) {
          o.type = "groundCoco";
          o.y = groundY + 8;
          o.r = 14;
          o.hitW = 26; o.hitH = 22;
          delete o.vy;
        }
      }
    }

    // remove offscreen obstacles
    for (let i = obs.length - 1; i >= 0; i--) {
      if (obs[i].x < -120) obs.splice(i, 1);
    }

    // collision => game over
    if (checkCollisions()) {
      running = false;
      gameOver = true;
      statusEl.textContent = `Game Over • Score ${s} • Press R`;
    }
  }

  // --- Drawing helpers
  function drawTreeShape(x) {
    ctx.fillStyle = "rgba(90,60,30,.7)";
    ctx.fillRect(x - 6, 90, 12, 170);

    ctx.fillStyle = "rgba(20,120,60,.7)";
    ctx.beginPath();
    ctx.ellipse(x, 85, 45, 28, 0, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = "rgba(120,70,35,.7)";
    for (let i = 0; i < 3; i++) {
      ctx.beginPath();
      ctx.arc(x + (i - 1) * 10, 85 + (i % 2) * 8, 6, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  function getRunFrameIndex() {
    return Math.floor(runAnimT * RUN_FPS) % RUN_FRAMES;
  }

  function getJumpFrameIndex() {
    const idx = Math.floor(jumpAnimT * JUMP_FPS);
    return Math.min(idx, JUMP_FRAMES - 1);
  }

  function drawPlayerSprite() {
    const drawW = 64;
    const drawH = 64;
    const x = player.x - 14;
    const y = player.y - drawH + 6;

    const img = player.onGround
      ? sprites.run[getRunFrameIndex()]
      : sprites.jump[getJumpFrameIndex()];

    if (img && img.complete && img.naturalWidth > 0) {
      ctx.drawImage(img, x, y, drawW, drawH);
    } else {
      const pr = playerRect();
      ctx.fillStyle = "rgba(240,240,255,.92)";
      ctx.fillRect(pr.x, pr.y, pr.w, pr.h);
    }
  }

  function drawBush(b) {
    // lush greens (no hard-coded styles; just fills)
    const t = time;
    const sway = Math.sin(t * 1.6 + b.swaySeed) * (b.layer === 1 ? 2.2 : 1.2);

    // Base shadow/underlayer for depth
    ctx.fillStyle = b.layer === 1 ? "rgba(10,80,30,.55)" : "rgba(10,95,35,.35)";
    ctx.beginPath();
    ctx.ellipse(b.x + sway, b.y + 8, b.w * 0.55, b.h * 0.40, 0, 0, Math.PI * 2);
    ctx.fill();

    // Main puffs
    ctx.fillStyle = b.layer === 1 ? "rgba(30,160,70,.92)" : "rgba(40,170,80,.55)";
    for (const p of b.puffs) {
      ctx.beginPath();
      ctx.ellipse(
        b.x + p.ox + sway,
        b.y + p.oy,
        p.rx,
        p.ry,
        0,
        0,
        Math.PI * 2
      );
      ctx.fill();
    }

    // Highlights
    ctx.fillStyle = b.layer === 1 ? "rgba(120,255,170,.22)" : "rgba(160,255,190,.12)";
    ctx.beginPath();
    ctx.ellipse(b.x - b.w * 0.12 + sway, b.y - b.h * 0.20, b.w * 0.20, b.h * 0.22, 0, 0, Math.PI * 2);
    ctx.fill();

    // Foreground extra blades for “lush”
    if (b.layer === 1) {
      ctx.fillStyle = "rgba(20,120,55,.75)";
      for (let i = 0; i < 10; i++) {
        const bx = b.x - b.w * 0.35 + i * (b.w * 0.07) + sway;
        const by = b.y + 10;
        ctx.beginPath();
        ctx.moveTo(bx, by);
        ctx.lineTo(bx + rand(-4, 4), by - rand(12, 26));
        ctx.lineTo(bx + rand(-2, 6), by);
        ctx.closePath();
        ctx.fill();
      }
    }
  }

  // --- Draw
  function draw() {
    ctx.clearRect(0, 0, W, H);

    // Ocean strip (background)
    ctx.fillStyle = "rgba(20,90,140,.35)";
    ctx.fillRect(0, 205, W, 40);

    // Midground bushes (parallax)
    for (const b of midBushes) drawBush(b);

    // Ground
    ctx.fillStyle = "rgba(90,60,20,.25)";
    ctx.fillRect(0, groundY + 12, W, H - (groundY + 12));

    // Trees
    for (const tr of trees) drawTreeShape(tr.x);

    // Banner
    ctx.fillStyle = "rgba(0,0,0,.28)";
    ctx.fillRect(14, 12, 190, 28);
    ctx.fillStyle = "rgba(255,255,255,.92)";
    ctx.font = "14px system-ui";
    ctx.fillText("Jared vs Coconut", 26, 31);

    // Player
    drawPlayerSprite();

    // Obstacles (draw BEFORE foreground bushes so bushes can hide coconuts)
    for (const o of obs) {
      if (o.type === "groundCoco") {
        ctx.fillStyle = "rgba(110,65,30,.95)";
        ctx.beginPath();
        ctx.ellipse(o.x, o.y, o.r, o.r * 0.8, 0, 0, Math.PI * 2);
        ctx.fill();

        ctx.fillStyle = "rgba(255,255,255,.12)";
        ctx.beginPath();
        ctx.ellipse(o.x - 4, o.y - 3, 5, 4, 0, 0, Math.PI * 2);
        ctx.fill();
      } else if (o.type === "bat") {
        ctx.fillStyle = "rgba(20,20,30,.95)";
        ctx.fillRect(o.x, o.y - 10, 10, 10);
        ctx.beginPath();
        ctx.moveTo(o.x, o.y - 5);
        ctx.lineTo(o.x - 16, o.y - 14);
        ctx.lineTo(o.x - 8, o.y - 2);
        ctx.closePath();
        ctx.fill();
        ctx.beginPath();
        ctx.moveTo(o.x + 10, o.y - 5);
        ctx.lineTo(o.x + 26, o.y - 14);
        ctx.lineTo(o.x + 18, o.y - 2);
        ctx.closePath();
        ctx.fill();
      } else if (o.type === "fallCoco") {
        ctx.fillStyle = "rgba(110,65,30,.95)";
        ctx.beginPath();
        ctx.arc(o.x, o.y, o.r, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    // Foreground bushes (parallax + occlusion)
    for (const b of fgBushes) drawBush(b);

    // overlays
    if (!sprites.ready) {
      ctx.fillStyle = "rgba(0,0,0,.35)";
      ctx.fillRect(0, 0, W, H);
      ctx.fillStyle = "rgba(255,255,255,.92)";
      ctx.font = "18px system-ui";
      ctx.fillText("Loading PNG frames…", 345, 150);
      ctx.font = "12px system-ui";
      ctx.fillText("Expected: assets/jared/run_0.png and jump_0.png", 265, 172);
      if (sprites.firstError) ctx.fillText(`Missing: ${sprites.firstError}`, 265, 190);
    } else if (!running && !gameOver) {
      ctx.fillStyle = "rgba(0,0,0,.35)";
      ctx.fillRect(0, 0, W, H);
      ctx.fillStyle = "rgba(255,255,255,.92)";
      ctx.font = "22px system-ui";
      ctx.fillText("Jared vs Coconut", 360, 130);
      ctx.font = "14px system-ui";
      ctx.fillText("Press Space / ↑ / click to start and jump.", 310, 160);
      ctx.font = "12px system-ui";
      ctx.fillText("Tip: tap for short hop, hold for higher jump.", 330, 180);
    } else if (gameOver) {
      ctx.fillStyle = "rgba(0,0,0,.25)";
      ctx.fillRect(0, 0, W, H);
      ctx.fillStyle = "rgba(255,255,255,.92)";
      ctx.font = "22px system-ui";
      ctx.fillText("Game Over", 390, 140);
      ctx.font = "14px system-ui";
      ctx.fillText("Press R to restart", 395, 168);
    }
  }

  // --- Main loop
  function loop(now) {
    const dt = Math.min(0.033, (now - tPrev) / 1000);
    tPrev = now;

    if (running && !gameOver && sprites.ready) update(dt);
    draw();
    requestAnimationFrame(loop);
  }

  reset();
  requestAnimationFrame(loop);
})();

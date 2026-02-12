(() => {
  const canvas = document.getElementById("c");
  const ctx = canvas.getContext("2d");
  const statusEl = document.getElementById("status");
  const scoreEl = document.getElementById("score");
  const speedEl = document.getElementById("speed");
  const tauntEl = document.getElementById("taunt");

  const W = canvas.width;
  const H = canvas.height;

  // --- Scene layout
  const roadY = 245;              // "feet line"
  const ROAD_H = 22;
  const GRASS_TOP = roadY + ROAD_H;

  // --- Physics
  const gravity = 2200;

  // variable jump (tap/hold)
  const jumpVel = 410;
  const jumpCut = 0.45;

  // --- Speed
  const baseScroll = 320;
  const speedRamp = 0.045;
  const spawnBase = 0.95;

  // --- Jared sprite frames
  const RUN_FRAMES = 8;
  const JUMP_FRAMES = 9;
  const RUN_FPS = 12;
  const JUMP_FPS = 14;

  // --- Dog frames
  const DOG_FRAMES = 6;           // dog_0..dog_5.png
  const DOG_FPS = 10;
  const DOG_SPEED_FACTOR = 1.12;  // slightly faster than the world scroll

  // --- Drawing sizes
  const JARED_DRAW = 64;
  const DOG_DRAW = 56;

  // --- Coconut tree sprite (NEW)
  // If your file is not .png, change the extension here.
  const TREE_PATH = "assets/shrubbery/coconut_tree_1.png";
  const TREE_DRAW = 220;          // how big it appears on canvas
  const TREE_BOTTOM_PAD = 6;      // tweak if it floats/sinks

  const groundY = roadY;          // physics ground line

  // --- Assets
  const sprites = {
    run: [],
    jump: [],
    dog: [],
    tree: null,
    loaded: 0,
    total: RUN_FRAMES + JUMP_FRAMES + DOG_FRAMES + 1, // +1 for the tree sprite
    ready: false,
    firstError: null
  };

  function setLoadingText() {
    if (sprites.ready) { statusEl.textContent = "Ready"; return; }
    if (sprites.firstError) { statusEl.textContent = `Missing sprite: ${sprites.firstError}`; return; }
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
      console.error("Missing sprite:", path);
    };
    img.src = path;
    return img;
  }

  // Load Jared
  for (let i = 0; i < RUN_FRAMES; i++) sprites.run.push(loadFrame(`assets/jared/run_${i}.png`));
  for (let i = 0; i < JUMP_FRAMES; i++) sprites.jump.push(loadFrame(`assets/jared/jump_${i}.png`));

  // Load dog
  for (let i = 0; i < DOG_FRAMES; i++) sprites.dog.push(loadFrame(`assets/dog/dog_${i}.png`));

  // Load tree
  sprites.tree = loadFrame(TREE_PATH);

  setLoadingText();

  // --- State
  let running = false;
  let gameOver = false;

  let tPrev = performance.now();
  let time = 0;
  let score = 0;
  let scrollMul = 1;

  const player = {
    x: 120,
    y: groundY,
    w: 28,
    h: 44,
    vy: 0,
    onGround: true,
    duck: false
  };

  let runAnimT = 0;
  let jumpAnimT = 0;

  const obs = [];
  let spawnTimer = 0;

  // Tree "slots" in the scene (they scroll)
  const trees = [
    { x: 650 },
    { x: 980 },
    { x: 1310 },
    { x: 1700 }
  ];

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

    scoreEl.textContent = "0";
    speedEl.textContent = "1.0x";
    tauntEl.textContent = "Coconut apprentice";

    setLoadingText();
    draw();
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

  window.addEventListener("keydown", e => {
    if (e.code === "Space" || e.code === "ArrowUp") { e.preventDefault(); jump(); }
    else if (e.code === "ArrowDown") { e.preventDefault(); setDuck(true); }
    else if (e.code === "KeyR") reset();
  });

  window.addEventListener("keyup", e => {
    if (e.code === "ArrowDown") setDuck(false);
    if (e.code === "Space" || e.code === "ArrowUp") endJumpEarly();
  });

  canvas.addEventListener("pointerdown", jump);
  canvas.addEventListener("pointerup", endJumpEarly);
  canvas.addEventListener("pointercancel", endJumpEarly);
  canvas.addEventListener("pointerleave", endJumpEarly);

  // --- Helpers
  function rand(min, max) { return Math.random() * (max - min) + min; }

  function spawnGroundCoco() {
    obs.push({
      type: "groundCoco",
      x: W + 40,
      y: groundY + 8,
      r: 14,
      hitW: 26,
      hitH: 22
    });
  }

  function spawnBat() {
    const y = rand(140, 210);
    obs.push({
      type: "bat",
      x: W + 60,
      y,
      w: 26,
      h: 14,
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

  function spawnDog() {
    obs.push({
      type: "dog",
      x: W + 90,
      y: groundY,     // pinned to ground
      hitW: 34,
      hitH: 20,
      animT: 0
    });
  }

  function chooseSpawn() {
    const pFall = Math.min(0.65, 0.25 + (scrollMul - 1) * 0.18);
    const pBat  = Math.min(0.45, 0.12 + (scrollMul - 1) * 0.12);
    const pDog  = Math.min(0.35, 0.10 + (scrollMul - 1) * 0.10);

    const roll = Math.random();

    if (roll < pDog) spawnDog();
    else if (roll < pDog + pBat) spawnBat();
    else if (roll < pDog + pBat + pFall) {
      const tree = trees.find(tr => tr.x > player.x + 200) || trees[0];
      spawnFallCoco(tree.x);
    } else spawnGroundCoco();

    if (scrollMul > 2.1 && Math.random() < 0.12) {
      (Math.random() < 0.5) ? spawnGroundCoco() : spawnDog();
    }
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
        const bx = o.x - o.hitW / 2;
        const by = o.y - o.hitH / 2;
        if (rectsOverlap(pr.x, pr.y, pr.w, pr.h, bx, by, o.hitW, o.hitH)) return true;
      } else if (o.type === "bat") {
        const bx = o.x;
        const by = o.y - o.h;
        if (rectsOverlap(pr.x, pr.y, pr.w, pr.h, bx, by, o.w, o.h)) return true;
      } else if (o.type === "fallCoco") {
        const bx = o.x - o.r;
        const by = o.y - o.r;
        if (rectsOverlap(pr.x, pr.y, pr.w, pr.h, bx, by, o.r * 2, o.r * 2)) return true;
      } else if (o.type === "dog") {
        const bx = o.x;
        const by = o.y - o.hitH;
        if (rectsOverlap(pr.x, pr.y, pr.w, pr.h, bx, by, o.hitW, o.hitH)) return true;
      }
    }
    return false;
  }

  // --- Background drawing (sky + ocean + road + grass)
  function drawBackground() {
    // sky
    const g = ctx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0.00, "#67d4ff");
    g.addColorStop(0.55, "#c9f0ff");
    g.addColorStop(1.00, "#eaf7ff");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);

    // ocean
    const oceanTop = 150;
    const oceanBottom = 225;
    ctx.fillStyle = "rgba(20, 120, 170, 0.85)";
    ctx.fillRect(0, oceanTop, W, oceanBottom - oceanTop);

    // pixel-ish waves
    const oldSmooth = ctx.imageSmoothingEnabled;
    ctx.imageSmoothingEnabled = false;

    const tile = 8;
    const drift = Math.floor((time * 22) % tile);

    for (let row = 0; row < 3; row++) {
      const y = oceanTop + 18 + row * 18;
      for (let x = -tile; x < W + tile; x += tile) {
        const phase = ((x + drift) / tile) | 0;
        const bump = (phase % 4 === 0) ? 1 : 0;

        ctx.fillStyle = "rgba(10, 85, 135, 0.45)";
        ctx.fillRect(x + drift, y + bump, tile, 2);

        if (phase % 6 === 0) {
          ctx.fillStyle = "rgba(220, 255, 255, 0.45)";
          ctx.fillRect(x + drift + 2, y - 1 + bump, 3, 2);
        }
      }
    }

    const shoreY = oceanBottom - 6;
    for (let x = 0; x < W; x += 6) {
      const jitter = Math.sin((x * 0.08) + time * 3.5) > 0.2 ? 1 : 0;
      ctx.fillStyle = "rgba(235, 255, 255, 0.45)";
      ctx.fillRect(x, shoreY + jitter, 3, 2);
    }

    ctx.imageSmoothingEnabled = oldSmooth;

    // road (sand)
    ctx.fillStyle = "rgba(243, 210, 139, 0.95)";
    ctx.fillRect(0, roadY + 4, W, ROAD_H);

    // speckles on road
    ctx.fillStyle = "rgba(190, 160, 100, 0.25)";
    for (let x = 0; x < W; x += 38) {
      const yy = roadY + 8 + ((x / 38) % 2) * 4;
      ctx.fillRect(x, yy, 6, 2);
      ctx.fillRect(x + 12, yy + 6, 4, 2);
    }

    // grass
    ctx.fillStyle = "rgba(35, 145, 72, 0.90)";
    ctx.fillRect(0, GRASS_TOP, W, H - GRASS_TOP);

    ctx.fillStyle = "rgba(15, 110, 55, 0.35)";
    for (let x = 0; x < W; x += 90) {
      const wiggle = Math.sin((x * 0.05) + time * 0.8) * 6;
      ctx.fillRect(x, GRASS_TOP + 4 + wiggle, 50, 6);
    }
  }

  // --- NEW: tree sprite draw
  function drawTreeSprite(x) {
    const img = sprites.tree;

    // If your tree is pixel-art-ish and you want crisp scaling:
    const oldSmooth = ctx.imageSmoothingEnabled;
    ctx.imageSmoothingEnabled = false;

    if (img && img.complete && img.naturalWidth > 0) {
      const w = TREE_DRAW;
      const h = TREE_DRAW;
      const drawX = x - w * 0.5;
      const drawY = groundY - h + TREE_BOTTOM_PAD;
      ctx.drawImage(img, drawX, drawY, w, h);
    } else {
      // fallback if tree missing
      ctx.fillStyle = "rgba(0,0,0,.15)";
      ctx.fillRect(x - 10, 80, 20, 170);
    }

    ctx.imageSmoothingEnabled = oldSmooth;
  }

  function getRunFrameIndex() {
    return Math.floor(runAnimT * RUN_FPS) % RUN_FRAMES;
  }

  function getJumpFrameIndex() {
    const idx = Math.floor(jumpAnimT * JUMP_FPS);
    return Math.min(idx, JUMP_FRAMES - 1);
  }

  function getDogFrameIndex(animT) {
    return Math.floor(animT * DOG_FPS) % DOG_FRAMES;
  }

  function drawPlayerSprite() {
    const drawW = JARED_DRAW;
    const drawH = JARED_DRAW;

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

  function drawDog(o) {
    const drawW = DOG_DRAW;
    const drawH = DOG_DRAW;

    const x = o.x - 10;
    const y = groundY - drawH + 6;

    const img = sprites.dog[getDogFrameIndex(o.animT)] || null;
    if (img && img.complete && img.naturalWidth > 0) {
      ctx.drawImage(img, x, y, drawW, drawH);
    } else {
      ctx.fillStyle = "rgba(255, 200, 200, .7)";
      ctx.fillRect(o.x, o.y - o.hitH, o.hitW, o.hitH);
    }
  }

  function update(dt) {
    time += dt;

    scrollMul = 1 + time * speedRamp;
    const scroll = baseScroll * scrollMul;

    score += dt * (10 * scrollMul);
    const s = Math.floor(score);
    scoreEl.textContent = s;
    speedEl.textContent = `${scrollMul.toFixed(1)}x`;

    let taunt = "Coconut apprentice";
    if (s >= 200)  taunt = "Tree trainee 🌴";
    if (s >= 500)  taunt = "Coconut dodger 🥥";
    if (s >= 900)  taunt = "Bat dodger 🦇";
    if (s >= 1300) taunt = "Samoa sprint legend ⚡";
    if (s >= 1800) taunt = "Jared, destroyer of coconuts 👑";
    tauntEl.textContent = taunt;

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

    // trees scroll
    for (const tr of trees) tr.x -= scroll * dt;
    const maxTreeX = Math.max(...trees.map(t => t.x));
    for (const tr of trees) {
      if (tr.x < -TREE_DRAW * 0.6) tr.x = maxTreeX + rand(240, 420);
    }

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
          o.hitW = 26;
          o.hitH = 22;
          delete o.vy;
        }
      } else if (o.type === "dog") {
        o.x -= (scroll * DOG_SPEED_FACTOR) * dt;
        o.animT += dt;
        o.y = groundY;
      }
    }

    // remove offscreen obstacles
    for (let i = obs.length - 1; i >= 0; i--) {
      if (obs[i].x < -220) obs.splice(i, 1);
    }

    // collisions
    if (checkCollisions()) {
      running = false;
      gameOver = true;
      statusEl.textContent = `Game Over • Score ${s} • Press R`;
    }
  }

  function draw() {
    ctx.clearRect(0, 0, W, H);

    drawBackground();

    // trees behind action
    for (const tr of trees) drawTreeSprite(tr.x);

    // banner
    ctx.fillStyle = "rgba(0,0,0,.28)";
    ctx.fillRect(14, 12, 190, 28);
    ctx.fillStyle = "rgba(255,255,255,.92)";
    ctx.font = "14px system-ui";
    ctx.fillText("Jared vs Coconut", 26, 31);

    // Jared
    drawPlayerSprite();

    // obstacles
    for (const o of obs) {
      if (o.type === "groundCoco") {
        ctx.fillStyle = "rgba(110,65,30,.95)";
        ctx.beginPath();
        ctx.ellipse(o.x, o.y, o.r, o.r * 0.8, 0, 0, Math.PI * 2);
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
      } else if (o.type === "dog") {
        drawDog(o);
      }
    }

    // overlays
    if (!sprites.ready) {
      ctx.fillStyle = "rgba(0,0,0,.35)";
      ctx.fillRect(0, 0, W, H);
      ctx.fillStyle = "rgba(255,255,255,.92)";
      ctx.font = "18px system-ui";
      ctx.fillText("Loading PNG frames…", 345, 150);
      ctx.font = "12px system-ui";
      ctx.fillText("Check assets paths + extensions.", 360, 170);
    } else if (!running && !gameOver) {
      ctx.fillStyle = "rgba(0,0,0,.35)";
      ctx.fillRect(0, 0, W, H);
      ctx.fillStyle = "rgba(255,255,255,.92)";
      ctx.font = "22px system-ui";
      ctx.fillText("Jared vs Coconut", 360, 130);
      ctx.font = "14px system-ui";
      ctx.fillText("Press Space / ↑ / click to start and jump.", 310, 160);
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

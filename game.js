(() => {
  const canvas = document.getElementById("c");
  const ctx = canvas.getContext("2d");
  const statusEl = document.getElementById("status");
  const scoreEl = document.getElementById("score");
  const speedEl = document.getElementById("speed");

  // --- Game constants
  const W = canvas.width, H = canvas.height;
  const groundY = 245;          // ground baseline
  const gravity = 2200;         // px/s^2
  const jumpVel = 820;          // px/s
  const baseScroll = 320;       // px/s
  const speedRamp = 0.045;      // per second
  const spawnBase = 0.95;       // seconds (will shrink with speed)

  // --- State
  let running = false;
  let gameOver = false;
  let tPrev = performance.now();
  let time = 0;
  let score = 0;
  let scrollMul = 1;

  // Player
  const player = {
    x: 120, y: groundY, w: 28, h: 44,
    vy: 0,
    onGround: true,
    duck: false,
  };

  // Obstacles
  // types: "groundCoco", "bat", "fallCoco"
  const obs = [];
  let spawnTimer = 0;

  // Decorative trees (positions used for falling coconuts)
  const trees = [
    { x: 650 }, { x: 980 }, { x: 1310 }, { x: 1700 }
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

    // reset trees spread out
    trees[0].x = 650;
    trees[1].x = 980;
    trees[2].x = 1310;
    trees[3].x = 1700;

    statusEl.textContent = "Ready";
    scoreEl.textContent = "0";
    speedEl.textContent = "1.0x";
    draw();
  }

  // --- Input
  function startIfNeeded() {
    if (!running && !gameOver) {
      running = true;
      statusEl.textContent = "Go!";
    }
  }

  function jump() {
    startIfNeeded();
    if (gameOver) return;
    if (player.onGround) {
      player.vy = -jumpVel;
      player.onGround = false;
    }
  }

  function setDuck(v) {
    startIfNeeded();
    if (gameOver) return;
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
  });
  canvas.addEventListener("pointerdown", () => jump());

  // --- Spawning helpers
  function rand(min, max) { return Math.random() * (max - min) + min; }

  function spawnGroundCoco() {
    obs.push({
      type: "groundCoco",
      x: W + 40,
      y: groundY + 8,
      r: 14,
      hitW: 26, hitH: 22
    });
  }

  function spawnBat() {
    const y = rand(140, 210);
    obs.push({
      type: "bat",
      x: W + 60,
      y,
      w: 36, h: 18,
      flap: 0
    });
  }

  function spawnFallCoco(treeX) {
    obs.push({
      type: "fallCoco",
      x: treeX,
      y: 70,
      r: 12,
      vy: rand(420, 700),
      landed: false
    });
  }

  function chooseSpawn() {
    // As speed increases, add more air stuff.
    const p = Math.min(0.65, 0.25 + (scrollMul - 1) * 0.18);
    const q = Math.min(0.45, 0.12 + (scrollMul - 1) * 0.12);
    const roll = Math.random();

    if (roll < q) {
      spawnBat();
    } else if (roll < q + p) {
      // fall coconut from nearest upcoming tree
      const tree = trees.find(tr => tr.x > player.x + 200) || trees[0];
      spawnFallCoco(tree.x);
    } else {
      spawnGroundCoco();
    }

    // occasional combo at higher speed
    if (scrollMul > 2.1 && Math.random() < 0.18) spawnGroundCoco();
  }

  // --- Collision
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
        const bx = o.x - o.hitW/2, by = o.y - o.hitH/2;
        if (rectsOverlap(pr.x, pr.y, pr.w, pr.h, bx, by, o.hitW, o.hitH)) return true;
      } else if (o.type === "bat") {
        const bx = o.x, by = o.y - o.h;
        if (rectsOverlap(pr.x, pr.y, pr.w, pr.h, bx, by, o.w, o.h)) return true;
      } else if (o.type === "fallCoco") {
        const bx = o.x - o.r, by = o.y - o.r;
        if (rectsOverlap(pr.x, pr.y, pr.w, pr.h, bx, by, o.r*2, o.r*2)) return true;
      }
    }
    return false;
  }

  // --- Update
  function update(dt) {
    time += dt;

    // speed ramps up
    scrollMul = 1 + time * speedRamp;
    const scroll = baseScroll * scrollMul;

    // score increases with time and speed
    score += dt * (10 * scrollMul);
    scoreEl.textContent = Math.floor(score).toString();
    speedEl.textContent = `${scrollMul.toFixed(1)}x`;

    // physics: player
    const duckH = player.duck ? 26 : player.h;
    player.vy += gravity * dt;
    player.y += player.vy * dt;
    if (player.y >= groundY) {
      player.y = groundY;
      player.vy = 0;
      player.onGround = true;
    }

    // move trees (decor)
    for (const tr of trees) {
      tr.x -= scroll * dt;
    }
    // recycle trees to the right
    const maxTreeX = Math.max(...trees.map(t => t.x));
    for (const tr of trees) {
      if (tr.x < -40) tr.x = maxTreeX + rand(240, 420);
    }

    // spawn obstacles
    spawnTimer -= dt;
    const spawnEvery = Math.max(0.38, spawnBase / Math.sqrt(scrollMul)); // faster spawns
    if (spawnTimer <= 0) {
      chooseSpawn();
      spawnTimer = spawnEvery * rand(0.65, 1.1);
    }

    // update obstacles
    for (const o of obs) {
      if (o.type === "groundCoco") {
        o.x -= scroll * dt;
      } else if (o.type === "ba

import express from "express";
import pg from "pg";
import path from "path";
import { fileURLToPath } from "url";

const app = express();
app.use(express.json({ limit: "50kb" }));

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// --------------------
// Postgres
// --------------------
const { Pool } = pg;
const DATABASE_URL = process.env.DATABASE_URL;

if (!DATABASE_URL) {
  console.error("Missing env var DATABASE_URL (set this in Render).");
  process.exit(1);
}

const pool = new Pool({
  connectionString: DATABASE_URL,
  ssl: process.env.DATABASE_URL.includes("localhost")
    ? false
    : { rejectUnauthorized: false }
});

const LIMIT = 10;

function cleanName(name) {
  let n = (name ?? "").toString().trim();
  if (!n) n = "Unknown";
  n = n.replace(/[\u0000-\u001F\u007F]/g, ""); // strip control chars
  n = n.slice(0, 18);
  return n || "Unknown";
}

function cleanAchievement(a) {
  let t = (a ?? "").toString().trim();
  if (!t) t = "Coconut apprentice";
  t = t.replace(/[\u0000-\u001F\u007F]/g, "");
  t = t.slice(0, 32);
  return t || "Coconut apprentice";
}

function cleanScore(score) {
  const s = Number(score);
  if (!Number.isFinite(s)) return null;
  const i = Math.floor(s);
  if (i < 0) return null;
  if (i > 99999999) return 99999999;
  return i;
}

async function ensureSchema() {
  await pool.query(`
    create table if not exists high_scores (
      id bigserial primary key,
      name text not null default 'Unknown',
      score integer not null,
      achievement text not null default 'Coconut apprentice',
      created_at timestamptz not null default now()
    );

    create index if not exists high_scores_score_idx on high_scores(score desc);
  `);
}

// --------------------
// API
// --------------------
app.get("/api/scores", async (req, res) => {
  try {
    const { rows } = await pool.query(
      `
      select name, score, achievement, created_at
      from high_scores
      order by score desc, created_at asc
      limit $1
      `,
      [LIMIT]
    );
    res.json({ scores: rows });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.post("/api/scores", async (req, res) => {
  try {
    const name = cleanName(req.body?.name);
    const achievement = cleanAchievement(req.body?.achievement);
    const score = cleanScore(req.body?.score);
    if (score === null) return res.status(400).json({ error: "Invalid score" });

    // Only store if qualifies for Top 10 (keeps DB clean)
    const top = await pool.query(
      `select score from high_scores order by score desc, created_at asc limit $1`,
      [LIMIT]
    );

    const min = (top.rows.length >= LIMIT) ? top.rows[top.rows.length - 1].score : -1;
    if (top.rows.length >= LIMIT && score <= min) {
      return res.json({ stored: false, reason: "not_top10" });
    }

    await pool.query(
      `insert into high_scores(name, score, achievement) values ($1, $2, $3)`,
      [name, score, achievement]
    );

    const updated = await pool.query(
      `
      select name, score, achievement, created_at
      from high_scores
      order by score desc, created_at asc
      limit $1
      `,
      [LIMIT]
    );

    res.json({ stored: true, scores: updated.rows });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// --------------------
// Static site
// --------------------
app.use(express.static(path.join(__dirname, "public")));

// SPA-ish fallback: serve index for unknown routes (optional)
app.get("*", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

const port = process.env.PORT || 3000;

ensureSchema()
  .then(() => {
    app.listen(port, () => console.log(`Server running on ${port}`));
  })
  .catch((e) => {
    console.error("Schema init failed:", e);
    process.exit(1);
  });

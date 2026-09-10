const express = require("express");
const session = require("express-session");
const bcrypt = require("bcryptjs");
const multer = require("multer");
const { Pool } = require("pg");
const path = require("path");

const ADMIN_USERNAME = "onyxgotnomoney"; // only this account can delete images

const app = express();
const port = process.env.PORT || 3000;

// --- Database setup ---
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL ? { rejectUnauthorized: false } : false,
});

async function initDb() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS users (
      id SERIAL PRIMARY KEY,
      username TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS images (
      id SERIAL PRIMARY KEY,
      filename TEXT NOT NULL,
      mimetype TEXT NOT NULL,
      data BYTEA NOT NULL,
      uploader TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
  `);
}

// --- Middleware ---
app.set("trust proxy", 1);
app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));
app.use(
  session({
    secret: process.env.SESSION_SECRET || "imagebox-dev-secret",
    resave: false,
    saveUninitialized: false,
    cookie: {
      secure: process.env.NODE_ENV === "production",
      maxAge: 1000 * 60 * 60 * 24 * 30, // 30 days
    },
  })
);

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 15 * 1024 * 1024 }, // 15MB per image
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith("image/")) cb(null, true);
    else cb(new Error("Only image files are allowed"));
  },
});

function requireLogin(req, res, next) {
  if (!req.session.username) {
    return res.status(401).json({ error: "You need to log in first." });
  }
  next();
}

// --- Auth routes ---
app.post("/api/signup", async (req, res) => {
  try {
    const { username, password } = req.body || {};
    if (!username || !password || username.length < 3 || password.length < 4) {
      return res.status(400).json({
        error: "Username (3+ chars) and password (4+ chars) are required.",
      });
    }
    const existing = await pool.query("SELECT id FROM users WHERE username = $1", [
      username,
    ]);
    if (existing.rows.length > 0) {
      return res.status(409).json({ error: "That username is already taken." });
    }
    const hash = await bcrypt.hash(password, 10);
    await pool.query("INSERT INTO users (username, password_hash) VALUES ($1, $2)", [
      username,
      hash,
    ]);
    req.session.username = username;
    res.json({ username });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Something went wrong creating your account." });
  }
});

app.post("/api/login", async (req, res) => {
  try {
    const { username, password } = req.body || {};
    const result = await pool.query(
      "SELECT username, password_hash FROM users WHERE username = $1",
      [username]
    );
    const user = result.rows[0];
    if (!user) {
      return res.status(401).json({ error: "Incorrect username or password." });
    }
    const ok = await bcrypt.compare(password, user.password_hash);
    if (!ok) {
      return res.status(401).json({ error: "Incorrect username or password." });
    }
    req.session.username = user.username;
    res.json({ username: user.username });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Something went wrong logging in." });
  }
});

app.post("/api/logout", (req, res) => {
  req.session.destroy(() => res.json({ ok: true }));
});

app.get("/api/me", (req, res) => {
  res.json({
    username: req.session.username || null,
    isAdmin: req.session.username === ADMIN_USERNAME,
  });
});

// --- Image routes ---
app.get("/api/images", async (req, res) => {
  try {
    const result = await pool.query(
      "SELECT id, filename, uploader, created_at FROM images ORDER BY created_at DESC"
    );
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Could not load images." });
  }
});

app.get("/api/images/:id/file", async (req, res) => {
  try {
    const result = await pool.query(
      "SELECT data, mimetype FROM images WHERE id = $1",
      [req.params.id]
    );
    const row = result.rows[0];
    if (!row) return res.status(404).send("Not found");
    res.set("Content-Type", row.mimetype);
    res.set("Cache-Control", "public, max-age=31536000, immutable");
    res.send(row.data);
  } catch (err) {
    console.error(err);
    res.status(500).send("Error loading image");
  }
});

app.post("/api/images", requireLogin, upload.single("image"), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: "No image was attached." });
    }
    const result = await pool.query(
      `INSERT INTO images (filename, mimetype, data, uploader)
       VALUES ($1, $2, $3, $4)
       RETURNING id, filename, uploader, created_at`,
      [req.file.originalname, req.file.mimetype, req.file.buffer, req.session.username]
    );
    res.json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Upload failed." });
  }
});

app.delete("/api/images/:id", requireLogin, async (req, res) => {
  if (req.session.username !== ADMIN_USERNAME) {
    return res.status(403).json({ error: "Only onyxgotnomoney can delete images." });
  }
  try {
    await pool.query("DELETE FROM images WHERE id = $1", [req.params.id]);
    res.json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Delete failed." });
  }
});

initDb()
  .then(() => {
    app.listen(port, () => console.log(`imagebox running on port ${port}`));
  })
  .catch((err) => {
    console.error("Failed to initialize database:", err);
    process.exit(1);
  });

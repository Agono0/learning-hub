-- Learning HUB Cloudflare Worker D1 Database Initial Schema

CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  pubkey TEXT UNIQUE NOT NULL,
  alias TEXT NOT NULL,
  email_hash TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS public_stats (
  user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  alias TEXT NOT NULL,
  weekly_xp INTEGER NOT NULL DEFAULT 0,
  streak INTEGER NOT NULL DEFAULT 0,
  level INTEGER NOT NULL DEFAULT 1,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS community_library (
  id TEXT PRIMARY KEY,
  type TEXT NOT NULL, -- 'deck' | 'course'
  title TEXT NOT NULL,
  description TEXT,
  author TEXT NOT NULL,
  downloads INTEGER NOT NULL DEFAULT 0,
  rating REAL NOT NULL DEFAULT 5.0,
  tags TEXT NOT NULL, -- JSON array
  share_string TEXT NOT NULL,
  published_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS reports (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  entity_type TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  reason TEXT NOT NULL,
  reporter_id TEXT,
  reported_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_stats_weekly_xp ON public_stats (weekly_xp DESC);
CREATE INDEX IF NOT EXISTS idx_library_type ON community_library (type);


import Database from "better-sqlite3";
import path from "path";
import fs from "fs";

// DATA_DIR env var points to a Railway Volume mount (e.g. /app/data).
// Falls back to .studio/ for local development.
const DATA_DIR = process.env.DATA_DIR ?? path.join(process.cwd(), ".studio");
const DB_DIR = path.join(DATA_DIR, "db");
const DB_PATH = path.join(DB_DIR, "studio.db");

// Lazy singleton — only connect when first accessed (not at import time).
// During Next.js build phase, use an in-memory DB per worker to avoid
// SQLITE_BUSY from parallel build workers competing on the same file.
let _db: InstanceType<typeof Database> | null = null;

const IS_BUILD = process.env.NEXT_PHASE === "phase-production-build";

function getDb(): InstanceType<typeof Database> {
  if (_db) return _db;

  if (IS_BUILD) {
    // In-memory DB for each build worker — no file locking, no SQLITE_BUSY
    _db = new Database(":memory:");
  } else {
    if (!fs.existsSync(DB_DIR)) {
      fs.mkdirSync(DB_DIR, { recursive: true });
    }
    _db = new Database(DB_PATH);
    _db.pragma("busy_timeout = 10000");
  }

  _db.pragma("journal_mode = WAL");
  _db.pragma("foreign_keys = ON");

  // Migrations (safe to run on existing DBs)
  try { _db.exec(`ALTER TABLE clips ADD COLUMN output_path TEXT`); } catch { /* already exists */ }
  try { _db.exec(`ALTER TABLE clips ADD COLUMN hook_phrase TEXT`); } catch { /* already exists */ }
  try { _db.exec(`ALTER TABLE clips ADD COLUMN approval_status TEXT DEFAULT 'pending'`); } catch { /* already exists */ }
  try { _db.exec(`ALTER TABLE projects ADD COLUMN original_video TEXT`); } catch { /* already exists */ }
  try { _db.exec(`ALTER TABLE jobs ADD COLUMN completed_steps TEXT DEFAULT '[]'`); } catch { /* already exists */ }

  // Initialize schema
  _db.exec(`
  CREATE TABLE IF NOT EXISTS projects (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    mode TEXT DEFAULT 'single',
    original_video TEXT,
    source_video TEXT,
    duration_seconds REAL,
    captions TEXT,
    silence_data TEXT,
    caption_preset TEXT DEFAULT 'bold',
    caption_style TEXT DEFAULT '{}',
    status TEXT DEFAULT 'draft',
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS clips (
    id TEXT PRIMARY KEY,
    project_id TEXT REFERENCES projects(id) ON DELETE CASCADE,
    name TEXT,
    start_seconds REAL,
    end_seconds REAL,
    output_path TEXT,
    ai_score REAL,
    ai_reasoning TEXT,
    sort_order INTEGER DEFAULT 0,
    created_at TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS renders (
    id TEXT PRIMARY KEY,
    project_id TEXT REFERENCES projects(id) ON DELETE CASCADE,
    clip_id TEXT REFERENCES clips(id) ON DELETE SET NULL,
    platform TEXT,
    status TEXT DEFAULT 'queued',
    progress REAL DEFAULT 0,
    output_path TEXT,
    error TEXT,
    created_at TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS jobs (
    id TEXT PRIMARY KEY,
    type TEXT NOT NULL,
    project_id TEXT REFERENCES projects(id) ON DELETE CASCADE,
    status TEXT DEFAULT 'pending',
    progress REAL DEFAULT 0,
    current_step TEXT,
    result TEXT,
    error TEXT,
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS uploads (
    id TEXT PRIMARY KEY,
    clip_id TEXT REFERENCES clips(id) ON DELETE SET NULL,
    render_id TEXT REFERENCES renders(id) ON DELETE SET NULL,
    platform TEXT NOT NULL,
    provider TEXT NOT NULL DEFAULT 'blotato',
    external_post_id TEXT,
    status TEXT DEFAULT 'pending',
    caption TEXT,
    scheduled_at TEXT,
    published_at TEXT,
    url TEXT,
    error TEXT,
    created_at TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS social_accounts (
    id TEXT PRIMARY KEY,
    platform TEXT NOT NULL,
    username TEXT,
    platform_user_id TEXT,
    access_token TEXT,
    refresh_token TEXT,
    token_expires_at TEXT,
    follower_count INTEGER,
    content_profile_id TEXT,
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS content_profiles (
    id TEXT PRIMARY KEY,
    account_id TEXT,
    niche TEXT,
    sub_niches TEXT DEFAULT '[]',
    optimal_duration_min INTEGER DEFAULT 20,
    optimal_duration_max INTEGER DEFAULT 60,
    pacing TEXT DEFAULT 'medium',
    silence_threshold_db TEXT DEFAULT '-30dB',
    silence_min_duration REAL DEFAULT 0.5,
    caption_preset TEXT DEFAULT 'bold',
    words_per_phrase INTEGER DEFAULT 6,
    top_hooks TEXT DEFAULT '[]',
    top_hashtags TEXT DEFAULT '[]',
    best_posting_times TEXT DEFAULT '[]',
    avg_views INTEGER,
    avg_engagement_rate REAL,
    reference_profiles TEXT DEFAULT '[]',
    raw_data TEXT,
    updated_at TEXT DEFAULT (datetime('now')),
    created_at TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS reference_posts (
    id TEXT PRIMARY KEY,
    content_profile_id TEXT,
    source_url TEXT,
    source_username TEXT,
    platform TEXT,
    caption TEXT,
    hook_phrase TEXT,
    duration_seconds INTEGER,
    views INTEGER,
    likes INTEGER,
    comments INTEGER,
    shares INTEGER,
    engagement_rate REAL,
    hashtags TEXT DEFAULT '[]',
    posted_at TEXT,
    scraped_at TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS post_metrics (
    id TEXT PRIMARY KEY,
    upload_id TEXT,
    platform TEXT NOT NULL,
    external_post_id TEXT,
    views INTEGER DEFAULT 0,
    likes INTEGER DEFAULT 0,
    comments INTEGER DEFAULT 0,
    shares INTEGER DEFAULT 0,
    saves INTEGER DEFAULT 0,
    engagement_rate REAL,
    retention_rate REAL,
    fetched_at TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS auto_configs (
    id TEXT PRIMARY KEY,
    drive_folder_id TEXT,
    drive_folder_name TEXT,
    default_mode TEXT DEFAULT 'auto',
    caption_preset TEXT DEFAULT 'bold',
    platforms TEXT DEFAULT '[]',
    content_profile_id TEXT,
    schedule_strategy TEXT DEFAULT 'spread',
    posts_per_day INTEGER DEFAULT 2,
    spread_days INTEGER DEFAULT 3,
    enabled INTEGER DEFAULT 1,
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS drive_sync_log (
    id TEXT PRIMARY KEY,
    drive_file_id TEXT UNIQUE,
    drive_filename TEXT,
    project_id TEXT,
    status TEXT DEFAULT 'detected',
    error TEXT,
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS google_tokens (
    id TEXT PRIMARY KEY DEFAULT 'default',
    access_token TEXT NOT NULL,
    refresh_token TEXT,
    token_type TEXT DEFAULT 'Bearer',
    expiry_date INTEGER,
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now'))
  );

  CREATE INDEX IF NOT EXISTS idx_jobs_project ON jobs(project_id, created_at DESC);
  CREATE INDEX IF NOT EXISTS idx_clips_project ON clips(project_id, sort_order);
  CREATE INDEX IF NOT EXISTS idx_renders_project ON renders(project_id);
  CREATE INDEX IF NOT EXISTS idx_uploads_clip ON uploads(clip_id);
  CREATE INDEX IF NOT EXISTS idx_uploads_render ON uploads(render_id);
  CREATE INDEX IF NOT EXISTS idx_social_accounts_platform ON social_accounts(platform);
  CREATE INDEX IF NOT EXISTS idx_reference_posts_profile ON reference_posts(content_profile_id);
  CREATE INDEX IF NOT EXISTS idx_post_metrics_upload ON post_metrics(upload_id);
  CREATE INDEX IF NOT EXISTS idx_drive_sync_log_status ON drive_sync_log(status);
`);

  return _db;
}

export type Project = {
  id: string;
  name: string;
  mode: "single" | "clips";
  original_video: string | null;
  source_video: string | null;
  duration_seconds: number | null;
  captions: string | null;
  silence_data: string | null;
  caption_preset: string;
  caption_style: string;
  status: "draft" | "processing" | "ready" | "rendering" | "rendered" | "failed";
  created_at: string;
  updated_at: string;
};

export type Clip = {
  id: string;
  project_id: string;
  name: string | null;
  start_seconds: number;
  end_seconds: number;
  output_path: string | null;
  hook_phrase: string | null;
  ai_score: number | null;
  ai_reasoning: string | null;
  approval_status: "pending" | "approved" | "rejected";
  sort_order: number;
  created_at: string;
};

export type Render = {
  id: string;
  project_id: string;
  clip_id: string | null;
  platform: string;
  status: "queued" | "rendering" | "complete" | "failed";
  progress: number;
  output_path: string | null;
  error: string | null;
  created_at: string;
};

export type Job = {
  id: string;
  type: string;
  project_id: string;
  status: "pending" | "processing" | "complete" | "failed";
  progress: number;
  current_step: string | null;
  completed_steps: string;
  result: string | null;
  error: string | null;
  created_at: string;
  updated_at: string;
};

// Project queries
export const projectQueries = {
  get getAll() { return getDb().prepare<[], Project>("SELECT * FROM projects ORDER BY created_at DESC"); },
  get getById() { return getDb().prepare<[string], Project>("SELECT * FROM projects WHERE id = ?"); },
  get create() { return getDb().prepare<[string, string, string], void>("INSERT INTO projects (id, name, mode) VALUES (?, ?, ?)"); },
  get update() { return getDb().prepare<[string, string], void>("UPDATE projects SET status = ?, updated_at = datetime('now') WHERE id = ?"); },
  updateField(id: string, fields: Partial<Omit<Project, "id" | "created_at">>) {
    const keys = Object.keys(fields).filter((k) => k !== "updated_at");
    if (keys.length === 0) return;
    const setClause = keys.map((k) => `${k} = ?`).join(", ");
    const values = keys.map((k) => (fields as Record<string, unknown>)[k]);
    getDb().prepare(`UPDATE projects SET ${setClause}, updated_at = datetime('now') WHERE id = ?`).run(...values, id);
  },
  get delete() { return getDb().prepare<[string], void>("DELETE FROM projects WHERE id = ?"); },
};

// Job queries
export const jobQueries = {
  get getById() { return getDb().prepare<[string], Job>("SELECT * FROM jobs WHERE id = ?"); },
  get getByProject() { return getDb().prepare<[string], Job>("SELECT * FROM jobs WHERE project_id = ? ORDER BY created_at DESC"); },
  get getLatestByProject() { return getDb().prepare<[string], Job>("SELECT * FROM jobs WHERE project_id = ? ORDER BY created_at DESC LIMIT 1"); },
  get create() { return getDb().prepare<[string, string, string], void>("INSERT INTO jobs (id, type, project_id) VALUES (?, ?, ?)"); },
  get updateStatus() { return getDb().prepare<[string, number, string | null, string | null, string], void>("UPDATE jobs SET status = ?, progress = ?, current_step = ?, error = ?, updated_at = datetime('now') WHERE id = ?"); },
  get setResult() { return getDb().prepare<[string, string], void>("UPDATE jobs SET result = ?, status = 'complete', progress = 100, updated_at = datetime('now') WHERE id = ?"); },
};

// Render queries
export const renderQueries = {
  get getByProject() { return getDb().prepare<[string], Render>("SELECT * FROM renders WHERE project_id = ? ORDER BY created_at DESC"); },
  get create() { return getDb().prepare<[string, string, string], void>("INSERT INTO renders (id, project_id, platform) VALUES (?, ?, ?)"); },
  get update() { return getDb().prepare<[string, number, string | null, string], void>("UPDATE renders SET status = ?, progress = ?, output_path = ? WHERE id = ?"); },
};

// Clip queries
export const clipQueries = {
  get getByProject() { return getDb().prepare<[string], Clip>("SELECT * FROM clips WHERE project_id = ? ORDER BY sort_order ASC"); },
  get create() { return getDb().prepare<[string, string, number, number], void>("INSERT INTO clips (id, project_id, start_seconds, end_seconds) VALUES (?, ?, ?, ?)"); },
  get updateScore() { return getDb().prepare<[number, string, string], void>("UPDATE clips SET ai_score = ?, ai_reasoning = ? WHERE id = ?"); },
  get updateName() { return getDb().prepare<[string, string], void>("UPDATE clips SET name = ? WHERE id = ?"); },
  get updateSortOrder() { return getDb().prepare<[number, string], void>("UPDATE clips SET sort_order = ? WHERE id = ?"); },
  get updateOutputPath() { return getDb().prepare<[string, string], void>("UPDATE clips SET output_path = ? WHERE id = ?"); },
  get updateHookPhrase() { return getDb().prepare<[string, string], void>("UPDATE clips SET hook_phrase = ? WHERE id = ?"); },
  get updateApproval() { return getDb().prepare<[string, string], void>("UPDATE clips SET approval_status = ? WHERE id = ?"); },
  get deleteByProject() { return getDb().prepare<[string], void>("DELETE FROM clips WHERE project_id = ?"); },
};

export type Upload = {
  id: string;
  clip_id: string | null;
  render_id: string | null;
  platform: string;
  provider: string;
  external_post_id: string | null;
  status: "pending" | "uploading" | "scheduled" | "published" | "failed";
  caption: string | null;
  scheduled_at: string | null;
  published_at: string | null;
  url: string | null;
  error: string | null;
  created_at: string;
};

export const uploadQueries = {
  get getById() { return getDb().prepare<[string], Upload>("SELECT * FROM uploads WHERE id = ?"); },
  get getByClip() { return getDb().prepare<[string], Upload>("SELECT * FROM uploads WHERE clip_id = ? ORDER BY created_at DESC"); },
  get getByRender() { return getDb().prepare<[string], Upload>("SELECT * FROM uploads WHERE render_id = ? ORDER BY created_at DESC"); },
  get create() {
    return getDb().prepare<[string, string | null, string | null, string, string, string | null], void>(
      "INSERT INTO uploads (id, clip_id, render_id, platform, provider, caption) VALUES (?, ?, ?, ?, ?, ?)"
    );
  },
  get update() {
    return getDb().prepare<[string, string | null, string | null, string | null, string | null, string], void>(
      "UPDATE uploads SET status = ?, external_post_id = ?, url = ?, error = ?, scheduled_at = ? WHERE id = ?"
    );
  },
};

// ─── Social Accounts ─────────────────────────────────────────────────────────

export type SocialAccount = {
  id: string;
  platform: string;
  username: string | null;
  platform_user_id: string | null;
  access_token: string | null;
  refresh_token: string | null;
  token_expires_at: string | null;
  follower_count: number | null;
  content_profile_id: string | null;
  created_at: string;
  updated_at: string;
};

export const socialAccountQueries = {
  get getAll() { return getDb().prepare<[], SocialAccount>("SELECT * FROM social_accounts ORDER BY created_at DESC"); },
  get getById() { return getDb().prepare<[string], SocialAccount>("SELECT * FROM social_accounts WHERE id = ?"); },
  get getByPlatform() { return getDb().prepare<[string], SocialAccount>("SELECT * FROM social_accounts WHERE platform = ?"); },
  get create() {
    return getDb().prepare<[string, string, string | null, string | null], void>(
      "INSERT INTO social_accounts (id, platform, username, platform_user_id) VALUES (?, ?, ?, ?)"
    );
  },
  updateField(id: string, fields: Partial<Omit<SocialAccount, "id" | "created_at">>) {
    const keys = Object.keys(fields).filter((k) => k !== "updated_at");
    if (keys.length === 0) return;
    const setClause = keys.map((k) => `${k} = ?`).join(", ");
    const values = keys.map((k) => (fields as Record<string, unknown>)[k]);
    getDb().prepare(`UPDATE social_accounts SET ${setClause}, updated_at = datetime('now') WHERE id = ?`).run(...values, id);
  },
  get delete() { return getDb().prepare<[string], void>("DELETE FROM social_accounts WHERE id = ?"); },
};

// ─── Content Profiles ────────────────────────────────────────────────────────

export type ContentProfile = {
  id: string;
  account_id: string | null;
  niche: string | null;
  sub_niches: string;
  optimal_duration_min: number;
  optimal_duration_max: number;
  pacing: "fast" | "medium" | "slow";
  silence_threshold_db: string;
  silence_min_duration: number;
  caption_preset: string;
  words_per_phrase: number;
  top_hooks: string;
  top_hashtags: string;
  best_posting_times: string;
  avg_views: number | null;
  avg_engagement_rate: number | null;
  reference_profiles: string;
  raw_data: string | null;
  updated_at: string;
  created_at: string;
};

export const contentProfileQueries = {
  get getAll() { return getDb().prepare<[], ContentProfile>("SELECT * FROM content_profiles ORDER BY created_at DESC"); },
  get getById() { return getDb().prepare<[string], ContentProfile>("SELECT * FROM content_profiles WHERE id = ?"); },
  get getByAccount() { return getDb().prepare<[string], ContentProfile>("SELECT * FROM content_profiles WHERE account_id = ?"); },
  get create() {
    return getDb().prepare<[string, string | null], void>(
      "INSERT INTO content_profiles (id, account_id) VALUES (?, ?)"
    );
  },
  updateField(id: string, fields: Partial<Omit<ContentProfile, "id" | "created_at">>) {
    const keys = Object.keys(fields).filter((k) => k !== "updated_at");
    if (keys.length === 0) return;
    const setClause = keys.map((k) => `${k} = ?`).join(", ");
    const values = keys.map((k) => (fields as Record<string, unknown>)[k]);
    getDb().prepare(`UPDATE content_profiles SET ${setClause}, updated_at = datetime('now') WHERE id = ?`).run(...values, id);
  },
  get delete() { return getDb().prepare<[string], void>("DELETE FROM content_profiles WHERE id = ?"); },
};

// ─── Reference Posts ─────────────────────────────────────────────────────────

export type ReferencePost = {
  id: string;
  content_profile_id: string | null;
  source_url: string | null;
  source_username: string | null;
  platform: string | null;
  caption: string | null;
  hook_phrase: string | null;
  duration_seconds: number | null;
  views: number | null;
  likes: number | null;
  comments: number | null;
  shares: number | null;
  engagement_rate: number | null;
  hashtags: string;
  posted_at: string | null;
  scraped_at: string;
};

export const referencePostQueries = {
  get getByProfile() { return getDb().prepare<[string], ReferencePost>("SELECT * FROM reference_posts WHERE content_profile_id = ? ORDER BY engagement_rate DESC"); },
  get create() {
    return getDb().prepare<[string, string, string | null, string | null, string | null], void>(
      "INSERT INTO reference_posts (id, content_profile_id, source_url, source_username, platform) VALUES (?, ?, ?, ?, ?)"
    );
  },
  updateField(id: string, fields: Partial<Omit<ReferencePost, "id" | "scraped_at">>) {
    const keys = Object.keys(fields);
    if (keys.length === 0) return;
    const setClause = keys.map((k) => `${k} = ?`).join(", ");
    const values = keys.map((k) => (fields as Record<string, unknown>)[k]);
    getDb().prepare(`UPDATE reference_posts SET ${setClause} WHERE id = ?`).run(...values, id);
  },
  get deleteByProfile() { return getDb().prepare<[string], void>("DELETE FROM reference_posts WHERE content_profile_id = ?"); },
};

// ─── Post Metrics ────────────────────────────────────────────────────────────

export type PostMetric = {
  id: string;
  upload_id: string | null;
  platform: string;
  external_post_id: string | null;
  views: number;
  likes: number;
  comments: number;
  shares: number;
  saves: number;
  engagement_rate: number | null;
  retention_rate: number | null;
  fetched_at: string;
};

export const postMetricQueries = {
  get getByUpload() { return getDb().prepare<[string], PostMetric>("SELECT * FROM post_metrics WHERE upload_id = ? ORDER BY fetched_at DESC"); },
  get getLatestByUpload() { return getDb().prepare<[string], PostMetric>("SELECT * FROM post_metrics WHERE upload_id = ? ORDER BY fetched_at DESC LIMIT 1"); },
  get create() {
    return getDb().prepare<[string, string | null, string, number, number, number, number, number, number | null], void>(
      "INSERT INTO post_metrics (id, upload_id, platform, views, likes, comments, shares, saves, engagement_rate) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)"
    );
  },
};

// ─── Auto Config ─────────────────────────────────────────────────────────────

export type AutoConfig = {
  id: string;
  drive_folder_id: string | null;
  drive_folder_name: string | null;
  default_mode: "single" | "clips" | "auto";
  caption_preset: string;
  platforms: string;
  content_profile_id: string | null;
  schedule_strategy: "immediate" | "spread" | "best_time";
  posts_per_day: number;
  spread_days: number;
  enabled: number;
  created_at: string;
  updated_at: string;
};

export const autoConfigQueries = {
  get getAll() { return getDb().prepare<[], AutoConfig>("SELECT * FROM auto_configs ORDER BY created_at DESC"); },
  get getById() { return getDb().prepare<[string], AutoConfig>("SELECT * FROM auto_configs WHERE id = ?"); },
  get getEnabled() { return getDb().prepare<[], AutoConfig>("SELECT * FROM auto_configs WHERE enabled = 1"); },
  get create() {
    return getDb().prepare<[string], void>("INSERT INTO auto_configs (id) VALUES (?)");
  },
  updateField(id: string, fields: Partial<Omit<AutoConfig, "id" | "created_at">>) {
    const keys = Object.keys(fields).filter((k) => k !== "updated_at");
    if (keys.length === 0) return;
    const setClause = keys.map((k) => `${k} = ?`).join(", ");
    const values = keys.map((k) => (fields as Record<string, unknown>)[k]);
    getDb().prepare(`UPDATE auto_configs SET ${setClause}, updated_at = datetime('now') WHERE id = ?`).run(...values, id);
  },
  get delete() { return getDb().prepare<[string], void>("DELETE FROM auto_configs WHERE id = ?"); },
};

// ─── Drive Sync Log ──────────────────────────────────────────────────────────

export type DriveSyncEntry = {
  id: string;
  drive_file_id: string;
  drive_filename: string | null;
  project_id: string | null;
  status: "detected" | "downloading" | "processing" | "pending_review" | "approved" | "publishing" | "published" | "failed";
  error: string | null;
  created_at: string;
  updated_at: string;
};

export const driveSyncQueries = {
  get getAll() { return getDb().prepare<[], DriveSyncEntry>("SELECT * FROM drive_sync_log ORDER BY created_at DESC"); },
  get getById() { return getDb().prepare<[string], DriveSyncEntry>("SELECT * FROM drive_sync_log WHERE id = ?"); },
  get getByDriveFileId() { return getDb().prepare<[string], DriveSyncEntry>("SELECT * FROM drive_sync_log WHERE drive_file_id = ?"); },
  get getByStatus() { return getDb().prepare<[string], DriveSyncEntry>("SELECT * FROM drive_sync_log WHERE status = ?"); },
  get create() {
    return getDb().prepare<[string, string, string | null], void>(
      "INSERT INTO drive_sync_log (id, drive_file_id, drive_filename) VALUES (?, ?, ?)"
    );
  },
  updateField(id: string, fields: Partial<Omit<DriveSyncEntry, "id" | "created_at">>) {
    const keys = Object.keys(fields).filter((k) => k !== "updated_at");
    if (keys.length === 0) return;
    const setClause = keys.map((k) => `${k} = ?`).join(", ");
    const values = keys.map((k) => (fields as Record<string, unknown>)[k]);
    getDb().prepare(`UPDATE drive_sync_log SET ${setClause}, updated_at = datetime('now') WHERE id = ?`).run(...values, id);
  },
};

// ─── Google Tokens ───────────────────────────────────────────────────────────

export type GoogleToken = {
  id: string;
  access_token: string;
  refresh_token: string | null;
  token_type: string;
  expiry_date: number | null;
  created_at: string;
  updated_at: string;
};

export const googleTokenQueries = {
  get get() { return getDb().prepare<[], GoogleToken>("SELECT * FROM google_tokens WHERE id = 'default'"); },
  upsert(token: Omit<GoogleToken, "id" | "created_at" | "updated_at">) {
    getDb().prepare(`
      INSERT INTO google_tokens (id, access_token, refresh_token, token_type, expiry_date, updated_at)
      VALUES ('default', ?, ?, ?, ?, datetime('now'))
      ON CONFLICT(id) DO UPDATE SET
        access_token = excluded.access_token,
        refresh_token = COALESCE(excluded.refresh_token, google_tokens.refresh_token),
        token_type = excluded.token_type,
        expiry_date = excluded.expiry_date,
        updated_at = datetime('now')
    `).run(token.access_token, token.refresh_token, token.token_type, token.expiry_date);
  },
  get delete() { return getDb().prepare<[], void>("DELETE FROM google_tokens WHERE id = 'default'"); },
};

// Proxy so callers can do `db.prepare(sql).run(...)` without triggering eager init
const dbProxy = new Proxy({} as InstanceType<typeof Database>, {
  get(_target, prop: string) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return (getDb() as any)[prop];
  },
});

export default dbProxy;

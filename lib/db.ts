import Database from "better-sqlite3";
import path from "path";
import fs from "fs";

const DB_DIR = path.join(process.cwd(), ".studio");
const DB_PATH = path.join(DB_DIR, "studio.db");

if (!fs.existsSync(DB_DIR)) {
  fs.mkdirSync(DB_DIR, { recursive: true });
}

const db = new Database(DB_PATH);
db.pragma("journal_mode = WAL");
db.pragma("foreign_keys = ON");

// Migrations (safe to run on existing DBs)
try { db.exec(`ALTER TABLE clips ADD COLUMN output_path TEXT`); } catch { /* already exists */ }
try { db.exec(`ALTER TABLE clips ADD COLUMN hook_phrase TEXT`); } catch { /* already exists */ }
try { db.exec(`ALTER TABLE projects ADD COLUMN original_video TEXT`); } catch { /* already exists */ }

// Initialize schema
db.exec(`
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

  CREATE INDEX IF NOT EXISTS idx_jobs_project ON jobs(project_id, created_at DESC);
  CREATE INDEX IF NOT EXISTS idx_clips_project ON clips(project_id, sort_order);
  CREATE INDEX IF NOT EXISTS idx_renders_project ON renders(project_id);
`);

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
  status: "draft" | "processing" | "ready" | "rendering" | "rendered";
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
  result: string | null;
  error: string | null;
  created_at: string;
  updated_at: string;
};

// Project queries
export const projectQueries = {
  getAll: db.prepare<[], Project>("SELECT * FROM projects ORDER BY created_at DESC"),
  getById: db.prepare<[string], Project>("SELECT * FROM projects WHERE id = ?"),
  create: db.prepare<[string, string, string], void>(
    "INSERT INTO projects (id, name, mode) VALUES (?, ?, ?)"
  ),
  update: db.prepare<[string, string], void>(
    "UPDATE projects SET status = ?, updated_at = datetime('now') WHERE id = ?"
  ),
  updateField: (id: string, fields: Partial<Omit<Project, "id" | "created_at">>) => {
    const keys = Object.keys(fields).filter((k) => k !== "updated_at");
    if (keys.length === 0) return;
    const setClause = keys.map((k) => `${k} = ?`).join(", ");
    const values = keys.map((k) => (fields as Record<string, unknown>)[k]);
    db.prepare(
      `UPDATE projects SET ${setClause}, updated_at = datetime('now') WHERE id = ?`
    ).run(...values, id);
  },
  delete: db.prepare<[string], void>("DELETE FROM projects WHERE id = ?"),
};

// Job queries
export const jobQueries = {
  getById: db.prepare<[string], Job>("SELECT * FROM jobs WHERE id = ?"),
  getByProject: db.prepare<[string], Job>(
    "SELECT * FROM jobs WHERE project_id = ? ORDER BY created_at DESC"
  ),
  getLatestByProject: db.prepare<[string], Job>(
    "SELECT * FROM jobs WHERE project_id = ? ORDER BY created_at DESC LIMIT 1"
  ),
  create: db.prepare<[string, string, string], void>(
    "INSERT INTO jobs (id, type, project_id) VALUES (?, ?, ?)"
  ),
  updateStatus: db.prepare<[string, number, string | null, string | null, string], void>(
    "UPDATE jobs SET status = ?, progress = ?, current_step = ?, error = ?, updated_at = datetime('now') WHERE id = ?"
  ),
  setResult: db.prepare<[string, string], void>(
    "UPDATE jobs SET result = ?, status = 'complete', progress = 100, updated_at = datetime('now') WHERE id = ?"
  ),
};

// Render queries
export const renderQueries = {
  getByProject: db.prepare<[string], Render>(
    "SELECT * FROM renders WHERE project_id = ? ORDER BY created_at DESC"
  ),
  create: db.prepare<[string, string, string], void>(
    "INSERT INTO renders (id, project_id, platform) VALUES (?, ?, ?)"
  ),
  update: db.prepare<[string, number, string | null, string], void>(
    "UPDATE renders SET status = ?, progress = ?, output_path = ? WHERE id = ?"
  ),
};

// Clip queries
export const clipQueries = {
  getByProject: db.prepare<[string], Clip>(
    "SELECT * FROM clips WHERE project_id = ? ORDER BY sort_order ASC"
  ),
  create: db.prepare<[string, string, number, number], void>(
    "INSERT INTO clips (id, project_id, start_seconds, end_seconds) VALUES (?, ?, ?, ?)"
  ),
  updateScore: db.prepare<[number, string, string], void>(
    "UPDATE clips SET ai_score = ?, ai_reasoning = ? WHERE id = ?"
  ),
  updateName: db.prepare<[string, string], void>(
    "UPDATE clips SET name = ? WHERE id = ?"
  ),
  updateSortOrder: db.prepare<[number, string], void>(
    "UPDATE clips SET sort_order = ? WHERE id = ?"
  ),
  updateOutputPath: db.prepare<[string, string], void>(
    "UPDATE clips SET output_path = ? WHERE id = ?"
  ),
  updateHookPhrase: db.prepare<[string, string], void>(
    "UPDATE clips SET hook_phrase = ? WHERE id = ?"
  ),
  deleteByProject: db.prepare<[string], void>(
    "DELETE FROM clips WHERE project_id = ?"
  ),
};

export default db;

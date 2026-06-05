-- AI Video Studio — Supabase Postgres Schema
-- Run this in the Supabase SQL Editor (Dashboard → SQL Editor → New Query)

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
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS clips (
  id TEXT PRIMARY KEY,
  project_id TEXT REFERENCES projects(id) ON DELETE CASCADE,
  name TEXT,
  start_seconds REAL,
  end_seconds REAL,
  output_path TEXT,
  hook_phrase TEXT,
  ai_score REAL,
  ai_reasoning TEXT,
  sort_order INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
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
  created_at TIMESTAMPTZ DEFAULT NOW()
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
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_jobs_project ON jobs(project_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_clips_project ON clips(project_id, sort_order);
CREATE INDEX IF NOT EXISTS idx_renders_project ON renders(project_id);

-- ─────────────────────────────────────────────────────────────────────────────
-- Auto-sanado de columnas: CREATE TABLE IF NOT EXISTS NO agrega columnas a una
-- tabla que ya existe. Si la tabla se creó con un schema viejo/parcial, faltarían
-- columnas (ej: created_at) y queries como `.order("created_at")` fallan con un
-- error de PostgREST que tira toda la app. Estos ALTER son idempotentes: re-correr
-- este script repara cualquier drift de columnas.
ALTER TABLE projects ADD COLUMN IF NOT EXISTS name TEXT;
ALTER TABLE projects ADD COLUMN IF NOT EXISTS mode TEXT DEFAULT 'single';
ALTER TABLE projects ADD COLUMN IF NOT EXISTS original_video TEXT;
ALTER TABLE projects ADD COLUMN IF NOT EXISTS source_video TEXT;
ALTER TABLE projects ADD COLUMN IF NOT EXISTS duration_seconds REAL;
ALTER TABLE projects ADD COLUMN IF NOT EXISTS captions TEXT;
ALTER TABLE projects ADD COLUMN IF NOT EXISTS silence_data TEXT;
ALTER TABLE projects ADD COLUMN IF NOT EXISTS caption_preset TEXT DEFAULT 'bold';
ALTER TABLE projects ADD COLUMN IF NOT EXISTS caption_style TEXT DEFAULT '{}';
ALTER TABLE projects ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'draft';
ALTER TABLE projects ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT NOW();
ALTER TABLE projects ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

ALTER TABLE clips ADD COLUMN IF NOT EXISTS name TEXT;
ALTER TABLE clips ADD COLUMN IF NOT EXISTS start_seconds REAL;
ALTER TABLE clips ADD COLUMN IF NOT EXISTS end_seconds REAL;
ALTER TABLE clips ADD COLUMN IF NOT EXISTS output_path TEXT;
ALTER TABLE clips ADD COLUMN IF NOT EXISTS hook_phrase TEXT;
ALTER TABLE clips ADD COLUMN IF NOT EXISTS ai_score REAL;
ALTER TABLE clips ADD COLUMN IF NOT EXISTS ai_reasoning TEXT;
ALTER TABLE clips ADD COLUMN IF NOT EXISTS sort_order INTEGER DEFAULT 0;
ALTER TABLE clips ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT NOW();

ALTER TABLE renders ADD COLUMN IF NOT EXISTS platform TEXT;
ALTER TABLE renders ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'queued';
ALTER TABLE renders ADD COLUMN IF NOT EXISTS progress REAL DEFAULT 0;
ALTER TABLE renders ADD COLUMN IF NOT EXISTS output_path TEXT;
ALTER TABLE renders ADD COLUMN IF NOT EXISTS error TEXT;
ALTER TABLE renders ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT NOW();

ALTER TABLE jobs ADD COLUMN IF NOT EXISTS type TEXT;
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'pending';
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS progress REAL DEFAULT 0;
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS current_step TEXT;
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS result TEXT;
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS error TEXT;
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT NOW();
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

-- Row Level Security: disable for service_role key usage (server-side only)
ALTER TABLE projects DISABLE ROW LEVEL SECURITY;
ALTER TABLE clips DISABLE ROW LEVEL SECURITY;
ALTER TABLE renders DISABLE ROW LEVEL SECURITY;
ALTER TABLE jobs DISABLE ROW LEVEL SECURITY;

-- Recargar el schema cache de PostgREST (si no, los ALTER de arriba no se ven
-- hasta el próximo reinicio → seguirían fallando las queries por columna).
NOTIFY pgrst, 'reload schema';

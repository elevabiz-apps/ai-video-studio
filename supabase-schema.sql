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

-- Row Level Security: disable for service_role key usage (server-side only)
ALTER TABLE projects DISABLE ROW LEVEL SECURITY;
ALTER TABLE clips DISABLE ROW LEVEL SECURITY;
ALTER TABLE renders DISABLE ROW LEVEL SECURITY;
ALTER TABLE jobs DISABLE ROW LEVEL SECURITY;

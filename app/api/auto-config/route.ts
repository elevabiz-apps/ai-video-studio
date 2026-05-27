export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { autoConfigQueries, type AutoConfig } from "@/lib/db";

/**
 * GET /api/auto-config
 * List all auto-processing configurations.
 */
export async function GET() {
  const configs = autoConfigQueries.getAll.all() as AutoConfig[];
  return NextResponse.json({ configs });
}

/**
 * POST /api/auto-config
 * Create or update an auto-processing configuration.
 */
interface AutoConfigBody {
  id?: string;
  drive_folder_id?: string;
  drive_folder_name?: string;
  default_mode?: AutoConfig["default_mode"];
  caption_preset?: string;
  platforms?: string[];
  content_profile_id?: string;
  schedule_strategy?: AutoConfig["schedule_strategy"];
  posts_per_day?: number;
  spread_days?: number;
  enabled?: boolean;
}

export async function POST(req: NextRequest) {
  let body: AutoConfigBody;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const {
    id,
    drive_folder_id,
    drive_folder_name,
    default_mode,
    caption_preset,
    platforms,
    content_profile_id,
    schedule_strategy,
    posts_per_day,
    spread_days,
    enabled,
  } = body;

  if (id) {
    // Update existing
    const existing = autoConfigQueries.getById.get(id) as AutoConfig | undefined;
    if (!existing) {
      return NextResponse.json({ error: "Config not found" }, { status: 404 });
    }

    autoConfigQueries.updateField(id, {
      ...(drive_folder_id !== undefined && { drive_folder_id }),
      ...(drive_folder_name !== undefined && { drive_folder_name }),
      ...(default_mode !== undefined && { default_mode }),
      ...(caption_preset !== undefined && { caption_preset }),
      ...(platforms !== undefined && { platforms: JSON.stringify(platforms) }),
      ...(content_profile_id !== undefined && { content_profile_id }),
      ...(schedule_strategy !== undefined && { schedule_strategy }),
      ...(posts_per_day !== undefined && { posts_per_day }),
      ...(spread_days !== undefined && { spread_days }),
      ...(enabled !== undefined && { enabled: enabled ? 1 : 0 }),
    });

    const updated = autoConfigQueries.getById.get(id) as AutoConfig;
    return NextResponse.json({ config: updated });
  } else {
    // Create new
    const newId = randomUUID();
    autoConfigQueries.create.run(newId);

    // Apply provided fields
    const fields: Partial<AutoConfig> = {};
    if (drive_folder_id) fields.drive_folder_id = drive_folder_id;
    if (drive_folder_name) fields.drive_folder_name = drive_folder_name;
    if (default_mode) fields.default_mode = default_mode;
    if (caption_preset) fields.caption_preset = caption_preset;
    if (platforms) fields.platforms = JSON.stringify(platforms);
    if (content_profile_id) fields.content_profile_id = content_profile_id;
    if (schedule_strategy) fields.schedule_strategy = schedule_strategy;
    if (posts_per_day !== undefined) fields.posts_per_day = posts_per_day;
    if (spread_days !== undefined) fields.spread_days = spread_days;

    if (Object.keys(fields).length > 0) {
      autoConfigQueries.updateField(newId, fields);
    }

    const created = autoConfigQueries.getById.get(newId) as AutoConfig;
    return NextResponse.json({ config: created }, { status: 201 });
  }
}

/**
 * DELETE /api/auto-config?id=xxx
 * Delete an auto-processing configuration.
 */
export async function DELETE(req: NextRequest) {
  const id = req.nextUrl.searchParams.get("id");
  if (!id) {
    return NextResponse.json({ error: "Missing id" }, { status: 400 });
  }

  autoConfigQueries.delete.run(id);
  return NextResponse.json({ ok: true });
}

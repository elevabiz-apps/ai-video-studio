export const dynamic = "force-dynamic";

import { getProjectById, getRendersByProject, getClipsByProject } from "@/lib/db-async";
import { notFound } from "next/navigation";
import type { Project, Render, Clip } from "@/lib/db";
import ProjectEditor from "@/components/project-editor";

export default async function ProjectPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const project = await getProjectById(id) as Project | null;
  if (!project) notFound();

  const renders = await getRendersByProject(id) as Render[];
  const clips = await getClipsByProject(id) as Clip[];

  return <ProjectEditor project={project} renders={renders} clips={clips} />;
}

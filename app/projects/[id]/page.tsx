import { projectQueries, renderQueries, clipQueries } from "@/lib/db";
import { notFound } from "next/navigation";
import type { Project, Render, Clip } from "@/lib/db";
import ProjectEditor from "@/components/project-editor";

export const dynamic = "force-dynamic";

export default async function ProjectPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const project = projectQueries.getById.get(id) as Project | undefined;
  if (!project) notFound();

  const renders = renderQueries.getByProject.all(id) as Render[];
  const clips = clipQueries.getByProject.all(id) as Clip[];

  return <ProjectEditor project={project} renders={renders} clips={clips} />;
}

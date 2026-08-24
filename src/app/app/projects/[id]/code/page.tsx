import { redirect } from "next/navigation";

export default async function ProjectCodeRedirect({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ taskId?: string }>;
}) {
  const { id } = await params;
  const { taskId } = await searchParams;
  const query = new URLSearchParams({ projectId: id });
  if (taskId) query.set("taskId", taskId);
  redirect(`/app/coding-agent?${query.toString()}`);
}

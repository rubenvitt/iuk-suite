import type { Viewer } from "./access";

export function viewerFromSession(
  session: { user?: { id?: string; groups?: string[] } } | null,
): Viewer | null {
  const id = session?.user?.id;
  if (!id) return null;
  return { sub: id, groups: session?.user?.groups ?? [] };
}

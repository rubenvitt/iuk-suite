import type { Viewer } from "./access";

// `fachgruppen` kommt denselben Weg wie `groups`: aus dem signierten ID-Token
// über den jwt/session-Callback in core/auth. Fehlt es, ist es die leere Menge —
// die Zuordnung fällt dann auf `user_groups` allein zurück (siehe
// memberGroupIdsFor), nie auf „alle Gruppen".
export function viewerFromSession(
  session: { user?: { id?: string; groups?: string[]; fachgruppen?: string[] } } | null,
): Viewer | null {
  const id = session?.user?.id;
  if (!id) return null;
  return {
    sub: id,
    groups: session?.user?.groups ?? [],
    fachgruppen: session?.user?.fachgruppen ?? [],
  };
}

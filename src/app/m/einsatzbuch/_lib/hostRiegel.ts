import { einsatzbuchHostOderNull } from "./host";

/** Für Route Handler: erste Anweisung, `const ab = hostAbweisung(req); if (ab) return ab;`. */
export function hostAbweisung(req: Request): Response | null {
  return einsatzbuchHostOderNull(new Headers(req.headers))
    ? null
    : new Response("Not found", { status: 404 });
}

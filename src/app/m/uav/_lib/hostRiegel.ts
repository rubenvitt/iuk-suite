import { istUavHost } from "./host";

/** ERSTE Anweisung jedes Route Handlers unter api/ und sw.js/ — Handler haben kein Layout. */
export function hostAbweisung(req: Request): Response | null {
  return istUavHost(new Headers(req.headers)) ? null : new Response("Not found", { status: 404 });
}

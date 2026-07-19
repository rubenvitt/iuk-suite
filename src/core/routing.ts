import { moduleForHost, getModule, findModule, canAccess } from "@/core/registry";

export type RouteDecision =
  | { action: "next" }
  | { action: "rewrite"; target: string; moduleKey: string }
  | { action: "login"; callbackUrl: string }
  | { action: "forbidden" };

// `/.well-known` ist per Definition öffentlich und host-übergreifend (aktuell:
// WebFinger für die OIDC-Discovery). Ohne Passthrough liefe es in den
// Modul-Rewrite und damit für auth-pflichtige Hosts in den Login-Redirect.
const PASSTHROUGH = ["/api/auth", "/api/health", "/login", "/_next", "/favicon.ico", "/.well-known"];

export function decideRoute(input: {
  host: string;
  pathname: string;
  groups: string[] | null;
}): RouteDecision {
  const { host, pathname, groups } = input;

  if (PASSTHROUGH.some((p) => pathname === p || pathname.startsWith(p + "/"))) {
    return { action: "next" };
  }

  // Bereits interner Pfad: nicht erneut präfixen, sonst akkumuliert jeder
  // RSC-/Prefetch-Request eine weitere /m/<key>-Ebene. Gating bleibt hier
  // erhalten (der Matcher schließt /m/* bewusst nicht aus) — aber nach dem
  // Modul aus dem Segment, nicht nach dem Host.
  const internal = pathname.match(/^\/m\/([^/]+)(?:\/.*)?$/);
  if (internal) {
    const target = findModule(internal[1]);
    if (!target) return { action: "next" }; // unbekanntes Modul → 404, kein 500
    if (target.requiresAuth && groups === null) {
      return { action: "login", callbackUrl: pathname };
    }
    if (!canAccess(target, groups)) return { action: "forbidden" };
    return { action: "next" };
  }

  const mod = moduleForHost(host) ?? getModule("portal");

  if (mod.requiresAuth && groups === null) {
    return { action: "login", callbackUrl: pathname };
  }
  if (!canAccess(mod, groups)) {
    return { action: "forbidden" };
  }

  const rest = pathname === "/" ? "" : pathname;
  return { action: "rewrite", target: `/m/${mod.key}${rest}`, moduleKey: mod.key };
}

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

/**
 * Der Host, nach dem das Modul aufgelöst wird: `x-forwarded-host` vor `host`.
 *
 * Warum nicht einfach `host`: hinter einem Reverse-Proxy trägt `host` dessen
 * eigenen Namen — und nach einem `redirect()` in einer Server Action rendert
 * Next das Ziel über eine **interne** Anfrage mit `host: localhost:<port>`. Der
 * echte Host steht dann nur in `x-forwarded-host`. Ohne diesen Vorrang findet
 * `moduleForHost` kein Modul, `decideRoute` fällt auf `portal` zurück, `portal`
 * verlangt Auth: die anonyme Teilnehmerin landet nach dem Absenden im Login
 * statt auf der Danke-Seite.
 *
 * Bei einer Kommaliste gewinnt der **erste** Wert — das ist der ursprüngliche
 * Client-Host, der Rest sind Zwischenstationen. Ein leerer oder fehlender
 * `x-forwarded-host` fällt auf `host` zurück, fehlt auch der, ist das Ergebnis
 * der leere String (→ Portal-Fallback), nicht `null`.
 *
 * Sicherheitsgrenze: Der Header ist fälschbar, verschiebt aber nur die
 * Modul**auswahl**. Die Berechtigung entscheidet `decideRoute` danach über
 * `requiresAuth`/`canAccess` gegen die Gruppen aus der Session — ein gefälschter
 * Header führt auf einem geschützten Modul weiter zu `login`/`forbidden`.
 * Normalisierung (Port abschneiden, Kleinschreibung) bleibt in `moduleForHost`.
 */
export function resolveHost(headers: Headers): string {
  const forwarded = headers.get("x-forwarded-host");
  const first = forwarded?.split(",")[0].trim();
  if (first) return first;
  return headers.get("host") ?? "";
}

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

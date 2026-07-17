import { moduleForHost, getModule, canAccess } from "@/core/registry";

export type RouteDecision =
  | { action: "next" }
  | { action: "rewrite"; target: string; moduleKey: string }
  | { action: "login"; callbackUrl: string }
  | { action: "forbidden" };

const PASSTHROUGH = ["/api/auth", "/api/health", "/login", "/_next", "/favicon.ico"];

export function decideRoute(input: {
  host: string;
  pathname: string;
  groups: string[] | null;
}): RouteDecision {
  const { host, pathname, groups } = input;

  if (PASSTHROUGH.some((p) => pathname === p || pathname.startsWith(p + "/"))) {
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

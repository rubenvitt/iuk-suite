import { forbidden } from "next/navigation";

/**
 * NUR EIN REWRITE-ZIEL: `src/proxy.ts` schreibt einen verweigerten Seitenaufruf hierher um, und
 * `forbidden()` liefert HTTP 403 mit `app/forbidden.tsx`. Ein Rewrite allein traegt keinen Status
 * (`next/dist/server/lib/router-utils/resolve-routes.js`, Zweig `x-middleware-rewrite`).
 *
 * Kein `loading.tsx` auf dem Weg hierher: darunter waere der Status schon gestreamt (Falle 23).
 */
export default function KeinZugriff(): never {
  forbidden();
}

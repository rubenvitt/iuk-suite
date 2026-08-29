import { AnmeldeFlaeche } from "../../_ui/teilnehmer/AnmeldeFlaeche";

/**
 * Teilnehmer-Login über den MAGIC-LINK (`/login?code=…`) — Port aus
 * uav-praxis/src/pages/LoginPage.tsx. `/api/auth/signin` (Passthrough,
 * Auth.js) ist die Verwaltungs-Anmeldung; `/login` ist auf diesem Host die
 * Brücke für den Teilnehmer-Code, NICHT die Suite-weite Login-Route.
 *
 * ⚠️ DIESE ADRESSE ERREICHT MAN NUR MIT `?code=…`. `core/routing.ts` schreibt
 * `/login` auf dem uav-Host ausschließlich mit nichtleerem `code`-Parameter
 * hierher um; ohne ihn bleibt `/login` der Suite-Login. Der code-lose Weg zum
 * Code-Feld ist deshalb `/anmelden` — dieselbe Fläche, andere Adresse
 * (Begründung im Kopf von `_ui/teilnehmer/AnmeldeFlaeche.tsx`).
 */
export default async function Login({
  searchParams,
}: {
  searchParams: Promise<{ code?: string }>;
}) {
  const { code } = await searchParams;

  return <AnmeldeFlaeche code={typeof code === "string" ? code : undefined} />;
}

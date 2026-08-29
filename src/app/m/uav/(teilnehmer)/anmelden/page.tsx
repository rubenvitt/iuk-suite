import { AnmeldeFlaeche } from "../../_ui/teilnehmer/AnmeldeFlaeche";

/**
 * DER CODE-LOSE WEG ZUM CODE-FELD (`/anmelden`).
 *
 * Wer seinen Magic-Link nicht mehr hat, aber seinen persönlichen Code kennt,
 * hatte bis hierher keinen Weg in die App: `/login` ohne `code` ist der
 * Suite-Login mit Pocket ID (`core/routing.ts`, `PASSTHROUGH`), und die
 * Teilnehmer-Anmeldung lag ausschließlich hinter `/login?code=…`. Der Hinweis
 * auf der Startfläche sagte „Bitte mit deinem Code anmelden", und der Knopf
 * darunter führte auf eine Seite ohne Code-Feld.
 *
 * `/anmelden` steht NICHT in `PASSTHROUGH` und wird vom generischen
 * Host-Rewrite (`moduleForHost`) auf `/m/uav/anmelden` umgeschrieben; `uav`
 * trägt `requiresAuth: false`, es liegt also kein Gate davor. Damit bleibt
 * `core/routing.ts` unangetastet und jeder ausgegebene `/login?code=…`-Link
 * gültig.
 *
 * `?code=` wird hier ebenfalls gelesen: ein Link auf diese Adresse mit Code
 * soll nicht anders wirken als derselbe Link auf `/login`.
 */
export default async function Anmelden({
  searchParams,
}: {
  searchParams: Promise<{ code?: string }>;
}) {
  const { code } = await searchParams;

  return <AnmeldeFlaeche code={typeof code === "string" ? code : undefined} />;
}

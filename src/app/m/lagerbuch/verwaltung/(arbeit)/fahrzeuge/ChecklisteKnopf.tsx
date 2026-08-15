import { Button } from "antd";
import { Ikone } from "../../../_ui/ikonen";

/**
 * DER WEG AUF DIE DRUCK-CHECKLISTE — von der Fahrzeugliste (alle aktiven) und
 * vom Fahrzeugblatt (genau dieses eine).
 *
 * EINE KOMPONENTE FUER BEIDE STELLEN, damit der Zielpfad genau einmal
 * geschrieben steht. `/verwaltung/checklisten` liegt in der Route-Gruppe
 * `(druck)`, die in der URL nicht erscheint — der Pfad sieht deshalb aus, als
 * laege er neben `fahrzeuge/`, und ein zweiter, handgeschriebener Aufruf
 * verwechselte ihn erfahrungsgemaess mit `/verwaltung/fahrzeuge/checklisten`.
 * Das ergaebe eine 404, aber erst im Betrieb.
 *
 * ⚠️ `Button href`, NIEMALS `<Link><Button/></Link>` — UND DAS IST EIN
 * BEHOBENER FEHLER, KEINE STILFRAGE. Die erste Fassung verschachtelte genau so
 * und war am Bildschirm nicht von der richtigen zu unterscheiden: der Knopf sah
 * aus wie ein Knopf, `getByRole("link")` fand ihn, `typecheck`, `lint`,
 * `build` und Vitest blieben gruen. Nur ein KLICK zeigte es — die Adresse
 * blieb stehen. Ein `<button>` in einem `<a>` ist verbotener Inhalt (das
 * `<a>`-Element darf keinen interaktiven Inhalt tragen); der Knopf schluckt
 * den Klick, und der Anker navigiert nie. Gefunden hat es der e2e-Lauf und
 * sonst nichts.
 *
 * DIE FALLE STAND SCHON IM REPO: `m/qr/page.tsx:34-42` schreibt sie woertlich
 * aus („ein `Button` in einem `Link` verschachtelte ein `<button>` in einem
 * `<a>`"). Dort ist der Ausweg ein selbst gestylter Link, weil es um Kacheln
 * geht. HIER ist der Ausweg der zweite, in der Suite gaengige: `Button href`
 * rendert selbst ein `<a>` mit Knopf-Anmutung (`feedback/(admin)/page.tsx`,
 * `files/_ui/SharesUebersicht.tsx` u. a.). Der Preis ist ein echter
 * Dokumentwechsel statt einer Client-Navigation — auf einer Druckseite ist das
 * kein Verlust, sondern liefert nebenbei frische Daten.
 *
 * KEIN "use client", UND DAS IST HIER ABSICHT UND KEIN VERSEHEN: die
 * Komponente hat keinen Zustand und keinen `onClick`. Sie wird von einer
 * Server Component (`fahrzeuge/[id]/page.tsx`) UND von einer Client-Insel
 * gerendert; ohne Direktive passt sie in beide. `_ui/ikonen.tsx` traegt aus
 * demselben Grund keine (Falle 6 — ein Wert aus einem Client-Modul kommt in
 * einer Server Component als Client-Referenz an, HTTP 500 fuer die ganze
 * Seite, unsichtbar fuer `build` und Vitest).
 *
 * KEIN `size` (Falle 4): `size="large"` waere 72px; die Arbeitsdichte des
 * Verwaltungsasts steht in `core/theme/theme.ts` und ist schon richtig.
 */
export function ChecklisteKnopf({
  fahrzeugId,
  beschriftung,
}: {
  /** Genau ein Fahrzeug, oder `undefined` fuer alle aktiven. */
  fahrzeugId?: string;
  beschriftung: string;
}) {
  const ziel = fahrzeugId === undefined
    ? "/verwaltung/checklisten"
    : `/verwaltung/checklisten?fz=${encodeURIComponent(fahrzeugId)}`;

  return (
    <Button href={ziel} icon={<Ikone name="drucken" groesse={16} />}>
      {beschriftung}
    </Button>
  );
}

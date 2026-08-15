import { Result } from "antd";
import { SeitenKopf } from "./SeitenKopf";

/*
 * DIE ERKLAERSEITE AUS `_lib/zugang.ts`s `personFuerSeite` (Spec-Nachtrag 2026-08-14, `1d36008`,
 * Aufgabe 13 Fix-Runde 1) — EINE Stelle, EIN Wortlaut, statt einer eigenen Formulierung je Seite,
 * die drei Fassungen von `personFuerSeite` aufrufen (`page.tsx`, `plan/[personId]/page.tsx`,
 * `routinen/page.tsx`).
 *
 * `Result` DIREKT IN EINER SERVER COMPONENT: kein Compound-Zugriff (Falle 1), Vorbild
 * `feedback/(admin)/page.tsx` ("<Result status="info" title="Dir ist noch keine Gruppe
 * zugeordnet." />" — derselbe Fall, ein Zugang ohne zugehoerige fachliche Zeile, in einem anderen
 * Modul).
 *
 * `SeitenKopf` BLEIBT AUCH HIER STEHEN, OBWOHL ES KEINE ECHTE INHALTSSEITE IST: Spec §9.4 verlangt
 * ihn "fuer jeden Einstieg" — eine BuFDi, die diese Seite sieht, ist trotzdem im Modul gelandet,
 * nicht in einem Fehlerzustand; die Kopfzeile bleibt deshalb identisch zu jeder anderen Seite.
 *
 * `sub` (Aufgabe 14) — DER AUSGANG AUS DIESER SEITE: die Personenverwaltung (`/personen`) kann eine
 * neue `personen`-Zeile nur ohne Raten anlegen, wenn sie die Pocket-ID-Kennung der betroffenen
 * Person kennt. Diese Seite ist der einzige Ort, an dem die Person selbst ihre eigene Kennung
 * unaufgefordert sieht — sie gibt sie mündlich oder schriftlich an die Koordination weiter, die sie
 * dann in `PersonenFormular.tsx`s `sub`-Feld eintraegt. Alle drei Aufrufer (`page.tsx`,
 * `plan/[personId]/page.tsx`, `routinen/page.tsx`) reichen ihn seit dieser Aufgabe durch — derselbe
 * Fall trifft jeden der drei Wege gleichermassen. OPTIONAL BLEIBT DER PARAMETER TROTZDEM: die drei
 * bestehenden Tests dieser Komponente rufen sie ohne `sub` auf und bleiben unveraendert gruen.
 */
export function NichtEingetragenSeite({ sub }: { sub?: string | null }) {
  return (
    <>
      <SeitenKopf
        brotkrume={[{ label: "Aufgaben" }]}
        titel="Aufgaben"
        kontext="Dein Zugang besteht, deine Personen-Zeile fehlt noch."
      />
      <Result
        status="info"
        title="Du bist noch nicht im Modul eingetragen."
        subTitle="Wende dich an die Koordination."
      />
      {sub ? (
        <p>
          Nenne der Koordination diese Kennung, damit sie dich anlegen kann: <code>{sub}</code>
        </p>
      ) : null}
    </>
  );
}

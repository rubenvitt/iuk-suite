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
 */
export function NichtEingetragenSeite() {
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
    </>
  );
}

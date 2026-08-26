// src/app/m/radio/admin/(arbeit)/ausleihen/page.tsx
import { getDb } from "../../../_db/client";
import { ausleihenListe, geraeteAuswahl } from "../../../_lib/lesepfade/ausleihen";
import { ausleihenParameterAus, type RohSuchparameter } from "../../../_lib/suchparameter";
import { requireRadioVerwaltung } from "../../../_lib/zugang";
import s from "../../../_ui/verwaltung.module.css";
import { AusleihenTabelle } from "./AusleihenTabelle";

/**
 * DIE AUSLEIHENLISTE DER VERWALTUNG — der aeussere Pfad `/admin/ausleihen`
 * (Spec §5.9, `Spec:4498-4506`; Routenkarte `_lib/routen.ts:60`, Navigation `_lib/nav.ts:63`).
 *
 * ⛔ ERSTE ANWEISUNG: `await requireRadioVerwaltung()` (`Spec:4373`). Sie ist KEINE Redundanz
 * zum Riegel in `admin/(arbeit)/layout.tsx`: Route-Group-Grenzen sind keine
 * Sicherheitsgrenzen (`Spec:569-571`), und `requiresAuth: false` heisst NULL
 * Middleware-Gating fuer `/m/radio/admin/*` (`src/core/routing.ts:68-76`). ⛔ KEIN
 * `requireRadioHost(` DANEBEN: `Spec:4369-4378` gibt jeder der zehn Seiten GENAU EINE erste
 * Anweisung; den Host haelt das Group-Layout und zusaetzlich der werfende Riegel selbst
 * (`_lib/zugang.ts`, `riegelAufStufe`).
 *
 * ⛔ DIE VERWALTUNGS-STUFE, NICHT DIE ADMIN-STUFE — und diese Flaeche ist der klarste Fall
 * der ganzen Tafel: die Rechtetafel fuehrt „Uebersicht, Geraeteliste, Geraetedetail,
 * Ereignisse, Ausleihen | ja | ja" (`Spec:4444-4454`), sie ist eine reine LESEansicht, und
 * der Bestand haelt sie ebenso offen (`loans.ts:18` traegt kein `requireRole`).
 * `riegel.test.ts` faengt eine faelschlich ANGEHOBENE Seite im `(arbeit)`-Zweig strukturell
 * nicht — die ODER-Klausel dort laesst beide Namen zu (`riegel.test.ts:253-262`); der
 * namentliche Waechter steht in `AusleihenTabelle.test.tsx` („die Seite traegt force-dynamic
 * und den Riegel der Verwaltungs-Stufe").
 *
 * ⛔ MIT DIESER SEITE HAT DIE SECHSTE ERSATZFUNKTION IHREN VERBRAUCHER: `leihhistorie`
 * (`_db/leihen.ts`, Aufgabe V1) wird ueber `ausleihenListe` (V7) gelesen, und keine
 * Oberflaeche des Moduls spricht mehr ueber eine HTTP-Grenze. ⚠️ DAS SCHLIESST 6.7-ABSCHNITT
 * C AUF DER DATENSEITE, NICHT AUF DER FLAECHENSEITE: `software`, `import`, `versionen`,
 * `zugaenge`, das Blatt und der Export-Handler standen damals aus (V17–V22); der hinreichende
 * Beweis ist V23s echter Abruf — ✅ gefahren, ⬜ **V-L3** ist am 2026-08-26 abgelesen
 * (`riegel.test.ts:50-88`). F17 (`.superpowers/sdd/planteil4/VORABSCAN.md:434-449`) nennt sie.
 *
 * ⬜ **V16-L2 — DER ABNAHMEBEFEHL VON 6.7-C IST HEUTE NICHT LEER, UND DAS IST KEIN VERSTOSS.**
 * Gemessen in Aufgabe V16 (2026-08-25): sein zweites Muster trifft NICHTS (Exit 1), sein erstes
 * trifft VIER Zeilen in `_lib/e2eEnv.test.ts` (`:4`, `:67`, `:98`, `:113`) — und alle vier sind
 * derselbe Bezeichner, der Name der e2e-Gruppenkonstante, den `Spec:6800` woertlich vorschreibt.
 * Es ist NICHT der Praefix der Umgebungsvariablen der alten HTTP-Grenze. Der Treffer stammt aus
 * `d11e029e` (Fix-Runde zu V12), nicht aus dieser Flaeche. ⛔ Zwei Spec-Stellen widersprechen
 * sich hier (`Spec:6800` gegen `Spec:5453`); die Aufloesung — Umbenennung der e2e-Konstante ODER
 * ein benannter Ausschluss fuer Testdateien im Abnahmebefehl — gehoert dem **Planhalter**, vor
 * V23. ⚠️ Wer sie hier nachtraegt, schreibt die Zeichenkette selbst hin und macht aus vier
 * Treffern fuenf; deshalb steht sie in diesem Absatz nirgends ausgeschrieben.
 *
 * ⛔ EINE INSEL, EINE GRENZE: alles ab der Filterleiste liegt in `AusleihenTabelle.tsx`.
 * Diese Datei reicht ausschliesslich VORFORMATIERTE, serialisierbare Werte hinueber — keine
 * Funktion, kein `Date` (`Spec:4536-4539`). Die Umrechnung der zwei Kalendertage in
 * Zeitpunkte steht im Vertrag (`_lib/suchparameter.ts`, `tagesGrenzen`) und nicht hier.
 *
 * ⛔ DER FILTER IST EINE BENANNTE ERWEITERUNG UEBER DEN BESTAND HINAUS: Betreiberentscheidung
 * ⬜ **V-L11** vom 2026-08-24 (`.superpowers/sdd/planteil4/progress.md`, Abschnitt „✅ V-L11":
 * „Beides."). Die Alt-Maske hat keinen (`useLoans.ts:18-23` schickt nur `page`/`pageSize`).
 * Die 1:1-Untergrenze bleibt unangetastet — Grundliste, Sortierung und Spalten sind die des
 * Bestands, der Filter kommt HINZU.
 */

/**
 * ⛔ PFLICHT (`Spec:4644-4645`, Vorbild
 * `src/app/m/lagerbuch/verwaltung/(arbeit)/journal/page.tsx:24`). Ohne sie faellt eine Seite
 * mit Suchparametern in Nexts statischen Zweig, und die Liste zeigte den Stand des
 * Bauzeitpunkts — bei gruenem typecheck, lint und build.
 */
export const dynamic = "force-dynamic";

export default async function RadioAusleihenSeite({
  searchParams,
}: {
  searchParams: Promise<RohSuchparameter>;
}) {
  await requireRadioVerwaltung();

  const { werte, parameter } = ausleihenParameterAus(await searchParams);
  const db = getDb();
  const seite = ausleihenListe(db, parameter);
  const geraete = geraeteAuswahl(db);

  return (
    <>
      <h1 className={s.titel}>Ausleihen</h1>
      <AusleihenTabelle
        zeilen={seite.zeilen}
        gesamt={seite.gesamt}
        seite={seite.seite}
        seitenGroesse={seite.seitenGroesse}
        filter={{ geraet: werte.geraet, von: werte.von, bis: werte.bis }}
        geraete={geraete}
      />
    </>
  );
}

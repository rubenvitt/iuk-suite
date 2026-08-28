// src/app/m/radio/admin/(arbeit)/software/page.tsx
import { getDb } from "../../../_db/client";
import { UPDATE_SEITENGROESSE, UPDATE_SUCHFELDER } from "../../../_lib/geraeteFelder";
import { geraeteKennzahlen, updateKarten } from "../../../_lib/lesepfade/geraete";
import { versionenMitGeraetezahl, zielVersion } from "../../../_lib/lesepfade/versionen";
import type { RohSuchparameter } from "../../../_lib/suchparameter";
import { requireRadioVerwaltung } from "../../../_lib/zugang";
import { UpdateSuche } from "./UpdateSuche";

/**
 * DER UPDATE-MODUS — der aeussere Pfad `/admin/software` (Spec §5.6.1, `Spec:4509`;
 * Routenkarte `_lib/routen.ts:62`, Navigation `_lib/nav.ts:68`).
 *
 * ⛔ DER PFAD IST `software/`, NICHT `update/` — B9 (`Spec:98`): Kapitel 1 §1.2.2 gewinnt bei
 * Pfadnamen und Groups. §5.6.1s Insel-Tabelle (`Spec:4509`) traegt noch den alten Namen und
 * ist ueberholt.
 *
 * ⛔ ERSTE ANWEISUNG: `await requireRadioVerwaltung()` (`Spec:4374`). Sie ist KEINE Redundanz
 * zum Riegel in `admin/(arbeit)/layout.tsx`: Route-Group-Grenzen sind keine Sicherheitsgrenzen
 * (`Spec:569-571`), und `requiresAuth: false` heisst NULL Middleware-Gating fuer
 * `/m/radio/admin/*` (`src/core/routing.ts:68-76`). ⛔ KEIN `requireRadioHost(` DANEBEN:
 * `Spec:4369-4378` gibt jeder der zehn Seiten GENAU EINE erste Anweisung; den Host haelt das
 * Group-Layout und zusaetzlich der werfende Riegel selbst (`_lib/zugang.ts`, `riegelAufStufe`).
 *
 * ⛔ DIE VERWALTUNGS-STUFE, NICHT DIE ADMIN-STUFE — und dies ist die Flaeche, um deretwillen es
 * die zweite Stufe ueberhaupt gibt: die Rechtetafel fuehrt „Update-Modus (`softwareVersion`,
 * `lastUpdatedAt`, `status`) | ja | ja" (`Spec:4444-4454`), und genau diese drei Felder sind
 * `UPDATER_FELDER` (`radio-admin/shared/src/editable-fields.ts:3`, in der Suite
 * `_lib/rollen.ts:79`). `riegel.test.ts` faengt eine faelschlich ANGEHOBENE Seite im
 * `(arbeit)`-Zweig strukturell nicht — die ODER-Klausel dort laesst beide Namen zu
 * (`riegel.test.ts:253-262`); der namentliche Waechter steht in `UpdateSuche.test.tsx`
 * („die Seite traegt force-dynamic und den Riegel der Verwaltungs-Stufe").
 *
 * ⛔ **ENTSCHEIDUNG E-V17 — REGIME B, UND SIE IST EINE BENANNTE ABWEICHUNG VON `Spec:4509`.**
 * Die Spec fuehrt fuer Insel 7 genau vier Props, und keiner davon kann ein Geraet aufnehmen,
 * waehrend dieselbe Stelle „Suche auf drei Feldern", „`pageSize: 25`" und „je Geraet eine
 * Karte" verlangt (Vorabscan-Fund F4, `.superpowers/sdd/planteil4/VORABSCAN.md:158-196`, der
 * die hier gebaute Fassung ausdruecklich vorschlaegt). Die Insel bekommt deshalb `zeilen` und
 * `suchtext` dazu; der Suchtext steht in der ADRESSZEILE, die Insel entprellt ihn 300 ms und
 * schreibt ihn, und diese Seite liest ihn. Dieselbe Bauform wie `/admin/geraete` (V13).
 *
 * ⛔ OHNE SUCHTEXT WIRD NICHTS GELADEN — „Kein Vorab-Laden der ganzen Liste", 1:1 aus
 * `UpdateMode.tsx:14`, `:67` (`q` bleibt `undefined`, und die Flaeche zeigt bei `!q` den
 * Leertext). ⛔ IN REGIME B IST DAS EINE SERVERSEITIGE AUSSAGE: liefe `updateKarten`
 * unbedingt, stiesse jeder Aufruf von `/admin/software` eine ungefilterte Abfrage ueber
 * `devices` an, und der Leerzweig der Insel verbaege nur die Anzeige. Der Waechter ist der
 * Fall „die Seite laedt ohne Suchtext gar nichts" in `UpdateSuche.test.tsx`.
 *
 * ⛔ DIE ZWEI 1:1-ZAHLEN WERDEN GELESEN, NICHT ABGESCHRIEBEN (`UPDATE_SUCHFELDER`,
 * `UPDATE_SEITENGROESSE` in `_lib/geraeteFelder.ts`). Eine zweite Abschrift hier waere die
 * Stelle, an der eine vierte Spalte nur an einer von beiden ankommt.
 *
 * ⛔ DER FORTSCHRITT BLEIBT AUF DIESER FLAECHE — „Weitere Auswertungen entstehen nicht"
 * (`Spec:4793-4794`). `gesamt` und `aufZiel` kommen aus EINER Abfrage mit `GROUP BY`
 * (`geraeteKennzahlen`, `_lib/lesepfade/geraete.ts:678`) und nicht aus zwei Rundlaeufen mit
 * `pageSize: 1`, wie es der Bestand tat (`UpdateMode.tsx:30-33`; `Spec:4780-4784` nennt den
 * Grund: „Die vier Rundlaeufe waren eine Folge der HTTP-Grenze, nicht der Fachlichkeit").
 * ⚠️ `aufZiel` IST `geraeteKennzahlen.aktuell` — derselbe SQL-Ausdruck, den der Bestand als
 * `updateStatus: 'aktuell'` abfragte (`UpdateMode.tsx:31`), und dieselbe eine Quelle, aus der
 * auch die Uebersicht rechnet (E-V8).
 *
 * ⛔ EINE INSEL, EINE GRENZE: alles ab der Ueberschrift liegt in `UpdateSuche.tsx`. Diese Datei
 * reicht ausschliesslich VORFORMATIERTE, serialisierbare Werte hinueber — keine Funktion, kein
 * `Date` (`Spec:4536-4539`); die zwei Actions importiert die Insel DIREKT
 * (Bauform-Zulaessigkeitstafel Nr. 6).
 */

/**
 * ⛔ PFLICHT (`Spec:4644-4645`, Vorbild
 * `src/app/m/lagerbuch/verwaltung/(arbeit)/journal/page.tsx:24`). Ohne sie faellt eine Seite
 * mit Suchparametern in Nexts statischen Zweig, und die Flaeche zeigte den Stand des
 * Bauzeitpunkts — bei gruenem typecheck, lint und build.
 */
export const dynamic = "force-dynamic";

export default async function RadioSoftwareSeite({
  searchParams,
}: {
  searchParams: Promise<RohSuchparameter>;
}) {
  await requireRadioVerwaltung();

  const roh = (await searchParams).q;
  /* Ein mehrfach gesetzter Parameter kommt als Feld — dieselbe Faltung wie in
     `geraeteParameterAus` (`_lib/suchparameter.ts:196`). */
  const suchtext = (Array.isArray(roh) ? roh[0] : roh)?.trim() ?? "";

  const db = getDb();
  const zeilen =
    suchtext === ""
      ? []
      : updateKarten(db, {
          q: suchtext,
          suchfelder: [...UPDATE_SUCHFELDER],
          seite: 1,
          seitenGroesse: UPDATE_SEITENGROESSE,
        });
  const kennzahlen = geraeteKennzahlen(db);
  /*
   * ⛔ DIE LISTE ENTSTEHT HIER UND NICHT IN DER PROP-KLAMMER. Der Grund ist gemessen, nicht
   * kosmetisch: der Fall „die Seite reicht KEINE Funktion … ueber die Grenze" in
   * `UpdateSuche.test.tsx` liest den Quelltext und faerbt JEDE Pfeilfunktion innerhalb einer
   * Prop-Klammer rot — auch eine, die nur eine Zeichenkettenliste baut. Das ist richtig so:
   * ein Scan, der zwischen „Pfeil, der einen Wert erzeugt" und „Pfeil, der als Wert
   * hinuebergeht" unterscheiden wollte, muesste JSX parsen und waere damit die weichere Form.
   */
  const versionen = versionenMitGeraetezahl(db).map((v) => v.wert);

  return (
    <UpdateSuche
      versionen={versionen}
      zielVersion={zielVersion(db)}
      gesamt={kennzahlen.gesamt}
      aufZiel={kennzahlen.aktuell}
      zeilen={zeilen}
      suchtext={suchtext}
    />
  );
}

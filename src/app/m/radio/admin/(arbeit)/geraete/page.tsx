// src/app/m/radio/admin/(arbeit)/geraete/page.tsx
import { getDb } from "../../../_db/client";
import { geraeteListe, vorschlaege } from "../../../_lib/lesepfade/geraete";
import { geraeteParameterAus, type RohSuchparameter } from "../../../_lib/suchparameter";
import { requireRadioVerwaltung } from "../../../_lib/zugang";
import s from "../../../_ui/verwaltung.module.css";
import { GeraeteTabelle } from "./GeraeteTabelle";

/**
 * DIE GERAETELISTE — der aeussere Pfad `/admin/geraete` (Spec §5.6, `Spec:4490-4553`;
 * Routenkarte `_lib/routen.ts:57`).
 *
 * ⛔ ERSTE ANWEISUNG: `await requireRadioVerwaltung()` (`Spec:4370`). Sie ist KEINE
 * Redundanz zum Riegel in `admin/(arbeit)/layout.tsx`: Route-Group-Grenzen sind keine
 * Sicherheitsgrenzen (`Spec:569-571`), und `requiresAuth: false` heisst NULL
 * Middleware-Gating fuer `/m/radio/admin/*` (`src/core/routing.ts:68-76`). ⛔ KEIN
 * `requireRadioHost(` DANEBEN: `Spec:4369-4378` gibt jeder der zehn Seiten GENAU EINE erste
 * Anweisung; den Host haelt das Group-Layout und zusaetzlich der werfende Riegel selbst.
 *
 * ⛔ DIE VERWALTUNGS-STUFE, NICHT DIE ADMIN-STUFE (`Spec:4370`): die Geraeteliste ist eine
 * der sieben Flaechen, die auch eine Updater-Person sieht (`Spec:4444-4454`). `riegel.test.ts`
 * faengt eine faelschlich ANGEHOBENE Seite im `(arbeit)`-Zweig strukturell nicht — die
 * ODER-Klausel dort laesst beide Namen zu (`riegel.test.ts:253-262`). Der namentliche
 * Waechter dagegen steht in `GeraeteTabelle.test.tsx`
 * („die Seite traegt force-dynamic und den Riegel der Verwaltungs-Stufe").
 *
 * ⛔ `darfAnlegen`/`darfExportieren` KOMMEN AUS DER `rolle`, DIE DER RIEGEL MITLIEFERT
 * (`_lib/zugang.ts:485`, `:501`) — NICHT aus einem zweiten `istRadioAdmin(viewer)`.
 * Vorabscan-Fund F18 (`.superpowers/sdd/planteil4/VORABSCAN.md:453-464`): eine zweite
 * Ableitung derselben Aussage ist die, die auseinanderlaeuft.
 * ⛔ UND SIE SIND EINE ANZEIGE-ENTSCHEIDUNG, KEINE SPERRE — die Sperre ist
 * `requireRadioAdmin()` als erste Anweisung von `geraetAnlegenAction`
 * (`admin/actions.ts:447`) und der eigene Riegel von `geraete/export/route.ts` (V22).
 *
 * ⛔ EINE INSEL, EINE GRENZE (Entscheidung E-V6): alles ab der Werkzeugleiste liegt in
 * `GeraeteTabelle.tsx`. Diese Datei reicht ausschliesslich VORFORMATIERTE, serialisierbare
 * Werte hinueber — keine Funktion, kein `Date` (`Spec:4536-4539`).
 */

/**
 * ⛔ PFLICHT (`Spec:4644-4645`, Vorbild
 * `src/app/m/lagerbuch/verwaltung/(arbeit)/journal/page.tsx:24`). Ohne sie faellt eine Seite
 * mit Suchparametern in Nexts statischen Zweig, und die Liste zeigte den Stand des
 * Bauzeitpunkts — bei gruenem typecheck, lint und build.
 */
export const dynamic = "force-dynamic";

export default async function RadioGeraeteSeite({
  searchParams,
}: {
  searchParams: Promise<RohSuchparameter>;
}) {
  const { rolle } = await requireRadioVerwaltung();

  const { werte, filter } = geraeteParameterAus(await searchParams);
  const db = getDb();
  const seite = geraeteListe(db, filter);
  const felderVorschlaege = vorschlaege(db);

  const istAdmin = rolle === "admin";

  return (
    <>
      <h1 className={s.titel}>Geräte</h1>
      <GeraeteTabelle
        zeilen={seite.zeilen}
        gesamt={seite.gesamt}
        seite={seite.seite}
        seitenGroesse={seite.seitenGroesse}
        sortierung={werte.sortierung || null}
        filter={werte.filter}
        suchtext={werte.q}
        suchfelder={werte.sf}
        vorschlaege={felderVorschlaege}
        darfAnlegen={istAdmin}
        darfExportieren={istAdmin}
      />
    </>
  );
}

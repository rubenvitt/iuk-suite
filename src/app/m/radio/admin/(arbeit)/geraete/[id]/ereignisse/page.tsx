// src/app/m/radio/admin/(arbeit)/geraete/[id]/ereignisse/page.tsx
import Link from "next/link";
import { notFound } from "next/navigation";
import { getDb } from "../../../../../_db/client";
import { ereignisseFuerGeraet } from "../../../../../_lib/lesepfade/ereignisse";
import { geraet } from "../../../../../_lib/lesepfade/geraete";
import { requireRadioVerwaltung } from "../../../../../_lib/zugang";
import s from "../../../../../_ui/verwaltung.module.css";
import { VIkone } from "../../../../../_ui/verwaltungIkonen";
import { EreignisTabelle } from "./EreignisTabelle";

/**
 * DIE AENDERUNGSHISTORIE EINES GERAETS — der aeussere Pfad
 * `/admin/geraete/[id]/ereignisse` (Spec §5.10, `Spec:4759-4776`; Routenkarte
 * `_lib/routen.ts:59`).
 *
 * ⛔ ERSTE ANWEISUNG: `await requireRadioVerwaltung()` (`Spec:4372`). Sie ist KEINE
 * Redundanz zum Riegel in `admin/(arbeit)/layout.tsx`: Route-Group-Grenzen sind keine
 * Sicherheitsgrenzen (`Spec:569-571`), und `requiresAuth: false` heisst NULL
 * Middleware-Gating fuer `/m/radio/admin/*` (`src/core/routing.ts:68-76` gatet nach dem
 * Modul aus dem Segment und unterscheidet `/m/radio/` und `/m/radio/admin/...` nicht).
 * ⛔ KEIN `requireRadioHost(` DANEBEN: `Spec:4369-4378` gibt jeder der zehn Seiten GENAU
 * EINE erste Anweisung; den Host haelt das Group-Layout und zusaetzlich der werfende Riegel
 * selbst (`_lib/zugang.ts`, `riegelAufStufe`).
 *
 * ⛔ DIE VERWALTUNGS-STUFE, NICHT DIE ADMIN-STUFE (`Spec:4372`): die Rechtetafel fuehrt
 * „Uebersicht, Geraeteliste, Geraetedetail, Ereignisse, Ausleihen | ja | ja"
 * (`Spec:4444-4454`). `riegel.test.ts` faengt eine faelschlich ANGEHOBENE Seite im
 * `(arbeit)`-Zweig strukturell nicht — die ODER-Klausel dort laesst beide Namen zu
 * (`riegel.test.ts:253-262`); der namentliche Waechter steht in `EreignisTabelle.test.tsx`
 * („die Seite traegt den Riegel der Verwaltungs-Stufe und antwortet mit notFound").
 *
 * ⛔ SIE IST NEU UND AUSDRUECKLICH KEIN 1:1-PORT (`Spec:4759-4765`): der Alt-Endpunkt
 * `GET /devices/:id/events` (`radio-admin/server/src/routes/devices.ts:66-80`) hat gemessen
 * keinen Konsumenten. Sie entsteht, weil Kapitel 4 `device_events` als Historie importiert
 * und „eine importierte Tabelle, die niemand lesen kann, ein Datenfriedhof mit
 * Wartungskosten" ist.
 *
 * ⛔ DIE GRENZE 200 STEHT IM LESEPFAD, NICHT HIER (`_lib/lesepfade/ereignisse.ts`,
 * `EREIGNIS_GRENZE`). Sie ist ⬜ **V-L7** — der Alt-Leser hat gar keinen Deckel
 * (`radio-admin/server/src/repos/deviceRepo.ts:248-254`), die 200 sind eine Neuerung dieses
 * Ports und werden bei der Generalprobe abgelesen
 * (`.superpowers/sdd/planteil4/progress.md`, Zeile V-L7). Schriebe diese Seite die Zahl ein
 * zweites Mal hin, korrigierte die Ablesung nur eine von beiden.
 *
 * ⛔ EINE INSEL, UND SIE BEKOMMT NUR `zeilen` (`Spec:4507`): vier Spalten mit `render` sind
 * **Falle 9** (Bauform-Zulaessigkeitstafel Nr. 1). Diese Datei reicht ausschliesslich
 * VORFORMATIERTE, serialisierbare Werte hinueber — keine Funktion, kein `Date`
 * (`Spec:4536-4539`).
 *
 * ⛔ KEIN `Tabs` UND KEIN REITER (`Spec:4774-4776`): der Weg hierher ist ein Textlink auf
 * der Geraeteakte, „weil `Tabs` eine Insel erzwingen wuerde, die die Detailseite sonst nicht
 * braucht" — und `Tabs` waere in einer Server Component ausserdem Falle 1.
 *
 * ⚠️ BENANNTE ERWEITERUNG UEBER `Spec:4759-4776` HINAUS: DER RUECKWEG. Die Flaeche haengt an
 * KEINEM Navigationseintrag (`_lib/nav.ts` fuehrt sie nicht) und ist allein ueber die Akte
 * erreichbar; ohne Rueckweg endete der Weg hier. Der Link traegt die AEUSSERE Pfadform
 * `/admin/...` — ein innerer Pfad fuehrte auf dem Verwaltungshost auf `/m/radio/m/radio/...`
 * und damit auf einen 404, bei gruenem typecheck und lint (`_lib/nav.test.ts:134-152`).
 */

/**
 * ⛔ PFLICHT, AUS DEMSELBEN GRUND WIE AUF DER AKTE (`Spec:4644-4645`, Vorbild
 * `src/app/m/lagerbuch/verwaltung/(arbeit)/journal/page.tsx:24`; dieselbe Zeile traegt
 * `admin/(arbeit)/geraete/[id]/page.tsx`). Ohne sie faellt eine Seite mit dynamischem
 * Segment in Nexts statischen Zweig, und die Historie zeigte den Stand des Bauzeitpunkts —
 * bei gruenem typecheck, lint und build.
 */
export const dynamic = "force-dynamic";

export default async function RadioGeraetEreignissePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requireRadioVerwaltung();

  const { id } = await params;
  const db = getDb();
  const akte = geraet(db, id);
  /*
   * ⛔ EIN GERAET, DAS ES NICHT GIBT, IST `notFound()` UND KEINE FEHLERSEITE — 1:1 der
   * Alt-Handler, der fuer ein unbekanntes Geraet mit 404 antwortet, BEVOR er die Ereignisse
   * liest (`radio-admin/server/src/routes/devices.ts:68`, `:84`).
   *
   * ⚠️ UND SIE STEHT HIER, WEIL DER LESEPFAD SIE BEWUSST NICHT FUEHRT: `ereignisseFuerGeraet`
   * prueft die Existenz nicht, „hier ist der Aufrufer die Server Component aus V15, die das
   * Geraet ohnehin schon geladen hat" (`_lib/lesepfade/ereignisse.ts`, Kopf der Funktion).
   * Ohne diese Zeile antwortete eine erfundene Id mit einer leeren Historie statt mit 404.
   */
  if (akte === null) notFound();

  const zeilen = ereignisseFuerGeraet(db, id);

  /*
   * Der Titel 1:1 wie auf der Akte (`geraete/[id]/page.tsx`, aus
   * `DeviceDetailDrawer.tsx:61`) — die Rueckfallkette mit `||` und nicht mit `??`, weil beide
   * Spalten Freitext sind und die LEERE Zeichenkette weiterfallen soll.
   */
  const titel = `${akte.rufname || akte.opta || akte.issi} (${akte.issi})`;

  return (
    <>
      <h1 className={s.titel}>Änderungen: {titel}</h1>

      {/*
        Der Pfeil am Rueckweg — `_ui/verwaltungIkonen.tsx`. ⛔ `.zurueckLink` steht im Blatt und
        nicht inline: Zeichen und Wort brauchen `inline-flex` samt Abstand, sonst sitzt das
        Zeichen auf der Grundlinie und klebt am Wort (`_ui/verwaltung.module.css`).
      */}
      <p className={s.abstand}>
        <Link href={`/admin/geraete/${akte.id}`} className={s.zurueckLink}>
          <VIkone name="pfeil-links" />
          Zurück zum Gerät
        </Link>
      </p>

      <div className={s.abstand}>
        <EreignisTabelle zeilen={zeilen} />
      </div>
    </>
  );
}

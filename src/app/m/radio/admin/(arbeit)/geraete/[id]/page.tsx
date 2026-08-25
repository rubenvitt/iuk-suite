// src/app/m/radio/admin/(arbeit)/geraete/[id]/page.tsx
import type { ReactNode } from "react";
import { notFound } from "next/navigation";
import { Tag } from "antd";
import { getDb } from "../../../../_db/client";
import { offeneLeiheZuGeraet } from "../../../../_db/leihen";
import { geraet, geraetFormWerte, vorschlaege } from "../../../../_lib/lesepfade/geraete";
import { versionenMitGeraetezahl } from "../../../../_lib/lesepfade/versionen";
import { requireRadioVerwaltung } from "../../../../_lib/zugang";
import s from "../../../../_ui/verwaltung.module.css";
import { GeraetFormular } from "./GeraetFormular";
import { GeraetLoeschen } from "./GeraetLoeschen";
import { NotizFeld } from "./NotizFeld";

/**
 * DIE GERAETEAKTE — der aeussere Pfad `/admin/geraete/[id]` (Spec §5.7; Routenkarte
 * `_lib/routen.ts:58`). Nachfolger von `DeviceDetailDrawer.tsx`.
 *
 * ⛔ ERSTE ANWEISUNG: `await requireRadioVerwaltung()` (`Spec:4371`). Sie ist KEINE Redundanz
 * zum Riegel in `admin/(arbeit)/layout.tsx`: Route-Group-Grenzen sind keine Sicherheitsgrenzen
 * (`Spec:569-571`), und `requiresAuth: false` heisst NULL Middleware-Gating fuer
 * `/m/radio/admin/*` (`src/core/routing.ts:68-76`). ⛔ KEIN `requireRadioHost(` DANEBEN:
 * `Spec:4369-4378` gibt jeder der zehn Seiten GENAU EINE erste Anweisung; den Host haelt das
 * Group-Layout und zusaetzlich der werfende Riegel selbst.
 *
 * ⛔ DIE VERWALTUNGS-STUFE, NICHT DIE ADMIN-STUFE (`Spec:4371`): die Akte ist eine der
 * Flaechen, die auch eine Updater-Person sieht (`Spec:4444-4454`) — sie pflegt hier
 * `softwareVersion`, `lastUpdatedAt` und `status`. `riegel.test.ts` faengt eine faelschlich
 * ANGEHOBENE Seite im `(arbeit)`-Zweig strukturell nicht (die ODER-Klausel laesst beide Namen
 * zu, `riegel.test.ts:253-262`); der namentliche Waechter steht in `GeraetFormular.test.tsx`
 * („die Seite traegt den Riegel der Verwaltungs-Stufe und antwortet mit notFound").
 *
 * ⛔ AUS DEM DRAWER WIRD EINE SEITE (`Spec:4183-4186`): `/devices/:id` war laut
 * `radio-admin/client/src/router.tsx:26` schon im Bestand eine eigene Route.
 *
 * ⛔ DIE KOPFDATEN SIND SCHLICHTES MARKUP, KEIN `Descriptions.Item` (Falle 1,
 * Bauform-Zulaessigkeitstafel Nr. 3): Compound-Zugriff in einer Server Component ist HTTP 500.
 * Eine Insel nur fuer fuenf Lesefelder waere Ballast. ⛔ `Tag` DAGEGEN IST SICHER
 * (`CLAUDE.md:13`) — als BAUTEIL, nicht in einer `render`-Funktion.
 *
 * ⛔ DREI NEBENEINANDERLIEGENDE INSELN (Entscheidung **E-V6**): Formular, Notizfeld und
 * Loeschflaeche teilen keinen Zustand. Diese Datei reicht ausschliesslich VORFORMATIERTE,
 * serialisierbare Werte hinueber — keine Funktion, kein `Date` (`Spec:4536-4539`).
 *
 * ⚠️ DIE ZWEI BESCHRIFTUNGEN, DIE SICH VERWECHSELN LASSEN, und `_lib/lesepfade/geraete.ts`
 * schreibt die Zuordnung fuer genau diese Anzeige aus: „Zuletzt aktualisiert" ist der
 * gepflegte Update-Tag (`letztesUpdateText`, dort ist der Gedankenstrich richtig), „Geändert"
 * der Zeitpunkt der letzten Datensatzaenderung (`zuletztAktualisiertText`). Wer sie nach ihren
 * NAMEN bindet, vertauscht beide Zeilen auf einmal, und kein Tor faellt.
 */

/**
 * ⛔ PFLICHT (`Spec:4644-4645`, Vorbild
 * `src/app/m/lagerbuch/verwaltung/(arbeit)/journal/page.tsx:24`). Ohne sie faellt eine Seite mit
 * dynamischem Segment in Nexts statischen Zweig, und die Akte zeigte den Stand des
 * Bauzeitpunkts — bei gruenem typecheck, lint und build.
 */
export const dynamic = "force-dynamic";

/**
 * Die Hiorg-ID als Link, WENN der Wert wie eine Adresse aussieht, sonst als Text — 1:1 aus
 * `DeviceDetailDrawer.tsx:28-40`, inklusive `target="_blank" rel="noreferrer"`.
 *
 * ⛔ DIE PRUEFUNG IST `startsWith`, NICHT EINE URL-ERKENNUNG: der Bestand traegt in dieser
 * Spalte auch blosse Nummern, und ein `new URL(...)`-Versuch machte daraus entweder einen
 * toten Link oder einen Absturz.
 */
function HiorgWert({ wert }: { wert: string | null }) {
  if (!wert) return <>—</>;
  if (wert.startsWith("http://") || wert.startsWith("https://")) {
    return (
      <a href={wert} target="_blank" rel="noreferrer">
        {wert}
      </a>
    );
  }
  return <>{wert}</>;
}

/** Eine Kopfzeile: Etikett links, Wert rechts. Der Ersatz fuer `Descriptions.Item`. */
function KopfZeile({ etikett, children }: { etikett: string; children: ReactNode }) {
  return (
    <div className={s.kopfZeile} data-rolle="radio-kopfzeile" data-etikett={etikett}>
      <span className={s.kopfEtikett}>{etikett}</span>
      <span className={s.kopfWert}>{children}</span>
    </div>
  );
}

export default async function RadioGeraetAktePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { rolle } = await requireRadioVerwaltung();

  const { id } = await params;
  const db = getDb();
  const akte = geraet(db, id);
  const formWerte = geraetFormWerte(db, id);
  /*
   * ⛔ EIN GERAET, DAS ES NICHT GIBT, IST `notFound()` UND KEINE FEHLERSEITE
   * (`radio-admin/server/src/routes/devices.ts:84`; der Alt-Drawer zeigte dafuer ein
   * `Result status="404"`, `DeviceDetailDrawer.tsx:71` — auf einer eigenen Seite ist der
   * 404 der Statuscode selbst).
   *
   * ⚠️ ZWEI ABFRAGEN, EINE PRUEFUNG: `geraet` liefert die aufgeloesten Namen und die
   * vorformatierten Zeitpunkte, `geraetFormWerte` die Rohwerte des Formulars
   * (`_lib/lesepfade/geraete.ts`, Kopf der Funktion). Zwischen ihnen kann die Zeile nicht
   * verschwinden — better-sqlite3 ist synchron und einverbindungsgebunden —, aber der Typ
   * verlangt die Pruefung, und eine erfundene Nicht-Null-Zusicherung waere die schlechtere
   * Antwort.
   */
  if (akte === null || formWerte === null) notFound();

  const felderVorschlaege = vorschlaege(db);
  const versionen = versionenMitGeraetezahl(db).map((zeile) => zeile.wert);
  const offeneLeihe = offeneLeiheZuGeraet(db, id);

  const istAdmin = rolle === "admin";

  /*
   * Der Titel 1:1 aus `DeviceDetailDrawer.tsx:61` — die Rueckfallkette mit `||` und nicht mit
   * `??`, weil beide Spalten Freitext sind und die LEERE Zeichenkette weiterfallen soll, plus
   * die ISSI in Klammern.
   */
  const titel = `${akte.rufname || akte.opta || akte.issi} (${akte.issi})`;

  return (
    <>
      <h1 className={s.titel}>{titel}</h1>

      {/* Die fuenf Alt-Felder aus `DeviceDetailDrawer.tsx:77-102`, in dieser Reihenfolge. */}
      <div className={s.kopfListe}>
        <KopfZeile etikett="Hiorg-ID">
          <HiorgWert wert={akte.hiorgId} />
        </KopfZeile>
        <KopfZeile etikett="Ausleihbar">
          {/* 1:1 `DeviceDetailDrawer.tsx:81-85`: gruen bei ja, Vorgabeton bei nein. */}
          <Tag color={akte.ausleihbar ? "green" : "default"}>
            {akte.ausleihbar ? "Ja" : "Nein"}
          </Tag>
        </KopfZeile>
        <KopfZeile etikett="Zuletzt aktualisiert">{akte.letztesUpdateText}</KopfZeile>
        <KopfZeile etikett="Geändert">
          {/*
            1:1 `DeviceDetailDrawer.tsx:89-94`: der Zeitpunkt, und NUR wenn ein Name oder ein
            roher `sub` bekannt ist, dahinter „ · <Name>". Der Rueckfall auf den rohen `sub`
            steckt bereits in `geaendertVonName` (`_lib/lesepfade/geraete.ts:566-591`).
          */}
          {akte.zuletztAktualisiertText}
          {akte.geaendertVonName ? ` · ${akte.geaendertVonName}` : ""}
        </KopfZeile>
        {/* ⛔ NUR WENN GESETZT (`DeviceDetailDrawer.tsx:95-101`). */}
        {akte.updateAnmerkung && (
          <KopfZeile etikett="Abweichung">
            {/*
              ⚠️ BENANNTE ABWEICHUNG: der Bestand setzt hier ein `<FiAlertTriangle>` in den
              `Tag` (`:97`). Die eine Zeichenquelle des Moduls ist `_ui/ikonen.tsx`
              (Entscheidung E-V7, NS-A8b) und auf ZWOELF Namen festgenagelt
              (`_ui/ikonen.test.tsx:108`); das Warndreieck ist dort ausdruecklich gestrichen
              (`_ui/ikonen.tsx:44-52`). Das Wort traegt die Aussage. Dieselbe Entscheidung wie
              in der Abweichungsspalte der Liste (`GeraeteTabelle.tsx`).
            */}
            <Tag color="warning">gemeldet</Tag>
          </KopfZeile>
        )}
      </div>

      {/*
        ⬜ HIER FEHLT DER TEXTLINK „Änderungen anzeigen" AUF `/admin/geraete/<id>/ereignisse`
        (`Spec:4767-4776`) — ⛔ KEIN REITER, „weil `Tabs` eine Insel erzwingen wuerde, die die
        Detailseite sonst nicht braucht".
        ⛔ EIGENTUEMER IST **V15**, NICHT DIESE AUFGABE: die Zielseite entsteht dort, und ⛔ ein
        Link auf eine 404 ist schlimmer als kein Link (`qr/layout.tsx:16-18`,
        `briefs/V14.md:33-36`). V15 setzt ihn an diese Stelle, im selben Commit wie die Seite.
      */}

      <div className={s.abstand}>
        <GeraetFormular
          geraet={formWerte}
          rolle={rolle}
          vorschlaege={felderVorschlaege}
          versionen={versionen}
        />
      </div>

      <div className={s.abstand}>
        <NotizFeld geraetId={akte.id} anmerkung={akte.updateAnmerkung} rolle={rolle} />
      </div>

      {/*
        ⛔ NUR FUER DIE ADMIN-STUFE, 1:1 aus `DeviceDetailDrawer.tsx:111` (`{isAdmin && …}`).
        Die Rechtetafel fuehrt „Geraet anlegen / loeschen | ja | nein" (`Spec:4444-4454`); die
        SPERRE ist `requireRadioAdmin()` in `geraetLoeschenAction`, dies ist die Anzeige.
        ⛔ `rolle` KOMMT VOM RIEGEL (`_lib/zugang.ts`), NICHT AUS EINEM ZWEITEN
        `istRadioAdmin(viewer)` — Vorabscan-Fund F18: eine zweite Ableitung derselben Aussage
        ist die, die auseinanderlaeuft.
      */}
      {istAdmin && (
        <GeraetLoeschen
          geraetId={akte.id}
          offeneLeiheEntleiher={offeneLeihe?.entleiher ?? null}
        />
      )}
    </>
  );
}

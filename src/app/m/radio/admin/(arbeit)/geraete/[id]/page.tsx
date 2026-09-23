// src/app/m/radio/admin/(arbeit)/geraete/[id]/page.tsx
import Link from "next/link";
import { notFound } from "next/navigation";
import { Card, Tag } from "antd";
import { getDb } from "../../../../_db/client";
import { offeneLeiheZuGeraet } from "../../../../_db/leihen";
import { STAND_TON, STAND_WORT } from "../../../../_lib/geraeteFelder";
import { geraetTitel } from "../../../../_lib/geraetTitel";
import { geraet, geraetFormWerte, vorschlaege } from "../../../../_lib/lesepfade/geraete";
import { versionenMitGeraetezahl } from "../../../../_lib/lesepfade/versionen";
import { requireRadioVerwaltung } from "../../../../_lib/zugang";
import s from "../../../../_ui/verwaltung.module.css";
import { VIkone } from "../../../../_ui/verwaltungIkonen";
import { GeraetFormular } from "./GeraetFormular";
import { GeraetLoeschen } from "./GeraetLoeschen";
import { NotizFeld } from "./NotizFeld";

/**
 * DIE GERAETEAKTE — der aeussere Pfad `/admin/geraete/[id]` (Spec §5.7; Routenkarte
 * `_lib/routen.ts`, Eintrag `geraeteAkte`). Nachfolger von `DeviceDetailDrawer.tsx`.
 *
 * ⛔ ERSTE ANWEISUNG: `await requireRadioVerwaltung()` (`Spec:4371`). Sie ist KEINE Redundanz
 * zum Riegel in `admin/(arbeit)/layout.tsx`: Route-Group-Grenzen sind keine Sicherheitsgrenzen
 * (`Spec:569-571`), und `requiresAuth: false` heisst NULL Middleware-Gating fuer
 * `/m/radio/admin/*` (`src/core/routing.ts`, der `radio`-Zweig). ⛔ KEIN `requireRadioHost(`
 * DANEBEN: `Spec:4369-4378` gibt jeder der zehn Seiten GENAU EINE erste Anweisung; den Host
 * haelt das Group-Layout und zusaetzlich der werfende Riegel selbst.
 *
 * ⛔ DIE VERWALTUNGS-STUFE, NICHT DIE ADMIN-STUFE (`Spec:4371`): die Akte ist eine der
 * Flaechen, die auch eine Updater-Person sieht (`Spec:4444-4454`) — sie pflegt hier
 * `softwareVersion`, `lastUpdatedAt` und `status`. `riegel.test.ts` faengt eine faelschlich
 * ANGEHOBENE Seite im `(arbeit)`-Zweig strukturell nicht (die ODER-Klausel laesst beide Namen
 * zu); der namentliche Waechter steht in `GeraetFormular.test.tsx` („die Seite traegt den
 * Riegel der Verwaltungs-Stufe und antwortet mit notFound").
 *
 * ⛔ AUS DEM DRAWER WIRD EINE SEITE (`Spec:4183-4186`): `/devices/:id` war laut
 * `radio-admin/client/src/router.tsx:26` schon im Bestand eine eigene Route.
 *
 * ⛔ DER SEITENKOPF IST SCHLICHTES MARKUP, KEIN `Descriptions.Item` (Falle 1,
 * Bauform-Zulaessigkeitstafel Nr. 3): Compound-Zugriff in einer Server Component ist HTTP 500.
 * ⛔ `Tag` UND `Card` DAGEGEN SIND SICHER (`CLAUDE.md`, Falle 1) — als BAUTEIL, nicht in einer
 * `render`-Funktion.
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
 * `src/app/m/lagerbuch/verwaltung/(arbeit)/journal/page.tsx`, dieselbe Zeile ueber `export
 * default`). Ohne sie faellt eine Seite mit dynamischem Segment in Nexts statischen Zweig, und
 * die Akte zeigte den Stand des Bauzeitpunkts — bei gruenem typecheck, lint und build.
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
   * Der Titel aus `_lib/geraetTitel.ts` — dieselbe Ableitung wie die Aenderungshistorie
   * (DRK-455), die Rueckfallkette Rufname → OPTA → ISSI 1:1 aus `DeviceDetailDrawer.tsx:61`.
   *
   * ⛔ DIE ISSI STEHT SEIT DRK-462 NICHT MEHR IN KLAMMERN DAHINTER, SONDERN ALS EIGENE
   * NEBENANGABE — und sie steht dort NUR, wenn der Titel nicht ohnehin die ISSI IST. Ohne die
   * zweite Haelfte truege ein Geraet ganz ohne Rufname und OPTA (der Seed fuehrt eines,
   * `g-8`) seine Nummer zweimal nebeneinander.
   */
  const { titel, issiNeben } = geraetTitel(akte);

  return (
    /*
     * ⛔ DIE AKTE TRAEGT EINEN LESEDECKEL (DRK-454) UND SEIT DRK-462 EINEN SEITENKOPF, DER DEN
     * ZUSTAND DES GERAETS TRAEGT.
     *
     * Betreiberbefund vom 2026-09-22: „ein langweiliges Formular und ziemlich viel Space,
     * sodass das viel Platz für nichts einnimmt." Gemessen im echten Chromium bei 1440x1000
     * gegen `next dev`, nicht vermutet: die Seite war 2359 px hoch bei 1000 px Sichtflaeche,
     * und die Lesekarte oben (190 px) wiederholte DREI Werte, die 400 px weiter unten noch
     * einmal als Formularfeld standen — Hiorg-ID, Ausleihbar, Zuletzt aktualisiert.
     *
     * ⛔ DIE LESEKARTE IST DESHALB WEG, NICHT NUR KLEINER. Was sie trug, verteilt sich auf
     * zwei Stellen, und keine davon doppelt mehr ein Eingabefeld:
     *   * was den ZUSTAND des Geraets sagt (Status, Update-Stand, Ausleihfreigabe, offene
     *     Leihe, gemeldete Abweichung) → als Marken unter den Titel, wo die Frage „wie steht
     *     es um dieses Geraet" beim Aufschlagen beantwortet wird;
     *   * was HERKUNFT ist und nirgends bearbeitet wird (Zeitpunkt und Person der letzten
     *     Aenderung, die Hiorg-ID als Link) → in eine gedaempfte Nebenzeile darunter.
     * Die zwei gepflegten Werte „Ausleihbar" und „Zuletzt aktualisiert" stehen weiterhin
     * genau einmal als Eingabe im Formular; die Marke daneben ist ihre Anzeige, nicht ihre
     * zweite Quelle.
     *
     * ⛔ KEIN `Card.Meta`, KEIN `Card.Grid`: das waere Compound-Zugriff und damit HTTP 500.
     */
    <div className={s.akte}>
      <div className={s.akteKopf}>
        <div className={s.akteKopfText}>
          <h1 className={s.titel}>
            {titel}
            {/*
              ⚠️ IM `<h1>` UND NICHT DANEBEN: die ISSI gehoert zum Namen des Geraets, und eine
              Vorleseanwendung, die nur die Ueberschriften vorliest, verlore sie sonst. Der
              Unterschied ist typografisch, nicht strukturell.
            */}
            {issiNeben !== null && <span className={s.titelIssi}>ISSI {issiNeben}</span>}
          </h1>

          {/*
            DIE ZUSTANDSMARKEN. ⛔ KEINE EIGENE FARBE UND KEIN ROT (Falle 3, `CLAUDE.md`):
            `colorError === colorPrimary` ist hier die Markenfarbe, ein roter Punkt auf einer
            Datenflaeche saehe aus wie eine Primaeraktion. Die Toene sind antds eigene
            (`success`, `warning`, Vorgabe), dieselben wie in der Geraeteliste.
          */}
          <div className={s.akteMarken}>
            {/*
              ⛔ NUR WENN GESETZT: die Spalte ist nullable, und `zuZeile` faltet sie auf die
              LEERE Zeichenkette (`_lib/lesepfade/geraete.ts`, `status: d.status ?? ""`). Eine
              leere Marke waere ein farbiger Fleck ohne Aussage.
            */}
            {akte.status !== "" && <Tag data-rolle="radio-marke-status">{akte.status}</Tag>}
            {/*
              ⛔ DAS `data-rolle` BLEIBT WORTGLEICH `radio-update-stand`: der Stand stand bis
              DRK-462 als Anzeige-Slot IM Formular und traegt dort denselben Griff. Der
              e2e-Fall 3 (`e2e/radio-verwaltung.spec.ts`) haengt daran — ein umbenannter Griff
              waere ein gruener Lauf auf einer Flaeche, die nichts mehr zeigt.
              ⛔ WORT UND TON KOMMEN AUS `_lib/geraeteFelder.ts` UND NICHT AUS DER INSEL: ein
              Import aus `GeraetFormular.tsx` waere Falle 6 (ein `WERT` aus einem
              `"use client"`-Modul kommt in einer Server Component als Client-Referenz an —
              HTTP 500, bei gruenem typecheck, build und Vitest).
            */}
            <Tag color={STAND_TON[akte.updateStand]} data-rolle="radio-update-stand">
              {STAND_WORT[akte.updateStand]}
            </Tag>
            {/* 1:1 `DeviceDetailDrawer.tsx:81-85`: gruen bei ja, Vorgabeton bei nein. */}
            <Tag color={akte.ausleihbar ? "green" : "default"} data-rolle="radio-marke-ausleihbar">
              {akte.ausleihbar ? "Ausleihbar" : "Nicht ausleihbar"}
            </Tag>
            {/*
              ⛔ DIE OFFENE LEIHE IST NEU AUF DIESER FLAECHE (DRK-462) UND KOSTET KEINE ABFRAGE:
              `offeneLeiheZuGeraet` wird unten ohnehin fuer die Loeschwarnung geladen. Bis
              hierhin sagte die Akte NICHT, dass das Geraet gerade draussen ist — man sah es
              erst beim Loeschversuch.
            */}
            {offeneLeihe !== null && (
              <Tag color="processing" data-rolle="radio-marke-verliehen">
                {`Verliehen an ${offeneLeihe.entleiher}`}
              </Tag>
            )}
            {/*
              ⛔ NUR WENN GESETZT (`DeviceDetailDrawer.tsx:95-101`). Das Warndreieck seit dem
              2026-08-28 aus `_ui/verwaltungIkonen.tsx`, der Zeichenquelle des VERWALTUNGSzweigs
              (`_ui/ikonen.tsx` bleibt die der Ausleihflaeche). Dieselbe Marke wie in der
              Abweichungsspalte der Liste (`GeraeteTabelle.tsx`).
              ⚠️ `react-icons/pi` IN EINER SERVER COMPONENT IST GEMESSEN SICHER (`lagerbuch`,
              2026-08-12, echter Abruf); Falle 7 ist `@ant-design/icons`, nicht dies hier.
            */}
            {akte.updateAnmerkung && (
              <Tag color="warning" icon={<VIkone name="warnung" />}>
                Abweichung gemeldet
              </Tag>
            )}
          </div>

          {/*
            DIE HERKUNFTSZEILE — gedaempft und klein, weil sie nie eine Handlung anstoesst.
            ⛔ DIE ZWEI ZEITANGABEN NICHT VERTAUSCHEN (Kopfkommentar dieser Datei):
            `zuletztAktualisiertText` ist der Zeitpunkt der letzten DATENSATZAENDERUNG, und der
            aufgeloeste Name gehoert 1:1 dahinter (`DeviceDetailDrawer.tsx:89-94`). Der
            gepflegte Update-Tag (`letztesUpdateText`) steht NICHT hier — er ist ein Feld des
            Formulars, und genau seine Doppelung war der Befund.
          */}
          <p className={s.akteHerkunft}>
            <span>
              Geändert {akte.zuletztAktualisiertText}
              {akte.geaendertVonName ? ` · ${akte.geaendertVonName}` : ""}
            </span>
            {/*
              ⛔ NUR WENN GESETZT, UND DAS IST DER UNTERSCHIED ZUR ALTEN LESEKARTE: die trug
              „Hiorg-ID —" auch dann, wenn nichts eingetragen war (gemessen an `g-5`). In einer
              Tabelle mit festen Zeilen ist ein Gedankenstrich richtig — er haelt die Spalte;
              in einer FLIESSENDEN Nebenzeile ist er eine Angabe ohne Inhalt.
            */}
            {akte.hiorgId && (
              <>
                <span className={s.akteHerkunftTrenner}>·</span>
                <span>
                  Hiorg-ID <HiorgWert wert={akte.hiorgId} />
                </span>
              </>
            )}
          </p>
        </div>

        {/*
          DER TEXTLINK AUF DIE AENDERUNGSHISTORIE (`Spec:4774-4776`), eingetragen in V15 im
          selben Commit wie die Zielseite — bis dahin stand hier eine ⬜ mit demselben
          Eigentuemer, weil ⛔ ein Link auf eine 404 schlimmer ist als kein Link
          (`qr/layout.tsx:16-18`).
          ⛔ SEIT DRK-454 IM SEITENKOPF UND NICHT MEHR IM FLUSS: er stand als eigener Absatz
          zwischen Kopfdaten und Formular — in der Markenfarbe, die in dieser Suite zugleich
          `colorError` ist (Falle 3). Ein freistehender roter Satz mitten auf einer Datenflaeche
          liest sich wie eine Fehlermeldung. Oben rechts ist er eine Seitenaktion, dieselbe
          Stelle wie „Alle veralteten anzeigen" auf der Uebersicht.
          ⛔ KEIN REITER: „nicht als Reiter, weil `Tabs` eine Insel erzwingen wuerde, die die
          Detailseite sonst nicht braucht" (`Spec:4775-4776`) — und `Tabs` waere in dieser
          Server Component ausserdem Falle 1 (Compound-Zugriff, HTTP 500).
          ⛔ DIE AEUSSERE PFADFORM `/admin/...`, nie `/m/radio/admin/...`: ein innerer Pfad
          fuehrt auf dem Verwaltungshost auf `/m/radio/m/radio/...` — 404, bei gruenem
          typecheck und lint (`_lib/nav.test.ts`, Fall zur aeusseren Pfadform, dort echt
          gemessen).
        */}
        <Link href={`/admin/geraete/${akte.id}/ereignisse`}>Änderungen anzeigen</Link>
      </div>

      {/*
        ⚠️ BENANNTE ABWEICHUNG: KEINE ZWISCHENUEBERSCHRIFT „Bearbeiten". Der Bestand setzt sie
        (`DeviceDetailDrawer.tsx:104-106`, `Typography.Title level={5}`), weil dort Kopfdaten,
        Formular, Notizfeld und Loeschknopf UEBEREINANDER IN EINEM DRAWER stehen und der
        Bearbeitungsteil sonst nicht vom Lesekopf zu trennen waere. Hier tragen die zwei Inseln
        seit DRK-454 je eine eigene Flaeche, und der Kartenkopf nennt sie beim Namen.
        ⛔ `Typography.Title` waere hier ohnehin Falle 1 (Bauform-Zulaessigkeitstafel Nr. 3) —
        der Ersatz waere ein `<h2>`, nicht das Bauteil; `Card title=` ist keines von beiden,
        sondern ein Prop.
      */}
      <Card title="Gerätedaten">
        <GeraetFormular
          geraet={formWerte}
          rolle={rolle}
          vorschlaege={felderVorschlaege}
          versionen={versionen}
        />
      </Card>

      {/*
        ⚠️ DER KARTENTITEL ERSETZT DIE UEBERSCHRIFT IN DER INSEL (DRK-454): `NotizFeld` trug sie
        bis dahin selbst als `<strong>`, und unter einem gleichlautenden Kartenkopf staende
        dasselbe Wort zweimal untereinander.
      */}
      <div className={s.abstand}>
        <Card title="Update-Anmerkung">
          <NotizFeld geraetId={akte.id} anmerkung={akte.updateAnmerkung} rolle={rolle} />
        </Card>
      </div>

      {/*
        ⛔ NUR FUER DIE ADMIN-STUFE, 1:1 aus `DeviceDetailDrawer.tsx:111` (`{isAdmin && …}`).
        Die Rechtetafel fuehrt „Geraet anlegen / loeschen | ja | nein" (`Spec:4444-4454`); die
        SPERRE ist `requireRadioAdmin()` in `geraetLoeschenAction`, dies ist die Anzeige.
        ⛔ `rolle` KOMMT VOM RIEGEL (`_lib/zugang.ts`), NICHT AUS EINEM ZWEITEN
        `istRadioAdmin(viewer)` — Vorabscan-Fund F18: eine zweite Ableitung derselben Aussage
        ist die, die auseinanderlaeuft.

        ⛔ OHNE `Card`, UND DAS IST EINE KORREKTUR AN DRK-454 (DRK-462): der Loeschknopf sass
        seither als einziger Inhalt in einer eigenen weissen Flaeche mit 24 px Innenabstand —
        gemessen 78 px Karte fuer einen Knopf von 32 px. Eine Karte gruppiert; hier gab es
        nichts zu gruppieren. Die abgesetzte Fusszeile leistet, was die Karte leisten sollte
        (die zerstoerende Aktion vom Formular darueber trennen), und der Satz daneben sagt
        endlich, was das Loeschen anrichtet.
        ⚠️ DER SATZ TRAEGT KEIN ROT (Falle 3) — er steht im gedaempften Ton der Nebenzeilen.
        Rot bleibt dem Knopf, der als einziger `danger` traegt.
      */}
      {istAdmin && (
        <div className={s.akteFuss}>
          <GeraetLoeschen
            geraetId={akte.id}
            offeneLeiheEntleiher={offeneLeihe?.entleiher ?? null}
          />
          <p className={s.akteFussHinweis}>
            Entfernt das Gerät dauerhaft, samt seiner Änderungshistorie.
          </p>
        </div>
      )}
    </div>
  );
}

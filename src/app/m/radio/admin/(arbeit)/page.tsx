// src/app/m/radio/admin/(arbeit)/page.tsx
import { Card, Col, Row, Statistic } from "antd";
import Link from "next/link";
import { getDb } from "../../_db/client";
import { geraeteKennzahlen, geraeteListe } from "../../_lib/lesepfade/geraete";
import type { UpdateStand } from "../../_lib/updateStand";
import { requireRadioVerwaltung } from "../../_lib/zugang";
import { VIkone, type VerwaltungsIkonName } from "../../_ui/verwaltungIkonen";
import s from "../../_ui/verwaltung.module.css";

/**
 * DIE VERWALTUNGSUEBERSICHT — der aeussere Pfad `/admin` (Spec §5.11, `Spec:4778-4794`;
 * Routenkarte `_lib/routen.ts:56`).
 *
 * ⛔ ERSTE ANWEISUNG: `await requireRadioVerwaltung()` (`Spec:4369`). Sie ist KEINE
 * Redundanz zum Riegel in `admin/(arbeit)/layout.tsx`: Route-Group-Grenzen sind keine
 * Sicherheitsgrenzen (`Spec:569-571`), und `requiresAuth: false` heisst NULL
 * Middleware-Gating fuer `/m/radio/admin/*` (`src/core/routing.ts:68-76` gatet nach dem
 * Modul aus dem Segment und unterscheidet `/m/radio/` und `/m/radio/admin/...` nicht).
 * ⛔ KEIN `requireRadioHost(` DANEBEN: `Spec:4369-4378` gibt jeder der zehn Seiten GENAU
 * EINE erste Anweisung; den Host haelt hier das Group-Layout, und zusaetzlich der werfende
 * Riegel selbst als seine eigene erste Anweisung (`_lib/zugang.ts`, `riegelAufStufe`).
 *
 * ⛔ DIE VERWALTUNGS-STUFE, NICHT DIE ADMIN-STUFE (`Spec:4369`): die Uebersicht ist eine
 * der sieben Flaechen, die auch eine Updater-Person sieht. Die drei Seiten auf der
 * Admin-Stufe sind `/admin/import` (Betreiberentscheidung ⬜ V-L5), `/admin/versionen` und
 * `/admin/zugaenge` — sie tragen dafuer eine namentliche Zusicherung in
 * `admin/actions.test.ts`, weil `riegel.test.ts` eine faelschlich abgesenkte Seite im
 * `(arbeit)`-Zweig strukturell nicht faengt.
 *
 * ⛔ KEINE INSEL — Entscheidung E-V15 (`.superpowers/sdd/planteil4/briefs/KOPF.md:964-989`).
 * `Card`, `Statistic` und `Tag` sind in einer Server Component sicher (`CLAUDE.md:13`).
 * Damit das so bleibt, wandern drei Bauformen des Bestands NICHT mit:
 *
 *   1. `onClick` + `navigate` auf der Karte (`Dashboard.tsx:60-62`) -> `next/link` um die
 *      `Card`. Ein Handler waere Falle 9 und kostete eine Insel, die diese Flaeche sonst
 *      nicht braucht.
 *   2. `Typography.Link` mit `onClick` (`Dashboard.tsx:79-81`) -> ein Link. Compound-Zugriff
 *      ist ausserdem Falle 1.
 *   3. `List` mit `renderItem` und `List.Item.Meta` (`Dashboard.tsx:88-96`) -> eine schlichte
 *      `<ul>`. `renderItem` ist Falle 9, `List.Item.Meta` ist Falle 1.
 *
 * ⛔ DIE VIER ZAHLEN ENTSTEHEN IN EINER ABFRAGE mit `GROUP BY`
 * (`_lib/lesepfade/geraete.ts:678-684`), nicht in vier Rundlaeufen mit `pageSize: 1` wie im
 * Bestand (`radio-admin/client/src/hooks/useDashboardStats.ts:17-20`). `Spec:4780-4784`
 * nennt den Grund: die vier Rundlaeufe waren eine Folge der HTTP-Grenze, nicht der
 * Fachlichkeit.
 *
 * ⛔ DIE VIER ZEICHEN TRAGEN FARBE — EINE AUFGEHOBENE FALLE 3. Betreiberbefund vom
 * 2026-08-28 („die Farben der Icons fehlen"), Entscheidung desselben Tages: Gesamt
 * neutral, Aktuell gruen, Veraltet rot, Unbekannt grau (`Dashboard.tsx:33`, `:41`, `:49`).
 * ⛔ Die Ausnahme gilt dem ZEICHEN, nicht der Zahl: der Bestand faerbte ueber `valueStyle`
 * den WERT, hier bleibt er neutral. ⛔ KEIN HEXWERT HIER — die Toene stehen als Klassen
 * im Blatt (`_ui/verwaltung.module.css`), je mit Hell- und Dunkelwert; der Waechter
 * „nennt keinen Farbwert" in `page.test.tsx` bleibt deshalb gruen. Dass „Veraltet" ihr
 * Zeichen ROT traegt und die Zahl NICHT, misst Fall 1 in `e2e/radio-verwaltung.spec.ts` —
 * dort umgedreht, nicht entfernt.
 *
 * ⛔ DIE ZEICHEN STEHEN SEIT DEM 2026-08-28 IN DER KOPFZEILE DER KARTE (Titel links,
 * Zeichen rechts), nicht mehr als `Statistic prefix=`. ⚠️ `react-icons/pi` ist in einer
 * Server Component gemessen sicher (`lagerbuch`, 2026-08-12); Falle 7 gilt `@ant-design/icons`.
 *
 * ⚠️ BENANNTE ABWEICHUNG BEI DER PFADFORM: `Spec:4788` schreibt
 * `/m/radio/admin/geraete?updateStand=veraltet` — die INNERE Form. Sie ist hier falsch.
 * `_lib/nav.ts:9-11` traegt bewusst die AEUSSERE Form, und `_lib/nav.test.ts:135-150`
 * misst sie: „Ein `href="/m/radio/admin/geraete"` in der Navigation fuehrte auf dem
 * Verwaltungshost auf `/m/radio/m/radio/admin/geraete` — 404, und typecheck wie lint
 * bleiben gruen." Dieselbe Hausform steht im Bestand des Repos
 * (`lagerbuch/verwaltung/(arbeit)/geraete/GeraeteListe.tsx:152`: `/verwaltung/geraete/...`).
 * ⛔ Der Fehler waere fuer typecheck, lint und Vitest unsichtbar und zeigte sich erst im
 * echten Abruf.
 */

/**
 * Die fuenf juengsten veralteten Geraete — 1:1 aus `Dashboard.tsx:21`
 * (`useDevices({ page: 1, pageSize: 5, updateStatus: 'veraltet' })`).
 *
 * ⛔ OHNE EIGENE SORTIERANGABE. Der Alt-Client schickt keine, und damit greift die Vorgabe
 * des Lesepfads: `desc(createdAt)` (`_lib/lesepfade/geraete.ts:505`, 1:1 zu
 * `radio-admin/server/src/repos/deviceRepo.ts:195`). „Juengste" heisst genau das — wer hier
 * `sortierung` setzte, aenderte die Auswahl der fuenf, nicht nur ihre Reihenfolge.
 */
const LISTE_GROESSE = 5;

/** Der Filterwert, den die klickbare Karte an die Geraeteliste weiterreicht (`Spec:4788`). */
function listenZiel(stand: UpdateStand): string {
  return `/admin/geraete?updateStand=${stand}`;
}

export default async function RadioUebersichtPage() {
  await requireRadioVerwaltung();

  const db = getDb();
  const zahlen = geraeteKennzahlen(db);
  const veraltet = geraeteListe(db, {
    updateStand: "veraltet",
    seitenGroesse: LISTE_GROESSE,
  });

  /*
   * Die vier Karten in der Reihenfolge des Bestands (`Dashboard.tsx:27-53`). ⛔ „Geraete
   * gesamt" TRAEGT KEINEN FILTER und ist deshalb nicht klickbar, 1:1 (`Dashboard.tsx:61`:
   * `hoverable={card.filter !== undefined}`) — es gibt keinen ungefilterten Listenaufruf,
   * den die Karte ausdruecken koennte.
   */
  const karten: { schluessel: string; titel: string; wert: number; zeichen: VerwaltungsIkonName; farbe: string; filter?: UpdateStand }[] = [
    { schluessel: "gesamt", titel: "Geräte gesamt", wert: zahlen.gesamt, zeichen: "funk", farbe: s.zeichenNeutral },
    { schluessel: "aktuell", titel: "Aktuell", wert: zahlen.aktuell, zeichen: "haken-kreis", farbe: s.zeichenGruen, filter: "aktuell" },
    { schluessel: "veraltet", titel: "Veraltet", wert: zahlen.veraltet, zeichen: "warnung", farbe: s.zeichenRot, filter: "veraltet" },
    { schluessel: "unbekannt", titel: "Unbekannt", wert: zahlen.unbekannt, zeichen: "frage", farbe: s.zeichenGrau, filter: "unbekannt" },
  ];

  return (
    <>
      <h1 className={s.titel}>Übersicht</h1>

      {/* `gutter={[16, 16]}` und `xs={12} md={6}` 1:1 aus `Dashboard.tsx:57-59`. */}
      <Row gutter={[16, 16]}>
        {karten.map((karte) => {
          /* ⛔ EIGENES MARKUP UND KEINE `.ant-statistic-*`-KLASSE: an den drei Griffen haengt
             der Playwright-Fall (`Spec:4877`, Fall 1); eine antd-Klasse waere ein internes
             Detail des Zeichenpakets, und ein Test darauf maesse die naechste antd-Version. */
          const inhalt = (
            <div data-rolle="radio-kennzahl" data-schluessel={karte.schluessel}>
              <div className={s.kennzahlKopf}>
                <span className={s.kennzahlTitel}>{karte.titel}</span>
                <span data-rolle="radio-kennzahl-zeichen" className={karte.farbe}><VIkone name={karte.zeichen} groesse={20} /></span>
              </div>
              <Statistic value={karte.wert} />
            </div>
          );
          return (
            <Col xs={12} md={6} key={karte.schluessel}>
              {karte.filter === undefined ? (
                <Card>{inhalt}</Card>
              ) : (
                <Link href={listenZiel(karte.filter)} className={s.kartenLink}>
                  <Card hoverable>{inhalt}</Card>
                </Link>
              )}
            </Col>
          );
        })}
      </Row>

      <div className={s.abstand}>
        <Card
          title="Veraltete Geräte"
          extra={<Link href={listenZiel("veraltet")}>Alle veralteten anzeigen</Link>}
        >
          {veraltet.zeilen.length === 0 ? (
            /* Der Leertext 1:1 aus `Dashboard.tsx:87`. */
            <p className={s.leer}>Keine veralteten Geräte</p>
          ) : (
            <ul className={s.veralteteListe}>
              {veraltet.zeilen.map((zeile) => (
                <li key={zeile.id} className={s.veralteteZeile}>
                  <Link href={`/admin/geraete/${zeile.id}`} className={s.geraetLink}>
                    {/*
                      DIE RUECKFALLKETTE 1:1 aus `Dashboard.tsx:94`
                      (`device.rufname || device.opta || device.issi`) — mit `||` und nicht
                      mit `??`: der Bestand faellt auch bei einer LEEREN Zeichenkette weiter,
                      und beide Spalten sind Freitext (`_db/schema.ts:20`, `:40`).
                    */}
                    <span className={s.geraetName}>
                      {zeile.rufname || zeile.opta || zeile.issi}
                    </span>
                    {/* `ISSI: <wert>` 1:1 aus `Dashboard.tsx:95`. */}
                    <span className={s.geraetIssi}>ISSI: {zeile.issi}</span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </>
  );
}

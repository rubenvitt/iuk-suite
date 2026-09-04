import { notFound } from "next/navigation";
import { Seitenkopf } from "@/core/shell/Seitenkopf";
import { SCHRIFT } from "@/core/theme/schrift";
import { SPACE } from "@/core/theme/tokens";
import { findeZeichen, svgFuer, zeichenIdAusPfad } from "../../../_lib/katalog";
import s from "../../../_ui/zeichen.module.css";

/*
 * DIE DETAILSEITE — EINE REINE SERVER COMPONENT, UND SIE BLEIBT ES.
 *
 * `svgFuer(id)` liefert einen String aus dem EINGECHECKTEN Generat; er geht
 * unveraendert per `dangerouslySetInnerHTML` ins Markup. Die Vertrauenslage ist
 * dieselbe wie bei `qr/QrDisplay.tsx` und `radio/admin/(druck)/…/blatt/page.tsx`:
 * serverseitig erzeugtes Markup. Ein vom Client geliefertes SVG kaeme hier NIE
 * an — dafuer gibt es `/meine` mit `<img src="data:image/svg+xml;base64,…">`
 * (Spec §4.3).
 *
 * DIESE ROUTE IST DAS EINZIGE TOR, DAS EINEN RSC-BRUCH NACH EINEM PAKETUPGRADE
 * SIEHT (Spec §8.3/§8.4): `typecheck`, `lint` und Vitest koennen diese Klasse
 * strukturell nicht sehen. Aufgabe 10 haengt deshalb einen e2e-Abruf daran, der
 * nichts weiter tut, als `<svg` im gelieferten HTML zu suchen.
 *
 * VIER DINGE SIND HIER VERBOTEN, und jedes davon waere HTTP 500:
 *   - `Descriptions.Item`, `Typography.Title`, `List.Item` (Falle 1) -> natives
 *     <dl> und `Seitenkopf`.
 *   - ein Wert aus einem "use client"-Modul (Falle 6) -> alles aus `_lib/`.
 *   - ein Import aus `@ant-design/icons` (Falle 7) -> das Modul fasst das Paket
 *     nirgends an.
 *   - `<Table columns={[{ render: fn }]}>` (Falle 9) -> es gibt hier keine Tabelle.
 *
 * `encodeURIComponent` BEIM BAUEN DES LINKS (Insel und Merkliste) UND
 * `zeichenIdAusPfad` BEIM LESEN SIND DAS PAAR. Eine Zeichen-Id traegt einen
 * Doppelpunkt („rezept:E.1.1"); ohne die Kodierung haengt es vom Browser ab,
 * was ankommt — und Next reicht das Segment KODIERT in `params` weiter (am
 * 2026-09-03 gegen `next dev` gemessen, siehe Kopf von `zeichenIdAusPfad`).
 */
export default async function ZeichenDetailSeite({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id: roh } = await params;
  // ⚠️ GEMESSEN, NICHT ANGENOMMEN: `params.id` kommt PROZENTKODIERT an. Siehe
  // `zeichenIdAusPfad` in `_lib/katalog.ts` — ohne die Umkehr antwortet diese
  // Seite fuer jede der 246 Ids mit 404, und kein Tor sieht es.
  const id = zeichenIdAusPfad(roh);
  const zeichen = findeZeichen(id);
  const svg = svgFuer(id);
  // Beides zusammen: `findeZeichen` traegt den Text, `svgFuer` das Bild. Eine
  // unbekannte Id ist ein Zustand, kein Fehler — beide Funktionen werfen nie.
  if (zeichen === null || svg === null) notFound();

  return (
    <div className={s.modul} data-testid="zeichen-detail" style={{ display: "grid", gap: SPACE.lg }}>
      <Seitenkopf
        titel={zeichen.titel}
        beschreibung={zeichen.bedeutung}
        zurueck={{ titel: "Katalog", href: "/m/zeichen/katalog" }}
      />

      <div className={s.detailblatt}>
        <div className={s.zeichengross} dangerouslySetInnerHTML={{ __html: svg }} />
      </div>

      {/* Natives <dl>, kein `Descriptions` — der Compound-Zugriff waere HTTP 500. */}
      <dl className={s.daten}>
        <dt style={SCHRIFT.kicker}>Kapitel</dt>
        <dd style={SCHRIFT.text}>{zeichen.kapitel}</dd>
        <dt style={SCHRIFT.kicker}>Abschnitt</dt>
        <dd style={SCHRIFT.text}>{zeichen.abschnitt}</dd>
        {/* „—" statt „undefined": `symbolKindLabel('quatsch')` und
            `ORGANIZATION_LABELS[…]` liefern gemessen still `undefined`; der
            Generator hat daraus `null` gemacht, damit dieses Wort nie auf einem
            Bildschirm landet. */}
        <dt style={SCHRIFT.kicker}>Grundform</dt>
        <dd style={SCHRIFT.text}>{zeichen.grundform ?? "—"}</dd>
        <dt style={SCHRIFT.kicker}>Organisation</dt>
        <dd style={SCHRIFT.text}>{zeichen.organisation ?? "—"}</dd>
        <dt style={SCHRIFT.kicker}>Stärke</dt>
        <dd style={SCHRIFT.text}>{zeichen.staerke ?? "—"}</dd>
      </dl>

      {zeichen.zweiteDarstellung !== undefined && (
        <section style={{ display: "grid", gap: SPACE.sm }}>
          <h2 style={SCHRIFT.unterTitel}>Zweite zulässige Darstellung</h2>
          <p style={SCHRIFT.neben}>
            Abschnitt {zeichen.zweiteDarstellung.abschnitt} — dasselbe Zeichen, andere Zeichnung.
            Beide sind richtig.
          </p>
          <div className={s.detailblatt}>
            <div
              className={s.zeichengross}
              dangerouslySetInnerHTML={{ __html: zeichen.zweiteDarstellung.svg }}
            />
          </div>
        </section>
      )}

      {/*
        ⛔ KEIN „GEPRUEFT"-ABZEICHEN, und das ist keine Auslassung (Spec §5.6):
        das TECHNISCHE Review steht auf 532/544 `approved`, das FACHLICHE auf
        544/544 `pending`. Ein gruenes Haekchen je Zeichen zeigte ausgerechnet
        das Review, das ueber die BEDEUTUNG nichts aussagt — und widerspraeche
        dem Vorbehaltskasten auf der Startseite. Gezeigt wird nur die technische
        Abweichungsnotiz der 12 betroffenen Zeichen, in einem Satz, ohne
        Dateinamen (die entfernt der Generator).
      */}
      {zeichen.reviewNotiz !== null && (
        <p className={s.hinweis} style={SCHRIFT.neben} data-testid="zeichen-reviewnotiz">
          {zeichen.reviewNotiz}
        </p>
      )}
    </div>
  );
}

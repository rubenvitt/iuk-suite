"use client";

import { useCallback, useMemo, useState } from "react";
import { Alert, Button, Card } from "antd";
import type { SymbolSpec } from "@einsatzzeichen/schema";
import { SCHRIFT } from "@/core/theme/schrift";
import { SPACE } from "@/core/theme/tokens";
import { alleZeichen } from "../../_lib/katalog";
import s from "../zeichen.module.css";
import { AchsenFelder } from "./AchsenFelder";
import { SpeichernFormular } from "./SpeichernFormular";
import { ACHSEN, bezeichnung, kandidaten } from "./vokabular";
import { composeFromCatalog, rasterDimensionsForWidth, renderCanvas } from "./paket";
import {
  baue,
  dekodiereSpec,
  erlaubteWerte,
  felddifferenz,
  hinweiseZu,
  kodiereSpec,
  ohneTexte,
  reduceSpec,
  setzeBeschriftung,
  ziehePruefaufgabe,
  type Uebungsaufgabe,
  type Wertbefund,
  type Zone,
} from "./zustand";
import css from "./baukasten.module.css";

/*
 * DER BAUKASTEN. Wird ausschliesslich ueber `BaukastenLader.tsx` mit
 * dynamic(..., { ssr: false }) geladen — die gemessene Bedingung dafuer, dass
 * `next.config.ts` unangetastet bleibt (M2/M3).
 *
 * Das Generat wird hier MIT importiert (`alleZeichen`), fuer die Bauuebung. Es
 * kostet gemessen 31.902 B gzip inklusive aller 246 Bilder und liegt im selben
 * Chunk, den die Katalog-Insel ohnehin laedt. Die Alternative — den Aufgabenpool
 * als Prop aus der Server Component reichen — schickte bei JEDEM Aufruf rund
 * 46 KB unkomprimiert und nicht zwischenspeicherbar durch den Flight-Payload und
 * braeuchte einen zweiten Codepfad fuer dieselben Daten.
 *
 * Die Wurzel traegt `zeichen.module.css`s `.modul` — dort stehen die
 * `--tz-*`-Variablen, die `baukasten.module.css` liest (Falle 2: antds `--ant-*`
 * gaebe es hier nicht).
 */

const VORSCHAU_PX = 256;
const MINIATUR_PX = 48;
const PNG_PX = 1024;

/** Die 232 fragbaren Hauptrezepte mit Spec — der Pool der Bauuebung (Spec §6.5). */
const UEBUNGSPOOL: readonly Uebungsaufgabe[] = alleZeichen()
  .filter((z) => z.id.startsWith("rezept:") && z.spec !== null && z.specKanon !== null)
  .map((z) => ({
    id: z.id,
    titel: z.titel,
    bedeutung: z.bedeutung,
    specKanon: z.specKanon as string,
    spec: z.spec as SymbolSpec,
    svg: z.svg,
  }));

const LEERE_SPEC = { kind: "formation" } as SymbolSpec;

/** Der Anfangszustand: aus `?s=` gelesen, sonst leer. Nur im Browser — `ssr:false`. */
function anfangsSpec(): SymbolSpec {
  const param = new URLSearchParams(window.location.search).get("s");
  return (param && dekodiereSpec(param)) || LEERE_SPEC;
}

/**
 * Die Paketfassung, mit der eine aus `/meine` geoeffnete Zusammenstellung
 * gespeichert wurde (Spec §4.6 Stufe 2). Sie steht in der Meldung, wenn das
 * Zeichen heute nicht mehr zeichenbar ist — ohne sie sagt die Meldung nicht,
 * WARUM es heute nicht mehr geht.
 */
function anfangsVersion(): string | null {
  return new URLSearchParams(window.location.search).get("v");
}

export default function BaukastenInsel() {
  const [spec, setSpec] = useState<SymbolSpec>(anfangsSpec);
  const [herkunftVersion, setHerkunftVersion] = useState<string | null>(anfangsVersion);
  const [aufgabe, setAufgabe] = useState<Uebungsaufgabe | null>(null);
  const [urteil, setUrteil] = useState<string | null>(null);
  const [weisserGrund, setWeisserGrund] = useState(true);
  const [exportFehler, setExportFehler] = useState<string | null>(null);

  const aendere = useCallback((naechste: SymbolSpec) => {
    setSpec(naechste);
    /*
     * Die Herkunftsangabe gilt fuer die GELADENE Zusammenstellung. Wer etwas
     * aendert, baut ein neues Zeichen — die Auskunft „gespeichert mit 1.0.2"
     * waere danach eine Aussage ueber etwas, das so nicht mehr dasteht.
     */
    setHerkunftVersion(null);
    /*
     * `history.replaceState` und NICHT `router.replace`: die Adresse ist hier ein
     * Merkzettel zum Teilen, kein Navigationsziel. Ein Router-Aufruf loeste bei
     * jeder Auswahl eine RSC-Anfrage aus — Dutzende pro Zeichen.
     */
    const url = new URL(window.location.href);
    url.searchParams.set("s", kodiereSpec(naechste));
    url.searchParams.delete("v");
    window.history.replaceState(null, "", url);
  }, []);

  const setzeFeld = useCallback(
    (feld: keyof SymbolSpec, wert: unknown) => aendere(reduceSpec(spec, { feld, wert })),
    [aendere, spec],
  );
  /*
   * MEHRERE FELDER IN EINEM SCHRITT — und das ist kein Komfort, sondern die Bedingung
   * dafuer, dass die Achsenbuendelung ueberhaupt wirkt. Zwei aufeinanderfolgende
   * `setzeFeld`-Aufrufe im SELBEN Ereignis rechnen beide vom selben `spec` aus der
   * Closure; der letzte gewinnt, und das konkurrierende Feld der Achse wird gerade
   * NICHT geleert. Die Spec traegt danach genau die Kombination, die Spec §6.1
   * ausschliessen will, und die Vorschau faellt in head-zone-conflict bzw.
   * chassis-foot-conflict.
   */
  const setzeFelder = useCallback(
    (paare: readonly (readonly [keyof SymbolSpec, unknown])[]) =>
      aendere(paare.reduce((z, [feld, wert]) => reduceSpec(z, { feld, wert }), spec)),
    [aendere, spec],
  );
  const setzeZone = useCallback(
    (zone: Zone, text: string) => aendere(setzeBeschriftung(spec, zone, text)),
    [aendere, spec],
  );

  const ergebnis = useMemo(() => baue(spec, VORSCHAU_PX, "tz-vorschau"), [spec]);

  /*
   * DIE WERTESPERRUNG PROBT GEGEN `ohneTexte(spec)`. Sonst sperrte ein einziger zu
   * langer Text jede Achse mit `label-too-wide` und die Oberflaeche behauptete,
   * nichts passe mehr zusammen (siehe Kopfkommentar von `ohneTexte`). Der
   * Textverstoss steht unten an seinem Feld.
   *
   * Die Rechnung liegt in einem `useMemo` ueber dem textfreien Stand: gemessen
   * 9,7 ms kalt / 3,4 ms warm fuer 247 Kandidaten (M16) — genau die Zahl, die
   * dieses Vokabular fuehrt. Alle Felder auf einmal statt erst beim Oeffnen eines
   * Feldes: sonst zeigte das Feld beim ersten Oeffnen die Sperren des vorigen
   * Standes.
   */
  const sperrGrundlage = useMemo(() => ohneTexte(spec), [spec]);
  const befunde = useMemo(() => {
    const karte = new Map<string, Map<string, Wertbefund>>();
    for (const achse of ACHSEN) {
      for (const feld of achse.felder) {
        if (feld === "labels" || feld === "designation" || feld === "kind") continue;
        karte.set(
          feld,
          new Map(erlaubteWerte(sperrGrundlage, feld, kandidaten(feld)).map((b) => [b.wert, b])),
        );
      }
    }
    return karte;
  }, [sperrGrundlage]);

  /*
   * Die Kachelvorschauen entstehen EINMAL: sie haengen nur an `kind`, nicht am
   * uebrigen Stand. `circle-12` und `reduced-house` komponieren nackt nicht und
   * bekommen `null` — die Kachel zeichnet dann einen Platzhalter statt einer
   * erfundenen Zeichnung.
   */
  const miniaturen = useMemo(() => {
    const karte = new Map<string, string | null>();
    for (const id of kandidaten("kind")) {
      const e = baue({ kind: id } as SymbolSpec, MINIATUR_PX, `tz-mini-${id}`);
      karte.set(id, e.ok ? e.svg : null);
    }
    return karte;
  }, []);

  /** Die Regeltexte, die gerade anliegen — an der Achse, zu der die Regel gehoert. */
  const hinweise = useMemo(() => hinweiseZu(ergebnis), [ergebnis]);

  const svg = ergebnis.ok ? ergebnis.svg : "";

  const lade = (blob: Blob, dateiname: string) => {
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = dateiname;
    a.click();
    URL.revokeObjectURL(url);
  };

  /*
   * PNG — drei Fallstricke, alle behandelt (Spec §6.4):
   *  (a) `renderCanvas` malt KEINEN Hintergrund. Ohne den Umschalter landete ein
   *      schwarzes Zeichen unsichtbar in einer dunklen Praesentation.
   *  (b) `await document.fonts.load("16px Arimo")` VOR dem Zeichnen — sonst
   *      rastert der erste Export mit der Ersatzschrift und der zweite mit Arimo:
   *      ein stiller, nicht reproduzierbarer Unterschied. `?.` weil jsdom keine
   *      FontFaceSet kennt.
   *  (c) `renderCanvas` kann werfen → Anwendermeldung statt weisser Seite.
   */
  const exportierePng = async () => {
    setExportFehler(null);
    try {
      const zeichnung = composeFromCatalog(spec);
      const masse = rasterDimensionsForWidth(zeichnung.viewBox, PNG_PX);
      const leinwand = document.createElement("canvas");
      leinwand.width = masse.widthPx;
      leinwand.height = masse.heightPx;
      const ctx = leinwand.getContext("2d");
      if (!ctx) {
        setExportFehler("Dieser Browser kann kein Bild erzeugen. Nimm den SVG-Export.");
        return;
      }
      await document.fonts?.load("16px Arimo");
      if (weisserGrund) {
        ctx.fillStyle = "#ffffff";
        ctx.fillRect(0, 0, masse.widthPx, masse.heightPx);
      }
      renderCanvas(zeichnung, ctx, { size: PNG_PX });
      leinwand.toBlob((blob) => {
        if (blob) lade(blob, "zeichen.png");
        else setExportFehler("Das Bild ließ sich nicht erzeugen.");
      }, "image/png");
    } catch {
      setExportFehler("Dieses Zeichen lässt sich gerade nicht als Bild ausgeben.");
    }
  };

  const starteUebung = () => {
    /*
     * Die Einschraenkung auf ein Lernset kommt mit Aufgabe 8 (`idsAusSet(db, slug)`
     * und derselbe `?set=<slug>`-Parameter wie auf `/lernen`). Bis dahin steht hier
     * `undefined` — der ganze Bestand ist im Spiel, und die Naht ist schon da.
     */
    const nurIds: readonly string[] | undefined = undefined;
    setAufgabe(ziehePruefaufgabe(UEBUNGSPOOL, Math.random, nurIds));
    setUrteil(null);
    aendere(LEERE_SPEC);
  };

  return (
    <div className={s.modul}>
      <Card style={{ marginBlockEnd: SPACE.lg }}>
        <div
          className={`${css.blatt} ${css.vorschau}`}
          data-testid="tz-vorschau"
          dangerouslySetInnerHTML={{ __html: svg }}
        />
        {ergebnis.ok ? (
          <p style={SCHRIFT.neben} data-testid="tz-bedeutung">
            {ergebnis.bedeutung}
          </p>
        ) : (
          /* `type="warning"`, nie `type="error"` — Falle 3. */
          <Alert
            type="warning"
            showIcon
            data-testid="tz-kein-bild"
            style={{ marginBlockStart: SPACE.sm }}
            title={
              herkunftVersion === null
                ? "Diese Zusammenstellung lässt sich noch nicht zeichnen."
                : "Diese Zusammenstellung lässt sich mit der heutigen Katalogfassung nicht mehr " +
                  `zeichnen — sie wurde mit ${herkunftVersion} gespeichert.`
            }
          />
        )}

        <div className={css.knopfzeile}>
          <Button
            data-testid="tz-export-svg"
            disabled={!ergebnis.ok}
            onClick={() => lade(new Blob([svg], { type: "image/svg+xml" }), "zeichen.svg")}
          >
            SVG herunterladen
          </Button>
          <Button data-testid="tz-export-png" disabled={!ergebnis.ok} onClick={exportierePng}>
            PNG herunterladen
          </Button>
          <Button
            data-testid="tz-export-json"
            onClick={() =>
              lade(
                new Blob([JSON.stringify(spec, null, 2)], { type: "application/json" }),
                "zeichen.json",
              )
            }
          >
            Zusammenstellung als Datei
          </Button>
          <label className={css.schalter}>
            <input
              type="checkbox"
              data-testid="tz-weisser-grund"
              checked={weisserGrund}
              onChange={(e) => setWeisserGrund(e.target.checked)}
            />
            Weißer Hintergrund im PNG
          </label>
        </div>
        {exportFehler && (
          <p className={css.hinweis} data-testid="tz-export-fehler">
            {exportFehler}
          </p>
        )}
      </Card>

      <Card style={{ marginBlockEnd: SPACE.lg }} title="Übungsaufgabe">
        <p style={{ ...SCHRIFT.neben, margin: 0 }}>
          Ein Zeichen aus dem Katalog, nur mit seiner Bedeutung. Bau es nach und prüfe es. Das
          zählt nicht zum Lernstand.
        </p>
        <div className={css.knopfzeile}>
          <Button data-testid="tz-uebung-start" onClick={starteUebung}>
            Übungsaufgabe ziehen
          </Button>
          {aufgabe && (
            <Button
              data-testid="tz-uebung-pruefen"
              onClick={() => setUrteil(felddifferenz(spec, aufgabe.spec, bezeichnung).satz)}
            >
              Prüfen
            </Button>
          )}
        </div>
        {aufgabe && (
          <p data-testid="tz-uebung-aufgabe" style={SCHRIFT.text}>
            {aufgabe.bedeutung}
          </p>
        )}
        {urteil && (
          <>
            <p data-testid="tz-uebung-urteil" style={SCHRIFT.text}>
              {urteil}
            </p>
            {/* Erst NACH dem Pruefen — vorher waere die Aufgabe geschenkt. */}
            <div
              data-testid="tz-uebung-loesung"
              className={`${css.blatt} ${css.vorschau}`}
              dangerouslySetInnerHTML={{ __html: aufgabe?.svg ?? "" }}
            />
          </>
        )}
      </Card>

      <AchsenFelder
        spec={spec}
        befunde={befunde}
        miniaturen={miniaturen}
        setzeFeld={setzeFeld}
        setzeFelder={setzeFelder}
        setzeZone={setzeZone}
        hinweise={hinweise}
      />

      <Card title="Zeichen speichern">
        <SpeichernFormular specJson={JSON.stringify(spec)} svg={svg} bereit={ergebnis.ok} />
      </Card>
    </div>
  );
}

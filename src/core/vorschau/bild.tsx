import { ImageResponse } from "next/og";
import { pngZuDatei } from "@/core/favicon";
import { KACHEL_GRUND, SIGNAL, TINTE } from "@/core/favicon/zeichen";
import { SUITE_BESCHREIBUNG, SUITE_NAME, markeZuName, type Marke } from "./index";

/**
 * DAS VORSCHAUBILD EINER APP (1200 × 630, Open Graph) — gezeichnet zur Laufzeit von `next/og` mit dessen
 * mitgelieferter Schrift, nicht wie die App-Icons vorab gerastert: Text braucht eine Schrift, und `sharp`
 * steht nicht im Container (`scripts/app-icon-generat.ts`). Fest hell wie das App-Icon; Rot trägt nur die
 * dünne Leiste unten, wie das Signal im Zeichen.
 *
 * Je Marke einmal je Prozess gezeichnet und im Speicher gehalten; die URL trägt `?v=` (`vorschauBildUrl`).
 */
const GRAU = "#5c636a";
const zwischenspeicher = new Map<string, Promise<ArrayBuffer>>();

function zeichne(marke: Marke): Promise<ArrayBuffer> {
  const icon = pngZuDatei(`${marke.zeichen}-app-512.png`) ?? pngZuDatei("ida-app-512.png")!;
  const iconUrl = `data:image/png;base64,${icon.toString("base64")}`;
  const unterzeile = marke.titel === SUITE_NAME ? SUITE_BESCHREIBUNG : `${SUITE_NAME} · ${SUITE_BESCHREIBUNG}`;
  const lang = marke.titel.length > 14;

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          background: KACHEL_GRUND,
          color: TINTE,
        }}
      >
        <div style={{ flex: 1, display: "flex", alignItems: "center", padding: "0 96px", gap: 56 }}>
          {/* eslint-disable-next-line @next/next/no-img-element -- next/og zeichnet nur <img> */}
          <img src={iconUrl} width={260} height={260} alt="" style={{ borderRadius: 56, boxShadow: "0 0 0 2px #e6e8ea" }} />
          <div style={{ display: "flex", flexDirection: "column", gap: 20, flex: 1 }}>
            <div style={{ fontSize: lang ? 76 : 96, lineHeight: 1.05, letterSpacing: -2 }}>{marke.titel}</div>
            <div style={{ fontSize: 34, color: GRAU }}>{unterzeile}</div>
          </div>
        </div>
        <div style={{ height: 14, background: SIGNAL }} />
      </div>
    ),
    { width: 1200, height: 630 },
  ).arrayBuffer();
}

/** Das PNG des Vorschaubilds zu einem Dateinamen `vorschau-<name>.png`, oder `null`. */
export async function vorschauBild(datei: string): Promise<ArrayBuffer | null> {
  const name = datei.match(/^vorschau-([a-z]+)\.png$/)?.[1];
  const marke = name ? markeZuName(name) : null;
  if (!marke) return null;
  let bild = zwischenspeicher.get(marke.name);
  if (!bild) {
    bild = zeichne(marke);
    bild.catch(() => zwischenspeicher.delete(marke.name));
    zwischenspeicher.set(marke.name, bild);
  }
  return bild;
}

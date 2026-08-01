import { statfsSync } from "node:fs";
import { readdir } from "node:fs/promises";
import { resolve } from "node:path";
import { Alert, Button, Card, Col, Row, Statistic } from "antd";
import { desc, sql } from "drizzle-orm";

import { aufraeumenAction } from "../(verwaltung)/ablage-actions";
import { getDb } from "../_db/client";
import { aufraeumLaeufe, inboxFiles, shareFiles } from "../_db/schema";
import { zeitpunktGenauBerlin } from "../_lib/zeit";

/**
 * DIE ABLAGE-KACHEL (Spec §7.6, §5.6, §4.4, §4.8; Plan T46 Punkt 5).
 *
 * SIE STEHT AUF DER FREIGABEN-UEBERSICHT, weil dort der Mensch steht, der
 * handeln kann. Restplatz, Zeilen ohne Bytes, `scanning`/`error` und
 * `.part`-Reste sind die vier Zahlen, an denen ein Betriebsproblem dieses Moduls
 * zuerst sichtbar wird — und keine davon steht sonst irgendwo.
 *
 * DIE ABLAGE KANN NICHT IN `/api/health/files` MITGEPRUEFT WERDEN: `/api/health`
 * ist PASSTHROUGH (`core/routing.ts:12`), eine Modul-Route darunter waere tot,
 * und `core/health` fuer EINEN Nutzniesser zu erweitern verstiesse gegen die
 * `core`-Regel. Der Docker-Healthcheck bleibt `/api/health/portal`: ein
 * files-eigener Fehler, der den GANZEN Container als krank markiert, naehme bei
 * einem spaeter eingefuehrten Automatismus die anderen drei Module mit.
 *
 * DREI FALLEN, DIE HIER ENTSCHIEDEN SIND:
 *
 * 1. **Kein Compound-Zugriff auf antd** (`Typography.Title`, `Card.Meta`,
 *    `Descriptions.Item` …): in einer Server Component sind sie `undefined` und
 *    ergeben HTTP 500, das weder `pnpm build` noch Vitest sieht. `Card`, `Row`,
 *    `Col`, `Statistic`, `Button` und `Alert` sind sicher.
 * 2. **Kein `@ant-design/icons`**: das Paket ruft `createContext` auf
 *    Modulebene, und in der RSC-Ebene gibt es das nicht — HTTP 500 schon beim
 *    Import.
 * 3. **KEIN `grenzen()`**. Die Kachel liest Datenbank und Dateisystem, keine
 *    Zahlen aus der `.env`. `grenzen()` wirft, solange die `FILES_`-Variablen
 *    fehlen (der Normalfall bis zum Cutover), und der Wurf riss die ganze
 *    Uebersicht mit — es gibt keine `error.tsx` darueber.
 *
 * Kein `size` auf den Knoepfen: `controlHeight` ist 56 und schon das richtige
 * Touch-Masz, `size="large"` waeren 72px.
 */

/**
 * BINAERE Praefixe, und das Wort dazu. Beide „500" unterscheiden sich um den
 * Faktor 1,048576 (476,8 MiB gegen 500,0 MB) — dieses Paar ist im Modul `files`
 * schon einmal teuer geworden (§9.1).
 *
 * Vierte Kopie dieser Leiter (`SharesUebersicht.tsx`, `shares/[id]/page.tsx`,
 * `zugangslinks/page.tsx`). Die Doppelung ist bewusst und dort schon benannt:
 * eine gemeinsame Stelle laege in `_lib/`, und die vier Dateien gehoeren
 * verschiedenen Tasks — sie zusammenzulegen ist eine eigene, kleine Aenderung
 * mit vier Bearbeitern, kein Nebenprodukt dieser hier.
 */
const BYTE_EINHEITEN_BINAER = ["Byte", "KiB", "MiB", "GiB", "TiB"] as const;

function byteTextBinaer(bytes: number): string {
  let wert = bytes;
  let stufe = 0;
  while (wert >= 1024 && stufe < BYTE_EINHEITEN_BINAER.length - 1) {
    wert /= 1024;
    stufe += 1;
  }
  const zahl = stufe === 0 ? String(Math.round(wert)) : wert.toFixed(1).replace(".", ",");
  return `${zahl} ${BYTE_EINHEITEN_BINAER[stufe]}`;
}

/** Der zuletzt protokollierte Lauf, so viel wie die Kachel davon zeigt (§4.8). */
export interface LetzterLauf {
  readonly gestartetAt: Date;
  /** `null` = der Prozess war mitten im Lauf weg — genau daran ist das erkennbar. */
  readonly beendetAt: Date | null;
  readonly trockenlauf: boolean;
  readonly sharesGeloescht: number;
  readonly dateienGeloescht: number;
  readonly bytesGeloescht: number;
  readonly verwaisteBlobsGemeldet: number;
  readonly fehler: string | null;
}

/**
 * Der Zustand der Ablage. JEDER NAME TRAEGT SEINE HERKUNFT, nicht nur seine
 * Einheit: „belegt" ist die Summe der Datenbank und „frei" die Auskunft des
 * Dateisystems — zwei verschiedene Quellen, die sich nicht zu 100 % ergaenzen,
 * und wer das verwechselt, rechnet eine Gesamtgroesse aus, die es nicht gibt.
 */
export interface AblageStand {
  /** `null` = nicht ermittelbar (die Ablage existiert vor dem ersten Upload nicht). */
  readonly freieBytesAufVolume: number | null;
  readonly belegteBytesLautDatenbank: number;
  /** `bytes_vollstaendig_at IS NULL` — die Zeile ohne Bytes aus §4.4. */
  readonly zeilenOhneBytes: number;
  readonly avScanning: number;
  readonly avFehler: number;
  readonly partReste: number;
  readonly letzterLauf: LetzterLauf | null;
}

/**
 * Liest den Zustand — beide Tabellen, das Volume und die letzte Protokollzeile.
 *
 * DIE ZAHLEN GIBT ES ZWEIMAL, WEIL DIE TABELLEN ZWEI SIND. `inbox_files` ist
 * bewusst KEIN Mitbewohner von `share_files` (§4.6, Analyse E18 a); der Preis
 * steht dort ehrlich: jede Statusabfrage gibt es zweimal. Die Gegenmassnahme ist
 * dieselbe wie ueberall im Modul — EIN Vokabular (`AV_STATUS` in `_lib/av.ts`),
 * und die Summen entstehen hier an EINER Stelle statt in zwei Ansichten.
 */
export async function ladeAblageStand(): Promise<AblageStand> {
  const bank = getDb();

  /*
   * Ein Aggregat je Tabelle statt sechs Zaehlabfragen: dieselbe Zeile darf
   * nicht zweimal gelesen werden, sonst koennen die Zahlen einer Kachel aus
   * zwei Zeitpunkten stammen.
   *
   * `coalesce`, weil SQLite `sum()` ueber null Zeilen NULL liefert — ohne das
   * stuende auf einer frischen Instanz „NaN" statt „0".
   */
  const shareZahlen = bank
    .select({
      ohneBytes: sql<number>`coalesce(sum(case when ${shareFiles.bytesVollstaendigAt} is null then 1 else 0 end), 0)`,
      scanning: sql<number>`coalesce(sum(case when ${shareFiles.avStatus} = 'scanning' then 1 else 0 end), 0)`,
      fehler: sql<number>`coalesce(sum(case when ${shareFiles.avStatus} = 'error' then 1 else 0 end), 0)`,
      bytes: sql<number>`coalesce(sum(case when ${shareFiles.bytesVollstaendigAt} is not null then ${shareFiles.size} else 0 end), 0)`,
    })
    .from(shareFiles)
    .get();

  const inboxZahlen = bank
    .select({
      ohneBytes: sql<number>`coalesce(sum(case when ${inboxFiles.bytesVollstaendigAt} is null then 1 else 0 end), 0)`,
      scanning: sql<number>`coalesce(sum(case when ${inboxFiles.avStatus} = 'scanning' then 1 else 0 end), 0)`,
      fehler: sql<number>`coalesce(sum(case when ${inboxFiles.avStatus} = 'error' then 1 else 0 end), 0)`,
      bytes: sql<number>`coalesce(sum(case when ${inboxFiles.bytesVollstaendigAt} is not null then ${inboxFiles.size} else 0 end), 0)`,
    })
    .from(inboxFiles)
    .get();

  /*
   * SPALTEN NAMENTLICH, kein `select()` ohne Argument. Die Tabelle
   * `aufraeum_laeufe` traegt kein Geheimnis — aber die Zusicherung in
   * `_db/queries.test.ts` gilt fuer das GANZE Modul und ist genau deshalb
   * wertvoll: sie kennt die Tabelle nicht, die morgen dazukommt. Ein `select()`
   * hier waere die Ausnahme, mit der die Regel aufhoert zu tragen (die Alt-App
   * selektierte alle Spalten und spreadete sie an eine Client-Komponente).
   */
  const lauf = bank
    .select({
      gestartetAt: aufraeumLaeufe.gestartetAt,
      beendetAt: aufraeumLaeufe.beendetAt,
      trockenlauf: aufraeumLaeufe.trockenlauf,
      sharesGeloescht: aufraeumLaeufe.sharesGeloescht,
      dateienGeloescht: aufraeumLaeufe.dateienGeloescht,
      bytesGeloescht: aufraeumLaeufe.bytesGeloescht,
      verwaisteBlobsGemeldet: aufraeumLaeufe.verwaisteBlobsGemeldet,
      fehler: aufraeumLaeufe.fehler,
    })
    .from(aufraeumLaeufe)
    .orderBy(desc(aufraeumLaeufe.id))
    .limit(1)
    .get();

  const wurzel = ablageWurzel();

  return {
    freieBytesAufVolume: freieBytes(wurzel),
    belegteBytesLautDatenbank: Number(shareZahlen?.bytes ?? 0) + Number(inboxZahlen?.bytes ?? 0),
    zeilenOhneBytes: Number(shareZahlen?.ohneBytes ?? 0) + Number(inboxZahlen?.ohneBytes ?? 0),
    avScanning: Number(shareZahlen?.scanning ?? 0) + Number(inboxZahlen?.scanning ?? 0),
    avFehler: Number(shareZahlen?.fehler ?? 0) + Number(inboxZahlen?.fehler ?? 0),
    partReste: await zaehlePartReste(wurzel),
    letzterLauf:
      lauf === undefined
        ? null
        : {
            gestartetAt: lauf.gestartetAt,
            beendetAt: lauf.beendetAt,
            trockenlauf: lauf.trockenlauf,
            sharesGeloescht: lauf.sharesGeloescht,
            dateienGeloescht: lauf.dateienGeloescht,
            bytesGeloescht: lauf.bytesGeloescht,
            verwaisteBlobsGemeldet: lauf.verwaisteBlobsGemeldet,
            fehler: lauf.fehler,
          },
  };
}

/**
 * Die Wurzel der Ablage. Sie entsteht hier NUR als Verzeichnisname zum
 * AUFLISTEN — kein Pfad zu einem Blob verlaesst diese Datei, jeder Byte-Zugriff
 * laeuft weiter ausschliesslich ueber `_lib/storage.ts` (dort verschwindet die
 * Traversal-Klasse strukturell, weil ein Pfad nur aus DB-IDs entsteht).
 *
 * `DATA_DIR` wird bei JEDEM Aufruf gelesen, nicht beim Import — dieselbe Form
 * wie in `core/db/index.ts` und `_lib/storage.ts`.
 */
function ablageWurzel(): string {
  return resolve(process.env.DATA_DIR ?? "./.data", "files");
}

/**
 * `bavail` und nicht `bfree`: `bfree` enthaelt die dem Superuser vorbehaltenen
 * Bloecke, und die stehen dem Suite-Prozess nicht zur Verfuegung. Die Kachel
 * zeigte damit mehr Platz an, als ein Upload tatsaechlich bekommt.
 *
 * `null` statt eines Wurfs: vor dem ersten Upload gibt es das Verzeichnis nicht,
 * und das ist kein Fehlerzustand, sondern der Anfangszustand.
 */
function freieBytes(wurzel: string): number | null {
  try {
    const volume = statfsSync(wurzel);
    return Number(volume.bavail) * Number(volume.bsize);
  } catch {
    return null;
  }
}

/**
 * `.part`-Reste — die Zwischendateien abgebrochener Uploads (§5.3).
 *
 * Gezaehlt wird ueber ZWEI Ebenen (Wurzel und je ein Unterverzeichnis), weil die
 * Ablage genau so tief ist: `<share>/<datei>` und `inbox/<datei>`. Ohne
 * Namensfilter auf der ersten Ebene — was ein Verzeichnis ist, sagt das
 * Dateisystem, und die Frage „ist das eine Share-ID?" gehoert zum
 * WAISEN-Bericht (`_lib/aufraeumen.ts`), nicht hierher.
 */
async function zaehlePartReste(wurzel: string): Promise<number> {
  let reste = 0;
  for (const eintrag of await lies(wurzel)) {
    if (eintrag.endsWith(".part")) reste += 1;
  }
  for (const unter of await verzeichnisse(wurzel)) {
    for (const eintrag of await lies(`${wurzel}/${unter}`)) {
      if (eintrag.endsWith(".part")) reste += 1;
    }
  }
  return reste;
}

async function lies(verzeichnis: string): Promise<string[]> {
  try {
    return await readdir(verzeichnis);
  } catch {
    // Ein fehlendes oder nicht lesbares Verzeichnis ist hier kein Grund, die
    // Kachel scheitern zu lassen: sie ist eine Auskunft, keine Zusage.
    return [];
  }
}

async function verzeichnisse(wurzel: string): Promise<string[]> {
  try {
    const eintraege = await readdir(wurzel, { withFileTypes: true });
    return eintraege.filter((e) => e.isDirectory()).map((e) => e.name);
  } catch {
    return [];
  }
}

// ---------------------------------------------------------------------------

export async function AblageKachel() {
  let stand: AblageStand;
  try {
    stand = await ladeAblageStand();
  } catch (grund) {
    /*
     * EIN LESEFEHLER IST EIN ZUSTAND DIESER KACHEL, kein Seitenabsturz. Ohne
     * dieses `catch` liefe der Wurf in die naechste `error.tsx` — die es hier
     * nicht gibt —, und die Freigaben-Uebersicht waere wegen einer NEBENkachel
     * eine technische Fehlerseite. Protokolliert wird trotzdem: ein stiller
     * Fehlerzustand ist ein Betriebsproblem, das niemand findet.
     */
    console.error("[files] Der Ablage-Zustand konnte nicht gelesen werden:", grund);
    return (
      <Card title="Ablage">
        {/* `type="warning"` und NICHT `type="error"`: `colorError ===
            colorPrimary === #c8000f`, ein roter Kasten auf einer Datenflaeche
            saehe aus wie eine Primaeraktion. */}
        <Alert
          type="warning"
          showIcon
          data-testid="files-ablage-fehlerzustand"
          message="Der Zustand der Ablage konnte nicht gelesen werden."
          description="Die Freigaben selbst sind davon nicht betroffen. Der Grund steht im Protokoll des Servers."
        />
      </Card>
    );
  }

  return (
    <Card title="Ablage" data-testid="files-ablage-kachel">
      <Row gutter={[16, 16]}>
        <Col xs={12} md={8}>
          <div data-testid="files-ablage-frei">
            <Statistic
              title="Frei auf dem Volume"
              value={
                stand.freieBytesAufVolume === null
                  ? "unbekannt"
                  : byteTextBinaer(stand.freieBytesAufVolume)
              }
            />
          </div>
        </Col>
        <Col xs={12} md={8}>
          <div data-testid="files-ablage-belegt">
            {/* „laut Datenbank" steht im TITEL, weil es eine andere Quelle ist
                als die Zeile daneben: die Summe der vollstaendigen Zeilen, nicht
                die Belegung der Platte. */}
            <Statistic
              title="Belegt (laut Datenbank)"
              value={byteTextBinaer(stand.belegteBytesLautDatenbank)}
            />
          </div>
        </Col>
        <Col xs={12} md={8}>
          <div data-testid="files-ablage-zeilen-ohne-bytes">
            <Statistic title="Zeilen ohne Bytes" value={stand.zeilenOhneBytes} />
          </div>
        </Col>
        <Col xs={12} md={8}>
          <div data-testid="files-ablage-scanning">
            <Statistic title="Wird geprüft" value={stand.avScanning} />
          </div>
        </Col>
        <Col xs={12} md={8}>
          <div data-testid="files-ablage-fehler">
            <Statistic title="Prüfung fehlgeschlagen" value={stand.avFehler} />
          </div>
        </Col>
        <Col xs={12} md={8}>
          <div data-testid="files-ablage-parts">
            <Statistic title="Reste abgebrochener Uploads" value={stand.partReste} />
          </div>
        </Col>
      </Row>

      <p data-testid="files-ablage-letzter-lauf">{letzterLaufText(stand.letzterLauf)}</p>

      {/*
       * BEIDE KNOEPFE IN EINEM FORMULAR, unterschieden durch `value` desselben
       * Feldes: zwei Formulare koennten auseinanderlaufen, und der Trockenlauf
       * waere dann nicht mehr die Vorschau DESSELBEN Ausloesers.
       *
       * `Row`/`Col` mit `xs`/`md` statt eigener CSS-Klassen: unter 768px steht
       * jeder Knopf mit `xs={24}` und `block` in voller Breite und untereinander,
       * darueber nebeneinander. Die Umschaltung ist damit CSS (antds Grid) und
       * nicht JavaScript — `Grid.useBreakpoint` waere in einer Server Component
       * ohnehin verboten und zeigte beim ersten Render die falsche Variante.
       */}
      <form action={aufraeumenAction}>
        <Row gutter={[8, 8]}>
          <Col xs={24} md={8}>
            <Button block htmlType="submit" name="modus" value="vorschau">
              Vorschau (Trockenlauf)
            </Button>
          </Col>
          <Col xs={24} md={8}>
            {/*
             * `danger` statt `type="primary"`: die Primaeraktion dieser Seite ist
             * „Freigabe anlegen", und ein zweiter roter Vollknopf daneben waere
             * nicht als LOESCHENDE Handlung zu lesen (`colorError ===
             * colorPrimary`).
             */}
            <Button block danger htmlType="submit" name="modus" value="echt">
              Jetzt aufräumen
            </Button>
          </Col>
        </Row>
      </form>
    </Card>
  );
}

/**
 * Der letzte Lauf in einem Satz — und die drei Faelle, die er unterscheiden
 * muss:
 *
 * - **kein Lauf**: die Tabelle ist leer. Ohne diesen Satz saehe die Kachel aus,
 *   als sei der Timer stumm.
 * - **abgebrochen** (`beendet_at` NULL): der Prozess war mitten im Lauf weg.
 *   Genau daran ist ein Absturz erkennbar (§4.8) — er darf nicht wie ein
 *   erfolgreicher Lauf mit lauter Nullen aussehen.
 * - **Trockenlauf**: die Zahlen sagen, was ein echter Lauf geloescht HAETTE.
 *   Ohne das Wort liest der Betreiber sie als geschehen.
 */
function letzterLaufText(lauf: LetzterLauf | null): string {
  if (lauf === null) {
    return "Noch kein Lauf protokolliert. Der Timer schreibt je Lauf eine Zeile.";
  }

  const wann = zeitpunktGenauBerlin(lauf.gestartetAt);
  const art = lauf.trockenlauf ? "Trockenlauf" : "Lauf";

  if (lauf.beendetAt === null) {
    return `Letzter ${art} am ${wann}: abgebrochen — der Prozess war mitten im Lauf weg.`;
  }

  const zahlen =
    `${lauf.sharesGeloescht} Freigaben, ${lauf.dateienGeloescht} Dateien, ` +
    `${byteTextBinaer(lauf.bytesGeloescht)}, ${lauf.verwaisteBlobsGemeldet} verwaiste Ablagen gemeldet`;
  const geloescht = lauf.trockenlauf ? "haette geloescht" : "geloescht";
  const fehler = lauf.fehler === null ? "" : ` Fehler: ${lauf.fehler}`;

  return `Letzter ${art} am ${wann}: ${geloescht} ${zahlen}.${fehler}`;
}

"use client";

import { useCallback, useId, useRef, useState, useSyncExternalStore, type ChangeEvent, type DragEvent, type ReactNode } from "react";
import { Alert, Button, Input } from "antd";
import { PiArchive, PiArrowLeft, PiKey, PiLinkSimple, PiPrinter, PiUploadSimple, PiX } from "react-icons/pi";
import { reportBrowserExport } from "@/core/audit/browser";
import { zeitzone } from "@/core/zeit";
import { einsatzTexte } from "../../_lib/kern/bericht";
import { GENESIS, type Exportdatei } from "../../_lib/kern/format";
import { zeitpunktText } from "../../_lib/kern/zeit";
import { Einsatzdetail } from "../../_lib/kern/ansichten/Einsatzdetail";
import { Kettenliste } from "../../_lib/kern/ansichten/Kettenliste";
import { Kettenpruefung } from "../../_lib/kern/ansichten/Kettenpruefung";
import { Testband } from "../../_lib/kern/ansichten/Testband";
import { kurz, type Listeneintrag } from "../../_lib/kern/ansichten/modell";
import {
  INHALT_BESCHAEDIGT, KEINE_DATEI, leseDatei, MAX_DATEIGROESSE, oeffneExport, ZU_GROSS, type Geoeffnet, type Oeffnung,
} from "../../_lib/reader/oeffnen";
import { DruckOverlay } from "./DruckOverlay";
import { Fehlergrenze } from "./Fehlergrenze";
import s from "./reader.module.css";

/** Was der Reader von einer gewählten oder abgelegten Datei braucht — `File` erfüllt es. */
type Dateiquelle = Pick<File, "name" | "size" | "text">;

const ohneAbo = () => () => {};
/**
 * WebCrypto (`crypto.subtle`) gibt es nur in einem sicheren Kontext. Über HTTP an einer LAN-IP
 * oder `*.localtest.me` fehlt es, und jede Datei endete nach dem Kennwort als „beschädigt“ —
 * deshalb fragt der Reader vorher. Auf dem Server gilt „sicher“, damit die Hydrierung passt.
 */
const sichererKontext = () => window.isSecureContext === true && Boolean(globalThis.crypto?.subtle);

type Stufe =
  | { art: "leer" }
  | { art: "kennwort"; name: string; datei: Exportdatei; kopfText: string }
  | { art: "offen"; name: string; datei: Exportdatei; wert: Geoeffnet; zone: string; lauf: number };

/**
 * Der Einsatzbuch-Reader (`Einsatzbuch Reader.dc.html`): Datei wählen oder ablegen, Kennwort,
 * dann Kette und Einsätze. Alles bleibt in diesem Tab — keine Server Action, kein Upload, kein
 * Speichern; nur die Tatsache des Öffnens und Druckens geht als Audit-Ereignis an die Suite
 * (Blockbereich und Anzahl, kein Inhalt).
 *
 * `lauf` zählt jeden Neuanfang („Andere Datei“, „Datei schließen“, neue Datei). Ein
 * Ergebnis, das nach einem Neuanfang eintrifft (Lesen oder PBKDF2 laufen asynchron), wird
 * verworfen, statt eine verworfene Datei wieder aufzumachen.
 */
export function Reader({ bereitschaft }: { bereitschaft: string }) {
  const [stufe, setStufe] = useState<Stufe>({ art: "leer" });
  const [fehler, setFehler] = useState<string | null>(null);
  const [ziehen, setZiehen] = useState(false);
  const [kennwort, setKennwort] = useState("");
  const [kwFehler, setKwFehler] = useState<string | null>(null);
  const [beschaedigt, setBeschaedigt] = useState(false);
  const [laeuft, setLaeuft] = useState(false);
  const sicher = useSyncExternalStore(ohneAbo, sichererKontext, () => true);
  const lauf = useRef(0);
  const arbeitet = useRef(false);
  const eingabe = useRef<HTMLInputElement>(null);
  const kennwortId = useId();
  const kwFehlerId = useId();

  function verwerfen() {
    lauf.current++;
    arbeitet.current = false;
    setStufe({ art: "leer" });
    setFehler(null);
    setKennwort("");
    setKwFehler(null);
    setBeschaedigt(false);
    setLaeuft(false);
  }

  async function lesen(datei: Dateiquelle | undefined) {
    if (!datei) return;
    const nr = ++lauf.current;
    // Vor `File.text()`: eine riesige Datei soll den Tab nicht erst in den Speicher laden.
    if (datei.size > MAX_DATEIGROESSE) { setFehler(ZU_GROSS); return; }
    let g: ReturnType<typeof leseDatei>;
    try { g = leseDatei(datei.name, await datei.text(), zeitzone()); }
    catch { g = { ok: false, fehler: KEINE_DATEI(datei.name) }; }
    if (nr !== lauf.current) return;
    if (!g.ok) { setFehler(g.fehler); return; }
    setFehler(null);
    setKennwort("");
    setKwFehler(null);
    setBeschaedigt(false);
    setStufe({ art: "kennwort", name: datei.name, datei: g.datei, kopfText: g.kopfText });
  }

  function gewaehlt(e: ChangeEvent<HTMLInputElement>) {
    const datei = e.target.files?.[0];
    // Sonst ließe sich dieselbe Datei nach „Andere Datei“ nicht noch einmal wählen.
    e.target.value = "";
    void lesen(datei);
  }

  function ablegen(e: DragEvent<HTMLDivElement>) {
    e.preventDefault();
    setZiehen(false);
    void lesen(e.dataTransfer.files?.[0]);
  }

  async function entschluesseln() {
    if (stufe.art !== "kennwort" || !kennwort || arbeitet.current) return;
    const nr = lauf.current;
    const { name, datei } = stufe;
    arbeitet.current = true;
    setLaeuft(true);
    setKwFehler(null);
    setBeschaedigt(false);
    let r: Oeffnung;
    try { r = await oeffneExport(datei, kennwort); }
    catch { r = { ok: false, fehler: INHALT_BESCHAEDIGT, kennwort: false }; }
    if (nr !== lauf.current) return;
    arbeitet.current = false;
    setLaeuft(false);
    if (!r.ok) {
      if (r.kennwort) setKwFehler(r.fehler);
      else setBeschaedigt(true);
      return;
    }
    const offen = ++lauf.current;
    setKennwort("");
    setStufe({ art: "offen", name, datei, wert: r.wert, zone: zeitzone(), lauf: offen });
    reportBrowserExport({ module: "einsatzbuch", format: "reader_oeffnen", von: r.wert.von, bis: r.wert.bis, anzahl: r.wert.anzahl });
  }

  if (stufe.art === "offen") {
    return (
      <div className={s.reader}>
        <Fehlergrenze key={stufe.lauf} onSchliessen={verwerfen}>
          <OffeneDatei name={stufe.name} datei={stufe.datei} wert={stufe.wert} zone={stufe.zone} bereitschaft={bereitschaft} onSchliessen={verwerfen} />
        </Fehlergrenze>
      </div>
    );
  }

  if (stufe.art === "kennwort") {
    return (
      <div className={`${s.reader} ${s.kennwortSpalte}`}>
        <section aria-label="Kennwort" className={`${s.karte} ${s.kennwortKarte}`}>
          <div className={s.dateikopf}>
            <span className={s.dateiZeichen} aria-hidden="true"><PiKey size={22} /></span>
            <div>
              <div className={s.mono} data-dateiname="">{stufe.name}</div>
              <div className={s.gedaempft} data-kopftext="">{stufe.kopfText}</div>
            </div>
          </div>
          <div className={s.feld}>
            <label htmlFor={kennwortId} className={s.feldLabel}>Kennwort</label>
            <Input.Password
              id={kennwortId}
              autoFocus
              autoComplete="off"
              value={kennwort}
              status={kwFehler ? "error" : undefined}
              aria-invalid={kwFehler ? true : undefined}
              aria-describedby={kwFehler ? kwFehlerId : undefined}
              onChange={(e) => { setKennwort(e.target.value); setKwFehler(null); }}
              onPressEnter={(e) => { e.preventDefault(); void entschluesseln(); }}
            />
            {kwFehler && <div id={kwFehlerId} role="alert" className={s.feldFehler} data-kennwort-fehler="">{kwFehler}</div>}
          </div>
          {beschaedigt && <Alert type="warning" showIcon title={INHALT_BESCHAEDIGT} />}
          <div className={s.knoepfe}>
            <Button icon={<PiArrowLeft aria-hidden />} onClick={verwerfen}>Andere Datei</Button>
            <Button type="primary" icon={<PiKey aria-hidden />} disabled={!kennwort || laeuft} onClick={() => void entschluesseln()}>
              {laeuft ? "Entschlüssele …" : "Entschlüsseln"}
            </Button>
          </div>
        </section>
      </div>
    );
  }

  return (
    <div className={`${s.reader} ${s.schmal}`}>
      {sicher ? (
        <div
          className={s.zone}
          data-ziehen={ziehen}
          data-dropzone=""
          onDragOver={(e) => { e.preventDefault(); if (!ziehen) setZiehen(true); }}
          onDragLeave={(e) => { if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setZiehen(false); }}
          onDrop={ablegen}
        >
          <span className={s.zoneZeichen} aria-hidden="true"><PiUploadSimple size={36} /></span>
          <div className={s.zoneTitel}>.einsatzbuch-Datei hierher ziehen</div>
          <div className={s.gedaempft}>oder</div>
          <Button type="primary" icon={<PiArchive aria-hidden />} onClick={() => eingabe.current?.click()}>Datei auswählen</Button>
          <input
            ref={eingabe}
            className={s.versteckt}
            type="file"
            accept=".einsatzbuch,application/json"
            aria-label="Einsatzbuch-Datei"
            onChange={gewaehlt}
          />
        </div>
      ) : (
        <Alert
          type="warning"
          showIcon
          title="Der Reader braucht eine sichere Verbindung"
          description="Öffne die Suite über https://, dann kann der Browser die Datei entschlüsseln."
          data-testid="reader-unsicher"
        />
      )}
      {fehler && <Alert type="warning" showIcon title={fehler} data-testid="reader-fehler" />}
      <ul className={s.hinweise}>
        <Hinweis zeichen={<PiArchive size={18} />} titel="Nichts wird hochgeladen" text="Die Datei wird nur in diesem Tab gelesen. Schließen oder Neuladen verwirft alles." />
        <Hinweis zeichen={<PiKey size={18} />} titel="Entschlüsselung mit Kennwort" text="AES-256-GCM. Ohne das richtige Kennwort bleibt der Inhalt unlesbar." />
        <Hinweis zeichen={<PiLinkSimple size={18} />} titel="Kette wird geprüft" text="Jeder Einsatz wird mit seinem Fingerabdruck und seinem Vorgänger abgeglichen." />
      </ul>
    </div>
  );
}

function Hinweis({ zeichen, titel, text }: { zeichen: ReactNode; titel: string; text: string }) {
  return (
    <li className={s.hinweis}>
      <span className={s.hinweisZeichen} aria-hidden="true">{zeichen}</span>
      <div>
        <div className={s.hinweisTitel}>{titel}</div>
        <div className={s.hinweisText}>{text}</div>
      </div>
    </li>
  );
}

interface OffeneDateiProps {
  name: string;
  datei: Exportdatei;
  wert: Geoeffnet;
  zone: string;
  bereitschaft: string;
  onSchliessen(): void;
}

/**
 * Die geöffnete Datei. Eine eigene Komponente, damit alles, was beim Formatieren werfen
 * könnte (`zeitpunktText`, `einsatzTexte`, `bericht`), UNTER der `Fehlergrenze` rendert — im
 * Körper von `Reader` darüber fing sie es nicht.
 */
function OffeneDatei({ name, datei, wert, zone, bereitschaft, onSchliessen }: OffeneDateiProps) {
  const { eintraege, kette } = wert;
  // Nur die Anzeige sortiert nach Blocknummer; `pruefeKette` hat die Dateireihenfolge geprüft,
  // eine umgestellte Datei bleibt also gebrochen. Den Prüfstatus trägt jeder Eintrag aus seiner
  // Dateiposition mit (`Eintrag.knoten`) — nach der Sortierung wird nichts neu berechnet. Neueste
  // oben; bei doppelter Blocknummer (selbst gebaute Datei) gilt wie in der `Kettenliste` der
  // erste Treffer dieser Reihenfolge.
  const aufsteigend = [...eintraege].sort((x, y) => x.block.kopf.block - y.block.kopf.block);
  const absteigend = [...aufsteigend].reverse();
  const [auswahl, setAuswahl] = useState(() => Math.max(...eintraege.map((e) => e.block.kopf.block)));
  const [druck, setDruck] = useState(false);
  const pdfKnopf = useRef<HTMLButtonElement | HTMLAnchorElement>(null);
  // Stabil, damit das Overlay seinen Escape-Listener nur einmal bindet; der Fokus kehrt zum
  // Knopf zurück, der das Overlay geöffnet hat.
  const schliesseDruck = useCallback(() => { setDruck(false); pdfKnopf.current?.focus(); }, []);

  const liste: Listeneintrag[] = absteigend.map(({ block: b, einsatz, fehler, knoten }) => ({
    block: b.kopf.block,
    nummer: einsatz?.nummer ?? null,
    stichwort: einsatz?.stichwort ?? null,
    ort: einsatz ? einsatzTexte(einsatz, zone).ort : null,
    versiegelt: zeitpunktText(b.kopf.versiegelt, zone),
    hash: b.hash,
    prev: b.kopf.prev,
    knoten,
    ...(fehler ? { fehler } : {}),
  }));
  const erster = aufsteigend[0].block.kopf;
  const fuss = erster.block === 1 && erster.prev === GENESIS
    ? "Block 0 · Anfang der Kette"
    : `Vorgänger #${kurz(erster.prev)} · nicht in der Datei`;
  const gewaehlt = absteigend.find((e) => e.block.kopf.block === auswahl) ?? absteigend[0];
  const titel = wert.anzahl === 1 ? `1 Einsatz · Block ${wert.von}` : `${wert.anzahl} Einsätze · Block ${wert.von}–${wert.bis}`;
  const herkunft = `${wert.quelle} · exportiert ${zeitpunktText(datei.kopf.erstellt, zone)}${wert.exportiertVon ? ` von ${wert.exportiertVon}` : ""}`;
  const b = gewaehlt.block;

  return (
    <div className={s.offen}>
      {wert.test && <Testband text="Testdaten — kein echter Einsatz" />}
      <div className={s.offenKopf}>
        <div>
          <div className={s.dateiname} data-dateiname="">{name}</div>
          <h2 className={s.titel}>{titel}</h2>
        </div>
        <Button icon={<PiX aria-hidden />} onClick={onSchliessen}>Datei schließen</Button>
      </div>

      <section aria-label="Über diese Datei" className={`${s.karte} ${s.info}`}>
        <div className={s.infoSpalte}>
          <span className={s.hinweisZeichen} aria-hidden="true"><PiKey size={20} /></span>
          <div>
            <div className={s.hinweisTitel}>Nur in diesem Tab entschlüsselt</div>
            <div className={s.hinweisText}>Nichts wurde hochgeladen oder gespeichert. Schließen verwirft den Inhalt.</div>
          </div>
        </div>
        <div className={s.infoSpalte}>
          <span className={s.hinweisZeichen} aria-hidden="true"><PiArchive size={20} /></span>
          <div>
            <div className={s.hinweisTitel}>Aus der Verwaltung</div>
            <div className={s.hinweisText} data-herkunft="">{herkunft}</div>
          </div>
        </div>
        <div className={s.infoSpalte}>
          <span className={s.hinweisZeichen} aria-hidden="true"><PiLinkSimple size={20} /></span>
          <div>
            <div className={s.hinweisTitel}>Kettenprüfung</div>
            {wert.anker
              ? <Kettenpruefung zustand={kette} mitSatz anker={wert.anker} zeitzone={zone} />
              : <Kettenpruefung zustand={kette} mitSatz zeitzone={zone} />}
          </div>
        </div>
      </section>

      <div className={s.spalten}>
        <div className={s.links}>
          <Kettenliste eintraege={liste} gewaehlt={auswahl} onWaehle={setAuswahl} kopfRechts="neueste oben" fuss={{ text: fuss }} />
        </div>
        <div className={s.rechts}>
          {gewaehlt.einsatz ? (
            <Einsatzdetail
              block={{ nummer: b.kopf.block, hash: b.hash, prev: b.kopf.prev, versiegelt: b.kopf.versiegelt }}
              einsatz={gewaehlt.einsatz}
              zeitzone={zone}
              dritteKennzahl="gesamt"
              mitDauerzeile
              objektImmer
              kopfRechts={<Button ref={pdfKnopf} icon={<PiPrinter aria-hidden />} onClick={() => setDruck(true)}>PDF erzeugen</Button>}
            />
          ) : (
            <section aria-label={`Block ${b.kopf.block}`} className={`${s.karte} ${s.unlesbar}`} data-unlesbar="">
              <span className={s.kicker}>{`Block ${b.kopf.block}`}</span>
              <p className={s.unlesbarText}>{gewaehlt.fehler}</p>
              <dl className={s.hashbox}>
                <dt>Fingerabdruck</dt><dd>{b.hash}</dd>
                <dt>Vorgänger</dt><dd>{b.kopf.prev}</dd>
                <dt>Versiegelt</dt><dd>{zeitpunktText(b.kopf.versiegelt, zone)}</dd>
              </dl>
            </section>
          )}
        </div>
      </div>

      {druck && gewaehlt.einsatz && (
        <DruckOverlay
          block={b}
          einsatz={gewaehlt.einsatz}
          kette={kette}
          unveraendert={gewaehlt.knoten === "geprueft"}
          dateiname={name}
          bereitschaft={bereitschaft}
          zeitzone={zone}
          onSchliessen={schliesseDruck}
        />
      )}
    </div>
  );
}

/**
 * Verwaltung am Rechner nach `Einsatzbuch v2.dc.html` (Abschnitt „Verwaltung“): Kopfzeile mit
 * „Kette prüfen“ und „Sitzung sperren“, die Karte „Verschlüsselt / Nur auf diesem Rechner /
 * Lückenlose Kette“, Kennzahl-Kacheln, die Einsatzkette, das Detail des gewählten Einsatzes und
 * die Stichwortverteilung. Kettenliste, Detail und Prüfchip sind die geteilten Ansichten des
 * Kerns (`@kern/ansichten`), wie im Reader der Suite. „Herunterladen“ öffnet den Export-Dialog
 * (`verwaltung/ExportDialog.tsx`), „PDF erzeugen“ das Berichtsblatt
 * (`verwaltung/BerichtUeberlagerung.tsx`). Beide hängen an dieser Seite: Sperrt die Sitzung,
 * verschwindet die Seite und nimmt sie mit. Unter dem Stand von Stammdaten und Anker steht die
 * Karte „Einstellungen“ (`verwaltung/Einstellungen.tsx`) mit Sicherung, Wiederherstellen und
 * Autostart. Sie hängt an keinem Ladezustand, damit ein Neuladen nach dem Wiederherstellen ihre
 * Meldung nicht mitnimmt.
 *
 * Die Seite hält nur die gewählte Blocknummer selbst; Klartext kommt ausschließlich aus
 * `zustand` (`verwaltung/useVerwaltung.ts`) und ist nach dem Sperren weg.
 *
 * Der Anker wird bewusst nicht an `Kettenpruefung` gereicht: Dessen Zeile sagt „Anker laut
 * Datei … nicht von der Suite bestätigt“ und gilt für eine Exportdatei. Hier kommt der Anker von
 * der Suite selbst, deshalb steht er als eigene Zeile „Anker bestätigt bis Block n“ daneben
 * (Spec §4.6: beide Ergebnisse getrennt).
 */
import { useState } from "react";

import { Einsatzdetail } from "@kern/ansichten/Einsatzdetail";
import { Kettenliste } from "@kern/ansichten/Kettenliste";
import { Kettenpruefung } from "@kern/ansichten/Kettenpruefung";

import type { Block } from "@kern/format";

import { Hinweis } from "../bausteine/Hinweis";
import { Karte } from "../bausteine/Karte";
import { Knopf } from "../bausteine/Knopf";
import { Zeichen } from "../bausteine/Symbol";
import { befehle } from "../befehle";
import type { Exportumfang } from "../logik/export";
import { ankerAbweichungText, stammdatenVomText } from "../logik/verbindung";
import { BerichtUeberlagerung } from "../verwaltung/BerichtUeberlagerung";
import { Einstellungen } from "../verwaltung/Einstellungen";
import { ExportDialog } from "../verwaltung/ExportDialog";
import { anfangText, kennzahlen, listeneintraege, sitzungText, stichwortVerteilung } from "../verwaltung/modell";
import type { Verwaltungszustand } from "../verwaltung/useVerwaltung";
import type { Ankerabweichung, Sicherungsstand, SitzungInfo, Status } from "../typen";

interface VerwaltungProps {
  zustand: Verwaltungszustand;
  zeitzone: string;
  betrieb: Status["betrieb"];
  bereitschaft: string | null;
  sitzung: SitzungInfo | null;
  eingerichtetAm: string | null;
  eingerichtetVon: string | null;
  stammdatenVom: string | null;
  /** Aus dem Status — bis „Kette prüfen“ einen frischeren Stand liefert. */
  ankerBestaetigtBis: number;
  ankerAbweichung: Ankerabweichung | null;
  sicherung: Sicherungsstand | null;
  /** `status.kette.anzahl === 0` — Bedingung für „Aus Sicherung wiederherstellen“. */
  ketteLeer: boolean;
  beiKettePruefen: () => Promise<void>;
  /** Die App liest den Status neu, mit `ketteNeu` auch Blöcke und Schlüssel. */
  beiEinstellungGeaendert: (ketteNeu: boolean) => Promise<void>;
  beiSperren: () => void;
}

export function Verwaltung(p: VerwaltungProps) {
  const { zustand: z, zeitzone } = p;
  const [gewaehlt, setGewaehlt] = useState<number | null>(null);
  const [prueft, setPrueft] = useState(false);
  const [exportUmfang, setExportUmfang] = useState<Exportumfang | null>(null);
  /** Das offene Berichtsblatt: Block und die beim Öffnen frisch aus Rust gelesenen Angaben. */
  const [druck, setDruck] = useState<{ block: number; erzeugt: string; sitzungName: string; bereitschaft: string } | null>(null);
  const [aktionFehler, setAktionFehler] = useState<string | null>(null);

  async function pruefen() {
    setPrueft(true);
    try {
      await p.beiKettePruefen();
    } finally {
      setPrueft(false);
    }
  }

  /**
   * „PDF erzeugen“: `erzeugt` ist `Status.jetzt` beim Öffnen, frisch gelesen — der Status der
   * App stammt womöglich noch von der Anmeldung.
   */
  async function berichtOeffnen(block: number) {
    setAktionFehler(null);
    try {
      const s = await befehle.status();
      setDruck({ block, erzeugt: s.jetzt, sitzungName: s.sitzung?.name ?? p.sitzung?.name ?? "", bereitschaft: s.bereitschaft ?? p.bereitschaft ?? "" });
    } catch (e) {
      setAktionFehler(typeof e === "string" ? e : String(e));
    }
  }

  const offen = z.art === "offen" ? z : null;
  const stand = offen?.ankerstand ?? null;
  const bestaetigtBis = stand?.bestaetigtBis ?? p.ankerBestaetigtBis;
  const abweichung = stand?.abweichung ?? p.ankerAbweichung;
  const anzahl = offen ? offen.offen.length + offen.zu.length : 0;
  // Ohne Wahl der neueste offene Block (Vorlage: `auswahl` = letzter Block der Kette).
  const auswahl = offen ? (offen.offen.find((o) => o.block.kopf.block === gewaehlt) ?? (gewaehlt === null ? offen.offen.at(-1) : undefined)) : undefined;
  // Nur mit Freigabe heißt „zu“ wirklich „lässt sich nicht öffnen“. Ohne Freigabe (offline,
  // abgelehnt) ist jeder Block zu, ohne kaputt zu sein — dann steht nur der neutrale Hinweis da.
  const ohneFreigabe = offen !== null && offen.fehler !== null;
  const gewaehltZu = offen && !ohneFreigabe && gewaehlt !== null && !auswahl ? offen.zu.some((b) => b.kopf.block === gewaehlt) : false;
  // Die ganze Kette, aufsteigend, wie Rust sie liefert — für den Export.
  const kette: Block[] = offen ? [...offen.offen.map((o) => o.block), ...offen.zu].sort((a, b) => a.kopf.block - b.kopf.block) : [];
  const druckOffen = druck && offen ? offen.offen.find((o) => o.block.kopf.block === druck.block) : undefined;

  return (
    <main className="seite seite-verwaltung" data-screen-label="Verwaltung">
      <div className="verwaltung-kopf">
        <div className="stapel verwaltung-titel">
          <div className="kicker">Verwaltung</div>
          <h1 className="titel">Versiegelte Einsätze</h1>
        </div>
        <div className="reihe-umbruch">
          <Knopf zeichen="verketten" disabled={!offen || prueft} onClick={() => void pruefen()}>
            Kette prüfen
          </Knopf>
          <Knopf zeichen="herunterladen" disabled={!offen || offen.offen.length === 0} onClick={() => setExportUmfang("alle")}>
            Herunterladen
          </Knopf>
          <Knopf zeichen="schluessel" onClick={p.beiSperren}>
            Sitzung sperren
          </Knopf>
        </div>
      </div>

      {offen?.fehler ? <Hinweis ton="warn">{offen.fehler}</Hinweis> : null}
      {aktionFehler ? <Hinweis ton="warn">{aktionFehler}</Hinweis> : null}
      {z.art === "fehler" ? <Hinweis ton="warn">{z.meldung}</Hinweis> : null}

      <Karte>
        <div className="raster raster-260 verwaltung-leitsaetze">
          <div className="leitsatz">
            <div className="leitsatz-zeichen"><Zeichen name="schluessel" groesse={20} /></div>
            <div>
              <div className="leitsatz-titel">Verschlüsselt</div>
              <div className="neben">{p.sitzung ? sitzungText(p.sitzung, zeitzone) : "Sitzung gesperrt. Inhalte liegen nur verschlüsselt vor."}</div>
            </div>
          </div>
          <div className="leitsatz">
            <div className="leitsatz-zeichen"><Zeichen name="archiv" groesse={20} /></div>
            <div>
              <div className="leitsatz-titel">Nur auf diesem Rechner</div>
              <div className="neben">Keine Cloud, keine Übertragung. Sicherung als verschlüsselte Datei.</div>
            </div>
          </div>
          <div className="leitsatz">
            <div className="leitsatz-zeichen"><Zeichen name="verketten" groesse={20} /></div>
            <div className="stapel stapel-4">
              <div className="leitsatz-titel">Lückenlose Kette</div>
              <div className="neben">
                Jeder Block trägt den Fingerabdruck seines Vorgängers. Reihenfolge und Inhalt sind unverändert, wenn alle Glieder passen.
              </div>
              <Kettenpruefung zustand={offen?.pruefung ?? { art: "ungeprueft" }} />
            </div>
          </div>
        </div>
      </Karte>

      <div className="stapel stapel-8">
        <div className="neben verwaltung-stand">
          {p.stammdatenVom ? <span>{stammdatenVomText(p.stammdatenVom, zeitzone)}</span> : null}
          <span>{bestaetigtBis > 0 ? `Anker bestätigt bis Block ${bestaetigtBis}` : "Noch kein Anker von der Suite bestätigt"}</span>
        </div>
        {stand?.offline ? <Hinweis ton="info">Anker nicht geprüft — die Suite ist nicht erreichbar.</Hinweis> : null}
        {offen?.ankerFehler ? <Hinweis ton="warn">{offen.ankerFehler}</Hinweis> : null}
        {abweichung ? <Hinweis ton="warn">{ankerAbweichungText(abweichung)}</Hinweis> : null}
      </div>

      <Einstellungen
        betrieb={p.betrieb}
        sicherung={p.sicherung}
        ketteLeer={p.ketteLeer}
        mitSitzung={p.sitzung !== null}
        zeitzone={zeitzone}
        beiGeaendert={p.beiEinstellungGeaendert}
      />

      {z.art === "laedt" ? (
        <div className="leer" role="status">
          Einsätze werden entschlüsselt …
        </div>
      ) : null}

      {offen ? (
        <>
          <div className="raster raster-180">
            {kennzahlen(offen.offen, { anzahl, zeitzone }).map((k) => (
              <div key={k.label} className="kachel">
                <span className="kachel-zahl">{k.zahl}</span>
                <span className="kachel-label">{k.label}</span>
              </div>
            ))}
          </div>

          <div className="verwaltung-spalten">
            <div className="verwaltung-links">
              <Kettenliste
                eintraege={listeneintraege({ offen: offen.offen, zu: offen.zu, gesperrt: offen.fehler !== null }, offen.pruefung, zeitzone)}
                gewaehlt={auswahl ? auswahl.block.kopf.block : gewaehlt}
                onWaehle={setGewaehlt}
                kopfRechts={`neueste oben · ${anzahl} ${anzahl === 1 ? "Block" : "Blöcke"}`}
                fuss={{ text: anfangText(p.eingerichtetAm, p.eingerichtetVon, zeitzone) }}
              />
            </div>
            {offen.offen.length > 0 || gewaehltZu || ohneFreigabe ? (
              <div className="verwaltung-rechts">
                {auswahl ? (
                  <Einsatzdetail
                    block={{ nummer: auswahl.block.kopf.block, hash: auswahl.block.hash, prev: auswahl.block.kopf.prev, versiegelt: auswahl.block.kopf.versiegelt }}
                    einsatz={auswahl.einsatz}
                    zeitzone={zeitzone}
                    dritteKennzahl="dauer"
                    mitDauerzeile={false}
                    objektImmer={false}
                    kopfRechts={<span className="chip-grau"><Zeichen name="schluessel" groesse={12} />Unveränderlich</span>}
                    aktionen={
                      <>
                        <Knopf zeichen="drucken" onClick={() => void berichtOeffnen(auswahl.block.kopf.block)}>
                          PDF erzeugen
                        </Knopf>
                        <Knopf zeichen="herunterladen" onClick={() => setExportUmfang("einzeln")}>
                          Diesen Einsatz herunterladen
                        </Knopf>
                      </>
                    }
                  />
                ) : gewaehltZu ? (
                  <Karte>
                    <Hinweis ton="warn">{`Block ${gewaehlt} lässt sich nicht öffnen`}</Hinweis>
                  </Karte>
                ) : ohneFreigabe ? (
                  <Karte>
                    <div className="absatz">
                      Die Einsätze liegen nur verschlüsselt vor. Sichtbar bleiben Blocknummer, Zeitpunkt und Fingerabdruck — genug, um die Kette zu prüfen.
                    </div>
                  </Karte>
                ) : null}
                {offen.offen.length > 0 ? (
                  <section className="karte verteilung" aria-label="Alarmstichworte">
                    <h2 className="kicker">Alarmstichworte</h2>
                    {stichwortVerteilung(offen.offen).map((v) => (
                      <div key={v.name} className="verteilung-zeile">
                        <span className="verteilung-name">{v.name}</span>
                        <div className="verteilung-bahn" aria-hidden="true">
                          <div className="verteilung-balken" style={{ width: v.breite }} />
                        </div>
                        <span className="verteilung-anz">{v.anz}</span>
                      </div>
                    ))}
                  </section>
                ) : null}
              </div>
            ) : null}
          </div>
        </>
      ) : null}

      {exportUmfang && offen ? (
        <ExportDialog
          bloecke={kette}
          einzeln={auswahl ? { block: auswahl.block.kopf.block, nummer: auswahl.einsatz.nummer, stichwort: auswahl.einsatz.stichwort } : null}
          umfang={exportUmfang}
          zeitzone={zeitzone}
          beiSchliessen={() => setExportUmfang(null)}
        />
      ) : null}
      {druck && druckOffen ? (
        <BerichtUeberlagerung
          block={druckOffen.block}
          einsatz={druckOffen.einsatz}
          pruefung={offen?.pruefung ?? null}
          bereitschaft={druck.bereitschaft}
          sitzungName={druck.sitzungName}
          erzeugt={druck.erzeugt}
          zeitzone={zeitzone}
          beiSchliessen={() => setDruck(null)}
        />
      ) : null}
    </main>
  );
}

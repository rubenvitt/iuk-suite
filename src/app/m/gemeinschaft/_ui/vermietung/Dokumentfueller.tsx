"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { App, Button, Card, Checkbox, Input, Popconfirm } from "antd";
import { Icons8Ikone } from "@/core/ikonen/Icons8Ikone";
import { Statuschip } from "@/core/status/Statuschip";
import { Seitenkopf } from "@/core/shell/Seitenkopf";
import {
  dokumentFreigabeZurueckAction, dokumentFreigebenAction, dokumentLeitungUnterschriftAction, dokumentVerwerfenAction, dokumentVorOrtAction,
  dokumentWerteAction,
} from "../../_actions/vermietung";
import { eingangText, zeitraumText } from "../../_lib/vermietungText";
import { DOKUMENT_TITEL, type DokumentDTO } from "../../_lib/vermietungTypen";
import { unterschriftfelder, type Werte } from "../../_lib/vertragFeld";
import { UnterschriftFlaeche, type Unterschriftflaeche } from "../unterschrift/UnterschriftFlaeche";
import { useTokensAmBody } from "./teile";
import s from "./vermietung.module.css";

/**
 * Ein Dokument einer Zusage ausfüllen (IDA-354), am Computer vorab oder am Tablet vor Ort: Werte der Text- und
 * Ankreuzfelder, Freigabe (dann steht es auf der Statusseite), die Unterschrift der mietenden Person auf diesem Gerät
 * und danach die Unterschrift der Leitung (IDA-364; ihr Name ist vorbelegt mit der Person, die das Dokument erstellt
 * hat, bei älteren Dokumenten mit `ich`, der angemeldeten Leitung). Jede Aktion schickt die Version mit; ändert jemand parallel, lehnt der Server ab.
 * Die Seite wird nach jeder Aktion neu geladen und diese Insel mit der neuen Version neu aufgebaut.
 */
export function Dokumentfueller({ d, ich }: { d: DokumentDTO; ich: string }) {
  useTokensAmBody();
  const { message } = App.useApp();
  const router = useRouter();
  const [werte, setWerte] = useState<Werte>(d.werte);
  const [laeuft, setLaeuft] = useState(false);
  const titel = DOKUMENT_TITEL[d.art];
  const freigegeben = d.freigegebenAm !== null;
  const eingaben = d.felder.filter((f) => f.art !== "unterschrift");
  const leitungFelder = unterschriftfelder(d.felder, "leitung");
  const leitung = d.unterschriften.find((u) => u.rolle === "leitung") ?? null;
  // Die Leitung unterschreibt nach der mietenden Person; hat sie die Fassung selbst abgelegt, entfällt es.
  const leitungZeigen = leitungFelder.length > 0 && d.datei?.herkunft !== "leitung";
  const leitungOffen = leitungZeigen && !leitung;
  const geaendert = JSON.stringify(sauber(werte)) !== JSON.stringify(sauber(d.werte));
  const ansicht = `/vermietung/dokument/${d.anfrageId}/${d.art}/ansicht`;

  /** Speichert geänderte Werte; gibt die gültige Version zurück oder `null` bei Ablehnung. */
  async function sichern(): Promise<number | null> {
    if (!geaendert) return d.version;
    const r = await dokumentWerteAction(d.anfrageId, d.art, sauber(werte), d.version);
    if (!r.ok) { message.warning(r.fehler); return null; }
    return r.wert;
  }

  async function lauf(f: () => Promise<boolean>) {
    setLaeuft(true);
    try {
      if (await f()) router.refresh();
    } catch {
      message.warning("Das hat gerade nicht geklappt. Prüf bitte die Verbindung.");
    } finally {
      setLaeuft(false);
    }
  }

  const speichern = () => lauf(async () => { const v = await sichern(); if (v !== null) message.success("Gespeichert."); return v !== null; });
  const freigeben = () => lauf(async () => {
    const v = await sichern();
    if (v === null) return false;
    const r = await dokumentFreigebenAction(d.anfrageId, d.art, v);
    if (!r.ok) { message.warning(r.fehler); return true; }
    message.success("Freigegeben.");
    return true;
  });
  const zuruecknehmen = () => lauf(async () => {
    const r = await dokumentFreigabeZurueckAction(d.anfrageId, d.art, d.version);
    if (!r.ok) { message.warning(r.fehler); return false; }
    return true;
  });
  const verwerfen = () => lauf(async () => {
    const r = await dokumentVerwerfenAction(d.anfrageId, d.art);
    if (!r.ok) { message.warning(r.fehler); return false; }
    router.push(`/vermietung/anfragen?id=${d.anfrageId}`);
    return false;
  });

  const stand = d.datei && leitungOffen ? <Statuschip ton="warnung">Unterschrift Leitung offen</Statuschip>
    : d.datei ? <Statuschip ton="ok">Unterschrieben</Statuschip>
    : freigegeben ? <Statuschip ton="info">Freigegeben</Statuschip> : <Statuschip>Entwurf</Statuschip>;

  return (
    <div className={s.modul}>
      <Seitenkopf titel={titel} beschreibung={`${d.anfrage.anlass} · ${zeitraumText(d.anfrage.von, d.anfrage.bis)} · ${d.anfrage.person}`}
        zurueck={{ titel: "Anfragen", href: `/vermietung/anfragen?id=${d.anfrageId}` }}
        aktionen={<div className={s.zeile}>{stand}<Button href={ansicht} target="_blank" icon={<Icons8Ikone name="document" groesse={18} />}>PDF ansehen</Button></div>} />

      {eingaben.length ? (
        <Card title="Angaben" extra={!freigegeben && geaendert ? <Button type="primary" loading={laeuft} onClick={() => void speichern()} data-testid="werte-speichern">Speichern</Button> : null}>
          <div className={s.angaben} data-testid="werte">
            {eingaben.map((f) => f.art === "text" ? (
              <label key={f.id} className={s.angabe}>
                <span className={s.feldname}>{f.name}</span>
                <Input.TextArea autoSize={{ minRows: 1, maxRows: 6 }} maxLength={2000} disabled={freigegeben} value={typeof werte[f.id] === "string" ? (werte[f.id] as string) : ""}
                  onChange={(e) => setWerte((w) => ({ ...w, [f.id]: e.target.value }))} data-feld={f.id} />
              </label>
            ) : (
              <Checkbox key={f.id} className={s.angabe} disabled={freigegeben} checked={werte[f.id] === true}
                onChange={(e) => setWerte((w) => ({ ...w, [f.id]: e.target.checked }))} data-feld={f.id}>{f.name}</Checkbox>
            ))}
          </div>
        </Card>
      ) : null}

      <Card title="Freigabe">
        <div className={s.zeile}>
          {!freigegeben ? (
            <>
              <Button type="primary" loading={laeuft} onClick={() => void freigeben()} data-testid="freigeben">Freigeben</Button>
              <Popconfirm title="Dokument verwerfen?" okText="Verwerfen" cancelText="Abbrechen" onConfirm={() => verwerfen()}>
                <Button type="text" icon={<Icons8Ikone name="trash" groesse={18} />}>Verwerfen</Button>
              </Popconfirm>
            </>
          ) : (
            <>
              <span className={s.neben}>{eingangText(d.freigegebenAm as number)}</span>
              {!d.datei ? <Button loading={laeuft} onClick={() => void zuruecknehmen()} data-testid="freigabe-zurueck">Freigabe zurücknehmen</Button> : null}
            </>
          )}
        </div>
      </Card>

      {freigegeben ? (
        <Card title="Unterschrift der mietenden Person">
          {d.datei ? (
            <div className={s.zeile} data-testid="mieter-unterschrieben">
              <Statuschip ton="ok">{d.datei.unterschriebenVon ?? "Unterschrieben"}</Statuschip>
              <span className={s.neben}>{eingangText(d.datei.abgelegtAm)}</span>
              <Button href={`/vermietung/vertrag/${d.anfrageId}?art=${d.art}`} icon={<Icons8Ikone name="download" groesse={18} />}>Herunterladen</Button>
            </div>
          ) : d.zeichnen ? (
            <Zeichnen name={d.anfrage.person} knopf="Unterschreiben" einverstanden laeuft={laeuft} testId="mieter"
              senden={(name, bild) => lauf(async () => {
                const r = await dokumentVorOrtAction(d.anfrageId, d.art, d.version, { name, bild });
                if (!r.ok) { message.warning(r.fehler); return false; }
                message.success("Unterschrieben.");
                return true;
              })} />
          ) : <Statuschip>Nur Hochladen</Statuschip>}
        </Card>
      ) : null}

      {leitungZeigen ? (
        <Card title="Unterschrift der Leitung">
          {leitung ? (
            <div className={s.zeile} data-testid="leitung-unterschrieben">
              <Statuschip ton="ok">{leitung.name}</Statuschip>
              <span className={s.neben}>{eingangText(leitung.am)}</span>
            </div>
          ) : !d.datei ? <div data-testid="leitung-wartet"><Statuschip>Nach der mietenden Person</Statuschip></div> : (
            <Zeichnen name={d.erstelltVon ?? ich} knopf="Unterschreiben" laeuft={laeuft} testId="leitung"
              senden={(name, bild) => lauf(async () => {
                const r = await dokumentLeitungUnterschriftAction(d.anfrageId, d.art, d.version, { name, bild });
                if (!r.ok) { message.warning(r.fehler); return false; }
                message.success("Unterschrieben.");
                return true;
              })} />
          )}
        </Card>
      ) : null}
    </div>
  );
}

/** Leere Texte und nicht gesetzte Haken zählen nicht; so vergleicht der Server auch. */
function sauber(w: Werte): Werte {
  const aus: Werte = {};
  for (const [k, v] of Object.entries(w)) {
    if (v === true || (typeof v === "string" && v.trim() !== "")) aus[k] = typeof v === "string" ? v.replace(/\r\n?/g, "\n") : v;
  }
  return aus;
}

function Zeichnen({ name: start, knopf, einverstanden: mitHaken = false, laeuft, testId, senden }: {
  name: string; knopf: string; einverstanden?: boolean; laeuft: boolean; testId: string; senden: (name: string, bild: string) => Promise<void>;
}) {
  const [name, setName] = useState(start);
  const [leer, setLeer] = useState(true);
  const [haken, setHaken] = useState(false);
  const flaeche = useRef<Unterschriftflaeche>(null);
  const lid = `unterschrift-${testId}`;
  return (
    <div className={s.zeichnen} data-testid={`zeichnen-${testId}`}>
      <label className={s.angabe}>
        <span className={s.feldname}>Name</span>
        <Input autoComplete="off" maxLength={120} value={name} onChange={(e) => setName(e.target.value)} data-testid={`${testId}-name`} />
      </label>
      <div className={s.angabe}>
        <div className={s.zeile}>
          <span className={s.feldname} id={lid} style={{ flex: 1 }}>Unterschrift</span>
          <Button type="text" disabled={leer} onClick={() => flaeche.current?.leeren()}>Löschen</Button>
        </div>
        <UnterschriftFlaeche ref={flaeche} beschriftetVon={lid} onLeer={setLeer} testId={`${testId}-flaeche`} />
      </div>
      {mitHaken ? <Checkbox checked={haken} onChange={(e) => setHaken(e.target.checked)}>Gelesen und einverstanden</Checkbox> : null}
      <div>
        <Button type="primary" loading={laeuft} disabled={leer || name.trim().length < 2 || (mitHaken && !haken)} data-testid={`${testId}-unterschreiben`}
          onClick={() => { const bild = flaeche.current?.alsPng(); if (bild) void senden(name.trim(), bild); }}>{knopf}</Button>
      </div>
    </div>
  );
}

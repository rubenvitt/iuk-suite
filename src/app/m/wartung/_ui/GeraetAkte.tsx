"use client";

import { useState } from "react";
import Link from "next/link";
import { Button, Card, DatePicker, Descriptions, Form, Input, InputNumber, Modal, Popconfirm, Progress, Tag } from "antd";
import dayjs from "dayjs";
import { loescheEntwurf } from "@/core/entwurf/ablage";
import { fingerabdruck } from "@/core/entwurf/ablage";
import { EntwurfHinweis } from "@/core/entwurf/EntwurfHinweis";
import { useEntwurf } from "@/core/entwurf/useEntwurf";
import { Icons8Ikone } from "@/core/ikonen/Icons8Ikone";
import { WAEHLER_IM_BILD } from "@/core/theme/waehlerImBild";
import { Seitenkopf } from "@/core/shell/Seitenkopf";
import { erledigtEintragenAction, geraetAendernAction, geraetAktivAction, mangelBehebenAction } from "../_actions/verwaltung";
import { NAME_MAX, NOTIZ_MAX } from "../_lib/eingabe";
import { ERGEBNIS_TEXT, intervallText, WER_TEXT, type FristStand } from "../_lib/fristen";
import type { FahrzeugWahl } from "../_lib/fahrzeugsuche";
import type { PruefartZeile } from "../_lib/pruefplan";
import type { BekannteOrte, EintragDTO, GeraetZeile, InhaltDTO, MangelDTO, UnterlageDTO } from "../_lib/typen";
import { GeraetFormular } from "./GeraetFormular";
import { MangelEintrag } from "./MangelEintrag";
import { PruefplanDialog } from "./PruefplanDialog";
import { UnterlagenKarte } from "./UnterlagenKarte";
import { Chip, datum, FristChip, OrtText, stundenText, ZUSTAND_FARBE, ZustandChip } from "./teile";
import { useAktion } from "./useAktion";
import s from "./wartung.module.css";

type Erledigt = { am: string; stunden: number | null; wer: string; notiz: string };

export function GeraetAkte({
  g, inhalt, maengel, verlauf, unterlagen, qr, heute, arten, gruppen, orte, fahrzeuge, katalog,
}: {
  g: GeraetZeile;
  /** Nur bei einer Materialkiste (IDA-335). */
  inhalt: InhaltDTO[];
  maengel: MangelDTO[];
  unterlagen: UnterlageDTO[];
  verlauf: EintragDTO[];
  qr: string;
  heute: string;
  arten: { id: string; einzahl: string }[];
  gruppen: { id: string; name: string }[];
  orte: BekannteOrte;
  fahrzeuge: FahrzeugWahl[];
  /** Der Katalog der Prüfarten (IDA-368), zum Anpassen des Prüfplans. */
  katalog: PruefartZeile[];
}) {
  const { laeuft, feldFehler, setFeldFehler, fuehreAus } = useAktion();
  const [eintragen, setEintragen] = useState<FristStand | null>(null);
  const [erledigt, setErledigt] = useState<Erledigt>({ am: heute, stunden: g.stunden, wer: "", notiz: "" });
  const [aendern, setAendern] = useState(false);
  const [planOffen, setPlanOffen] = useState(false);
  const eigen = new Set(g.plan.filter((p) => p.eigenes).map((p) => p.pruefart.id));
  const zusaetzlich = new Set(g.plan.filter((p) => p.an && !p.standard).map((p) => p.pruefart.id));
  const abgewaehlt = g.plan.filter((p) => p.standard && !p.an);
  // Der Fingerabdruck nur über die Felder des Formulars; derselbe Schlüssel fürs Formular und fürs Löschen.
  const aendernStart = { gruppeId: g.gruppeId, artId: g.artId, name: g.name, hersteller: g.hersteller, typ: g.typ, seriennr: g.seriennr, ortArt: g.ortArt, ort: g.ort, fahrzeugId: g.fahrzeugId, stunden: g.stunden, hinweise: g.hinweise, pruefanleitung: g.pruefanleitung };
  const aendernSchluessel = `wartung:geraet:${g.id}:${fingerabdruck(aendernStart)}`;
  // IDA-358: die Angaben zu „… eintragen" liegen je Gerät und Prüfart auf dem Gerät, bis das Eintragen bestätigt ist.
  const erledigtEntwurf = useEntwurf<Erledigt>({
    schluessel: eintragen ? `wartung:erledigt:${g.id}:${eintragen.vorlage.id}` : null,
    stand: erledigt,
    wiederherstellen: setErledigt,
  });

  const oeffneErledigt = (f: FristStand) => {
    setFeldFehler({});
    setErledigt({ am: heute, stunden: g.stunden, wer: "", notiz: "" });
    setEintragen(f);
  };
  const fehler = (feld: string) => (feldFehler[feld] ? { validateStatus: "error" as const, help: feldFehler[feld] } : {});

  return (
    <>
      <Seitenkopf
        zurueck={{ href: "/geraete", titel: "Geräte" }}
        titel={g.name}
        beschreibung={
          <span className={s.reihe}>
            {g.aktiv ? <ZustandChip z={g.zustand} /> : <Chip farbe="grau">Ausgemustert</Chip>}
            <span className={s.neben}>{g.gruppeName} · {g.artEinzahl}{g.hersteller || g.typ ? ` · ${[g.hersteller, g.typ].filter(Boolean).join(" ")}` : ""}</span>
          </span>
        }
        aktionen={
          <span className={s.reihe}>
            {g.aktiv && <Button href={`/g/${g.id}`} icon={<Icons8Ikone name="qr-code" groesse={16} />}>Am Gerät öffnen</Button>}
            {g.aktiv && <Button icon={<Icons8Ikone name="pencil" groesse={16} />} onClick={() => { setFeldFehler({}); setAendern(true); }}>Bearbeiten</Button>}
            <Popconfirm
              title={g.aktiv ? "Gerät ausmustern?" : "Gerät zurückholen?"}
              description={g.aktiv ? "Es fällt aus Listen und Fristen, der Verlauf bleibt." : undefined}
              okText={g.aktiv ? "Ausmustern" : "Zurückholen"}
              cancelText="Abbrechen"
              onConfirm={() => fuehreAus(() => geraetAktivAction(g.id, !g.aktiv), g.aktiv ? "Ausgemustert." : "Zurückgeholt.")}
            >
              <Button type="text" disabled={laeuft}>{g.aktiv ? "Ausmustern" : "Zurückholen"}</Button>
            </Popconfirm>
          </span>
        }
      />
      <div className={s.akte}>
        <div className={s.spalte}>
          <Card
            title="Prüfungen"
            extra={<Button icon={<Icons8Ikone name="sliders" groesse={16} />} onClick={() => setPlanOffen(true)}>Anpassen</Button>}
          >
            {g.staende.length === 0 && <p className={s.neben} style={{ margin: 0 }}>Keine Prüfungen.</p>}
            <ul className={s.zeilen} aria-label="Prüfungen">
              {g.staende.map((f) => {
                const seit = f.letzte?.stunden != null && g.stunden !== null && f.vorlage.stunden ? g.stunden - f.letzte.stunden : null;
                return (
                  <li key={f.vorlage.id} className={s.frist}>
                    <div className={s.quer}>
                      <div>
                        <span className={s.reihe}>
                          <strong>{f.vorlage.name}</strong> <FristChip f={f} />
                          {zusaetzlich.has(f.vorlage.id) && <Tag>zusätzlich</Tag>}
                          {eigen.has(f.vorlage.id) && <Tag>eigenes Intervall</Tag>}
                        </span>
                        <div className={s.neben}>{intervallText(f.vorlage)} · {WER_TEXT[f.vorlage.wer]}</div>
                      </div>
                      {f.vorlage.wer !== "intern" && g.aktiv && <Button onClick={() => oeffneErledigt(f)}>Erledigt eintragen</Button>}
                    </div>
                    <div className={s.fristwerte}>
                      <span>Zuletzt: {f.letzte ? `${datum(f.letzte.am)}${f.letzte.stunden != null ? ` bei ${stundenText(f.letzte.stunden)}` : ""}` : "nie"}</span>
                      <strong>{f.text}</strong>
                    </div>
                    {seit !== null && f.vorlage.stunden ? (
                      <Progress
                        percent={Math.min(100, Math.round((seit / f.vorlage.stunden) * 100))}
                        format={() => `${seit} von ${f.vorlage.stunden} h`}
                        aria-label="Betriebsstunden seit der letzten Erledigung"
                      />
                    ) : null}
                  </li>
                );
              })}
            </ul>
            {abgewaehlt.length > 0 && (
              <p className={s.neben} style={{ margin: "8px 0 0" }}>Abgewählt: {abgewaehlt.map((p) => p.pruefart.name).join(", ")}</p>
            )}
          </Card>
          {planOffen && <PruefplanDialog geraetId={g.id} plan={g.plan} katalog={katalog} offen schliessen={() => setPlanOffen(false)} />}
          {maengel.length > 0 && (
            <Card title={`Offene Mängel (${maengel.length})`}>
              {maengel.map((m) => (
                <MangelEintrag key={m.id} m={m} laeuft={laeuft} onBehoben={(id) => fuehreAus(() => mangelBehebenAction(id), "Als behoben eingetragen.")} />
              ))}
            </Card>
          )}
          <Card title="Verlauf">
            {verlauf.length === 0 ? <p className={s.neben} style={{ margin: 0 }}>Noch nichts eingetragen.</p> : (
              <ul className={s.zeilen} aria-label="Verlauf">
                {verlauf.map((v) => (
                  <li key={v.id} className={s.verlauf}>
                    <span className={`${s.neben} ${s.ziffern}`}>{datum(v.am)}</span>
                    <div>
                      <span className={s.reihe}>
                        <strong>{v.titel}</strong>
                        {v.ergebnis && <Chip farbe={ZUSTAND_FARBE[v.ergebnis]}>{ERGEBNIS_TEXT[v.ergebnis]}</Chip>}
                      </span>
                      <div className={s.neben}>
                        {[v.wer, v.stunden != null ? stundenText(v.stunden) : null, v.maengel ? `${v.maengel} ${v.maengel === 1 ? "Mangel" : "Mängel"}` : null].filter(Boolean).join(" · ")}
                      </div>
                      {v.notiz && <div>{v.notiz}</div>}
                      {v.antworten && v.antworten.some((a) => !a.ok) && (
                        <div className={s.neben}>{g.kiste ? "Unvollständig (Soll)" : "Mangel bei"}: {v.antworten.filter((a) => !a.ok).map((a) => a.text).join(", ")}</div>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>
        <div className={s.spalte}>
          <Card title="Stammdaten">
            <Descriptions
              column={1}
              items={[
                { key: "g", label: "Gruppe", children: g.gruppeName },
                { key: "a", label: "Geräteart", children: g.artEinzahl },
                { key: "h", label: "Hersteller und Typ", children: [g.hersteller, g.typ].filter(Boolean).join(" ") || "—" },
                { key: "s", label: "Seriennummer", children: <span className={s.mono}>{g.seriennr || "—"}</span> },
                { key: "o", label: g.ortArt === "fahrzeug" ? "Fahrzeug" : "Standort", children: <OrtText ortArt={g.ortArt} ort={g.ort} /> },
                { key: "b", label: "Betriebsstunden", children: <span className={s.ziffern}>{g.stunden !== null ? stundenText(g.stunden) : "nicht erfasst"}</span> },
                { key: "i", label: "Hinweise", children: g.hinweise ? <p className={s.hinweise}>{g.hinweise}</p> : "—" },
              ].filter((z) => !g.kiste || (z.key === "h" ? Boolean(g.hersteller || g.typ) : z.key === "s" ? Boolean(g.seriennr) : z.key === "b" ? g.stunden !== null : z.key === "i" ? Boolean(g.hinweise) : true))}
            />
          </Card>
          {g.kiste && (
            <Card
              title={`Inhalt (${inhalt.length})`}
              extra={g.aktiv && <Button href={`/g/${g.id}/inhalt`} icon={<Icons8Ikone name="pencil" groesse={16} />}>Bearbeiten</Button>}
            >
              {inhalt.length === 0 ? <p className={s.neben} style={{ margin: 0 }}>Noch keine Inhaltsliste.</p> : (
                <ul className={s.inhaltListe} aria-label="Inhalt">
                  {inhalt.map((p) => (
                    <li key={p.id} className={s.inhaltPosten}>
                      <span className={s.soll}>{p.soll} ×</span>
                      <span>{p.text}{p.bemerkung && <span className={s.neben}> · {p.bemerkung}</span>}</span>
                    </li>
                  ))}
                </ul>
              )}
            </Card>
          )}
          <UnterlagenKarte geraetId={g.id} unterlagen={unterlagen} aktiv={g.aktiv} />
          <Card title="QR-Etikett">
            <div className={s.qrRahmen}>
              <div className={s.qr} dangerouslySetInnerHTML={{ __html: qr }} />
              <Link href={g.kiste ? `/etiketten/kisten?geraet=${g.id}` : `/etiketten?geraet=${g.id}`}>Etikett drucken</Link>
            </div>
          </Card>
        </div>
      </div>

      <Modal
        open={eintragen !== null}
        title={eintragen ? `${eintragen.vorlage.name} eintragen` : ""}
        okText="Eintragen"
        cancelText="Abbrechen"
        confirmLoading={laeuft}
        onCancel={() => setEintragen(null)}
        onOk={() => {
          if (!eintragen) return;
          fuehreAus(() => erledigtEintragenAction(g.id, { pruefartId: eintragen.vorlage.id, ...erledigt }), `${eintragen.vorlage.name} eingetragen.`, () => { erledigtEntwurf.verwerfen(); setEintragen(null); });
        }}
        destroyOnHidden
      >
        <Form layout="vertical" component="div">
          <EntwurfHinweis entwurf={erledigtEntwurf} />
          <Form.Item label="Erledigt am" htmlFor="gw-am" {...fehler("am")}>
            <DatePicker
              id="gw-am"
              format="DD.MM.YYYY"
              style={{ width: "100%" }}
              allowClear={false}
              value={dayjs(erledigt.am)}
              maxDate={dayjs(heute)}
              popupAlign={WAEHLER_IM_BILD}
              onChange={(d) => d && setErledigt({ ...erledigt, am: d.format("YYYY-MM-DD") })}
            />
          </Form.Item>
          {(eintragen?.vorlage.stunden || g.stundenPflicht || g.stunden !== null) && (
            <Form.Item label="Betriebsstunden" htmlFor="gw-erl-stunden" {...fehler("stunden")}>
              <InputNumber id="gw-erl-stunden" min={0} precision={0} suffix="h" style={{ width: "100%" }} value={erledigt.stunden ?? undefined} onChange={(v) => setErledigt({ ...erledigt, stunden: v ?? null })} />
            </Form.Item>
          )}
          <Form.Item label={eintragen?.vorlage.wer === "fachfirma" ? "Fachfirma" : "Prüfer"} htmlFor="gw-wer" {...fehler("wer")}>
            <Input id="gw-wer" maxLength={NAME_MAX} value={erledigt.wer} onChange={(e) => setErledigt({ ...erledigt, wer: e.target.value })} />
          </Form.Item>
          <Form.Item label="Bemerkung" htmlFor="gw-notiz" {...fehler("notiz")}>
            <Input.TextArea id="gw-notiz" rows={3} maxLength={NOTIZ_MAX} value={erledigt.notiz} onChange={(e) => setErledigt({ ...erledigt, notiz: e.target.value })} />
          </Form.Item>
        </Form>
      </Modal>

      {aendern && <GeraetFormular
        entwurfSchluessel={aendernSchluessel}
        offen
        titel="Gerät bearbeiten"
        start={aendernStart}
        gruppen={gruppen}
        arten={arten}
        orte={orte}
        fahrzeuge={fahrzeuge}
        laeuft={laeuft}
        feldFehler={feldFehler}
        onAbbrechen={() => setAendern(false)}
        onSpeichern={(w) => fuehreAus(() => geraetAendernAction(g.id, w), "Gespeichert.", () => { loescheEntwurf(aendernSchluessel); setAendern(false); })}
      />}
    </>
  );
}

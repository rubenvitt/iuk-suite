"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import { Button, Card, Input, InputNumber, Segmented, Select, Switch, Tabs } from "antd";
import { Icons8Ikone } from "@/core/ikonen/Icons8Ikone";
import { Seitenkopf } from "@/core/shell/Seitenkopf";
import { Kartentabelle } from "@/core/tabelle";
import { druckHref } from "../_lib/druckLink";
import { korrektur, markeFuer, type Markierung } from "../_lib/marken";
import { plaetzeImRaum, nutzflaeche, rechne, type Belegung, type Eingabe, type Ergebnis, type Weg, type Zeltbestand } from "../_lib/rechner";
import { ABWEICHUNGEN, BEFUND, RICHTWERTE, RICHTWERTE_BASIS, RICHTWERTE_STAND, ZELTTYPEN, richtwertBasis, zeltName, type Herkunft } from "../_lib/richtwerte";
import s from "./unterkunft.module.css";

const ZAHL = new Intl.NumberFormat("de-DE", { maximumFractionDigits: 1 });
const z = (x: number | null | undefined) => (x == null ? "–" : ZAHL.format(x));
/** Zeltmaße mit zwei Stellen: 5,64 m darf nicht als 5,6 m erscheinen, die Rechnung nutzt 5,64. */
const MASS = new Intl.NumberFormat("de-DE", { maximumFractionDigits: 2 });
const leererBestand = (): Zeltbestand => Object.fromEntries(ZELTTYPEN.map((t) => [t.typ, 0]));

type RaumZustand = { id: number; bezeichnung: string; laenge_m: number; breite_m: number; abzuege: { laenge_m: number; breite_m: number }[]; belegung: Belegung };
type Zustand = {
  weg: Weg;
  trennung: boolean;
  personen: { maenner: number; frauen: number; gesamt: number };
  flaeche: { maenner_m2: number; frauen_m2: number; gesamt_m2: number };
  raeume: RaumZustand[];
  zelte: { maenner: Zeltbestand; frauen: Zeltbestand; gesamt: Zeltbestand };
};

let naechsteRaumId = 1;
const neuerRaum = (nr: number): RaumZustand => ({
  id: naechsteRaumId++, bezeichnung: `Raum ${nr}`, laenge_m: 0, breite_m: 0,
  abzuege: [{ laenge_m: 0, breite_m: 0 }, { laenge_m: 0, breite_m: 0 }], belegung: "maenner",
});

const ANFANG: Zustand = {
  weg: "personen",
  trennung: true,
  personen: { maenner: 0, frauen: 0, gesamt: 0 },
  flaeche: { maenner_m2: 0, frauen_m2: 0, gesamt_m2: 0 },
  raeume: [neuerRaum(1)],
  zelte: { maenner: leererBestand(), frauen: leererBestand(), gesamt: leererBestand() },
};

/** Die Eingabe für den Rechenkern: nur der gewählte Weg, nur die Felder der gewählten Trennung. */
function eingabeAus(st: Zustand): Eingabe {
  const e: Eingabe = { weg: st.weg, trennung: st.trennung };
  if (st.weg === "personen") e.personen = st.trennung ? { maenner: st.personen.maenner, frauen: st.personen.frauen } : { gesamt: st.personen.gesamt };
  if (st.weg === "flaeche") e.flaeche = st.trennung ? { maenner_m2: st.flaeche.maenner_m2, frauen_m2: st.flaeche.frauen_m2 } : { gesamt_m2: st.flaeche.gesamt_m2 };
  if (st.weg === "raeume") {
    e.raeume = st.raeume.map((r) => ({
      bezeichnung: r.bezeichnung, laenge_m: r.laenge_m, breite_m: r.breite_m,
      abzuege: r.abzuege.filter((a) => a.laenge_m > 0 && a.breite_m > 0),
      ...(st.trennung ? { belegung: r.belegung } : {}),
    }));
  }
  if (st.weg === "zelte") e.zelte = st.trennung ? { maenner: st.zelte.maenner, frauen: st.zelte.frauen } : { gesamt: st.zelte.gesamt };
  return e;
}

/** Hängt die Farb-Tokens an den `body`, solange die Seite steht: Auswahllisten rendern in Portale. */
function useTokensAmBody(): void {
  useEffect(() => {
    document.body.classList.add(s.tokens);
    return () => document.body.classList.remove(s.tokens);
  }, []);
}

/**
 * Zahlenfeld. Am Telefon die Zifferntastatur statt der Buchstaben (IDA-390): Anzahlen ganzzahlig,
 * Maße und Flächen mit Komma — dann liest das Feld das Komma auch als Dezimaltrenner.
 */
function Zahl({ label, wert, einheit, onChange, schritt, dezimal }: { label: string; wert: number; einheit?: string; onChange: (v: number) => void; schritt?: number; dezimal?: boolean }) {
  return (
    <InputNumber
      aria-label={label}
      min={0}
      step={schritt ?? 1}
      inputMode={dezimal ? "decimal" : "numeric"}
      decimalSeparator={dezimal ? "," : undefined}
      value={wert}
      onChange={(v) => onChange(typeof v === "number" && Number.isFinite(v) ? v : 0)}
      suffix={einheit}
      style={{ width: "100%" }}
    />
  );
}

function Feld({ titel, children }: { titel: string; children: ReactNode }) {
  return (
    <div className={s.feld}>
      <span className={s.feldTitel}>{titel}</span>
      {children}
    </div>
  );
}

const HERKUNFT_WORT: Record<Herkunft, string> = { belegt: "belegt", annahme: "Annahme", korrigiert: "korrigiert" };

/**
 * Kennzeichnet Werte ohne Quelle („Annahme“) und behobene Rechenfehler („korrigiert“) mit sichtbarem
 * Kurztext, auch am Telefon (IDA-390); belegte bleiben still.
 */
function Marke({ m }: { m: Markierung | null }) {
  if (!m) return null;
  return <span className={`${s.chip} ${m.herkunft === "annahme" ? s.gelb : s.grau} ${s.marke}`}>{m.text}</span>;
}
const markeVon = (k: string) => <Marke m={markeFuer(k)} />;

function Zeile({ etikett, wert, einheit, marke }: { etikett: string; wert: ReactNode; einheit?: string; marke?: ReactNode }) {
  return (
    <tr>
      <th scope="row">{etikett}{marke}</th>
      <td>{wert}{einheit ? <small>{einheit}</small> : null}</td>
    </tr>
  );
}

function Kpi({ titel, wert, einheit, zusatz }: { titel: string; wert: string; einheit?: string; zusatz: string }) {
  return (
    <div className={s.kpi}>
      <div className={s.kpiTitel}>{titel}</div>
      <div className={s.kpiWert}>{wert}{einheit ? <small>{einheit}</small> : null}</div>
      <div className={s.neben}>{zusatz}</div>
    </div>
  );
}

function Grundlage({ st, setze }: { st: Zustand; setze: (f: (alt: Zustand) => Zustand) => void }) {
  const t = st.trennung;
  const raum = (i: number, f: (r: RaumZustand) => RaumZustand) =>
    setze((alt) => ({ ...alt, raeume: alt.raeume.map((r, j) => (j === i ? f(r) : r)) }));
  const zeilen: [keyof Zustand["zelte"], string][] = t ? [["maenner", "Männer"], ["frauen", "Frauen"]] : [["gesamt", "Bestand"]];

  return (
    <Card title="Grundlage">
      <div className={s.felder}>
        <Segmented<Weg>
          block
          aria-label="Grundlage"
          value={st.weg}
          onChange={(weg) => setze((alt) => ({ ...alt, weg }))}
          options={[
            { label: "Personen", value: "personen" },
            { label: "Räume", value: "raeume" },
            { label: "Fläche", value: "flaeche" },
            { label: "Zelte", value: "zelte" },
          ]}
        />
        <label className={s.schalter}>
          <Switch checked={t} onChange={(trennung) => setze((alt) => ({ ...alt, trennung }))} />
          Männer und Frauen getrennt
        </label>

        {st.weg === "personen" ? (
          t ? (
            <div className={s.zweiSpalten}>
              <Feld titel="Männer"><Zahl label="Männer" wert={st.personen.maenner} einheit="Pers." onChange={(v) => setze((a) => ({ ...a, personen: { ...a.personen, maenner: v } }))} /></Feld>
              <Feld titel="Frauen"><Zahl label="Frauen" wert={st.personen.frauen} einheit="Pers." onChange={(v) => setze((a) => ({ ...a, personen: { ...a.personen, frauen: v } }))} /></Feld>
            </div>
          ) : (
            <Feld titel="Personen"><Zahl label="Personen" wert={st.personen.gesamt} einheit="Pers." onChange={(v) => setze((a) => ({ ...a, personen: { ...a.personen, gesamt: v } }))} /></Feld>
          )
        ) : null}

        {st.weg === "flaeche" ? (
          t ? (
            <div className={s.zweiSpalten}>
              <Feld titel="Männer"><Zahl label="Schlaffläche Männer" wert={st.flaeche.maenner_m2} einheit="m²" schritt={10} dezimal onChange={(v) => setze((a) => ({ ...a, flaeche: { ...a.flaeche, maenner_m2: v } }))} /></Feld>
              <Feld titel="Frauen"><Zahl label="Schlaffläche Frauen" wert={st.flaeche.frauen_m2} einheit="m²" schritt={10} dezimal onChange={(v) => setze((a) => ({ ...a, flaeche: { ...a.flaeche, frauen_m2: v } }))} /></Feld>
            </div>
          ) : (
            <Feld titel="Schlaffläche"><Zahl label="Schlaffläche" wert={st.flaeche.gesamt_m2} einheit="m²" schritt={10} dezimal onChange={(v) => setze((a) => ({ ...a, flaeche: { ...a.flaeche, gesamt_m2: v } }))} /></Feld>
          )
        ) : null}

        {st.weg === "raeume" ? (
          <>
            {st.raeume.map((r, i) => {
              const nr = i + 1;
              return (
                <div key={r.id} className={s.raum} data-testid="raum">
                  <div className={s.raumKopf}>
                    <Input aria-label={`Bezeichnung Raum ${nr}`} value={r.bezeichnung} onChange={(e) => { const v = e.target.value; raum(i, (x) => ({ ...x, bezeichnung: v })); }} />
                    {t ? (
                      <Select<Belegung>
                        aria-label={`Belegung Raum ${nr}`}
                        value={r.belegung}
                        onChange={(belegung) => raum(i, (x) => ({ ...x, belegung }))}
                        options={[{ value: "maenner", label: "Männer" }, { value: "frauen", label: "Frauen" }]}
                        style={{ width: 110 }}
                      />
                    ) : <span />}
                    <Button
                      aria-label={`Raum ${nr} entfernen`}
                      icon={<Icons8Ikone name="trash" groesse={16} />}
                      onClick={() => setze((alt) => ({ ...alt, raeume: alt.raeume.filter((_, j) => j !== i) }))}
                    />
                  </div>
                  <div className={s.raumZeile}>
                    <span className={s.neben}>Raum</span>
                    <Zahl label={`Länge Raum ${nr}`} wert={r.laenge_m} einheit="m" dezimal onChange={(v) => raum(i, (x) => ({ ...x, laenge_m: v }))} />
                    <Zahl label={`Breite Raum ${nr}`} wert={r.breite_m} einheit="m" dezimal onChange={(v) => raum(i, (x) => ({ ...x, breite_m: v }))} />
                  </div>
                  {r.abzuege.map((a, j) => (
                    <div key={j} className={s.raumZeile}>
                      <span className={s.neben}>Abzug {j + 1}</span>
                      <Zahl label={`Abzug ${j + 1} Länge Raum ${nr}`} wert={a.laenge_m} einheit="m" dezimal onChange={(v) => raum(i, (x) => ({ ...x, abzuege: x.abzuege.map((b, k) => (k === j ? { ...b, laenge_m: v } : b)) }))} />
                      <Zahl label={`Abzug ${j + 1} Breite Raum ${nr}`} wert={a.breite_m} einheit="m" dezimal onChange={(v) => raum(i, (x) => ({ ...x, abzuege: x.abzuege.map((b, k) => (k === j ? { ...b, breite_m: v } : b)) }))} />
                    </div>
                  ))}
                  <div className={s.raumFuss}>
                    <span>Nutzfläche <b>{z(nutzflaeche(r))} m²</b></span>
                    <span>Plätze <b>{plaetzeImRaum(r)}</b></span>
                  </div>
                </div>
              );
            })}
            <Button icon={<Icons8Ikone name="plus" groesse={16} />} onClick={() => setze((alt) => ({ ...alt, raeume: [...alt.raeume, neuerRaum(alt.raeume.length + 1)] }))}>
              Raum hinzufügen
            </Button>
          </>
        ) : null}

        {st.weg === "zelte" ? (
          <div className={s.zeltraster}>
            <span />
            {ZELTTYPEN.map((t) => <span key={t.typ} className={s.kopfzelle}>{t.bezeichnung}</span>)}
            {zeilen.map(([gruppe, etikett]) => (
              <ZeltZeile
                key={gruppe}
                etikett={etikett}
                bestand={st.zelte[gruppe]}
                onChange={(typ, v) => setze((a) => ({ ...a, zelte: { ...a.zelte, [gruppe]: { ...a.zelte[gruppe], [typ]: v } } }))}
              />
            ))}
          </div>
        ) : null}
      </div>
    </Card>
  );
}

function ZeltZeile({ etikett, bestand, onChange }: { etikett: string; bestand: Zeltbestand; onChange: (typ: string, v: number) => void }) {
  return (
    <>
      <span className={s.neben}>{etikett}</span>
      {ZELTTYPEN.map(({ typ, bezeichnung }) => (
        <Zahl key={typ} label={`${etikett} ${bezeichnung}`} wert={bestand[typ] ?? 0} onChange={(v) => onChange(typ, Math.floor(v))} />
      ))}
    </>
  );
}

function ErgebnisAnsicht({ er }: { er: Ergebnis }) {
  const istPersonen = er.weg === "personen";
  const mix = (liste: { typ: string; anzahl: number }[]) =>
    liste.length ? liste.map((m) => <span key={m.typ} className={`${s.chip} ${s.grau}`}>{m.anzahl} × {zeltName(m.typ)}</span>) : <span className={s.neben}>–</span>;
  return (
    <div className={s.ergebnis} aria-live="polite">
      <div className={s.kpis}>
        <Kpi
          titel={istPersonen ? "Personen" : "Plätze"}
          wert={z(er.personen)}
          zusatz={er.trennung ? `${z(er.gruppen[0].personen)} Männer · ${z(er.gruppen[1].personen)} Frauen` : "ohne Trennung"}
        />
        <Kpi titel="Schlaffläche" wert={z(er.schlafen.flaeche_m2)} einheit="m²" zusatz={`${z(RICHTWERTE.flaeche_je_person_m2)} m² je Person`} />
        <Kpi titel="Toiletten" wert={z(er.sanitaer.toiletten)} zusatz={`dazu ${z(er.sanitaer.urinale)} Urinale`} />
        <Kpi titel="Wasser" wert={z(er.versorgung.wasser_l_tag)} einheit="l" zusatz="je Tag" />
      </div>

      <div className={s.karten}>
        <Card title="Schlafen" size="small">
          <table className={s.werte}><tbody>
            <Zeile etikett="Feldbetten" wert={z(er.material.feldbetten)} einheit="Stk." marke={markeVon("feldbett_je_person")} />
            <Zeile etikett="Decken" wert={z(er.material.decken)} einheit="Stk." marke={markeVon("decken_je_person")} />
            <Zeile etikett="Fläche Gebäude" wert={z(er.schlafen.flaeche_m2)} einheit="m²" marke={markeVon("flaeche_je_person_m2")} />
          </tbody></table>
          {er.kapazitaet?.raeume?.length ? (
            <div className={s.unterzeile}>{er.kapazitaet.raeume.map((r) => `${r.bezeichnung || "Raum"} ${r.plaetze}`).join(" · ")}</div>
          ) : null}
        </Card>

        <Card title={er.weg === "zelte" ? "Zelte (Bestand belegt)" : "Unterbringung im Zelt"} size="small">
          <table className={s.werte}><tbody>
            {er.schlafen.zelte_je_typ.map((t) => <Zeile key={t.typ} etikett={`nur ${zeltName(t.typ)}`} wert={z(t.anzahl)} einheit="Zelte" />)}
          </tbody></table>
          <div className={s.unterzeile}>Mix</div>
          <div className={s.mix}>{mix(er.schlafen.zeltmix)}</div>
          <table className={s.werte} style={{ marginBlockStart: 6 }}><tbody>
            <Zeile etikett="Grundfläche Mix" wert={z(er.schlafen.zeltmix_grundflaeche_m2)} einheit="m²" />
            <Zeile etikett={`Platzbedarf mit ${z(RICHTWERTE.zelt_abstand_m)} m Abstand`} wert={z(er.schlafen.zeltmix_platzbedarf_m2)} einheit="m²" />
          </tbody></table>
        </Card>

        <Card title="Sanitär" size="small">
          <table className={s.werte}><tbody>
            <Zeile etikett="Toiletten" wert={z(er.sanitaer.toiletten)} marke={markeVon("toilette_je_personen_gemischt")} />
            <Zeile etikett="Urinale" wert={z(er.sanitaer.urinale)} marke={<Marke m={korrektur("urinale")} />} />
            <Zeile etikett="Waschplätze" wert={z(er.sanitaer.waschplaetze)} marke={markeVon("waschplatz_je_personen")} />
            <Zeile etikett="Duschen" wert={z(er.sanitaer.duschen)} marke={markeVon("dusche_je_personen")} />
          </tbody></table>
        </Card>

        <Card title="Gesundheit" size="small">
          <table className={s.werte}><tbody>
            <Zeile etikett="Krankenbetten" wert={z(er.gesundheit.betten)} marke={markeVon("krankenbett_je_personen")} />
            <Zeile etikett="Fläche Krankenstation" wert={z(er.gesundheit.flaeche_m2)} einheit="m²" marke={markeVon("krankenflaeche_je_bett_m2")} />
            <Zeile etikett="Isolierstation" wert={er.gesundheit.isolierstation ? "erforderlich" : "nicht erforderlich"} marke={markeVon("isolierstation_ab_personen")} />
          </tbody></table>
        </Card>

        <Card title="Ver- und Entsorgung" size="small">
          <table className={s.werte}><tbody>
            <Zeile etikett="Wasser" wert={z(er.versorgung.wasser_l_tag)} einheit="l/Tag" marke={markeVon("wasser_je_person_l")} />
            <Zeile etikett="davon Trinkwasser" wert={z(er.versorgung.davon_trinkwasser_l_tag)} einheit="l/Tag" />
            <Zeile etikett="Fäkalien" wert={z(er.versorgung.faekalien_l_tag)} einheit="l/Tag" marke={markeVon("faekalien_je_person_l")} />
            <Zeile etikett="Abfall" wert={z(er.versorgung.abfall_l_tag)} einheit="l/Tag" marke={markeVon("abfall_je_person_l")} />
          </tbody></table>
        </Card>

        <Card title="Verpflegung" size="small">
          <table className={s.werte}><tbody>
            <Zeile etikett="Ausgabestellen" wert={`min. ${z(er.verpflegung.ausgabestellen)}`} marke={markeVon("zweite_ausgabestelle_ab_personen")} />
            <Zeile etikett="Sitzplätze" wert={z(er.verpflegung.sitzplaetze)} marke={markeVon("personen_je_sitzplatz")} />
            <Zeile etikett="Biergarnituren" wert={z(er.verpflegung.garnituren)} marke={markeVon("plaetze_je_garnitur")} />
          </tbody></table>
          <div className={s.unterzeile}>Aufenthaltszelte<Marke m={korrektur("aufenthaltszelte")} /></div>
          <div className={s.mix}>{mix(er.verpflegung.aufenthaltszelte_je_typ)}</div>
        </Card>
      </div>
    </div>
  );
}

type RichtwertZeile = { key: string; groesse: string; wert: string; herkunft: Herkunft; quelle: string };

function richtwertZeilen(): RichtwertZeile[] {
  const zeilen: RichtwertZeile[] = RICHTWERTE_BASIS.filter((r) => !r.schluessel.startsWith("zelt_sg")).map((r) => ({
    key: r.schluessel,
    groesse: r.bezeichnung,
    wert: `${z(r.wert)}${r.einheit ? ` ${r.einheit}` : ""}`,
    herkunft: r.herkunft,
    quelle: BEFUND[r.schluessel] ? `${r.quelle} · ${BEFUND[r.schluessel]}` : r.quelle,
  }));
  for (const { typ, bezeichnung } of ZELTTYPEN) {
    const wert = (teil: string) => RICHTWERTE[`zelt_${typ}_${teil}`];
    const basis = richtwertBasis(`zelt_${typ}_schlafplaetze`);
    zeilen.push({
      key: `zelt-${typ}`,
      groesse: `Zelt ${bezeichnung}`,
      wert: `${wert("schlafplaetze")} Feldbetten · ${wert("garnituren")} Garnituren · ${MASS.format(wert("laenge_m"))} × ${MASS.format(wert("breite_m"))} m`,
      herkunft: basis?.herkunft ?? "belegt",
      quelle: `${basis?.quelle ?? ""} · F6`,
    });
  }
  return zeilen;
}

/** Feste Daten, einmal beim Laden gebaut. */
const RICHTWERT_TABELLE = richtwertZeilen();
const ABWEICHUNG_TABELLE = ABWEICHUNGEN.map(([nr, tabelle, rechner]) => ({ nr, tabelle, rechner }));

function RichtwerteAnsicht() {
  return (
    <div className={s.modul}>
      <Card title="Richtwerte" extra={<span className={s.neben}>Stand {RICHTWERTE_STAND}</span>}>
        <Kartentabelle<RichtwertZeile>
          aria-label="Richtwerte"
          rowKey="key"
          dataSource={RICHTWERT_TABELLE}
          leer={{ nichts: "Keine Richtwerte." }}
          scroll={{ x: "max-content" }}
          karte={{ titel: "groesse", kennzeichen: ["herkunft"] }}
          columns={[
            { title: "Größe", key: "groesse", dataIndex: "groesse" },
            { title: "Wert", key: "wert", dataIndex: "wert" },
            {
              title: "Herkunft", key: "herkunft",
              render: (_: unknown, r: RichtwertZeile) => (
                <span className={`${s.chip} ${r.herkunft === "annahme" ? s.gelb : s.grau}`}>{HERKUNFT_WORT[r.herkunft]}</span>
              ),
            },
            { title: "Quelle", key: "quelle", dataIndex: "quelle" },
          ]}
        />
      </Card>
      <Card title="Abweichungen von den Ausgangstabellen">
        <Kartentabelle<(typeof ABWEICHUNG_TABELLE)[number]>
          aria-label="Abweichungen von den Ausgangstabellen"
          rowKey="nr"
          dataSource={ABWEICHUNG_TABELLE}
          leer={{ nichts: "Keine Abweichungen." }}
          scroll={{ x: "max-content" }}
          karte={{ titel: "nr" }}
          columns={[
            { title: "Befund", key: "nr", dataIndex: "nr" },
            { title: "Ausgangstabelle", key: "tabelle", dataIndex: "tabelle" },
            { title: "Rechner", key: "rechner", dataIndex: "rechner" },
          ]}
        />
      </Card>
    </div>
  );
}

/** Der Rechner: Eingabe links, Ergebnis rechts, live gerechnet; dazu die Richtwerte mit Herkunft. */
export function Unterkunftsrechner() {
  useTokensAmBody();
  const [st, setSt] = useState<Zustand>(ANFANG);
  const eingabe = useMemo(() => eingabeAus(st), [st]);
  const ergebnis = useMemo(() => rechne(eingabe), [eingabe]);

  return (
    <div className={s.modul}>
      <Seitenkopf
        titel="Unterkunft und Zelte"
        aktionen={
          <Button
            href={ergebnis.personen > 0 ? druckHref(eingabe) : undefined}
            target="_blank"
            disabled={ergebnis.personen === 0}
            icon={<Icons8Ikone name="print" groesse={16} />}
          >
            Drucken
          </Button>
        }
      />
      <Tabs
        items={[
          {
            key: "rechner",
            label: "Unterkunft planen",
            children: (
              <div className={s.rechner}>
                <Grundlage st={st} setze={setSt} />
                <ErgebnisAnsicht er={ergebnis} />
              </div>
            ),
          },
          { key: "richtwerte", label: "Richtwerte", children: <RichtwerteAnsicht /> },
        ]}
      />
    </div>
  );
}

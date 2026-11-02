"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import { Button, Card, Input, InputNumber, Segmented, Select, Switch, Tabs } from "antd";
import { Icons8Ikone } from "@/core/ikonen/Icons8Ikone";
import { Seitenkopf } from "@/core/shell/Seitenkopf";
import { Kartentabelle } from "@/core/tabelle";
import { plaetzeImRaum, nutzflaeche, rechne, type Belegung, type Eingabe, type Ergebnis, type Weg, type Zeltbestand } from "../_lib/rechner";
import { ABWEICHUNGEN, RICHTWERTE, RICHTWERT_ZEILEN, type Herkunft, type RichtwertSchluessel } from "../_lib/richtwerte";
import s from "./unterkunft.module.css";

const ZAHL = new Intl.NumberFormat("de-DE", { maximumFractionDigits: 1 });
const z = (x: number | null | undefined) => (x == null ? "–" : ZAHL.format(x));
/** Zeltmaße mit zwei Stellen: 5,64 m darf nicht als 5,6 m erscheinen, die Rechnung nutzt 5,64. */
const MASS = new Intl.NumberFormat("de-DE", { maximumFractionDigits: 2 });
const TYPEN = RICHTWERTE.zelte.typen.map((t) => t.typ);
const leererBestand = (): Zeltbestand => Object.fromEntries(TYPEN.map((t) => [t, 0]));

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

function Zahl({ label, wert, einheit, onChange, schritt }: { label: string; wert: number; einheit?: string; onChange: (v: number) => void; schritt?: number }) {
  return (
    <InputNumber
      aria-label={label}
      min={0}
      step={schritt ?? 1}
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

const HERKUNFT_WORT: Record<Herkunft, string> = { tabelle: "Tabelle", korrigiert: "korrigiert", annahme: "Annahme", recherche: "belegt" };

/** Kennzeichnet Werte ohne Quelle („Annahme“) und behobene Rechenfehler („korrigiert“); belegte bleiben still. */
function Marke({ herkunft, bezug }: { herkunft: Herkunft; bezug: string }) {
  if (herkunft === "tabelle" || herkunft === "recherche") return null;
  return (
    <span className={`${s.chip} ${herkunft === "annahme" ? s.gelb : s.grau} ${s.marke}`} title={`Befund ${bezug}, siehe Richtwerte`}>
      {HERKUNFT_WORT[herkunft]}
    </span>
  );
}
const markeVon = (k: RichtwertSchluessel) => <Marke herkunft={RICHTWERTE[k].herkunft} bezug={RICHTWERTE[k].bezug} />;

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
              <Feld titel="Männer"><Zahl label="Schlaffläche Männer" wert={st.flaeche.maenner_m2} einheit="m²" schritt={10} onChange={(v) => setze((a) => ({ ...a, flaeche: { ...a.flaeche, maenner_m2: v } }))} /></Feld>
              <Feld titel="Frauen"><Zahl label="Schlaffläche Frauen" wert={st.flaeche.frauen_m2} einheit="m²" schritt={10} onChange={(v) => setze((a) => ({ ...a, flaeche: { ...a.flaeche, frauen_m2: v } }))} /></Feld>
            </div>
          ) : (
            <Feld titel="Schlaffläche"><Zahl label="Schlaffläche" wert={st.flaeche.gesamt_m2} einheit="m²" schritt={10} onChange={(v) => setze((a) => ({ ...a, flaeche: { ...a.flaeche, gesamt_m2: v } }))} /></Feld>
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
                    <Zahl label={`Länge Raum ${nr}`} wert={r.laenge_m} einheit="m" onChange={(v) => raum(i, (x) => ({ ...x, laenge_m: v }))} />
                    <Zahl label={`Breite Raum ${nr}`} wert={r.breite_m} einheit="m" onChange={(v) => raum(i, (x) => ({ ...x, breite_m: v }))} />
                  </div>
                  {r.abzuege.map((a, j) => (
                    <div key={j} className={s.raumZeile}>
                      <span className={s.neben}>Abzug {j + 1}</span>
                      <Zahl label={`Abzug ${j + 1} Länge Raum ${nr}`} wert={a.laenge_m} einheit="m" onChange={(v) => raum(i, (x) => ({ ...x, abzuege: x.abzuege.map((b, k) => (k === j ? { ...b, laenge_m: v } : b)) }))} />
                      <Zahl label={`Abzug ${j + 1} Breite Raum ${nr}`} wert={a.breite_m} einheit="m" onChange={(v) => raum(i, (x) => ({ ...x, abzuege: x.abzuege.map((b, k) => (k === j ? { ...b, breite_m: v } : b)) }))} />
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
            {TYPEN.map((typ) => <span key={typ} className={s.kopfzelle}>{typ}</span>)}
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
      {TYPEN.map((typ) => (
        <Zahl key={typ} label={`${etikett} ${typ}`} wert={bestand[typ] ?? 0} onChange={(v) => onChange(typ, Math.floor(v))} />
      ))}
    </>
  );
}

function ErgebnisAnsicht({ er }: { er: Ergebnis }) {
  const istPersonen = er.weg === "personen";
  const mix = (liste: { typ: string; anzahl: number }[]) =>
    liste.length ? liste.map((m) => <span key={m.typ} className={`${s.chip} ${s.grau}`}>{m.anzahl} × {m.typ}</span>) : <span className={s.neben}>–</span>;
  const rw = RICHTWERTE;

  return (
    <div className={s.ergebnis} aria-live="polite">
      <div className={s.kpis}>
        <Kpi
          titel={istPersonen ? "Personen" : "Plätze"}
          wert={z(er.personen)}
          zusatz={er.trennung ? `${z(er.gruppen[0].personen)} Männer · ${z(er.gruppen[1].personen)} Frauen` : "ohne Trennung"}
        />
        <Kpi titel="Schlaffläche" wert={z(er.schlafen.flaeche_m2)} einheit="m²" zusatz={`${z(rw.flaecheJePerson.wert)} m² je Person`} />
        <Kpi titel="Toiletten" wert={z(er.sanitaer.toiletten)} zusatz={`dazu ${z(er.sanitaer.urinale)} Urinale`} />
        <Kpi titel="Wasser" wert={z(er.versorgung.wasser_l_tag)} einheit="l" zusatz="je Tag" />
      </div>

      <div className={s.karten}>
        <Card title="Schlafen" size="small">
          <table className={s.werte}><tbody>
            <Zeile etikett="Feldbetten" wert={z(er.material.feldbetten)} einheit="Stk." marke={markeVon("feldbettJePerson")} />
            <Zeile etikett="Decken" wert={z(er.material.decken)} einheit="Stk." marke={markeVon("deckenJePerson")} />
            <Zeile etikett="Fläche Gebäude" wert={z(er.schlafen.flaeche_m2)} einheit="m²" marke={markeVon("flaecheJePerson")} />
          </tbody></table>
          {er.kapazitaet?.raeume?.length ? (
            <div className={s.unterzeile}>{er.kapazitaet.raeume.map((r) => `${r.bezeichnung || "Raum"} ${r.plaetze}`).join(" · ")}</div>
          ) : null}
        </Card>

        <Card title={er.weg === "zelte" ? "Zelte (Bestand belegt)" : "Unterbringung im Zelt"} size="small">
          <table className={s.werte}><tbody>
            {er.schlafen.zelte_je_typ.map((t) => <Zeile key={t.typ} etikett={`nur ${t.typ}`} wert={z(t.anzahl)} einheit="Zelte" />)}
          </tbody></table>
          <div className={s.unterzeile}>Mix</div>
          <div className={s.mix}>{mix(er.schlafen.zeltmix)}</div>
          <table className={s.werte} style={{ marginBlockStart: 6 }}><tbody>
            <Zeile etikett="Grundfläche Mix" wert={z(er.schlafen.zeltmix_grundflaeche_m2)} einheit="m²" />
            <Zeile etikett={`Platzbedarf mit ${z(rw.zeltAbstand.wert)} m Abstand`} wert={z(er.schlafen.zeltmix_platzbedarf_m2)} einheit="m²" />
          </tbody></table>
        </Card>

        <Card title="Sanitär" size="small">
          <table className={s.werte}><tbody>
            <Zeile etikett="Toiletten" wert={z(er.sanitaer.toiletten)} marke={markeVon("toiletteJeGemischt")} />
            <Zeile etikett="Urinale" wert={z(er.sanitaer.urinale)} marke={<Marke herkunft="korrigiert" bezug="W3" />} />
            <Zeile etikett="Waschgelegenheiten" wert={z(er.sanitaer.waschgelegenheiten)} marke={markeVon("waschJe")} />
            {er.sanitaer.duschen != null ? <Zeile etikett="Duschen" wert={z(er.sanitaer.duschen)} marke={markeVon("duscheJe")} /> : null}
          </tbody></table>
        </Card>

        <Card title="Gesundheit" size="small">
          <table className={s.werte}><tbody>
            <Zeile etikett="Krankenbetten" wert={z(er.gesundheit.betten)} marke={markeVon("krankenBettJe")} />
            <Zeile etikett="Fläche Krankenstation" wert={z(er.gesundheit.flaeche_m2)} einheit="m²" marke={markeVon("krankenFlaecheJeBett")} />
            <Zeile etikett="Isolierstation" wert={er.gesundheit.isolierstation ? "erforderlich" : "nicht erforderlich"} marke={markeVon("isolierAbPersonen")} />
          </tbody></table>
        </Card>

        <Card title="Ver- und Entsorgung" size="small">
          <table className={s.werte}><tbody>
            <Zeile etikett="Wasser" wert={z(er.versorgung.wasser_l_tag)} einheit="l/Tag" marke={markeVon("wasserJeTag")} />
            <Zeile etikett="davon Trinkwasser" wert={z(er.versorgung.davon_trinkwasser_l_tag)} einheit="l/Tag" />
            <Zeile etikett="Fäkalien" wert={z(er.versorgung.faekalien_l_tag)} einheit="l/Tag" marke={markeVon("faekalienJeTag")} />
            <Zeile etikett="Abfall" wert={z(er.versorgung.abfall_l_tag)} einheit="l/Tag" marke={markeVon("abfallJeTag")} />
          </tbody></table>
        </Card>

        <Card title="Verpflegung" size="small">
          <table className={s.werte}><tbody>
            <Zeile etikett="Ausgabestellen" wert={`min. ${z(er.verpflegung.ausgabestellen_min)}`} marke={markeVon("ausgabeZweiteAb")} />
            <Zeile etikett="Sitzplätze" wert={z(er.verpflegung.sitzplaetze)} marke={markeVon("sitzAnteil")} />
            <Zeile etikett="Biergarnituren" wert={z(er.verpflegung.garnituren)} marke={markeVon("plaetzeJeGarnitur")} />
          </tbody></table>
          <div className={s.unterzeile}>Aufenthaltszelte<Marke herkunft="korrigiert" bezug="W9" /></div>
          <div className={s.mix}>{mix(er.verpflegung.aufenthaltszelte_je_typ)}</div>
        </Card>
      </div>
    </div>
  );
}

type RichtwertZeile = { key: string; groesse: string; wert: string; herkunft: Herkunft; quelle: string };

function richtwertZeilen(): RichtwertZeile[] {
  const zeilen: RichtwertZeile[] = RICHTWERT_ZEILEN.map(([groesse, k]) => {
    const e = RICHTWERTE[k];
    const wert = k === "sitzAnteil" ? "⅓" : `${z(e.wert)}${e.einheit ? ` ${e.einheit}` : ""}`;
    return { key: k, groesse, wert, herkunft: e.herkunft, quelle: `${"quelle" in e && e.quelle ? e.quelle : "Ausgangstabelle"} · ${e.bezug}` };
  });
  for (const t of RICHTWERTE.zelte.typen) {
    zeilen.push({
      key: `zelt-${t.typ}`,
      groesse: `Zelt ${t.typ}`,
      wert: `${t.schlafplaetze} Feldbetten · ${t.garnituren} Garnituren · ${MASS.format(t.laenge_m)} × ${MASS.format(t.breite_m)} m`,
      herkunft: RICHTWERTE.zelte.herkunft,
      quelle: `${RICHTWERTE.zelte.quelle} · ${RICHTWERTE.zelte.bezug}`,
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
      <Card title="Richtwerte" extra={<span className={s.neben}>Stand {RICHTWERTE.stand}</span>}>
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
  const ergebnis = useMemo(() => rechne(eingabeAus(st)), [st]);

  return (
    <div className={s.modul}>
      <Seitenkopf
        titel="Unterkunft und Zelte"
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

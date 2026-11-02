import type { ReactNode } from "react";
import { nutzflaeche, type Eingabe, type Ergebnis, type Weg } from "../_lib/rechner";
import { RICHTWERTE, type Herkunft, type RichtwertSchluessel } from "../_lib/richtwerte";
import d from "./druck.module.css";

/**
 * Das Druckblatt des Rechners (IDA-330): A4 hoch, schwarz auf weiß, ohne Farbe als Bedeutungsträger.
 * Kopffelder und die Spalte „Ist“ sind zum Ausfüllen von Hand. Reines Markup ohne antd und ohne
 * "use client": die Druckseite rendert es als Server Component (Falle 1, 6).
 */

const ZAHL = new Intl.NumberFormat("de-DE", { maximumFractionDigits: 1 });
const z = (x: number | null | undefined) => (x == null ? "–" : ZAHL.format(x));
const MASS = new Intl.NumberFormat("de-DE", { maximumFractionDigits: 2 });
const TYPEN = RICHTWERTE.zelte.typen.map((t) => t.typ);

const WEG_WORT: Record<Weg, string> = { personen: "Personen", raeume: "Räume", flaeche: "Schlaffläche", zelte: "Zeltbestand" };
const HERKUNFT_WORT: Partial<Record<Herkunft, string>> = { annahme: "Annahme", korrigiert: "korrigiert" };

function Marke({ herkunft }: { herkunft: Herkunft }) {
  const wort = HERKUNFT_WORT[herkunft];
  return wort ? <span className={d.marke}>{wort}</span> : null;
}
const markeVon = (k: RichtwertSchluessel) => <Marke herkunft={RICHTWERTE[k].herkunft} />;

type Zeile = { etikett: string; soll: string; einheit?: string; marke?: ReactNode };

function Abschnitt({ titel, zeilen, unten }: { titel: string; zeilen: Zeile[]; unten?: ReactNode }) {
  return (
    <section className={d.abschnitt}>
      <table className={d.bedarf}>
        <caption>{titel}</caption>
        <thead>
          <tr><th scope="col">Bedarf</th><th scope="col" className={d.soll}>Soll</th><th scope="col" className={d.ist}>Ist</th></tr>
        </thead>
        <tbody>
          {zeilen.map((r) => (
            <tr key={r.etikett}>
              <th scope="row">{r.etikett}{r.marke}</th>
              <td className={d.soll}>{r.soll}{r.einheit ? <small>{` ${r.einheit}`}</small> : null}</td>
              <td className={d.ist} />
            </tr>
          ))}
        </tbody>
      </table>
      {unten ? <div className={d.unten}>{unten}</div> : null}
    </section>
  );
}

function Kopffeld({ titel }: { titel: string }) {
  return (
    <div className={d.kopffeld}>
      <span>{titel}</span>
      <div className={d.schreiblinie} />
    </div>
  );
}

function Kpi({ titel, wert, einheit }: { titel: string; wert: string; einheit?: string }) {
  return (
    <div className={d.kpi}>
      <div className={d.kpiTitel}>{titel}</div>
      <div className={d.kpiWert}>{wert}{einheit ? <small>{` ${einheit}`}</small> : null}</div>
    </div>
  );
}

function Grundlage({ e, er }: { e: Eingabe; er: Ergebnis }) {
  const t = er.trennung;
  const kopf = `Grundlage: ${WEG_WORT[e.weg]}${t ? ", Männer und Frauen getrennt" : ", ohne Trennung"}`;

  if (e.weg === "raeume") {
    const raeume = e.raeume ?? [];
    const plaetze = er.kapazitaet?.raeume ?? [];
    return (
      <section className={d.grundlage}>
        <table className={d.liste}>
          <caption>{kopf}</caption>
          <thead>
            <tr>
              <th scope="col">Raum</th>
              {t ? <th scope="col">Belegung</th> : null}
              <th scope="col" className={d.zahl}>Länge × Breite</th>
              <th scope="col" className={d.zahl}>Abzüge</th>
              <th scope="col" className={d.zahl}>Nutzfläche</th>
              <th scope="col" className={d.zahl}>Plätze</th>
            </tr>
          </thead>
          <tbody>
            {raeume.map((r, i) => {
              const abzuege = (r.abzuege ?? []).filter((a) => a.laenge_m > 0 && a.breite_m > 0);
              return (
                <tr key={i}>
                  <th scope="row">{r.bezeichnung || `Raum ${i + 1}`}</th>
                  {t ? <td>{r.belegung === "frauen" ? "Frauen" : "Männer"}</td> : null}
                  <td className={d.zahl}>{`${MASS.format(r.laenge_m)} × ${MASS.format(r.breite_m)} m`}</td>
                  <td className={d.zahl}>{abzuege.length ? abzuege.map((a) => `${MASS.format(a.laenge_m)} × ${MASS.format(a.breite_m)}`).join(", ") : "–"}</td>
                  <td className={d.zahl}>{`${z(nutzflaeche(r))} m²`}</td>
                  <td className={d.zahl}>{z(plaetze[i]?.plaetze)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </section>
    );
  }

  if (e.weg === "zelte") {
    const gruppen: [string, Record<string, number> | undefined][] = t
      ? [["Männer", e.zelte?.maenner], ["Frauen", e.zelte?.frauen]]
      : [["Bestand", e.zelte?.gesamt]];
    return (
      <section className={d.grundlage}>
        <table className={d.liste}>
          <caption>{kopf}</caption>
          <thead>
            <tr><th scope="col" />{TYPEN.map((typ) => <th key={typ} scope="col" className={d.zahl}>{typ}</th>)}</tr>
          </thead>
          <tbody>
            {gruppen.map(([etikett, b]) => (
              <tr key={etikett}>
                <th scope="row">{etikett}</th>
                {TYPEN.map((typ) => <td key={typ} className={d.zahl}>{z(b?.[typ] ?? 0)}</td>)}
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    );
  }

  const werte: [string, string][] = e.weg === "personen"
    ? (t
      ? [["Männer", `${z(e.personen?.maenner ?? 0)} Pers.`], ["Frauen", `${z(e.personen?.frauen ?? 0)} Pers.`]]
      : [["Personen", `${z(e.personen?.gesamt ?? 0)} Pers.`]])
    : (t
      ? [["Männer", `${z(e.flaeche?.maenner_m2 ?? 0)} m²`], ["Frauen", `${z(e.flaeche?.frauen_m2 ?? 0)} m²`]]
      : [["Schlaffläche", `${z(e.flaeche?.gesamt_m2 ?? 0)} m²`]]);
  return (
    <section className={d.grundlage}>
      <div className={d.grundlageKopf}>{kopf}</div>
      <div className={d.grundlageWerte}>
        {werte.map(([k, v]) => <span key={k}>{`${k} `}<b>{v}</b></span>)}
      </div>
    </section>
  );
}

/** Ein ganzes Druckblatt; `erstellt` ist der fertig formatierte Zeitpunkt in der Suite-Zone. */
export function Druckblatt({ eingabe, er, erstellt }: { eingabe: Eingabe; er: Ergebnis; erstellt: string }) {
  const rw = RICHTWERTE;
  const istPersonen = er.weg === "personen";
  const zusatz = er.trennung ? `${z(er.gruppen[0].personen)} Männer · ${z(er.gruppen[1].personen)} Frauen` : null;
  const nurEinTyp = er.schlafen.zelte_je_typ.map((t) => `${t.typ}: ${z(t.anzahl)}`).join(" · ");

  return (
    <article className={d.blatt} aria-label="Druckblatt Unterkunft">
      <header className={d.kopf}>
        <div>
          <h1 className={d.titel}>Notunterkunft · Bedarf</h1>
          <div className={d.meta}>{`Erstellt ${erstellt} · Richtwerte Stand ${rw.stand}`}</div>
        </div>
      </header>

      <div className={d.kopffelder}>
        <Kopffeld titel="Einsatz" />
        <Kopffeld titel="Objekt / Ort" />
        <Kopffeld titel="Erstellt von" />
      </div>

      <Grundlage e={eingabe} er={er} />

      <div className={d.kpis}>
        <Kpi titel={istPersonen ? "Personen" : "Plätze"} wert={z(er.personen)} />
        <Kpi titel="Schlaffläche" wert={z(er.schlafen.flaeche_m2)} einheit="m²" />
        <Kpi titel="Toiletten" wert={z(er.sanitaer.toiletten)} />
        <Kpi titel="Wasser je Tag" wert={z(er.versorgung.wasser_l_tag)} einheit="l" />
      </div>
      {zusatz ? <div className={d.zusatz}>{zusatz}</div> : null}

      <div className={d.abschnitte}>
        <Abschnitt
          titel="Schlafen"
          zeilen={[
            { etikett: "Feldbetten", soll: z(er.material.feldbetten), einheit: "Stk.", marke: markeVon("feldbettJePerson") },
            { etikett: "Decken", soll: z(er.material.decken), einheit: "Stk.", marke: markeVon("deckenJePerson") },
            { etikett: "Fläche Gebäude", soll: z(er.schlafen.flaeche_m2), einheit: "m²", marke: markeVon("flaecheJePerson") },
          ]}
          unten={er.kapazitaet?.raeume?.length ? er.kapazitaet.raeume.map((r) => `${r.bezeichnung || "Raum"} ${r.plaetze}`).join(" · ") : null}
        />
        <Abschnitt
          titel={er.weg === "zelte" ? "Zelte (Bestand belegt)" : "Unterbringung im Zelt"}
          zeilen={[
            ...er.schlafen.zeltmix.map((m) => ({ etikett: `${m.typ}`, soll: z(m.anzahl), einheit: "Zelte" })),
            { etikett: "Grundfläche", soll: z(er.schlafen.zeltmix_grundflaeche_m2), einheit: "m²" },
            { etikett: `Platzbedarf mit ${z(rw.zeltAbstand.wert)} m Abstand`, soll: z(er.schlafen.zeltmix_platzbedarf_m2), einheit: "m²" },
          ]}
          unten={`Nur ein Typ: ${nurEinTyp}`}
        />
        <Abschnitt
          titel="Sanitär"
          zeilen={[
            { etikett: "Toiletten", soll: z(er.sanitaer.toiletten), marke: markeVon("toiletteJeGemischt") },
            { etikett: "Urinale", soll: z(er.sanitaer.urinale), marke: <Marke herkunft="korrigiert" /> },
            { etikett: "Waschgelegenheiten", soll: z(er.sanitaer.waschgelegenheiten), marke: markeVon("waschJe") },
            ...(er.sanitaer.duschen != null ? [{ etikett: "Duschen", soll: z(er.sanitaer.duschen), marke: markeVon("duscheJe") }] : []),
          ]}
        />
        <Abschnitt
          titel="Gesundheit"
          zeilen={[
            { etikett: "Krankenbetten", soll: z(er.gesundheit.betten), marke: markeVon("krankenBettJe") },
            { etikett: "Fläche Krankenstation", soll: z(er.gesundheit.flaeche_m2), einheit: "m²", marke: markeVon("krankenFlaecheJeBett") },
            { etikett: "Isolierstation", soll: er.gesundheit.isolierstation ? "ja" : "nein", marke: markeVon("isolierAbPersonen") },
          ]}
        />
        <Abschnitt
          titel="Ver- und Entsorgung je Tag"
          zeilen={[
            { etikett: "Wasser", soll: z(er.versorgung.wasser_l_tag), einheit: "l", marke: markeVon("wasserJeTag") },
            { etikett: "davon Trinkwasser", soll: z(er.versorgung.davon_trinkwasser_l_tag), einheit: "l" },
            { etikett: "Fäkalien", soll: z(er.versorgung.faekalien_l_tag), einheit: "l", marke: markeVon("faekalienJeTag") },
            { etikett: "Abfall", soll: z(er.versorgung.abfall_l_tag), einheit: "l", marke: markeVon("abfallJeTag") },
          ]}
        />
        <Abschnitt
          titel="Verpflegung"
          zeilen={[
            { etikett: "Ausgabestellen", soll: `min. ${z(er.verpflegung.ausgabestellen_min)}`, marke: markeVon("ausgabeZweiteAb") },
            { etikett: "Sitzplätze", soll: z(er.verpflegung.sitzplaetze), marke: markeVon("sitzAnteil") },
            { etikett: "Biergarnituren", soll: z(er.verpflegung.garnituren), marke: markeVon("plaetzeJeGarnitur") },
          ]}
          unten={<>Aufenthaltszelte<Marke herkunft="korrigiert" />, nur ein Typ: {er.verpflegung.aufenthaltszelte_je_typ.map((t) => `${t.typ}: ${z(t.anzahl)}`).join(" · ")}</>}
        />
      </div>
    </article>
  );
}

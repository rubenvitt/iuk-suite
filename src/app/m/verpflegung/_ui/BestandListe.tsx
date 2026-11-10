"use client";

import { useState } from "react";
import { Button } from "antd";
import { Filterchips } from "@/core/filterchips/Filterchips";
import { Icons8Ikone } from "@/core/ikonen/Icons8Ikone";
import { Seitenkopf } from "@/core/shell/Seitenkopf";
import { Kartentabelle, nachText, nachZahl, trifftWert, werteAlsFilter } from "@/core/tabelle";
import { artikelZeilen, STUFE_TEXT, STUFEN, type ArtikelZeile, type Stufe } from "../_lib/bestand";
import { datumLang, mengeText, zahlText } from "../_lib/mhd";
import type { ArtikelDTO, ChargeSicht, OrtDTO } from "../_lib/typen";
import { AussondernDialog } from "./AussondernDialog";
import { AusgabeDialog, EingangDialog, type EingangZiel } from "./BuchenDialoge";
import { AmpelChip, Chip } from "./teile";
import s from "./verpflegung.module.css";

/**
 * IDA-382 — DER BESTAND JE ARTIKEL: eine Zeile je Artikel mit Gesamtmenge, gesperrter und abgelaufener Menge und
 * dem nächsten MHD; aufgeklappt die Chargen nach Ablauf zuerst, je mit Ausgeben und Aussondern. Die frühere
 * MHD-Kontrolle ist die Stufe darüber (`?stufe=`); in einer Stufe stehen nur die betroffenen Chargen, aufgeklappt.
 */
export function BestandListe({ artikel, chargen, orte, heute, start }: {
  artikel: ArtikelDTO[];
  chargen: ChargeSicht[];
  orte: OrtDTO[];
  heute: string;
  start: Stufe;
}) {
  const [stufe, setStufe] = useState<Stufe>(start);
  const zeilen = artikelZeilen(artikel, chargen, stufe);
  /*
   * Gemerkt wird, was der Mensch umgeklappt hat, nicht was offen ist (Vorbild `lagerbuch/…/OrtVerfallTabelle.tsx`):
   * in einer Stufe ist alles offen, unter „Alle“ alles zu, und ein Stufenwechsel setzt das zurück.
   */
  const [umgeklappt, setUmgeklappt] = useState<ReadonlySet<string>>(new Set());
  const offenStandard = stufe !== "alle";
  const istOffen = (id: string) => offenStandard !== umgeklappt.has(id);
  const klappe = (id: string) => setUmgeklappt((alt) => {
    const neu = new Set(alt);
    if (neu.has(id)) neu.delete(id);
    else neu.add(id);
    return neu;
  });
  const waehle = (neu: Stufe) => {
    setStufe(neu);
    setUmgeklappt(new Set());
    window.history.replaceState(null, "", neu === "alle" ? window.location.pathname : `?stufe=${neu}`);
  };

  const [einbuchen, setEinbuchen] = useState<EingangZiel | null>(null);
  const [ausgeben, setAusgeben] = useState<ChargeSicht | null>(null);
  const [raus, setRaus] = useState<ChargeSicht | null>(null);
  const zielAus = (z: ArtikelZeile): EingangZiel => {
    const a = artikel.find((x) => x.id === z.id)!;
    return { artikelId: a.id, name: a.name, einheit: a.einheit, mhdArt: a.mhdArt };
  };
  const aktiv = (z: ArtikelZeile) => artikel.find((x) => x.id === z.id)?.aktiv ?? false;

  const chargenListe = (z: ArtikelZeile) => (
    <ul className={s.zeilen} aria-label={`Chargen ${z.name}`} data-rolle="chargen">
      {z.chargen.length === 0 && <li className={`${s.zeile} ${s.neben}`}>Nichts da.</li>}
      {z.chargen.map((c) => (
        <li key={c.id} className={s.zeile} data-rolle="charge">
          <div className={s.charge}>
            <span className={s.mhd}>{datumLang(c.mhd)}</span>
            <AmpelChip status={c.status} />
            <span className={s.neben}>{c.ortKurz}</span>
            <span className={`${s.ziffern} ${s.menge}`}>{mengeText(c.menge, c.einheit)}</span>
          </div>
          <span className={s.reihe}>
            {!c.status.gesperrt && <Button onClick={() => setAusgeben(c)}>Ausgeben</Button>}
            <Button onClick={() => setRaus(c)}>Aussondern</Button>
          </span>
        </li>
      ))}
    </ul>
  );

  const bestandZelle = (z: ArtikelZeile) => (
    <span className={s.reihe}>
      <span className={s.ziffern} data-rolle="gesamt">{mengeText(z.gesamt, z.einheit)}</span>
      {z.zustand.gesperrt > 0 && <Chip farbe="rot">{zahlText(z.zustand.gesperrt)} gesperrt</Chip>}
      {z.zustand.abgelaufen > 0 && <Chip farbe="rot">{zahlText(z.zustand.abgelaufen)} abgelaufen</Chip>}
    </span>
  );
  const mindestZelle = (z: ArtikelZeile) => {
    if (z.mindest === null) return null;
    const knapp = z.gueltig < z.mindest;
    return <div className={`${s.klein} ${s.ziffern} ${knapp ? s.textGelb : s.neben}`}>Mindestbestand {mengeText(z.mindest, z.einheit)}</div>;
  };
  const naechsteZelle = (z: ArtikelZeile) => {
    const c = z.chargen[0];
    return c ? <span className={s.reihe}><span className={s.mhd}>{datumLang(c.mhd)}</span><AmpelChip status={c.status} /></span> : <span className={s.neben}>—</span>;
  };
  const klappKnopf = (z: ArtikelZeile) => (
    <Button
      aria-expanded={istOffen(z.id)}
      aria-label={istOffen(z.id) ? `Chargen ${z.name} ausblenden` : `Chargen ${z.name} anzeigen`}
      onClick={() => klappe(z.id)}
      disabled={z.chargen.length === 0}
      icon={<Icons8Ikone name={istOffen(z.id) ? "chevron-up" : "chevron-down"} groesse={14} />}
    />
  );
  const einbuchenKnopf = (z: ArtikelZeile) => (aktiv(z) ? <Button onClick={() => setEinbuchen(zielAus(z))}>Einbuchen</Button> : null);

  return (
    <>
      <Seitenkopf titel="Bestand" />
      {/* Unter dem Kopf, nicht in seinen Aktionen: dort wüchse die Zeile mit fünf Pillen über den Schirm (320/390). */}
      <Filterchips<Stufe>
        aria-label="Stufe"
        wert={stufe}
        onChange={waehle}
        optionen={STUFEN.map((w) => ({ wert: w, label: STUFE_TEXT[w] }))}
      />
      <Kartentabelle<ArtikelZeile>
        rowKey="id"
        aria-label="Bestand"
        dataSource={zeilen}
        leer={{
          nichts: stufe === "alle" ? "Noch keine Artikel" : "Nichts in dieser Stufe",
          figur: stufe === "alle" ? "verpflegung" : "erledigt",
          gefiltert: "Kein Artikel passt zum Filter.",
        }}
        kartenHoehe={150}
        karte={(z) => (
          <article className={s.karte} data-rolle="bestand-karte">
            <div className={s.quer}>
              <strong>{z.name}</strong>
              {z.vorlaeufig && <Chip farbe="gelb">vorläufig</Chip>}
            </div>
            <div className={s.neben}>{z.kategorie}</div>
            <div>{bestandZelle(z)}{mindestZelle(z)}</div>
            <div className={s.reihe}>
              {z.chargen.length > 0 && (
                <Button aria-expanded={istOffen(z.id)} onClick={() => klappe(z.id)} icon={<Icons8Ikone name={istOffen(z.id) ? "chevron-up" : "chevron-down"} groesse={14} />}>
                  {z.chargen.length === 1 ? "1 Charge" : `${z.chargen.length} Chargen`}
                </Button>
              )}
              {einbuchenKnopf(z)}
            </div>
            {istOffen(z.id) && chargenListe(z)}
          </article>
        )}
        expandable={{
          expandedRowKeys: zeilen.filter((z) => istOffen(z.id)).map((z) => z.id),
          expandedRowRender: chargenListe,
          rowExpandable: (z) => z.chargen.length > 0,
          expandIcon: ({ record }) => klappKnopf(record),
        }}
        columns={[
          {
            title: "Artikel", key: "artikel", sorter: nachText<ArtikelZeile>((z) => z.name),
            filters: werteAlsFilter(zeilen, (z) => z.kategorie), onFilter: trifftWert<ArtikelZeile>((z) => z.kategorie),
            render: (_: unknown, z: ArtikelZeile) => (
              <div>
                <span className={s.reihe}><strong>{z.name}</strong>{z.vorlaeufig && <Chip farbe="gelb">vorläufig</Chip>}</span>
                <div className={s.neben}>{z.kategorie}</div>
              </div>
            ),
          },
          {
            title: "Bestand", key: "bestand", sorter: nachZahl<ArtikelZeile>((z) => z.gesamt),
            render: (_: unknown, z: ArtikelZeile) => <div>{bestandZelle(z)}{mindestZelle(z)}</div>,
          },
          {
            title: "Nächstes MHD", key: "mhd", defaultSortOrder: "ascend", sorter: nachText<ArtikelZeile>((z) => z.erstesMhd || "9999"),
            render: (_: unknown, z: ArtikelZeile) => naechsteZelle(z),
          },
          { title: "Aktion", key: "aktion", render: (_: unknown, z: ArtikelZeile) => einbuchenKnopf(z) },
        ]}
      />
      <EingangDialog key={einbuchen?.artikelId ?? "zu"} ziel={einbuchen} orte={orte} heute={heute} onClose={() => setEinbuchen(null)} />
      <AusgabeDialog key={ausgeben?.id ?? "zu"} charge={ausgeben} onClose={() => setAusgeben(null)} />
      <AussondernDialog charge={raus} onClose={() => setRaus(null)} />
    </>
  );
}

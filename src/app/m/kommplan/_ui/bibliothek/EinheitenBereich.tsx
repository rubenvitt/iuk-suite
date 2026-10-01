"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Button, Drawer, Input, type InputRef } from "antd";
import { flyinBreite } from "@/core/theme/flyin";
import { nachText, Zellentext } from "@/core/tabelle";
import { importiereBibEinheitenAction, loescheBibEintragAction, speichereBibEinheitAction } from "../../_actions/bibliothek";
import { dekodiereText, einheitenAusListe, leseEinheitenCsv, type ImportLesung, type ImportZeile } from "../../_lib/bibliothek/csv";
import { BIB_GRENZE } from "../../_lib/bibliothek/schema";
import type { BibEinheit } from "../../_lib/bibliothek/typen";
import { NETZFEHLER } from "../../_lib/ergebnis";
import { LAENGE } from "../../_lib/plan/schema";
import type { ZeichenIndexEintrag } from "../../_lib/zeichen/grundlagen";
import { ZeichenWahl } from "../editor/ZeichenWahl";
import type { Symbolsatz } from "../zeichnung/Symbole";
import { BibBereich, useBibFormular, type BibBereichZustand } from "./BibBereich";
import { BibFlyin, useFokusNachFlyin } from "./BibFlyin";
import { ImportVorschau } from "./ImportVorschau";

/**
 * Einheiten der Bibliothek (Entscheidungen 11, 12) — im gemeinsamen Rahmen `BibBereich`, dazu „Liste einfügen"
 * (derselbe Parser wie im Flyin des Editors) und „CSV importieren"; beide führen in dieselbe Vorschau.
 */
export function EinheitenBereich({ einheiten, zeichenIndex, symbole, ladeSymbole }: {
  einheiten: BibEinheit[]; zeichenIndex: readonly ZeichenIndexEintrag[]; symbole: Symbolsatz; ladeSymbole: (k: string[]) => void;
}) {
  const router = useRouter();
  const [lesung, setLesung] = useState<ImportLesung | null>(null);
  const [quelle, setQuelle] = useState<"liste" | "csv">("liste");
  const [liste, setListe] = useState<string | null>(null);
  const [importLaeuft, setImportLaeuft] = useState(false);
  const csv = useRef<HTMLInputElement>(null);
  // Nach „Liste einfügen“/„CSV importieren“ samt Vorschau: Fokus zurück auf den Knopf, mit dem es begann (Review Phase 4).
  const listeKnopf = useFokusNachFlyin(liste !== null || (lesung !== null && quelle === "liste"));
  const csvKnopf = useFokusNachFlyin(lesung !== null && quelle === "csv");
  const titelVon = new Map(zeichenIndex.map((e) => [e.schluessel, e.titel]));

  async function liesCsv(datei: File) {
    const text = dekodiereText(new Uint8Array(await datei.arrayBuffer()));
    if (csv.current) csv.current.value = ""; // dieselbe Datei darf gleich noch einmal gewählt werden
    setLesung(leseEinheitenCsv(text));
  }
  async function uebernimm(z: BibBereichZustand<BibEinheit>, neu: ImportZeile[]) {
    setImportLaeuft(true);
    const r = await importiereBibEinheitenAction(neu.map((x) => ({ typ: x.typ, rufname: x.rufname, notiz: x.notiz })))
      .catch(() => ({ ok: false as const, fehler: NETZFEHLER }));
    setImportLaeuft(false);
    setLesung(null);
    z.meldung(r.ok ? `${r.angelegt} angelegt, ${r.uebersprungen} übersprungen.` : r.fehler);
    if (r.ok) router.refresh();
  }

  return (
    <BibBereich<BibEinheit> name="Einheiten der Bibliothek" mehrzahl="Einheiten" neu="Neue Einheit" eintraege={einheiten}
      leer={{ nichts: "Noch keine Einheiten in der Bibliothek.", gefiltert: "Keine Einheit passt zur Suche." }}
      sucheIn={(e) => [e.typ, e.rufname, e.notiz]} karte={{ titel: "rufname" }}
      spalten={(z) => [
        { key: "typ", title: "Typ", dataIndex: "typ", sorter: nachText<BibEinheit>((e) => e.typ),
          render: (_: unknown, e: BibEinheit) => <Button type="link" className="kp-zeilenlink" onClick={() => z.oeffne(e)}>{e.typ}</Button> },
        { key: "rufname", title: "Rufname", dataIndex: "rufname", sorter: nachText<BibEinheit>((e) => e.rufname) },
        { key: "zeichen", title: "Zeichen", render: (_: unknown, e: BibEinheit) => (e.zeichen ? titelVon.get(e.zeichen) ?? e.zeichen : "—") },
        // Freitext über Zellentext (docs/design/README.md „Mobil").
        { key: "notiz", title: "Notiz", render: (_: unknown, e: BibEinheit) => <Zellentext text={e.notiz ?? "—"} /> },
      ]}
      werkzeuge={() => (
        <>
          <Button ref={listeKnopf} onClick={() => { setQuelle("liste"); setListe(""); }}>Liste einfügen</Button>
          <Button ref={csvKnopf} onClick={() => { setQuelle("csv"); csv.current?.click(); }}>CSV importieren</Button>
          <input ref={csv} className="kp-dateifeld" type="file" name="csv" accept=".csv,text/csv,text/plain" tabIndex={-1} aria-hidden="true"
            onChange={(e) => { const d = e.target.files?.[0]; if (d) void liesCsv(d); }} />
          <p className="kp-hilfe">„Liste einfügen“: je Zeile erst der Typ, dann der Rufname (RTW RK UE 40-83-5). CSV mit Semikolon: Typ;Rufname;Notiz — die Notiz darf fehlen, eine Kopfzeile auch.</p>
        </>
      )}>
      {(z) => (
        <>
          <EinheitFlyin {...z.flyin} zeichenIndex={zeichenIndex} symbole={symbole} ladeSymbole={ladeSymbole} />
          <Drawer open={liste !== null} onClose={() => setListe(null)} title="Liste einfügen" size={flyinBreite(520)} destroyOnHidden rootClassName="kp-flyin">
            {liste !== null ? (
              <div className="kp-formular">
                <Input.TextArea autoFocus aria-label="Einheiten, je Zeile eine" value={liste} onChange={(e) => setListe(e.target.value)} autoSize={{ minRows: 6, maxRows: 16 }}
                  placeholder={"RTW RK UE 40-83-5\nKTW RK UE 40-92-1"} />
                <div className="kp-formular-knoepfe">
                  <Button type="primary" disabled={liste.trim() === ""} onClick={() => { setLesung(einheitenAusListe(liste)); setListe(null); }}>Vorschau</Button>
                  <Button onClick={() => setListe(null)}>Abbrechen</Button>
                </div>
              </div>
            ) : null}
          </Drawer>
          <ImportVorschau lesung={lesung} vorhanden={einheiten} laeuft={importLaeuft} onUebernehmen={(n) => void uebernimm(z, n)} onSchliessen={() => setLesung(null)} />
        </>
      )}
    </BibBereich>
  );
}

function EinheitFlyin({ eintrag, zeichenIndex, symbole, ladeSymbole, onSchliessen, onFertig, onWeiter }: BibBereichZustand<BibEinheit>["flyin"] & {
  zeichenIndex: readonly ZeichenIndexEintrag[]; symbole: Symbolsatz; ladeSymbole: (k: string[]) => void;
}) {
  const erstesFeld = useRef<InputRef>(null);
  const fm = useBibFormular(eintrag, erstesFeld);
  const { basis, f } = fm;
  const alt = eintrag !== null && eintrag !== "neu" ? eintrag : null;
  const [typ, setTyp] = useState(alt?.typ ?? "");
  const [rufname, setRufname] = useState(alt?.rufname ?? "");
  const [zeichen, setZeichen] = useState<string | null>(alt?.zeichen ?? null);
  const [notiz, setNotiz] = useState(alt?.notiz ?? "");
  async function speichern(weiter: boolean) {
    const r = await fm.sende(() => speichereBibEinheitAction({ id: alt?.id ?? null, typ, rufname, zeichen, notiz }));
    if (r) (weiter ? onWeiter : onFertig)(`„${r.eintrag.rufname}“ gespeichert.`);
  }
  async function loeschen() {
    if (alt && await fm.sende(() => loescheBibEintragAction({ art: "einheit", id: alt.id }))) onFertig(`„${alt.rufname}“ gelöscht.`);
  }
  return (
    <BibFlyin offen={eintrag !== null} titel={alt ? "Einheit bearbeiten" : "Neue Einheit"} formName="Einheit der Bibliothek" fehler={fm.fehler} laeuft={fm.laeuft}
      onSchliessen={onSchliessen} onSpeichern={() => void speichern(false)} onWeiter={alt ? undefined : () => void speichern(true)}
      onLoeschen={alt ? () => void loeschen() : undefined} onGeoeffnet={fm.onGeoeffnet}>
      <label className="kp-feldname" htmlFor={`${basis}-typ`}>Typ</label>
      <Input ref={erstesFeld} id={`${basis}-typ`} name="typ" value={typ} maxLength={LAENGE.typ} onChange={(e) => setTyp(e.target.value)} {...f("typ").attr} />
      {f("typ").text}
      <label className="kp-feldname" htmlFor={`${basis}-rufname`}>Rufname</label>
      <Input id={`${basis}-rufname`} name="rufname" value={rufname} maxLength={LAENGE.rufname} onChange={(e) => setRufname(e.target.value)} {...f("rufname").attr} />
      {f("rufname").text}
      <fieldset className="kp-abschnitt"><legend>Zeichen</legend>
        <ZeichenWahl wert={zeichen} index={zeichenIndex} symbole={symbole} ladeSymbole={ladeSymbole} planZeichen={[]} onWahl={setZeichen} />
      </fieldset>
      <label className="kp-feldname" htmlFor={`${basis}-notiz`}>Notiz</label>
      <Input.TextArea id={`${basis}-notiz`} name="notiz" value={notiz} maxLength={BIB_GRENZE.notiz} autoSize={{ minRows: 2, maxRows: 6 }} onChange={(e) => setNotiz(e.target.value)} {...f("notiz").attr} />
      {f("notiz").text}
    </BibFlyin>
  );
}

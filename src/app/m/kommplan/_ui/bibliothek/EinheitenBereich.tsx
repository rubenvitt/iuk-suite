"use client";

import { useEffect, useId, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Button, Drawer, Input, type InputRef, type TableProps } from "antd";
import { flyinBreite } from "@/core/theme/flyin";
import { Kartentabelle, nachText, Zellentext } from "@/core/tabelle";
import { importiereBibEinheitenAction, loescheBibEintragAction, speichereBibEinheitAction } from "../../_actions/bibliothek";
import { dekodiereText, einheitenAusListe, leseEinheitenCsv, type ImportLesung, type ImportZeile } from "../../_lib/bibliothek/csv";
import { passt, type BibEinheit } from "../../_lib/bibliothek/typen";
import { LAENGE } from "../../_lib/plan/schema";
import type { ZeichenIndexEintrag } from "../../_lib/zeichen/grundlagen";
import { ZeichenWahl } from "../editor/ZeichenWahl";
import type { Symbolsatz } from "../zeichnung/Symbole";
import { BibFlyin, feldHilfe, useFokusNachFlyin } from "./BibFlyin";
import { ImportVorschau } from "./ImportVorschau";

const NETZ = "Das ging nicht durch. Prüfe die Verbindung und versuche es noch einmal.";

/**
 * Einheiten der Bibliothek (Entscheidungen 11, 12) — Bauform wie `StellenBereich`, dazu „Liste einfügen"
 * (derselbe Parser wie im Flyin des Editors) und „CSV importieren"; beide führen in dieselbe Vorschau.
 */
export function EinheitenBereich({ einheiten, zeichenIndex, symbole, ladeSymbole }: {
  einheiten: BibEinheit[]; zeichenIndex: readonly ZeichenIndexEintrag[]; symbole: Symbolsatz; ladeSymbole: (k: string[]) => void;
}) {
  const router = useRouter();
  const [suche, setSuche] = useState("");
  const [offen, setOffen] = useState<BibEinheit | "neu" | null>(null);
  const neuKnopf = useFokusNachFlyin(offen !== null);
  const [meldung, setMeldung] = useState<string | null>(null);
  /** Zählt „Speichern und nächste": jede Runde montiert ein leeres Formular neu (Fokus wieder im ersten Feld). */
  const [runde, setRunde] = useState(0);
  const [lesung, setLesung] = useState<ImportLesung | null>(null);
  const [liste, setListe] = useState<string | null>(null);
  const [importLaeuft, setImportLaeuft] = useState(false);
  const csv = useRef<HTMLInputElement>(null);
  const titelVon = new Map(zeichenIndex.map((e) => [e.schluessel, e.titel]));
  const sichtbar = einheiten.filter((e) => passt(suche, [e.typ, e.rufname, e.notiz]));

  async function liesCsv(datei: File) {
    const text = dekodiereText(new Uint8Array(await datei.arrayBuffer()));
    if (csv.current) csv.current.value = ""; // dieselbe Datei darf gleich noch einmal gewählt werden
    setLesung(leseEinheitenCsv(text));
  }
  async function uebernimm(neu: ImportZeile[]) {
    setImportLaeuft(true);
    const r = await importiereBibEinheitenAction(neu.map((z) => ({ typ: z.typ, rufname: z.rufname, notiz: z.notiz })))
      .catch(() => ({ ok: false as const, fehler: NETZ }));
    setImportLaeuft(false);
    setLesung(null);
    setMeldung(r.ok ? `${r.angelegt} angelegt, ${r.uebersprungen} übersprungen.` : r.fehler);
    if (r.ok) router.refresh();
  }

  const spalten: NonNullable<TableProps<BibEinheit>["columns"]> = [
    { key: "typ", title: "Typ", dataIndex: "typ", sorter: nachText<BibEinheit>((e) => e.typ),
      render: (_: unknown, e: BibEinheit) => <Button type="link" className="kp-zeilenlink" onClick={() => setOffen(e)}>{e.typ}</Button> },
    { key: "rufname", title: "Rufname", dataIndex: "rufname", sorter: nachText<BibEinheit>((e) => e.rufname) },
    { key: "zeichen", title: "Zeichen", render: (_: unknown, e: BibEinheit) => (e.zeichen ? titelVon.get(e.zeichen) ?? e.zeichen : "—") },
    // Freitext über Zellentext (docs/design/README.md „Mobil").
    { key: "notiz", title: "Notiz", render: (_: unknown, e: BibEinheit) => <Zellentext text={e.notiz ?? "—"} /> },
  ];
  return (
    <section aria-label="Einheiten der Bibliothek" className="kp-bib-bereich">
      <div className="kp-bib-werkzeuge">
        <Input className="kp-bib-suche" aria-label="Einheiten suchen" placeholder="Suchen" allowClear value={suche} onChange={(e) => setSuche(e.target.value)} />
        <Button ref={neuKnopf} type="primary" onClick={() => setOffen("neu")}>Neue Einheit</Button>
        <Button onClick={() => setListe("")}>Liste einfügen</Button>
        <Button onClick={() => csv.current?.click()}>CSV importieren</Button>
        <input ref={csv} className="kp-dateifeld" type="file" name="csv" accept=".csv,text/csv,text/plain" tabIndex={-1} aria-hidden="true"
          onChange={(e) => { const d = e.target.files?.[0]; if (d) void liesCsv(d); }} />
        <p className="kp-hilfe">„Liste einfügen“: je Zeile erst der Typ, dann der Rufname (RTW RK UE 40-83-5). CSV mit Semikolon: Typ;Rufname;Notiz — die Notiz darf fehlen, eine Kopfzeile auch.</p>
      </div>
      {meldung ? <p className="kp-hinweis" role="status">{meldung}</p> : null}
      <Kartentabelle<BibEinheit> aria-label="Einheiten" rowKey="id" dataSource={sichtbar} columns={spalten}
        leer={{ nichts: "Noch keine Einheiten in der Bibliothek.", gefiltert: "Keine Einheit passt zur Suche.", aktiv: suche.trim() !== "" }}
        karte={{ titel: "rufname" }} />
      <EinheitFlyin key={offen === null ? "zu" : offen === "neu" ? `neu:${runde}` : offen.id} eintrag={offen} zeichenIndex={zeichenIndex} symbole={symbole} ladeSymbole={ladeSymbole}
        onSchliessen={() => setOffen(null)} onFertig={(text) => { setOffen(null); setMeldung(text); router.refresh(); }}
        onWeiter={(text) => { setMeldung(text); setRunde((n) => n + 1); router.refresh(); }} />
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
      <ImportVorschau lesung={lesung} vorhanden={einheiten} laeuft={importLaeuft} onUebernehmen={(n) => void uebernimm(n)} onSchliessen={() => setLesung(null)} />
    </section>
  );
}

function EinheitFlyin({ eintrag, zeichenIndex, symbole, ladeSymbole, onSchliessen, onFertig, onWeiter }: {
  eintrag: BibEinheit | "neu" | null; zeichenIndex: readonly ZeichenIndexEintrag[]; symbole: Symbolsatz; ladeSymbole: (k: string[]) => void;
  onSchliessen: () => void; onFertig: (meldung: string) => void; onWeiter: (meldung: string) => void;
}) {
  const basis = useId();
  const erstesFeld = useRef<InputRef>(null);
  // Fokus beim Öffnen ins erste Feld (wie „Neuer Plan"); nach „Speichern und nächste" montiert das Formular neu (key).
  useEffect(() => { if (eintrag !== null) erstesFeld.current?.focus(); }, [eintrag]);
  const alt = eintrag !== null && eintrag !== "neu" ? eintrag : null;
  const [typ, setTyp] = useState(alt?.typ ?? "");
  const [rufname, setRufname] = useState(alt?.rufname ?? "");
  const [zeichen, setZeichen] = useState<string | null>(alt?.zeichen ?? null);
  const [notiz, setNotiz] = useState(alt?.notiz ?? "");
  const [fehler, setFehler] = useState<string | null>(null);
  const [feldFehler, setFeldFehler] = useState<Record<string, string>>({});
  const [laeuft, setLaeuft] = useState(false);
  const f = (name: string) => feldHilfe(basis, feldFehler, name);
  async function speichern(weiter: boolean) {
    setLaeuft(true);
    const r = await speichereBibEinheitAction({ id: alt?.id ?? null, typ, rufname, zeichen, notiz })
      .catch(() => ({ ok: false as const, fehler: NETZ }));
    setLaeuft(false);
    if (r.ok) { (weiter ? onWeiter : onFertig)(`„${r.eintrag.rufname}“ gespeichert.`); return; }
    setFehler(r.fehler); setFeldFehler("feldFehler" in r && r.feldFehler ? r.feldFehler : {});
  }
  async function loeschen() {
    if (!alt) return;
    setLaeuft(true);
    const r = await loescheBibEintragAction({ art: "einheit", id: alt.id }).catch(() => ({ ok: false as const, fehler: NETZ }));
    setLaeuft(false);
    if (r.ok) onFertig(`„${alt.rufname}“ gelöscht.`); else setFehler(r.fehler);
  }
  return (
    <BibFlyin offen={eintrag !== null} titel={alt ? "Einheit bearbeiten" : "Neue Einheit"} formName="Einheit der Bibliothek" fehler={fehler} laeuft={laeuft}
      onSchliessen={onSchliessen} onSpeichern={() => void speichern(false)} onWeiter={alt ? undefined : () => void speichern(true)}
      onLoeschen={alt ? () => void loeschen() : undefined} onGeoeffnet={() => erstesFeld.current?.focus()}>
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
      <Input.TextArea id={`${basis}-notiz`} name="notiz" value={notiz} maxLength={500} autoSize={{ minRows: 2, maxRows: 6 }} onChange={(e) => setNotiz(e.target.value)} {...f("notiz").attr} />
      {f("notiz").text}
    </BibFlyin>
  );
}

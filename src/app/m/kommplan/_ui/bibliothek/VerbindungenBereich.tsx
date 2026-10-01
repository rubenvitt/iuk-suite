"use client";

import { useEffect, useId, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Button, Input, Select, type InputRef, type TableProps } from "antd";
import { Kartentabelle, nachText, Zellentext } from "@/core/tabelle";
import { loescheBibEintragAction, speichereBibVerbindungAction } from "../../_actions/bibliothek";
import { passt, type BibVerbindung } from "../../_lib/bibliothek/typen";
import { ART_NAME, LAENGE, VERBINDUNGS_ARTEN, type VerbindungsArt } from "../../_lib/plan/schema";
import { BibFlyin, feldHilfe } from "./BibFlyin";

const NETZ = "Das ging nicht durch. Prüfe die Verbindung und versuche es noch einmal.";

/** Verbindungen der Bibliothek (Entscheidung 11) — Bauform wie `StellenBereich`. */
export function VerbindungenBereich({ verbindungen }: { verbindungen: BibVerbindung[] }) {
  const router = useRouter();
  const [suche, setSuche] = useState("");
  const [offen, setOffen] = useState<BibVerbindung | "neu" | null>(null);
  const [meldung, setMeldung] = useState<string | null>(null);
  /** Zählt „Speichern und nächste": jede Runde montiert ein leeres Formular neu (Fokus wieder im ersten Feld). */
  const [runde, setRunde] = useState(0);
  const sichtbar = verbindungen.filter((v) => passt(suche, [v.bezeichnung, ART_NAME[v.art], v.notiz]));
  const spalten: NonNullable<TableProps<BibVerbindung>["columns"]> = [
    { key: "bezeichnung", title: "Bezeichnung", dataIndex: "bezeichnung", sorter: nachText<BibVerbindung>((v) => v.bezeichnung),
      render: (_: unknown, v: BibVerbindung) => <Button type="link" className="kp-zeilenlink" onClick={() => setOffen(v)}>{v.bezeichnung}</Button> },
    { key: "art", title: "Art", render: (_: unknown, v: BibVerbindung) => ART_NAME[v.art] },
    { key: "notiz", title: "Notiz", render: (_: unknown, v: BibVerbindung) => <Zellentext text={v.notiz ?? "—"} /> },
  ];
  return (
    <section aria-label="Verbindungen der Bibliothek" className="kp-bib-bereich">
      <div className="kp-bib-werkzeuge">
        <Input className="kp-bib-suche" aria-label="Verbindungen suchen" placeholder="Suchen" allowClear value={suche} onChange={(e) => setSuche(e.target.value)} />
        <Button type="primary" onClick={() => setOffen("neu")}>Neue Verbindung</Button>
      </div>
      {meldung ? <p className="kp-hinweis" role="status">{meldung}</p> : null}
      <Kartentabelle<BibVerbindung> aria-label="Verbindungen" rowKey="id" dataSource={sichtbar} columns={spalten}
        leer={{ nichts: "Noch keine Verbindungen in der Bibliothek.", gefiltert: "Keine Verbindung passt zur Suche.", aktiv: suche.trim() !== "" }}
        karte={{ titel: "bezeichnung" }} />
      <VerbindungFlyin key={offen === null ? "zu" : offen === "neu" ? `neu:${runde}` : offen.id} eintrag={offen}
        onSchliessen={() => setOffen(null)} onFertig={(text) => { setOffen(null); setMeldung(text); router.refresh(); }}
        onWeiter={(text) => { setMeldung(text); setRunde((n) => n + 1); router.refresh(); }} />
    </section>
  );
}

function VerbindungFlyin({ eintrag, onSchliessen, onFertig, onWeiter }: {
  eintrag: BibVerbindung | "neu" | null; onSchliessen: () => void; onFertig: (meldung: string) => void; onWeiter: (meldung: string) => void;
}) {
  const basis = useId();
  const erstesFeld = useRef<InputRef>(null);
  // Fokus beim Öffnen ins erste Feld (wie „Neuer Plan"); nach „Speichern und nächste" montiert das Formular neu (key).
  useEffect(() => { if (eintrag !== null) erstesFeld.current?.focus(); }, [eintrag]);
  const alt = eintrag !== null && eintrag !== "neu" ? eintrag : null;
  const [bezeichnung, setBezeichnung] = useState(alt?.bezeichnung ?? "");
  const [art, setArt] = useState<VerbindungsArt>(alt?.art ?? "tmo");
  const [notiz, setNotiz] = useState(alt?.notiz ?? "");
  const [fehler, setFehler] = useState<string | null>(null);
  const [feldFehler, setFeldFehler] = useState<Record<string, string>>({});
  const [laeuft, setLaeuft] = useState(false);
  const f = (name: string) => feldHilfe(basis, feldFehler, name);
  async function speichern(weiter: boolean) {
    setLaeuft(true);
    const r = await speichereBibVerbindungAction({ id: alt?.id ?? null, art, bezeichnung, notiz })
      .catch(() => ({ ok: false as const, fehler: NETZ }));
    setLaeuft(false);
    if (r.ok) { (weiter ? onWeiter : onFertig)(`„${r.eintrag.bezeichnung}“ gespeichert.`); return; }
    setFehler(r.fehler); setFeldFehler("feldFehler" in r && r.feldFehler ? r.feldFehler : {});
  }
  async function loeschen() {
    if (!alt) return;
    setLaeuft(true);
    const r = await loescheBibEintragAction({ art: "verbindung", id: alt.id }).catch(() => ({ ok: false as const, fehler: NETZ }));
    setLaeuft(false);
    if (r.ok) onFertig(`„${alt.bezeichnung}“ gelöscht.`); else setFehler(r.fehler);
  }
  return (
    <BibFlyin offen={eintrag !== null} titel={alt ? "Verbindung bearbeiten" : "Neue Verbindung"} formName="Verbindung der Bibliothek" fehler={fehler} laeuft={laeuft}
      onSchliessen={onSchliessen} onSpeichern={() => void speichern(false)} onWeiter={alt ? undefined : () => void speichern(true)}
      onLoeschen={alt ? () => void loeschen() : undefined} onGeoeffnet={() => erstesFeld.current?.focus()}>
      <label className="kp-feldname" htmlFor={`${basis}-bezeichnung`}>Bezeichnung</label>
      <Input ref={erstesFeld} id={`${basis}-bezeichnung`} name="bezeichnung" value={bezeichnung} maxLength={LAENGE.bezeichnung}
        onChange={(e) => setBezeichnung(e.target.value)} {...f("bezeichnung").attr} />
      {f("bezeichnung").text}
      <label className="kp-feldname" htmlFor={`${basis}-art`}>Art</label>
      <Select id={`${basis}-art`} value={art} onChange={setArt} options={VERBINDUNGS_ARTEN.map((a) => ({ value: a, label: ART_NAME[a] }))} {...f("art").attr} />
      {f("art").text}
      <label className="kp-feldname" htmlFor={`${basis}-notiz`}>Notiz</label>
      <Input.TextArea id={`${basis}-notiz`} name="notiz" value={notiz} maxLength={500} autoSize={{ minRows: 2, maxRows: 6 }} onChange={(e) => setNotiz(e.target.value)} {...f("notiz").attr} />
      {f("notiz").text}
    </BibFlyin>
  );
}

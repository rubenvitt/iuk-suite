"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Icons8Ikone, type Icons8Name } from "@/core/ikonen/Icons8Ikone";
import {
  ausgebenAction, aussondernAmTelefonAction, einbuchenAction, nachschlagenAmTelefonAction, vorlaeufigAnlegenAction,
} from "../../_actions/telefon";
import {
  AUSGABE_ZIELE, AUSSONDER_GRUENDE, datumLang, EINHEITEN, fefo, MHD_ART_TEXT, mengeText, restKurz, restText, tageBis,
  vorschlag as fefoVorschlag, type AussonderGrund,
} from "../../_lib/mhd";
import type { ArtikelDTO, ChargeSicht, Ergebnis, OrtDTO } from "../../_lib/typen";
import { Kamera } from "./Kamera";
import { Ampel, Fehler, Menge, Rueckmeldung, Scanner, Stepper, Zurueck, type Treffer } from "./teile";
import s from "./telefon.module.css";

type Tab = "ausgeben" | "einbuchen" | "aussondern" | "bestand";

export interface TelefonDaten {
  zugang: { art: "konto" | "link"; wer: string; laeuftAb: number | null };
  orte: OrtDTO[];
  artikel: ArtikelDTO[];
  chargen: ChargeSicht[];
  heute: string;
  startOrt: string | null;
}

const NICHT_GESPEICHERT = "Ob gebucht wurde, ist unklar. Bitte unter Bestand nachsehen, bevor du es noch einmal versuchst.";

/** Eine Buchung mit Sperre gegen Doppeltippen; nach Erfolg holt `router.refresh()` den neuen Bestand. */
function useBuchen() {
  const router = useRouter();
  const [laeuft, starte] = useTransition();
  const [fehler, setFehler] = useState<string | null>(null);
  const sperre = useRef(false);
  const buche = (aktion: () => Promise<Ergebnis>, danach: (r: Extract<Ergebnis, { ok: true }>) => void) => {
    if (sperre.current) return;
    sperre.current = true;
    setFehler(null);
    starte(async () => {
      try {
        const r = await aktion();
        if (r.ok) { danach(r); router.refresh(); } else setFehler(r.fehler);
      } catch {
        setFehler(NICHT_GESPEICHERT);
      } finally {
        sperre.current = false;
      }
    });
  };
  return { laeuft, fehler, setFehler, buche };
}

// ————————————————————————— Ausgeben —————————————————————————

function Ausgeben({ d, ortId, zuAussondern }: { d: TelefonDaten; ortId: string; zuAussondern: () => void }) {
  const { laeuft, fehler, buche } = useBuchen();
  const [treffer, setTreffer] = useState<Treffer | null>(null);
  const [wahl, setWahl] = useState<string | null>(null);
  const [menge, setMenge] = useState(1);
  const [ziel, setZiel] = useState<string>("Dienstabend");
  const [fertig, setFertig] = useState<string | null>(null);
  const hier = useMemo(() => d.artikel.filter((a) => d.chargen.some((c) => c.artikelId === a.id && c.ortId === ortId)), [d, ortId]);
  const art = treffer?.artikelId ? d.artikel.find((a) => a.id === treffer.artikelId) : undefined;
  const chargen = art ? fefo(d.chargen.filter((c) => c.artikelId === art.id && c.ortId === ortId)) : [];
  const zuerst = fefoVorschlag(chargen);
  const gewaehlt = chargen.find((c) => c.id === (wahl ?? zuerst?.id));
  const frueher = gewaehlt ? chargen.filter((c) => !c.status.gesperrt && !c.status.abgelaufen && c.mhd < gewaehlt.mhd) : [];
  const anderswo = art ? [...new Set(d.chargen.filter((c) => c.artikelId === art.id && c.ortId !== ortId && !c.status.gesperrt).map((c) => c.ortKurz))] : [];
  const neu = () => { setTreffer(null); setWahl(null); setMenge(1); setFertig(null); };

  if (fertig) return <Rueckmeldung text={fertig} onWeiter={neu} />;
  if (!treffer) return <Scanner titel="Ausgeben · Packung scannen" auswahl={hier} artikel={d.artikel} onTreffer={(t) => { setTreffer(t); setWahl(null); setMenge(1); }} />;
  if (!art) {
    return (
      <>
        <Zurueck onClick={neu} />
        <div className={`${s.karte} ${s.pad}`}>
          <div className={s.name}>Diesen Strichcode kennt das Lager noch nicht.</div>
          <div className={s.meta}><span className={s.mono}>{treffer.ean}</span></div>
        </div>
      </>
    );
  }
  return (
    <>
      <Zurueck onClick={neu}>Andere Packung</Zurueck>
      <div className={`${s.karte} ${s.pad}`}>
        <div className={s.name} style={{ fontSize: 17 }}>{art.name}</div>
        <div className={s.meta}>{art.ean && <span className={s.mono}>{art.ean}</span>}<span>· {art.mhdArt === "verbrauch" ? "Verbrauchsdatum" : "MHD"}</span></div>
      </div>
      {chargen.length === 0 ? (
        <div className={`${s.karte} ${s.pad} ${s.block}`}>
          <div className={s.name}>Hier liegt nichts davon.</div>
          {anderswo.length > 0 && <div className={s.fussnote} style={{ marginTop: 6 }}>Vorrat an: {anderswo.join(", ")}</div>}
        </div>
      ) : (
        <div className={`${s.karte} ${s.block}`} role="radiogroup" aria-label="Packung">
          <div className={s.kartentitel}>Welche Packung nimmst du?</div>
          {chargen.map((c) => {
            const aus = c.status.gesperrt;
            return (
              <label key={c.id} className={`${s.zeile} ${gewaehlt?.id === c.id ? s.gewaehlt : ""} ${aus ? s.aus : ""}`} style={{ minHeight: 56, cursor: aus ? "default" : "pointer" }}>
                <input type="radio" className={s.wahl} name="charge" disabled={aus} checked={gewaehlt?.id === c.id} onChange={() => { setWahl(c.id); setMenge((m) => Math.min(m, c.menge)); }} />
                <div className={s.zeilehaupt}>
                  <div><span className={s.mhd}>{datumLang(c.mhd)}</span> {c === zuerst && <span className={`${s.chip} ${s.grau}`} style={{ marginLeft: 4 }}>zuerst raus</span>}</div>
                  <div className={s.meta}>
                    <Ampel status={c.status} />
                    <span>{aus ? "Verbrauchsdatum überschritten, nicht ausgeben" : restText(c.status.tage)}</span>
                  </div>
                </div>
                <Menge menge={c.menge} einheit={art.einheit} />
              </label>
            );
          })}
        </div>
      )}
      {gewaehlt && frueher.length > 0 && (
        <div className={`${s.hinweis} ${s.gelb}`}>Es liegt noch eine Packung mit früherem MHD da ({datumLang(frueher[0].mhd)}). Die zuerst nehmen, sonst läuft sie ab.</div>
      )}
      {gewaehlt?.status.abgelaufen && !gewaehlt.status.gesperrt && (
        <div className={`${s.hinweis} ${s.gelb}`}>MHD überschritten. Nur nach Sichtprüfung ausgeben, sonst aussondern.</div>
      )}
      {chargen.some((c) => c.status.gesperrt) && (
        <button type="button" className={`${s.knopf} ${s.knopfGeist} ${s.breit} ${s.block}`} onClick={zuAussondern}>Abgelaufene Packung aussondern</button>
      )}
      {gewaehlt && !gewaehlt.status.gesperrt && (
        <>
          <div className={`${s.karte} ${s.pad} ${s.block}`}>
            <div className={s.mengenband}>
              <span className={s.label} style={{ margin: 0 }}>Menge</span>
              <Stepper wert={Math.min(menge, gewaehlt.menge)} setWert={setMenge} max={gewaehlt.menge} einheit={art.einheit} />
            </div>
          </div>
          <div className={s.block}>
            <span className={s.label}>Wofür?</span>
            <div className={s.chips}>
              {AUSGABE_ZIELE.map((z) => <button type="button" key={z} className={s.wahlchip} aria-pressed={ziel === z} onClick={() => setZiel(z)}>{z}</button>)}
            </div>
          </div>
          <Fehler text={fehler} />
          <button
            type="button"
            className={`${s.knopf} ${s.knopfRot} ${s.breit} ${s.block}`}
            disabled={laeuft}
            onClick={() => {
              const m = Math.min(menge, gewaehlt.menge);
              buche(() => ausgebenAction({ chargeId: gewaehlt.id, menge: m, ziel }), (r) => setFertig(r.text ?? "Ausgegeben."));
            }}
          >
            {mengeText(Math.min(menge, gewaehlt.menge), art.einheit)} ausgeben
          </button>
        </>
      )}
    </>
  );
}

// ————————————————————————— Einbuchen —————————————————————————

const SCHNELL_EINHEITEN = EINHEITEN.filter((e) => e !== "Karton" && e !== "Laib");

function VorlaeufigAnlegen({ ean, onZurueck, onAngelegt }: { ean: string; onZurueck: () => void; onAngelegt: (a: ArtikelDTO) => void }) {
  const { laeuft, fehler, buche } = useBuchen();
  const [name, setName] = useState("");
  const [einheit, setEinheit] = useState<string>("Stück");
  const [kategorie, setKategorie] = useState<string | null>(null);
  const [sucht, setSucht] = useState(true);
  useEffect(() => {
    let aus = false;
    nachschlagenAmTelefonAction(ean)
      .then((f) => {
        if (aus || !f) return;
        setName((n) => n || f.name);
        if (f.einheit) setEinheit(f.einheit);
        setKategorie(f.kategorie);
      })
      .catch(() => undefined)
      .finally(() => { if (!aus) setSucht(false); });
    return () => { aus = true; };
  }, [ean]);
  return (
    <>
      <Zurueck onClick={onZurueck} />
      <div className={s.schirmkopf}>Neuer Artikel</div>
      <div className={`${s.karte} ${s.pad} ${s.stapel}`}>
        <div><span className={s.label}>Strichcode</span><span className={s.mono}>{ean}</span></div>
        <div>
          <label className={s.label} htmlFor="v-name">Bezeichnung</label>
          <input id="v-name" className={s.feld} value={name} maxLength={120} onChange={(e) => setName(e.target.value)} placeholder={sucht ? "…" : undefined} />
        </div>
        <div>
          <span className={s.label}>Einheit</span>
          <div className={s.chips}>{SCHNELL_EINHEITEN.map((e) => <button type="button" key={e} className={s.wahlchip} aria-pressed={einheit === e} onClick={() => setEinheit(e)}>{e}</button>)}</div>
        </div>
      </div>
      <Fehler text={fehler} />
      <button
        type="button"
        className={`${s.knopf} ${s.knopfRot} ${s.breit} ${s.block}`}
        disabled={!name.trim() || laeuft}
        onClick={() => buche(() => vorlaeufigAnlegenAction({ name, ean, einheit }, kategorie), (r) => onAngelegt({
          id: r.id!, name: name.trim(), ean, kategorie: kategorie ?? "Sonstiges", einheit, mhdArt: "mhd", rotTage: 7, gelbTage: 30,
          mindest: null, vorlaeufig: true, aktiv: true,
        }))}
      >
        Anlegen und weiter
      </button>
    </>
  );
}

function Einbuchen({ d, ortId }: { d: TelefonDaten; ortId: string }) {
  const { laeuft, fehler, buche } = useBuchen();
  const [treffer, setTreffer] = useState<Treffer | null>(null);
  const [neuAngelegt, setNeuAngelegt] = useState<ArtikelDTO | null>(null);
  const [anlegen, setAnlegen] = useState(false);
  const [mhd, setMhd] = useState("");
  const [menge, setMenge] = useState(1);
  const [fertig, setFertig] = useState<string | null>(null);
  const ort = d.orte.find((o) => o.id === ortId);
  const art = treffer?.artikelId ? (d.artikel.find((a) => a.id === treffer.artikelId) ?? (neuAngelegt?.id === treffer.artikelId ? neuAngelegt : undefined)) : undefined;
  const neu = () => { setTreffer(null); setMhd(""); setMenge(1); setFertig(null); setAnlegen(false); setNeuAngelegt(null); };

  if (fertig) return <Rueckmeldung text={fertig} onWeiter={neu} />;
  if (!treffer) return <Scanner titel="Einbuchen · Packung scannen" auswahl={d.artikel} artikel={d.artikel} onTreffer={setTreffer} />;
  if (!art && anlegen) {
    return <VorlaeufigAnlegen ean={treffer.ean} onZurueck={neu} onAngelegt={(a) => { setNeuAngelegt(a); setTreffer({ ean: treffer.ean, artikelId: a.id }); setAnlegen(false); }} />;
  }
  if (!art) {
    return (
      <>
        <Zurueck onClick={neu} />
        <div className={`${s.karte} ${s.pad}`}>
          <div className={s.name}>Diesen Strichcode kennt das Lager noch nicht.</div>
          <div className={s.meta}><span className={s.mono}>{treffer.ean}</span></div>
        </div>
        <button type="button" className={`${s.knopf} ${s.knopfTinte} ${s.breit} ${s.block}`} onClick={() => setAnlegen(true)}>Artikel vorläufig anlegen</button>
      </>
    );
  }
  const tage = mhd ? tageBis(mhd, d.heute) : null;
  const vorhanden = mhd ? d.chargen.find((c) => c.artikelId === art.id && c.ortId === ortId && c.mhd === mhd) : undefined;
  return (
    <>
      <Zurueck onClick={neu}>Andere Packung</Zurueck>
      <div className={`${s.karte} ${s.pad}`}>
        <div className={s.name} style={{ fontSize: 17 }}>{art.name}</div>
        <div className={s.meta}>{art.ean && <span className={s.mono}>{art.ean}</span>}<span>· nach {ort?.kurz}</span>{art.vorlaeufig && <span className={`${s.chip} ${s.gelb}`}>vorläufig</span>}</div>
      </div>
      <div className={`${s.karte} ${s.pad} ${s.block}`}>
        <label className={s.label} htmlFor="e-mhd">{MHD_ART_TEXT[art.mhdArt]}</label>
        <input id="e-mhd" type="date" className={`${s.feld} ${s.datum}`} value={mhd} min={d.heute} onChange={(e) => setMhd(e.target.value)} />
        {tage !== null && tage < 0 && <div className={`${s.hinweis} ${s.rot}`}>Dieses Datum liegt in der Vergangenheit. Abgelaufene Ware nicht einbuchen.</div>}
        {tage !== null && tage >= 0 && tage <= art.rotTage && <div className={`${s.hinweis} ${s.gelb}`}>Läuft {restKurz(tage)} ab. Passt das?</div>}
        {vorhanden && <div className={`${s.hinweis} ${s.grau}`}>Es liegen schon {mengeText(vorhanden.menge, art.einheit)} mit diesem MHD hier. Die Menge wird dazugezählt.</div>}
      </div>
      <div className={`${s.karte} ${s.pad} ${s.block}`}>
        <div className={s.mengenband}>
          <span className={s.label} style={{ margin: 0 }}>Menge ({art.einheit})</span>
          <Stepper wert={menge} setWert={setMenge} einheit={art.einheit} />
        </div>
      </div>
      <Fehler text={fehler} />
      <button
        type="button"
        className={`${s.knopf} ${s.knopfRot} ${s.breit} ${s.block}`}
        disabled={!mhd || (tage !== null && tage < 0) || laeuft}
        onClick={() => buche(() => einbuchenAction({ artikelId: art.id, ortId, mhd, menge }), (r) => setFertig(`${mengeText(menge, art.einheit)} ${art.name} ${r.text ?? "eingebucht"}`))}
      >
        {mengeText(menge, art.einheit)} einbuchen
      </button>
    </>
  );
}

// ————————————————————————— Aussondern —————————————————————————

function Aussondern({ d, ortId }: { d: TelefonDaten; ortId: string }) {
  const { laeuft, fehler, buche } = useBuchen();
  const [wahlId, setWahlId] = useState<string | null>(null);
  const [scan, setScan] = useState<Treffer | "offen" | null>(null);
  const [menge, setMenge] = useState(1);
  const [grund, setGrund] = useState<AussonderGrund>("abgelaufen");
  const [freitext, setFreitext] = useState("");
  const [fertig, setFertig] = useState<string | null>(null);
  const hier = d.chargen.filter((c) => c.ortId === ortId);
  const faellig = hier.filter((c) => c.status.abgelaufen);
  const neu = () => { setWahlId(null); setScan(null); setFertig(null); setFreitext(""); };
  const waehle = (c: ChargeSicht) => { setWahlId(c.id); setMenge(c.menge); setGrund(c.status.abgelaufen ? "abgelaufen" : "beschädigt"); };
  const c = wahlId ? hier.find((x) => x.id === wahlId) : undefined;

  if (fertig) return <Rueckmeldung text={fertig} onWeiter={neu} />;
  if (c) {
    const m = Math.min(menge, c.menge);
    return (
      <>
        <Zurueck onClick={neu} />
        <div className={`${s.karte} ${s.pad}`}>
          <div className={s.name} style={{ fontSize: 17 }}>{c.artikelName}</div>
          <div className={s.meta}><span className={s.mhd} style={{ fontSize: 13 }}>{datumLang(c.mhd)}</span><Ampel status={c.status} /><span>{mengeText(c.menge, c.einheit)} da</span></div>
        </div>
        <div className={s.block}>
          <span className={s.label}>Warum?</span>
          <div className={s.chips}>{AUSSONDER_GRUENDE.map((g) => <button type="button" key={g} className={s.wahlchip} aria-pressed={grund === g} onClick={() => setGrund(g)}>{g}</button>)}</div>
          {grund === "Sonstiges" && <input className={s.feld} style={{ marginTop: 10 }} aria-label="Was ist passiert?" placeholder="Was ist passiert?" maxLength={200} value={freitext} onChange={(e) => setFreitext(e.target.value)} />}
        </div>
        <div className={`${s.karte} ${s.pad} ${s.block}`}>
          <div className={s.mengenband}>
            <span className={s.label} style={{ margin: 0 }}>Menge</span>
            <Stepper wert={m} setWert={setMenge} max={c.menge} einheit={c.einheit} />
          </div>
        </div>
        <Fehler text={fehler} />
        <button
          type="button"
          className={`${s.knopf} ${s.knopfRot} ${s.breit} ${s.block}`}
          disabled={(grund === "Sonstiges" && !freitext.trim()) || laeuft}
          onClick={() => buche(() => aussondernAmTelefonAction({ chargeId: c.id, menge: m, grund, freitext }), (r) => setFertig(r.text ?? "Ausgesondert."))}
        >
          {mengeText(m, c.einheit)} aussondern
        </button>
      </>
    );
  }
  if (scan === "offen") {
    const hierArtikel = d.artikel.filter((a) => hier.some((x) => x.artikelId === a.id));
    return (<><Zurueck onClick={() => setScan(null)} /><Scanner titel="Packung scannen" auswahl={hierArtikel} artikel={d.artikel} onTreffer={setScan} /></>);
  }
  if (scan) {
    const passend = fefo(hier.filter((x) => x.artikelId === scan.artikelId));
    const name = d.artikel.find((a) => a.id === scan.artikelId)?.name ?? "Unbekannt";
    return (
      <>
        <Zurueck onClick={() => setScan("offen")}>Andere Packung</Zurueck>
        <div className={s.karte}>
          <div className={s.kartentitel}>{name} · welches MHD?</div>
          {passend.length === 0 && <div className={s.leer}>Hier liegt nichts davon.</div>}
          {passend.map((x) => (
            <button type="button" key={x.id} className={s.zeile} onClick={() => waehle(x)}>
              <div className={s.zeilehaupt}>
                <div className={s.mhd}>{datumLang(x.mhd)}</div>
                <div className={s.meta}><Ampel status={x.status} /></div>
              </div>
              <Menge menge={x.menge} einheit={x.einheit} />
            </button>
          ))}
        </div>
      </>
    );
  }
  return (
    <>
      <div className={s.schirmkopf}>Aussondern</div>
      {faellig.length > 0 ? (
        <div className={s.karte}>
          <div className={s.kartentitel}>Abgelaufen</div>
          {faellig.map((x) => (
            <button type="button" key={x.id} className={s.zeile} onClick={() => waehle(x)}>
              <div className={s.zeilehaupt}>
                <div className={s.name}>{x.artikelName}</div>
                <div className={s.meta}><span className={s.mhd} style={{ fontSize: 13 }}>{datumLang(x.mhd)}</span><Ampel status={x.status} /></div>
              </div>
              <Menge menge={x.menge} einheit={x.einheit} />
            </button>
          ))}
        </div>
      ) : (
        <div className={`${s.karte} ${s.leer}`}>Hier ist nichts abgelaufen.</div>
      )}
      <button type="button" className={`${s.knopf} ${s.knopfTinte} ${s.breit} ${s.block}`} onClick={() => setScan("offen")}>
        <Icons8Ikone name="barcode" groesse={20} /> Packung scannen
      </button>
    </>
  );
}

// ————————————————————————— Bestand —————————————————————————

function BestandHier({ d, ortId }: { d: TelefonDaten; ortId: string }) {
  const hier = d.chargen.filter((c) => c.ortId === ortId);
  const gruppen = new Map<string, ChargeSicht[]>();
  for (const c of hier) gruppen.set(c.artikelId, [...(gruppen.get(c.artikelId) ?? []), c]);
  return (
    <>
      <div className={s.schirmkopf}>Bestand hier</div>
      {hier.length === 0 ? <div className={`${s.karte} ${s.leer}`}>Hier liegt nichts.</div> : (
        <div className={s.karte} aria-label="Bestand hier">
          {[...gruppen.values()].map((cs) => (
            <div key={cs[0].artikelId} className={s.zeile}>
              <div className={s.zeilehaupt}>
                <div className={s.name}>{cs[0].artikelName}</div>
                {cs.map((c) => (
                  <div key={c.id} className={s.meta}>
                    <span className={s.mhd} style={{ fontSize: 13 }}>{datumLang(c.mhd)}</span>
                    <Ampel status={c.status} />
                    <span>{mengeText(c.menge, c.einheit)}</span>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </>
  );
}

// ————————————————————————— Rahmen —————————————————————————

const TABS: { key: Tab; titel: string; ikone: Icons8Name }[] = [
  { key: "ausgeben", titel: "Ausgeben", ikone: "give" },
  { key: "einbuchen", titel: "Einbuchen", ikone: "receive" },
  { key: "aussondern", titel: "Aussondern", ikone: "trash" },
  { key: "bestand", titel: "Bestand", ikone: "package" },
];

/** Restzeit des Helfer-Links; erst nach dem Laden gerechnet, damit Server und Browser gleich rendern. */
function Restzeit({ laeuftAb }: { laeuftAb: number }) {
  const [jetzt, setJetzt] = useState<number | null>(null);
  useEffect(() => {
    const t0 = setTimeout(() => setJetzt(Date.now()), 0);
    const t = setInterval(() => setJetzt(Date.now()), 30_000);
    return () => { clearTimeout(t0); clearInterval(t); };
  }, []);
  if (jetzt === null) return null;
  const min = Math.max(0, Math.floor((laeuftAb - jetzt) / 60_000));
  return <span className={s.zeitleiste}> · noch {Math.floor(min / 60)}:{String(min % 60).padStart(2, "0")} h</span>;
}

const ORT_AUS_QR = /\/o\/([A-Za-z0-9-]+)\/?(?:[?#].*)?$/;

function OrtWahl({ orte, ortId, onWahl, onZu }: { orte: OrtDTO[]; ortId: string | null; onWahl: (id: string) => void; onZu: () => void }) {
  const [fehler, setFehler] = useState<string | null>(null);
  return (
    <div className={s.blattHinter} onClick={onZu}>
      <div className={s.blatt} onClick={(e) => e.stopPropagation()} role="dialog" aria-label="Ort wechseln">
        <div className={s.schirmkopf}>Ortsetikett scannen</div>
        <Kamera
          lesart="qr"
          hoehe={150}
          onCode={(text) => {
            const id = ORT_AUS_QR.exec(text)?.[1];
            if (id && orte.some((o) => o.id === id)) onWahl(id);
            else setFehler("Das ist kein Ortsetikett dieses Lagers.");
          }}
        />
        <Fehler text={fehler} />
        <div className={`${s.karte} ${s.block}`}>
          {orte.map((o) => (
            <button type="button" key={o.id} className={s.zeile} onClick={() => onWahl(o.id)}>
              <Icons8Ikone name="marker" groesse={20} />
              <div className={s.zeilehaupt}>
                <div className={s.name}>{o.name}</div>
                <div className={s.meta}><span className={s.mono}>{o.kurz}</span></div>
              </div>
              {o.id === ortId && <span className={`${s.chip} ${s.grau}`}>hier</span>}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

export function Telefon({ d }: { d: TelefonDaten }) {
  const [tab, setTab] = useState<Tab>("ausgeben");
  const [ortId, setOrtId] = useState<string | null>(d.orte.find((o) => o.id === d.startOrt)?.id ?? null);
  const [ortWahl, setOrtWahl] = useState(ortId === null && d.orte.length > 0);
  const [schluessel, setSchluessel] = useState(0);
  const ort = d.orte.find((o) => o.id === ortId) ?? null;
  const abgelaufenHier = ort ? d.chargen.filter((c) => c.ortId === ort.id && c.status.abgelaufen).length : 0;
  const wechsle = (t: Tab) => { setTab(t); setSchluessel((k) => k + 1); };
  const waehleOrt = (id: string) => {
    setOrtId(id);
    setOrtWahl(false);
    window.history.replaceState(null, "", `?ort=${encodeURIComponent(id)}`);
  };
  return (
    <div className={s.rahmen}>
      <div className={s.streifen} />
      <header className={s.kopf}>
        <div>
          <div className={s.marke}>VERPFLEGUNGS<span className={s.akzent}>LAGER</span></div>
          <div className={s.etikett} data-rolle="wer">{d.zugang.wer}{d.zugang.laeuftAb !== null && <Restzeit laeuftAb={d.zugang.laeuftAb} />}</div>
        </div>
        {d.zugang.art === "link" ? (
          <a className={s.beenden} href="/abmelden"><Icons8Ikone name="logout" groesse={16} /> Beenden</a>
        ) : (
          <Link className={s.beenden} href="/"><Icons8Ikone name="arrow-left" groesse={16} /> Verwaltung</Link>
        )}
      </header>
      <div className={s.ortleiste}>
        <Icons8Ikone name="marker" groesse={20} />
        <div className={s.ortname} data-rolle="ort">
          {ort ? ort.name : "Kein Ort gewählt"}
          {ort && <small>{ort.kurz}{abgelaufenHier > 0 ? ` · ${abgelaufenHier} abgelaufen` : ""}</small>}
        </div>
        {d.orte.length > 0 && <button type="button" className={s.ortwechsel} onClick={() => setOrtWahl(true)}>Ort wechseln</button>}
      </div>
      <main className={s.inhalt} key={`${tab}-${ortId}-${schluessel}`}>
        {d.orte.length === 0 ? <div className={`${s.karte} ${s.leer}`}>Noch keine Lagerorte.</div> : !ort ? (
          <button type="button" className={`${s.knopf} ${s.knopfTinte} ${s.breit}`} onClick={() => setOrtWahl(true)}>
            <Icons8Ikone name="qr-code" groesse={20} /> Ort wählen
          </button>
        ) : (
          <>
            {tab === "ausgeben" && <Ausgeben d={d} ortId={ort.id} zuAussondern={() => wechsle("aussondern")} />}
            {tab === "einbuchen" && <Einbuchen d={d} ortId={ort.id} />}
            {tab === "aussondern" && <Aussondern d={d} ortId={ort.id} />}
            {tab === "bestand" && <BestandHier d={d} ortId={ort.id} />}
          </>
        )}
      </main>
      <nav className={s.tableiste} aria-label="Bereiche">
        {TABS.map((t) => (
          <button type="button" key={t.key} className={s.tab} aria-current={tab === t.key ? "page" : undefined} onClick={() => wechsle(t.key)}>
            <Icons8Ikone name={t.ikone} groesse={22} />
            {t.titel}
          </button>
        ))}
      </nav>
      {ortWahl && <OrtWahl orte={d.orte} ortId={ortId} onWahl={waehleOrt} onZu={() => setOrtWahl(false)} />}
    </div>
  );
}

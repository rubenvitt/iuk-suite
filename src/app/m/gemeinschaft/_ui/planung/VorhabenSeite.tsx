"use client";

import { useOptimistic, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { App, Button, Card, Checkbox, DatePicker, Input, Popconfirm, Progress, Select } from "antd";
import type { Dayjs } from "dayjs";
import { Icons8Ikone } from "@/core/ikonen/Icons8Ikone";
import { Seitenkopf } from "@/core/shell/Seitenkopf";
import { WAEHLER_IM_BILD } from "@/core/theme/waehlerImBild";
import {
  aufgabeAnlegenAction, aufgabeErledigtAction, aufgabeLoeschenAction, verantwortlichSetzenAction, vorhabenLoeschenAction, zustaendigeSetzenAction,
} from "../../_actions/vorhaben";
import type { ActionAusgang } from "../../_lib/vorhabenErgebnis";
import {
  faelligText, fortschritt, kalendertagLang, vorhabenPfad, zeitraumText, type AufgabeDTO, type FormularDaten, type MitgliedWahl, type VorhabenDetailDTO,
} from "../../_lib/vorhabenTypen";
import { tagAusDayjs } from "./datum";
import { useTokensAmBody } from "./fokus";
import s from "./planung.module.css";
import { ArtChip, Chip, Person, VorhabenKarte } from "./teile";
import { useVorhabenFlyin, VorhabenFlyin } from "./VorhabenFormular";

type Aenderung =
  | { typ: "erledigt"; id: string; wert: boolean }
  | { typ: "zustaendig"; id: string; ids: string[] }
  | { typ: "weg"; id: string };

function wende(liste: AufgabeDTO[], a: Aenderung): AufgabeDTO[] {
  if (a.typ === "weg") return liste.filter((x) => x.id !== a.id);
  return liste.map((x) => (x.id !== a.id ? x : a.typ === "erledigt" ? { ...x, erledigt: a.wert } : { ...x, zustaendig: a.ids }));
}

/**
 * Die Seite eines Events oder Projekts (POC `VorhabenSeite`): Fakten, Aufgaben, „Wer macht mit“, bei Projekten
 * die Events. Änderungen zeichnet die Insel sofort (`useOptimistic`); die Action frischt die Seite danach auf,
 * und bei einem Fehler fällt die Anzeige von selbst auf den Stand des Servers zurück.
 */
export function VorhabenSeite({ v, heute, daten }: { v: VorhabenDetailDTO; heute: string; daten: FormularDaten }) {
  useTokensAmBody();
  const { message } = App.useApp();
  const router = useRouter();
  const flyin = useVorhabenFlyin();
  const [, starte] = useTransition();
  const [aufgaben, aendereAufgaben] = useOptimistic(v.aufgabenListe, wende);
  const [verantwortlichId, setzeVerantwortlichOptimistisch] = useOptimistic(v.verantwortlichId, (_: string | null, neu: string | null) => neu);
  const namen = new Map(daten.mitglieder.map((m) => [m.id, m]));

  /** Zeichnet optimistisch, ruft die Action und meldet einen Fehlersatz. */
  function ausfuehren(zeichnen: () => void, aufruf: () => Promise<ActionAusgang>) {
    starte(async () => {
      zeichnen();
      try {
        const r = await aufruf();
        if (!r.ok) void message.warning(r.fehler);
      } catch {
        void message.warning("Das ging nicht. Bitte die Seite neu laden.");
      }
    });
  }

  async function loeschen() {
    const r = await vorhabenLoeschenAction(v.id);
    if (!r.ok) { void message.warning(r.fehler); return; }
    void message.success("Gelöscht.");
    router.push(r.wert === "event" ? "/events" : "/projekte");
  }

  const erledigt = aufgaben.filter((a) => a.erledigt).length;
  const ohne = aufgaben.filter((a) => !a.erledigt && a.zustaendig.length === 0).length;
  const beteiligt = [...new Set([verantwortlichId, ...aufgaben.flatMap((a) => a.zustaendig)])]
    .filter((id): id is string => !!id && namen.has(id));
  const personen = daten.mitglieder.map((m) => ({ value: m.id, label: m.name }));

  return (
    <div className={s.modul}>
      <Seitenkopf
        titel={v.titel}
        zurueck={v.art === "event" ? { titel: "Alle Events", href: "/events" } : { titel: "Alle Projekte", href: "/projekte" }}
        beschreibung={<><span className={s.kopfChips}><ArtChip art={v.art} />{v.vorbei ? <Chip ton="grau">vorbei</Chip> : null}</span>{v.beschreibung ? <><br />{v.beschreibung}</> : null}</>}
        aktionen={<>
          <Button icon={<Icons8Ikone name="pencil" groesse={18} />} onClick={() => flyin.oeffne({
            id: v.id, art: v.art, titel: v.titel, beschreibung: v.beschreibung, verantwortlichId: v.verantwortlichId,
            von: v.von, bis: v.bis, ort: v.ort, barBelegen: v.barBelegen, projektId: v.projektId, ziel: v.ziel,
          })}>Bearbeiten</Button>
          <Popconfirm title={v.art === "event" ? "Event löschen?" : "Projekt löschen?"}
            description={v.art === "projekt" && v.eventKarten.length ? "Die Events bleiben bestehen, nur ohne Projekt." : "Die Aufgaben gehen mit."}
            okText="Löschen" cancelText="Abbrechen" onConfirm={() => loeschen()}>
            <Button>Löschen</Button>
          </Popconfirm>
        </>}
      />

      <Card>
        <div className={s.fakten}>
          {v.art === "event" ? (
            <>
              <div><span className={s.neben}>Wann</span><span>{zeitraumText(v.von!, v.bis!)}</span></div>
              <div><span className={s.neben}>Ort</span><span className={s.zeile}>{v.ort || "—"}{v.barBelegen ? <Chip ton="grau">Bar belegt</Chip> : null}</span></div>
            </>
          ) : (
            <>
              <div><span className={s.neben}>Fertig bis</span><span>{v.ziel ? kalendertagLang(v.ziel) : "ohne Zieltermin"}</span></div>
              <div><span className={s.neben}>Stand</span>
                <Progress percent={fortschritt({ aufgaben: aufgaben.length, erledigt })} strokeColor="var(--gp-graphit)" style={{ maxWidth: 220, margin: 0 }} /></div>
            </>
          )}
          <div>
            <span className={s.neben} id="vorhaben-verantwortlich">Verantwortlich</span>
            <Select value={verantwortlichId ?? undefined} variant="borderless" allowClear placeholder="Niemand" aria-labelledby="vorhaben-verantwortlich"
              showSearch={{ optionFilterProp: "label" }} options={personen} style={{ minWidth: 200, marginInlineStart: -11 }}
              onChange={(w?: string) => ausfuehren(() => setzeVerantwortlichOptimistisch(w ?? null), () => verantwortlichSetzenAction(v.id, w ?? null))} />
          </div>
          {v.projekt ? <div><span className={s.neben}>Gehört zu</span><Link href={vorhabenPfad("projekt", v.projekt.id)}>{v.projekt.titel}</Link></div> : null}
        </div>
      </Card>

      <Card title="Aufgaben" extra={<span className={s.neben} data-zaehler="aufgaben">{erledigt} von {aufgaben.length} erledigt{ohne ? ` · ${ohne} ohne Zuständige` : ""}</span>}>
        {aufgaben.length === 0 ? <p className={s.neben} style={{ margin: 0 }}>Noch keine Aufgaben.</p> : null}
        <div className={s.aufgaben}>
          {aufgaben.map((a) => (
            <AufgabeZeile key={a.id} a={a} heute={heute} personen={personen}
              erledigen={(wert) => ausfuehren(() => aendereAufgaben({ typ: "erledigt", id: a.id, wert }), () => aufgabeErledigtAction(v.id, a.id, wert))}
              zuweisen={(ids) => ausfuehren(() => aendereAufgaben({ typ: "zustaendig", id: a.id, ids }), () => zustaendigeSetzenAction(v.id, a.id, ids))}
              loeschen={() => ausfuehren(() => aendereAufgaben({ typ: "weg", id: a.id }), () => aufgabeLoeschenAction(v.id, a.id))} />
          ))}
        </div>
        <NeueAufgabe vorhabenId={v.id} personen={personen} />
      </Card>

      <div className={s.zweiSpalten}>
        <Card title="Wer macht mit">
          {beteiligt.length === 0 ? <p className={s.neben} style={{ margin: 0 }}>Noch niemand eingeteilt.</p> : (
            <div className={s.beteiligt}>
              {beteiligt.map((id) => {
                const titel = aufgaben.filter((a) => a.zustaendig.includes(id)).map((a) => a.titel);
                const text = [id === verantwortlichId ? "verantwortlich" : "", titel.join(", ")].filter(Boolean).join(" · ");
                return (
                  <div key={id} className={s.beteiligtZeile}>
                    <Person m={namen.get(id) as MitgliedWahl} />
                    <span className={s.neben}>{text}</span>
                  </div>
                );
              })}
            </div>
          )}
        </Card>
        {v.art === "projekt" ? (
          <Card title="Events in diesem Projekt"
            extra={<Button icon={<Icons8Ikone name="plus" groesse={18} />} onClick={() => flyin.oeffne({ art: "event", projektId: v.id })}>Event anlegen</Button>}>
            {v.eventKarten.length === 0 ? <p className={s.neben} style={{ margin: 0 }}>Noch keine Events.</p>
              : <div className={`${s.karten} ${s.eng}`}>{v.eventKarten.map((e) => <VorhabenKarte key={e.id} v={e} />)}</div>}
          </Card>
        ) : null}
      </div>

      <VorhabenFlyin zustand={flyin.zustand} schliesse={flyin.schliesse} daten={daten} />
    </div>
  );
}

type Option = { value: string; label: string };

function AufgabeZeile({ a, heute, personen, erledigen, zuweisen, loeschen }: {
  a: AufgabeDTO; heute: string; personen: Option[];
  erledigen: (wert: boolean) => void; zuweisen: (ids: string[]) => void; loeschen: () => void;
}) {
  const f = faelligText(a.faellig, heute, a.erledigt);
  return (
    <div className={`${s.aufgabe} ${a.erledigt ? s.erledigt : ""}`} data-aufgabe={a.id}>
      <Checkbox checked={a.erledigt} onChange={(e) => erledigen(e.target.checked)} aria-label={`„${a.titel}“ erledigt`} />
      <div className={s.aText}>
        <span className={s.aTitel}>{a.titel}</span>
        {f ? <span className={`${s.neben} ${f.warn ? s.warnText : ""}`}>{f.text}</span> : null}
      </div>
      <div className={s.aWer}>
        <Select mode="multiple" value={a.zustaendig} variant="borderless" aria-label={`Zuständig für „${a.titel}“`}
          placeholder={<span className={s.nochNiemand}>Noch niemand · zuweisen</span>} maxTagCount="responsive"
          showSearch={{ optionFilterProp: "label" }} options={personen} style={{ width: "100%" }} onChange={zuweisen} />
      </div>
      <Popconfirm title="Aufgabe löschen?" okText="Löschen" cancelText="Abbrechen" onConfirm={loeschen}>
        <Button type="text" aria-label={`Aufgabe „${a.titel}“ löschen`} icon={<Icons8Ikone name="trash" groesse={18} />} />
      </Popconfirm>
    </div>
  );
}

function NeueAufgabe({ vorhabenId, personen }: { vorhabenId: string; personen: Option[] }) {
  const { message } = App.useApp();
  const [titel, setTitel] = useState("");
  const [wer, setWer] = useState<string[]>([]);
  const [faellig, setFaellig] = useState<Dayjs | null>(null);
  const [laeuft, setLaeuft] = useState(false);
  const bereit = titel.trim().length >= 2 && !laeuft;

  async function hinzu() {
    if (!bereit) return;
    setLaeuft(true);
    try {
      const r = await aufgabeAnlegenAction(vorhabenId, { titel, zustaendig: wer, faellig: faellig ? tagAusDayjs(faellig) : null });
      if (!r.ok) { void message.warning(r.fehler); return; }
      setTitel(""); setWer([]); setFaellig(null);
    } catch {
      void message.warning("Das ging nicht. Bitte die Seite neu laden.");
    } finally {
      setLaeuft(false);
    }
  }

  return (
    <div className={s.neueAufgabe}>
      <Input value={titel} onChange={(e) => setTitel(e.target.value)} onPressEnter={() => void hinzu()} maxLength={200}
        placeholder="Neue Aufgabe, zum Beispiel Getränke kaufen" aria-label="Neue Aufgabe" />
      <Select mode="multiple" value={wer} onChange={setWer} placeholder="Wer? (freiwillig)" aria-label="Wer übernimmt die neue Aufgabe"
        showSearch={{ optionFilterProp: "label" }} maxTagCount="responsive" options={personen} />
      <DatePicker value={faellig} onChange={setFaellig} format={["DD.MM.YYYY", "YYYY-MM-DD"]} placeholder="Bis wann? (freiwillig)"
        popupAlign={WAEHLER_IM_BILD} aria-label="Bis wann" />
      <Button onClick={() => void hinzu()} disabled={!bereit} loading={laeuft} icon={<Icons8Ikone name="plus" groesse={18} />}>Hinzufügen</Button>
    </div>
  );
}

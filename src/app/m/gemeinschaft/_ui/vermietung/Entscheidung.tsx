"use client";

import { useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { App, Button, Input, Modal } from "antd";
import { anfrageAblehnenAction, anfrageZusagenAction, zusageRueckgaengigAction, zusageZuruecknehmenAction } from "../../_actions/vermietung";
import type { Eintrag } from "../../_lib/belegung";
import type { AnfrageDTO } from "../../_lib/vermietungTypen";
import { zeitraumText } from "../../_lib/vermietungText";
import { eintragName } from "./teile";
import s from "./vermietung.module.css";

type Begruenden = { a: AnfrageDTO; art: "ablehnen" | "zuruecknehmen" };

export type Entscheidung = {
  /** `ueberschneidungen`: was sich mit der Anfrage überschneidet (`konflikte`); dann kommt vorher eine Rückfrage. */
  zusagen: (a: AnfrageDTO, ueberschneidungen?: readonly Eintrag[]) => Promise<void>;
  begruenden: (a: AnfrageDTO, art: Begruenden["art"]) => void;
  dialog: ReactNode;
};

/**
 * Zusagen, Ablehnen, Zusage zurücknehmen — für Anfragenliste, Belegung und Flyin derselbe Ablauf. Eine Absage
 * und eine zurückgenommene Zusage brauchen eine Begründung (mindestens 5 Zeichen, geprüft auch auf dem Server);
 * die anfragende Person sieht sie auf ihrer Statusseite. Zusagen bei harter Überschneidung lehnt der Server ab,
 * der Satz kommt als Hinweis.
 *
 * IDA-387: Ein Klick auf „Zusagen“ wirkte sofort, auch bei einer Überschneidung, und der einzige Rückweg war die
 * Rücknahme mit Begründung, die die Person als Absage sieht. Deshalb fragt eine Zusage mit Überschneidung vorher
 * nach (Zeitraum und was sich überschneidet), und jede Zusage bietet im Toast „Rückgängig“ an: zurück auf
 * „angefragt“, ohne Absage (`macheZusageRueckgaengig`, nur kurz danach und ohne Dokument).
 */
const NICHT_GEKLAPPT = "Das hat gerade nicht geklappt. Prüf bitte die Verbindung und versuch es noch einmal.";

export function useEntscheidung(): Entscheidung {
  const { message, modal } = App.useApp();
  const router = useRouter();
  const [offen, setOffen] = useState<Begruenden | null>(null);
  const [grund, setGrund] = useState("");
  const [fehler, setFehler] = useState<string | null>(null);
  const [laeuft, setLaeuft] = useState(false);

  async function zusagen(a: AnfrageDTO, ueberschneidungen: readonly Eintrag[] = []) {
    if (ueberschneidungen.length > 0) {
      const ja = await modal.confirm({
        title: "Trotz Überschneidung zusagen?",
        content: (
          <div data-testid="zusage-rueckfrage">
            <p style={{ marginTop: 0 }}><b>{a.anlass}</b> · {zeitraumText(a.von, a.bis)}</p>
            <ul style={{ margin: 0, paddingInlineStart: 18 }}>
              {ueberschneidungen.map((e) => <li key={e.id}>{eintragName(e)} · {zeitraumText(e.von, e.bis)}</li>)}
            </ul>
          </div>
        ),
        okText: "Zusagen", cancelText: "Abbrechen",
      });
      if (!ja) return;
    }
    let r: Awaited<ReturnType<typeof anfrageZusagenAction>>;
    try {
      r = await anfrageZusagenAction(a.id);
    } catch {
      modal.info({ title: "Zusagen geht nicht", content: NICHT_GEKLAPPT, okText: "Verstanden" });
      return;
    }
    if (!r.ok) { modal.info({ title: "Zusagen geht nicht", content: r.fehler, okText: "Verstanden" }); return; }
    const n = r.wert.weitereOffene;
    const key = `zusage-${a.id}`;
    message.open({
      key, type: "success", duration: 12,
      content: (
        <span>
          {n
            ? `Zugesagt. ${n === 1 ? "Eine weitere Anfrage" : `${n} weitere Anfragen`} im selben Zeitraum ${n === 1 ? "wartet" : "warten"} noch auf deine Absage.`
            : "Zugesagt. Die Person sieht es auf ihrer Statusseite."}
          {" "}<Button type="link" style={{ paddingInline: 4, height: "auto" }} onClick={() => { message.destroy(key); void rueckgaengig(a); }}>Rückgängig</Button>
        </span>
      ),
    });
    router.refresh();
  }

  async function rueckgaengig(a: AnfrageDTO) {
    let r: Awaited<ReturnType<typeof zusageRueckgaengigAction>>;
    try {
      r = await zusageRueckgaengigAction(a.id);
    } catch {
      modal.info({ title: "Rückgängig geht nicht", content: NICHT_GEKLAPPT, okText: "Verstanden" });
      return;
    }
    if (!r.ok) { modal.info({ title: "Rückgängig geht nicht", content: r.fehler, okText: "Verstanden" }); return; }
    message.success("Zusage rückgängig. Die Anfrage ist wieder offen.");
    router.refresh();
  }

  function begruenden(a: AnfrageDTO, art: Begruenden["art"]) {
    setGrund("");
    setFehler(null);
    setOffen({ a, art });
  }

  async function bestaetigen() {
    if (!offen) return;
    setLaeuft(true);
    try {
      const r = offen.art === "ablehnen" ? await anfrageAblehnenAction(offen.a.id, grund) : await zusageZuruecknehmenAction(offen.a.id, grund);
      if (!r.ok) { setFehler(r.feldFehler?.begruendung ?? r.fehler); return; }
      message.success(offen.art === "ablehnen" ? "Abgelehnt. Die Person sieht die Begründung auf ihrer Statusseite." : "Zusage zurückgenommen. Die Person sieht die Begründung auf ihrer Statusseite.");
      setOffen(null);
      router.refresh();
    } catch {
      setFehler(NICHT_GEKLAPPT);
    } finally {
      setLaeuft(false);
    }
  }

  const titel = offen?.art === "zuruecknehmen" ? "Zusage zurücknehmen" : "Anfrage ablehnen";
  const dialog = (
    <Modal open={!!offen} title={titel} okText={offen?.art === "zuruecknehmen" ? "Zurücknehmen" : "Ablehnen"} cancelText="Abbrechen"
      okButtonProps={{ disabled: grund.trim().length < 5, loading: laeuft }} onCancel={() => setOffen(null)} onOk={bestaetigen} destroyOnHidden>
      {offen ? <p style={{ marginTop: 0 }}><b>{offen.a.anlass}</b> · {zeitraumText(offen.a.von, offen.a.bis)}</p> : null}
      <label htmlFor="begruendung" style={{ display: "block", marginBottom: 6 }}>Begründung <span className={s.neben}>(sieht die anfragende Person)</span></label>
      <Input.TextArea id="begruendung" rows={4} maxLength={1000} value={grund} onChange={(ev) => setGrund(ev.target.value)}
        placeholder="Zum Beispiel: An dem Abend ist die Bar schon vergeben. Frag gern für einen anderen Tag an." status={fehler ? "warning" : undefined} />
      {fehler ? <p className={s.neben} role="alert" style={{ marginBottom: 0 }}>{fehler}</p> : null}
    </Modal>
  );
  return { zusagen, begruenden, dialog };
}

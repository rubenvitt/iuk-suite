"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { App, Button } from "antd";
import { EntwurfHinweis } from "@/core/entwurf/EntwurfHinweis";
import { useEntwurf } from "@/core/entwurf/useEntwurf";
import { Icons8Ikone } from "@/core/ikonen/Icons8Ikone";
import { zuruecklegenAction } from "../../_actions/telefon";
import type { OffeneEntnahme as Offene } from "../../_lib/unterwegs";
import { seitText } from "../../_lib/unterwegsText";
import { Kicker } from "../teile";
import s from "../wartung.module.css";
import { Zaehler } from "./Zaehler";

/** Ohne `nutzer`: die Kennung des Anmelders gehört nicht ins Telefon. */
type OffeneEntnahme = Omit<Offene, "nutzer">;
type Stand = { zurueck: Record<string, number>; fehlt: Record<string, boolean> };

/**
 * Zurücklegen (IDA-372): je offener Teil-Entnahme die Positionen mit „wieder da“ (Vorgabe: alles, was offen ist) und,
 * wenn weniger zurückkommt, „Rest: noch draußen / fehlt“. Zurücklegen behebt nie einen Fehlt-Mangel, das tut
 * nur das Durchzählen. Ist danach eine Prüfung „nach Benutzung“ fällig, geht es direkt dorthin (IDA-369).
 */
function EineEntnahme({ geraetId, e }: { geraetId: string; e: OffeneEntnahme }) {
  const { message } = App.useApp();
  const router = useRouter();
  const offene = e.positionen.filter((p) => p.offen > 0);
  const [stand, setStand] = useState<Stand>({ zurueck: {}, fehlt: {} });
  const [fehler, setFehler] = useState<string | null>(null);
  const zurueckVon = (id: string, offen: number) => stand.zurueck[id] ?? offen;

  const entwurf = useEntwurf<Stand, unknown, Awaited<ReturnType<typeof zuruecklegenAction>>>({
    schluessel: `wartung:zuruecklegen:${e.id}`,
    stand,
    wiederherstellen: setStand,
    senden: () => zuruecklegenAction(geraetId, {
      entnahmeId: e.id,
      positionen: offene.map((p) => {
        const zurueck = zurueckVon(p.id, p.offen);
        return { positionId: p.id, zurueck, fehlt: zurueck < p.offen && (stand.fehlt[p.id] ?? false), offen: p.offen };
      }),
    }),
    antwort: (r) => {
      if (!r.ok) {
        setFehler(r.fehler);
        return false;
      }
      message.success("Zurückgelegt.");
      router.push(r.weiter ? `/g/${geraetId}/pruefung?art=${r.weiter}` : `/g/${geraetId}`);
      return true;
    },
  });
  const laeuft = entwurf.zustand === "sendet";
  // Mehr „wieder da“ getippt, als unterwegs ist (IDA-381): die Meldung steht am Feld.
  const zuViel = offene.some((p) => zurueckVon(p.id, p.offen) > p.offen);

  return (
    <section className={s.karte} data-rolle="rueckgabe">
      <Kicker className={s.karteTitel}>{[e.zweck, e.wer, `seit ${seitText(e.seit)}`].filter(Boolean).join(" · ")}</Kicker>
      {offene.map((p) => {
        const zurueck = zurueckVon(p.id, p.offen);
        return (
          <div key={p.id} style={{ padding: "6px 0" }} data-rolle="rueckgabe-posten">
            <div className={s.quer}>
              <strong><span className={s.ziffern}>{p.offen} ×</span> {p.text}</strong>
              <Zaehler
                label={`Wieder da ${p.text}`}
                wert={zurueck}
                setWert={(v) => setStand((a) => ({ ...a, zurueck: { ...a.zurueck, [p.id]: v } }))}
                max={p.offen}
              />
            </div>
            {zurueck > p.offen && <div className={`${s.textRot} ${s.klein}`} role="alert" data-rolle="zu-viel">Nur {p.offen} unterwegs.</div>}
            {zurueck < p.offen && (
              <div className={s.wahl} role="radiogroup" aria-label={`Rest ${p.text}`}>
                {([false, true] as const).map((fehlt) => (
                  <label key={String(fehlt)}>
                    <input
                      type="radio"
                      name={`rest-${p.id}`}
                      value={fehlt ? "mangel" : "ok"}
                      checked={(stand.fehlt[p.id] ?? false) === fehlt}
                      onChange={() => setStand((a) => ({ ...a, fehlt: { ...a.fehlt, [p.id]: fehlt } }))}
                    />
                    {fehlt ? "Rest: fehlt" : "Rest: noch draußen"}
                  </label>
                ))}
              </div>
            )}
          </div>
        );
      })}
      {fehler && <div className={`${s.neben} ${s.klein}`} style={{ margin: "8px 0" }} role="alert">{fehler}</div>}
      <div className={s.entwurf}><EntwurfHinweis entwurf={entwurf} /></div>
      <div className={s.knopfstapel} style={{ marginTop: 12 }}>
        <Button type="primary" block disabled={zuViel} loading={laeuft} onClick={() => { if (!laeuft && !zuViel) { setFehler(null); entwurf.sende(null); } }} data-rolle="zuruecklegen-senden">
          Zurücklegen
        </Button>
        <Button block href={`/g/${geraetId}/mangel`} icon={<Icons8Ikone name="warning" groesse={20} />} data-rolle="zuruecklegen-mangel">
          Mangel melden
        </Button>
      </div>
    </section>
  );
}

export function ZuruecklegenAmGeraet({
  geraetId, geraetName, anleitung, entnahmen,
}: { geraetId: string; geraetName: string; anleitung: string; entnahmen: OffeneEntnahme[] }) {
  return (
    <div className={s.telefon}>
      <section className={s.karte}>
        <Link href={`/g/${geraetId}`} className={s.zurueck}><Icons8Ikone name="chevron-left" groesse={16} /> {geraetName}</Link>
        <h1 className={s.geraetName} style={{ margin: 0 }}>Zurücklegen</h1>
      </section>
      {anleitung && <section className={s.karte}><p className={s.hinweis} style={{ margin: 0, whiteSpace: "pre-wrap" }}>{anleitung}</p></section>}
      {entnahmen.map((e) => <EineEntnahme key={e.id} geraetId={geraetId} e={e} />)}
    </div>
  );
}

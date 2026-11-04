"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { App, Button, Input, InputNumber } from "antd";
import { Icons8Ikone } from "@/core/ikonen/Icons8Ikone";
import { inhaltSpeichernAction } from "../../_actions/verwaltung";
import { INHALT_MAX, KURZ_MAX, PUNKT_MAX, SOLL_MAX } from "../../_lib/eingabe";
import type { InhaltDTO } from "../../_lib/typen";
import { NICHT_GESPEICHERT } from "../useAktion";
import s from "../wartung.module.css";

type Zeile = { schluessel: string; id: string | null; text: string; soll: number | null; bemerkung: string };

let zaehler = 0;
const neuerSchluessel = () => `neu-${++zaehler}`;

/**
 * Die Inhaltsliste einer Materialkiste bearbeiten (IDA-335) — gebaut fürs Telefon in der Halle: Kiste auf,
 * zählen, Zeile für Zeile eintippen. Gespeichert wird die ganze Liste auf einmal.
 */
export function InhaltAmGeraet({ geraetId, geraetName, inhalt }: { geraetId: string; geraetName: string; inhalt: InhaltDTO[] }) {
  const { message } = App.useApp();
  const router = useRouter();
  const [zeilen, setZeilen] = useState<Zeile[]>(() => inhalt.map((p) => ({ schluessel: p.id, id: p.id, text: p.text, soll: p.soll, bemerkung: p.bemerkung })));
  const [neu, setNeu] = useState<string | null>(null);
  const [fehler, setFehler] = useState<string | null>(null);
  const [feldFehler, setFeldFehler] = useState<Record<string, string>>({});
  const [laeuft, starte] = useTransition();

  const setze = (i: number, teil: Partial<Zeile>) => setZeilen((z) => z.map((x, j) => (j === i ? { ...x, ...teil } : x)));
  const verschiebe = (i: number, d: number) => setZeilen((z) => {
    const l = [...z];
    [l[i], l[i + d]] = [l[i + d], l[i]];
    return l;
  });
  const hinzufuegen = () => {
    const schluessel = neuerSchluessel();
    setNeu(schluessel);
    setZeilen((z) => [...z, { schluessel, id: null, text: "", soll: 1, bemerkung: "" }]);
  };
  const unvollstaendig = zeilen.some((z) => !z.text.trim() || z.soll === null);

  const speichern = () => {
    if (laeuft || unvollstaendig) return;
    setFehler(null);
    starte(async () => {
      try {
        const r = await inhaltSpeichernAction(geraetId, zeilen.map((z) => ({ id: z.id, text: z.text, soll: z.soll, bemerkung: z.bemerkung })));
        if (r.ok) {
          message.success("Gespeichert.");
          router.push(`/g/${geraetId}`);
        } else {
          setFeldFehler(r.feldFehler ?? {});
          setFehler(r.fehler);
        }
      } catch {
        setFehler(NICHT_GESPEICHERT);
      }
    });
  };

  return (
    <div className={s.telefon}>
      <section className={s.karte}>
        <Link href={`/g/${geraetId}`} className={s.zurueck}><Icons8Ikone name="chevron-left" groesse={16} /> {geraetName}</Link>
        <h1 className={s.geraetName} style={{ margin: 0 }}>Inhalt</h1>
        <div className={s.neben}>{zeilen.length === 1 ? "1 Position" : `${zeilen.length} Positionen`}</div>
      </section>

      {zeilen.length > 0 && (
        <section className={s.karte}>
          <ol className={s.inhaltListe} aria-label="Inhaltsliste">
            {zeilen.map((z, i) => (
              <li key={z.schluessel} className={s.inhaltZeile} data-rolle="inhalt-zeile">
                <div className={s.inhaltFelder}>
                  <InputNumber
                    value={z.soll ?? undefined}
                    min={1}
                    max={SOLL_MAX}
                    precision={0}
                    inputMode="numeric"
                    onChange={(v) => setze(i, { soll: v ?? null })}
                    aria-label={`Position ${i + 1}: Soll-Menge`}
                    status={feldFehler[`${i}.soll`] || z.soll === null ? "error" : undefined}
                    style={{ width: "100%" }}
                  />
                  <Input
                    value={z.text}
                    maxLength={PUNKT_MAX}
                    autoFocus={z.schluessel === neu}
                    onChange={(e) => setze(i, { text: e.target.value })}
                    placeholder="Position"
                    aria-label={`Position ${i + 1}`}
                    status={feldFehler[`${i}.text`] ? "error" : undefined}
                  />
                </div>
                <Input
                  value={z.bemerkung}
                  maxLength={KURZ_MAX}
                  onChange={(e) => setze(i, { bemerkung: e.target.value })}
                  placeholder="Bemerkung"
                  aria-label={`Position ${i + 1}: Bemerkung`}
                />
                <div className={s.knoepfe}>
                  <Button type="text" aria-label={`Position ${i + 1} nach oben`} disabled={i === 0} onClick={() => verschiebe(i, -1)} icon={<Icons8Ikone name="arrow-up" groesse={20} />} />
                  <Button type="text" aria-label={`Position ${i + 1} nach unten`} disabled={i === zeilen.length - 1} onClick={() => verschiebe(i, 1)} icon={<Icons8Ikone name="arrow-down" groesse={20} />} />
                  <Button type="text" aria-label={`Position ${i + 1} entfernen`} onClick={() => setZeilen((l) => l.filter((_, j) => j !== i))} icon={<Icons8Ikone name="trash" groesse={20} />} />
                </div>
              </li>
            ))}
          </ol>
        </section>
      )}

      <Button type="dashed" block icon={<Icons8Ikone name="plus" groesse={20} />} disabled={zeilen.length >= INHALT_MAX} onClick={hinzufuegen}>
        Position hinzufügen
      </Button>

      <div className={s.fuss}>
        {fehler && <div className={`${s.neben} ${s.klein}`} style={{ marginBottom: 8 }} role="alert">{fehler}</div>}
        <Button type="primary" block disabled={unvollstaendig} loading={laeuft} onClick={speichern}>Speichern</Button>
      </div>
    </div>
  );
}

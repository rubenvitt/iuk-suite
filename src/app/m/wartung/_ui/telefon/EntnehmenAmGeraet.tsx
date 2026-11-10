"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { App, Button, Input } from "antd";
import { EntwurfHinweis } from "@/core/entwurf/EntwurfHinweis";
import { useEntwurf } from "@/core/entwurf/useEntwurf";
import { Icons8Ikone } from "@/core/ikonen/Icons8Ikone";
import { entnehmenAction } from "../../_actions/telefon";
import { KURZ_MAX } from "../../_lib/eingabe";
import { Kicker } from "../teile";
import s from "../wartung.module.css";
import { Zaehler } from "./Zaehler";

type Nutzlast = { ganz: boolean; zweck: string; positionen: { inhaltId: string; menge: number }[] };

/**
 * Etwas aus der Kiste mitnehmen (IDA-372): Teile mit Zähler (höchstens, was noch da ist) oder die ganze Kiste. Ein
 * einzelnes Gerät meldet sich mit „Wird eingesetzt“ (IDA-369). Der Entwurf hält die Eingabe fest, bis der Server sie bestätigt.
 */
export function EntnehmenAmGeraet({
  geraetId, geraetName, positionen, etwasUnterwegs, ganzMoeglich,
}: {
  geraetId: string;
  geraetName: string;
  /** `frei`: wie viele noch da sind (Soll minus unterwegs). */
  positionen: { id: string; text: string; soll: number; frei: number }[];
  etwasUnterwegs: boolean;
  /** Die Kiste hat eine selbst erledigte Prüfung nach Frist; nur über sie kommt die ganze Kiste zurück. */
  ganzMoeglich: boolean;
}) {
  const { message } = App.useApp();
  const router = useRouter();
  const [mengen, setMengen] = useState<Record<string, number>>({});
  const [zweck, setZweck] = useState("");
  const [fehler, setFehler] = useState<string | null>(null);

  const entwurf = useEntwurf<{ mengen: Record<string, number>; zweck: string }, Nutzlast, Awaited<ReturnType<typeof entnehmenAction>>>({
    schluessel: `wartung:entnehmen:${geraetId}`,
    stand: { mengen, zweck },
    wiederherstellen: (w) => {
      setMengen(w.mengen);
      setZweck(w.zweck);
    },
    senden: (d, sendung) => entnehmenAction(geraetId, { ...d, sendung }),
    antwort: (r) => {
      if (!r.ok) {
        setFehler(r.fehler);
        return false;
      }
      message.success("Eingetragen.");
      router.push(`/g/${geraetId}`);
      return true;
    },
  });
  const laeuft = entwurf.zustand === "sendet";
  const gewaehlt = positionen.filter((p) => (mengen[p.id] ?? 0) > 0);
  // Mehr getippt, als da ist (IDA-381): die Meldung steht am Feld, „Mitnehmen“ wartet.
  const zuViel = positionen.some((p) => (mengen[p.id] ?? 0) > p.frei);

  const sende = (ganz: boolean) => {
    if (laeuft || (!ganz && zuViel)) return;
    setFehler(null);
    entwurf.sende({ ganz, zweck: zweck.trim(), positionen: ganz ? [] : gewaehlt.map((p) => ({ inhaltId: p.id, menge: mengen[p.id] })) });
  };

  return (
    <div className={s.telefon}>
      <section className={s.karte}>
        <Link href={`/g/${geraetId}`} className={s.zurueck}><Icons8Ikone name="chevron-left" groesse={16} /> {geraetName}</Link>
        <h1 className={s.geraetName} style={{ margin: 0 }}>Entnehmen</h1>
        <p className={s.hinweis}>Kurz ansehen, ob alles heil ist.</p>
      </section>

      {positionen.map((p) => (
        <section key={p.id} className={s.karte} data-rolle="entnahme-posten">
          <div className={s.quer}>
            <strong><span className={s.ziffern}>{p.soll} ×</span> {p.text}</strong>
            <Zaehler
              label={`Menge ${p.text}`}
              wert={mengen[p.id] ?? 0}
              setWert={(v) => setMengen((m) => ({ ...m, [p.id]: v }))}
              max={p.frei}
              disabled={p.frei === 0}
            />
          </div>
          {(mengen[p.id] ?? 0) > p.frei ? (
            <div className={`${s.textRot} ${s.klein}`} role="alert" data-rolle="zu-viel">Nur {p.frei} da.</div>
          ) : p.frei < p.soll && <div className={`${s.neben} ${s.klein}`}>{p.frei === 0 ? "Alles unterwegs." : `Noch ${p.frei} da.`}</div>}
        </section>
      ))}

      <section className={s.karte}>
        <Kicker className={s.karteTitel}>Wofür? (optional)</Kicker>
        <Input.TextArea
          value={zweck}
          maxLength={KURZ_MAX}
          onChange={(e) => setZweck(e.target.value)}
          autoSize={{ minRows: 1 }}
          aria-label="Wofür? (optional)"
        />
      </section>

      <div className={s.fuss}>
        <div className={s.entwurf}><EntwurfHinweis entwurf={entwurf} /></div>
        {fehler && <div className={`${s.neben} ${s.klein}`} style={{ marginBottom: 8 }} role="alert">{fehler}</div>}
        <div className={s.knopfstapel}>
          <Button type="primary" block disabled={gewaehlt.length === 0 || zuViel} loading={laeuft} onClick={() => sende(false)}>Mitnehmen</Button>
          <Button block disabled={etwasUnterwegs || !ganzMoeglich} loading={laeuft} onClick={() => sende(true)} data-rolle="ganz-mitnehmen">Ganze Kiste mitnehmen</Button>
          {!ganzMoeglich && (
            <div className={`${s.neben} ${s.klein}`} data-rolle="ganz-hinweis">
              Die ganze Kiste kommt über das Durchzählen nach Frist zurück, und diese Kiste hat keine solche Prüfung.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

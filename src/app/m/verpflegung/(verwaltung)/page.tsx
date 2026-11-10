import Link from "next/link";
import { Card } from "antd";
import { Kennzahl, Kennzahlen } from "@/core/kennzahl/Kennzahl";
import { Seitenkopf } from "@/core/shell/Seitenkopf";
import { getDb } from "../_db/client";
import { chargeInStufe, type Stufe } from "../_lib/bestand";
import { bestandJeArtikel, ladeBuchungen, ladeSicht, unterMindest } from "../_lib/daten";
import { heute, zeitText } from "../_lib/heute";
import { datumLang, mengeText, type MhdStatus } from "../_lib/mhd";
import { BUCHUNGS_TEXT } from "../_lib/typen";
import { requireZugang } from "../_lib/zugang";
import { AmpelChip, Kicker } from "../_ui/teile";
import s from "../_ui/verpflegung.module.css";

export const dynamic = "force-dynamic";

/** Eine Kennzahl, die zu ihrer Liste führt; bei null kein Befund (kein Punkt). */
function Kpi({ zahl, text, farbe, href }: { zahl: number; text: string; farbe: "rot" | "gelb"; href: string }) {
  return <Kennzahl wert={zahl} label={text} ton={zahl === 0 ? undefined : farbe === "rot" ? "fehler" : "warnung"} href={href} />;
}

/** Die Stufe, in der eine Charge der Liste „Läuft als Nächstes ab“ steht. */
const stufeVon = (c: { status: MhdStatus }): Stufe => (c.status.abgelaufen ? "abgelaufen" : c.status.ampel === "rot" ? "kritisch" : "bald");

/** Übersicht: was abläuft, was fehlt, was zuletzt gebucht wurde. */
export default async function Uebersicht() {
  await requireZugang("/");
  const db = getDb();
  const { artikel, chargen } = ladeSicht(db, heute());
  // IDA-382: jede Kennzahl zählt mit derselben Abgrenzung wie die Stufe, auf die sie führt.
  const abgelaufen = chargen.filter((c) => chargeInStufe(c, "abgelaufen"));
  const kritisch = chargen.filter((c) => chargeInStufe(c, "kritisch"));
  const bald = chargen.filter((c) => chargeInStufe(c, "bald"));
  const fehlt = unterMindest(artikel, chargen);
  const bestand = bestandJeArtikel(chargen);
  const naechste = chargen.filter((c) => c.status.ampel !== "ok").slice(0, 8);
  const buchungen = ladeBuchungen(db, 8);

  return (
    <>
      <Seitenkopf titel="Übersicht" />
      <Kennzahlen aria-label="Lage">
        <Kpi zahl={abgelaufen.length} text="Chargen abgelaufen" farbe="rot" href="/bestand?stufe=abgelaufen" />
        <Kpi zahl={kritisch.length} text="Chargen kritisch" farbe="rot" href="/bestand?stufe=kritisch" />
        <Kpi zahl={bald.length} text="Chargen laufen bald ab" farbe="gelb" href="/bestand?stufe=bald" />
        <Kpi zahl={fehlt.length} text="Artikel unter Mindestbestand" farbe="gelb" href="/bestand?stufe=mindest" />
      </Kennzahlen>
      <div className={s.zwei}>
        <Card title="Läuft als Nächstes ab">
          {naechste.length === 0 ? (
            <p className={s.neben} style={{ margin: 0 }}>Nichts läuft in den nächsten Wochen ab.</p>
          ) : (
            <ul className={s.zeilen} aria-label="Läuft als Nächstes ab">
              {naechste.map((c) => (
                <li key={c.id}>
                  <Link href={`/bestand?stufe=${stufeVon(c)}`} className={s.zeile}>
                    <div>
                      <strong>{c.artikelName}</strong>
                      <div className={s.neben}>{c.ortName} · {mengeText(c.menge, c.einheit)} · {datumLang(c.mhd)}</div>
                    </div>
                    <AmpelChip status={c.status} />
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Card>
        <Card title="Letzte Buchungen">
          {buchungen.length === 0 ? (
            <p className={s.neben} style={{ margin: 0 }}>Noch keine Buchungen.</p>
          ) : (
            <ul className={s.zeilen} aria-label="Letzte Buchungen">
              {buchungen.map((b) => (
                <li key={b.id}>
                  <Link href="/buchungen" className={s.zeile}>
                    <div>
                      <Kicker>{BUCHUNGS_TEXT[b.art]} · {zeitText(b.zeit)}</Kicker>
                      <strong>{b.artikelName}</strong> <span className={s.neben}>· {mengeText(b.menge, b.einheit)} · {b.ortKurz}</span>
                      <div className={s.neben}>{b.wer}</div>
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
      {fehlt.length > 0 && (
        <Card title="Unter Mindestbestand">
          <ul className={s.zeilen} aria-label="Unter Mindestbestand">
            {fehlt.map((a) => (
              <li key={a.id}>
                <Link href="/bestand?stufe=mindest" className={s.zeile}>
                  <strong>{a.name}</strong>
                  <span className={`${s.ziffern} ${s.textGelb}`}>{mengeText(bestand.get(a.id) ?? 0, a.einheit)} von {mengeText(a.mindest ?? 0, a.einheit)}</span>
                </Link>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </>
  );
}

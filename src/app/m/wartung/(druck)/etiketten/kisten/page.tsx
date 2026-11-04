import { headers } from "next/headers";
import { qrSvg } from "@/core/qr";
import { Seitenkopf } from "@/core/shell/Seitenkopf";
import { getDb } from "../../../_db/client";
import { gruppenAuswahl, linkBasisAus, qrZiel } from "../../../_lib/ansicht";
import { ladeGeraete, ladeGruppen, ladeInhalt } from "../../../_lib/daten";
import { heute } from "../../../_lib/heute";
import { requireVerwalter } from "../../../_lib/zugang";
import { DruckKnopf } from "../../../_ui/DruckKnopf";
import { GruppenFilter } from "../../../_ui/GruppenFilter";
import { OrtText } from "../../../_ui/teile";
import k from "../../../_ui/kistenetikett.module.css";
import s from "../../../_ui/wartung.module.css";

export const dynamic = "force-dynamic";

/**
 * Etiketten der Materialkisten (IDA-335): je Kiste ein A6-Blatt mit QR-Code, Standort und Inhaltsliste.
 * Eigene Route, weil die Druckgröße eine andere ist als beim Bogen der Geräte-Etiketten (Falle 18).
 * `?geraet=` druckt nur eines (aus der Akte).
 */
export default async function KistenEtikettenSeite({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { rechte } = await requireVerwalter();
  const db = getDb();
  const q = await searchParams;
  const auswahl = gruppenAuswahl(rechte, ladeGruppen(db), q.gruppe);
  const alle = ladeGeraete(db, { gruppen: auswahl.gruppen, heute: heute() }).filter((g) => g.kiste);
  const kisten = typeof q.geraet === "string" ? alle.filter((g) => g.id === q.geraet) : alle;
  const basis = linkBasisAus(await headers());
  const etiketten = await Promise.all(kisten.map(async (g) => ({ g, qr: await qrSvg(qrZiel(basis, g.id)), inhalt: ladeInhalt(db, g.id) })));
  return (
    <>
      <div className={s.druckweg}>
        <Seitenkopf
          zurueck={{ href: "/etiketten", titel: "QR-Etiketten" }}
          titel="Etiketten der Materialkisten"
          aktionen={<span className={s.reihe}><GruppenFilter wahl={auswahl.wahl} gewaehlt={auswahl.gewaehlt} /><DruckKnopf /></span>}
        />
      </div>
      {etiketten.length === 0 ? <p className={s.neben}>Noch keine Materialkisten.</p> : (
        <div className={k.bogen}>
          {etiketten.map(({ g, qr, inhalt }) => (
            <section key={g.id} className={k.etikett} data-rolle="kistenetikett" aria-label={g.name}>
              <div className={k.kopf}>
                <div style={{ minWidth: 0 }}>
                  <div className={k.marke}>Materialkiste · {g.gruppeName}</div>
                  <h2 className={k.name}>{g.name}</h2>
                  <div className={k.ort}><OrtText ortArt={g.ortArt} ort={g.ort} /></div>
                </div>
                <div className={k.qr} dangerouslySetInnerHTML={{ __html: qr }} />
              </div>
              {inhalt.length === 0 ? <p className={k.leer}>Noch keine Inhaltsliste.</p> : (
                <table className={k.liste}>
                  <thead><tr><th className={k.menge}>Soll</th><th>Inhalt</th></tr></thead>
                  <tbody>
                    {inhalt.map((p) => (
                      <tr key={p.id}>
                        <td className={k.menge}>{p.soll}</td>
                        <td>{p.text}{p.bemerkung && <span className={k.bemerkung}> · {p.bemerkung}</span>}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </section>
          ))}
        </div>
      )}
    </>
  );
}

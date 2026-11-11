/**
 * Die Übersicht der Leitung (POC `Uebersicht`). Ohne Direktive und ohne Hook: sie rendert als Server
 * Component, die Ziele sind Links. antd nur `Card` (in RSC sicher, Falle 1); Zeichen nur `Icons8Ikone`.
 */
import Link from "next/link";
import { Card } from "antd";
import { Icons8Ikone } from "@/core/ikonen/Icons8Ikone";
import { Seitenkopf } from "@/core/shell/Seitenkopf";
import type { UebersichtDTO } from "../../_lib/uebersicht";
import { faelligText, kalendertagMitWochentag, vorhabenPfad, zeitraumText } from "../../_lib/vorhabenTypen";
import { tagInZone } from "../../_lib/zeit";
import s from "./planung.module.css";
import { BesetztChip, Datumsblock, VertragChip } from "./teile";

function Kachel({ zahl, text, href, warn }: { zahl: number; text: string; href: string; warn: boolean }) {
  return (
    <Link href={href} className={`${s.kachel} ${warn && zahl > 0 ? s.warn : ""}`} data-kachel={href}>
      <span className={s.kachelZahl}>{zahl}</span>
      <span className={s.kachelText}>{text}</span>
    </Link>
  );
}

export function Uebersicht({ u, heute }: { u: UebersichtDTO; heute: string }) {
  const n = (zahl: number, eins: string, viele: string) => (zahl === 1 ? eins : viele);
  return (
    <div className={s.modul}>
      <Seitenkopf titel="Übersicht" />
      <div className={s.kacheln}>
        <Kachel zahl={u.anfragen} text={n(u.anfragen, "Bar-Anfrage wartet", "Bar-Anfragen warten")} href="/vermietung/anfragen" warn />
        <Kachel zahl={u.vertraege} text={n(u.vertraege, "Vertrag nicht unterschrieben", "Verträge nicht unterschrieben")} href="/vermietung/anfragen" warn />
        <Kachel zahl={u.luecken.length} text={n(u.luecken.length, "Aufgabe ohne Zuständige", "Aufgaben ohne Zuständige")} href="#luecken" warn />
        <Kachel zahl={u.projekte} text={n(u.projekte, "laufendes Projekt", "laufende Projekte")} href="/projekte" warn={false} />
      </div>
      <div className={s.zweiSpalten}>
        <Card title="Als Nächstes">
          {u.termine.length === 0 ? <p className={s.neben} style={{ margin: 0 }}>Nichts geplant.</p> : (
            <div className={s.liste}>
              {u.termine.map((t) => (
                <Link key={`${t.art}-${t.id}`} href={t.art === "event" ? vorhabenPfad("event", t.id) : `/vermietung/anfragen?id=${encodeURIComponent(t.id)}`}
                  className={s.terminZeile} data-termin={t.art}>
                  <Datumsblock ms={t.von} />
                  <span className={s.terminText}>
                    <span className={s.terminTitel}>{t.titel}</span>
                    <span className={s.neben}>{zeitraumText(t.von, t.bis)}</span>
                    {t.unter ? <span className={s.neben}>{t.unter}</span> : null}
                  </span>
                  {t.art === "event" ? <BesetztChip offen={t.ohneZustaendige} /> : <VertragChip stand={t.vertrag} />}
                </Link>
              ))}
            </div>
          )}
        </Card>
        <section id="luecken" style={{ scrollMarginTop: 80 }}>
          <Card title="Hier fehlt noch jemand">
            {u.luecken.length === 0 ? <p className={s.neben} style={{ margin: 0 }}>Alle offenen Aufgaben haben jemanden.</p> : (
              <div className={s.liste}>
                {u.luecken.map((l) => {
                  const wann = l.faellig ? faelligText(l.faellig, heute)!.text : l.von !== null ? kalendertagMitWochentag(tagInZone(l.von)) : "";
                  return (
                    <Link key={l.aufgabeId} href={vorhabenPfad(l.vorhabenArt, l.vorhabenId)} className={s.lueckeZeile} data-luecke={l.aufgabeId}>
                      <span className={s.terminText}>
                        <span className={s.terminTitel}>{l.titel}</span>
                        <span className={s.neben}>{l.vorhabenTitel}{wann ? ` · ${wann}` : ""}</span>
                      </span>
                      <Icons8Ikone name="chevron-right" groesse={18} />
                    </Link>
                  );
                })}
              </div>
            )}
          </Card>
        </section>
      </div>
    </div>
  );
}

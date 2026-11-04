import { headers } from "next/headers";
import { Icons8Ikone } from "@/core/ikonen/Icons8Ikone";
import { getDb } from "../_db/client";
import { ladeSicht } from "../_lib/daten";
import { heute } from "../_lib/heute";
import { loginPfad, telefonZugang } from "../_lib/zugang";
import { Telefon, type TelefonDaten } from "../_ui/telefon/Telefon";
import s from "../_ui/telefon/telefon.module.css";

export const dynamic = "force-dynamic";

const GRUND: Record<string, string> = {
  link: "Dieser Link gilt nicht mehr.",
  beendet: "Beendet.",
};

/**
 * Buchen am Telefon: per Helfer-Link ohne Konto oder angemeldet mit Modulzugang. Ohne beides der Weg hinein.
 * Host-Riegel in `telefonZugang` (404 auf fremdem Host). Kein `notFound()` unter einer `loading.tsx` (Falle 23):
 * es gibt hier keine.
 */
export default async function TelefonSeite({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const z = await telefonZugang();
  const q = await searchParams;
  if (!z) {
    const grund = typeof q.grund === "string" ? GRUND[q.grund] : undefined;
    const ziel = typeof q.ort === "string" ? `/h?ort=${encodeURIComponent(q.ort)}` : "/h";
    return (
      <div className={s.rahmen}>
        <div className={s.streifen} />
        <header className={s.kopf}>
          <div className={s.marke}>VERPFLEGUNGS<span className={s.akzent}>LAGER</span></div>
        </header>
        <main className={s.inhalt}>
          <div className={`${s.karte} ${s.pad}`} data-rolle="kein-zugang">
            <div className={s.name}>{grund ?? "Kein Zugang."}</div>
          </div>
          <a className={`${s.knopf} ${s.knopfTinte} ${s.breit} ${s.block}`} href={loginPfad(await headers(), ziel)}>
            <Icons8Ikone name="login" groesse={20} /> Anmelden
          </a>
        </main>
      </div>
    );
  }
  const tag = heute();
  const sicht = ladeSicht(getDb(), tag);
  const orte = sicht.orte.filter((o) => o.aktiv);
  const d: TelefonDaten = {
    zugang: { art: z.art, wer: z.wer, laeuftAb: z.laeuftAb ? z.laeuftAb.getTime() : null },
    orte,
    artikel: sicht.artikel.filter((a) => a.aktiv),
    chargen: sicht.chargen.filter((c) => orte.some((o) => o.id === c.ortId)),
    heute: tag,
    startOrt: typeof q.ort === "string" ? q.ort : null,
  };
  return <Telefon d={d} />;
}

export const metadata = { title: "Buchen" };

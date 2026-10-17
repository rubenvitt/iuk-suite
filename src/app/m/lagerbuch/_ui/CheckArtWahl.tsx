import Link from "next/link";
import { dieseEinheit, einheitMeta, type Einheitenart } from "../_lib/konstanten";
import { STICHPROBE_GARANTIE_TAGE } from "../_lib/domain/stichprobe";
import { HelferChip } from "./HelferChip";
import { Ikone } from "./ikonen";
import s from "./helfer.module.css";

/**
 * KURZCHECK ODER VOLLCHECK — IDA-222.
 *
 * Der Schirm zwischen Einheitenwahl und Check. SERVER COMPONENT, zwei Links:
 * die Wahl ist eine Navigation (`?art=`), keine Client-Zustandsmaschine — so
 * laedt die Seite danach nur, was die gewaehlte Art braucht, und die Stichprobe
 * wird auf dem Server gezogen, nicht auf dem Telefon.
 *
 * ⚠️ `gescannt` REIST MIT. Die Seite zeigt den Hinweis „dein Scan gilt hier
 * nicht" nur auf dem Etikettenweg (DRK-373), und der erkennt sich an
 * `?fz=…&gescannt=…`. Liesse der Link `gescannt` fallen, verschwaende der
 * Hinweis genau einen Klick bevor gezaehlt wird.
 */
export function CheckArtWahl({
  fahrzeug,
  gescannt,
  kurz,
  plombenGesamt,
  letzterCheckText,
  pfad = "/helfer/check",
}: {
  fahrzeug: { id: string; name: string; kennung: string | null; einheitenart: Einheitenart | null };
  gescannt: string | undefined;
  kurz: {
    /** Positionen der heutigen Stichprobe. */
    positionen: number;
    /** Stehende Plomben, die abgelesen werden. */
    plomben: number;
    abgedeckt: number;
    gesamt: number;
  };
  plombenGesamt: number;
  letzterCheckText: string | null;
  /** IDA-224: die Demo (`/demo`) waehlt die Art auf ihrer eigenen Seite. */
  pfad?: string;
}) {
  const ziel = (art: "kurz" | "voll") => {
    const q = new URLSearchParams({ fz: fahrzeug.id, art });
    if (gescannt) q.set("gescannt", gescannt);
    return `${pfad}?${q.toString()}`;
  };
  const teile = [
    kurz.plomben > 0 && `${kurz.plomben} ${kurz.plomben === 1 ? "Plombe" : "Plomben"} ablesen`,
    `${kurz.positionen} ${kurz.positionen === 1 ? "Position" : "Positionen"} zählen`,
    "Geräte und Sauerstoff",
  ].filter(Boolean);

  return (
    <>
      <div className={s.schirmKopf} data-rolle="check-einheit">
        {fahrzeug.name} · {einheitMeta(fahrzeug)}
      </div>
      <div className={s.letzterCheck} data-rolle="letzter-check">
        {letzterCheckText === null
          ? `Noch kein Check erfasst — das ist der erste für ${dieseEinheit(fahrzeug.einheitenart)}.`
          : `Letzter Check: ${letzterCheckText}`}
      </div>
      <div className={`${s.karte} ${s.kartePad}`}>
        <div className={s.zeileName}>Welchen Check machst du?</div>
      </div>
      <div className={s.karte} data-rolle="check-art-wahl">
        <Link className={s.zeile} href={ziel("kurz")} data-rolle="check-art-kurz">
          <div className={s.zeileHaupt}>
            <div className={s.zeileName}>Kurzcheck</div>
            <div className={s.zeileMeta}>Reicht vor einem Sanitätsdienst</div>
            <p className={s.fussnote} style={{ margin: "4px 0 0" }}>{teile.join(" · ")}</p>
          </div>
          <Ikone name="chevron-rechts" />
        </Link>
        <Link className={s.zeile} href={ziel("voll")} data-rolle="check-art-voll">
          <div className={s.zeileHaupt}>
            <div className={s.zeileName}>Vollcheck</div>
            <div className={s.zeileMeta}>Während der Desinfektion</div>
            <p className={s.fussnote} style={{ margin: "4px 0 0" }}>
              Alle {kurz.gesamt} Positionen zählen
              {plombenGesamt > 0 && " · Plomben neu setzen"}
            </p>
          </div>
          <Ikone name="chevron-rechts" />
        </Link>
      </div>
      {/*
        WIE GUT KENNEN WIR DIE EINHEIT? Die Zahl sagt, ob der Kurzcheck gerade
        reicht: wird sie klein, kommen die Stichproben nicht mehr hinterher,
        und ein Vollcheck ist faellig.
      */}
      {kurz.gesamt > 0 && (
        <div className={`${s.karte} ${s.kartePad}`} data-rolle="check-abdeckung">
          <div className={s.zeileMeta}>
            <HelferChip ton={kurz.abgedeckt === kurz.gesamt ? "ok" : "grau"}>
              {kurz.abgedeckt} von {kurz.gesamt}
            </HelferChip>
            <span>in den letzten {STICHPROBE_GARANTIE_TAGE} Tagen gezählt oder verplombt</span>
          </div>
        </div>
      )}
    </>
  );
}

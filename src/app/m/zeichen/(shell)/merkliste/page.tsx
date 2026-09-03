import { desc, eq } from "drizzle-orm";
import { notFound } from "next/navigation";
import { auth } from "@/core/auth";
import { Seitenkopf } from "@/core/shell/Seitenkopf";
import { getDb } from "../../_db/client";
import { merkliste } from "../../_db/schema";
import { merkAnzeige } from "../../_lib/merkliste";
import { MerklisteZeilen } from "../../_ui/MerklisteZeilen";
import s from "../../_ui/zeichen.module.css";

/*
 * DIE MERKLISTE — Server Component. Sie liest, loest ueber `merkAnzeige()` auf
 * und reicht ausschliesslich serialisierbare Daten an die Client-Komponente
 * (Falle 9).
 *
 * `orderBy(desc(erstelltAm))`: zuletzt Gemerktes zuerst. Der Zeitstempel steht in
 * SEKUNDEN (`{ mode: "timestamp" }`) — die Sortierung ist davon unberuehrt, die
 * Anzeige zeigt ihn gar nicht.
 *
 * DIE ZAHL DER VERWAISTEN ZEILEN STEHT IM KOPF, nicht nur an den Zeilen: nach
 * einem Paketupgrade ist „3 nicht mehr im Katalog" die Auskunft, die jemand
 * sucht, bevor er scrollt.
 *
 * DER `<div className={s.modul}>` UM DIE LISTE traegt die --tz-*-Variablen:
 * `MerklisteZeilen` benutzt `zeichen.module.css`, und die Variablen sind auf
 * `.modul` deklariert, nicht an `:root` (Falle 2). Ohne diesen Traeger
 * verschwaenden Linien und Platzhalterrahmen still.
 */
export default async function MerklisteSeite() {
  const sub = (await auth())?.user?.id;
  if (!sub) notFound();

  const zeilen = getDb()
    .select({
      zeichenId: merkliste.zeichenId,
      titelSchnappschuss: merkliste.titelSchnappschuss,
    })
    .from(merkliste)
    .where(eq(merkliste.sub, sub))
    .orderBy(desc(merkliste.erstelltAm))
    .all();

  const anzeige = merkAnzeige(zeilen);
  const verwaist = anzeige.filter((z) => z.verwaist).length;

  return (
    <>
      <Seitenkopf
        titel="Merkliste"
        beschreibung={
          verwaist === 0
            ? `${anzeige.length} Zeichen.`
            : `${anzeige.length} Zeichen, davon ${verwaist} nicht mehr im Katalog.`
        }
      />
      <div className={s.modul}>
        <MerklisteZeilen zeilen={anzeige} />
      </div>
    </>
  );
}

import { moduleAdminPageOrNotFound } from "@/core/auth/guards";
import { Seitenkopf } from "@/core/shell/Seitenkopf";
import { getDb } from "../../../_db/client";
import { alleLernsetsMitAnzahl } from "../../../_db/lernen";
import { LernsetTabelle } from "../../../_ui/LernsetTabelle";
import s from "../../../_ui/zeichen.module.css";

/**
 * DIE LERNSET-VERWALTUNG — LISTE.
 *
 * ⛔ `moduleAdminPageOrNotFound` IST DIE ERSTE ANWEISUNG. Jeder Code davor liefe fuer
 * Unberechtigte — die Regel gilt fuer Verwaltungsseiten dieses Moduls ausnahmslos.
 *
 * `force-dynamic`: die Seite liest Sitzung und Datenbank bei jedem Aufruf, eine
 * vorgerenderte Fassung zeigte allen dieselbe Liste (oder liefe fuer niemanden 404).
 */
export const dynamic = "force-dynamic";

export default async function LernsetsSeite() {
  await moduleAdminPageOrNotFound("zeichen");

  const zeilen = alleLernsetsMitAnzahl(getDb());

  return (
    <div className={s.modul}>
      <Seitenkopf
        titel="Lernsets"
        beschreibung="Kuratierte Listen für das Üben anlegen und pflegen."
      />
      {/* Falle 9: die Tabelle ist eine eigene Client-Komponente, die nur serialisierbare
          Daten bekommt und ihre render-Funktionen selbst definiert. */}
      <LernsetTabelle zeilen={zeilen} />
    </div>
  );
}

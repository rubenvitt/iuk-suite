"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { falte } from "../_lib/suche";
import s from "./helfer.module.css";

/**
 * DIE ARTIKELLISTE DES HELFER-WEGS — Nachfolger von `HelferListe.tsx`.
 *
 * WARUM SIE IM CLIENT FILTERT: §7.8.2 Punkt 6 ist eindeutig — es gibt KEINEN
 * `router.push`/`router.replace` auf diesem Ast. Ein serverseitiger Filter
 * braeuchte je Tastendruck eine Navigation, auf einem Telefon in einer
 * Fahrzeughalle die teuerste denkbare Form. Die Liste liegt ohnehin
 * vollstaendig im RSC-Payload;
 * sie ein zweites Mal zu holen, um sie zu KUERZEN, waere die falsche Richtung.
 *
 * ⚠️ Anders als beim Fahrzeug-Check ist das KEIN Datenschutzproblem (§7.9.1):
 * die Artikelliste ist die Menge, aus der die Helferin ohnehin auswaehlt — sie
 * ist der ZWECK der Seite, nicht ein Nebenprodukt. Der Check schneidet, weil er
 * sonst die Soll-Bestueckung der GESAMTEN Organisation uebertraegt.
 *
 * DIE FALTUNG KOMMT AUS `_lib/suche.ts` (Teil 1, T5) UND WIRD NICHT NACHGEBAUT.
 * Der Bestand filtert mit `a.name.toLowerCase().includes(...)`
 * (HelferListe.tsx:11) und behandelt Umlaute uneinheitlich zur
 * Verwaltungssuche. Zwei Faltungen an zwei Orten sind der Ort, an dem sie
 * auseinanderlaufen. `ArtikelSuche.test.tsx` sichert das doppelt zu: als
 * Quelltext-Scan UND als Verhaltenstest, der `falte` ersetzt und prueft, ob die
 * Liste der Ersetzung folgt — der Scan allein faengt nur die Schreibweise
 * `toLowerCase`, nicht eine selbstgebaute Zeichentabelle.
 *
 * GESUCHT WIRD UEBER NAME UND FACH, ALS EIN HEUHAUFEN. Das Fach steht auf dem
 * Regaletikett und ist fuer eine Helferin am Regal die naheliegendere Eingabe.
 * Die Form ist ZEICHENGLEICH die des Server-Filters aus Teil 3
 * (`_lib/artikelFilter.ts:54,57-58`): erst `trim()`, dann `falte()`, dann
 * `includes` auf der VERKETTETEN Zeichenkette. Zwei getrennte Feldpruefungen
 * mit ODER lieferten fuer eine feldueberschreitende Eingabe („10×10 A-01") eine
 * andere Treffermenge als die Verwaltungssuche — und eine Divergenz zwischen
 * beiden Haelften ist genau das, was §5.13.2 ausschliesst.
 *
 * Die Chargennummer bleibt draussen — sie steht auf keinem Gegenstand, den
 * jemand auf diesem Weg in der Hand hat, und `ArtikelZeileHelfer` fuehrt sie
 * gar nicht. Das ist ein bewusst engerer FELDUMFANG, keine zweite Faltung.
 */
export type ArtikelZeileHelfer = {
  id: string;
  name: string;
  einheit: string;
  fach: string;
  bestand: number;
};

export function ArtikelSuche({ artikel }: { artikel: ArtikelZeileHelfer[] }) {
  const [q, setQ] = useState("");

  const treffer = useMemo(() => {
    /**
     * `trim()` VOR `falte()` — `falte` trimmt nicht, und `_lib/artikelFilter.ts:54`
     * trimmt. Ohne diese Zeile faende die Verwaltungssuche „ mull " und die
     * Helfersuche nichts. Eine leere Nadel laesst `includes` ohnehin alles durch;
     * ein eigener Frueh-Ausstieg dafuer waere eine Zeile, die kein Test von ihrer
     * Abwesenheit unterscheiden kann.
     */
    const nadel = falte(q.trim());
    return artikel.filter((a) => falte(`${a.name} ${a.fach}`).includes(nadel));
  }, [artikel, q]);

  return (
    <>
      <input
        className={s.suchfeld}
        type="search"
        inputMode="search"
        autoComplete="off"
        aria-label="Artikel suchen"
        placeholder="Artikel oder Fach suchen…"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        data-rolle="artikel-suche"
      />

      <div className={s.karte}>
        {/*
          DIE BEIDEN LEERLAGEN SIND VERSCHIEDEN, und das ist keine Feinheit:
          „Kein Artikel gefunden" bei leerer Datenbank schickt die Helferin auf
          die Suche nach einem Tippfehler, den es nicht gibt. Die Unterscheidung
          haengt deshalb an `artikel.length` und NICHT an `q`.
        */}
        {artikel.length === 0 && (
          <div className={`${s.kartePad} ${s.fussnote}`} data-rolle="keine-artikel">
            Es ist noch kein Artikel angelegt. Die Verwaltung pflegt den Bestand.
          </div>
        )}

        {artikel.length > 0 && treffer.length === 0 && (
          <div className={`${s.kartePad} ${s.fussnote}`} data-rolle="kein-treffer">
            Kein Artikel gefunden für „{q.trim()}“.
          </div>
        )}

        {treffer.map((a) => (
          // AEUSSERER Pfad — derselbe, der auf dem Regaletikett steht (§8.1).
          <Link className={s.zeile} key={a.id} href={`/a/${a.id}`} data-rolle="artikel-zeile">
            <div className={s.zeileHaupt}>
              <div className={s.zeileName}>{a.name}</div>
              <div className={s.zeileMeta}>
                <span className={s.fach}>{a.fach}</span>
                <span>
                  Bestand {a.bestand} {a.einheit}
                </span>
              </div>
            </div>
            {/* Lokales Inline-SVG (E3); Teil 5, T101 hebt es nach `_ui/ikonen.tsx`. */}
            <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
              <path d="M9 6l6 6-6 6" fill="none" stroke="currentColor" strokeWidth="2"
                    strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </Link>
        ))}
      </div>
    </>
  );
}

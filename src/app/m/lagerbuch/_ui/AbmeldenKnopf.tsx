"use client";

import { useRef, useState } from "react";
import { beenden } from "../_actions/sitzung";
import { Ikone } from "./ikonen";
import { useIrgendwasOffen } from "./offenerVorgang";
import s from "./helfer.module.css";

/**
 * „ABMELDEN" IM KOPF DES HELFERRAHMENS — IDA-377.
 *
 * Bis hier hieß der Knopf „Beenden" und meldete ohne Rückfrage ab. Neben einem laufenden Check las
 * er sich wie „Check beenden", und ein Tipp darauf warf die Helferin mitten in der Zählung aufs Gate.
 * Jetzt heißt er, was er tut, und fragt nach, solange ein Check offen ist (`offenerVorgang.ts`).
 *
 * ⚠️ WEITER EIN FORMULAR AUF DIE SERVER ACTION, KEIN LINK (`HelferRahmen`, Kopf): ein Prefetch, der
 * die Sitzung beendet, ist die Sorte Fehler, die niemand reproduziert.
 */
export function AbmeldenKnopf() {
  const offen = useIrgendwasOffen();
  const [frage, setFrage] = useState(false);
  const bestaetigt = useRef(false);
  const formular = useRef<HTMLFormElement>(null);

  return (
    <form
      action={beenden}
      ref={formular}
      onSubmit={(e) => {
        if (offen && !bestaetigt.current) {
          e.preventDefault();
          setFrage(true);
        }
      }}
    >
      <button className={s.beenden} type="submit" data-rolle="abmelden">
        <Ikone name="kreuz" groesse={14} />
        Abmelden
      </button>
      {frage && (
        <div className={s.rueckfrageGrund} data-rolle="abmelden-rueckfrage">
          <div className={s.rueckfrage} role="alertdialog" aria-modal="true" aria-labelledby="abmelden-titel">
            <div className={s.zeileName} id="abmelden-titel">Der Check ist noch nicht abgeschlossen.</div>
            <p className={s.fussnote}>Deine Eingaben bleiben auf diesem Gerät.</p>
            <div className={s.rueckfrageKnoepfe}>
              <button
                className={`${s.knopf} ${s.knopfGeist}`}
                type="button"
                autoFocus
                onClick={() => setFrage(false)}
                data-rolle="abmelden-abbrechen"
              >
                Weiter prüfen
              </button>
              <button
                className={`${s.knopf} ${s.knopfTinte}`}
                type="button"
                onClick={() => {
                  bestaetigt.current = true;
                  setFrage(false);
                  formular.current?.requestSubmit();
                }}
                data-rolle="abmelden-bestaetigen"
              >
                Abmelden
              </button>
            </div>
          </div>
        </div>
      )}
    </form>
  );
}

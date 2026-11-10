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
  const knopf = useRef<HTMLButtonElement>(null);
  const zurueck = () => {
    setFrage(false);
    knopf.current?.focus();
  };

  return (
    <form
      action={beenden}
      ref={formular}
      onSubmit={(e) => {
        // Eine Bestaetigung gibt nur DIESES Absenden frei, nicht jedes spaetere.
        const ok = bestaetigt.current;
        bestaetigt.current = false;
        if (offen && !ok) {
          e.preventDefault();
          setFrage(true);
        }
      }}
    >
      <button className={s.beenden} type="submit" data-rolle="abmelden" ref={knopf}>
        <Ikone name="kreuz" groesse={14} />
        Abmelden
      </button>
      {frage && (
        <div className={s.rueckfrageGrund} data-rolle="abmelden-rueckfrage">
          <div
            className={s.rueckfrage}
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="abmelden-titel"
            onKeyDown={(e) => {
              if (e.key === "Escape") {
                e.preventDefault();
                zurueck();
                return;
              }
              // Tab bleibt in der Rueckfrage: zwei Knoepfe, also reicht der Wechsel an den Enden.
              if (e.key !== "Tab") return;
              const knoepfe = [...e.currentTarget.querySelectorAll("button")];
              const erster = knoepfe[0];
              const letzter = knoepfe[knoepfe.length - 1];
              if (e.shiftKey && document.activeElement === erster) {
                e.preventDefault();
                letzter?.focus();
              } else if (!e.shiftKey && document.activeElement === letzter) {
                e.preventDefault();
                erster?.focus();
              }
            }}
          >
            <div className={s.zeileName} id="abmelden-titel">Der Check ist noch nicht abgeschlossen.</div>
            <p className={s.fussnote}>Deine Eingaben bleiben auf diesem Gerät.</p>
            <div className={s.rueckfrageKnoepfe}>
              <button
                className={`${s.knopf} ${s.knopfGeist}`}
                type="button"
                autoFocus
                onClick={zurueck}
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

"use client";

import { useEffect, useId, useRef, useState } from "react";
import { Button, Input, Select, type InputRef } from "antd";
import { entferneKontakt, KONTAKT_NAME, KONTAKT_REIHENFOLGE, kontaktFelder, setzeKontakt, weitererKontakt } from "../../_lib/plan/kontakte";
import { GRENZE, LAENGE, type Kontakt, type KontaktArt } from "../../_lib/plan/schema";

const ARTEN = KONTAKT_REIHENFOLGE.map((a) => ({ value: a, label: KONTAKT_NAME[a] }));

/**
 * KONTAKTE (Spec §4.2, §6.4; Umsetzungsplan Phase 2, Entscheidung 16): ein festes Feld je Art in der
 * Reihenfolge der Karte — Tippen plus Tab statt „Art wählen, hinzufügen, hineinklicken". Leer heißt
 * „kein Kontakt dieser Art" (`setzeKontakt`). Doppelte über „Weiterer Kontakt" am Ende, damit die
 * Tab-Folge durch die sieben Felder nicht von Knöpfen unterbrochen wird.
 *
 * SCHLÜSSEL: React-`key` und Rückgängig-Bündel hängen an (Art, n), nie am Array-Index — sonst verlöre
 * ein Feld beim Leeren und Neutippen den Fokus, und Tippen zerfiele in mehrere Rückgängig-Schritte.
 */
export function KontaktZeilen({ kontakte, onAendere }: { kontakte: readonly Kontakt[]; onAendere: (neu: Kontakt[], schluessel?: string) => void }) {
  const basis = useId();
  const [weitereArt, setWeitereArt] = useState<KontaktArt>("telefon");
  const [fokusAuf, setFokusAuf] = useState<{ feld: string; n: number } | null>(null);
  const felderRef = useRef(new Map<string, InputRef | null>());
  // Fokus nach „Weiterer Kontakt" — nur Fokus, kein setState (set-state-in-effect).
  useEffect(() => { if (fokusAuf) felderRef.current.get(fokusAuf.feld)?.focus(); }, [fokusAuf]);
  const felder = kontaktFelder(kontakte);
  const voll = kontakte.length >= GRENZE.kontakte;
  const aendere = (neu: Kontakt[], schluessel?: string) => { if (neu !== kontakte) onAendere(neu, schluessel); };

  return (
    <fieldset className="kp-abschnitt">
      <legend>Kontakte</legend>
      {felder.map((f) => {
        const feld = `${f.art}:${f.n}`;
        const name = f.n === 0 ? KONTAKT_NAME[f.art] : `${KONTAKT_NAME[f.art]} ${f.n + 1}`;
        return (
          <div key={feld} className="kp-kontakt" data-kontakt={feld}>
            <label className="kp-feldname" htmlFor={`${basis}-${feld}`}>{name}</label>
            <div className="kp-zeile">
              <Input id={`${basis}-${feld}`} ref={(el) => { felderRef.current.set(feld, el); }} value={f.wert} maxLength={LAENGE.kontakt}
                disabled={!f.vorhanden && voll}
                onChange={(e) => aendere(setzeKontakt(kontakte, f.art, f.n, e.target.value), `kontakt:${feld}`)} />
              {f.n > 0 ? <Button aria-label={`${name} entfernen`} onClick={() => aendere(entferneKontakt(kontakte, f.art, f.n))}>Entfernen</Button> : null}
            </div>
          </div>
        );
      })}
      <div className="kp-zeile">
        <Select aria-label="Art des weiteren Kontakts" value={weitereArt} onChange={(a: KontaktArt) => setWeitereArt(a)} options={ARTEN} />
        <Button disabled={voll} onClick={() => {
          const n = kontakte.filter((k) => k.art === weitereArt).length;
          aendere(weitererKontakt(kontakte, weitereArt));
          setFokusAuf((alt) => ({ feld: `${weitereArt}:${Math.max(0, n)}`, n: (alt?.n ?? 0) + 1 }));
        }}>Weiterer Kontakt</Button>
      </div>
    </fieldset>
  );
}

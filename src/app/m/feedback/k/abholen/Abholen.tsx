"use client";

import { useActionState, useRef, useState } from "react";
import s from "../../f/[slugSecret]/zettel.module.css";
import { abholenAktion, zurueckschreibenAktion, type AbholErgebnis } from "../../_lib/ehrlich/aktionen";
import { Blatt } from "../Blatt";
import e from "../ehrlich.module.css";

const NICHT_GESENDET = "Deine Antwort ging nicht raus. Versuch es später noch einmal.";

const FEHLER: Record<Exclude<AbholErgebnis, { ok: true }>["fehler"], string> = {
  leer: "Gib zuerst deinen Abholcode ein.",
  unbekannt: "Zu diesem Code gibt es nichts. Prüf die Schreibweise.",
  ratelimit: "Zu viele Versuche. Warte eine Minute.",
};

const MONATE = ["Januar", "Februar", "März", "April", "Mai", "Juni", "Juli", "August", "September", "Oktober", "November", "Dezember"];

/** `JJJJ-MM-TT` → „3. November 2026" — ein Kalendertag, keine Zone im Spiel. */
function langesDatum(tag: string): string {
  const [j, m, t] = tag.split("-").map(Number);
  return `${t}. ${MONATE[m - 1]} ${j}`;
}

export function Abholen({ schrift }: { schrift: string }) {
  const [code, setCode] = useState("");
  const [antwort, setAntwort] = useState("");
  // Welche Aktion zuletzt antwortete: eine neue Abholung desselben Codes darf nicht hinter einem alten
  // Schreibergebnis verschwinden (dort fehlte eine inzwischen eingegangene Antwort).
  const [zuletzt, setZuletzt] = useState<"abholen" | "schreiben">("abholen");
  // Der Entwurf gehört zu einem Code: ein anderer Code bekommt ein leeres Feld.
  const entwurfCode = useRef<string | null>(null);
  const [abgeholt, abholen, holt] = useActionState(async (v: AbholErgebnis | null, fd: FormData) => {
    const r = await abholenAktion(v, fd);
    setZuletzt("abholen");
    if (r.ok && r.code !== entwurfCode.current) {
      entwurfCode.current = r.code;
      setAntwort("");
    }
    return r;
  }, null);
  const [geschrieben, schreiben, schreibt] = useActionState(async (v: AbholErgebnis | null, fd: FormData) => {
    const gesendeterText = String(fd.get("text") ?? "");
    const r = await zurueckschreibenAktion(v, fd);
    setZuletzt("schreiben");
    // Den Text erst leeren, wenn er wirklich gespeichert ist, und nur, wenn er seither nicht geändert wurde.
    if (r.ok && r.gesendet === true) setAntwort((jetzt) => (jetzt === gesendeterText ? "" : jetzt));
    return r;
  }, null);

  const ergebnis = zuletzt === "schreiben" && geschrieben ? geschrieben : abgeholt;
  const nichtGesendet = zuletzt === "schreiben" && geschrieben?.ok === true && geschrieben.gesendet !== true;
  const fund = ergebnis?.ok ? ergebnis : null;
  const a = fund?.abholung;

  return (
    <Blatt titel="Antwort abholen" schrift={schrift}>
      <form action={abholen} className={`${s.zustand} ${s.aufbau}`} style={{ marginTop: 4 }} noValidate>
        <label htmlFor="code" className={e.feldLabel}>Abholcode</label>
        <input
          id="code"
          name="code"
          className={e.eingabe}
          value={code}
          onChange={(ev) => setCode(ev.target.value)}
          autoComplete="off"
          autoCapitalize="characters"
          spellCheck={false}
          placeholder="WORT-0000-WORT"
        />
        <button className={s.knopf} type="submit" style={{ marginTop: 16 }} disabled={holt} aria-busy={holt}>
          {holt ? "Wird gesucht…" : "Antwort ansehen"}
        </button>
      </form>

      {ergebnis && !ergebnis.ok ? <p className={s.meldung} role="alert">{FEHLER[ergebnis.fehler]}</p> : null}

      {a ? (
        <div className={s.aufbau} data-testid="abholung">
          <p className={s.meta} style={{ marginTop: 28 }}>
            Deine Mitteilung vom <b>{langesDatum(a.tag)}</b>
            {a.thema ? ` · ${a.thema}` : ""}
          </p>
          <ol className={e.spur} aria-label="Stand">
            {([
              ["Eingegangen", true],
              ["Gelesen", a.status !== "neu"],
              ["Erledigt", a.status === "erledigt"],
            ] as const).map(([wort, erreicht]) => (
              <li key={wort} data-erreicht={erreicht ? "" : undefined}>
                {wort}
                {erreicht ? null : <span className={s.srOnly}> (noch nicht)</span>}
              </li>
            ))}
          </ol>
          {a.gespraech.length === 0 ? (
            <p className={s.meldung}>Noch keine Antwort.</p>
          ) : (
            a.gespraech.map((n, i) => (
              <div key={i} className={e.antwort} data-von={n.von}>
                <span className={e.von}>
                  {n.von === "vp" ? "Antwort der Vertrauenspersonen" : "Du"} · {langesDatum(n.tag)}
                </span>
                <p className={e.koerper}>{n.text}</p>
              </div>
            ))
          )}
          {a.rueckfrageMoeglich ? (
            <form action={schreiben} style={{ marginTop: 28 }}>
              <input type="hidden" name="code" value={fund.code} />
              <label htmlFor="rueckfrage" className={e.feldLabel}>Möchtest du darauf antworten?</label>
              <textarea
                id="rueckfrage"
                name="text"
                className={`${s.textfeld} ${e.langfeld}`}
                maxLength={2000}
                rows={3}
                value={antwort}
                readOnly={schreibt}
                onChange={(ev) => setAntwort(ev.target.value)}
              />
              <button className={s.knopf} type="submit" style={{ marginTop: 12 }} disabled={schreibt || antwort.trim() === ""}>
                {schreibt ? "Wird gesendet…" : "Antwort senden"}
              </button>
              {nichtGesendet ? <p className={s.meldung} role="alert">{NICHT_GESENDET}</p> : null}
            </form>
          ) : null}
          <details className={e.details}>
            <summary>Deine Mitteilung anzeigen</summary>
            <p>{a.text}</p>
          </details>
        </div>
      ) : null}
    </Blatt>
  );
}

"use client";
import { signIn } from "next-auth/react";
import { useSearchParams } from "next/navigation";
import { absoluteCallbackUrl } from "@/core/auth/callbackUrl";
import { suiteRedirect } from "@/core/auth/redirect";
import { vereinigeGruppen } from "@/core/auth/devGroups";
import { useEffect, useEffectEvent, useState } from "react";
import { Button, Checkbox, Input } from "antd";
import styles from "./login-form.module.css";

/**
 * Das Hintergrundbild. Unter `/login/…` und nicht an der Wurzel: `/login` steht
 * in `core/routing.ts` auf der PASSTHROUGH-Liste, `/login-bg.jpg` stand es
 * nicht — auf einem Modul-Host (z. B. Lagerbuch) schrieb der Proxy das Bild auf
 * `/m/<modul>/login-bg.jpg` um, 404, die Seite stand ohne Bild da.
 */
const HINTERGRUNDBILD = "/login/hintergrund.jpg";

/**
 * Enter ohne Fokus auf einem Bedienelement führt zu Pocket ID. Was selbst auf
 * Enter reagiert, behält die Taste: ein Feld oder Häkchen des Dev-Logins
 * (dort sendet Enter dessen Formular ab), ein Knopf (der Pocket-ID-Knopf löst
 * mit Fokus ohnehin selbst aus — sonst liefe die Anmeldung doppelt), ein Link.
 */
function behaeltEnter(ziel: EventTarget | null): boolean {
  return (
    ziel instanceof Element &&
    ziel.closest("input, textarea, select, button, a[href], form, [contenteditable], [role='button']") !== null
  );
}

function PocketIdLogo() {
  return (
    <svg viewBox="0 0 24 24" fill="none" width={22} height={22} aria-hidden>
      <path
        d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2Zm0 4a3 3 0 1 1 0 6 3 3 0 0 1 0-6Zm0 13.5c-2.5 0-4.7-1.28-6-3.22.03-1.99 4-3.08 6-3.08 1.99 0 5.97 1.09 6 3.08-1.3 1.94-3.5 3.22-6 3.22Z"
        fill="currentColor"
      />
    </svg>
  );
}

export function LoginForm({
  devLogin,
  gruppenAuswahl = [],
}: {
  devLogin: boolean;
  /**
   * Die anhakbaren Gruppen — berechnet in `login/page.tsx` über
   * `devGroupChoices()`. NICHT hier deklarieren: diese Datei trägt
   * `"use client"`, ein Wert von hier käme in der Server Component als
   * Client-Referenz an (Falle 6, HTTP 500 für die Anmeldeseite).
   */
  gruppenAuswahl?: string[];
}) {
  const callbackUrl = useSearchParams().get("callbackUrl") ?? "/";
  const [email, setEmail] = useState("dev@localtest.me");
  const [groups, setGroups] = useState("");
  const [angehakt, setAngehakt] = useState<string[]>([]);
  const [weiter, setWeiter] = useState(false);
  const alleAn = gruppenAuswahl.length > 0 && angehakt.length === gruppenAuswahl.length;
  const teilweise = angehakt.length > 0 && !alleAn;

  function zuPocketId() {
    if (weiter) return;
    setWeiter(true);
    // Absolut gegen den Host, auf dem diese Seite läuft — NICHT relativ.
    // Warum, steht in core/auth/callbackUrl.ts; dass ein präparierter
    // callbackUrl damit nicht zum offenen Redirector wird, stellt die
    // Allowlist in core/auth/redirect.ts sicher.
    signIn("pocket-id", {
      redirectTo: absoluteCallbackUrl(callbackUrl, window.location.origin),
    }).catch(() => setWeiter(false));
  }

  const beiTaste = useEffectEvent((e: KeyboardEvent) => {
    if (e.key !== "Enter" || e.repeat || e.isComposing || e.defaultPrevented) return;
    if (e.altKey || e.ctrlKey || e.metaKey || e.shiftKey) return;
    if (behaeltEnter(e.target)) return;
    e.preventDefault();
    zuPocketId();
  });

  // Zurück aus Pocket ID per Browser-Zurück: der bfcache stellt die Seite mit
  // drehendem Knopf wieder her. Ohne das hier bliebe sie gesperrt.
  const beiRueckkehr = useEffectEvent((e: PageTransitionEvent) => {
    if (e.persisted) setWeiter(false);
  });

  useEffect(() => {
    const taste = (e: KeyboardEvent) => beiTaste(e);
    const rueckkehr = (e: PageTransitionEvent) => beiRueckkehr(e);
    window.addEventListener("keydown", taste);
    window.addEventListener("pageshow", rueckkehr);
    return () => {
      window.removeEventListener("keydown", taste);
      window.removeEventListener("pageshow", rueckkehr);
    };
  }, []);

  return (
    <main className={styles.seite}>
      <section className={styles.bild}>
        {/* eslint-disable-next-line @next/next/no-img-element -- `next/image` braucht zur Laufzeit `sharp` im Standalone-Image; ein Bild, eine Größe, dafür lohnt es nicht. */}
        <img className={styles.bildDatei} src={HINTERGRUNDBILD} alt="" fetchPriority="high" decoding="async" />
        <div className={styles.bildInhalt}>
          <span className={styles.marke}>
            <span className={styles.markeKachel} aria-hidden>
              IDA
            </span>
            I&amp;K-Suite
          </span>
          <p className={styles.bildTitel}>Interne Dienste und Anwendungen</p>
        </div>
      </section>

      <section className={styles.anmeldung}>
        <div className={styles.inhalt}>
          <p className={styles.kicker}>IDA · Anmeldung</p>
          <h1 className={styles.titel}>Willkommen zurück</h1>
          <p className={styles.einleitung}>
            Du meldest dich über Pocket ID an – mit deinem Passkey, ohne Passwort. Danach kommst du
            direkt hierher zurück.
          </p>

          <Button type="primary" block loading={weiter} onClick={zuPocketId}>
            <span className={styles.knopfInhalt}>
              {!weiter && <PocketIdLogo />}
              {weiter ? "Weiter zu Pocket ID …" : "Mit Pocket ID anmelden"}
            </span>
          </Button>

          <p className={styles.tipp}>
            Oder einfach <kbd className={styles.taste}>Enter</kbd> drücken.
          </p>

          {devLogin && (
            <form
              className={styles.entwicklung}
            onSubmit={async (e) => {
              e.preventDefault();
              // Dev-login only: post the credentials WITHOUT letting next-auth perform the
              // redirect. Auth.js derives its redirect base URL from the server-side request
              // origin (localhost in dev, since Next's Request doesn't reflect the client Host
              // header), so its own redirect would bounce the browser off the requesting
              // *.localtest.me host. With redirect:false the session cookie is set by the fetch
              // response, and we navigate on the CURRENT origin instead — keeping the browser on
              // the host that initiated the login. Production-safe (this branch renders only when
              // dev-login is enabled — dev mode or explicit AUTH_DEV_LOGIN=true, never in production
              // builds; see core/auth/devLogin.ts) and it leaves the real Pocket-ID button intact.
              await signIn("dev-login", {
                email,
                groups: vereinigeGruppen(angehakt, groups),
                redirect: false,
              });
              // DIE WEICHE: geprueft gegen die Suite-Allowlist, nicht gegen
              // `startsWith("/")`. Zwei Gruende, beide vorher still:
              //  - ein ABSOLUTES Ziel auf einem Suite-Host wurde verworfen und
              //    landete auf der Wurzel. Der Verwaltungsknopf des
              //    Lagerbuch-Gates traegt genau so einen Wert (Host-Wechsel),
              //    und der Weg dorthin war in jeder Dev- und E2E-Umgebung tot.
              //  - `"//boese.example/".startsWith("/")` ist `true`: ein
              //    protokoll-relativer Wert kam durch, den der Browser als
              //    FREMDE Origin liest — eine offene Weiterleitung.
              //
              // WARUM HIER PRUEFEN, wo `core/auth/callbackUrl.ts` das fuer den
              // Pocket-ID-Knopf oben ausdruecklich ABLEHNT ("taeuschte einen
              // Schutz vor, den eine Client-Komponente nicht leisten kann"):
              // dort geht der Wert an Auth.js, das `suiteRedirect`
              // SERVERSEITIG faehrt — eine Client-Pruefung waere Theater. Hier
              // steht `redirect: false`, Auth.js sieht das Ziel nie, und der
              // Browser navigiert selbst. Es gibt also keine nachgelagerte
              // Pruefung; diese ist nicht die zweite, sondern die einzige.
              //
              // `env: {}` bewusst: im Browser-Bundle gibt es `SUITE_HOST_*`
              // nicht (nur `NEXT_PUBLIC_*` wird eingesetzt). Der Default
              // `process.env` saehe unter Vitest die echte Node-Umgebung und
              // damit ANDERE Hosts als der Browser — der gruene Lauf beschriebe
              // dann nicht das Verhalten im Browser. Erlaubt bleibt so: die
              // eigene Origin, `<key>.localtest.me` und die literalen
              // `prodHosts` der Registry. Das faellt zu, nicht auf — und der
              // Dev-Login laeuft ohnehin nur in Dev/E2E.
              window.location.assign(
                suiteRedirect({ url: callbackUrl, baseUrl: window.location.origin, env: {} }),
              );
            }}
            >
              <p className={styles.entwicklungTitel}>Entwicklungs-Login</p>
              <Input aria-label="email" value={email} onChange={(e) => setEmail(e.target.value)} />

              {gruppenAuswahl.length > 0 && (
                <div className={styles.gruppen}>
                  <div className={styles.gruppenKopf}>
                    <span>Gruppen</span>
                    {/*
                      „Alle auswählen“ ist bewusst KEIN dritter Zustand zum
                      Anklicken: `indeterminate` zeigt nur an, dass eine Teilmenge
                      steht — ein Klick setzt immer alle oder keine.
                    */}
                    <Checkbox
                      indeterminate={teilweise}
                      checked={alleAn}
                      onChange={(e) => setAngehakt(e.target.checked ? [...gruppenAuswahl] : [])}
                    >
                      Alle auswählen
                    </Checkbox>
                  </div>
                  {/*
                    Ohne `aria-label`: `e2e/fixtures.ts` greift das Freitextfeld
                    über `getByLabel("groups")`, und Playwrights `getByLabel`
                    matcht Teilzeichenketten unter Strict Mode. Ein zweites
                    Element, dessen Name „groups“ enthält, ließe jeden
                    anmeldenden E2E-Test an dieser Stelle sterben. Die sichtbare
                    Überschrift darüber trägt die Beschriftung.

                    Die Farben der Beschriftungen kommen wieder aus antd: die
                    Fläche folgt jetzt dem Theme (`--an-flaeche`), statt in
                    beiden Modi fest hell zu sein.
                  */}
                  <Checkbox.Group
                    value={angehakt}
                    onChange={(werte) => setAngehakt(werte as string[])}
                    options={gruppenAuswahl.map((g) => ({ label: g, value: g }))}
                    style={{ display: "flex", flexDirection: "column", gap: 4 }}
                  />
                </div>
              )}

              <Input
                aria-label="groups"
                placeholder="weitere Gruppen, kommagetrennt"
                value={groups}
                onChange={(e) => setGroups(e.target.value)}
              />
              <Button htmlType="submit" block>
                Dev-Login
              </Button>
            </form>
          )}
        </div>

        <p className={styles.fuss}>Interner Bereich · Zugriff nur für Berechtigte</p>
      </section>
    </main>
  );
}

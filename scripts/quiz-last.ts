/**
 * LASTPROBE LIVE-QUIZ (Task 11, nicht Teil der CI): N simulierte Handys gegen einen LAUFENDEN Server.
 *
 *   pnpm exec tsx scripts/quiz-last.ts <BASIS-URL des feedback-Hosts> <Moderations-Secret> [--n 40] [--spanne 2000]
 *   z. B. pnpm exec tsx scripts/quiz-last.ts http://feedback.localtest.me:3190 lokal-quiz-uav
 *
 * Startet selbst nichts. Ablauf: laufende Runde beenden, Lobby öffnen (neue Runde, neuer Code),
 * N Beitritte mit je eigenem Cookie, N Handy-Ströme und ein Beamer-Strom offen, Schritt 1 (erste Frage),
 * N Antworten über `--spanne` ms verteilt. Gemessen wird je Antwort die Zeit vom Absenden bis zum
 * ersten Beamer-Ereignis, dessen `frage.antworten` sie enthält: die k-te angenommene Antwort (in der
 * Reihenfolge der HTTP-Antworten) gilt als angekommen, sobald der Beamer mindestens k Antworten
 * meldet und das Ereignis nach ihrem Absenden eintraf. Ausgabe: p50, p95, Maximum und alle Fehler.
 *
 * Alle Anfragen eines Laufs tragen DIESELBE Absenderadresse (`cf-connecting-ip`): ein ganzer Raum
 * hinter einem WLAN-NAT, der realistische Fall für die Beitrittsgrenze je Adresse. Die erste Frage des Quiz
 * braucht ein Zeitlimit über der Spanne (oder keines) und eine erste Option.
 *
 * In einer Cloud-Session löst `*.localtest.me` nicht auf: dann mit
 * `NODE_OPTIONS="--require ./e2e/helpers/loopback-dns.cjs"` starten (CLAUDE.md, „Playwright in Cloud-Sessions").
 */

type Ereignis = { zeit: number; daten: unknown };

/**
 * Eine Adresse je Lauf (TEST-NET-3, zufällig): ein Lauf ist ein Raum. Fest verdrahtet hätte ein
 * zweiter Lauf binnen einer Minute die Beitrittsgrenze des ersten geerbt (2 × 40 + Versuche > 120).
 */
const NAT_ADRESSE = `203.0.113.${1 + Math.floor(Math.random() * 254)}`;

function argumente(argv: string[]) {
  const [basis, secret] = argv.filter((a, i) => !a.startsWith("--") && !argv[i - 1]?.startsWith("--"));
  if (!basis || !secret) {
    console.error("Aufruf: tsx scripts/quiz-last.ts <BASIS-URL> <SECRET> [--n 40] [--spanne 2000]");
    process.exit(2);
  }
  const zahl = (name: string, vorgabe: number) => {
    const i = argv.indexOf(`--${name}`);
    return i >= 0 ? Number(argv[i + 1]) : vorgabe;
  };
  return { basis: basis.replace(/\/$/, ""), secret, n: zahl("n", 40), spanne: zahl("spanne", 2000) };
}

const KOPF = { "content-type": "application/json", "cf-connecting-ip": NAT_ADRESSE };

async function post(url: string, body: unknown, cookie?: string): Promise<Response> {
  return fetch(url, { method: "POST", headers: { ...KOPF, ...(cookie ? { cookie } : {}) }, body: JSON.stringify(body) });
}

/** Liest einen SSE-Strom und ruft `bei` je `data:`-Block (ohne `event:`) mit Empfangszeit auf. */
async function lauscheStrom(
  url: string,
  signal: AbortSignal,
  bei: (e: Ereignis) => void,
  cookie?: string,
): Promise<void> {
  const res = await fetch(url, { headers: { "cf-connecting-ip": NAT_ADRESSE, ...(cookie ? { cookie } : {}) }, signal });
  if (!res.ok || !res.body) throw new Error(`Strom ${url}: HTTP ${res.status}`);
  const leser = res.body.pipeThrough(new TextDecoderStream()).getReader();
  let puffer = "";
  for (;;) {
    const { value, done } = await leser.read();
    if (done) return;
    puffer += value;
    let ende: number;
    while ((ende = puffer.indexOf("\n\n")) >= 0) {
      const block = puffer.slice(0, ende);
      puffer = puffer.slice(ende + 2);
      if (block.startsWith(":") || block.startsWith("event:")) continue;
      const daten = block
        .split("\n")
        .filter((z) => z.startsWith("data:"))
        .map((z) => z.slice(5).trimStart())
        .join("\n");
      if (daten) bei({ zeit: performance.now(), daten: JSON.parse(daten) });
    }
  }
}

function perzentil(sortiert: number[], p: number): number {
  if (sortiert.length === 0) return NaN;
  const i = Math.min(sortiert.length - 1, Math.ceil((p / 100) * sortiert.length) - 1);
  return sortiert[Math.max(0, i)];
}

const warte = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Wartet, bis `bedingung` wahr ist (alle 20 ms geprüft), höchstens `ms`. */
async function bis(bedingung: () => boolean, ms: number): Promise<boolean> {
  const ende = performance.now() + ms;
  while (performance.now() < ende) {
    if (bedingung()) return true;
    await warte(20);
  }
  return bedingung();
}

async function main() {
  const { basis, secret, n, spanne } = argumente(process.argv.slice(2));
  const beamer = `${basis}/beamer/${encodeURIComponent(secret)}`;
  const fehler: string[] = [];
  const abbruch = new AbortController();

  // Frische Runde: eine laufende beenden, dann die Lobby öffnen.
  await post(`${beamer}/beenden`, {});
  const lobby = await post(`${beamer}/schritt`, { schritt: 0 });
  if (!lobby.ok) throw new Error(`Lobby öffnen: HTTP ${lobby.status}`);
  const sicht = (await lobby.json()) as { beitrittCode?: string; modus: string };
  const code = sicht.beitrittCode;
  if (!code) throw new Error("Lobby ohne Beitrittscode");
  console.log(`Runde offen, Code ${code}, Modus ${sicht.modus}, ${n} Teilnehmende, Spanne ${spanne} ms`);

  // Beitritte, alle gleichzeitig, je eigenes Cookie.
  const t0 = performance.now();
  const cookies = await Promise.all(
    Array.from({ length: n }, async (_, i) => {
      const res = await post(`${basis}/q/${code}/beitritt`, sicht.modus === "wettbewerb" ? { spitzname: `Last ${i + 1}` } : {});
      if (!res.ok) {
        fehler.push(`Beitritt ${i + 1}: HTTP ${res.status} ${await res.text()}`);
        return null;
      }
      // Nur das Cookie der Runde; die Hülle setzt daneben eigene (Thema, Zeitzone).
      const satz = res.headers.getSetCookie().find((c) => c.startsWith("iuk-quiz-"));
      if (!satz) fehler.push(`Beitritt ${i + 1}: kein Cookie der Runde`);
      return satz?.split(";")[0] ?? null;
    }),
  );
  console.log(`Beitritte: ${cookies.filter(Boolean).length}/${n} in ${Math.round(performance.now() - t0)} ms`);

  // Ströme: ein Beamer, N Handys.
  const beamerEreignisse: Ereignis[] = [];
  const handyPhase = new Map<number, string>();
  const stroeme: Promise<void>[] = [];
  const merke = (wer: string) => (e: unknown) => {
    if (!abbruch.signal.aborted) fehler.push(`Strom ${wer}: ${String(e)}`);
  };
  stroeme.push(lauscheStrom(`${beamer}/strom`, abbruch.signal, (e) => beamerEreignisse.push(e)).catch(merke("Beamer")));
  cookies.forEach((cookie, i) => {
    if (!cookie) return;
    stroeme.push(
      lauscheStrom(
        `${basis}/q/${code}/strom`,
        abbruch.signal,
        (e) => handyPhase.set(i, (e.daten as { phase: { art: string } }).phase.art),
        cookie,
      ).catch(merke(`Handy ${i + 1}`)),
    );
  });
  const verbunden = cookies.filter(Boolean).length;
  if (!(await bis(() => beamerEreignisse.length > 0 && handyPhase.size === verbunden, 10_000))) {
    fehler.push(`Nur ${handyPhase.size}/${verbunden} Handy-Ströme und ${beamerEreignisse.length} Beamer-Ereignisse nach 10 s`);
  }

  // Erste Frage.
  const frage = await post(`${beamer}/schritt`, { schritt: 1 });
  if (!frage.ok) throw new Error(`Schritt 1: HTTP ${frage.status}`);
  const inFrage = () => [...handyPhase.values()].filter((p) => p === "frage").length;
  if (!(await bis(() => inFrage() === verbunden, 5_000))) fehler.push(`Nur ${inFrage()}/${verbunden} Handys sehen die Frage nach 5 s`);
  const frageIndex = 0;

  // Antworten, gleichmäßig über die Spanne verteilt.
  const gesendet: { i: number; ab: number; an: number; ok: boolean }[] = [];
  await Promise.all(
    cookies.map(async (cookie, i) => {
      if (!cookie) return;
      await warte((i * spanne) / Math.max(1, n));
      const ab = performance.now();
      const res = await post(`${basis}/q/${code}/antwort`, { frageIndex, gewaehlt: [0] }, cookie);
      const an = performance.now();
      if (!res.ok) fehler.push(`Antwort ${i + 1}: HTTP ${res.status} ${await res.text()}`);
      gesendet.push({ i, ab, an, ok: res.ok });
    }),
  );

  const zaehler = (e: Ereignis) => (e.daten as { frage?: { index: number; antworten: number } }).frage;
  const angenommen = gesendet.filter((g) => g.ok).sort((a, b) => a.an - b.an);
  await bis(() => beamerEreignisse.some((e) => (zaehler(e)?.antworten ?? 0) >= angenommen.length), 5_000);

  const latenzen: number[] = [];
  angenommen.forEach((g, k) => {
    const treffer = beamerEreignisse.find(
      (e) => e.zeit >= g.ab && zaehler(e)?.index === frageIndex && (zaehler(e)?.antworten ?? 0) >= k + 1,
    );
    if (treffer) latenzen.push(treffer.zeit - g.ab);
    else fehler.push(`Antwort ${g.i + 1}: kein Beamer-Ereignis mit ≥ ${k + 1} Antworten`);
  });

  abbruch.abort();
  await Promise.allSettled(stroeme);
  await post(`${beamer}/beenden`, {});

  latenzen.sort((a, b) => a - b);
  const r = (x: number) => `${Math.round(x)} ms`;
  console.log(`Antworten angenommen: ${angenommen.length}/${n}, Beamer-Ereignisse: ${beamerEreignisse.length}`);
  console.log(`Antwort → Beamer: p50 ${r(perzentil(latenzen, 50))} · p95 ${r(perzentil(latenzen, 95))} · max ${r(latenzen.at(-1) ?? NaN)}`);
  console.log(fehler.length === 0 ? "Fehler: keine" : `Fehler (${fehler.length}):\n  ${fehler.join("\n  ")}`);
  process.exit(fehler.length === 0 && perzentil(latenzen, 95) < 1000 ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

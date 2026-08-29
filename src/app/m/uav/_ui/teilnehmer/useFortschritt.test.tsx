// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import type { Identity } from "../../_lib/sitzung";
import type { TaskDTO } from "../../_lib/typen";
import { localStore } from "../offline/localStore";
import { useFortschritt } from "./useFortschritt";
import { click, mount, unmount } from "@/app/m/qr/_lib/test-dom";

/**
 * Reviewer-Fund (Fix-Runde 1): Mutationen wurden nur in die Sync-Queue
 * gespiegelt, wenn `identity.kind === "participant"` bereits BESTÄTIGT war.
 * Ein Teilnehmer, der offline mit noch unbestätigter Identität (Erst-Render,
 * `api.me()` noch unterwegs oder fehlgeschlagen) etwas erfasst, verlor diese
 * Erfassung beim nächsten `snapshotAnwenden` endgültig (Spec §3 #4). Die Queue
 * bekommt die Mutation jetzt IMMER — der Sync-Engine-Lauf selbst bleibt an die
 * bestätigte Identität gebunden (`TeilnehmerApp.tsx`), nicht das Queuing.
 */

const KATALOG: TaskDTO[] = [
  { id: "1-1", teil: 1, nummer: "1.1", titel: "t", lernziel: "", schritte: [], durchfuehrungshinweise: [], sicherheitshinweise: [], zielanzahlDefault: 2, sortOrder: 0, aktiv: true },
];

function Harness({ identity }: { identity: Identity | null }) {
  const { durchfuehrungHinzufuegen, zielanzahlSetzen } = useFortschritt(KATALOG, identity);
  return (
    <div>
      <button
        type="button"
        onClick={() =>
          durchfuehrungHinzufuegen("1-1", { datum: "2026-08-20", drohnensteuerer: "A", luftraumbeobachter: "B" })
        }
      >
        add
      </button>
      <button type="button" onClick={() => zielanzahlSetzen("1-1", 5)}>
        ziel
      </button>
    </div>
  );
}

beforeEach(() => localStorage.clear());
afterEach(async () => {
  await unmount();
});

describe("useFortschritt — Queue unabhängig von der Identität", () => {
  it("queued eine Execution-Mutation auch ohne bestätigte Identität (identity === null)", async () => {
    await mount(<Harness identity={null} />);
    await click("button");
    const queue = localStore.queueLesen();
    expect(queue).toHaveLength(1);
    expect(queue[0]).toMatchObject({ art: "execution", daten: { taskId: "1-1" } });
  });

  it("queued eine TaskStatus-Mutation auch ohne bestätigte Identität", async () => {
    await mount(<Harness identity={null} />);
    await click('button:nth-of-type(2)');
    const queue = localStore.queueLesen();
    expect(queue).toHaveLength(1);
    expect(queue[0]).toMatchObject({ art: "taskStatus", daten: { taskId: "1-1", zielanzahl: 5 } });
  });
});

/**
 * Der Fund, der `e2e/uav.spec.ts`s Check 7 (Offline-Erfassung) blockierte,
 * bevor `neueId()` auf `randomId()` aus `@/core/zufallsId` umgestellt wurde:
 * `crypto.randomUUID()` existiert nur im Secure Context, `http://uav.localtest.me`
 * (wie jede LAN-IP im echten Einsatz) ist keiner —
 * `Uncaught TypeError: crypto.randomUUID is not a function` riss die ganze
 * Seite ab, sobald „Durchführung hinzufügen" den Handler erreichte.
 *
 * jsdom stellt `crypto.randomUUID` UNABHÄNGIG vom Secure Context bereit (das
 * Konzept existiert dort nicht) — ein Vitest-Lauf ohne diesen Test hätte den
 * Fund deshalb strukturell nicht sehen können, egal wie oft
 * `durchfuehrungHinzufuegen` aufgerufen wird. Dieser Test nimmt
 * `crypto.randomUUID` gezielt weg (dieselbe Bauform wie
 * `src/core/zufallsId.test.ts`) und stellt damit genau die Bedingung her, die
 * den Absturz im Browser auslöste.
 */
describe("useFortschritt — Erfassung ohne crypto.randomUUID (Secure-Context-Fallback)", () => {
  it("legt eine Durchführung an, ohne dass crypto.randomUUID existiert", async () => {
    const original = globalThis.crypto;
    Object.defineProperty(globalThis, "crypto", { value: {}, configurable: true });
    try {
      await mount(<Harness identity={null} />);
      await click("button");
    } finally {
      Object.defineProperty(globalThis, "crypto", { value: original, configurable: true });
    }
    const queue = localStore.queueLesen();
    expect(queue).toHaveLength(1);
    expect(queue[0]).toMatchObject({ art: "execution", daten: { taskId: "1-1" } });
    // `randomId()`s Fallback bleibt UUID-v4-förmig — ein Verbraucher darf am
    // Format nicht unterscheiden können, ob crypto.randomUUID verfügbar war.
    const id = (queue[0] as { daten: { id: string } }).daten.id;
    expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  });
});

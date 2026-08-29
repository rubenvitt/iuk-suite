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

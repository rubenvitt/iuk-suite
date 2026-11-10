import { beforeEach, describe, expect, it, vi } from "vitest";

/*
 * Die Actions lösen alles aus der Sitzung auf; geprüft wird, dass ein Aufruf nur Filter und Position
 * mitbringt und die Person nie aus dem Aufruf kommt. `auth` und das Merken sind gemockt, die Auswahl
 * läuft echt über das Register.
 */
vi.mock("@/core/auth", () => ({ auth: vi.fn() }));
vi.mock("@/app/m/portal/_lib/vorlieben", () => ({ merkeNeuigkeitenGesehen: vi.fn() }));

import { auth } from "@/core/auth";
import { merkeNeuigkeitenGesehen } from "@/app/m/portal/_lib/vorlieben";
import { NEUIGKEITEN_SEITE, gesehenNach, neuigkeitenFuer, seiteAus } from "@/app/m/portal/_lib/neuigkeiten/auswahl";
import { ladeNeuigkeitenAction, merkeNeuigkeitenGesehenAction } from "./actions";

const authMock = vi.mocked(auth);

describe("Neuigkeiten-Actions (IDA-391)", () => {
  beforeEach(() => {
    authMock.mockReset();
    authMock.mockResolvedValue({ user: { id: "person-1", groups: [] } } as never);
    vi.mocked(merkeNeuigkeitenGesehen).mockClear();
  });

  it("lädt die nächste Seite aus der Auswahl der Sitzung", async () => {
    const alle = neuigkeitenFuer([]);
    expect(await ladeNeuigkeitenAction("alle", NEUIGKEITEN_SEITE)).toEqual(seiteAus(alle, "alle", NEUIGKEITEN_SEITE));
    expect(await ladeNeuigkeitenAction("portal", 0)).toEqual(seiteAus(alle, "portal", 0));
  });

  it("lehnt unbrauchbare oder fremde Filter ab", async () => {
    // `lagerbuch` sieht diese Person nicht — der Filter darf das nicht umgehen.
    expect(await ladeNeuigkeitenAction("lagerbuch", 0)).toBeNull();
    expect(await ladeNeuigkeitenAction("alle", -1)).toBeNull();
    expect(await ladeNeuigkeitenAction("alle", 1.5)).toBeNull();
    expect(await ladeNeuigkeitenAction(42, 0)).toBeNull();
  });

  it("merkt den Stand für die Person der Sitzung — und anonym gar nicht", async () => {
    await merkeNeuigkeitenGesehenAction();
    expect(merkeNeuigkeitenGesehen).toHaveBeenCalledWith("person-1", gesehenNach(neuigkeitenFuer([])));

    authMock.mockResolvedValue(null as never);
    vi.mocked(merkeNeuigkeitenGesehen).mockClear();
    await merkeNeuigkeitenGesehenAction();
    expect(merkeNeuigkeitenGesehen).not.toHaveBeenCalled();
  });
});

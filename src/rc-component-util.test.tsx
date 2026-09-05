// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { createRequire } from "node:module";
import { useEffect } from "react";

import { mount, unmount } from "@/app/m/qr/_lib/test-dom";

type UseDelayState = (
  defaultValue: boolean,
) => [boolean, (nextValue: boolean, delay: { ms: number }) => void];

const requireVomProjekt = createRequire(import.meta.url);
const requireVonAntd = createRequire(requireVomProjekt.resolve("antd"));
const useDelayState = requireVonAntd("@rc-component/util/lib/hooks/useDelayState").default as UseDelayState;

afterEach(async () => {
  await unmount();
  vi.clearAllTimers();
  vi.useRealTimers();
});

describe("@rc-component/util useDelayState", () => {
  it("verwirft eine verzoegerte Aktualisierung beim Unmount", async () => {
    vi.useFakeTimers();

    function Pruefling() {
      const [, setVerzoegert] = useDelayState(false);

      useEffect(() => {
        setVerzoegert(true, { ms: 10 });
      }, [setVerzoegert]);

      return null;
    }

    await mount(<Pruefling />);
    expect(vi.getTimerCount(), "die Probe hat keine verzoegerte Aktualisierung geplant").toBe(1);

    await unmount();

    expect(vi.getTimerCount(), "der Unmount laesst eine spaetere React-Aktualisierung zurueck").toBe(
      0,
    );
  });
});

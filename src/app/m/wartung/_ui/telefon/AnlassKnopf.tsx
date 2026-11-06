"use client";

import { Button } from "antd";
import { Icons8Ikone } from "@/core/ikonen/Icons8Ikone";
import { anlassVermerkenAction } from "../../_actions/telefon";
import { useAktion } from "../useAktion";

/** „Wird eingesetzt“ bzw. „Zurück“ am Gerät (IDA-369): danach ist die Prüfung vor bzw. nach dem Einsatz fällig. */
export function AnlassKnopf({ geraetId, imEinsatz }: { geraetId: string; imEinsatz: boolean }) {
  const { laeuft, fuehreAus } = useAktion();
  return (
    <Button
      block
      loading={laeuft}
      icon={<Icons8Ikone name={imEinsatz ? "undo" : "truck"} groesse={20} />}
      onClick={() => fuehreAus(
        () => anlassVermerkenAction(geraetId, imEinsatz ? "rueckkehr" : "einsatz"),
        imEinsatz ? "Als zurück vermerkt." : "Als eingesetzt vermerkt.",
      )}
    >
      {imEinsatz ? "Zurück" : "Wird eingesetzt"}
    </Button>
  );
}

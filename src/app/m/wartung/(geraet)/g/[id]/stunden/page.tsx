import { verwaltetGruppe } from "../../../../_lib/zugang";
import { StundenAmGeraet } from "../../../../_ui/telefon/StundenAmGeraet";
import { geraetOder404 } from "../laden";

export const dynamic = "force-dynamic";

export default async function StundenSeite({ params }: { params: Promise<{ id: string }> }) {
  const { g, rechte } = await geraetOder404(params, "stunden");
  // IDA-381: nach unten korrigieren dürfen Verwaltende der Gruppe; der Server prüft es selbst noch einmal.
  return <StundenAmGeraet geraetId={g.id} geraetName={g.name} zuletzt={g.stunden} darfKorrigieren={verwaltetGruppe(rechte, g.gruppeId)} />;
}

export const metadata = { title: "Betriebsstunden" };

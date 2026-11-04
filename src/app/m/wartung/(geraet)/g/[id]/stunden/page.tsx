import { StundenAmGeraet } from "../../../../_ui/telefon/StundenAmGeraet";
import { geraetOder404 } from "../laden";

export const dynamic = "force-dynamic";

export default async function StundenSeite({ params }: { params: Promise<{ id: string }> }) {
  const { g } = await geraetOder404(params, "stunden");
  return <StundenAmGeraet geraetId={g.id} geraetName={g.name} zuletzt={g.stunden} />;
}

export const metadata = { title: "Betriebsstunden" };

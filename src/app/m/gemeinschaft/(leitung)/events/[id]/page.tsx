import { VorhabenAufruf } from "../../../_ui/planung/VorhabenAufruf";

export const dynamic = "force-dynamic";

export default async function GemeinschaftEvent({ params }: { params: Promise<{ id: string }> }) {
  return <VorhabenAufruf art="event" id={(await params).id} />;
}

export const metadata = { title: "Event" };

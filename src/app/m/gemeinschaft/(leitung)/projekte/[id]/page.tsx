import { VorhabenAufruf } from "../../../_ui/planung/VorhabenAufruf";

export const dynamic = "force-dynamic";

export default async function GemeinschaftProjekt({ params }: { params: Promise<{ id: string }> }) {
  return <VorhabenAufruf art="projekt" id={(await params).id} />;
}

export const metadata = { title: "Projekt" };

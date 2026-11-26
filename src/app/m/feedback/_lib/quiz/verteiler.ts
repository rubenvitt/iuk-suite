// In-Process-Verteiler je Quizrunde: bündelt Meldungen (höchstens ein Aufruf je 200 ms,
// der letzte Aufruf kommt garantiert) und begrenzt die Abonnenten je Runde.
// Der Speicher hängt an globalThis, damit er HMR in `next dev` übersteht.

export const BUENDELUNG_MS = 200;
export const MAX_ABONNENTEN = 200;

type Hoerer = () => void;

type Runde = {
  hoerer: Set<Hoerer>;
  timer: ReturnType<typeof setTimeout> | null;
};

type Speicher = Map<number, Runde>;

const g = globalThis as typeof globalThis & { __iukQuizVerteiler?: Speicher };

function speicher(): Speicher {
  return (g.__iukQuizVerteiler ??= new Map());
}

function ausloesen(rundeId: number): void {
  const runde = speicher().get(rundeId);
  if (!runde) return;
  runde.timer = null;
  for (const h of [...runde.hoerer]) {
    try {
      h();
    } catch {
      // Ein Hörer darf die anderen nicht aufhalten.
    }
  }
}

export function abonniere(rundeId: number, hoerer: Hoerer): (() => void) | null {
  const s = speicher();
  let runde = s.get(rundeId);
  if (!runde) {
    runde = { hoerer: new Set(), timer: null };
    s.set(rundeId, runde);
  }
  if (runde.hoerer.size >= MAX_ABONNENTEN) return null;
  // Eigene Hülle, damit derselbe Hörer zweimal abonnieren kann.
  const eintrag: Hoerer = () => hoerer();
  runde.hoerer.add(eintrag);
  const eigene = runde;
  return () => {
    eigene.hoerer.delete(eintrag);
    if (eigene.hoerer.size === 0) {
      if (eigene.timer) clearTimeout(eigene.timer);
      eigene.timer = null;
      if (s.get(rundeId) === eigene) s.delete(rundeId);
    }
  };
}

export function melde(rundeId: number): void {
  const runde = speicher().get(rundeId);
  if (!runde || runde.hoerer.size === 0) return;
  if (runde.timer) return; // Trailing-Aufruf ist schon geplant, der letzte Stand gewinnt.
  // Immer das volle Fenster ab der ersten Meldung: alle Meldungen darin ergeben einen Aufruf.
  runde.timer = setTimeout(() => ausloesen(rundeId), BUENDELUNG_MS);
}

export function anzahlAbonnenten(rundeId: number): number {
  return speicher().get(rundeId)?.hoerer.size ?? 0;
}

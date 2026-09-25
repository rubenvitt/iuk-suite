import { NextResponse } from "next/server";

/**
 * RP-initiated Logout gegen Pocket ID.
 *
 * Hierher schicken die gewollten Abmeldungen: „Abmelden" im Nutzermenü
 * (`core/shell/SuiteNav.tsx`, `abmeldenEintrag`) und „Von allen Geräten abmelden"
 * auf der Profilseite (`portal/_ui/ProfilAnsicht.tsx`). Die Route blieb bei der
 * Portierung aus iuk-overview zunächst zurück, und der Logout endete auf einer
 * 404. Auth.js' Catch-all liegt unter `/api/auth/[...nextauth]`; ein statisches
 * Segment gewinnt in Next gegen den Catch-all, deshalb greift diese Route.
 *
 * Ohne diesen Umweg bliebe nur das Session-Cookie der Suite weg — die Sitzung
 * beim Identity Provider liefe weiter und der nächste Login-Klick meldete
 * denselben Nutzer wortlos wieder an.
 *
 * **Keinen automatischen Aufrufer mehr, und das ist Absicht (DRK-444).** Bis
 * dahin schickte der Browser nach einem endgültig gescheiterten Token-Refresh
 * hierher. Seit DRK-284 verwirft der Server die Sitzung selbst (`jwt`-Callback
 * in `core/auth/config.ts`), und ein Ersatz von dort aus trüge nichts: Dieser
 * Endpunkt ist eine Browser-Umleitung, und der Server verwirft mitten in
 * irgendeiner Anfrage, ohne Browser, den er umleiten könnte. Das Refresh-Token
 * hat Pocket ID gerade selbst mit `invalid_grant` abgelehnt, ein Widerruf dort
 * ginge ins Leere. Und das Argument oben gilt nur für eine GEWOLLTE Abmeldung.
 * Nach einem abgelaufenen Refresh-Token ist der Ein-Klick-Login derselben
 * Person erwünscht, eine bei Pocket ID gesperrte Person kommt ohnehin nicht an.
 *
 * **`post_logout_redirect_uri` bleibt bewusst `AUTH_URL/login`, auch im
 * Multi-Host-Betrieb.** Pocket ID prüft diesen Wert gegen die beim Client
 * hinterlegten URIs; ein modul-eigener Wert wie `https://qr.iuk-ue.de/login`
 * würde abgewiesen, solange er dort nicht eingetragen ist — und das ist von hier
 * aus nicht prüfbar. Folge: wer sich auf einer Modul-Domain ausloggt, landet auf
 * dem Portal-Login. Das host-treu zu machen, heißt zuerst, die Logout-URIs in
 * Pocket ID zu pflegen — und erst dann diese Zeile.
 *
 * Beide Fehlerpfade enden auf `/login` statt in einer Fehlerseite: der Nutzer
 * ist an dieser Stelle bereits abgemeldet, ihm eine Sackgasse zu zeigen bringt
 * nichts.
 */
export async function GET() {
  const appUrl = process.env.AUTH_URL ?? "http://localhost:3000";
  const issuer = process.env.POCKET_ID_ISSUER;
  const loginUrl = new URL("/login", appUrl);

  if (!issuer) {
    return NextResponse.redirect(loginUrl);
  }

  try {
    const discovery = await fetch(`${issuer}/.well-known/openid-configuration`).then((r) =>
      r.json(),
    );

    const endSessionUrl = new URL(discovery.end_session_endpoint);
    endSessionUrl.searchParams.set("post_logout_redirect_uri", loginUrl.toString());

    return NextResponse.redirect(endSessionUrl.toString());
  } catch {
    return NextResponse.redirect(loginUrl);
  }
}

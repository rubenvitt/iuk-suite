import { NextResponse } from "next/server";

/**
 * RP-initiated Logout gegen Pocket ID.
 *
 * `providers.tsx` schickt bei `RefreshTokenError` hierher — bis hierhin gab es
 * diese Route in der Suite aber nicht: sie blieb bei der Portierung aus
 * iuk-overview zurück, und der automatische Logout endete auf einer 404 statt
 * beim Login. Auth.js' Catch-all liegt unter `/api/auth/[...nextauth]`; ein
 * statisches Segment gewinnt in Next gegen den Catch-all, deshalb greift diese
 * Route und nicht jener.
 *
 * Ohne diesen Umweg bliebe nur das Session-Cookie der Suite weg — die Sitzung
 * beim Identity Provider liefe weiter und der nächste Login-Klick meldete
 * denselben Nutzer wortlos wieder an.
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

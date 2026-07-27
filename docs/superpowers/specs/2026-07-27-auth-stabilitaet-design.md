# Auth — Sitzungsdauer und Robustheit

**Datum:** 2026-07-27
**Status:** Entwurf zur Abnahme
**Teilprojekt B von drei** (A: `2026-07-27-suite-chrome-design.md`)

---

## 1. Der Befund

Die Anfrage lautete: „Auth kann etwas länger ohne Neuanmeldung laufen, allgemein vielleicht stabiler
werden." Die Sitzungsdauer ist dabei nicht das Problem — `session.strategy: "jwt"` ohne `maxAge`
bedeutet 30 Tage Auth.js-Default, und das ist reichlich. Das Problem sitzt eine Ebene tiefer:

```ts
// core/auth/index.ts:19-54, gekürzt
async function refreshAccessToken(token: JWT): Promise<JWT> {
  try {
    const res = await fetch(token_endpoint, { … });
    if (!res.ok) throw new Error("Token refresh failed");
    …
  } catch {
    return { ...token, error: "RefreshTokenError" };   // ← jeder Fehler
  }
}
```

```ts
// components/providers.tsx:10-12
if (session?.error === "RefreshTokenError") {
  signOut({ callbackUrl: "/api/auth/oidc-signout" });  // ← sofort, endgültig
}
```

**Jeder** Fehlschlag führt zum sofortigen, endgültigen Logout: ein DNS-Aussetzer, ein Neustart von
Pocket ID, ein 502 vom Reverse Proxy, ein langsames Netz ohne Timeout. Aus Nutzersicht ist das „ich
werde ständig rausgeworfen" — und es sieht aus wie ein Sitzungsproblem, obwohl es ein
Fehlerbehandlungsproblem ist. Eine längere `maxAge` würde daran nichts ändern.

Dazu kommt: `fetch` steht ohne Timeout. Hängt der Token-Endpoint, hängt der `jwt`-Callback — und der
läuft bei **jedem** Request.

---

## 2. Vier Änderungen

### 2.1 Transiente Fehler von echten unterscheiden

`refreshAccessToken` bekommt drei Ausgänge statt zwei:

| Fall | Erkennung | Antwort |
|---|---|---|
| **Erfolg** | HTTP 200 | neue Token, `error: undefined` |
| **Token endgültig tot** | HTTP 400/401 **und** `error: "invalid_grant"` im Antwortkörper | `error: "RefreshTokenError"` → Re-Auth |
| **Transient** | Netzwerkfehler, Timeout, 5xx, alles andere | Token **unverändert** zurück, `refreshFailedAt` gesetzt |

`invalid_grant` ist der OAuth-2.0-Standardcode (RFC 6749 §5.2) für „dieses Refresh-Token gilt nicht
mehr" — abgelaufen, widerrufen, oder die Sitzung beim IdP ist beendet. Nur er rechtfertigt einen
Rauswurf.

**Warum den Token unverändert zurückgeben und nicht abbrechen:** Die Suite nutzt den Access-Token
nirgends für Ressourcenzugriffe — Autorisierung läuft über `token.groups` im JWT. Ein abgelaufener
Access-Token schadet der Sitzung also nicht. Das ist der richtige Preis für einen Netzwerkaussetzer.

### 2.1a Der Befund, der die Sitzungsverlängerung erst vertretbar macht

**Gruppen werden nach dem Login nie wieder aktualisiert.** In `core/auth/index.ts:113-120`:

```ts
if (profile) {
  token.groups = parseGroups(profile as Record<string, unknown>);
  token.fachgruppen = parseFachgruppen(profile as Record<string, unknown>);
}
```

`profile` liefert Auth.js **nur beim initialen Sign-in**. Bei jedem weiteren `jwt`-Aufruf ist es
`undefined`, und `refreshAccessToken` reicht `groups` unverändert durch (`{ ...token, accessToken,
idToken, refreshToken, expiresAt }` — `groups` ist im Spread enthalten und wird nicht neu berechnet).

Die Folge: **Autorisierung ist für die Lebensdauer des JWT eingefroren.** Wird jemandem in Pocket ID
eine Gruppe entzogen — Austritt aus der Fachgruppe, Wechsel, Entzug von `da-feedback-admin` — behält
diese Person den Zugriff, bis die Sitzung endet. Mit §2.3 sind das bis zu **30 Tage, rollierend**: wer
die Suite täglich benutzt, behält entzogene Rechte unbegrenzt.

Das ist kein Nebenbefund, sondern die Stelle, an der „länger" und „stabiler" gegeneinander ziehen. Eine
explizit auf 30 Tage gesetzte, rollierende Sitzung ist nur dann verantwortbar, wenn die Gruppen
darin frisch bleiben.

**Änderung:** `refreshAccessToken` liest die Gruppen aus dem **neuen `id_token`** und schreibt sie in
den Token zurück. Damit werden sie bei jedem erfolgreichen Refresh aktualisiert — der Takt ist die
Access-Token-Lebensdauer von Pocket ID (typisch eine Stunde), nicht mehr die Sitzungsdauer.

```ts
// in refreshAccessToken, nach erfolgreichem Refresh
const ansprueche = idTokenAnsprueche(refreshed.id_token);
return {
  ...token,
  accessToken: refreshed.access_token,
  …
  // Gruppen NEU aus dem frischen ID-Token, nicht aus dem alten Token
  // durchgereicht: sonst friert die Autorisierung beim Login ein und ein
  // Gruppenentzug in Pocket ID wirkt bis zu 30 Tage lang nicht.
  ...(ansprueche
    ? { groups: parseGroups(ansprueche), fachgruppen: parseFachgruppen(ansprueche) }
    : {}),
};
```

`idTokenAnsprueche` dekodiert den JWT-Mittelteil (Base64URL) **ohne Signaturprüfung** — und das ist
hier korrekt, mit einer Begründung, die im Code stehen muss: das Token kommt aus einer direkten,
TLS-gesicherten Antwort des Token-Endpoints auf eine mit Client-Secret authentifizierte Anfrage. Es
ist nie durch den Browser gelaufen. Der Fall, gegen den eine Signaturprüfung schützt (ein
untergeschobenes Token), existiert auf diesem Weg nicht. Kommt kein `id_token` zurück, bleiben die
alten Gruppen — schlechter als frische, besser als gar keine.

**Bewusst nicht mitgeändert:** Bei einem *transienten* Refresh-Fehler bleiben die alten Gruppen stehen.
Das ist dieselbe Abwägung wie oben: ein Netzwerkaussetzer darf niemanden aussperren. Der Backoff aus
§2.2 sorgt dafür, dass der nächste Versuch bald kommt.

### 2.2 Timeout und Backoff

- **Timeout:** `AbortSignal.timeout(5000)` am `fetch`. Ohne ihn hängt der `jwt`-Callback am hängenden
  Endpoint, und das bei jedem Request.
- **Backoff:** `refreshFailedAt` im Token. Solange weniger als 60 Sekunden seit dem letzten
  Fehlschlag vergangen sind, wird gar nicht erst versucht. Ohne diese Bremse ruft jeder Request
  während einer Pocket-ID-Störung erneut den Token-Endpoint an — die Suite würde einen wackelnden IdP
  aktiv niederhalten.
- **Kein Retry innerhalb eines Aufrufs.** Der `jwt`-Callback läuft synchron im Request-Pfad; zwei
  Versuche mit je 5 s Timeout bedeuten 10 s Latenz für den Nutzer. Der nächste Request ist der
  Retry — genau dafür ist der Backoff da.

### 2.3 Sitzungsdauer explizit

```ts
session: {
  strategy: "jwt",
  maxAge: 30 * 24 * 60 * 60,   // 30 Tage — der bisherige Default, jetzt sichtbar
  updateAge: 24 * 60 * 60,     // rollierend: ein Besuch pro Tag verlängert
}
```

Beide Werte entsprechen dem heutigen Auth.js-Default. Sie hier hinzuschreiben ändert das Verhalten
**nicht** — es macht es prüfbar und schützt vor einem stillen Default-Wechsel bei einem
Auth.js-Update. Der zugehörige Test hält die Werte fest.

`session.maxAge` steuert zugleich die Lebensdauer des Session-Cookies: Auth.js leitet dessen `maxAge`
davon ab, und `authCookies()` überschreibt es nicht (dort stehen nur `domain` und `secure`, mit
ausführlicher Begründung warum nur die). Damit ist der vierte Punkt der Anfrage —
Cookie-Lebensdauer — mit erledigt und braucht keine eigene Änderung; ein Test belegt es.

### 2.4 Sanfte Re-Authentifizierung

`SessionGuard` ruft heute `signOut()`. Das ist bei `invalid_grant` fachlich richtig (die
IdP-Sitzung ist beendet), aber unnötig hart: existiert beim IdP noch eine Sitzung, könnte ein
stiller Re-Login den Nutzer ohne Klick zurückbringen.

```tsx
if (session?.error === "RefreshTokenError") {
  signIn("pocket-id", { callbackUrl: window.location.href });
}
```

**Der Endlosschleifen-Riegel ist der wesentliche Teil dieser Änderung.** Kommt der Nutzer aus dem
Re-Login mit demselben Fehler zurück, würde er sofort wieder weggeschickt — eine Schleife, die im
Browser aussieht wie ein Absturz. Deshalb: ein Versuch pro Seitenbesuch, festgehalten in
`sessionStorage` unter `iuk-reauth`. Beim zweiten Auftreten fällt der Guard auf den bisherigen
harten `signOut()` zurück.

`sessionStorage` und nicht `useRef`: der Re-Login ist eine volle Seitennavigation, ein React-Ref
überlebt sie nicht. Und nicht `localStorage`: die Marke soll mit dem Tab enden, nicht wochenlang
liegen bleiben.

Für Instanzen ohne Pocket ID (Dev-Login) bleibt es beim `signOut()` — `signIn("pocket-id")` liefe dort
ins Leere. Erkennung über das Vorhandensein des Providers, das der Guard nicht kennt: deshalb ein
Prop `reauthProvider: string | null`, das `Providers` aus einer Server-Umgebung bekommt.

---

## 3. Was nicht gemacht wird

- **Kein Wechsel auf Datenbank-Sessions.** Die JWT-Strategie ist die Voraussetzung dafür, dass eine
  Sitzung über mehrere Modul-Hosts hinweg ohne gemeinsame Datenbank trägt.
- **Keine Verlängerung über 30 Tage.** Wer länger will, setzt es dann bewusst; 30 Tage sind für ein
  internes Werkzeug mit SSO reichlich.
- **Kein Retry-Sturm.** Siehe §2.2.

---

## 4. Tests

| Zusage | Wo |
|---|---|
| `invalid_grant` führt zu `RefreshTokenError` | `core/auth/refresh.test.ts` |
| Ein erfolgreicher Refresh **aktualisiert** `groups` und `fachgruppen` aus dem neuen `id_token` | `core/auth/refresh.test.ts` |
| Ein Gruppenentzug in Pocket ID wirkt nach dem nächsten Refresh (Regression gegen das Einfrieren) | `core/auth/refresh.test.ts` |
| Ohne `id_token` in der Antwort bleiben die alten Gruppen erhalten | `core/auth/refresh.test.ts` |
| Bei transientem Fehler bleiben die alten Gruppen erhalten | `core/auth/refresh.test.ts` |
| Netzwerkfehler, Timeout und 5xx führen **nicht** dazu — Token bleibt gültig | `core/auth/refresh.test.ts` |
| Innerhalb des Backoff-Fensters wird der Endpoint gar nicht erst gerufen | `core/auth/refresh.test.ts` (fetch-Spy: 0 Aufrufe) |
| Der `fetch` trägt ein Timeout-Signal | `core/auth/refresh.test.ts` |
| `session.maxAge` und `updateAge` stehen explizit | `core/auth/config.test.ts` |
| `authCookies()` überschreibt `maxAge` nicht (Cookie folgt der Session) | `core/auth/cookies.test.ts` (Ergänzung) |
| Erster `RefreshTokenError` löst Re-Login aus, zweiter den harten Logout | `components/providers.test.tsx` über `test-dom.tsx` |
| Ohne Pocket-ID-Provider immer harter Logout | `components/providers.test.tsx` |

Die Refresh-Logik zieht dafür aus `core/auth/index.ts` in ein eigenes `core/auth/refresh.ts` um: sie
ist heute in der NextAuth-Konfiguration eingebettet und damit nur über einen vollen Auth.js-Aufbau
testbar. Als eigene Funktion mit übergebener Zeitquelle ist sie reine Berechnung plus ein `fetch` —
prüfbar wie `suiteRedirect` und `authCookies`, die denselben Weg schon gegangen sind.

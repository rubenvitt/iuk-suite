import { BEISPIEL_EINSATZ, STUFE_TEXT, type Szenario, type Vorschau } from "../_lib/vorschau";
import { MitmachQr } from "./MitmachQr";
import s from "./vorschau.module.css";

/** Erfundenes Wetter je Beispiellage. */
const WETTER: Record<Szenario, { grad: number; wind: string; niederschlag: string }> = {
  ruhe: { grad: 4, wind: "9 km/h", niederschlag: "0 mm" },
  unwetter: { grad: 17, wind: "62 km/h, Böen 85", niederschlag: "24 mm/h" },
  einsatz: { grad: 6, wind: "12 km/h", niederschlag: "0 mm" },
};

/** Zwei Warngebiete reichen für das Bild: das erste groß über den Kreis, das zweite im Osten. */
const WARNGEBIETE = ["M40,40 L300,25 L420,90 L400,260 L150,285 L30,220Z", "M240,60 L400,80 L410,200 L300,230 L250,150Z"];

/**
 * Der Bildschirm im FüKw in klein, mit Beispieldaten. Rein darstellend: was zu sehen ist, rechnet
 * `vorschau()` in `_lib/vorschau.ts`. Kein Text hier ist eine echte Lage; die Uhr steht still.
 */
export function MonitorVorschau({ v, szenario, standort }: { v: Vorschau; szenario: Szenario; standort: string }) {
  const wetter = WETTER[szenario];
  const bandIds = new Set(v.band.map((w) => w.id));
  return (
    <div className={s.rahmen} role="img" aria-label={`Vorschau des Lagemonitors: ${v.sichtbar.join(" ")}`} data-testid="monitor-vorschau">
      <div className={s.kopf}>
        <span className={s.wortmarke}>Lagemonitor · {standort || "Standort"}</span>
        <span className={s.status} data-ton={v.status.ton}>
          <span className={s.punkt} />
          {v.status.text}
        </span>
        <span className={s.uhr}>
          <span className={s.uhrDatum}>27</span>
          <span className={s.uhrZeit}>1842</span>
          <span className={s.uhrDatum}>okt26</span>
        </span>
      </div>
      {v.band.length > 0 ? (
        <div className={s.band}>
          <span className={s.kuerzel}>{STUFE_TEXT[v.band[0].stufe]}</span>
          <span>{v.band[0].titel}</span>
          <span className={s.bandBis}>bis {v.band[0].bis}{v.band.length > 1 ? ` · +${v.band.length - 1} weitere` : ""}</span>
        </div>
      ) : null}
      {v.meldungen.map((m, i) => (
        <div key={i} className={s.meldung} data-entwurf={m.entwurf === true} data-testid="vorschau-meldung">
          <span className={s.meldungText}>{m.text}</span>
          {m.countdown ? <span className={s.meldungZeit}>{m.countdown}</span> : null}
        </div>
      ))}
      <div className={s.rumpf} data-seitenspalte={v.seitenspalte}>
        <div className={s.kartenZelle}>
          <svg className={s.karte} viewBox="0 0 440 300" preserveAspectRatio="xMidYMid slice" aria-hidden>
            <path className={s.wald} d="M0,0 L110,0 L90,50 L0,70Z" />
            <path className={s.wald} d="M330,240 L440,220 L440,300 L320,300Z" />
            <path className={s.wasser} d="M0,215 C80,195 120,245 200,225 S330,175 440,195" />
            <path className={s.strasse} d="M222,0 L212,122 L232,300" />
            <path className={s.strasse} d="M0,118 L440,152" />
            <path className={s.strasse} d="M212,122 L385,38" />
            <path className={s.ort} d="M190,120 L240,115 L250,150 L225,170 L195,160Z" />
            {v.karte.verkehr ? (
              <g data-testid="vorschau-verkehr">
                <path className={`${s.fluss} ${s.flussFrei}`} d="M222,0 L215,90" />
                <path className={`${s.fluss} ${s.flussZaeh}`} d="M215,90 L212,122 L218,170" />
                <path className={`${s.fluss} ${s.flussFrei}`} d="M224,215 L232,300" />
                <path className={`${s.fluss} ${s.flussFrei}`} d="M0,118 L140,129" />
                <path className={`${s.fluss} ${s.flussStau}`} d="M140,129 L212,135" />
                <path className={`${s.fluss} ${s.flussZaeh}`} d="M212,135 L290,141" />
                <path className={`${s.fluss} ${s.flussFrei}`} d="M290,141 L440,152" />
                <path className={`${s.fluss} ${s.flussFrei}`} d="M212,122 L385,38" />
              </g>
            ) : null}
            {v.karte.baustellen ? (
              <g data-testid="vorschau-baustellen">
                <path className={s.baustelleGrund} d="M218,170 L224,215" />
                <path className={s.baustelleStreifen} d="M218,170 L224,215" />
                <circle className={s.sperrung} cx="330" cy="65" r="4" />
              </g>
            ) : null}
            {v.karte.blitzer ? (
              <g data-testid="vorschau-blitzer">
                <circle className={s.blitzer} cx="95" cy="125" r="5" />
                <text className={s.blitzerTempo} x="95" y="140">50</text>
                <circle className={s.blitzer} cx="300" cy="81" r="5" />
                <text className={s.blitzerTempo} x="300" y="96">70</text>
              </g>
            ) : null}
            {v.karte.radar ? (
              szenario === "unwetter" ? (
                <g>
                  <ellipse className={s.radarLeicht} cx="300" cy="120" rx="120" ry="70" />
                  <ellipse className={s.radarMittel} cx="310" cy="125" rx="70" ry="42" />
                  <ellipse className={s.radarStark} cx="320" cy="128" rx="30" ry="20" />
                </g>
              ) : (
                <g>
                  <ellipse className={s.radarLeicht} cx="380" cy="60" rx="50" ry="26" />
                  <ellipse className={s.radarLeicht} cx="60" cy="250" rx="36" ry="18" />
                </g>
              )
            ) : null}
            {v.karte.warngebiete.slice(0, WARNGEBIETE.length).map((w, i) => (
              <path key={w.id} className={s.warngebiet} data-band={bandIds.has(w.id)} d={WARNGEBIETE[i]} />
            ))}
            {v.karte.suchgebiete ? (
              <g>
                <path className={s.suchgebiet} d="M70,70 L160,60 L170,130 L80,140Z" />
                <text className={s.suchgebietName} x="74" y="58">Suchgebiet A</text>
                <path className={s.suchgebiet} d="M90,150 L175,140 L185,205 L100,215Z" />
                <text className={s.suchgebietName} x="94" y="228">Suchgebiet B</text>
              </g>
            ) : null}
            {v.karte.flugspuren ? (
              <g>
                <path className={`${s.spur} ${s.spur1}`} d="M75,75 L155,66 L157,80 L77,89 L79,103 L159,94 L161,108 L81,117 L83,131 L163,122" />
                <path className={`${s.spur} ${s.spur2}`} d="M95,155 L172,146 L174,160 L97,169 L99,183 L176,174" />
              </g>
            ) : null}
            {v.karte.drohne ? <path className={s.drohne} d="M176,166 L183,180 L176,177 L169,180Z" /> : null}
            <circle className={s.standort} cx="218" cy="142" r="5" />
            <text className={s.ortName} x="228" y="134">{standort || "Standort"}</text>
          </svg>
          {v.mitmachen ? (
            <div className={s.mitmachen} data-testid="vorschau-qr">
              <MitmachQr adresse={v.mitmachen.adresse} className={s.qr} />
              <span>{v.mitmachen.text}</span>
            </div>
          ) : null}
        </div>
        {v.seitenspalte ? (
          <div className={s.seite}>
            {v.wetter ? (
              <>
                <span className={s.augenbraue}>Wetter · {standort || "Standort"}</span>
                <span className={s.temperatur}>{wetter.grad}°</span>
                <dl className={s.werte}>
                  <dt>Wind</dt>
                  <dd>{wetter.wind}</dd>
                  <dt>Niederschlag</dt>
                  <dd>{wetter.niederschlag}</dd>
                </dl>
              </>
            ) : null}
            {v.liste.length > 0 ? (
              <>
                <span className={s.augenbraue}>Unter der Schwelle</span>
                {v.liste.map((w) => (
                  <div key={w.id} className={s.warnung}>
                    {w.titel}
                    <small>{STUFE_TEXT[w.stufe]} · bis {w.bis}</small>
                  </div>
                ))}
              </>
            ) : null}
          </div>
        ) : null}
        <div className={s.drohnenbild} data-offen={v.drohnenbild}>
          <div className={s.drohnenKopf}>
            <span className={s.live}>
              <span className={s.punkt} />
              live
            </span>
            <span>Drohnenbild · {BEISPIEL_EINSATZ.drohne}</span>
          </div>
          <svg className={s.luftbild} viewBox="0 0 160 100" preserveAspectRatio="xMidYMid slice" aria-hidden>
            <rect className={s.feld1} x="-20" y="-20" width="200" height="140" />
            <path className={s.feld2} d="M-10,10 L90,-10 L110,60 L0,85Z" />
            <path className={s.feld3} d="M95,-10 L180,-10 L180,70 L115,62Z" />
            <path className={s.weg} d="M-10,92 C40,70 90,80 170,40" />
            <circle className={s.fadenkreuz} cx="80" cy="50" r="9" />
            <path className={s.fadenkreuz} d="M80,34 L80,44 M80,56 L80,66 M64,50 L74,50 M86,50 L96,50" />
          </svg>
          <div className={s.drohnenWerte}>
            <span>Höhe {BEISPIEL_EINSATZ.hoeheM} m</span>
            <span>Akku {BEISPIEL_EINSATZ.akkuProzent} %</span>
            <span>in der Luft</span>
          </div>
        </div>
      </div>
      <div className={s.fuss}>
        <span>Beispieldaten</span>
        <span>Warnungen: NINA</span>
        <span>Wetter: DWD</span>
        {v.karte.verkehr || v.karte.baustellen ? <span>Verkehr: TomTom</span> : null}
        <span>Einstellungen aus der IUK-Suite</span>
      </div>
    </div>
  );
}

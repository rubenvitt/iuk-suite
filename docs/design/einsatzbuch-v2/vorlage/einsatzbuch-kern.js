// Gemeinsame Logik für Einsatzbuch (Verwaltung) und Einsatzbuch Reader: Fingerabdrücke, Kettenprüfung, Datei-Verschlüsselung, Berichtsdaten.
(function () {
  const h53 = (str, seed) => {
    let h1 = 0xdeadbeef ^ seed, h2 = 0x41c6ce57 ^ seed;
    for (let i = 0; i < str.length; i++) { const c = str.charCodeAt(i); h1 = Math.imul(h1 ^ c, 2654435761); h2 = Math.imul(h2 ^ c, 1597334677); }
    h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
    h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
    return (h2 >>> 0).toString(16).padStart(8, '0') + (h1 >>> 0).toString(16).padStart(8, '0');
  };
  const H = s => h53(s, 0) + h53(s, 1) + h53(s, 2) + h53(s, 3);
  const GENESIS = '0'.repeat(64);
  const blockHash = b => H(JSON.stringify(b.daten) + '|' + b.prev + '|' + b.versiegelt + '|' + b.block);

  function pruefeKette(kette) {
    for (let i = 0; i < kette.length; i++) {
      const b = kette[i];
      if (blockHash(b) !== b.hash) return { ok: false, block: b.block, grund: 'Inhalt passt nicht zum Fingerabdruck' };
      if (i > 0 && b.prev !== kette[i - 1].hash) return { ok: false, block: b.block, grund: 'Vorgänger fehlt oder wurde verändert' };
      if (i === 0 && b.block === 1 && b.prev !== GENESIS) return { ok: false, block: 1, grund: 'Anfang der Kette stimmt nicht' };
      if (i > 0 && b.block !== kette[i - 1].block + 1) return { ok: false, block: b.block, grund: 'Lücke in der Reihenfolge' };
    }
    return { ok: true, vollstaendig: kette.length > 0 && kette[0].block === 1 };
  }

  const enc = new TextEncoder(), dec = new TextDecoder();
  const b64 = u8 => { let s = ''; for (let i = 0; i < u8.length; i += 0x8000) s += String.fromCharCode.apply(null, u8.subarray(i, i + 0x8000)); return btoa(s); };
  const unb64 = s => Uint8Array.from(atob(s), c => c.charCodeAt(0));
  async function schluessel(kw, salt, iter) {
    const basis = await crypto.subtle.importKey('raw', enc.encode(kw), 'PBKDF2', false, ['deriveKey']);
    return crypto.subtle.deriveKey({ name: 'PBKDF2', salt, iterations: iter, hash: 'SHA-256' }, basis, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
  }
  async function verschluesseln(inhalt, kw, kopf) {
    const salt = crypto.getRandomValues(new Uint8Array(16)), iv = crypto.getRandomValues(new Uint8Array(12)), iter = 250000;
    const key = await schluessel(kw, salt, iter);
    const ct = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv, additionalData: enc.encode(JSON.stringify(kopf)) }, key, enc.encode(JSON.stringify(inhalt))));
    return { format: 'einsatzbuch-export', version: 1, kopf, kdf: { name: 'PBKDF2', hash: 'SHA-256', iterationen: iter, salt: b64(salt) }, chiffre: { name: 'AES-GCM', laenge: 256, iv: b64(iv) }, daten: b64(ct) };
  }
  function istDatei(d) { return !!(d && d.format === 'einsatzbuch-export' && d.version === 1 && d.kopf && d.kdf && d.chiffre && d.daten); }
  async function entschluesseln(datei, kw) {
    const key = await schluessel(kw, unb64(datei.kdf.salt), datei.kdf.iterationen);
    const pt = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: unb64(datei.chiffre.iv), additionalData: enc.encode(JSON.stringify(datei.kopf)) }, key, unb64(datei.daten));
    return JSON.parse(dec.decode(pt));
  }

  const datum = iso => { if (!iso) return ''; const [y, m, d] = iso.split('-'); return `${+d}.${+m}.${y}`; };
  const zeitpunkt = dt => { if (!dt) return ''; const [a, b] = dt.split('T'); return `${datum(a)}, ${b.slice(0, 5)} Uhr`; };
  const minuten = e => (e.beginnDatum && e.beginnZeit && e.endeDatum && e.endeZeit) ? Math.round((new Date(`${e.endeDatum}T${e.endeZeit}`) - new Date(`${e.beginnDatum}T${e.beginnZeit}`)) / 60000) : null;
  const hm = min => `${Math.floor(min / 60)} h ${String(min % 60).padStart(2, '0')} min`;
  const jetztText = () => { const d = new Date(); return `${d.getDate()}.${d.getMonth() + 1}.${d.getFullYear()}, ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')} Uhr`; };

  function stammFuer(kette, fzAlle, peAlle) {
    const fahrzeuge = {}, personal = {};
    kette.forEach(b => {
      b.daten.fahrzeuge.forEach(id => { if (fzAlle[id]) fahrzeuge[id] = fzAlle[id]; });
      Object.keys(b.daten.personal).forEach(id => { if (peAlle[id]) personal[id] = { name: peAlle[id].name, quali: peAlle[id].quali }; });
    });
    return { fahrzeuge, personal };
  }

  function bericht(b, stamm, extra) {
    const d = b.daten, fz = stamm.fahrzeuge || {}, pe = stamm.personal || {}, min = minuten(d);
    const fahrzeuge = d.fahrzeuge.map(id => fz[id] ? { typ: fz[id].typ, ruf: fz[id].ruf, besatzung: String(Object.values(d.personal).filter(v => v === id).length || '—') } : { typ: '?', ruf: id, besatzung: '—' });
    const personal = Object.keys(d.personal).map(id => { const p = pe[id] || { name: id, quali: '' }, f = fz[d.personal[id]]; return { name: p.name, quali: p.quali, fahrzeug: f ? `${f.typ} ${f.kennung}` : '—' }; });
    return {
      nummer: d.nummer, block: b.block, stichwort: d.stichwort, ort: [d.strasse, d.ort].filter(Boolean).join(', ') || '—', objekt: d.objekt || '—',
      beginn: d.beginnDatum ? `${datum(d.beginnDatum)}, ${d.beginnZeit} Uhr` : '—', ende: d.endeDatum ? `${datum(d.endeDatum)}, ${d.endeZeit} Uhr` : 'nicht angegeben',
      dauer: min === null ? '—' : hm(min), vorOrt: d.vorOrt, transport: d.transport, gesamt: (+d.vorOrt || 0) + (+d.transport || 0),
      fahrzeuge, anzFz: fahrzeuge.length, hatFz: fahrzeuge.length > 0, keineFz: fahrzeuge.length === 0,
      personal, anzPe: personal.length, hatPe: personal.length > 0, keinePe: personal.length === 0,
      notizen: d.notizen, hatNotizen: !!d.notizen, hash: b.hash, prev: b.prev, versiegelt: zeitpunkt(b.versiegelt),
      pruefung: (extra && extra.pruefung) || 'nicht geprüft', quelle: (extra && extra.quelle) || 'Einsatzbuch', erzeugt: jetztText()
    };
  }

  function beispielInhalt() {
    const fahrzeuge = { '11-83-1': { id: '11-83-1', typ: 'RTW', kennung: '11-83-1', ruf: 'Rotkreuz Uelzen 11-83-1', standort: 'Uelzen' }, '11-64-1': { id: '11-64-1', typ: 'GW-San', kennung: '11-64-1', ruf: 'Rotkreuz Uelzen 11-64-1', standort: 'Uelzen' }, '12-19-1': { id: '12-19-1', typ: 'MTF', kennung: '12-19-1', ruf: 'Rotkreuz Bad Bevensen 12-19-1', standort: 'Bad Bevensen' } };
    const personal = { p1: { name: 'Albers, Jana', quali: 'ZF' }, p4: { name: 'Dierks, Malte', quali: 'NotSan' }, p8: { name: 'Hansen, Ole', quali: 'RS' }, p11: { name: 'Kruse, Marie', quali: 'SanH' }, p13: { name: 'Meyer, Hanna', quali: 'BtH' } };
    const seeds = [
      { nummer: '2026-041', stichwort: 'RD 2', beginnDatum: '2026-08-22', beginnZeit: '03:12', endeDatum: '2026-08-22', endeZeit: '04:40', strasse: 'Lindenstraße 8', ort: '29525 Uelzen', objekt: '', fahrzeuge: ['11-83-1'], personal: { p4: '11-83-1', p8: '11-83-1' }, vorOrt: 0, transport: 1, notizen: '' },
      { nummer: '2026-042', stichwort: 'SanD', beginnDatum: '2026-08-29', beginnZeit: '13:00', endeDatum: '2026-08-29', endeZeit: '19:30', strasse: 'Am Sportzentrum', ort: '29549 Bad Bevensen', objekt: 'Stadtfest, ca. 2.500 Besucher', fahrzeuge: ['11-83-1', '12-19-1'], personal: { p4: '11-83-1', p11: '12-19-1', p13: '12-19-1' }, vorOrt: 11, transport: 2, notizen: 'Zwei Transporte durch den Regel-RD übernommen.' },
      { nummer: '2026-043', stichwort: 'MANV 5', beginnDatum: '2026-09-02', beginnZeit: '20:15', endeDatum: '2026-09-02', endeZeit: '22:05', strasse: 'L 252', ort: '29556 Suderburg', objekt: 'VU drei Pkw', fahrzeuge: ['11-83-1', '11-64-1'], personal: { p1: '11-64-1', p4: '11-83-1', p8: '11-83-1', p11: '11-64-1' }, vorOrt: 3, transport: 2, notizen: 'Übergabe an RD um 20:48 Uhr.' }
    ];
    let prev = GENESIS;
    const kette = seeds.map((daten, i) => { const b = { block: i + 1, prev, versiegelt: `${daten.endeDatum}T${daten.endeZeit}`, daten }; b.hash = blockHash(b); prev = b.hash; return b; });
    return { kette, stamm: { fahrzeuge, personal }, exportiertVon: 'Beispiel', quelle: 'DRK-Bereitschaft Uelzen' };
  }

  window.EinsatzbuchKern = { GENESIS, H, blockHash, pruefeKette, verschluesseln, entschluesseln, istDatei, stammFuer, bericht, beispielInhalt, datum, zeitpunkt, jetztText };
})();

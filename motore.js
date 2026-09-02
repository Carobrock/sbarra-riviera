// Sbarra Su — motore di calcolo.
//
// Funzioni pure: niente rete, niente DOM, niente orologio. Lo stesso file gira
// nella funzione edge (che calcola le finestre per tutti), nelle prove (node)
// e nel telefono (che usa solo `valuta`). Se una regola cambia, cambia qui e
// in nessun altro posto: il 28 agosto 2026 la formula della finestra viveva in
// due punti del sito e si era gia' scollata.

// ---- lettura dei dati di ViaggiaTreno ---------------------------------------

// Le fermate del treno di cui conosciamo il km, con orari teorici e — dove ci
// sono — quelli davvero rilevati. arrR/depR compaiono solo per le fermate gia'
// superate. Li teniamo separati: "effettiva" vale la partenza se il treno e'
// ripartito ma l'arrivo se e' ancora fermo li', quindi da sola non basta e
// confonderla anticiperebbe la stima, che e' l'errore peggiore.
export function puntiDa(andamento, KM) {
  const pts = [];
  for (const f of ((andamento && andamento.fermate) || [])) {
    if (KM[f.id] === undefined) continue;
    const arr = f.arrivo_teorico || f.programmata || f.partenza_teorica;
    const dep = f.partenza_teorica || f.programmata || f.arrivo_teorico;
    if (!arr && !dep) continue;
    pts.push({
      id: f.id, km: KM[f.id], arr: arr || dep, dep: dep || arr,
      arrR: f.arrivoReale || null, depR: f.partenzaReale || null,
      effR: f.effettiva || null
    });
  }
  return pts;
}

// L'ultimo punto in cui RFI ha VISTO il treno. Vale anche nelle stazioni dove
// non si ferma, ed e' l'unica notizia fra una fermata e l'altra. E' un fatto:
// se dice che il treno e' oltre il passaggio, la sbarra e' risalita.
export function rilevamentoDa(andamento, ID_DA_NOME, KM) {
  if (!andamento) return null;
  const nome = (andamento.stazioneUltimoRilevamento || "").toUpperCase().trim();
  const id = ID_DA_NOME[nome];
  if (!id || !andamento.oraUltimoRilevamento) return null;
  return { km: KM[id], at: andamento.oraUltimoRilevamento, dove: nome };
}

// ---- dove e quando passa ------------------------------------------------------

// Partenza vera da una fermata. Se conosciamo solo l'arrivo, stimiamo arrivo
// + sosta prevista — ma MAI prima dell'orario di partenza: un treno in anticipo
// aspetta in stazione, non riparte prima. Stimarlo in partenza anticipata
// mette il transito prima del vero, che per un passaggio a valle della
// stazione e' il verso pericoloso.
export function partenzaVera(p) {
  if (p.depR) return p.depR;
  const sosta = Math.max(0, p.dep - p.arr);
  if (p.arrR) return Math.max(p.arrR + sosta, p.dep);
  if (p.effR) return Math.max(p.effR + sosta, p.dep);
  return null;
}
export function arrivoVero(p) { return p.arrR || p.depR || p.effR || null; }

export function versoDi(pts) {
  for (let i = 0; i < pts.length - 1; i++) {
    if (pts[i + 1].km !== pts[i].km) return pts[i + 1].km > pts[i].km ? 1 : -1;
  }
  return 0;
}

// Velocita' media nel chilometro attorno a una fermata (m/s): il treno sta
// frenando o riprendendo. Fuori da quel chilometro viaggia a regime e conviene
// interpolare fra le due fermate note.
const V_STAZ = 12.5;
const RAGGIO_STAZ = 1.0;   // km entro cui vale il modello di stazione
const RAGGIO_FERMA = 2.5;  // km entro cui "il treno ferma qui vicino"

function interpola(a, b, kmPL, ferma) {
  const frac = (kmPL - a.km) / (b.km - a.km);
  const corsa = b.arr - a.dep;
  const base = partenzaVera(a);
  if (base) {
    const fine = arrivoVero(b);
    if (fine && fine > base)   // entrambe superate: e' gia' passato, sappiamo quando
      return { at: base + frac * (fine - base), exact: false, reale: true, pad: 1, ferma };
    const resta = frac * corsa;
    return { at: base + resta, exact: false, reale: true, ferma,
             pad: Math.min(3, Math.max(1, Math.round(resta / 300000))) };
  }
  // nessun orario vero: solo tabella. Il margine cresce con la lunghezza della
  // tratta — euristica, da sostituire con l'errore misurato (vedi README).
  const span = corsa / 60000;
  return { at: a.dep + frac * corsa, exact: false, reale: false, ferma,
           pad: Math.max(2, Math.min(6, Math.round(span / 4))) };
}

// Stima del transito del treno al km del passaggio a livello.
// Restituisce {at, exact, reale, pad, ferma} oppure null se non passa di li'.
export function transito(pts, kmPL, ril) {
  if (!pts || pts.length < 2) return null;

  // la fermata del treno piu' vicina al passaggio
  let ref = null, iRef = -1, bd = Infinity;
  pts.forEach((p, i) => { const d = Math.abs(p.km - kmPL); if (d < bd) { bd = d; ref = p; iRef = i; } });
  const ferma = bd <= RAGGIO_FERMA;

  if (ferma && bd <= RAGGIO_STAZ) {
    const vArr = arrivoVero(ref);
    const dKm = kmPL - ref.km;
    let verso = null;
    if (iRef + 1 < pts.length) verso = pts[iRef + 1].km > ref.km ? 1 : -1;
    else if (iRef > 0)         verso = ref.km > pts[iRef - 1].km ? 1 : -1;
    if (verso === null) return { at: vArr || ref.arr, exact: false, reale: !!vArr, pad: 2, ferma };
    const dt = Math.abs(dKm) * 1000 / V_STAZ * 1000;
    const vicino = Math.abs(dKm) < 0.25;
    const padLontano = Math.min(3, Math.max(1, Math.round(Math.abs(dKm))));
    // Se il passaggio sta PRIMA della stazione il treno lo attraversa prima di
    // arrivare: conta l'arrivo, e se e' registrato il transito e' certo.
    const oltre = (dKm > 0) === (verso > 0);
    if (!oltre) {
      return { at: (vArr || ref.arr) - dt, exact: vicino && !!vArr, reale: !!vArr, ferma,
               pad: vicino ? 0 : padLontano };
    }
    // Se sta DOPO, il treno lo attraversa dopo essere ripartito, e conta la
    // PARTENZA. Quella registrata (partenzaReale) e' certa. Se manca ma RFI ha
    // visto il treno in questa stessa stazione DOPO l'arrivo, quell'avvistamento
    // e' la ripartenza (il 12269 del 28/8/2026: arrivato 14:46, visto 14:53).
    // Se non abbiamo ne' l'una ne' l'altro, il treno potrebbe essere ancora
    // fermo li' — lo segnaliamo con `attesa`, e la finestra non si chiude sulla
    // stima.
    let dep = ref.depR || null, attesa = false;
    if (!dep && ril && Math.abs(ril.km - ref.km) < 0.01 && vArr && ril.at >= vArr + 30000) dep = ril.at;
    if (!dep) { dep = partenzaVera(ref) || ref.dep; attesa = !!vArr; }
    const certa = !!(ref.depR || (ril && dep === ril.at));
    return { at: dep + dt, exact: vicino && certa, reale: certa, ferma, attesa,
             pad: vicino ? (certa ? 0 : 1) : padLontano };
  }

  for (let k = 0; k < pts.length - 1; k++) {
    const a = pts[k], b = pts[k + 1];
    if ((a.km < kmPL && b.km > kmPL) || (a.km > kmPL && b.km < kmPL)) return interpola(a, b, kmPL, ferma);
  }
  return null;
}

// Il treno e' gia' oltre il passaggio? Due prove ammesse, entrambe fatti:
// un orario davvero rilevato a una fermata oltre, oppure l'ultimo avvistamento
// RFI oltre (vale anche dove il treno non ferma: e' l'unica prova per gli IC).
export function superato(pts, kmPL, ril) {
  if (!pts || pts.length < 2) return false;
  const verso = versoDi(pts);
  if (!verso) return false;
  const oltre = (km) => (verso > 0 ? km > kmPL : km < kmPL);
  for (const p of pts) if ((p.arrR || p.depR || p.effR) && oltre(p.km)) return true;
  if (ril && oltre(ril.km)) return true;
  return false;
}

// ---- la finestra della sbarra: UNA formula ------------------------------------

// Quanto la sbarra sta giu' dopo il transito e' misurato (12-25 s). Ma quel
// mezzo minuto vale solo se sappiamo QUANDO il treno e' passato. Se l'orario
// e' interpolato puo' essere corto: l'IC 637 del 28/8/2026 e' passato due
// minuti dopo la stima. Quindi la coda dietro non scende mai sotto un minimo,
// tranne quando l'orario e' quello vero registrato al passaggio stesso. Non si
// SOMMA al margine: e' un minimo. Se il margine e' gia' +/-2 non aggiunge nulla.
const CODA_MINIMA_MIN = 2;
// Treno registrato in stazione ma non ancora registrato in partenza, con il
// passaggio a valle: sappiamo che NON e' ancora passato. La finestra resta
// aperta ben oltre la stima, finche' non arriva un fatto (partenza registrata,
// avvistamento, fermata successiva). Il 28/8/2026 un regionale e' rimasto sette
// minuti a Loano oltre la sosta prevista.
const CODA_ATTESA_MIN = 8;

// tempi = {pre, prePassa, post} in minuti. tr = risultato di `transito` +
// {superato}. Restituisce {da, a} in ms, oppure null se il treno non blocca.
export function finestraDi(tr, tempi) {
  if (!tr || tr.superato) return null;
  const pad = (tr.pad || 0) * 60000;
  const pre = (tr.ferma ? tempi.pre : (tempi.prePassa ?? tempi.pre)) * 60000;
  const post = tempi.post * 60000;
  const codaMin = tr.attesa ? CODA_ATTESA_MIN * 60000 : (tr.exact && tr.reale) ? 0 : CODA_MINIMA_MIN * 60000;
  return { da: tr.at - pre - pad, a: tr.at + post + Math.max(pad, codaMin) };
}

// I transiti di tutti i treni a un passaggio, ordinati. E' quello che la
// funzione edge calcola una volta per tutti: la parte pesante (rete, lettura,
// stima, conferma di passaggio). Il ritardo dichiarato si somma solo se la
// stima NON parte da un orario vero: altrimenti lo conteremmo due volte.
export function transitiDi(treni, kmPL) {
  const out = [];
  for (const t of treni) {
    const tr = transito(t.pts, kmPL, t.ril);
    if (!tr) continue;
    out.push({
      // il ritardo dichiarato si somma solo se non c'e' NESSUN orario vero
      // dietro la stima; un treno fermo in stazione (attesa) ne ha uno
      at: tr.at + ((tr.reale || tr.attesa) ? 0 : (t.late || 0) * 60000),
      pad: tr.pad, ferma: tr.ferma, exact: tr.exact, reale: tr.reale, attesa: !!tr.attesa,
      superato: superato(t.pts, kmPL, t.ril),
      treno: { num: t.num, cat: t.cat, dest: t.dest, late: t.late || 0 }
    });
  }
  return out.sort((x, y) => x.at - y.at);
}

// Dai transiti alle finestre, con i tempi scelti (quelli del comune o quelli
// che l'utente ha regolato nelle impostazioni). E' la parte leggera, e la fa
// il telefono con la stessa formula.
export function finestreDa(transiti, tempi) {
  const out = [];
  for (const tr of transiti) {
    const f = finestraDi(tr, tempi);
    if (f) out.push({ da: f.da, a: f.a, at: tr.at, pad: tr.pad, ferma: tr.ferma, treno: tr.treno });
  }
  return out.sort((x, y) => x.at - y.at);
}

// ---- la decisione: quella che fa il telefono ---------------------------------

const PASSO = 15000;   // risoluzione della scansione: 15 secondi, non un minuto

function bloccata(finestre, daMs, aMs) {
  for (const f of finestre) if (daMs <= f.a && aMs >= f.da) return f;
  return null;
}

// arrivoMs: quando arrivi al passaggio se parti adesso.
// bufferMs: quanto vuoi che la sbarra resti su dopo il tuo arrivo.
// Restituisce, in millisecondi assoluti, fino a quando puoi partire (okFino)
// oppure da quando (attesaFino), e la finestra che ti ferma.
export function valuta(finestre, oraMs, arrivoMs, bufferMs, orizzonteMs = 3 * 3600000) {
  const cammino = arrivoMs - oraMs;
  const hit = bloccata(finestre, arrivoMs, arrivoMs + bufferMs);
  if (!hit) {
    let okFino = null;
    for (let t = oraMs + PASSO; t <= oraMs + orizzonteMs; t += PASSO) {
      if (bloccata(finestre, t + cammino, t + cammino + bufferMs)) { okFino = t - PASSO; break; }
    }
    return { libero: true, okFino, attesaFino: null, finestra: null };
  }
  for (let t = oraMs + PASSO; t <= oraMs + orizzonteMs; t += PASSO) {
    if (!bloccata(finestre, t + cammino, t + cammino + bufferMs)) {
      // quante finestre compongono la fila che ti tiene fermo
      const fila = finestre.filter((f) => arrivoMs <= f.a && t + cammino + bufferMs >= f.da).length;
      return { libero: false, okFino: null, attesaFino: t, finestra: hit, fila };
    }
  }
  return { libero: false, okFino: null, attesaFino: null, finestra: hit, fila: 1 };
}

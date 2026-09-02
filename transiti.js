// Sbarra Su — aggregatore per la tratta. Netlify Edge Function.
//
// Fa il lavoro pesante una volta per tutti: chiede a RFI chi passa, legge le
// schede dei treni, stima i transiti a OGNI passaggio a livello della tratta e
// li serve gia' pronti, con trenta secondi di cache sulla CDN. Dieci utenti o
// diecimila, il carico verso ViaggiaTreno non cambia. Il telefono riceve i
// transiti del suo passaggio e ci applica la formula della finestra con i
// tempi scelti — stessa formula, stesso file: motore.js.
//
// Costa per LINEA, non per paese: Loano e Pietra Ligure condividono stazioni e
// treni, quindi un aggregatore solo li serve entrambi.

import { puntiDa, rilevamentoDa, transitiDi } from "../../motore.js";

const BASE = "http://www.viaggiatreno.it/infomobilita/resteasy/viaggiatreno/";

// ViaggiaTreno vuole una data nel formato Date.toString() inglese, ora italiana
function vtDate(d) {
  const p = (n) => (+n < 10 ? "0" + +n : "" + +n);
  const mon = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
  const f = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/Rome", hour12: false, weekday: "short",
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", second: "2-digit"
  });
  const q = {};
  f.formatToParts(d).forEach((x) => { q[x.type] = x.value; });
  if (q.hour === "24") q.hour = "00";
  const asUTC = Date.UTC(+q.year, +q.month - 1, +q.day, +q.hour, +q.minute, +q.second);
  let off = Math.round((asUTC - Math.floor(d.getTime() / 1000) * 1000) / 60000);
  const sign = off >= 0 ? "+" : "-";
  off = Math.abs(off);
  return q.weekday + " " + mon[+q.month - 1] + " " + p(q.day) + " " + q.year + " " +
         p(q.hour) + ":" + p(q.minute) + ":" + p(q.second) +
         " GMT" + sign + p(Math.floor(off / 60)) + p(off % 60);
}

// attesa: "lista" (partenze/arrivi) o "oggetto" (andamentoTreno)
async function getJSON(url, attesa, tentativi = 2) {
  for (let i = 0; i < tentativi; i++) {
    try {
      const ctrl = new AbortController();
      const t = setTimeout(() => ctrl.abort(), 8000);
      const r = await fetch(url, { signal: ctrl.signal });
      clearTimeout(t);
      if (!r.ok) throw new Error("HTTP " + r.status);
      const j = await r.json();
      if (!j || typeof j !== "object") throw new Error("forma inattesa");
      if (attesa === "lista" && !Array.isArray(j)) throw new Error("attesa lista");
      return j;
    } catch (e) {
      if (i === tentativi - 1) return null;
    }
  }
  return null;
}

async function pool(items, size, worker) {
  const out = new Array(items.length);
  let i = 0;
  const runner = async () => { while (i < items.length) { const k = i++; out[k] = await worker(items[k]); } };
  await Promise.all(Array.from({ length: Math.min(size, items.length) }, runner));
  return out;
}

// I dati di linea stanno in UN file, servito dal sito stesso: la funzione lo
// legge dalla propria origine e lo tiene in memoria dieci minuti.
let lineaCache = { at: 0, dati: null };
async function linea(request) {
  if (lineaCache.dati && Date.now() - lineaCache.at < 600000) return lineaCache.dati;
  const r = await fetch(new URL("/linea.json", request.url));
  if (!r.ok) throw new Error("linea.json non leggibile");
  const dati = await r.json();
  lineaCache = { at: Date.now(), dati };
  return dati;
}

function errore(msg, status) {
  return new Response(JSON.stringify({ errore: msg }), {
    status, headers: { "content-type": "application/json", "cache-control": "no-store" }
  });
}

export default async (request) => {
  let L;
  try { L = await linea(request); } catch (e) { return errore(String(e.message), 500); }

  const KM = {}, ID_DA_NOME = {};
  for (const s of L.stazioni) { KM[s.id] = s.km; ID_DA_NOME[s.vt] = s.id; }
  const passaggi = L.comuni.flatMap((c) => c.passaggi.map((p) => ({ ...p, comune: c.id })));
  const kmMin = Math.min(...passaggi.map((p) => p.km)) - 0.1;
  const kmMax = Math.max(...passaggi.map((p) => p.km)) + 0.1;

  const quando = encodeURIComponent(vtDate(new Date()));

  // 1) chi passa di qui: partenze E arrivi delle stazioni sorvegliate. Gli
  //    arrivi servono per i treni che TERMINANO in una di esse.
  const liste = await Promise.all(
    L.sorvegliate.flatMap((id) => [
      getJSON(BASE + "partenze/" + id + "/" + quando, "lista"),
      getJSON(BASE + "arrivi/" + id + "/" + quando, "lista")
    ])
  );
  if (liste.every((l) => l === null)) return errore("viaggiatreno non raggiungibile", 503);

  const visti = new Set(), candidati = [];
  liste.forEach((righe) => {
    (righe || []).forEach((r) => {
      if (!(r.orarioPartenza || r.orarioArrivo) || !r.numeroTreno) return;
      const key = r.codOrigine + "|" + r.numeroTreno + "|" + r.dataPartenzaTreno;
      if (visti.has(key)) return;
      visti.add(key);
      candidati.push({
        num: r.numeroTreno, cat: (r.categoria || "").toUpperCase(),
        dest: r.destinazione || "", late: typeof r.ritardo === "number" ? r.ritardo : 0,
        o: r.codOrigine, dt: r.dataPartenzaTreno
      });
    });
  });

  // 2) la scheda di ognuno: fermate con orari veri + ultimo avvistamento.
  const treni = (await pool(candidati, 8, async (t) => {
    const a = await getJSON(BASE + "andamentoTreno/" + t.o + "/" + t.num + "/" + t.dt, "oggetto");
    if (!a) return null;
    const pts = puntiDa(a, KM);
    if (pts.length < 2) return null;
    const kms = pts.map((p) => p.km);
    // tengo il treno se la sua corsa copre la fascia dei passaggi
    if (Math.min(...kms) > kmMax || Math.max(...kms) < kmMin) return null;
    return { num: t.num, cat: t.cat, dest: t.dest, late: t.late, pts, ril: rilevamentoDa(a, ID_DA_NOME, KM) };
  })).filter(Boolean);

  // 3) i transiti a ogni passaggio, gia' con la conferma di passaggio.
  const perPassaggio = {};
  for (const p of passaggi) perPassaggio[p.id] = transitiDi(treni, p.km);

  return new Response(JSON.stringify({ ts: Date.now(), v: L.v, transiti: perPassaggio }), {
    headers: {
      "content-type": "application/json",
      // il browser tiene la risposta 15 s, la CDN 30 s e continua a servire
      // quella vecchia mentre ne prende una nuova: nessun utente aspetta e
      // ViaggiaTreno riceve al massimo due giri al minuto in tutto
      "cache-control": "public, max-age=15",
      "netlify-cdn-cache-control": "public, s-maxage=30, stale-while-revalidate=120"
    }
  });
};

export const config = { path: "/api/transiti" };

// Prove del motore. Si lanciano con:  node prove.js
// Escono con codice 1 se una prova fallisce: da far girare PRIMA di ogni
// caricamento su GitHub. I casi con data sono treni veri, registrati.

import { puntiDa, transito, superato, finestraDi, finestreDa, transitiDi, valuta }
  from "./motore.js";
import { readFileSync } from "node:fs";

const L = JSON.parse(readFileSync(new URL("./linea.json", import.meta.url), "utf8"));
const KM = {}; for (const s of L.stazioni) KM[s.id] = s.km;
const TEMPI_LOANO = L.comuni.find((c) => c.id === "loano").tempi;
const TEMPI_PRUDENTI = L.tempiPrudenti;
const RAMELLA = 27.251, ROSSELLO = 23.935, MATTEOTTI = 21.13;
const M = 60000;

const ore = (h, m, s = 0) => new Date(`2026-08-28T${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}+02:00`).getTime();
const hh = (ms) => new Intl.DateTimeFormat("it-IT", { timeZone: "Europe/Rome", hour: "2-digit", minute: "2-digit", second: "2-digit" }).format(new Date(ms));

let passate = 0, totale = 0;
function prova(nome, cond, dettaglio) {
  totale++;
  if (cond) { passate++; console.log("OK       " + nome); }
  else console.log("FALLITA  " + nome + (dettaglio ? "  ->  " + dettaglio : ""));
}
const pt = (id, arr, dep, arrR = null, depR = null) => ({ id, km: KM[id], arr, dep, arrR, depR, effR: null });
const bloccaA = (fin, t) => fin.some((f) => t <= f.a && t >= f.da);

// ---- 1. IC 637 del 28/8/2026: stima 13:59:50, passato davvero alle 14:02 ------
{
  const pts = [pt("S04522", ore(13, 43), ore(13, 43), null, ore(13, 53, 30)),
               pt("S04516", ore(13, 56), ore(13, 56))];
  const tr = transito(pts, RAMELLA);
  prova("IC 637: stima del transito a Ramella ~13:59:50", Math.abs(tr.at - ore(13, 59, 50)) < 20000, hh(tr.at));
  prova("IC 637: non ferma vicino a Loano", tr.ferma === false);
  tr.superato = superato(pts, RAMELLA, null);
  const f = finestraDi(tr, TEMPI_LOANO);
  prova("IC 637: alle 14:01:30 la sbarra risulta ancora giu' (coda minima)", bloccaA([f], ore(14, 1, 30)), hh(f.a));
  prova("IC 637: alle 14:02:30 risulta su (sbarra vera risalita ~14:02:20)", !bloccaA([f], ore(14, 2, 30)), hh(f.a));
  // rilevato a LOANO (27.43 > 27.25, verso Ventimiglia): superato, nessuna finestra
  const tr2 = { ...tr, superato: superato(pts, RAMELLA, { km: 27.43, at: ore(14, 2) }) };
  prova("IC 637: rilevato a Loano -> superato, non blocca piu'", tr2.superato && finestraDi(tr2, TEMPI_LOANO) === null);
}

// ---- 2. IC 745 del 28/8/2026: prima di partire da Albenga, ritardo +9 ------------
{
  const pts = [pt("S04516", ore(11, 59), ore(11, 59)), pt("S04522", ore(12, 17), ore(12, 17))];
  const tr = transito(pts, RAMELLA);
  tr.at += 9 * M;   // il ritardo dichiarato si somma perche' la stima e' da tabella
  tr.superato = false;
  prova("IC 745: stima 12:17 con margine +/-5 (tratta di 18 min)", Math.abs(tr.at - ore(12, 17)) < 20000 && tr.pad === 5, hh(tr.at) + " pad " + tr.pad);
  const f = finestraDi(tr, TEMPI_LOANO);
  prova("IC 745: sbarra giu' dalle ~12:08:45 (vera: ~12:09)", Math.abs(f.da - ore(12, 8, 45)) < 20000, hh(f.da));
  prova("IC 745: alle 12:08 si passa", !bloccaA([f], ore(12, 8)));
  prova("IC 745: alle 12:10 no", bloccaA([f], ore(12, 10)));
}

// ---- 3. La direzione conta: rilevato a Loano non vuol dire oltre Ramella ---------
{
  const versoSavona = [pt("S04516", ore(14, 40), ore(14, 40), null, ore(14, 40)), pt("S04801", ore(15, 20), ore(15, 20))];
  const versoVentimiglia = [pt("S04522", ore(14, 40), ore(14, 40), null, ore(14, 40)), pt("S04516", ore(15, 0), ore(15, 0))];
  const ril = { km: 27.43, at: ore(14, 53) };
  prova("verso Savona, visto a Loano -> Ramella ancora da attraversare", superato(versoSavona, RAMELLA, ril) === false);
  prova("verso Ventimiglia, visto a Loano -> Ramella gia' attraversata", superato(versoVentimiglia, RAMELLA, ril) === true);
}

// ---- 4. Regionale fermo a Loano con orario vero: niente coda minima --------------
{
  const pts = [pt("S04520", ore(14, 40), ore(14, 41), ore(14, 40), ore(14, 41)),
               pt("S04519", ore(14, 46), ore(14, 47), ore(14, 46), ore(14, 47)),
               pt("S04518", ore(14, 50), ore(14, 51))];
  const tr = transito(pts, RAMELLA);
  prova("regionale: transito a Ramella dall'orario vero, esatto", tr.exact && tr.reale && tr.ferma);
  tr.superato = superato(pts, RAMELLA, null);
  prova("regionale verso Albenga con orario vero a Loano -> gia' oltre Ramella", tr.superato === true);
  // stesso treno ma verso Savona: attraversa Ramella DOPO la stazione
  const ptsS = [pt("S04518", ore(14, 40), ore(14, 41), ore(14, 40), ore(14, 41)),
                pt("S04519", ore(14, 46), ore(14, 47), ore(14, 46), ore(14, 47)),
                pt("S04520", ore(14, 52), ore(14, 53))];
  const trS = transito(ptsS, RAMELLA); trS.superato = superato(ptsS, RAMELLA, null);
  const f = finestraDi(trS, TEMPI_LOANO);
  prova("verso Savona: riparte 14:47, Ramella a 179 m -> transito ~14:47:14", Math.abs(trS.at - ore(14, 47, 14)) < 5000, hh(trS.at));
  prova("orario vero -> sbarra su 30 s dopo, senza coda minima", Math.abs(f.a - (trS.at + 30000)) < 1000, hh(f.a));
}

// ---- 5. Incrocio: due finestre che si toccano diventano un'attesa sola ------------
{
  const ora = ore(14, 40);
  const tA = { at: ore(14, 47), pad: 0, ferma: true, exact: true, reale: true, superato: false, treno: { num: "A" } };
  const tB = { at: ore(14, 51), pad: 1, ferma: true, exact: false, reale: true, superato: false, treno: { num: "B" } };
  const fin = finestreDa([tA, tB], TEMPI_LOANO);
  const v = valuta(fin, ora, ora + 3 * M, 60000);   // arrivo alle 14:43, voglio 1 min di sbarra su
  prova("incrocio: fermo", v.libero === false);
  prova("incrocio: la fila conta due treni", v.fila === 2, String(v.fila));
  // attesaFino e' l'orario di PARTENZA: si arriva 3 min dopo, oltre la fine della seconda finestra (14:53:30)
  prova("incrocio: si arriva solo dopo la fine della seconda finestra", v.attesaFino + 3 * M > ore(14, 53, 30), hh(v.attesaFino + 3 * M));
}

// ---- 6. La decisione non regala mai secondi ------------------------------------------
{
  const ora = ore(10, 0);
  const tr = { at: ore(10, 20), pad: 0, ferma: false, exact: true, reale: true, superato: false, treno: { num: "X" } };
  const fin = finestreDa([tr], TEMPI_LOANO);       // giu' da 10:16:45 a 10:20:30
  const cammino = 4 * M, buffer = 60000;
  const v = valuta(fin, ora, ora + cammino, buffer);
  prova("verde adesso", v.libero === true);
  prova("okFino e' multiplo di 15 s", (v.okFino - ora) % 15000 === 0);
  prova("partendo a okFino arrivi con la sbarra ancora su per tutto il buffer",
        !fin.some((f) => v.okFino + cammino <= f.a && v.okFino + cammino + buffer >= f.da), hh(v.okFino));
  prova("partendo 15 s dopo, no", fin.some((f) => v.okFino + 15000 + cammino <= f.a && v.okFino + 15000 + cammino + buffer >= f.da));
}

// ---- 7. Generalizzazione: Pietra Ligure e Borgio Verezzi ---------------------------------
{
  // regionale che ferma a Pietra: Rossello (24.29-0.355) usa il modello di stazione
  const pts = [pt("S04521", ore(9, 0), ore(9, 1), ore(9, 0), ore(9, 1)),
               pt("S04520", ore(9, 5), ore(9, 6)), pt("S04519", ore(9, 10), ore(9, 11))];
  const tr = transito(pts, ROSSELLO);
  prova("Rossello: la stazione di riferimento e' Pietra Ligure (modello di stazione)", tr.ferma === true && tr.exact === false && tr.pad === 1);
  // verso Loano (km crescenti): Rossello sta PRIMA della stazione -> lo attraversa prima di arrivare
  prova("Rossello prima della stazione: transito prima dell'arrivo 9:05", tr.at < ore(9, 5) && tr.at > ore(9, 4), hh(tr.at));
  // Matteotti (21.13) a 320 m da Borgio Verezzi (21.45)
  const trM = transito(pts, MATTEOTTI);
  // Matteotti (21.13) sta PRIMA di Borgio (21.45) per un treno che va verso Loano: lo attraversa prima di arrivare alle 9:00
  prova("Matteotti: riferimento Borgio Verezzi, attraversato ~26 s prima dell'arrivo 9:00", trM.ferma && trM.at < ore(9, 0) && trM.at > ore(8, 59), hh(trM.at));
  // IC che non ferma fra Finale e Albenga: interpolazione, non ferma
  const ic = [pt("S04522", ore(9, 0), ore(9, 0)), pt("S04516", ore(9, 13), ore(9, 13))];
  prova("IC a Rossello: non ferma, margine da tratta", transito(ic, ROSSELLO).ferma === false);
}

// ---- 8. Tempi prudenti dove nessuno ha misurato -------------------------------------
{
  const tr = { at: ore(12, 0), pad: 1, ferma: false, exact: false, reale: true, superato: false };
  const a = finestraDi(tr, TEMPI_LOANO), b = finestraDi(tr, TEMPI_PRUDENTI);
  prova("tempi prudenti: sbarra giu' prima e su dopo rispetto a Loano", b.da < a.da && b.a > a.a);
}

// ---- 9. Lettura del formato andamentoTreno -----------------------------------------------
{
  const a = { fermate: [
    { id: "S04522", stazione: "FINALE LIGURE MARINA", programmata: 1, partenza_teorica: 2, partenzaReale: 3 },
    { id: "S99999", stazione: "ALTROVE", programmata: 4 },
    { id: "S04516", stazione: "ALBENGA", arrivo_teorico: 5 } ] };
  const pts = puntiDa(a, KM);
  prova("puntiDa: tiene solo le stazioni note, con orari veri separati", pts.length === 2 && pts[0].depR === 3 && pts[1].arr === 5);
}

// ---- 10. Il 12269 del 28/8/2026: fermo a Loano sette minuti oltre la sosta --------------
{
  // arrivato 14:46 (in anticipo), partenza prevista 14:48, ripartito davvero ~14:53. Va verso Savona: Ramella e' DOPO la stazione.
  const base = () => [pt("S04518", ore(14, 40), ore(14, 41), ore(14, 40), ore(14, 41)),
                      pt("S04519", ore(14, 47), ore(14, 48), ore(14, 46), null),
                      pt("S04520", ore(14, 52), ore(14, 53))];
  // a) nessuna notizia sulla partenza
  let tr = transito(base(), RAMELLA, null); tr.superato = false;
  prova("fermo in stazione: la partenza stimata non e' MAI prima dell'orario (14:48)", tr.at >= ore(14, 48), hh(tr.at));
  prova("fermo in stazione: segnalato come `attesa`, non esatto", tr.attesa === true && tr.exact === false);
  let f = finestraDi(tr, TEMPI_LOANO);
  prova("fermo in stazione: alle 14:52 la sbarra risulta ancora giu' (il treno non e' passato)", bloccaA([f], ore(14, 52)), hh(f.a));
  prova("fermo in stazione: la finestra resta aperta almeno 8 minuti oltre la stima", f.a >= tr.at + 8 * M, hh(f.a));
  // b) RFI lo vede a Loano alle 14:53: e' la ripartenza
  tr = transito(base(), RAMELLA, { km: 27.43, at: ore(14, 53) }); tr.superato = false;
  prova("avvistato a Loano alle 14:53 -> ripartenza 14:53, transito 14:53:14, certo", Math.abs(tr.at - ore(14, 53, 14)) < 2000 && tr.exact && tr.reale && !tr.attesa, hh(tr.at));
  f = finestraDi(tr, TEMPI_LOANO);
  prova("con la ripartenza certa la sbarra risale 30 s dopo il transito", Math.abs(f.a - (tr.at + 30000)) < 1000, hh(f.a));
  // c) l'avvistamento a Loano coincide con l'arrivo: NON e' una ripartenza
  tr = transito(base(), RAMELLA, { km: 27.43, at: ore(14, 46, 10) });
  prova("avvistamento = arrivo -> ancora in attesa", tr.attesa === true);
  // d) partenza registrata: stesso risultato del caso b
  const conDep = base(); conDep[1].depR = ore(14, 53);
  tr = transito(conDep, RAMELLA, null);
  prova("partenzaReale 14:53 -> transito certo 14:53:14", Math.abs(tr.at - ore(14, 53, 14)) < 2000 && tr.exact && !tr.attesa, hh(tr.at));
  // e) passaggio PRIMA della stazione: conta l'arrivo, la partenza non c'entra
  const primaSt = [pt("S04520", ore(14, 40), ore(14, 41), ore(14, 40), ore(14, 41)),
                   pt("S04519", ore(14, 47), ore(14, 48), ore(14, 46), null),
                   pt("S04518", ore(14, 52), ore(14, 53))];
  tr = transito(primaSt, RAMELLA, null);
  prova("passaggio prima della stazione, arrivo registrato -> esatto, senza attesa", tr.exact && tr.reale && !tr.attesa && tr.at < ore(14, 46), hh(tr.at));
}

console.log(`\n${passate}/${totale} prove superate`);
process.exit(passate === totale ? 0 : 1);

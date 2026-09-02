// Prova della funzione edge per intero, con rete finta:  node prove-edge.mjs
// Esegue transiti.js con fetch finto: linea.json vero, ViaggiaTreno simulato con
// due treni in forma identica alle risposte reali (IC 637 e un regionale).
import { readFileSync } from "node:fs";
const linea = readFileSync(new URL("./linea.json", import.meta.url), "utf8");
const ore = (h, m, s = 0) => new Date(`2026-08-28T${String(h).padStart(2,"0")}:${String(m).padStart(2,"0")}:${String(s).padStart(2,"0")}+02:00`).getTime();
const fermata = (id, nome, arr, dep, arrR, depR) => ({ id, stazione: nome, arrivo_teorico: arr, partenza_teorica: dep, programmata: dep || arr, arrivoReale: arrR || null, partenzaReale: depR || null, effettiva: depR || arrR || null });
const IC637 = { numeroTreno: 637, categoria: "IC", destinazione: "VENTIMIGLIA", ritardo: 10, codOrigine: "S01700", dataPartenzaTreno: 1787868000000,
  stazioneUltimoRilevamento: "PIETRA LIGURE", oraUltimoRilevamento: ore(13, 58),
  fermate: [ fermata("S04801","SAVONA",ore(13,28),ore(13,30),ore(13,38),ore(13,41)),
             fermata("S04522","FINALE LIGURE MARINA",ore(13,42),ore(13,43),ore(13,50),ore(13,53,30)),
             fermata("S04516","ALBENGA",ore(13,56),ore(13,57),null,null),
             fermata("S04523","IMPERIA",ore(14,20),ore(14,21),null,null) ] };
const REG = { numeroTreno: 12269, categoria: "REG", destinazione: "SAVONA", ritardo: 4, codOrigine: "S04523", dataPartenzaTreno: 1787868000000,
  stazioneUltimoRilevamento: "LOANO", oraUltimoRilevamento: ore(14, 53),
  fermate: [ fermata("S04516","ALBENGA",ore(14,38),ore(14,39),ore(14,40),ore(14,41)),
             fermata("S04517","CERIALE",ore(14,42),ore(14,43),ore(14,44),ore(14,44,30)),
             fermata("S04519","LOANO",ore(14,47),ore(14,48),ore(14,46),null),
             fermata("S04520","PIETRA LIGURE",ore(14,52),ore(14,53),null,null),
             fermata("S04801","SAVONA",ore(15,20),null,null,null) ] };
const riga = (t, st) => ({ numeroTreno: t.numeroTreno, categoria: t.categoria, destinazione: t.destinazione, ritardo: t.ritardo, codOrigine: t.codOrigine, dataPartenzaTreno: t.dataPartenzaTreno, orarioPartenza: ore(14, 0) });
let chiamate = { partenze: 0, arrivi: 0, andamento: 0, linea: 0 };
globalThis.fetch = async (url) => {
  const u = String(url);
  const ok = (body) => new Response(JSON.stringify(body), { status: 200, headers: { "content-type": "application/json" } });
  if (u.endsWith("/linea.json")) { chiamate.linea++; return new Response(linea, { status: 200 }); }
  if (u.includes("/partenze/")) { chiamate.partenze++; return ok(u.includes("S04519") ? [riga(IC637), riga(REG)] : [riga(IC637)]); }
  if (u.includes("/arrivi/")) { chiamate.arrivi++; return ok([]); }
  if (u.includes("/andamentoTreno/")) { chiamate.andamento++; return ok(u.includes("/637/") ? IC637 : REG); }
  return new Response("no", { status: 404 });
};
const mod = await import(new URL("./netlify/edge-functions/transiti.js", import.meta.url));
const res = await mod.default(new Request("https://esempio.netlify.app/api/transiti"));
const j = await res.json();
const hh = (ms) => new Intl.DateTimeFormat("it-IT", { timeZone: "Europe/Rome", hour: "2-digit", minute: "2-digit", second: "2-digit" }).format(new Date(ms));
console.log("stato HTTP:", res.status, "| cache:", res.headers.get("netlify-cdn-cache-control"));
console.log("chiamate simulate:", JSON.stringify(chiamate), "(andamento = 2: un treno, una richiesta, deduplicato)");
console.log("passaggi nella risposta:", Object.keys(j.transiti).length, "->", Object.keys(j.transiti).join(", "));
const r = j.transiti.ramella.map(x => `${x.treno.cat} ${x.treno.num} ${hh(x.at)} ±${x.pad} ferma=${x.ferma} exact=${x.exact} reale=${x.reale} superato=${x.superato}`);
console.log("\nRamella:\n  " + r.join("\n  "));
const m = j.transiti.matteotti.map(x => `${x.treno.cat} ${x.treno.num} ${hh(x.at)} ±${x.pad} ferma=${x.ferma} superato=${x.superato}`);
console.log("Matteotti (Borgio Verezzi):\n  " + m.join("\n  "));
// attese
const ic = j.transiti.ramella.find(x => x.treno.num == 637), reg = j.transiti.ramella.find(x => x.treno.num == 12269);
const attese = [
  ["IC 637 a Ramella ~13:59:50, non ferma", Math.abs(ic.at - ore(13,59,50)) < 20000 && ic.ferma === false],
  ["IC 637 rilevato a Pietra (prima di Ramella): NON superato", ic.superato === false],
  ["REG 12269 verso Savona, visto a Loano: Ramella ancora da fare, NON superato", reg.superato === false],
  ["REG 12269: visto a Loano alle 14:53 dopo l'arrivo -> ripartenza 14:53, Ramella ~14:53:14", Math.abs(reg.at - ore(14,53,14)) < 2000 && reg.exact],
  ["a Matteotti l'IC 637 risulta gia' passato (rilevato a Pietra, 24.29 > 21.13)", j.transiti.matteotti.find(x => x.treno.num == 637).superato === true],
];
let ok = 0; for (const [n, c] of attese) { console.log((c ? "OK      " : "FALLITA ") + n); if (c) ok++; }
console.log(`\n${ok}/${attese.length} attese sulla funzione edge`);
process.exit(ok === attese.length ? 0 : 1);

// Prova del CLIENT in un browser simulato (jsdom):  node prove-client.mjs
// Carica index.html con rete finta e orologio fermo, e guarda cosa mostra.
// jsdom non esegue gli script "module": l'import del motore viene sostituito
// con le stesse funzioni iniettate come globali. Tutto il resto e' il codice vero.
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
let JSDOM; try { ({ JSDOM } = require("/tmp/node_modules/jsdom")); } catch (e) { try { ({ JSDOM } = require("jsdom")); } catch (e2) { console.log("jsdom non installato: salto la prova del client (npm install jsdom)"); process.exit(0); } }
const M = await import(new URL("./motore.js", import.meta.url));
const qui = (f) => readFileSync(new URL(f, import.meta.url), "utf8");
const html = qui("./index.html"), linea = qui("./linea.json"), tabPietra = qui("./percorsi-pietra.json");
const ore = (h, m, s = 0) => new Date(`2026-08-28T${String(h).padStart(2,"0")}:${String(m).padStart(2,"0")}:${String(s).padStart(2,"0")}+02:00`).getTime();
const ORA = ore(14, 40);

// transiti come li produrrebbe la funzione edge (v. prove-edge.mjs)
const transiti = {};
const perTutti = (tr) => { for (const id of ["ramella","cesarea","stella","isnardi","martiri","loreto","marconi","rossello","boccone","matteotti"]) transiti[id] = tr; };
perTutti([
  { at: ore(14, 48, 14), pad: 1, ferma: true, exact: false, reale: false, attesa: true, superato: false, treno: { num: 12269, cat: "REG", dest: "SAVONA", late: 4 } },
  { at: ore(14, 58, 40), pad: 0, ferma: true, exact: true, reale: true, attesa: false, superato: false, treno: { num: 3372, cat: "REG", dest: "VENTIMIGLIA", late: 6 } },
  { at: ore(15, 20), pad: 3, ferma: false, exact: false, reale: false, attesa: false, superato: false, treno: { num: 745, cat: "IC", dest: "MILANO CENTRALE", late: 0 } }
]);

let attese = 0, passate = 0;
const prova = (n, c, d) => { attese++; if (c) { passate++; console.log("OK       " + n); } else console.log("FALLITA  " + n + (d ? "  ->  " + d : "")); };

async function avvia(opzioni = {}) {
  const script = html.match(/<script type="module">([\s\S]*?)<\/script>/)[1].replace(/^\s*import[^\n]*\n/, "");
  const pagina = html.replace(/<script type="module">[\s\S]*?<\/script>/, "");
  const dom = new JSDOM(pagina, { url: "https://riviera.test/", pretendToBeVisual: true, runScripts: "outside-only" });
  const w = dom.window;
  w.Date.now = () => ORA;
  w.finestreDa = M.finestreDa; w.valuta = M.valuta;
  w.matchMedia = () => ({ matches: false, addEventListener() {} });
  Object.defineProperty(w.navigator, "language", { value: opzioni.lang || "it-IT" });
  w.fetch = async (u) => {
    u = String(u);
    const ok = (b, t = "application/json") => ({ ok: true, status: 200, json: async () => JSON.parse(b), text: async () => b });
    if (u.includes("/linea.json")) return ok(linea);
    if (u.includes("/api/transiti")) return ok(JSON.stringify({ ts: ORA, v: 1, transiti }));
    if (u.includes("/percorsi-pietra.json")) return ok(tabPietra);
    if (u.includes("/percorsi-loano.json")) return { ok: false, status: 404 };
    return { ok: false, status: 404 };
  };
  if (opzioni.cfg) w.localStorage.setItem("sbarraRiviera", JSON.stringify(Object.assign({ v: 1 }, opzioni.cfg)));
  w.eval(script);
  await new Promise((r) => setTimeout(r, 150));
  return w;
}
const testo = (w, id) => w.document.getElementById(id).textContent.trim();

// 1) Loano / Ramella, 14:40, devo ancora uscire (3 min a piedi + 3 per incamminarmi + 1 di margine)
{
  const w = await avvia();
  prova("carica la pagina senza errori e mostra un verdetto", ["VAI","VAI SUBITO","ASPETTA"].includes(testo(w, "verdict")), testo(w, "verdict"));
  prova("sottotitolo: LOANO", testo(w, "sottotitolo").includes("LOANO"), testo(w, "sottotitolo"));
  prova("fiducia a Ramella: misurato", w.document.getElementById("fiducia").className.includes("misurato"));
  // arrivo alle 14:47 con margine fino alle 14:48: il 12269 (finestra da 14:43:29 a ~14:56:44) blocca -> ASPETTA
  prova("alle 14:40 con arrivo 14:47: ASPETTA per il 12269 fermo in stazione", testo(w, "verdict") === "ASPETTA", testo(w, "verdict"));
  prova("il testo cita il treno che blocca", testo(w, "sub").includes("12269"), testo(w, "sub"));
  const righe = w.document.querySelectorAll("#list tbody tr");
  prova("elenco: 3 treni in arrivo", righe.length === 3, String(righe.length));
  prova("elenco: l'IC porta il margine ±3", w.document.querySelector("#list").textContent.includes("±3"));
  prova("nota sul passaggio: 179 m dalla stazione di Loano", testo(w, "plNote").includes("179 m") && testo(w, "plNote").includes("Loano"), testo(w, "plNote"));
}
// 2) Pietra Ligure / Rossello, con posizione vicino al passaggio (tabella vera)
{
  const w = await avvia({ cfg: { comune: "pietra", pl: "rossello", plScelto: true, letta: true, pos: { lat: 44.1479, lon: 8.2810 }, posLabel: "posizione attuale", posT: ORA } });
  prova("sottotitolo: PIETRA LIGURE", testo(w, "sottotitolo").includes("PIETRA LIGURE"), testo(w, "sottotitolo"));
  prova("fiducia a Pietra: stimato (nessuno ha cronometrato)", w.document.getElementById("fiducia").className.includes("stimato"));
  prova("nota: riferimento Pietra Ligure", testo(w, "plNote").includes("Pietra Ligure"), testo(w, "plNote"));
  const st = w.document.getElementById("posStatus").textContent;
  const mm = st.match(/(\d+) m, (\d) min/);
  prova("tabella di Pietra: distanza a piedi calcolata dalla tabella vera (< 200 m, 1-3 min)", mm && +mm[1] < 200 && +mm[2] <= 3, st);
  prova("cursore minuti bloccato sul valore calcolato", w.document.getElementById("walk").disabled === true);
  // tempi prudenti in vigore: pre 5:00
  prova("avanzate: sbarra giu' 5:00 (tempi prudenti)", testo(w, "preV") === "5:00", testo(w, "preV"));
}
// 3) Matteotti: il riferimento e' Borgio Verezzi
{
  const w = await avvia({ cfg: { comune: "pietra", pl: "matteotti", plScelto: true } });
  prova("Matteotti: 320 m dalla stazione di Borgio Verezzi", testo(w, "plNote").includes("Borgio Verezzi") && testo(w, "plNote").includes("320 m"), testo(w, "plNote"));
}
// 4) inglese
{
  const w = await avvia({ lang: "en-GB" });
  prova("inglese: verdetto in inglese", ["GO","GO NOW","WAIT"].includes(testo(w, "verdict")), testo(w, "verdict"));
  prova("inglese: informativa in inglese", testo(w, "legalTitle").toLowerCase().includes("privacy") && !testo(w, "legalTitle").includes("Avvertenze"), testo(w, "legalTitle"));
}
// 5) senza dati dei treni
{
  const w = await avvia();
  w.fetch = async () => { throw new Error("giu'"); };
  await new Promise((r) => setTimeout(r, 50));
  prova("dati mancanti: il verdetto precedente resta (non inventa nulla)", ["VAI","VAI SUBITO","ASPETTA"].includes(testo(w, "verdict")));
}
console.log(`\n${passate}/${attese} prove del client superate`);
process.exit(passate === attese ? 0 : 1);

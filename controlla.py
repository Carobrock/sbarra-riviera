#!/usr/bin/env python3
"""Controllo prima del caricamento:  python3 controlla.py

1. sintassi di ogni file JS e del modulo dentro index.html (node --check)
2. funzioni CHIAMATE ma mai DEFINITE ne' importate — il controllo che mancava
   il 28 agosto 2026, quando due funzioni sono sparite da un file valido
3. la regola globale [hidden]{display:none !important} in index.html
4. le prove:  node prove.js

Esce con codice 1 se qualcosa non va."""
import io, os, re, subprocess, sys

QUI = os.path.dirname(os.path.abspath(__file__))
os.chdir(QUI)

def ripulisci(js):
    fuori, i, n = [], 0, len(js)
    while i < n:
        c = js[i]
        if c in "\"'`":
            q = c; i += 1
            while i < n and js[i] != q:
                i += 2 if js[i] == "\\" else 1
            i += 1; fuori.append('""')
        elif js.startswith("//", i):
            while i < n and js[i] != "\n": i += 1
        elif js.startswith("/*", i):
            j = js.find("*/", i); i = n if j < 0 else j + 2
        else:
            fuori.append(c); i += 1
    return "".join(fuori)

NOTI = set("""if for while switch catch return typeof function new delete void in of do else try
parseInt parseFloat isNaN isFinite encodeURIComponent decodeURIComponent decodeURI encodeURI
setTimeout setInterval clearTimeout clearInterval fetch import await async
console document window navigator localStorage history location screen performance
String Number Boolean Array Object Date Math JSON Promise Error RegExp Map Set Symbol
requestAnimationFrame cancelAnimationFrame matchMedia getComputedStyle structuredClone
btoa atob queueMicrotask crypto AbortController Response Request Headers URL AbortSignal
DataTransfer Intl Infinity NaN process""".split())

def funzioni_fantasma(js):
    js = ripulisci(js)
    definite = set(re.findall(r"function\s+([A-Za-z_$][\w$]*)\s*\(", js))
    definite |= set(re.findall(r"(?:var|let|const)\s+([A-Za-z_$][\w$]*)\s*=", js))
    definite |= set(re.findall(r"(?:var|let|const)\s+\{([^}]*)\}\s*=", js) and
                    {x.strip().split(":")[-1].strip() for m in re.findall(r"(?:var|let|const)\s+\{([^}]*)\}\s*=", js) for x in m.split(",") if x.strip()} or set())
    for m in re.findall(r"import\s*\{([^}]*)\}", js):
        definite |= {x.strip().split(" as ")[-1].strip() for x in m.split(",") if x.strip()}
    definite |= set(re.findall(r"import\s+\*\s+as\s+([A-Za-z_$][\w$]*)", js))
    for par in re.findall(r"function[^(]*\(([^)]*)\)", js) + re.findall(r"\(([^()]*)\)\s*=>", js):
        definite |= {x.strip().split("=")[0].strip() for x in par.split(",") if x.strip()}
    definite |= set(re.findall(r"\b([A-Za-z_$][\w$]*)\s*=>", js))
    # chiavi di oggetto usate come metodi: {nome: function...} / nome(){...}
    definite |= set(re.findall(r"^\s*([A-Za-z_$][\w$]*)\s*\(", js, re.M))
    definite |= set(re.findall(r"([A-Za-z_$][\w$]*)\s*:\s*(?:async\s+)?function", js))
    chiamate = set(re.findall(r"(?<![.\w$])([a-zA-Z_$][\w$]*)\s*\(", js))
    return sorted(c for c in chiamate if c not in definite and c not in NOTI)

def sintassi(percorso, testo=None):
    if testo is not None:
        tmp = "/tmp/_sbarra_check.mjs"
        io.open(tmp, "w", encoding="utf-8").write(testo); percorso = tmp
    r = subprocess.run(["node", "--check", percorso], capture_output=True, text=True)
    return None if r.returncode == 0 else r.stderr.strip().splitlines()[-1][:160]

errori = 0
def esito(nome, problema):
    global errori
    if problema: errori += 1; print("ERRORE  %-32s %s" % (nome, problema))
    else: print("ok      %s" % nome)

# ---- file JS ---------------------------------------------------------------------
for f in ["motore.js", "netlify/edge-functions/transiti.js", "prove.js"]:
    if not os.path.exists(f): esito(f, "manca"); continue
    js = io.open(f, encoding="utf-8").read()
    # per node --check i moduli devono avere estensione .mjs
    esito(f + " (sintassi)", sintassi(None, js))
    ft = funzioni_fantasma(js)
    esito(f + " (fantasma)", ", ".join(ft) if ft else None)

# ---- index.html --------------------------------------------------------------------
if os.path.exists("index.html"):
    h = io.open("index.html", encoding="utf-8").read()
    blocchi = re.findall(r"<script[^>]*>(.*?)</script>", h, re.S)
    for i, b in enumerate(blocchi):
        if not b.strip() or "src=" in b[:0]: continue
        esito("index.html script %d (sintassi)" % i, sintassi(None, b))
        ft = funzioni_fantasma(b)
        esito("index.html script %d (fantasma)" % i, ", ".join(ft) if ft else None)
    compatto = h.replace(" ", "").replace("\n", "")
    esito("index.html [hidden] globale", None if "[hidden]{display:none!important}" in compatto else "manca la regola [hidden]{display:none !important}")
else:
    esito("index.html", "manca")

# ---- prove ---------------------------------------------------------------------------
r = subprocess.run(["node", "prove.js"], capture_output=True, text=True)
ultima = (r.stdout.strip().splitlines() or ["?"])[-1]
esito("prove.js", None if r.returncode == 0 else ultima + " — " + " | ".join(l for l in r.stdout.splitlines() if l.startswith("FALLITA"))[:300])
r = subprocess.run(["node", "prove-edge.mjs"], capture_output=True, text=True)
ultima = (r.stdout.strip().splitlines() or ["?"])[-1]
esito("prove-edge.mjs (funzione edge intera)", None if r.returncode == 0 else ultima[:200])
r = subprocess.run(["node", "prove-client.mjs"], capture_output=True, text=True)
ultima = (r.stdout.strip().splitlines() or ["?"])[-1]
esito("prove-client.mjs (client in browser simulato)", None if r.returncode == 0 else ultima[:200])
print("\n" + ("TUTTO OK: si puo' caricare" if errori == 0 else "%d PROBLEMI: NON caricare" % errori))
sys.exit(1 if errori else 0)

#!/usr/bin/env python3
"""Rigenera index.html dal modello, inserendo i testi legali e di geolocalizzazione
(_testi.json, presi parola per parola dal sito di Loano, con le sole sostituzioni
per il contesto a due comuni). Uso:  python3 _build/costruisci.py"""
import json, io, os
qui = os.path.dirname(os.path.abspath(__file__)); os.chdir(qui)
t = json.load(io.open("_testi.json", encoding="utf-8"))
h = io.open("_index.template.html", encoding="utf-8").read()
M = {"LEGAL_LINK":"legalLink","LEGAL_TITLE":"legalTitle","LEGAL_UPDATED":"legalUpdated","LEGAL_BODY":"legalBody",
     "MICRO_TIT":"microTit","MICRO1":"micro1","MICRO2":"micro2","MICRO3":"micro3","MICRO4":"micro4",
     "HOW1":"how1","HOW2":"how2","HOW3":"how3","WARN":"avvisoGiallo","INSTALL_BTN":"installBtn"}
for tag, k in M.items():
    for lang in ["it", "en"]:
        h = h.replace("__%s_%s__" % (tag, lang.upper()), json.dumps(t[lang][k], ensure_ascii=False))
assert "__" not in h.replace("__proto__", ""), "segnaposto rimasti"
io.open("../index.html", "w", encoding="utf-8").write(h)
print("index.html rigenerato:", len(h.encode()), "byte")

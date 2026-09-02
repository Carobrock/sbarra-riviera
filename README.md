# Sbarra Su — Riviera (Loano e Pietra Ligure)

Riscrittura del sito di Loano con il calcolo spostato sul server, un solo
motore condiviso, prove nel repository, e la copertura di un secondo comune.

## Cosa cambia rispetto al sito di Loano

**Il cervello sta in un posto solo.** `motore.js` (alla radice) contiene
tutta la logica — lettura dei dati RFI, stima del transito, conferma di passaggio,
formula della finestra della sbarra, decisione — come funzioni pure, senza rete
né DOM. Lo usano la funzione edge (per calcolare i transiti una volta per tutti),
le prove (in node) e il telefono (che importa solo `finestreDa` e `valuta`).
La formula della finestra esiste **una** volta: nel sito di Loano ne esistevano
due e si erano già scollate.

**Il telefono fa poco.** Riceve da `/api/transiti` i transiti già stimati a ogni
passaggio a livello della tratta, applica i tempi della sbarra (quelli del comune
o quelli regolati dall'utente) e decide. Un bug si corregge in un file e in un
deploy, non su ogni telefono.

**Un aggregatore per la tratta, non per paese.** Loano e Pietra Ligure
condividono stazioni e treni: una sola funzione edge li serve entrambi, con lo
stesso carico verso RFI di prima.

**I dati stanno in `linea.json`**, letto sia dal telefono sia dalla funzione
edge: stazioni con km, passaggi per comune con km e coordinate, tempi della
sbarra con fonte. Nessuna tabella duplicata nel codice.

**La fiducia è dichiarata.** Ogni passaggio mostra se i tempi della sbarra sono
*misurati* lì (Ramella), *assunti* da una misura nello stesso comune (gli altri
sei di Loano) o *stimati* con valori prudenti perché nessuno ha ancora
cronometrato (Pietra Ligure). Dove non c'è misura, la sbarra risulta giù più a
lungo, apposta.

**Correzioni al modello trovate scrivendo le prove:**
- un treno in stazione non riparte mai prima dell'orario (stimarlo in anticipo
  metteva il transito prima del vero, dalla parte pericolosa);
- un treno registrato in arrivo ma non in partenza, con il passaggio a valle,
  **non viene dato per passato sulla stima**: la finestra resta aperta finché
  non arriva un fatto — partenza registrata, avvistamento RFI in stazione dopo
  l'arrivo (che è la ripartenza), o fermata successiva. Il 28/8/2026 il REG 12269
  è rimasto sette minuti a Loano oltre la sosta: il vecchio sito avrebbe dato
  verde con il treno ancora fermo prima del passaggio;
- risoluzione a 15 secondi invece che al minuto;
- la coda dietro il transito è un *minimo* di 2 minuti quando l'orario è stimato,
  zero quando è registrato: non si somma al margine.

**Niente proxy aperto.** `/vt/*` non esiste più: l'unico canale verso RFI è la
funzione edge con la sua cache.

## Cosa va dove nel repository

```
index.html                          il sito (generato da _build/, non modificarlo a mano)
linea.json                          i dati: stazioni, passaggi, tempi
percorsi-pietra.json                tabella dei percorsi a piedi di Pietra (griglia 50 m, 3 passaggi)
percorsi-loano.json                 ← DA COPIARE dal repo di Loano: è il percorsi.json attuale, rinominato
netlify.toml                        funzione edge + intestazioni
motore.js                           il motore (logica pura): lo importano funzione edge, prove e telefono
netlify/edge-functions/transiti.js  la funzione edge (rete + lettura), importa ../../motore.js
sw.js, manifest.webmanifest, icone, logo
prove.js                            prove del motore (37, con treni veri registrati)
prove-edge.mjs                      la funzione edge eseguita per intero con rete finta
prove-client.mjs                    il client in un browser simulato (jsdom)
controlla.py                        UN comando prima di caricare: sintassi, funzioni fantasma, [hidden], tutte le prove
_build/                             modello di index.html + testi legali + script che lo rigenera
```

## Prima di ogni caricamento

```
python3 controlla.py
```

Se dice `TUTTO OK: si puo' caricare`, si può caricare. Se dice altro, no.
Per le prove del client serve `npm install jsdom` una volta; senza, quella prova
viene saltata (le altre girano lo stesso).

## Cosa manca e cosa è da verificare

- **`percorsi-loano.json`**: copiare `percorsi.json` dal repository di Loano con
  il nuovo nome. Senza, a Loano i minuti a piedi vanno impostati a mano.
- **I passaggi di Pietra Ligure vanno visti da un umano**: vengono da
  OpenStreetMap, che per Loano aveva Ramella due volte e mancava di Lungomare
  Marconi. Nomi e posizioni sono in `linea.json`.
- **I tempi della sbarra a Pietra** sono prudenti (5:00 / 4:30 / 1:00) finché
  qualcuno non cronometra. Quando succede, si scrivono in `linea.json` sotto
  `tempi` del comune, con la fonte, e il sito passa da solo a "misurato".
- **Le sette sbarre di Loano scendono insieme o ognuna per conto suo?** Non lo
  sappiamo. Una misura a Isnardi (804 m dalla stazione) lo decide.
- **Al primo deploy guardare il log di Netlify**: la funzione edge importa
  `../../motore.js` con percorso relativo; se il bundler non lo risolvesse, il
  deploy fallisce in modo visibile e basta spostare `motore.js` dentro
  `netlify/edge-functions/` aggiungendo una regola redirect per `/motore.js`.
- I margini `pad` sono ancora euristiche (in `motore.js`, `interpola`). Il passo
  successivo è calibrarli dall'errore misurato: l'aggregatore vede ogni treno
  completare la corsa e potrebbe accumulare la distribuzione dell'errore per
  tratta. Serve memoria fra una chiamata e l'altra (Netlify Blobs).

## Dati

Treni: ViaggiaTreno (RFI), servizio pubblico non documentato, senza contratto.
Passaggi a livello e geometria della linea: OpenStreetMap. Percorsi a piedi:
OSRM di FOSSGIS (una richiesta al secondo, come da regole d'uso). I treni merci
non sono visibili: i loro dati di circolazione non sono pubblici.

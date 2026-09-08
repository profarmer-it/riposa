# Riposa — Motore di calcolo del dosaggio

Ogni valore è etichettato **CONFERMATO** (validato da Giulio o preso dal PDF gamma
piùLact 2026) o **DA DEFINIRE**. Aggiornato al 1 settembre 2026, dopo la revisione
scenario per scenario.

---

## 1. Dati che chiediamo all'allevatore

| # | Campo | Tipo | Perché serve |
|---|-------|------|--------------|
| 1 | Numero di cuccette | numero | è la base di tutto il calcolo |
| 2 | Numero di capi in mungitura | numero (opzionale) | se non conosce le cuccette: **cuccette = capi × 1,2** |
| 3 | Tipo di zona di riposo | materassino / buca a riempimento / lettiera permanente | determina il prodotto |
| 4 | Tipo di mungitura | sala / robot (AMS) | il robot abilita la proposta piùLact LA |
| 5 | Come riempie la buca | miscelata col carro / paglia lunga e spaglio | cambia completamente la dose |
| 6 | Materiale in cuccetta oggi | paglia, segatura, separato, digestato, canapulo, niente | compatibilità e confronto |
| 7 | Impianto biogas o biometano a valle | sì / no | argomento forte per PRONTO: resa metanigena del canapulo |
| 8 | Cellule somatiche medie attuali | numero, migliaia/ml (opzionale) | blocco "potenziale di miglioramento" |
| 9 | Contatto | nome, azienda, provincia, telefono, email | è il lead |

**Sul rapporto capi → cuccette.** 1,2 e non 1,05, e l'arrotondamento per eccesso è
voluto: 100 vacche in lattazione valgono 120 cuccette perché il conto deve tenere
dentro gli spazi delle asciutte e il prodotto che in azienda finisce comunque in sala
parto, infermeria e gabbiette dei vitelli.

---

## 2. Schede prodotto

### piùLact — *versatile, il prodotto principe*  ✅ CONFERMATO
- Zona di riposo: qualsiasi. Alcalinizza fino a 11 giorni, pH miscelata oltre 11
- Si usa tal quale o miscelato con paglia, segatura, separato, digestato
- Confezioni: big bag 600 kg, sacchi 25 kg
- **Miscelata in buca col carro: 20% piùLact + 40% paglia + 40% acqua, 35 kg di mix
  per cuccetta, ogni 7 giorni** → 7 kg di piùLact + 14 kg di paglia + 14 l di acqua
  (la scheda prodotto indica 9 giorni; usiamo 7 perché la settimana è il ritmo con cui
  ragiona il management della maggior parte degli allevamenti)
- **A spaglio (materassino, o buca riempita di paglia lunga): 0,5 kg per cuccetta,
  un giorno sì e uno no**

### piùLact LA — *long action · PREMIUM*  ✅ CONFERMATO
- **Solo materassino + mungitura robotizzata.** Non è il prodotto standard di quel
  caso: è la scelta premium per chi vuole granulometria più grossolana e rilascio
  lento, per ridurre gli ingressi in stalla, contenere il costo della manodopera,
  disturbare meno gli animali e ridurre il rischio di vacche in ritardo
- **0,5 kg per cuccetta, a spaglio, ogni 3 giorni**
- Confezioni: big bag 600 kg, sacchi 25 kg

### piùLact PRONTO — *canapulo + piùLact 80/20 · PREMIUM*  ✅ CONFERMATO
- **Materassino.** Un solo ingresso in stalla al posto di due: nella stessa passata
  distribuisci l'igienizzante e il lettime
- Doppia funzione: il canapulo assorbe fino a 5 volte il proprio peso specifico e
  tiene la cuccetta asciutta, il piùLact la alcalinizza
- Con biogas o biometano a valle, nel digestore il canapulo rende più del doppio
  della paglia
- **3 kg per cuccetta, a spaglio o con il carro, una volta a settimana**
- Confezioni: big bag da circa 300 kg

---

## 3. Albero decisionale

```
Zona di riposo?
│
├─ BUCA A RIEMPIMENTO
│   └─ Come la riempi?
│       ├─ MISCELATA COL CARRO → piùLact, 20/40/40, 35 kg mix/cuccetta ogni 7 gg   ✅
│       └─ PAGLIA LUNGA + SPAGLIO → piùLact, 0,5 kg/cuccetta, un giorno sì e uno no ✅
│
├─ MATERASSINO
│   └─ prima scelta, sempre → piùLact, 0,5 kg/cuccetta, un giorno sì e uno no       ✅
│      poi, come SCELTE PREMIUM calcolate sugli stessi numeri:
│      ├─ piùLact PRONTO, 3 kg/cuccetta una volta a settimana — sempre proponibile  ✅
│      └─ piùLact LA, 0,5 kg/cuccetta ogni 3 giorni — solo con mungitura a ROBOT    ✅
│
├─ LETTIERA PERMANENTE (rimossa e rifatta) · sale parto, vitellaia
│   └─ piùLact a spaglio, 0,05 kg per m²                                            ✅
│      frequenza: oltre 9 m²/capo ogni 3 giorni · sotto i 9 m²/capo un giorno sì e uno no
│
└─ COMPOST BARN (lettiera mai asportata, lavorata col coltivatore)
    └─ piùLact a spaglio, 0,05 kg per m², a ogni lavorazione → tutti i giorni       ✅
```

Sul materassino la app non sceglie al posto dell'allevatore: mostra il classico come
prima scelta e sotto le scelte premium già calcolate, con il loro perché. Sono
decisioni commerciali, non tecniche, e le prende chi ha la stalla.

---

## 4. Formule

**Il mese vale 30 giorni tondi**, non 30,4: i passaggi al mese vengono numeri puliti
(15 sullo spaglio, 10 con LA, 30 nel compost barn) e i conti restano verificabili a mente.
Con l'intervallo di 7 giorni i passaggi restano **4,29 e non 4 fissi**: chi distribuisce
ogni sette giorni lo fa 52 volte all'anno, non 48, e arrotondare per difetto lascerebbe
l'allevatore scoperto a fine anno. In trattativa si dice "una volta a settimana"; il
calcolo resta su 4,29.

```
cuccette            = input oppure round(capi × 1,2)

kgPerApplicazione   = cuccette × dosePerCuccetta
applicazioniAlMese  = 30 / frequenzaGiorni
kgAlMese            = kgPerApplicazione × applicazioniAlMese

sacchi25AlMese      = ceil(kgAlMese / 25)
bigBagAlMese        = kgAlMese / pesoBigBag      (600 kg; 300 kg per PRONTO)
```

Miscelata in buca col carro:

```
mixPerCuccetta      = 35 kg
piùLactPerCuccetta  = 35 × 0,20 =  7 kg
pagliaPerCuccetta   = 35 × 0,40 = 14 kg
acquaPerCuccetta    = 35 × 0,40 = 14 litri
```

---

## 5. Controllo di coerenza

Ogni scenario ridotto a **kg di piùLact puro per cuccetta al giorno**, con l'80% di
canapulo scorporato dal PRONTO. Stalla campione: 120 cuccette.

| Scenario | Dose | Ogni | kg/mese | piùLact puro kg/cucc/g |
|----------|------|------|---------|------------------------|
| Buca, miscelata col carro | 35 kg di mix | 7 gg | 3.600 | **1,00** |
| Buca, materiale e spaglio | 0,5 kg | 2 gg | 900 | **0,25** |
| Materassino, piùLact classico | 0,5 kg | 2 gg | 900 | **0,25** |
| Materassino, piùLact LA | 0,5 kg | 3 gg | 600 | **0,17** |
| Materassino, piùLact PRONTO | 3 kg | 7 gg | 1.543 | **0,09** |

La scala è monotona e segue esattamente il livello del prodotto: più si sale di
gamma, meno piùLact serve per proteggere la stessa cuccetta, perché il lavoro lo
fanno la formulazione a lento rilascio o il potere assorbente del canapulo. La buca
con la miscelata sta a parte, quattro volte sopra lo spaglio: lì non si spolvera una
superficie, si riempie un volume.

---

## 6. Le proposte di prova

Compaiono in fondo al risultato, e le vede anche l'allevatore.

- **Stalle con cuccette a materassino** → fornitura composta: **6 sacconi di piùLact
  + 2 di piùLact PRONTO** da provare in cuccetta.
- **Tutte le altre stalle** (buca, lettiera, compost barn) → **piùLact PRONTO nelle
  gabbiette dei vitelli**: grande potere assorbente e contrasto ai patogeni, un solo
  prodotto con due benefici. Quantità per dimensione, sui capi in lattazione:

  | Capi in lattazione | Sacconi di PRONTO |
  |---|---|
  | sotto i 300 | 2 |
  | da 300 a 600 | 4 |
  | oltre 600 | 6 |

Se l'allevatore ha indicato solo le cuccette, i capi si ricavano dividendo per 1,2.

---

## 7. Cosa resta aperto

1. **Il salto sulla soglia dei 9 m²/capo.** Regola a gradino: due lettiere quasi
   identiche possono differire del 50% nel consumo mensile. Valutata e **tenuta così**
   per adesso, decisione di Giulio del 1 settembre 2026.
2. **Numero WhatsApp aziendale** e **URL del form ActiveCampaign** da mettere in `CONFIG`.
3. **Prezzi**: fuori dal calcolatore pubblico per scelta, entrano nell'area agenti.

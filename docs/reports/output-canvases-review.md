# Canvas di output (Story 9:16 + WhatsApp 3:4): revisione del piano

Revisione di `docs/prompts/output-canvases-plan.md` (Parte 1 del brief `docs/prompts/output-canvases.md`), 2026-09-23.
Metodo: cinque revisori in sola lettura (geometria, doodle, crop/fit/lint, API/backend, editor/test), uno scettico
per area che ha provato a smentire ogni punto, un critico di completezza. Qui resta solo ciò che ha retto alla verifica.
Il piano rivisto che ne segue è quello eseguito sul branch `feat/output-canvases`; il report finale è
`docs/reports/output-canvases.md`.

## Parte 1 — Revisione

### 1. Cosa è sbagliato, mancante o rischioso

**Regola dei doodle: sbagliata.** `y + height − 1920` sposta di −480 tutta l'arte "canvas" della metà bassa.
- **Lo spark vicino alla pill.** Lo spark a (776, 1601.7) segue la pill, non il bordo del canvas. Con −480 finisce a y≈1122: sopra il chip Cost e sulla riga extras (lo stress test ne ha 4), ~200 px sopra la pill. Nessuno spostamento unico sistema insieme blob e spark.
- **I blob.** Seguono davvero il bordo, e con −480 vanno bene. Misurato sull'inchiostro: stanno stretti accanto ad ask e matita, da controllare a occhio.
- **`PROTOTYPE_DOODLES`.** Gli spark in alto (y 74/112, metà alta, quindi non spostati) cadono sull'icona calendario e sull'eyebrow, e nel box headline. L'icon-clock finisce sulla riga dell'ask. In pratica il set è estinto: la migrazione 2 lo converte in SQLite, e gli store JSON nascono da copie già migrate o dai seed.
- **"Gli spark sono già ancorati alla foto".** Vero ma incompleto. Con lati a 40 gli angoli del band vanno a x 40/1040, e ~6 px di inchiostro pieno dello spark giallo escono dal canvas su ogni flyer di default. Servono lati ≥ 46, oppure un'ancora rientrata.
- **È un'euristica di posizione.** Ha un salto a y=960, e lo step 7 (drag) non avrebbe un inverso univoco.
- **Opzione "ancora esplicita salvata"** (`bottomLeft`/`bottomRight`/`floor` in `DoodleAnchorSchema`). Costi:
  - l'enum si propaga con `npm run gen` a `flyer.schema.json`, `storage.schema.json` e `seed/samples.json`, con 0 righe PHP;
  - i flyer salvati vanno migrati: una migrazione SQLite 3 **più** il primo runner di migrazioni JSON, in Node **e** in PHP (oggi non esiste, vedi `docs/json-storage.md`);
  - i dati diventano forward-only, e il rollback di `docs/deploy.md` si rompe: il vecchio `Flyer.tsx` esegue `photoAnchors(mode)['floor']`, che dà un TypeError, cioè editor bianco su PHP e 500 su Node;
  - la migrazione 2 importa il `DEFAULT_DOODLES` *vivo*: cambiarne la forma cambia una migrazione già applicata.

**Un solo crop va bene in due cornici solo se hanno lo stesso rapporto d'aspetto.**
- `photo.ts` è omogeneo nella dimensione della cornice: stesso aspetto vuol dire stessa porzione di foto (errore misurato 5e-13).
- Il band 940×380 contro 1000×380 del piano non ha lo stesso aspetto:
  - un "flush top" fatto sulla story perde 12 px su WhatsApp;
  - "Whole photo" premuto su un canvas non è intero sull'altro (strisce di ~11 px);
  - il crop viene clampato sulla cornice a schermo, quindi trascinare su un canvas può riscrivere in silenzio l'altro (zona morta misurata fino a 40 px).
- Nessun campione e nessun test usa un crop non centrato, quindi la verifica prevista non se ne accorgerebbe.

**Fit e lint.**
- **Bug nel piano.** Cambiando canvas la Preview non ricalcola né la scala (effetto con deps `[]`) né il fit (deps `[data, hostel]`). Font, avviso "testo tagliato" e scala restano quelli del canvas precedente, quindi l'anteprima non è più il download. Basta mettere `canvas` nelle dipendenze: `fit.ts` riazzera da solo, non serve un remount.
- **Box più grandi non garantiscono l'assenza di tagli.** Il fit a due passate lascia il testo più grande nel box più largo, e quel testo poi chiede più altezza. Il "niente tagli su tutti i canvas" è dimostrabile solo con larghezze uguali e altezze ≥ di quelle della story. Altrimenti bisogna fittare anche il canvas non visibile: lo stesso `<Flyer>` montato nascosto, ~30 righe, lavoro doppio a ogni tasto.
- **Lint.** Le regole di `copyRules.ts` non dipendono dalla geometria, quindi restano uniche.
- **Lunghezze massime.** Quelle di `schema.ts` sono tarate su 940 px e valgono per ogni canvas con colonna ≥ 940. Manca un test che lo dica.

**API.**
- **Nome.** `canvas` va bene e non si scontra con `format` (png/jpg). Stesso nome nel body, nella query della render page e nei tipi.
- **Default.** Assente o `null` vuol dire story, come `format` (`?? 'png'`). Stringa vuota, non-stringa o id sconosciuto danno 400 `bad_canvas`, controllato dopo `format`, con `Object.hasOwn`: `in` farebbe passare `__proto__` e produrrebbe un 500.
- **Il test `bad_canvas` non può stare nel contract suite, come dice il piano.** Lì Node gira senza renderer (`tests/contract/setup/node.ts`) ed `errors.test.ts` salta l'export. Va in `tests/render/render.spec.ts`, più un test unitario.
- **Cache.** `canvas` va nel nome del file creato dal renderer, `${id}-${canvas}-${key}.${format}`. L'invalidazione per prefisso `id-` resta valida.
- **La render page deve dichiarare il canvas disegnato** (`data-canvas`), e il renderer deve verificarlo. Se il parametro venisse letto male uscirebbe un ritaglio 1080×1440 della story, che supera ogni controllo di dimensione.
- **`npm run gen`.** Rigenera solo la tabella errori e `schema/shared.json`, che `ErrorCatalog.php` legge da sé: 0 righe PHP. La prosa di `docs/api-contract.md` (body, "immagine 1080 × 1920", nome file) va aggiornata a mano.
- **PHP.** Non ha una rotta export (exporters `['client']`), quindi nessun codice PHP. `/api/config` non deve annunciare i canvas: il registro arriva già con il bundle dell'editor.
- **Nome file.** Il piano rinomina anche il download story. Propongo di lasciarlo `<slug>.png` e di mettere il suffisso solo sugli altri canvas (`<slug>-whatsapp.png`): niente cambia per lo staff, e i test esistenti restano validi.

**Punti che assumono ancora 1080×1920 o 70 px, e che il piano non nomina.**
- `Flyer.tsx`: `left/right: 240` della riga senza foto (una copia di `layout.ts`) e l'etichetta dell'overlay "Safe zone · 940 × 1370" a 78/258.
- `Preview.tsx`: la maniglia della foto (usa `ACTIVITY.photoBleed/photoBand`) e i `PhotoControls` in `Editor.tsx` (cornice story per zoom, "Whole photo", "Centre").
- `tests/render/pixels.ts`: W/H sono costanti, e pixelmatch va in errore su un 1080×1440.
- `render.spec.ts`: :86/:100/:148 e il viewport.
- `shared.test.ts`: :74-79 (floor 1620), :148-155 (spark), :81-85 (WEEK).
- `docs/deploy.md`, passo 5: "controlla che sia 1080 × 1920".
- I commenti in `layout.ts`, `render/main.tsx`, `renderer.ts`, `Preview.tsx`, `ClientExporter.tsx`, `export/types.ts`.
- **Solo story per natura, da non cambiare** (basta dirlo): `scripts/compare-design.ts` e `playwright*.config.ts`. Nessuno renderizza WEEK: resta solo story (lo step 8 è fuori scope).
- **Il piano sbaglia la somma verticale.** Lo stack "spostato su di ~210" non entra: dall'eyebrow al fondo della pill sono 1366 px, mentre WhatsApp a 40/40 ne ha 1360. Con il band 1000×404 (quello che il crop richiede) il deficit sale a ~30 px.

**SOLID/DRY.**
- **Un solo registro.** `CANVASES` sta in `layout.ts`; `CanvasId` e `isCanvasId` ne sono derivati. Niente enum zod copiato a mano.
- **Nessun default "story" silenzioso dentro la pipeline.** `canvas` è obbligatorio su `<Flyer>`, `FlyerExporter`, `Renderer` e `flyerFilename`. Il default vive solo ai bordi (body API, query della render page).
- **Exporter sostituibili.** Entrambi prendono la stessa richiesta `{id, format, canvas}`. Non si crea nessun secondo renderer.

**La story "pixel-identica a oggi" non si può dimostrare con i test esistenti.**
- Non ci sono golden su disco.
- `fidelity.spec` confronta client e server *dello stesso codice*: il "golden" è il render del server fatto durante il test. Un errore che colpisce entrambi passa.
- `render.spec` coglie solo un gruppo che esce da 70..1010 × 250..1620.
- Serve una baseline catturata sul commit attuale.

**Altro.**
- **Il tuning scriverebbe nella libreria vera.** Fatto alla lettera (`npm run seed:samples` e download in Chrome), scrive 6 flyer con foto segnaposto non licenziate in `./data`, la libreria che il passo 5b di `deploy.md` copia sull'host. In più ogni download salva il flyer.
- **Due campioni sono senza foto** (stress test e Paragliding): in bleed/band il download resta disabilitato finché non si carica una foto.
- **Il gate "done" non include `npm run test:php`.** È PHPUnit che fa passare tutti i campioni nel validatore PHP, cioè la prova del "nessuna regola PHP copiata".
- **Mancano i due report richiesti.**
- **Step 7 (fuori scope).** Gli override dx/dy salvati saranno condivisi da tutti i canvas. Va annotato.
- **Riferimento non usato.** `design/Nest Activity Flyer Hand-Drawn.dc.html` è la versione 1080×1350 del designer: lati 60, pill a 44 dal fondo, blob agli angoli scalati ~0,78, tipografia ~17% più piccola. È un buon punto di partenza per il tuning, non un vincolo.

### 2. Cosa cambierei nel piano, e perché

1. **Doodle: niente euristica, ma ancore esplicite solo al momento del render.** Nessun dato salvato cambia.
   - `artAnchors(canvas, mode)` dà per ogni canvas i punti photoLeft, photoRight, bottomLeft, bottomRight e floor.
   - `defaults.ts` dichiara quale ancora segue ogni pezzo del set di default.
   - `resolveDoodles()` riconosce il set di default intatto (`sameDoodles`) e lo riesprime con quelle ancore. Gli offset sono derivati, non riscritti a mano, e per la story il risultato è bit-identico (verificato).
   - Costo: nessun cambio di schema, nessuna migrazione, rollback sicuro, 0 righe PHP.
   - Perché: sistema lo spark della pill e i blob insieme, senza costringere a scrivere un runner di migrazioni JSON in due linguaggi.
   - Limite: l'arte "canvas" non di default (oggi solo via API) si disegna alle coordinate assolute.
   - Quando lo step 9 salverà ancore nuove, estenderà l'enum con un id di migrazione JSON, così una release vecchia rifiuta lo store invece di rompersi.
2. **Invariante della foto.** Per ogni modalità, la cornice ha lo stesso aspetto su ogni canvas (bleed 1080:380, band 47:19), ed è coperto da un test. Così un solo crop è davvero giusto ovunque.
3. **Margini di WhatsApp decisi per primi.** Decidono insieme crop, fit, spark e deficit verticale (vedi la decisione sotto).
4. **Preview.** Correggere le dipendenze. La copertura del fit su tutti i canvas segue la scelta dei margini.
5. **API come sopra.** `bad_canvas` testato in `render.spec`, `data-canvas` verificato, nome file della story invariato.
6. **Baseline della story** catturata prima del primo cambiamento, e confronto esatto alla fine.
7. **Test per canvas** (elenco sotto). `test:php` entra nel gate. Istanza di prova per il tuning. Aggiornare `deploy.md` e `api-contract.md`. I due report.

---

## Decisione di Artur: i margini laterali di WhatsApp

| | Lati | Sopra/sotto | Colonna testo | Band foto | Fit | Spark agli angoli | Spazio verticale |
|---|---|---|---|---|---|---|---|
| **A** | 70 | 35/35 | 940 | 940×380 | identico per costruzione, un solo avviso | come la story | lo stack della story sale di 215, invariato |
| **B** | 60 (come il 1350 del designer) | ~40 | 960 | 960×388 | per canvas (montaggio nascosto) | ok | mancano ~14 px (dal respiro dell'eyebrow) |
| **C** | 40 (come il brief) | 40/40 | 1000 | 1000×404 | per canvas (montaggio nascosto) | giallo tagliato, serve un'ancora rientrata | mancano ~30 px (eyebrow 95→65) |

**Scelta di Artur (2026-09-23): C, lati 40, sopra e sotto 40.** La raccomandazione era A. La scelta C porta con sé questi vincoli, che il piano rispetta.

- **Colonna e safe box.** Colonna testo 1000 (x 40..1040), safe box 40..1040 × 40..1400. La colonna è ≥ 940, quindi le lunghezze massime valgono senza cambiarle.
- **Foto.**
  - Il band è 1000×404, così tiene l'aspetto 47:19 e il crop resta identico. Se il budget verticale lo richiede, può essere più stretto e centrato, sempre 47:19.
  - Il bleed resta 1080×380, allineato al fondo del band. Così chips, extras, ask e pill restano condivisi da tutte le modalità, come oggi.
- **Budget verticale.** Allocato dal basso a partire dal floor 1400, come fa la story dal 1620. Il deficit è di ~35 px e va recuperato dalle parti non fittate: l'aria dell'eyebrow (62 px di contenuto in un box da 95) e i gap (foto→chips 18, extras→ask 24, ask→pill 12). Nessun box fittato (headline, chips, extras, ask) scende sotto l'altezza che ha nella story.
- **Spark agli angoli della foto.** Le ancore photoLeft/photoRight di WhatsApp sono rientrate rispetto agli angoli del band, di ~14 px, a partire da x 54/1026, da tarare. Nel bleed seguono il bordo superiore della foto. Tutto l'inchiostro resta sul canvas (lo verifica un test).
- **Fit.** Le larghezze sono diverse, quindi l'editor fitta anche il canvas non visibile: lo stesso `<Flyer>`, montato nascosto. L'avviso di taglio dice quale canvas taglia.


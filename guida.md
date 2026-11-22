# Guida Operativa — Task Tracker Uff. OI

Sistema collaborativo multi-utente su rete locale (LAN) basato su File System Access API, senza necessità di server o database esterni.

---

## 1. Primo Avvio e Configurazione (Amministratore)

L'inizializzazione del database condiviso deve essere eseguita **una sola volta** tramite il file di setup dedicato:

1. **Apri il file:** Fai doppio clic su [`TaskTracker_AdminSetup.html`](file:///c:/Users/Nuno/Music/TaskTracker_OI/TaskTracker_AdminSetup.html) con **Microsoft Edge** o **Google Chrome**.
2. **Inizializza l'archivio:**
   - Clicca su **📂 Connetti Cartella Condivisa in Rete**.
   - Seleziona la cartella condivisa sul server di rete dell'ufficio (es. `\\Server\Uff_OI\DB`).
   - Il sistema creerà in automatico la struttura (`tasks/`, `logs/`, `users.json`, `db-config.json`).
3. **Primo Login:**
   - Seleziona l'utente **Admin** e inserisci il PIN predefinito: `0000`.
4. **Crea gli Utenti dell'Ufficio:**
   - Nella barra laterale sinistra in basso, clicca su **⚙️ Gestione Utenti (Admin)**.
   - Crea gli account per gli operatori assegnando Nome, Sezione di appartenenza (`NATO`, `UE`, `ONU`, `FOI`), Ruolo (`Utente Sezione` o `Amministratore`) e un PIN di accesso.
   - *(Opzionale)* Dalla stessa finestra puoi importare le pratiche dal vecchio archivio Excel tramite **📊 Importa Vecchio Excel (.xlsm)**.
5. **Messa in Sicurezza:**
   - Una volta completato il setup, **archivia o rimuovi** [`TaskTracker_AdminSetup.html`](file:///c:/Users/Nuno/Music/TaskTracker_OI/TaskTracker_AdminSetup.html) dalla condivisione comune per impedire reinizializzazioni accidentali.

---

## 2. Accesso Quotidiano (Utenti Operativi)

Tutti gli operatori dell'ufficio lavorano esclusivamente con il file principale:

1. **Apri l'applicazione:** Apri [`TaskTracker.html`](file:///c:/Users/Nuno/Music/TaskTracker_OI/TaskTracker.html) con **Microsoft Edge** o **Google Chrome**.
2. **Connessione Archivio:**
   - **Primo accesso:** Clicca su **📂 Connetti Cartella Condivisa in Rete** e seleziona la cartella del DB indicata nella schermata (es. `\\Server\Uff_OI\DB`).
   - **Accessi successivi:** Se hai già aperto la cartella in precedenza, comparirà il pulsante verde **⚡ Riconnetti a [Nome Cartella] (1 clic)**.
3. **Login Utente:**
   - Seleziona il tuo nominativo dal menu a tendina.
   - Inserisci il tuo **PIN** e premi Invio o clicca su **🔐 Accedi**.

---

## 3. Gestione Pratiche e Task

### Creazione di un Nuovo Task
- Clicca sul pulsante blu **+ Nuovo Task** in alto a sinistra.
- **Codice Interno:** Generato automaticamente con prefisso sezione e anno (es. `N26-001` per NATO 2026, `U26-001` per UE, ecc.).
- **Campi Principali:**
  - *Sezione:* NATO / UE / ONU / FOI (modificabile solo se sei Admin; gli utenti standard sono vincolati alla propria sezione).
  - *Oggetto:* Descrizione dell'atto o pratica.
  - *Priorità:* Ordinario, Urgente, Critica / Flash.
  - *Classifica:* Non Classificato, Uso Ufficiale, Riservato, Riservatissimo, Segreto.
  - *Livello Approvativo:* CS, CU/VCU, VCR, CR, SCa.SMD, Ca.SMD, UG, Altro.
  - *Scadenza e Ora:* Data limite e orario di consegna.
  - *N° ATO e Protocollo:* Riferimenti interni/esterni.
  - *Link / Percorso Allegato:* Collegamento a file o cartelle. Se inserisci un link web (`https://...`), si apre direttamente nel browser; se inserisci un percorso cartella Windows o di rete LAN (es. `C:\Users\...\Cartella` o `\\Server\Condivisione\...`), il pulsante **`Apri`** ne copia all'istante il percorso negli appunti di Windows: basta premere `Win + R` e poi `Invio` (oppure incollare in Esplora File) per accedere direttamente alla cartella originale senza creare copie duplicate.
- **Anti-Duplicati:** Se inserisci un N° ATO, Protocollo o Oggetto simile a pratiche già esistenti nell'archivio, comparirà un avviso arancione immediato prima del salvataggio.

### Modifica ed Eliminazione
- **Regole di Modifica:** Ogni utente può modificare o eliminare solo le pratiche della propria sezione. Le pratiche di altre sezioni sono consultabili in sola lettura (badge 🔒). L'Admin può modificare tutte le sezioni.
- **Verifica Intermedia (-7gg):** Per pratiche con durata $\ge 7$ giorni compare l'avviso di controllo intermedio; un clic su **✓ Verif.** convalida il passaggio.

---

## 4. Barra Laterale Unificata e Viste Operative

La barra laterale sinistra è **comprimibile ed espandibile** (tramite il pulsante `▶ / ◀` o cliccando sull'emblema):
- **Stato Compatto (56px):** Mostra solo le icone per massimizzare la larghezza di lavoro di Kanban e Tabelle.
- **Stato Esteso (210px):** Mostra icone e descrizioni estese di tutte le funzioni, memorizzando la preferenza nel browser.
- **Palette Tenue & Coerente:** Design pulito a fondo chiaro/scuro coerente con il resto dell'applicazione.

Dalla barra laterale puoi accedere alle **4 Viste Principali**:
1. **Kanban (☑️):**
   - Vista a schede con codice colore per urgenza e scadenza.
   - **Doppio Raggruppamento:** Usa lo switch in alto per visualizzare le colonne **Per Stato** (*Da iniziare*, *In lavorazione*, *Verifica / Pronti*, *Completati*) oppure **Per Sezione** (*NATO*, *UE*, *ONU*, *FOI*).
   - **Drag & Drop:** Trascina una scheda da una colonna all'altra per aggiornarne istantaneamente lo stato.
2. **Tabella (📋):**
   - Vista elenco completa con colonne ordinabili con un clic su Codice, ATO, Scadenza, Priorità o Stato.
3. **Calendario (📅):**
   - Viste *Mensile* (con celle di riempimento per mese precedente/successivo) e *Settimanale a slot di 30 minuti* (07:30 - 20:00).
   - Calcolo automatico delle festività italiane.
   - Sposta scadenze e orari trascinando le pratiche direttamente nei giorni o negli slot desiderati.
   - **Navigazione tra Mesi nel Drag & Drop:**
     - *Hover sui pulsanti:* Passando con il task sopra i pulsanti **`Succ. ▶`** o **`◀ Prec.`** (sosta di 450ms), il calendario sfoglia il mese mantenendo attivo il trascinamento per posizionarlo su qualunque giorno.
     - *Rilascio diretto:* Rilasciando il task direttamente sui pulsanti `Succ. ▶` o `◀ Prec.` la scadenza slitta di 1 mese avanti/indietro.
     - *Auto-follow:* Rilasciando un task sui giorni di contorno del mese successivo o precedente, la vista del calendario segue la pratica aprendo automaticamente il mese di destinazione.
4. **Statistiche (📊):**
   - Indicatori KPI in tempo reale: totale pratiche, tasso di completamento, attive.
   - Grafici di andamento mensile, carico per sezione, livelli approvativi e tipologie.
   - Pulsante **🖨️ Stampa / PDF** per generare il report da presentare ai briefing.

---

## 5. Filtri, Notifiche e Strumenti di Rete

- **Filtro Sezioni (Topbar):** Situato in cima alla barra filtri, mostra conteggi in tempo reale per sezione (`Tutte le Sezioni`, `🔵 NATO`, `🟡 UE`, `🟣 ONU`, `🟢 FOI`).
- **Archivio per Anno (📁 nella barra laterale):** Un clic sull'icona apre un popover con gli anni storici disponibili senza occupare spazio fisso. Se sposti un task in un anno diverso, i filtri si riallineano automaticamente.
- **Barra di Ricerca:** Filtra istantaneamente per testo libero su codice, oggetto, ATO, protocollo e note.
- **Filtri Rapidi:** Menu a tendina per tipologia documento, approvatore, stato e ordinamento.
- **Completati (👁️):** Il pulsante *Completati* consente di nascondere o mostrare le pratiche chiuse.
- **Campanella Notifiche (🔔):** Mostra il conteggio e filtra in un clic le pratiche scadute o con scadenza critica $\le 48$ ore.
- **Avatar Profilo Utente (Topbar):** Chip circolare compatto con le iniziali dell'operatore (es. `LU`) e tooltip descrittivo al passaggio del mouse con nome esteso e sezione, affiancato dal pulsante **Esci**.
- **Tema Chiaro / Scuro (🌙 / ☀️):** Selettore rapido in fondo alla barra laterale per alternare tra la modalità chiara e la modalità scura ("Institutional Steel"), con persistenza automatica della preferenza.
- **Registro Cronologia (📜):** Traccia ogni singola azione (creazione, modifica, spostamento, eliminazione) con timestamp, utente e dettagli. Esportabile in CSV.
- **Backup & Esportazione:** Dalla barra laterale clicca su **⬇️ Esporta Excel** per scaricare l'intero database in formato `.csv` compatibile con Excel (`export_task_OI_YYYY-MM-DD.csv`).
- **Ripristino & Importazione Backup CSV:**
  1. Accedi con un account **Admin** (es. `Admin` con PIN).
  2. Apri la barra laterale in basso e clicca su **⚙️ Gestione Utenti (Admin)**.
  3. Nel riquadro in fondo (*Importazione Dati & Backup*), clicca su **📥 Importa Backup CSV**.
  4. Seleziona il file `export_task_OI_*.csv`. Il sistema esegue l'upsert automatico: aggiorna le pratiche esistenti (confrontando codice e sezione) e inserisce come nuove quelle mancanti, registrando l'operazione nell'Audit Log.

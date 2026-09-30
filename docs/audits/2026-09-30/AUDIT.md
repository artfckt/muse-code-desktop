# Audit complet: Muse Desktop 0.5.0-beta.1

Data: **30 septembrie 2026**
Cod analizat: **ab7f3658f8c509b984de0310b632f0d2be390da9**
Platformă de audit: VPS Linux, Chromium/Playwright, Electron **38.8.6**, Muse CLI în mediu izolat cu provider echo.

## Verdict

Aplicația are o direcție vizuală coerentă și funcțiile de bază ale unui client desktop Muse. Totuși, recomand păstrarea statutului beta până la rezolvarea problemelor de integritate a conversațiilor și actualizarea Electron.

Cele mai importante probleme afectează destinația mesajelor, păstrarea drafturilor, consistența istoricului, transmiterea documentelor către skills și contextul terminalului. Designul este plăcut în fereastra implicită, dar densitatea depinde prea mult de text mic. Interfața are probleme de contrast, navigare cu tastatura și adaptare la fonturi/panouri mărite.

**49 de teste existente trec**: 21 backend și 28 UI. TypeScript și buildul rendererului trec. Auditul adaugă **34 de observații reproductibile**, fără erori ale instrumentelor în rezultatele finale. Aceste observații includ defecte, măsurători și verificări pozitive; nu reprezintă 34 de defecte.

Priorități folosite:

- **P1:** înainte de extinderea distribuției; integritatea datelor/contextului sau securitatea runtimeului.
- **P2:** următorul ciclu beta; utilizabilitate, recuperare, accesibilitate și performanță.
- **P3:** consistență și îmbunătățiri de produs.
- Nu a fost demonstrată o vulnerabilitate P0 sau executarea de cod printr-un răspuns Muse.

GUI-ul utilizează același motor Muse, dar nu reproduce încă toate comenzile CLI ca fluxuri grafice. /rewind, /export, /goal, /plugins și /logout sunt transferate către terminal. Terminalul integrat are propriul proces și propria conversație nativă; transferul unei comenzi nu garantează că aceasta operează asupra chatului GUI selectat. Pentru operațiile de istoric, oferă un flux GUI sau explică și sincronizează explicit sesiunea destinație. Catalogul actual este în [command-catalog.cjs](../../../electron/command-catalog.cjs).

## Acoperire și limite

| Zonă | Ce am verificat | Rezultat |
|---|---|---|
| Chat și sesiuni | Creare, folder/no folder, reluare, streaming, loading, schimbări rapide, drafturi, follow-up | Fluxurile normale trec; F01–F04, F07 și F13 necesită corecții |
| Muse/native desktop | SDK, hosturi izolate, permisiuni, terminal, media locală, shutdown | Baza este funcțională; F05, F06, F17 și F20 |
| Autentificare | Codul care reutilizează CLI, filtrarea API key, teste de login/device-code și stări de cont | Integrarea existentă este verificată prin cod/teste; loginul real cu abonamentul utilizatorului rămâne de validat |
| Subscription usage | Refresh, valori parțiale, absența datelor, evenimente vechi, schimbarea contului | Refresh citește observații; F08 |
| Fișiere/media | Upload, persistare, documente + skill, batch mixt, limite, manifest, media protocol | F04, F06, F16, F18 și F22 |
| Activity și agents | Detalii fixate, liste, navigare, disponibilitate, fereastră separată, loading și temă | Detaliile rămân sus; F14–F15 și recomandările de design |
| Teme/fonturi | Toate cele 6 teme, culori custom, sistem, fonturi, mărimi maxime | Funcțiile normale trec; contrastul și adaptarea necesită corecții |
| Accesibilitate | axe-core 4.13.0, focus, Escape, ARIA, contrast, ținte de click | F09–F12 |
| Performanță | 100, 500 și 2.000 mesaje în rendererul de producție, hosturi reținute | Degradare măsurabilă; F13 și F17 |
| Build/distribuție | Lockfile, npm audit, build renderer, installer existent, workflow Windows | Buildul trece; Electron și tooling necesită actualizare |
| Documentație | README, versiune beta, explicațiile atașamentelor și usage | Documentația descrie corect limitările principale; completări recomandate |

Testele UI folosesc bridge-ul de test și date sintetice. Verificările native folosesc Muse CLI real, provider echo și directoare temporare, fără cereri către un model plătit și fără folosirea contului utilizatorului. Verificarea protocolului media citește exclusiv o imagine sintetică de 68 bytes.

Capturile și ultimele probe UI folosesc **buildul de producție** servit local. Fontul DM Sans este încărcat în verificările vizuale. Măsurătorile de performanță sunt din browserul headless pe VPS; nu sunt un benchmark pentru orice calculator Windows.

[Workflowul Windows existent](https://github.com/artfckt/muse-code-desktop/actions/runs/36741473271) validează buildul și aplicația împachetată. În acest audit nu am refăcut instalarea pe un calculator Windows fizic, DPI/monitor multiplu, cititorul de ecran Windows sau loginul cu abonamentul real.

Imaginea atașată în conversație, image(7).png, nu a putut fi accesată. Concluziile vizuale se bazează pe aplicația rulată și capturile de aici.

## Probleme P1

### F01 — Draftul și atașamentele trec în alt chat

**Confirmat din UI.** Deschide Chat A în proiectul A, scrie un draft și atașează private-A.md, apoi deschide Chat B în proiectul B. Textul și fișierul rămân în composer. Trimiterea folosește sessionId B.

Impact: utilizatorul poate trimite conținut destinat altui proiect în conversația greșită.

Cauză: stările prompt și images sunt comune; loadSession nu păstrează un draft per sesiune și nu schimbă atașamentele împreună cu sesiunea. Schimbarea proiectului prin hydrateWorkspace, în schimb, le șterge.

Corecție: drafturi separate după sessionId și după contextul conversației noi, inclusiv atașamente. Afișează proiectul destinație lângă composer. Testează A → B → A și schimbarea proiectului înainte de trimitere.

Surse: [App.tsx, loadSession](../../../src/App.tsx#L466), [hydrateWorkspace](../../../src/App.tsx#L387).
Dovadă: observations.json → draft-cross-chat, [captură](draft-cross-chat.png).

### F02 — Încărcări suprapuse amestecă istoricul și proiectul

**Confirmat din UI, prin navigarea folosită de notificări.** Pornesc încărcarea A cu răspuns întârziat, apoi B cu răspuns rapid. După terminarea ambelor: sidebarul selectează B, breadcrumbul arată A / Chat B, iar transcriptul conține History belonging to A.

Sidebarul blochează o parte dintre interacțiuni prin busy; callbackul onNavigateSession poate declanșa încărcări suprapuse. Același busy boolean nu reprezintă corect mai multe operații în curs.

Impact: transcript, permisiuni/model și contextul vizual pot aparține altei conversații decât sesiunea activă.

Corecție: generație/token de încărcare, verificat înaintea fiecărei actualizări de state, buffer de evenimente per sesiune și ignorarea răspunsurilor depășite. Păstrează busy/loading per operație.

Surse: [App.tsx](../../../src/App.tsx#L466), [onNavigateSession](../../../src/App.tsx#L1055).
Dovadă: observations.json → history-response-race, [captură](history-race.png).

### F03 — Textul introdus cât timp trimiterea așteaptă confirmarea se pierde

**Confirmat din UI.** Trimit First message, mențin promisiunea sendTurn în așteptare, apoi introduc Next message typed while request is pending. La confirmarea primei trimiteri, noul text devine gol.

Impact: pierdere de muncă și follow-up nesigur pe conexiuni lente. Atașamentele adăugate în această perioadă au aceeași vulnerabilitate la ștergerea globală.

Corecție: separă snapshotul trimis de draftul următor. Curăță draftul capturat la momentul trimiterii sau doar dacă versiunea sa nu s-a schimbat; nu șterge necondiționat composerul după await.

Sursă: [App.tsx, sendPrompt](../../../src/App.tsx#L640), în special liniile 788–789.
Dovadă: observations.json → draft-ack-loss.

### F04 — Documentele atașate unui slash skill nu ajung în inputul Muse

**Confirmat din payload și codul hostului.** Atașez requirements.md și trimit /plan follow requirements. Payloadul conține skill, dar text este gol și images este gol. attachmentIds servește persistării desktop, nu inputului nativ.

Impact: documentul apare atașat în GUI, dar skillul nu primește calea sau extrasul. Videourile pierd și contextul textual al fișierului; imaginile/frames urmează separat inputul image.

Corecție: construiește contextul fișierelor independent de existența skillului și trimite-l în partea text. Verifică documente, imagini și video atât cu prompt normal, cât și cu skill.

Surse: [App.tsx, construirea payloadului](../../../src/App.tsx#L757), [MuseHost.sendTurn](../../../electron/muse-host.cjs#L271), [persistarea media](../../../electron/main.cjs#L483).
Dovadă: observations.json → skill-document-payload.

### F05 — „No folder” poate deschide terminalul în proiectul anterior

**Confirmat cu Electron și Muse CLI real în mediu izolat.** Creez o sesiune no-folder, conectez proiectul A, apoi reiau sesiunea no-folder. Sesiunea proiectată are noFolder: true și workspaceRoot gol; terminalStart pornește în proiectul A.

Impact: comenzi executate într-un proiect diferit de conversația afișată. Avertizarea din NativeTerminal verifică existența workspace, deci nu apare pentru contextul gol no-folder.

Corecție: rezolvă directorul terminalului din sesiunea selectată, inclusiv directorul real al no-folder. Pentru terminalul deja activ, arată întotdeauna contextul său și diferența față de chat. Păstrează confirmarea existentă de restart.

Surse: [main.cjs, terminal-start](../../../electron/main.cjs#L309), [resume-session](../../../electron/main.cjs#L467), [NativeTerminal](../../../src/NativeTerminal.tsx).
Dovadă: native-observations.json → no-folder-terminal-context.

### F06 — Electron vulnerabil și acces media între origini

**Confirmat în runtime; scenariu de securitate limitat și explicit.** Aplicația folosește Electron 38.8.6. muse-media este înregistrat cu supportFetchAPI, fără corsEnabled, și handlerul acceptă căi locale arbitrare pentru extensiile media suportate.

Într-o fereastră Electron de test, cu sandbox, fără Node integration și fără preload/bridge, o origine distinctă a primit status 200 și toți cei 68 bytes ai imaginii sintetice, aflate în afara directorului atașamentelor.

Acest rezultat corespunde [advisoryului oficial GHSA-v3j7-r9gq-3gjw](https://github.com/electron/electron/security/advisories/GHSA-v3j7-r9gq-3gjw). Electron 38.8.6 se află în intervalul afectat. Alte advisories sunt enumerate în dependencies-all.json; de exemplu [GHSA-h7rp-cf8h-j98x](https://github.com/electron/electron/security/advisories/GHSA-h7rp-cf8h-j98x), a cărui exploatare depinde de conținut executabil provenit din surse nesigure în fereastra cu bridge.

**Limita probei:** fereastra separată a fost creată de instrumentul de audit. Aplicația normală blochează navigarea și deschiderea ferestrelor interne. Nu am demonstrat că un mesaj Markdown obișnuit execută JavaScript sau că un website extern deschis în browser poate accesa acest protocol.

Corecție: upgrade la o versiune Electron suportată și remediată pentru advisories relevante, cu retestarea Windows/PTy/preload. Configurează corect politica între origini și autorizează accesul media după origine și rădăcini/fișiere aprobate. Nu considera simpla extensie a fișierului o autorizare.

Surse: [main.cjs, protocol](../../../electron/main.cjs#L23), [DesktopServices.serveMedia](../../../electron/desktop-services.cjs#L228), package-lock.json.
Dovadă: native-observations.json → native-versions și cross-origin-local-media-read.

## Probleme P2

| ID | Problemă și dovadă | Corecție / criteriu de acceptare |
|---|---|---|
| **F07** | Bootstrap respins sau ultimul folder șters lasă lista cu Loading projects and conversations… după ce operația a eșuat. Confirmat cu erori simulate, fără cereri rămase în curs. App.tsx:1018; observations: bootstrap-failure-spinner, deleted-project-spinner. | State distinct loading/error/ready, finalizare în finally, Retry vizibil și continuarea inventarului global când folderul salvat nu mai există. |
| **F08** | Usage vechi suprascrie o observație nouă (75% → 12%). După account/changed cu starea nativă loggedOut, panoul păstrează contoarele contului anterior. Confirmat în ambele fișiere de observații. App.tsx:834–855. | Observații ordonate după observedAtMs și asociate identității contului; reset imediat la schimbare/logout. Invalidează și cache-urile hosturilor, nu doar latestUsage din engine. |
| **F09** | Settings se deschide cu focusul pe butonul din fundal. Shift+Tab de pe Close dialog mută focusul la Open Muse usage. Escape într-un dropdown de font închide întregul Settings. Confirmat prin tastatură. App.tsx:1091, 2163; Select.tsx. | Dialog cu focus inițial, trap și restaurare; dropdownul consumă Escape înaintea dialogului. Verifică și Account, Rename și Help. |
| **F10** | Datele din chatul selectat nu ating contrastul pentru text mic în niciuna dintre cele 6 teme. axe confirmă 2,69–3,73:1. Porcelain are și titlu selectat la 4,45:1, toolbar de cod la 4,22:1. | Elimină opacity:0.75 de pe metadata, ajustează combinația de foreground/background și verifică minimum 4,5:1 pentru text normal. Nu modifica inutil paletele de bază Muse Dark/Graphite. |
| **F11** | Butonul collapse pentru proiect are 14×20 px și spațiu insuficient față de vecin. axe îl semnalează în toate temele. desktop.css:103. | Hit area minimum 24×24 px; recomand 28–32 px. Pictograma poate rămâne mică, paddingul asigură ținta. |
| **F12** | La font UI 16 px și panouri 420 px, taburile depășesc zona centrală: la lățime 1100, zona are 360 px, taburile cer 562 px; Agents/Rename ajung peste inspector. La 900 px se observă aceeași insuficiență. Documentul nu are overflow global, deci testul existent scrollWidth nu detectează problema. | Limitează panourile relativ la fereastră, protejează o lățime utilă a chatului și mută acțiunile secundare în meniu. Testează intersecția dreptunghiurilor și accesibilitatea fiecărui control. |
| **F13** | Istoricul complet este randat fără virtualizare, iar schimbarea promptului/delta reface mult din arborele transcriptului. La 2.000 mesaje: 28.231 elemente DOM și actualizare input de ~695 ms în producție pe VPS. | Separă state-ul composerului, memoizează mesajele finalizate și adaugă randare virtualizată/paginare păstrând selecția și poziția scrollului. Măsoară inputul și streamingul înainte/după. |
| **F14** | Finalizarea unui turn schimbă automat Activity în Conversation când autoCollapse este activ, deși utilizatorul inspectează Activity. Confirmat. App.tsx:940. | Auto-collapse se aplică grupurilor din transcript; tabul ales de utilizator rămâne stabil. |
| **F15** | Fereastra Agent arată Waiting for this agent’s first message… în timp ce istoricul încă se încarcă; zero indicatori loading. Follow system nu răspunde live la schimbarea dark/light. Nu are scroll automat/jump-to-latest ca fereastra principală. Loading/tema confirmate; comportamentul scrollului rezultă din cod. AgentWindow.tsx:33–50, 86, 178. | Reutilizează stările și comportamentul transcriptului principal: loading/error/empty, temă live, scroll și jump-to-latest. |
| **F16** | Upload mixt accepted.md + unsupported.exe salvează primul fișier, apoi afișează doar eroarea și zero atașamente. Eliminarea unui fișier din composer modifică doar state; nu există API/flow de ștergere a fișierului persistat. Batch-ul este confirmat; lipsa cleanup este verificată în cod. App.tsx:793, DesktopServices.saveAttachment. | Validare înaintea salvării, raport pe fișier și păstrarea celor acceptate sau rollback. Cleanup pentru fișiere nesent și gestionarea spațiului local. |
| **F17** | Fiecare chat vizitat rămâne cu hostul său în engine.sessions până la închiderea aplicației sau schimbarea CLI. În testul cu hostFactory: 20 chat-uri vizitate, 20 hosturi reținute, zero închise la navigare, plus control host. Este verificare de lifecycle, nu măsurare RSS. | Politică de suspendare pentru hosturi idle, fără turnuri/agenți și fără alte lease-uri; cache separat al transcriptului. Păstrează izolarea permisiunilor. |
| **F18** | Un manifest media corupt este tratat ca inventar nou gol. În test, fișierul salvat există, dar zero fișiere/sesiuni sunt recunoscute. Nu este demonstrată pierderea istoriei native Muse; se pierd legăturile desktop. DesktopServices:58–62. | Backup/validare de schemă și recuperare explicită. Păstrează manifestul corupt pentru diagnostic înaintea unei noi scrieri. |
| **F19** | CLI nedetectat lasă hero-ul obișnuit și Send activ; Locate CLI este ascuns în Settings. Mesajul Muse needs attention nu oferă o acțiune directă. Confirmat cu diagnostic simulat. | Onboarding contextual: Locate CLI, Open installation guide, Retry; pentru cont: Sign in. Composerul trebuie să explice starea înaintea unei trimiteri care va eșua. |
| **F20** | index.html nu definește CSP; helperul IPC ignoră event.senderFrame/sender; agentul primește bridge-ul complet. Confirmat din cod. Nu am demonstrat o injecție JavaScript. | CSP compatibil cu media/Markdown/Mermaid, validare sender/origin și capabilități minime per fereastră. Vezi recomandările oficiale Electron. |
| **F21** | npm audit semnalează 14 pachete: 13 high și 1 critical. tar și traseele electron-builder/rebuild/extract-zip țin în mare parte de build. Scanarea omit=dev raportează 0, dar aceasta exclude Electron, care se livrează utilizatorului. | Upgrade controlat de Electron și builder/dependențe tranzitive; retestarea Windows + VPS. Evaluează fiecare advisory după utilizare/platformă. Nu interpreta totalul npm ca număr de exploatări demonstrate ale installerului. |

Dovezi: [observations.json](observations.json), [extra-observations.json](extra-observations.json), [native-observations.json](native-observations.json), [dependencies-all.json](dependencies-all.json), [dependencies-runtime.json](dependencies-runtime.json).

Pentru F09, axe nu înlocuiește testarea manuală de focus. Pentru F11, rezultatele privind sugestiile acoperite de slash menu au fost excluse din concluzie: criteriul WCAG are excepții pentru conținut temporar acoperit de o interacțiune. Concluzia privind collapse se bazează pe ținta permanentă și spațiul măsurat.

## Probleme P3 și lacune de produs

### F22 — Limita extrasului textual este vizibilă doar în README

Fișierul original se păstrează integral, dar extrasul trimis este tăiat la 100.000 caractere și nu are indicator de truncation în obiectul atașamentului/UI. Testul cu 100.017 caractere păstrează markerul final în fișier, dar îl elimină din extras.

Arată dimensiunea, modul de transmitere și faptul că există un extras; oferă referința la fișierul complet. Opt fișiere mari pot produce un input textual foarte mare, fără buget agregat sau avertizare de context.

Sursă: [DesktopServices.saveAttachment](../../../electron/desktop-services.cjs#L109). Dovadă: native-observations → text-excerpt.

### F23 — Texte și semnale de context inconsecvente

Settings afișează ⌘ , pe Windows, deși combinația Ctrl este suportată. Un chat no-folder poate arăta Your next project / Open a folder to get started în inspector. Unele texte de lucru spun in your project și pentru no-folder. AgentWindow nu afișează versiunea/badge beta ca fereastra principală.

Corecție: text după platformă și context, denumire clară No folder, director local explicat concis, versiune beta disponibilă în toate ferestrele.

### F24 — Administrarea istoricului este incompletă

Interfața oferă căutare și rename, dar nu are un flux de arhivare/ascundere, export al conversației sau eliminare a unui proiect recent. Acestea sunt lacune de produs, nu încălcări demonstrate ale protocolului Muse.

Recomand un meniu contextual pe chat/proiect. Arhivarea în GUI trebuie diferențiată clar de ștergerea istoricului nativ. Adaugă export și copiere pentru mesajele utilizatorului, precum și păstrarea draftului și a poziției de scroll per chat.

## Audit de design UI/UX

### Direcția vizuală

Muse Dark și Graphite au o bază bună: suprafețe calme, accent discret, iconografie consecventă și conversația în centru. Porcelain/Aurora/Botanical/Orchid sunt recognoscibile și schimbarea lor funcționează.

Compacitatea ar trebui obținută prin prioritizarea informației și reducerea elementelor repetitive. Datele de 9 px, helper textul foarte mic și țintele mici reduc confortul. Recomand titluri de chat 12–13 px, metadata 11–12 px și rânduri compacte de aproximativ 30–34 px, cu ținte de click mai mari decât pictogramele.

| Suprafață | Evaluare | Direcție recomandată |
|---|---|---|
| Projects & chats | Structură clară, dar numele și data concurează pe același rând; contrastul metadata este insuficient | Titlu prioritar, timp relativ scurt, status lângă icon, meniu contextual și tooltip cu calea completă; foldere cu același basename trebuie diferențiate |
| Conversation | Textul răspunsurilor și blocurile de cod sunt bine delimitate; composerul are multe controale permanente | Model vizibil; reasoning/permissions/follow-up grupate într-un meniu de opțiuni, cu starea curentă disponibilă; draft per sesiune și proiect destinație vizibil |
| Activity | Session details rămâne fixat sus, conform cerinței; lista repetă numele toolului și statusul fără un rezultat rezumat | Grupare pe turn, rezultat principal pe rând, path/fișiere schimbate și badge de stare; filtre All / Files / Commands / Agents / Errors și expand/collapse |
| Session details | Include informații utile, dar ID-uri/timestamps brute consumă spațiu | Rând rezumat fix: model, permisiuni, context, durată. Restul într-un panou extensibil; date locale, ID cu Copy |
| Inspector | Conține proiect, approvals, MCP, cont, usage și skills; mult spațiu permanent dedicat informației secundare | Proiect/account sumar sus, usage clar și restrângere automată când chatul devine prea îngust; mai puține texte explicative repetitive |
| Agents | Obiectiv și metadate disponibile; multe ID-uri brute și stări tehnice | Nume/rol, status, obiectiv și ultimul rezultat înaintea detaliilor; controale contextual disponibile; session loading și aceeași temă în fereastra separată |
| Settings | Culorile și fonturile funcționează în testele normale, dar formularul este lung | Grupuri/tabs Appearance, Behavior, Runtime, Account, About; preview de font, validare HEX inline, acțiune de reset pe grup |
| Empty/error/loading | Loading există în fluxurile normale, dar eșecurile și agent windows nu au același sistem | State comune loading / empty / error / ready cu Retry și acțiune contextuală; evită mesaje decorative când CLI/account necesită intervenție |

Pentru Activity, nu recomand micșorarea suplimentară a fontului. Un rând cu ce s-a făcut, pe ce fișier și cu ce rezultat ajută mai mult decât o listă densă de read_file/apply_patch. Detaliile tehnice pot rămâne expandabile.

Pentru culori custom, pickerul și editarea HEX funcționează în testele existente și în buildul inspectat. Adaugă avertizare inline când combinația text/fundal are contrast redus. Pentru fonturile Windows, codul are enumerarea nativă și căutarea; randarea fonturilor efectiv instalate pe calculatorul utilizatorului necesită validare acolo.

### Contrast măsurat

Datele chatului selectat, la mărimea de 9 px:

| Temă | Contrast observat | Referință pentru text normal |
|---|---:|---:|
| Muse Dark | 3,19:1 | 4,5:1 |
| Graphite | 3,20:1 | 4,5:1 |
| Porcelain | 2,69:1 | 4,5:1 |
| Aurora | 3,73:1 | 4,5:1 |
| Botanical | 3,40:1 | 4,5:1 |
| Orchid | 3,07:1 | 4,5:1 |

Mai există o eroare ARIA: composerul cu slash suggestions indică aria-controls="slash-menu", dar lista nu are acest ID. Corectează relația și semantica textarea/combobox; axe o raportează în observations → slash-accessibility. Severitatea critical din axe se referă la regula de accesibilitate, nu la o vulnerabilitate de securitate P0.

### Performanță măsurată în producție

| Mesaje sintetice | Deschidere chat | Actualizare composer prin fill | Batch de 30 deltas + 2 animation frames | Elemente DOM |
|---:|---:|---:|---:|---:|
| 100 | 235 ms | 55 ms | 48 ms | 1.631 |
| 500 | 565 ms | 214 ms | 189 ms | 7.231 |
| 2.000 | 1.791 ms | 695 ms | 653 ms | 28.231 |

Acestea sunt probe unice pe VPS, nu p95 sau timpi de tastare măsurați pe hardware Windows. fill include automatizarea și actualizarea UI. Batch-ul este procesat într-o singură serie de evenimente, deci nu reprezintă 30 de cadre separate de streaming. Creșterea costului și DOMului susține recomandarea de izolare a composerului și virtualizare.

## Subscription usage: ce înseamnă Refresh acum

Implementarea backend consultă usage/read pe toate hosturile și păstrează observația cea mai nouă. Schema oficială Muse descrie aceste numere ca observații în timp, nu ca stare permanent live. Refresh verifică ce a observat runtimeul; nu inițiază singur o cerere nouă către serviciul de billing.

Prin urmare, apăsarea Refresh poate lăsa aceleași valori sau poate păstra No usage reported yet. Nu am verificat răspunsul de quota pentru abonamentul real al utilizatorului.

Recomand:

1. Etichete explicite: Refresh observations, Observed și Last checked; starea fără date are Open Muse usage.
2. Fixarea F08: ordonare și reset la schimbarea contului.
3. O stare care explică dacă nu s-a primit o observație nouă, inclusiv după refresh.
4. O operație de quota refresh real doar dacă runtimeul oferă această capabilitate; altfel continuă fallbackul CLI, cu explicație clară.

Referință analizată: schema/msp/msp.d.ts din SDK-ul oficial Muse, SubscriptionUsage și UsageReadResult; backendul desktop: [readUsage](../../../electron/desktop-engine.cjs#L293). Nu am presupus existența unui API de billing suplimentar.

## Ce merită păstrat

- SDK oficial și runtime CLI local; identitatea și execuția sunt delegate către Muse.
- Filtrarea ambientului META_API_KEY și blocarea credentialelor API key pentru fluxul de abonament.
- Hosturi separate pentru conversații și profiluri de permisiuni, cu protecție pentru schimbarea profilului în timpul lucrului.
- Loading normal la liste/mesaje, dialogul proiect/no-folder și butonul Jump to latest.
- Session details în afara zonei scroll din Activity.
- Link separat condiționat pentru agenți activi și disponibili.
- contextIsolation, sandbox și nodeIntegration:false; blocarea navigării/ferestrelor și restricția openExternal la URL web.
- ReactMarkdown fără activarea HTML arbitrar și Mermaid cu securityLevel strict.
- Manifestul media este scris prin fișier temporar + rename.
- Versiunea/beta vizibile în fereastra principală și Settings; README public descrie installerul unsigned și limitările native.

## Ordinea recomandată de remediere

| Etapă | Livrabil | Verificare obligatorie |
|---|---|---|
| 1. Integritatea conversațiilor | F01–F05: draft per chat, generații de load, snapshot de send, context fișiere la skills, cwd terminal corect | A/B cu draft și upload, două navigări suprapuse, ack întârziat, skill + document, no-folder după proiect |
| 2. Runtime și acces media | F06, F20, F21: Electron remediat, CSP, sender validation, autorizare media și tooling | Build Windows/VPS, preload sandbox, PTY N-API, media/video ranges, origine străină respinsă |
| 3. Recuperare și usage | F07–F08, F16, F18–F19 | Folder șters, CLI lipsă, bootstrap fail, account change, observații vechi, upload mixt, manifest corupt |
| 4. UI/UX și accesibilitate | F09–F12, F14–F15, F22–F24, structurarea Activity | Tastatură, toate temele, font 16/24, ferestre 900/1100/1440, inspector, agents loading |
| 5. Scalare | F13, F17 | 100/500/2000 mesaje, chat-uri multiple idle, input/streaming, retenție de hosturi și memoria reală |

Aceste criterii trebuie transformate în teste de regresie după implementare. Probele acestui audit înregistrează comportamentul actual; ele nu reprezintă o suită care ar trebui să treacă numai după fix.

## Capturi și fișiere de verificare

- [Amestecarea istoricului la navigare](history-race.png)
- [Draft mutat în alt chat](draft-cross-chat.png)
- [Bootstrap eșuat cu loading rămas activ](bootstrap-failure.png)
- [Layout 1100 px, panouri/font mărite](layout-1100.png)
- [Layout 900 px](layout-900.png)
- [Activity actual](activity-current.png)
- [Muse Dark](theme-muse.png), [Graphite](theme-graphite.png), [Porcelain](theme-paper.png), [Aurora](theme-midnight.png), [Botanical](theme-forest.png), [Orchid](theme-rose.png)
- [Rezumatul validării](validation.json), [probe UI](probes.cjs), [probe suplimentare](extra-probes.cjs), [probe native](native-probes.cjs)

Datele și conversațiile din capturi sunt sintetice.

Pentru reproducerea probelor UI, instalează dependențele proiectului și Playwright Chromium, pregătește axe-core la calea menționată în probes.cjs, construiește rendererul și pornește vite preview pe 127.0.0.1:5175. Din rădăcina proiectului:

~~~bash
MUSE_AUDIT_URL=http://127.0.0.1:5175 node docs/audits/2026-09-30/probes.cjs
MUSE_AUDIT_URL=http://127.0.0.1:5175 node docs/audits/2026-09-30/extra-probes.cjs
xvfb-run -a node docs/audits/2026-09-30/native-probes.cjs
~~~

native-probes.cjs folosește binarul existent /tmp/muse-beta-cli/muse. Acesta trebuie înlocuit cu calea CLI disponibilă în mediul de reproducere. Probele scriu numai dovezi de audit și date temporare.

## Surse primare externe

- [Electron: Security recommendations](https://www.electronjs.org/docs/latest/tutorial/security) — CSP, IPC sender, sandbox și runtime actualizat.
- [Electron: GHSA-v3j7-r9gq-3gjw](https://github.com/electron/electron/security/advisories/GHSA-v3j7-r9gq-3gjw) — protocol cu supportFetchAPI fără corsEnabled.
- [Electron: GHSA-h7rp-cf8h-j98x](https://github.com/electron/electron/security/advisories/GHSA-h7rp-cf8h-j98x) — condițiile advisoryului contextBridge.
- [W3C: Contrast minimum](https://www.w3.org/WAI/WCAG22/Understanding/contrast-minimum.html) — contrast pentru text.
- [W3C: Target size minimum](https://www.w3.org/WAI/WCAG22/Understanding/target-size-minimum.html) — dimensiune/spațiere și excepții.
- [Schema oficială Muse SDK analizată](https://github.com/meta-models/muse-code-sdk/blob/a7c10c5dd3f66be412077d29f9d11111af70317b/schema/msp/msp.d.ts) și SDK-ul instalat @muse-code/sdk 0.1.1, comparate cu schema folosită de CLI. Aplicația raportează fingerprintWarning când schema CLI diferă.

Auditul și dovezile sunt izolate pe branchul audit/0.5.0-beta.1-20260930. Codul auditat și release-ul beta sunt la commitul indicat la început.

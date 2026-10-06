# Návod k Zázemí

Zázemí je společné zákulisí organizátorů: sdílený disk s dokumenty a
nástroje na přípravu i vedení hry. Všechno je na jednom místě a každý vidí
jen to, co vidět má.

Návod popisuje aplikaci tak, jak ji vidí organizátor. Hráči a CP mají
menu kratší – vidí jen to, co jim organizátoři ukážou.

## První spuštění

1. **Připojení k serveru.** Při prvním spuštění zadejte adresu serveru
   týmu a veřejný klíč. Obojí vám pošle ten, kdo tým založil. Můžete je
   také vložit najednou jako připojovací kód.
2. **Účet.** Zaregistrujte se e-mailem a heslem. Žádný potvrzovací e-mail
   nechodí. Když heslo zapomenete, organizátor vám v sekci
   [Lidé](#/lide) nastaví dočasné.
3. **Tým.** Buď tým založíte, nebo se připojíte kódem pozvánky. Pozvánky
   vytváří organizátor v sekci [Lidé](#/lide) → *Pozvánky* a určí v nich
   roli: organizátor, CP nebo hráč.

## Role a kdo co vidí

- **Organizátor** vidí a upravuje všechno.
- **CP** (cizí postava) vidí své CP, harmonogram výstupů, živou hru a to,
  co mu organizátoři zviditelní.
- **Hráč** vidí svou postavu, veřejné stránky encyklopedie, pravidla, svou
  přihlášku a seznam věcí, které si má přivézt.

**Každý nový záznam vidí nejdřív jen organizátoři.** Komu ho ukážete,
nastavíte v rámečku *Kdo to vidí*:

- *Jen organizátoři*,
- *Vybraní lidé* (konkrétní lidé nebo všichni hráči či všechny CP),
- *Všichni v týmu*.

Pod volbou je vidět seznam *Kdo to opravdu vidí*. Počítá ho server podle
stejných pravidel, jaká platí pro hráče, takže se na něj můžete
spolehnout. Hráč vidí vždy i svou vlastní postavu a CP svou CP.

Pole, která má vidět jen organizátor (třeba skutečná pravda o postavě),
jsou v aplikaci zvlášť a nikdy neodcházejí do počítače hráče.

**Zobrazit jako hráč.** U postavy (*Zobrazit jako hráč této postavy*)
nebo v sekci [Lidé](#/lide) (*Zobrazit jako…*) přepnete pohled na
konkrétního člověka a zkontrolujete, co přesně uvidí. Fialový pruh nahoře
ukazuje, že jste v náhledu; tlačítkem *Ukončit náhled* se vrátíte.

## Světy a hry

Nejvyšší úroveň je **svět** (například pohraniční pevnost nebo severská
vesnice) a v něm **hry**. Svět sdílí encyklopedii, rasy, pravidla a
pisatele; hra má vlastní postavy, fáze, dokumenty a logistiku.

- Hru, na které právě pracujete, vyberete v menu vlevo (*Hra*).
- Hru můžete **naklonovat** jako základ pro pokračování – zkopírují se
  postavy, stránky, dokumenty i odkazy mezi nimi.
- Hra, kterou nechcete ukázat, zůstává *Jen organizátoři*. Hráči ji
  neuvidí, i když v ní je něco zviditelněné.

## Disk

[Disk](#/disk) je sdílené úložiště souborů týmu, rozdělené podle světů a
her.

- **Nahrávání:** přetáhněte soubory nebo celé složky do okna, nebo použijte
  *Nahrát soubory*. Struktura složek se zachová.
- **Import z Google Disku:** *Nahrát soubory* → *Importovat z Google Disku
  (.zip)*. Vyberte zip stažený z Google Disku, nebo všechny části archivu
  z Google Takeout najednou. Formuláře a odkazy Google se přeskočí,
  stejné kopie se nenahrají dvakrát a na konci dostanete zprávu o importu.
  Import můžete spustit znovu – co už na disku je, se přeskočí.
- **Úpravy v Office:** *Otevřít v aplikaci* otevře soubor ve Wordu nebo
  Excelu. Ostatní mezitím vidí, že ho upravujete, a mohou ho otevřít jen
  ke čtení. Každé uložení je nová verze. Až skončíte, klikněte nahoře na
  *Upravuji* → *Hotovo*.
- **Verze:** u každého souboru je historie verzí. Kteroukoli můžete
  obnovit.
- **Náhledy:** Word, Excel, PowerPoint, PDF, obrázky i text se zobrazí
  přímo v aplikaci.
- **Šablony:** soubor označený jako šablona nabídne *Nový ze šablony* a
  doplní do něj jméno postavy a další údaje.
- **Hledání:** [Hledání](#/hledat) najde slova i uvnitř souborů a nevadí
  mu chybějící háčky a čárky.

Jeden soubor smí mít nejvýš 50 MB.

## Postavy a lidé ve hře

- [Postavy](#/postavy): list postavy po částech. U každé části je vidět,
  komu patří: hráči, organizátorům, nebo všem. Postavě přiřadíte hráče a
  ten pak list uvidí.
- [Skupiny](#/skupiny): frakce, rody, náboženské a názorové skupiny.
- [Vztahy](#/vztahy): síť vztahů mezi postavami. Jedna strana vztahu může
  být tajná. Upozorní na postavy s příliš málo vazbami.
- [CP](#/cp) a [Harmonogram CP](#/harmonogram): cizí postavy, jejich
  výstupy, příprava a kdo je hraje.
- [Fáze a bloky](#/faze): časová osa hry s kontrolním seznamem pro každou
  fázi.

## Příběh

- **Encyklopedie:** místa, organizace, osoby mimo hru, zákony, náboženství,
  dějiny. Napište `[[` a název – vznikne odkaz. Každá stránka ukazuje, co
  na ni odkazuje.
- **Kánon:** seznam ustálených faktů (jména, měna, čísla domů, úřady).
- **Dějiny**, **Zápletky**, **Úkoly a nástěnka**, **Pravidla** (s
  verzemi), **Průběh hry** a **Otevřené otázky**.
- **Kontrola** hledá rozpory: podobná jména, fakty, které si odporují,
  odkazy na neexistující dokumenty.

## Svět hry

- **Mapy:** editor map areálu i herních map – značky, oblasti, cesty,
  provazy, brány, čísla budov, popisky, měřítko a růžice. Vrstvy mají
  vlastní viditelnost. Export do PNG a PDF (A4, A3).
- **Předměty a peníze:** katalog předmětů, měna s drobnými, ceny podle
  fáze, kdo co vlastní a převody. Kartičky předmětů a přídělové lístky k
  tisku.
- **Recepty**, **Nálezy**, **Cesty** (kalkulačka cesty i se zvířaty a
  vozy), **Spaní** (kdo kde spí a přesuny během hry) a **Sklad rekvizit**
  skupiny.

## Tisk

- **Dokumenty:** herní dopisy, vyhlášky, letáky… s číslem, fází, pisatelem,
  adresátem a stavem (koncept, hotový, vytištěný, doručený).
- **Pisatelé:** jak vypadají dokumenty jednoho pisatele – písmo, inkoust,
  papír, podpis. *Uložit písma do složky* vyexportuje přibalená písma,
  abyste je mohli nainstalovat i do počítače s Wordem.
- **Formuláře** (hromadná korespondence), **Cedule**, **Archiv** (svázaný
  PDF archiv se signaturami a rejstříkem) a **Tisková fronta**.

Všechno se exportuje do PDF a dokumenty také do Wordu.

## Organizace

- **Přihlášky:** načtěte odpovědi z Google Forms (CSV). Uloží se jen
  jméno, věk, alergie, kontakt v nouzi a poznámka. Sledujete stav
  (přihlášen/a, potvrzeno, zaplaceno, má postavu) a u nezletilých souhlas
  rodičů. Přihlášky jsou osobní údaje: vidí je jen organizátoři a každý
  svou. Smazání je nevratné a do zálohy se dostanou jen na vyžádání.
- **Moje přihláška:** hráč si tu sám opraví alergie a kontakt v nouzi.
- **Jídlo:** suroviny, jídla, jídelníček podle dnů a fází a nákupní
  seznam pro zadaný počet lidí podle obchodů. U každého chodu je vidět,
  kdo by kvůli alergii neměl co jíst.
- **Rozpočet:** příjmy a výdaje, plán proti skutečnosti, náklady na osobu,
  export do Excelu.
- **Vybavení:** co si přivezou hráči, co zajistí skupina, kuchyň a
  kostýmy CP.
- **Úkolníček**, **Poznámky** a **Zpětná vazba** (načtení dotazníku po
  hře; jména a e-maily se neukládají).

## Živá hra

[Živá hra](#/zive) je přehled pro zázemí během hry:

- velký nápis s aktuální fází a blokem a tlačítka *Začít fázi…* a *Další
  blok*,
- **Na řadě:** dokumenty k doručení, body průběhu a výstupy CP; jedním
  kliknutím *Doručeno* nebo *Hotovo*,
- **Deník:** zápisy o tom, co se stalo (Ctrl+Enter zapíše).

[Stav postav](#/stav) sleduje hodnoty, které si pro hru nadefinujete
(zranění, ztráta krve, nákaza, opilost…). Tlačítky − a + je měníte. Po
překročení hranice se hodnota zvýrazní. Kliknutím na jméno se ukáže
historie.

## Bez připojení

Zázemí funguje i tam, kde není signál:

- Všechno, co jste už viděli, je v počítači a dá se číst.
- Zápisy do deníku, hodnoty v *Stavu postav* a *Doručeno* se uloží hned a
  odešlou se, až bude připojení.
- Organizátor může zakládat a upravovat záznamy. Změny čekají ve frontě
  (štítek *Čeká* nahoře) a odejdou samy.
- Soubory, pozvánky a změny viditelnosti počkají na připojení.

Když mezitím někdo jiný změnil stejný záznam, štítek zčervená. Klikněte
na *Porovnat*, uvidíte obě verze vedle sebe a vyberete, která platí:
*Ponechat moji*, *Vzít jejich*, nebo *Ponechat obě* (vaše verze se uloží
jako kopie).

## Záloha a obnova

Bezplatný server zálohy nedělá. V [Nastavení](#/nastaveni) proto občas
stáhněte **zálohu**: všechny záznamy a aktuální verze souborů v jednom
`.zip`. Přihlášky se do zálohy dostanou, jen když zaškrtnete *Včetně
přihlášek*.

**Obnovit ze zálohy** vrátí to, co na serveru chybí. Nic existujícího
nepřepíše. Záloha jde obnovit i do nového týmu na jiném serveru: záznamy
pak dostanou nová ID a lidé se přidají bez účtů, takže je pozvěte znovu.

## Aktualizace

Aplikace se aktualizuje sama. Když je k dispozici nová verze, nahoře se
objeví pruh s tlačítkem pro restart.

## Klávesové zkratky

- **Ctrl+K** – hledání a rychlý přechod kamkoli.
- **Ctrl+S** – uložit postavu, stránku encyklopedie, dokument, mapu,
  pravidla, zápletku nebo poznámku, kterou máte otevřenou.
- **Ctrl+Enter** – zapsat do deníku živé hry.
- **Tab** a **Shift+Tab** – pohyb mezi poli; **Enter** potvrdí, **Esc**
  zavře okno.

## Když něco nejde

- **„Server týmu je uspaný“:** bezplatný projekt Supabase se po týdnu bez
  používání uspí. Organizátor ho probudí v přehledu Supabase tlačítkem
  *Restore project*.
- **„Jste offline“:** pracujte dál, změny se odešlou po připojení.
- **Soubor je zamčený:** upravuje ho někdo jiný. Otevřete ho jen ke čtení,
  nebo počkejte. Starý zámek (déle než 10 minut bez známek života) může
  organizátor uvolnit.
- **„Mezitím to upravil někdo jiný“:** aplikace načetla novou verzi.
  Zkontrolujte ji a uložte znovu.

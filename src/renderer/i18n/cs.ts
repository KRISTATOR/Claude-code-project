/**
 * Every UI string lives here (CLAUDE.md, code conventions). Keys are typed, so
 * a missing or misspelled key fails the typecheck. Czech plurals use the
 * i18next suffixes _one / _few / _many / _other.
 */
export const cs = {
  app: {
    name: 'Zázemí',
    tagline: 'Pracovní prostor organizátorů Chýnického LARPu',
    version: 'Verze {{version}}',
  },
  theme: {
    label: 'Vzhled',
    light: 'Světlý',
    dark: 'Tmavý',
    auto: 'Podle systému',
  },
  firstRun: {
    title: 'Zázemí zatím není připojené',
    intro:
      'Aplikace potřebuje vědět, ke kterému serveru vašeho týmu se má připojit. Kód pro připojení vám dá organizátor.',
    codeLabel: 'Kód pro připojení',
    codePlaceholder: 'zazemi1:…',
    codeHelp: 'Vložte celý kód, který začíná „zazemi1:“.',
    connect: 'Připojit',
    advanced: 'Zadat adresu a klíč ručně',
    useCode: 'Použít kód pro připojení',
    urlLabel: 'Adresa projektu Supabase',
    urlPlaceholder: 'https://xxxxxxxx.supabase.co',
    keyLabel: 'Veřejný klíč (anon / publishable)',
    setupHint:
      'Zakládáte Zázemí pro svůj tým? Postup najdete v dokumentu SETUP.md v repozitáři projektu.',
    errors: {
      format: 'Tohle nevypadá jako kód pro připojení. Zkontrolujte, že jste zkopírovali celý kód.',
      invalid: 'Kód je poškozený nebo obsahuje neplatné údaje.',
      'url-not-https': 'Adresa musí začínat https://.',
      'key-too-short': 'Klíč je příliš krátký.',
      'key-is-secret':
        'Tohle je tajný klíč (service role / secret). Ten do aplikace nikdy nepatří – použijte veřejný klíč.',
      'config-from-build': 'Připojení je pevně nastavené v této verzi aplikace.',
      generic: 'Údaje se nepodařilo uložit.',
    },
  },
  connected: {
    title: 'Připojeno',
    server: 'Server: {{host}}',
    comingSoon:
      'Tohle je kostra aplikace (milník 0). Přihlášení, týmy a sdílený disk přijdou v dalších verzích.',
    disconnect: 'Odpojit od serveru',
    disconnectConfirm: 'Opravdu odpojit? Aplikace se vrátí na úvodní obrazovku.',
  },
  updates: {
    downloading: 'Stahuji novou verzi {{version}} ({{percent}} %)…',
    ready: 'Je připravena nová verze {{version}}.',
    restart: 'Restartovat a aktualizovat',
    check: 'Zkontrolovat aktualizace',
    none: 'Máte nejnovější verzi.',
    checking: 'Hledám aktualizace…',
    disabled: 'Automatické aktualizace fungují jen v nainstalované aplikaci.',
    error: 'Aktualizace se teď nepodařilo zkontrolovat.',
  },
  common: {
    cancel: 'Zrušit',
    loading: 'Načítám…',
  },
  plurals: {
    file_one: '{{count}} soubor',
    file_few: '{{count}} soubory',
    file_many: '{{count}} souboru',
    file_other: '{{count}} souborů',
  },
} as const;

export type Resources = typeof cs;

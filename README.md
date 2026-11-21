# Skrive

En lettvekts notatapp med offline-støtte og kryptert lokal lagring, bygget med React 19 og Vite 7.

## Funksjoner

- **Kryptert lagring**: Alle notater krypteres lokalt med AEGIS-256 eller XChaCha20-Poly1305 og sendes aldri til noen server
- **Offline-først**: Fungerer uten internettilkobling takket være Service Worker og PWA-støtte
- **Lite data**: Ingen cookies eller brukerkontoer, se [PERSONVERN.md](PERSONVERN.md)
- **Automatisk navngiving**: Det første du skriver i et nytt notat blir navnet når du trykker Enter
- **Ett format**: Notatene lagres som Markdown. Du skriver i en formatert visning der Markdown-tegnene bare vises der markøren står, og `Cmd+.` viser hele teksten som Markdown
- **Skriveflyt**: Skriv `- `, `1. `, `- [ ] ` eller `# ` først på en linje for liste, sjekkliste eller overskrift, og lim inn lenker rett på markert tekst. Innlimt tekst fra nettet beholder formateringen
- **Søk og erstatt**: Søk i notatet med treffmarkering, erstatt ett eller alle treff
- **Auto-backup**: Automatisk, passordfrase-beskyttet backup til en lokal mappe via File System Access API (Chrome/Edge)
- **Papirkurv og historikk**: Slettede notater ligger i papirkurven i 30 dager. Tidligere versjoner av hvert notat ligger kryptert på enheten i 30 dager og kan hentes tilbake
- **Import/eksport**: Eksporter alle notater som Markdown-filer i samme mappestruktur (Chrome/Edge), eksporter og importer alt som JSON, eller importer enkeltnotater fra .txt- og .md-filer
- **Eksport**: Enkeltnotater som Markdown eller HTML. Kopier-knappen gir formatert tekst i Word og e-post og Markdown ellers
- **Etiketter og mapper**: Organiser notatene med etiketter, mapper og dra-og-slipp
- **Multivalg**: Velg flere notater med Cmd/Ctrl+klikk eller Shift+klikk, og slett med angremulighet
- **Tospråklig**: Norsk og engelsk grensesnitt
- **Installerbar**: Kan installeres som PWA for desktop (Mac, Windows, Linux) via nettleserens installasjonsikon

## Sikkerhet

Skrive er utviklet med sikkerhet og personvern som prioritet. Se [personvernerklæringen](https://elzacka.github.io/skrive/personvern.html) for detaljer.

| Tiltak | Beskrivelse |
|--------|-------------|
| **Kryptering** | AEGIS-256 (AES-akselerert) eller XChaCha20-Poly1305 (fallback) |
| **Lokal lagring** | Krypterte data i IndexedDB, med gjenopprettingskopi hvis lagringen ikke kan leses |
| **Backup-kryptering** | Auto-backup låses med en passordfrase du velger selv. Frasen gjøres om til en krypteringsnøkkel med anerkjente standarder (PBKDF2 og AES-GCM) |
| **XSS-beskyttelse** | DOMPurify med streng whitelist, URL-validering |
| **CSP** | Streng Content Security Policy uten `unsafe-inline` |
| **Clickjacking** | Appen starter ikke hvis en annen nettside bygger den inn i en iframe |
| **HTTPS** | Automatisk redirect til HTTPS i produksjon |

### Sikkerhetsmodell

Skrive baserer seg på sikkerheten i enheten din, som biometri, PIN eller passord. Krypteringsnøkkelen lagres lokalt i nettleseren og forlater aldri enheten. Tilgangen til nøkkelen er beskyttet av tre mekanismer:

1. **Enhetens låseskjerm**: Hindrer uautorisert tilgang
2. **Streng innholdssikkerhetspolicy (CSP)**: Blokkerer XSS-angrep
3. **Same-origin policy**: Sørger for at nøkkelen kun er tilgjengelig for Skrive

Merk: Filer du eksporterer selv (enkeltnotater, Markdown-filer og JSON-backup) lagres ukrypterte, der du selv velger.

## Teknologier

| Teknologi | Versjon |
|-----------|---------|
| React | 19 |
| Vite | 7 |
| TypeScript | 5.9 |
| libsodium-wrappers | 0.7 |
| DOMPurify | 3.3 |
| vite-plugin-pwa | 1.2 |

Ikoner fra [Tabler Icons](https://tabler.io/icons) (MIT-lisens), selvhostet som inline SVG.

## Kom i gang

### Forutsetninger

- Node.js 20.19+ eller 22.12+
- npm

### Installasjon

```bash
cd skrive
npm install
npm run dev
```

Appen vil være tilgjengelig på `http://localhost:5173`

### Bygg for produksjon

```bash
npm run build
```

Produksjonsfilene vil være i `dist/`-mappen.

For utviklingsinstruksjoner, se [CLAUDE.md](CLAUDE.md).

## Tastatursnarveier

### Generelt

| Handling | Mac | Windows/Linux |
|----------|-----|---------------|
| Nytt notat | `Opt+N` | `Ctrl+Shift+1` |
| Vis/skjul sidepanel | `Opt+M` | `Ctrl+Shift+3` |
| Søk i alle notater | `Cmd+K` | `Ctrl+K` |
| Søk og erstatt i notat | `Cmd+F` | `Ctrl+F` |
| Lagre notat | `Cmd+S` | `Ctrl+S` |
| Angre | `Cmd+Z` | `Ctrl+Z` |
| Gjenta | `Cmd+Shift+Z` | `Ctrl+Y` |

### Formatering

| Handling | Mac | Windows/Linux |
|----------|-----|---------------|
| Brødtekst | `Cmd+Opt+0` | Fjern `#` |
| Overskrift 1–3 | `Cmd+Opt+1`–`3` | Skriv `#`, `##` eller `###` og mellomrom |
| Fet | `Cmd+B` | `Ctrl+B` |
| Kursiv | `Cmd+I` | `Ctrl+I` |
| Gjennomstreking | `Cmd+Shift+X` | `Ctrl+Shift+X` |
| Kode | `Cmd+E` | `Ctrl+E` |
| Kodeblokk | `Cmd+Shift+E` | `Ctrl+Shift+E` |
| Punktliste | `Cmd+Shift+8` | `Ctrl+Shift+8` |
| Nummerert liste | `Cmd+Shift+7` | `Ctrl+Shift+7` |
| Sjekkliste | `Cmd+Shift+9` | `Ctrl+Shift+9` |
| Sitat | `Cmd+Shift+.` | `Ctrl+Shift+.` |
| Sett inn lenke | `Cmd+K` | `Ctrl+K` |
| Åpne lenke | `Cmd+klikk` | `Ctrl+klikk` |
| Vis Markdown | `Cmd+.` | `Ctrl+.` |

Windows har ingen hurtigtast for overskrifter: Chrome bruker `Ctrl+1`–`8` til faner og `Ctrl+0` til zoom.

## Lisens

MIT

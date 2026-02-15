# Skrive

En lettvekts notatapp med offline-støtte og ende-til-ende-kryptering, bygget med React 19 og Vite 7.

## Funksjoner

- **Ende-til-ende-kryptering**: Alle notater krypteres lokalt med AEGIS-256 eller XChaCha20-Poly1305
- **Offline-først**: Fungerer uten internettilkobling takket være Service Worker og PWA-støtte
- **Ingen sporing**: Ingen analytics, ingen cookies, ingen data sendes til servere
- **Auto-backup**: Automatisk lagring til en lokal mappe via File System Access API (Chrome/Edge)
- **Import/eksport**: Eksporter og importer alle notater som JSON, eller importer enkeltnotater fra .txt- og .md-filer
- **Flere formater**: Støtter ren tekst, rik tekst og Markdown
- **Eksportformater**: Rik tekst kan eksporteres som HTML, Markdown eller RTF
- **Ord- og tegnteller**: Viser antall ord og tegn i sanntid
- **Etiketter og mapper**: Organiser notatene dine med etiketter og mappestruktur
- **Tospråklig**: Norsk og engelsk grensesnitt
- **Installerbar**: Kan installeres som en PWA for desktop (Mac, Windows, Linux)

## Sikkerhet

Skrive er utviklet med sikkerhet og personvern som prioritet. Se [personvernerklæringen](https://elzacka.github.io/skrive/personvern.html) for detaljer.

| Tiltak | Beskrivelse |
|--------|-------------|
| **Kryptering** | AEGIS-256 (AES-akselerert) eller XChaCha20-Poly1305 (fallback) |
| **XSS-beskyttelse** | DOMPurify med streng whitelist, URL-validering |
| **CSP** | Streng Content Security Policy uten `unsafe-inline` |
| **Clickjacking** | `frame-ancestors: none` blokkerer iframe-embedding |
| **HTTPS** | Automatisk redirect til HTTPS i produksjon |
| **Lokal lagring** | All data forblir kryptert på enheten |

### Sikkerhetsmodell

Skrive baserer seg på sikkerheten i enheten din, som biometri, PIN eller passord. Krypteringsnøkkelen lagres lokalt i nettleseren og forlater aldri enheten. Tilgangen til nøkkelen er beskyttet av tre mekanismer:

1. **Enhetens låseskjerm**: Hindrer uautorisert tilgang
2. **Streng innholdssikkerhetspolicy (CSP)**: Blokkerer XSS-angrep
3. **Same-origin policy**: Sørger for at nøkkelen kun er tilgjengelig for Skrive

## Teknologier

| Teknologi | Versjon |
|-----------|---------|
| React | 19 |
| Vite | 7 |
| TypeScript | 5.9 |
| libsodium-wrappers | 0.7 |
| DOMPurify | 3.3 |
| vite-plugin-pwa | 1.2 |

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

For prosjektstruktur og utviklingsinstruksjoner, se [CLAUDE.md](CLAUDE.md).

## Tastatursnarveier

### Generelt

| Handling | Mac | Windows/Linux |
|----------|-----|---------------|
| Nytt notat | `Opt+N` | `Ctrl+Shift+1` |
| Vis/skjul sidepanel | `Opt+M` | `Ctrl+Shift+3` |
| Søk | `Cmd+K` | `Ctrl+K` |
| Eksporter notat | `Cmd+S` | `Ctrl+S` |
| Angre | `Cmd+Z` | `Ctrl+Z` |
| Gjenta | `Cmd+Shift+Z` | `Ctrl+Y` |

### Rik tekst og Markdown

| Handling | Mac | Windows/Linux |
|----------|-----|---------------|
| Brødtekst | `Cmd+0` | `Ctrl+0` |
| Overskrift 1 | `Cmd+1` | `Ctrl+1` |
| Overskrift 2 | `Cmd+2` | `Ctrl+2` |
| Overskrift 3 | `Cmd+3` | `Ctrl+3` |
| Fet | `Cmd+B` | `Ctrl+B` |
| Kursiv | `Cmd+I` | `Ctrl+I` |
| Punktliste | `Cmd+Shift+8` | `Ctrl+Shift+8` |
| Nummerert liste | `Cmd+Shift+7` | `Ctrl+Shift+7` |

### Kun Markdown

| Handling | Mac | Windows/Linux |
|----------|-----|---------------|
| Inline kode | `Cmd+E` | `Ctrl+E` |
| Kodeblokk | `Cmd+Shift+E` | `Ctrl+Shift+E` |
| Lenke | `Cmd+L` | `Ctrl+L` |
| Sitat | `Cmd+Shift+.` | `Ctrl+Shift+.` |

### Kun Rik tekst

| Handling | Mac | Windows/Linux |
|----------|-----|---------------|
| Sett inn lenke | `Cmd+K` | `Ctrl+K` |

## Lisens

MIT

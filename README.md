# Skrive

En lettvekts notatapp med offline-støtte og ende-til-ende-kryptering, bygget med React 19 og Vite 7.

## Funksjoner

- **Ende-til-ende-kryptering**: Alle notater krypteres lokalt med AEGIS-256 eller XChaCha20-Poly1305
- **Offline-først**: Fungerer uten internettilkobling takket være Service Worker og PWA-støtte
- **Ingen sporing**: Ingen analytics, ingen cookies, ingen data sendes til servere
- **Import/Eksport**: Eksporter og importer alle notater som JSON for lokal backup
- **Flere formater**: Støtter ren tekst, rik tekst og Markdown
- **Etiketter og mapper**: Organiser notatene dine med etiketter og mappestruktur
- **Tospråklig**: Norsk og engelsk grensesnitt
- **Desktop-app**: Optimalisert for desktop-nettlesere (Mac, Windows, Linux)
- **Installerbar**: Kan installeres som en PWA

## Sikkerhet

Skrive er utviklet med sikkerhet og personvern som prioritet. Se [personvernerklæringen](https://elzacka.github.io/skrive/personvern.html) for detaljer.

| Tiltak | Beskrivelse |
|--------|-------------|
| **Kryptering** | AEGIS-256 (AES-akselerert) eller XChaCha20-Poly1305 (fallback) |
| **XSS-beskyttelse** | DOMPurify med streng whitelist |
| **CSP** | Streng Content Security Policy uten `unsafe-inline` |
| **Clickjacking** | `frame-ancestors: none` blokkerer iframe-embedding |
| **HTTPS** | Automatisk redirect til HTTPS i produksjon |
| **GDPR** | Ingen ekstern datadeling, self-hosted fonter og ikoner |
| **Lokal lagring** | All data forblir kryptert på enheten |

### Sikkerhetsmodell

Skrive baserer seg på sikkerheten i enheten din. Som biometri, PIN eller passord. Krypteringsnøkkelen lagres lokalt i nettleseren og forlater aldri enheten. Tilgangen til nøkkelen er beskyttet av tre mekanismer:

1. **Enhetens låseskjerm**: Hindrer uautorisert tilgang
2. **Streng innholds­sikkerhetspolicy (CSP)**: Blokkerer XSS-angrep
3. **Same-origin policy**: Sørger for at nøkkelen kun er tilgjengelig for Skrive

_XSS = Cross-Site Scripting
XSS-angrep: Også kalt "kodeinjisering",  en type dataangrep der en angriper legger inn ondsinnet kode. Hvis appen mangler mekanismer for å håndter dette kan det føre til uautorisert tilgang, datatyveri, feil i appen eller spredning av skadevare._

## Teknologier

| Teknologi | Versjon |
|-----------|---------|
| React | 19.2.3 |
| Vite | 7.3.0 |
| TypeScript | 5.9.3 |
| libsodium-wrappers | 0.7.15 |
| DOMPurify | 3.3.1 |
| vite-plugin-pwa | 1.2.0 |

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

## Prosjektstruktur

```
skrive/
├── public/              # Statiske filer
│   ├── fonts/           # Self-hosted fonter
│   ├── icons/           # PWA-ikoner
│   └── favicon.png      # Favicon
├── src/
│   ├── components/      # React-komponenter
│   ├── contexts/        # React Context providers
│   ├── hooks/           # Custom hooks
│   ├── styles/          # CSS-stiler
│   ├── types/           # TypeScript type-definisjoner
│   ├── utils/           # Hjelpefunksjoner, i18n, crypto, storage
│   ├── App.tsx          # Hovedkomponent
│   └── main.tsx         # Entry point
├── scripts/             # Byggeskript
│   └── generate-icons.mjs
├── index.html           # HTML-mal
├── package.json         # Avhengigheter
├── tsconfig.json        # TypeScript-konfigurasjon
└── vite.config.ts       # Vite-konfigurasjon
```

## Tastatursnarveier

| Handling | Mac | Windows/Linux |
|----------|-----|---------------|
| Nytt notat | `Opt+N` | `Ctrl+Shift+1` |
| Vis/skjul sidepanel | `Opt+M` | `Ctrl+Shift+3` |
| Søk | `Cmd+K` | `Ctrl+K` |
| Eksporter notat | `Cmd+S` | `Ctrl+S` |

## Lisens

MIT

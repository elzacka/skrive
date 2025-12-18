# Skrive

En lettvekts notatapp med offline-støtte og ende-til-ende-kryptering, bygget med React 19 og Vite 7.

## Funksjoner

- **Ende-til-ende-kryptering**: Alle notater krypteres lokalt med AEGIS-256 eller XChaCha20-Poly1305
- **Offline-først**: Fungerer uten internettilkobling takket være Service Worker og PWA-støtte
- **Ingen sporing**: Ingen analytics, ingen cookies, ingen data sendes til servere
- **File System Access API**: Koble til en lokal mappe for permanent lagring (Chrome/Edge)
- **Import/Eksport**: Eksporter alle notater som JSON for backup eller synkronisering mellom enheter
- **Flere formater**: Støtter ren tekst, rik tekst og Markdown
- **Etiketter og mapper**: Organiser notatene dine med etiketter og mappestruktur
- **Tospråklig**: Norsk og engelsk grensesnitt
- **Responsivt design**: Fungerer på desktop, nettbrett og mobil
- **Installerbar**: Kan installeres som en app på enheten din

## Sikkerhet

Skrive er utviklet med sikkerhet som prioritet. Se [personvernerklæringen](https://elzacka.github.io/skrive/personvern.html) for detaljer.

| Tiltak | Beskrivelse |
|--------|-------------|
| **Kryptering** | AEGIS-256 (AES-akselerert) eller XChaCha20-Poly1305 (fallback) |
| **XSS-beskyttelse** | DOMPurify med streng whitelist |
| **CSP** | Streng Content Security Policy uten `unsafe-inline` |
| **Clickjacking** | `frame-ancestors: none` blokkerer iframe-embedding |
| **HTTPS** | Automatisk redirect til HTTPS i produksjon |
| **GDPR** | Ingen ekstern datadeling, self-hosted fonter |
| **Lokal lagring** | All data forblir kryptert på enheten |

### Sikkerhetsmodell

Skrive stoler på enhetens sikkerhet (biometri, PIN, passord). Krypteringsnøkkelen lagres i nettleseren og er beskyttet av:
1. Enhetens låseskjerm
2. Streng CSP som blokkerer XSS-angrep
3. Same-origin policy (nøkkelen er kun tilgjengelig fra Skrive)

## Teknologier

| Teknologi | Versjon |
|-----------|---------|
| React | 19.2.3 |
| Vite | 7.3.0 |
| TypeScript | 5.9.3 |
| libsodium-wrappers | 0.7.15 |
| DOMPurify | 3.3.1 |
| vite-plugin-pwa | 1.2.0 |
| react-router | 7.10.1 |

## Kom i gang

### Forutsetninger

- Node.js 20.19+ eller 22.12+
- npm eller yarn

### Installasjon

```bash
# Klon eller pakk ut prosjektet
cd skrive

# Installer avhengigheter
npm install

# Start utviklingsserver
npm run dev
```

Appen vil være tilgjengelig på `http://localhost:5173`

### Bygg for produksjon

```bash
npm run build
```

Produksjonsfilene vil være i `dist/`-mappen.

### Forhåndsvisning av produksjonsbygg

```bash
npm run preview
```

## Prosjektstruktur

```
skrive/
├── public/              # Statiske filer
│   ├── icons/           # PWA-ikoner
│   └── favicon.svg      # Favicon
├── src/
│   ├── components/      # React-komponenter
│   ├── contexts/        # React Context providers
│   ├── hooks/           # Custom hooks
│   ├── styles/          # CSS-stiler
│   ├── types/           # TypeScript type-definisjoner
│   ├── utils/           # Hjelpefunksjoner
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

### Mac
- `Opt+N` - Nytt notat
- `Opt+M` - Vis/skjul sidepanel
- `Cmd+S` - Eksporter notat

### Windows/Linux
- `Ctrl+Shift+1` - Nytt notat
- `Ctrl+Shift+3` - Vis/skjul sidepanel
- `Ctrl+S` - Eksporter notat

## Synkronisering mellom enheter

Skrive bruker ikke sky-lagring. I stedet kan du synkronisere manuelt:

1. **Eksporter data**: Meny -> Eksporter alle data -> Lagre JSON-filen
2. **Overfør filen**: Bruk e-post, sky-lagring (Google Drive, Dropbox, etc.), eller annen metode
3. **Importer data**: På den andre enheten: Meny -> Importer data -> Velg JSON-filen

### Alternativ: File System Access API

Hvis du bruker Chrome eller Edge, kan du koble til en mappe som synkroniseres via en sky-tjeneste (f.eks. Dropbox eller OneDrive):

1. Meny -> Koble til mappe
2. Velg en mappe i din synkroniserte sky-mappe
3. Notater eksporteres automatisk til denne mappen

## PWA-ikoner

Ikoner genereres med skriptet `scripts/generate-icons.mjs`:

```bash
node scripts/generate-icons.mjs
```

Dette genererer PNG-ikoner fra SVG i størrelsene 192x192 og 512x512.

## Lisens

MIT

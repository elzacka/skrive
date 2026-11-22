# Skrive

En notatapp for nettleseren på datamaskin. Notatene lagres kryptert på enheten og virker uten internett.

## Funksjoner

- **Kryptert og lokalt**: Notatene krypteres med AEGIS-256 og forlater aldri enheten. Ingen konto, ingen cookies
- **Offline**: Virker uten internett og kan installeres som app (PWA) på Mac, Windows og Linux
- **Markdown**: Du skriver i en formatert visning, og «MD» viser hele teksten som Markdown. Den første linjen blir notatets navn
- **Skrift og avstand**: Velg iA Writer Duo, Monaspace eller Recursive, og størrelse og linjeavstand
- **Organisering**: Mapper, etiketter, dra-og-slipp, kopier, klipp ut og lim inn i notatlisten, søk og erstatt, og flere notater valgt samtidig
- **Papirkurv og historikk**: Slettede notater og tidligere versjoner ligger i 30 dager
- **Backup og eksport**: Kryptert auto-backup til en mappe du velger (Chrome og Edge), eksport som Markdown, HTML eller ukryptert backup, og import av backup, .txt og .md
- **Oppdateringer**: En knapp viser når en ny versjon er klar, og du velger selv når appen lastes på nytt
- **Norsk og engelsk**

Hurtigtastene står i appen, under tastaturikonet nederst i sidepanelet.

## Sikkerhet

| Tiltak | Slik |
|--------|------|
| **Kryptering** | AEGIS-256. Nøkkelen ligger i nettleseren, låst med en WebCrypto-nøkkel som ikke kan hentes ut |
| **Backup** | Låst med en passordfrase på minst 15 tegn (Argon2id og AES-GCM) |
| **Innhold** | DOMPurify og URL-sjekk mot XSS, streng CSP uten `unsafe-inline`, ingen forespørsler til andre servere |
| **Innbygging** | Appen starter ikke inne i en iframe |

Skrive er ikke sikrere enn enheten, så lås den med passord, PIN eller biometri. Filer du eksporterer selv, er ukrypterte. Hva som lagres og hvor: [personvernerklæringen](https://elzacka.github.io/skrive/personvern.html).

## Teknologier

React, Vite og TypeScript, med libsodium for kryptering, CodeMirror som editor og DOMPurify mot XSS. Versjonene står i `package.json`.

Ikoner fra [Tabler Icons](https://tabler.io/icons) (MIT). Fonter (SIL OFL 1.1, lisensene ligger i `public/fonts`): [JetBrains Mono](https://github.com/JetBrains/JetBrainsMono), [iA Writer Duo](https://github.com/iaolo/iA-Fonts), [Monaspace Neon](https://github.com/githubnext/monaspace) og [Recursive](https://github.com/arrowtype/recursive). Alt er selvhostet.

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

Appen åpnes på `http://localhost:5173/skrive/`.

### Bygg for produksjon

```bash
npm run build
```

Produksjonsfilene havner i `dist/`.

For utviklingsinstruksjoner, se [CLAUDE.md](CLAUDE.md).

## Lisens

MIT

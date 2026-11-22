# Security

## Reporting

Email hei@tazk.no; do not open a public issue. Only the deployed version at
elzacka.github.io/skrive is supported.

## Fix times

| Severity | Fixed |
|---|---|
| Critical, high (including a vulnerable runtime dependency) | Within 7 days |
| Medium | In the next release, at most 30 days |
| Low | In a planned release |

Dependabot proposes npm and GitHub Actions updates weekly; CI fails on a
high-severity advisory in a runtime dependency (`npm audit --omit=dev`).

## Design

Encryption, key handling and backups: [CLAUDE.md](CLAUDE.md), sections
Security, Storage and Auto-backup.

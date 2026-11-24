# TRACACON-App

Community-App der TRACACON Trade Card Conventions. *Collect. Connect. Trade.*

Grundlage ist das [Entscheidungsdokument](https://claude.ai/artifact/2BZqtKyEzQiHVrAccM2YuY). Dieser Stand ist **Phase 1 (Fundament)**: Anmeldung mit E-Mail-Einmalcode, Begrüßung mit Mindestalter 16, Profile, Rollen (Mitglied, Team, Admin), Verwaltung, Konto löschen, Deutsch und Englisch.

## Technik

| Baustein | Wahl |
| --- | --- |
| App und Server | Next.js 16 (App Router, Server-Aktionen), läuft auf Cloudflare Workers über OpenNext |
| Datenbank, Anmeldung | Supabase (Postgres mit Row Level Security, Auth mit Einmalcode) |
| Sprachen | next-intl, Adressen immer mit Kürzel: `/de/…`, `/en/…` |
| Gestaltung | Tailwind CSS 4, Farben Nachtblau, Creme, Bernstein |

Alle Änderungen laufen über Server-Aktionen mit der Sitzung des Nutzers. Die Datenbank prüft jede Anfrage selbst: Rolle und Altersbestätigung kann niemand direkt setzen, nur über geprüfte Funktionen.

## Ordner

```
src/app/[locale]/        Seiten: Start, anmelden, willkommen, profil, u/[nickname], admin, impressum, datenschutz, regeln
src/lib/actions/         Server-Aktionen (Anmeldung, Profil, Rollen)
src/lib/auth.ts          Zentrale Abfrage von Anmeldung, Profil und Rolle
src/proxy.ts             Sprache erkennen, Supabase-Sitzung auffrischen
messages/de.json, en.json  Alle Texte
supabase/migrations/     Datenbankschema
tests/db/                Tests der Zugriffsregeln gegen echtes Postgres (PGlite)
tests/e2e/               Browsertest des ganzen Ablaufs
```

## Einrichtung

### 1. Supabase-Projekt

1. In eurer Supabase-Organisation ein Projekt anlegen, Region **EU Central (Frankfurt)**.
2. **SQL Editor** öffnen, den Inhalt von `supabase/migrations/20261124120000_phase1_profile_rollen.sql` einfügen und ausführen.
3. **Authentication → Sign In / Providers → Email**: E-Mail aktiv lassen. „Confirm email“ kann an bleiben.
4. **Authentication → Emails → Templates**: In den Vorlagen **Magic Link** und **Confirm signup** den Code einbauen, zum Beispiel:
   ```html
   <h2>Dein Anmeldecode für TRACACON</h2>
   <p>Gib diesen Code in der App ein: <strong>{{ .Token }}</strong></p>
   <p>Der Code ist eine Stunde gültig. Wenn du das nicht warst, ignoriere diese E-Mail.</p>
   ```
5. **Authentication → URL Configuration**: Site URL auf die Adresse der App setzen.
6. Der eingebaute E-Mail-Versand von Supabase hat nur ein sehr kleines Stundenlimit und taugt nur zum Testen. Vor dem Pilot unter **Authentication → Emails → SMTP Settings** einen eigenen E-Mail-Dienst eintragen (Entscheidung offen).

### 2. Ersten Admin festlegen

Einmal in der App anmelden, dann im SQL Editor (eigene Adresse einsetzen):

```sql
update public.profiles set role = 'admin'
where id = (select id from auth.users where email = 'deine@adresse.de');
```

Weitere Rollen vergibt ihr danach in der App unter **Verwaltung**.

### 3. Lokal starten

```bash
cp .env.example .env.local   # Werte aus Supabase → Project Settings → API Keys eintragen
npm install
npm run dev                  # http://localhost:3000/de
```

### 4. Auf Cloudflare veröffentlichen

1. Bei Cloudflare anmelden: `npx wrangler login`
2. Variablen setzen: Die beiden `NEXT_PUBLIC_…`-Werte müssen **beim Bauen** vorhanden sein (in `.env.local` oder als Umgebungsvariablen). Die `OPERATOR_…`-Werte im Cloudflare-Dashboard unter Workers → tracacon-app → Settings → Variables eintragen.
3. Staging: `npm run cf:deploy:staging`, Produktion: `npm run cf:deploy`. Für Staging ein eigenes Supabase-Projekt verwenden.

Die Domain `app.tracacon.de` wird erst nach Abnahme und Pilot auf Produktion gelegt.

## Prüfen

```bash
npm run check      # Typen, Lint, Datenbanktests
npm run cf:build   # Bau für Cloudflare
```

Bei jedem Push prüft GitHub dasselbe automatisch (`.github/workflows/pruefung.yml`). Den Browsertest beschreibt `tests/e2e/README.md`.

## Bekannte Punkte

- Der Cloudflare-Adapter stuft den Proxy von Next.js 16 noch als experimentell ein. Getestet: Sprachweiche, Weiterleitungen und Sitzung funktionieren im lokalen Cloudflare-Simulator. Vor dem Pilot im echten Staging erneut prüfen.
- Impressum, Datenschutzerklärung und Community-Regeln sind Platzhalter. Vor dem Start schreiben und juristisch prüfen lassen.
- Die Altersgrenze wird per Bestätigung abgefragt, nicht nachgewiesen.

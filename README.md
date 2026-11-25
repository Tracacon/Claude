# Tracacon App

Community-App der Tracacon Trade Card Conventions. *Trading · Dealing · Connecting*

Grundlage ist das [Entscheidungsdokument](https://claude.ai/artifact/2BZqtKyEzQiHVrAccM2YuY). Stand:

- **Phase 1 (Fundament):** Klassische Anmeldung mit E-Mail und Passwort; eigene Seiten für Registrierung (einmaliger Bestätigungscode per E-Mail) und „Passwort vergessen“, Begrüßung mit Mindestalter 16, Profile, Rollen (Mitglied, Team, Admin), Verwaltung, Konto löschen, Deutsch und Englisch.
- **Social:** Profilseite wie in sozialen Netzwerken (Profilbild, Zahlen, Inserate als Raster, Abzeichen), Profilmenü, Folgen mit optionaler Bestätigung, Privatsphäre (öffentlich oder nur Follower), Einstellungsseite, Fotos im Chat (geschützter Speicher, signierte Adressen).
- **Phase 3 (App-Chat):** Unterhaltung je Inserat und Interessent, Echtzeit über Supabase Realtime (mit Nachladen als Rückfallebene), Ungelesen-Zähler, Blockieren, Ausblenden, Melden (das Team sieht nur gemeldete Unterhaltungen), Grenzen gegen Spam.
- **Phase 2 (Marktplatz):** Inserate mit bis zu 6 Fotos anlegen (Einzelkarten und Slabs: Vorder- und Rückseite Pflicht), bearbeiten, Status (aktiv, reserviert, erledigt), löschen. Suche und Filter auf dem Server mit Seitenaufteilung. Melden von Inseraten und Profilen, Moderationsseite für das Team mit Begründung an den Anbieter.

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
src/lib/actions/         Server-Aktionen (Anmeldung, Profil, Rollen, Inserate, Moderation)
src/components/          Navigation, Inseratskarte, Inseratsformular, Foto-Upload
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
2. **SQL Editor** öffnen und die Dateien aus `supabase/migrations/` **der Reihe nach** einzeln einfügen und ausführen (jede genau einmal). Phase 2 legt dabei auch den Foto-Speicher `listing-photos` an.
3. **Authentication → Sign In / Providers → Email**: E-Mail aktiv lassen. „Confirm email“ kann an bleiben.
4. **Authentication → Emails → Templates**: In den Vorlagen **Magic Link** und **Confirm signup** den Code einbauen, zum Beispiel:
   ```html
   <h2>Dein Anmeldecode für Tracacon</h2>
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
npm install                  # Supabase-Adresse und öffentlicher Schlüssel stehen in .env.production
cp .env.production .env.local
npm run dev                  # http://localhost:3000/de
```

### 4. Auf Cloudflare veröffentlichen

1. Bei Cloudflare anmelden: `npx wrangler login`
2. Variablen setzen: Die beiden öffentlichen `NEXT_PUBLIC_…`-Werte stehen in `.env.production` und werden beim Bauen eingelesen. Die `OPERATOR_…`-Werte im Cloudflare-Dashboard unter Workers → tracacon-app → Settings → Variables eintragen.
3. Staging: `npm run cf:deploy:staging`, Produktion: `npm run cf:deploy`. Für Staging ein eigenes Supabase-Projekt verwenden.

Die Domain `app.tracacon.de` wird erst nach Abnahme und Pilot auf Produktion gelegt.

## Prüfen

```bash
npm run check      # Typen, Lint, Datenbanktests
npm run cf:build   # Bau für Cloudflare
```

Bei jedem Push prüft GitHub dasselbe automatisch (`.github/workflows/pruefung.yml`). Den Browsertest beschreibt `tests/e2e/README.md`.

## Bekannte Punkte

- Benachrichtigung per E-Mail bei neuen Chat-Nachrichten fehlt noch, bis ein E-Mail-Dienst gewählt ist. Bis dahin zeigt die App ungelesene Nachrichten mit einem Zähler.

- Fotos lädt der Browser direkt in den eigenen Ordner bei Supabase Storage hoch (Abweichung vom Entscheidungsdokument, das alle Schreibzugriffe über die API vorsah). Grund: keine Größengrenzen und keine Rechenzeit im Worker. Der Speicher erzwingt Ordner, Dateinamen, Typ (JPEG/WebP) und 2 MB je Datei. Der Browser verkleinert die Fotos vorher und entfernt dabei Metadaten wie den Aufnahmeort.
- Fotos entfernter Inserate bleiben über ihre direkte Adresse erreichbar, bis der Anbieter das Inserat löscht.

- Der Cloudflare-Adapter stuft den Proxy von Next.js 16 noch als experimentell ein. Der komplette Browsertest läuft im lokalen Cloudflare-Simulator (`wrangler dev`) durch.
- `package.json` legt unter `overrides` für `@opennextjs/aws` das Paket `cookie@0.7.2` fest. Mit `cookie@1.x` stürzt der Adapter bei jeder Anfrage mit Cookie ab (`cookieParser.parse` ist dort undefiniert, Fehler 1101). Erst entfernen, wenn OpenNext das behoben hat, und dann den Browsertest im Simulator wiederholen.
- Impressum, Datenschutzerklärung und Community-Regeln sind Platzhalter. Vor dem Start schreiben und juristisch prüfen lassen.
- Die Altersgrenze wird per Bestätigung abgefragt, nicht nachgewiesen.

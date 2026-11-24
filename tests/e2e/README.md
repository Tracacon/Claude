# Oberflächentest (Browser)

`flow.py` testet Phase 1 in Chrome (Anmeldung, Begrüßung, Profil, Verwaltung, Sprache, Abmelden, Konto löschen). `marketplace_flow.py` testet Phase 2 (Inserate mit Fotos, Suche, Melden, Moderation, Bearbeiten, Löschen). `chat_flow.py` testet Phase 3 mit zwei Personen (Nachrichten, Ungelesen, Melden, Blockieren, Ausblenden). `marketplace_flow.py` und `chat_flow.py` brauchen Pillow (`pip install pillow`).

Supabase wird dabei durch `mock_supabase.py` ersetzt (gültiger Code: `123456`, erster Nutzer wird Admin). Die echten Zugriffsregeln der Datenbank prüft `tests/db` gegen Postgres.

```bash
pip install playwright           # Chrome muss installiert sein (CHROME_PATH)
python3 tests/e2e/mock_supabase.py 54321 &
NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321 NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=test npm run build
NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321 NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=test npx next start -p 3005 &
python3 tests/e2e/flow.py http://127.0.0.1:3005 ./screenshots
```

Im Cloudflare-Simulator (empfohlen, deckt Fehler des Adapters auf):

```bash
NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321 NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=test npx opennextjs-cloudflare build
# global_fetch_strictly_public verbietet Anfragen an 127.0.0.1, daher lokal ohne diese Einstellung:
sed 's/, "global_fetch_strictly_public"//' wrangler.jsonc > wrangler.local.jsonc
npx wrangler dev -c wrangler.local.jsonc --port 8787 &
python3 tests/e2e/flow.py http://127.0.0.1:8787
# Testserver neu starten, dann:
python3 tests/e2e/marketplace_flow.py http://127.0.0.1:8787
# Testserver neu starten, dann:
python3 tests/e2e/chat_flow.py http://127.0.0.1:8787
```

"""Oberflächentest: Instagram-Beiträge erscheinen automatisch im Feed.

Voraussetzungen wie in tests/e2e/README.md (frisch gestarteter mock_supabase.py, der Instagram nachbildet).
Aufruf: python3 tests/e2e/instagram_flow.py http://127.0.0.1:8787 [screenshot-ordner]
"""

import json
import os
import re
import sys
import urllib.request

from playwright.sync_api import expect, sync_playwright

BASE = sys.argv[1] if len(sys.argv) > 1 else "http://127.0.0.1:8787"
SHOTS = sys.argv[2] if len(sys.argv) > 2 else None
CHROME = os.environ.get("CHROME_PATH", "/usr/bin/google-chrome")
step_no = 0


def step(name):
    global step_no
    step_no += 1
    print(f"  ✓ {step_no:02d} {name}")


def shot(page, name):
    if SHOTS:
        os.makedirs(SHOTS, exist_ok=True)
        page.screenshot(path=os.path.join(SHOTS, f"{name}.png"))


def register(page, email, nickname):
    page.goto(f"{BASE}/de/registrieren")
    page.get_by_label("E-Mail-Adresse").fill(email)
    page.get_by_label("Nickname").fill(nickname)
    page.get_by_label("Passwort", exact=True).fill("Sammeln-2026!")
    page.get_by_label("Passwort wiederholen").fill("Sammeln-2026!")
    page.get_by_label("Ich bin mindestens 16 Jahre alt.").check()
    page.get_by_role("checkbox", name=re.compile("Community-Regeln")).check()
    page.get_by_role("button", name="Konto erstellen").click()
    page.get_by_label("Bestätigungscode").fill("123456")
    page.get_by_role("button", name="Konto aktivieren").click()
    expect(page).to_have_url(re.compile(r"/de/profil$"))


with sync_playwright() as p:
    browser = p.chromium.launch(executable_path=CHROME, args=["--no-sandbox"])
    mobile = {"viewport": {"width": 390, "height": 844}, "locale": "de-DE", "has_touch": True}

    admin = browser.new_context(**mobile).new_page()
    register(admin, "team@tracacon.de", "TRACACON")
    step("Team-Konto angelegt (erste Verwaltung = Absender der Instagram-Beiträge)")

    req = urllib.request.Request("http://127.0.0.1:54321/test/ig", data=b'{"on": true}', headers={"Content-Type": "application/json"})
    urllib.request.urlopen(req)
    guest = browser.new_context(**mobile).new_page()
    guest.goto(f"{BASE}/de")
    # Der Abgleich läuft nach dem Ausliefern der Seite im Hintergrund
    for _ in range(20):
        guest.wait_for_timeout(500)
        guest.reload()
        if guest.get_by_text("Trade Night heute ab 18 Uhr!").count():
            break
    carousel = guest.get_by_role("article").filter(has_text="Trade Night heute ab 18 Uhr!")
    expect(carousel).to_be_visible()
    expect(carousel.get_by_text("1/2")).to_be_visible()  # Video im Karussell übersprungen
    expect(carousel.get_by_text("Instagram")).to_have_count(0)
    expect(guest.locator('a[href*="instagram.com"]')).to_have_count(0)  # kein Verweis auf Instagram
    expect(guest.get_by_text("Neuer Reel aus der Halle")).to_have_count(0)  # Reels werden nicht übernommen
    expect(guest.get_by_text("Danke für die tolle Messe!")).to_be_visible()
    expect(guest.get_by_text("Noch ein Foto")).to_be_visible()
    expect(guest.get_by_text("Ganz alter Beitrag")).to_have_count(0)  # höchstens 3 je Durchlauf
    guest.wait_for_function("() => [...document.querySelectorAll('article img')].some(i => i.complete && i.naturalWidth > 0)")
    shot(guest, "70-instagram-feed")
    step("Feed übernimmt automatisch Bildbeiträge als eigene Beiträge, ohne Instagram-Hinweis; Reels nicht")

    refreshes = json.loads(urllib.request.urlopen("http://127.0.0.1:54321/test/ig-refreshes").read())
    # Instagram-Schlüssel werden verlängert, Facebook-Schlüssel (EAA…) nicht
    assert refreshes == ([] if os.environ.get("IG_KIND") == "facebook" else ["ig-test-token"]), refreshes
    step("Zugangsschlüssel wurde automatisch verlängert")

    admin.goto(f"{BASE}/de/team/termine")
    expect(admin.get_by_text("3 Beiträge übernommen")).to_be_visible()
    admin.get_by_role("button", name="Jetzt bei Instagram nachsehen").click()
    expect(admin.get_by_text("1 neuer Beitrag übernommen.")).to_be_visible(timeout=15000)
    admin.get_by_role("button", name="Jetzt bei Instagram nachsehen").click()
    expect(admin.get_by_text("Keine neuen Beiträge.")).to_be_visible(timeout=15000)
    step("Team holt den Rest; doppelte Beiträge entstehen nicht")

    admin.goto(f"{BASE}/de/profil")
    expect(admin.get_by_role("link", name=re.compile(r"^4\s*Beiträge"))).to_be_visible()  # 3 + 1 ältere, ohne Reel
    step("Beiträge stehen im Profil des Team-Kontos")

    browser.close()

print(f"Alle {step_no} Schritte bestanden.")

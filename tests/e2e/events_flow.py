"""Oberflächentest Phase 4: Termine aus Odoo, Karten mitbringen, QR-Aushang, Check-in, Abzeichen.

Voraussetzungen wie in tests/e2e/README.md (frisch gestarteter mock_supabase.py, der auch Odoo nachbildet!).
Aufruf: python3 tests/e2e/events_flow.py http://127.0.0.1:8787 [screenshot-ordner]
"""

import json
import os
import re
import sys
import tempfile
import urllib.request

from PIL import Image
from playwright.sync_api import expect, sync_playwright

BASE = sys.argv[1] if len(sys.argv) > 1 else "http://127.0.0.1:8787"
SHOTS = sys.argv[2] if len(sys.argv) > 2 else None
MOCK = "http://127.0.0.1:54321"
CHROME = os.environ.get("CHROME_PATH", "/usr/bin/google-chrome")
step_no = 0


def step(name):
    global step_no
    step_no += 1
    print(f"  ✓ {step_no:02d} {name}")


def shot(page, name, full=False):
    if SHOTS:
        os.makedirs(SHOTS, exist_ok=True)
        page.screenshot(path=os.path.join(SHOTS, f"{name}.png"), full_page=full)


def mock(path, data=None):
    req = urllib.request.Request(MOCK + path, data=json.dumps(data).encode() if data is not None else None,
                                 headers={"Content-Type": "application/json"})
    return json.loads(urllib.request.urlopen(req).read() or "null")


def fill_registration(page, email, nickname):
    page.get_by_label("E-Mail-Adresse").fill(email)
    page.get_by_label("Nickname").fill(nickname)
    page.get_by_label("Passwort", exact=True).fill("Sammeln-2026!")
    page.get_by_label("Passwort wiederholen").fill("Sammeln-2026!")
    page.get_by_label("Ich bin mindestens 16 Jahre alt.").check()
    page.get_by_role("checkbox", name=re.compile("Community-Regeln")).check()
    page.get_by_role("button", name="Konto erstellen").click()
    page.get_by_label("Bestätigungscode").fill("123456")
    page.get_by_role("button", name="Konto aktivieren").click()


def register(page, email, nickname):
    page.goto(f"{BASE}/de/registrieren")
    fill_registration(page, email, nickname)
    expect(page).to_have_url(re.compile(r"/de/profil$"))


def checkin_path(poster_page):
    url = poster_page.get_by_test_id("checkin-url").inner_text()
    return "/" + url.split("/", 3)[3]


tmp = tempfile.mkdtemp()
photos = []
for i, color in enumerate([(200, 90, 30), (30, 90, 200)]):
    path = os.path.join(tmp, f"karte{i}.jpg")
    Image.new("RGB", (900, 1260), color).save(path, "JPEG")
    photos.append(path)

with sync_playwright() as p:
    browser = p.chromium.launch(executable_path=CHROME, args=["--no-sandbox"])
    mobile = {"viewport": {"width": 390, "height": 844}, "locale": "de-DE", "has_touch": True}

    admin = browser.new_context(**mobile).new_page()
    register(admin, "chefin@tracacon.de", "Chefin")
    ana = browser.new_context(**mobile).new_page()
    register(ana, "ana@example.com", "Ana")
    step("Konten angelegt (Admin und Sammlerin)")

    # --- Termine aus Odoo ------------------------------------------------------
    guest = browser.new_context(**mobile).new_page()
    guest.goto(f"{BASE}/de/termine")
    expect(guest.get_by_role("heading", name="Termine")).to_be_visible()
    expect(guest.get_by_text("TNS Stuttgart Testabend")).to_be_visible()
    expect(guest.get_by_text("Messe Kornwestheim")).to_be_visible()
    expect(guest.get_by_text("Interner Planungstermin")).to_have_count(0)
    expect(guest.get_by_text("Das K. · Kornwestheim")).to_be_visible()
    assert "event.event/search_read" in mock("/test/odoo-calls")
    shot(guest, "50-termine")
    step("Termine beim ersten Aufruf aus Odoo geholt, unveröffentlichte ausgeblendet")

    guest.get_by_role("navigation", name="Navigation").get_by_role("link", name="Termine").click()
    expect(guest).to_have_url(re.compile(r"/de/termine$"))
    guest.get_by_text("Messe Kornwestheim").click()
    expect(guest.get_by_role("heading", name="Messe Kornwestheim")).to_be_visible()
    expect(guest.get_by_role("link", name=re.compile("Tickets bei EVENTIM"))).to_have_attribute(
        "href", "https://www.eventim.de/event/messe-kornwestheim-456/")
    expect(guest.get_by_role("link", name="Mehr auf tracacon.de")).to_have_attribute("href", "https://www.tracacon.de/event/messe-8")
    expect(guest.get_by_text("Das K., Stuttgarter Str. 65, 70806 Kornwestheim")).to_be_visible()
    expect(guest.get_by_text("Check-in vor Ort: QR-Code am Eingang scannen.")).to_be_visible()
    guest.goto(f"{BASE}/de/termine")
    guest.get_by_text("TNS Stuttgart Testabend").click()
    expect(guest.get_by_role("link", name=re.compile("Tickets bei EVENTIM"))).to_have_attribute(
        "href", "https://www.eventim.de/event/tns-stuttgart-123/?affiliate=TRA&x=1")
    expect(guest.get_by_text("Noch hat niemand Karten angekündigt")).to_be_visible()
    step("Terminseite: EVENTIM-Link aus eigenem Feld bzw. Beschreibung, Ort, Website")

    # --- Karte mitbringen ---------------------------------------------------------
    ana.goto(f"{BASE}/de/termine")
    ana.get_by_text("TNS Stuttgart Testabend").click()
    expect(ana).to_have_url(re.compile(r"/de/termine/[0-9a-f-]{36}$"))
    tns_url = ana.url
    ana.get_by_role("link", name="+ Karte mitbringen").click()
    expect(ana).to_have_url(re.compile(r"/de/marktplatz/neu\?termin="))
    tns_box = ana.get_by_role("checkbox", name=re.compile("TNS Stuttgart Testabend"))
    expect(tns_box).to_be_checked()
    messe_box = ana.get_by_role("checkbox", name=re.compile("Messe Kornwestheim"))
    expect(messe_box).not_to_be_checked()
    messe_box.check()
    ana.locator("#listing-photo-gallery").set_input_files(photos)
    for _ in photos:
        ana.get_by_role("button", name="Übernehmen").click()
    expect(ana.get_by_text("Wird hochgeladen")).to_have_count(0, timeout=15000)
    ana.get_by_label("Titel").fill("Glurak ex Tauschbinder")
    ana.get_by_label("Spiel").select_option("pokemon")
    ana.get_by_label("Preis (€)").fill("45")
    ana.get_by_role("button", name="Inserat veröffentlichen").click()
    expect(ana).to_have_url(re.compile(r"/de/marktplatz/[0-9a-f-]{36}$"))
    listing_url = ana.url
    expect(ana.get_by_text("Kommt mit zu")).to_be_visible()
    expect(ana.get_by_role("link", name=re.compile("📅 TNS Stuttgart Testabend"))).to_be_visible()
    expect(ana.get_by_role("link", name=re.compile("📅 Messe Kornwestheim"))).to_be_visible()
    step("Inserat mit zwei Terminen angelegt, Termin aus der Terminseite vorausgewählt")

    guest.goto(tns_url)
    expect(guest.get_by_text("Glurak ex Tauschbinder")).to_be_visible()
    expect(guest.get_by_role("status").filter(has_text=re.compile(r"^1 Inserat$"))).to_be_visible()
    shot(guest, "51-termin-mitbringen", full=True)
    guest.goto(f"{BASE}/de")
    expect(guest.get_by_role("heading", name="Die nächsten Termine")).to_be_visible()
    expect(guest.get_by_text("1 Inserat wird mitgebracht").first).to_be_visible()
    step("Terminseite und Startseite zeigen, was mitgebracht wird")

    ana.goto(listing_url + "/bearbeiten")
    ana.get_by_role("checkbox", name=re.compile("Messe Kornwestheim")).uncheck()
    ana.get_by_role("button", name="Änderungen speichern").click()
    expect(ana).to_have_url(listing_url)
    expect(ana.get_by_role("link", name=re.compile("📅 Messe Kornwestheim"))).to_have_count(0)
    expect(ana.get_by_role("link", name=re.compile("📅 TNS Stuttgart Testabend"))).to_be_visible()
    step("Termin beim Bearbeiten wieder abgewählt")

    # --- Team: Abgleich und Aushang ----------------------------------------------
    admin.get_by_role("button", name="Mein Profil").click()
    admin.get_by_role("menu").get_by_role("link", name="Termine & Check-in").click()
    expect(admin.get_by_role("heading", name="Termine und Check-in")).to_be_visible()
    expect(admin.get_by_text("Zuletzt abgeglichen")).to_be_visible()
    expect(admin.get_by_text("Interner Planungstermin")).to_be_visible()  # Team sieht auch ausgeblendete
    admin.get_by_role("button", name="Jetzt aus Odoo holen").click()
    expect(admin.get_by_text("3 Termine übernommen")).to_be_visible(timeout=15000)
    step("Team holt Termine sofort aus Odoo")

    admin.get_by_role("listitem").filter(has_text="TNS Stuttgart Testabend").get_by_role("link", name="Aushang erstellen").click()
    expect(admin.get_by_role("heading", name="Jetzt einchecken!")).to_be_visible()
    expect(admin.get_by_role("img", name="QR-Code zum Einchecken").locator("svg")).to_be_visible()
    tns_checkin = checkin_path(admin)
    assert re.fullmatch(r"/checkin/[a-z0-9]{40}", tns_checkin), tns_checkin
    shot(admin, "52-aushang", full=True)
    admin.reload()
    assert checkin_path(admin) == tns_checkin
    step("Aushang mit QR-Code, Code bleibt beim erneuten Öffnen gleich")

    # --- Check-in -------------------------------------------------------------------
    ana.goto(BASE + tns_checkin)
    expect(ana).to_have_url(re.compile(r"/de/termine/[0-9a-f-]{36}\?eingecheckt=neu&besuche=1$"))
    expect(ana.get_by_role("heading", name="Du bist eingecheckt!")).to_be_visible()
    expect(ana.get_by_text("Willkommen bei TNS Stuttgart Testabend. Das ist dein 1. Besuch.")).to_be_visible()
    expect(ana.get_by_role("button", name="Mein Profil")).to_be_visible()  # bleibt angemeldet
    shot(ana, "53-eingecheckt")
    ana.goto(BASE + tns_checkin)
    expect(ana.get_by_role("heading", name="Du bist schon eingecheckt")).to_be_visible()
    step("Angemeldet: Scan checkt sofort ein, zweiter Scan zählt nicht doppelt")

    ben = browser.new_context(**mobile).new_page()
    ben.goto(BASE + tns_checkin)
    expect(ben).to_have_url(re.compile(r"/de/anmelden\?checkin=1$"))
    expect(ben.get_by_text("Danach wirst du automatisch eingecheckt")).to_be_visible()
    ben.goto(f"{BASE}/de/registrieren")
    fill_registration(ben, "ben@example.com", "Ben")
    expect(ben).to_have_url(re.compile(r"/de/termine/[0-9a-f-]{36}\?eingecheckt=neu&besuche=1$"))
    expect(ben.get_by_role("heading", name="Du bist eingecheckt!")).to_be_visible()
    step("Neu vor Ort: registrieren und danach automatisch eingecheckt")

    guest.goto(tns_url)
    expect(guest.get_by_text("2 Personen eingecheckt")).to_be_visible()
    step("Terminseite zählt die Check-ins")

    # Zukünftiger Termin: Check-in noch nicht offen
    admin.goto(f"{BASE}/de/team/termine")
    admin.get_by_role("listitem").filter(has_text="Messe Kornwestheim").get_by_role("link", name="Aushang erstellen").click()
    messe_checkin = checkin_path(admin)
    ana.goto(BASE + messe_checkin)
    expect(ana).to_have_url(re.compile(r"/de/termine\?checkin=checkin_not_open$"))
    expect(ana.get_by_text("Der Check-in öffnet 2 Stunden vor Beginn des Events.")).to_be_visible()
    step("Check-in für künftige Termine noch geschlossen")

    # Neuer Code macht den alten Aushang ungültig
    admin.goto(f"{BASE}/de/team/termine")
    admin.get_by_role("listitem").filter(has_text="TNS Stuttgart Testabend").get_by_role("link", name="Check-in-Aushang").click()
    admin.once("dialog", lambda d: d.accept())
    admin.get_by_role("button", name="Neuen Code erzeugen").click()
    expect(admin.get_by_text("Neuer Code erzeugt")).to_be_visible()
    expect(admin.get_by_test_id("checkin-url")).not_to_have_text(re.compile(re.escape(tns_checkin)))
    new_checkin = checkin_path(admin)
    ana.goto(BASE + tns_checkin)
    expect(ana.get_by_text("Dieser Check-in-Code ist ungültig oder wurde erneuert.")).to_be_visible()
    ana.goto(BASE + new_checkin)
    expect(ana.get_by_role("heading", name="Du bist schon eingecheckt")).to_be_visible()
    step("Neuer Code: alter Aushang ungültig, neuer funktioniert")

    # --- Abzeichen ------------------------------------------------------------------
    ana.goto(f"{BASE}/de/profil?tab=abzeichen")
    expect(ana.get_by_role("heading", name="Besuchte Events")).to_be_visible()
    expect(ana.get_by_role("link", name=re.compile("TNS Stuttgart Testabend"))).to_be_visible()
    guest.goto(f"{BASE}/de/u/Ana?tab=abzeichen")
    expect(guest.get_by_role("link", name=re.compile("TNS Stuttgart Testabend"))).to_be_visible()
    shot(guest, "54-besuchte-events")
    step("Besuchte Events im Profil sichtbar")

    # Stammgast: drei Besuche
    for odoo_id, name in ((8, "Messe Kornwestheim"),):
        mock("/test/odoo", {"id": odoo_id, "hours": -1})
    admin.goto(f"{BASE}/de/team/termine")
    admin.get_by_role("button", name="Jetzt aus Odoo holen").click()
    expect(admin.get_by_text("3 Termine übernommen")).to_be_visible(timeout=15000)
    admin.goto(BASE + "/de/team/termine")
    admin.get_by_role("listitem").filter(has_text="Messe Kornwestheim").get_by_role("link", name="Check-in-Aushang").click()
    ana.goto(BASE + checkin_path(admin))
    expect(ana.get_by_text("Das ist dein 2. Besuch.")).to_be_visible()
    step("Verschobener Termin aus Odoo übernommen, zweiter Besuch gezählt")

    ana.goto(listing_url)
    ana.get_by_role("link", name="Bearbeiten").click()
    expect(ana.get_by_role("checkbox", name=re.compile("Messe Kornwestheim"))).to_be_visible()
    step("Laufende Termine bleiben im Inserat wählbar")

    browser.close()

print(f"Alle {step_no} Schritte bestanden.")

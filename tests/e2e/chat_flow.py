"""Oberflächentest Phase 3 (App-Chat) im echten Browser mit zwei Personen.

Voraussetzungen wie in tests/e2e/README.md (frisch gestarteter mock_supabase.py!).
Ohne Echtzeit-Verbindung (Testserver) lädt der Chat alle 4 Sekunden nach; das prüft der Test mit.
Aufruf: python3 tests/e2e/chat_flow.py http://127.0.0.1:8787 [screenshot-ordner]
"""

import os
import re
import sys
import tempfile

from PIL import Image
from playwright.sync_api import expect, sync_playwright

BASE = sys.argv[1] if len(sys.argv) > 1 else "http://127.0.0.1:8787"
SHOTS = sys.argv[2] if len(sys.argv) > 2 else None
CHROME = os.environ.get("CHROME_PATH", "/usr/bin/google-chrome")
PASSWORD = "Sammeln-2026!"
step_no = 0


def step(name):
    global step_no
    step_no += 1
    print(f"  ✓ {step_no:02d} {name}")


def shot(page, name):
    if SHOTS:
        os.makedirs(SHOTS, exist_ok=True)
        page.screenshot(path=os.path.join(SHOTS, f"{name}.png"), full_page=False)


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


tmp = tempfile.mkdtemp()
photos = []
for i, color in enumerate([(160, 40, 120), (40, 40, 160)]):
    path = os.path.join(tmp, f"elsa{i}.jpg")
    Image.new("RGB", (900, 1260), color).save(path, "JPEG")
    photos.append(path)

with sync_playwright() as p:
    browser = p.chromium.launch(executable_path=CHROME, args=["--no-sandbox"])
    mobile = {"viewport": {"width": 390, "height": 844}, "locale": "de-DE"}

    admin = browser.new_context(**mobile).new_page()
    register(admin, "chefin@tracacon.de", "Chefin")
    seller = browser.new_context(**mobile).new_page()
    register(seller, "anbieterin@example.com", "Anbieterin")
    buyer = browser.new_context(**mobile).new_page()
    register(buyer, "kaeufer@example.com", "Kaeufer")
    step("Drei Konten angelegt")

    seller.goto(f"{BASE}/de/marktplatz/neu")
    seller.locator("#listing-photo-gallery").set_input_files(photos)
    for _ in photos:
        seller.get_by_role("button", name="Übernehmen").click()
    expect(seller.get_by_text("Wird hochgeladen")).to_have_count(0, timeout=15000)
    seller.get_by_label("Titel").fill("Elsa Enchanted Lorcana")
    seller.get_by_label("Spiel").select_option("lorcana")
    seller.get_by_label("Preis (€)").fill("300")
    seller.get_by_role("button", name="Inserat veröffentlichen").click()
    expect(seller).to_have_url(re.compile(r"/de/marktplatz/[0-9a-f-]{36}$"))
    listing_url = seller.url
    expect(seller.get_by_role("button", name=re.compile("Nachricht schreiben"))).to_have_count(0)
    step("Inserat angelegt; Anbieterin kann sich nicht selbst schreiben")

    guest = browser.new_context(**mobile).new_page()
    guest.goto(listing_url)
    expect(guest.get_by_text("Melde dich an, um dem Anbieter eine Nachricht zu schreiben.")).to_be_visible()
    step("Ohne Anmeldung nur Hinweis zum Anmelden")

    # --- Erste Nachricht ----------------------------------------------------
    buyer.goto(listing_url)
    buyer.get_by_role("button", name=re.compile("Nachricht schreiben")).click()
    expect(buyer).to_have_url(re.compile(r"/de/nachrichten/[0-9a-f-]{36}$"))
    conv_url = buyer.url
    expect(buyer.get_by_role("heading", name="@Anbieterin")).to_be_visible()
    expect(buyer.get_by_text("Schreib Anbieterin die erste Nachricht.")).to_be_visible()
    expect(buyer.get_by_text("Gib keine Passwörter oder Bankzugänge weiter")).to_be_visible()
    buyer.get_by_label("Nachricht", exact=True).fill("Hallo! Ist die Elsa noch zu haben?")
    buyer.get_by_role("button", name="Senden").click()
    expect(buyer.locator("li").get_by_text("Hallo! Ist die Elsa noch zu haben?")).to_be_visible()
    expect(buyer.get_by_label("Nachricht", exact=True)).to_have_value("")
    step("Interessent beginnt Unterhaltung aus dem Inserat und schreibt")

    buyer.goto(listing_url)
    expect(buyer.get_by_role("link", name="Zur Unterhaltung")).to_be_visible()
    step("Inserat zeigt danach „Zur Unterhaltung“")

    # --- Anbieterin sieht und antwortet -----------------------------------------
    seller.goto(f"{BASE}/de")
    expect(seller.get_by_role("link", name=re.compile("Nachrichten")).first).to_contain_text("1")
    seller.get_by_role("link", name=re.compile("Nachrichten")).first.click()
    expect(seller.get_by_text("Dein Inserat: Elsa Enchanted Lorcana")).to_be_visible()
    expect(seller.get_by_label("1 ungelesene Nachricht")).to_be_visible()
    shot(seller, "20-postfach")
    seller.get_by_role("link", name=re.compile("@Kaeufer")).click()
    expect(seller).to_have_url(conv_url)
    expect(seller.get_by_text("Hallo! Ist die Elsa noch zu haben?")).to_be_visible()
    step("Anbieterin sieht ungelesene Nachricht im Postfach mit Zähler")

    seller.goto(f"{BASE}/de")
    expect(seller.get_by_role("link", name=re.compile("Nachrichten")).first).not_to_contain_text("1")
    step("Nach dem Öffnen ist die Nachricht gelesen")

    seller.goto(conv_url)
    buyer.goto(conv_url)
    seller.get_by_label("Nachricht", exact=True).fill("Ja! Ich bringe sie\nzur nächsten TRACACON mit.")
    seller.get_by_role("button", name="Senden").click()
    expect(buyer.get_by_text("zur nächsten TRACACON mit.")).to_be_visible(timeout=10000)
    step("Antwort erscheint beim Interessenten ohne Neuladen")

    buyer.get_by_label("Nachricht", exact=True).fill("Super, bis Samstag!")
    buyer.get_by_label("Nachricht", exact=True).press("Control+Enter")
    expect(seller.get_by_text("Super, bis Samstag!")).to_be_visible(timeout=10000)
    shot(seller, "21-unterhaltung")
    step("Senden mit Strg+Enter; Nachricht erscheint bei der Anbieterin")

    # --- Melden ---------------------------------------------------------------
    seller.get_by_role("button", name="Optionen").click()
    seller.get_by_role("button", name=re.compile("Unterhaltung melden")).click()
    seller.get_by_label("Grund").select_option("scam")
    seller.get_by_label("Was ist das Problem? (optional)").fill("Will per Freunde-Zahlung zahlen")
    seller.get_by_role("button", name="Meldung senden").click()
    expect(seller.get_by_text("Danke! Das Team prüft deine Meldung.")).to_be_visible()
    seller.get_by_role("button", name="Schließen").click()
    admin.goto(f"{BASE}/de/moderation")
    expect(admin.get_by_text("Unterhaltung", exact=True)).to_be_visible()
    admin.get_by_role("link", name=re.compile("Unterhaltung lesen")).click()
    expect(admin.get_by_text("Hallo! Ist die Elsa noch zu haben?")).to_be_visible()
    expect(admin.get_by_text("Zwischen @Anbieterin (Anbieter) und @Kaeufer (Interessent)")).to_be_visible()
    step("Gemeldete Unterhaltung ist für das Team lesbar")

    # --- Blockieren -----------------------------------------------------------
    seller.goto(conv_url)
    seller.get_by_role("button", name="Optionen").click()
    seller.get_by_role("button", name=re.compile("Blockieren")).click()
    seller.get_by_role("button", name="Blockieren", exact=True).click()
    expect(seller.get_by_text("Erledigt.")).to_be_visible()
    seller.reload()
    expect(seller.get_by_text("Du hast @Kaeufer blockiert.")).to_be_visible()
    expect(seller.get_by_label("Nachricht", exact=True)).to_have_count(0)
    buyer.reload()
    expect(buyer.get_by_text("In dieser Unterhaltung können keine Nachrichten mehr gesendet werden.")).to_be_visible()
    expect(buyer.get_by_label("Nachricht", exact=True)).to_have_count(0)
    step("Blockieren sperrt die Unterhaltung für beide")

    seller.get_by_role("button", name="Optionen").click()
    seller.get_by_role("button", name=re.compile("Blockierung aufheben")).first.click()
    seller.get_by_role("button", name="Blockierung aufheben", exact=True).click()
    expect(seller.get_by_text("Erledigt.")).to_be_visible()
    buyer.reload()
    buyer.get_by_label("Nachricht", exact=True).fill("Alles klar?")
    buyer.get_by_role("button", name="Senden").click()
    expect(buyer.locator("li").get_by_text("Alles klar?")).to_be_visible()
    step("Blockierung aufheben; Schreiben geht wieder")

    # --- Ausblenden -----------------------------------------------------------
    buyer.get_by_role("button", name="Optionen").click()
    buyer.get_by_role("button", name=re.compile("Unterhaltung ausblenden")).click()
    expect(buyer).to_have_url(re.compile(r"/de/nachrichten$"))
    expect(buyer.get_by_text("Noch keine Nachrichten.")).to_be_visible()
    seller.goto(conv_url)
    seller.get_by_label("Nachricht", exact=True).fill("Bin Samstag ab 10 Uhr da.")
    seller.get_by_role("button", name="Senden").click()
    buyer.goto(f"{BASE}/de/nachrichten")
    expect(buyer.get_by_text("Bin Samstag ab 10 Uhr da.")).to_be_visible()
    step("Ausgeblendete Unterhaltung kommt mit neuer Nachricht zurück")

    # --- Fremde haben keinen Zugriff ----------------------------------------------
    admin.goto(conv_url)
    expect(admin.get_by_text("404")).to_be_visible()
    step("Unbeteiligte (auch das Team) öffnen die Unterhaltung nicht direkt")

    browser.close()

print(f"\nAlle {step_no} Schritte bestanden.")

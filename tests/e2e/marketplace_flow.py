"""Oberflächentest Phase 2 (Marktplatz) im echten Browser.

Voraussetzungen wie in tests/e2e/README.md (frisch gestarteter mock_supabase.py!).
Aufruf: python3 tests/e2e/marketplace_flow.py http://127.0.0.1:8787 [screenshot-ordner]
"""

import os
import re
import sys
import tempfile
import urllib.error
import urllib.request

from PIL import Image, ImageDraw
from playwright.sync_api import expect, sync_playwright

BASE = sys.argv[1] if len(sys.argv) > 1 else "http://127.0.0.1:8787"
SHOTS = sys.argv[2] if len(sys.argv) > 2 else None
MOCK = os.environ.get("MOCK_URL", "http://127.0.0.1:54321")
CHROME = os.environ.get("CHROME_PATH", "/usr/bin/google-chrome")
step_no = 0


def step(name):
    global step_no
    step_no += 1
    print(f"  ✓ {step_no:02d} {name}")


def shot(page, name):
    if SHOTS:
        os.makedirs(SHOTS, exist_ok=True)
        page.screenshot(path=os.path.join(SHOTS, f"{name}.png"), full_page=True)


def make_photo(path, color, label):
    img = Image.new("RGB", (1200, 1680), color)
    d = ImageDraw.Draw(img)
    d.rectangle([60, 60, 1140, 1620], outline="white", width=20)
    d.text((120, 120), label, fill="white")
    img.save(path, "JPEG", quality=92)
    return path


def file_exists(url):
    try:
        with urllib.request.urlopen(url) as r:
            return r.status == 200
    except urllib.error.HTTPError:
        return False


def login(page, email):
    page.goto(f"{BASE}/de/anmelden?mit=code")
    page.get_by_label("E-Mail-Adresse").fill(email)
    page.get_by_role("button", name="Code senden").click()
    page.get_by_label("Einmalcode").fill("123456")
    page.get_by_role("button", name="Code bestätigen").click()


def onboard(page, nickname):
    expect(page).to_have_url(re.compile(r"/de/willkommen$"))
    page.get_by_label("Nickname").fill(nickname)
    page.get_by_label("Passwort", exact=True).fill("Sammeln-2026!")
    page.get_by_label("Passwort wiederholen").fill("Sammeln-2026!")
    page.get_by_label("Ich bin mindestens 16 Jahre alt.").check()
    page.get_by_role("checkbox", name=re.compile("Community-Regeln")).check()
    page.get_by_role("button", name="Los geht's").click()
    expect(page).to_have_url(re.compile(r"/de/profil$"))


def wait_uploads(page):
    expect(page.get_by_text("Wird hochgeladen")).to_have_count(0, timeout=15000)


tmp = tempfile.mkdtemp()
front = make_photo(os.path.join(tmp, "vorderseite.jpg"), (200, 80, 30), "GLURAK VORNE")
back = make_photo(os.path.join(tmp, "rueckseite.jpg"), (30, 60, 160), "GLURAK HINTEN")

with sync_playwright() as p:
    browser = p.chromium.launch(executable_path=CHROME, args=["--no-sandbox"])
    mobile = {"viewport": {"width": 390, "height": 844}, "locale": "de-DE"}

    # Admin zuerst (erster Nutzer im Testserver wird Admin)
    admin = browser.new_context(**mobile).new_page()
    login(admin, "chefin@tracacon.de")
    onboard(admin, "Chefin")

    seller = browser.new_context(**mobile).new_page()
    login(seller, "sammlerin@example.com")
    onboard(seller, "Sammlerin")
    step("Admin und Verkäuferin angemeldet")

    # --- Inserat mit Fotos anlegen -------------------------------------------
    seller.get_by_role("link", name="Inserieren", exact=True).click()
    expect(seller).to_have_url(re.compile(r"/de/marktplatz/neu$"))
    expect(seller.get_by_text("Pflicht: ein Foto der Vorderseite und eins der Rückseite.")).to_be_visible()
    seller.locator('input[type="file"]').set_input_files([front])
    wait_uploads(seller)
    expect(seller.get_by_text("Vorderseite", exact=True)).to_be_visible()
    seller.get_by_label("Titel").fill("Nur ein Foto")
    seller.get_by_label("Spiel").select_option("pokemon")
    seller.get_by_label("Preis (€)").fill("5")
    seller.get_by_role("button", name="Inserat veröffentlichen").click()
    expect(seller.get_by_text("mindestens zwei Fotos hoch: Vorderseite und Rückseite")).to_be_visible()
    step("Einzelkarte ohne Rückseite wird abgelehnt")

    seller.get_by_label("Titel").fill("")
    seller.get_by_label("Preis (€)").fill("")
    seller.locator('input[type="file"]').set_input_files([back])
    wait_uploads(seller)
    expect(seller.locator("li img")).to_have_count(2)
    expect(seller.get_by_text("Rückseite", exact=True)).to_be_visible()
    shot(seller, "09-vorder-rueckseite")
    step("Vorder- und Rückseite im Browser verkleinert und hochgeladen")

    seller.get_by_role("button", name="Inserat veröffentlichen").click()
    expect(seller.get_by_text("Der Titel braucht mindestens 3 Zeichen.")).to_be_visible()
    expect(seller.locator("li img")).to_have_count(2)
    step("Pflichtfelder werden geprüft, Fotos bleiben erhalten")

    seller.get_by_label("Titel").fill("Glurak ex 199/165 Pokémon 151")
    expect(seller.get_by_label("Spiel")).to_have_value("pokemon")
    seller.get_by_label("Preis (€)").fill("abc")
    seller.get_by_role("button", name="Inserat veröffentlichen").click()
    expect(seller.get_by_text("Bitte gib einen gültigen Preis ein")).to_be_visible()
    seller.get_by_label("Preis (€)").fill("124,50")
    seller.get_by_label("Verhandlungsbasis (VB)").check()
    seller.get_by_label("Beschreibung").fill("Special Illustration Rare, direkt aus dem Pack in die Hülle.")
    seller.get_by_label("Zustand").select_option("near_mint")
    seller.get_by_label("Ort").fill("Stuttgart")
    seller.get_by_label("Versand möglich").check()
    shot(seller, "10-inserat-formular")
    seller.get_by_role("button", name="Inserat veröffentlichen").click()
    expect(seller).to_have_url(re.compile(r"/de/marktplatz/[0-9a-f-]{36}$"))
    glurak_url = seller.url
    expect(seller.get_by_role("heading", name="Glurak ex 199/165 Pokémon 151")).to_be_visible()
    expect(seller.get_by_text("124,50 €")).to_be_visible()
    expect(seller.get_by_text("Near Mint (NM)")).to_be_visible()
    expect(seller.get_by_text("Auf einer TRACACON · Versand möglich")).to_be_visible()
    imgs = seller.locator("article img")
    expect(imgs).to_have_count(2)
    seller.wait_for_function("() => [...document.querySelectorAll('article img')].every(i => i.complete && i.naturalWidth > 0)")
    photo_srcs = imgs.evaluate_all("els => els.map(e => e.src)")
    assert all(file_exists(s) for s in photo_srcs)
    shot(seller, "11-inserat-detail")
    step("Inserat veröffentlicht, Fotos werden angezeigt")

    seller.goto(f"{BASE}/de/marktplatz/neu")
    seller.get_by_label("Titel").fill("Suche Luffy Leader Alt Art")
    seller.get_by_label("Spiel").select_option("one_piece")
    seller.get_by_label("Art", exact=True).select_option("sealed")
    seller.get_by_text("Tausch", exact=True).click()
    expect(seller.get_by_label("Preis (€)")).to_have_count(0)
    seller.get_by_role("button", name="Inserat veröffentlichen").click()
    expect(seller.get_by_role("heading", name="Suche Luffy Leader Alt Art")).to_be_visible()
    step("Tauschangebot ohne Preis und ohne Foto angelegt")

    # --- Suche ohne Anmeldung --------------------------------------------------
    guest = browser.new_context(**mobile).new_page()
    guest.goto(f"{BASE}/de/marktplatz")
    expect(guest.get_by_text("2 Inserate")).to_be_visible()
    guest.get_by_role("searchbox").fill("luffy")
    guest.get_by_role("button", name="Filtern").click()
    expect(guest.get_by_text("1 Inserat", exact=True)).to_be_visible()
    expect(guest.get_by_text("Suche Luffy Leader Alt Art")).to_be_visible()
    guest.goto(f"{BASE}/de/marktplatz?spiel=pokemon&preis_max=200")
    expect(guest.get_by_text("1 Inserat", exact=True)).to_be_visible()
    shot(guest, "12-marktplatz-gefiltert")
    guest.goto(f"{BASE}/de/marktplatz?preis_max=50")
    expect(guest.get_by_text("Keine passenden Inserate gefunden.")).to_be_visible()
    guest.goto(glurak_url)
    expect(guest.get_by_text("Melde dich an, um dem Anbieter eine Nachricht zu schreiben.")).to_be_visible()
    expect(guest.get_by_text("Inserat melden")).to_have_count(0)
    expect(guest.get_by_role("link", name="Bearbeiten")).to_have_count(0)
    step("Besucher ohne Anmeldung sehen, suchen und filtern")

    guest.goto(f"{BASE}/de/marktplatz/neu")
    expect(guest).to_have_url(re.compile(r"/de/anmelden$"))
    step("Inserieren nur mit Anmeldung")

    # --- Melden ----------------------------------------------------------------
    buyer = browser.new_context(**mobile).new_page()
    login(buyer, "kaeufer@example.com")
    onboard(buyer, "Kaeufer")
    buyer.goto(glurak_url)
    expect(buyer.get_by_role("button", name=re.compile("Nachricht schreiben"))).to_be_visible()
    buyer.get_by_text("Inserat melden").click()
    buyer.get_by_label("Grund").select_option("counterfeit")
    buyer.get_by_label("Was ist das Problem? (optional)").fill("Die Schrift sieht falsch aus.")
    buyer.get_by_role("button", name="Meldung senden").click()
    expect(buyer.get_by_text("Danke! Das Team prüft deine Meldung.")).to_be_visible()
    buyer.goto(f"{BASE}/de/u/Sammlerin")
    buyer.get_by_text("Profil melden").click()
    buyer.get_by_label("Grund").select_option("spam")
    buyer.get_by_role("button", name="Meldung senden").click()
    expect(buyer.get_by_text("Danke! Das Team prüft deine Meldung.")).to_be_visible()
    step("Mitglied meldet Inserat und Profil")

    seller.goto(glurak_url)
    expect(seller.get_by_text("Inserat melden")).to_have_count(0)
    step("Eigene Inserate lassen sich nicht melden")

    # --- Bearbeiten ----------------------------------------------------------
    seller.get_by_role("link", name="Bearbeiten").click()
    expect(seller.get_by_role("heading", name="Inserat bearbeiten")).to_be_visible()
    expect(seller.get_by_label("Preis (€)")).to_have_value("124,50")
    seller.get_by_role("button", name="Foto entfernen").nth(1).click()
    seller.get_by_role("button", name="Änderungen speichern").click()
    expect(seller.get_by_text("mindestens zwei Fotos hoch: Vorderseite und Rückseite")).to_be_visible()
    step("Bearbeiten: Rückseite kann nicht einfach entfernt werden")

    third = make_photo(os.path.join(tmp, "rueckseite2.jpg"), (20, 120, 60), "NEUE RUECKSEITE")
    seller.locator('input[type="file"]').set_input_files([third])
    wait_uploads(seller)
    seller.get_by_label("Preis (€)").fill("110")
    seller.get_by_role("button", name="Änderungen speichern").click()
    expect(seller).to_have_url(re.compile(re.escape(glurak_url) + "$"))
    expect(seller.get_by_text("110,00 €")).to_be_visible()
    expect(seller.locator("article img")).to_have_count(2)
    assert file_exists(photo_srcs[0]) and not file_exists(photo_srcs[1])
    photo_srcs = seller.locator("article img").evaluate_all("els => els.map(e => e.src)")
    step("Bearbeiten: Rückseite ersetzt, altes Foto auch im Speicher gelöscht")

    # --- Status ------------------------------------------------------------------
    seller.get_by_role("button", name="Reserviert").click()
    expect(seller.get_by_text("Status geändert.")).to_be_visible()
    guest.goto(f"{BASE}/de/marktplatz")
    expect(guest.locator("a", has_text="Glurak").get_by_text("Reserviert")).to_be_visible()
    step("Reserviert wird im Marktplatz angezeigt")

    # --- Moderation --------------------------------------------------------------
    admin.goto(f"{BASE}/de")
    expect(admin.get_by_role("link", name="Moderation")).to_contain_text("2")
    admin.get_by_role("link", name="Moderation").click()
    expect(admin.get_by_text("2 offene Meldungen")).to_be_visible()
    expect(admin.get_by_text("Die Schrift sieht falsch aus.")).to_be_visible()
    shot(admin, "13-moderation")
    first = admin.locator("li", has_text="Die Schrift sieht falsch aus.")
    first.get_by_label("Begründung für den Anbieter").fill("weg")
    first.get_by_role("button", name="Inserat entfernen").click()
    expect(first.get_by_text("Bitte gib eine Begründung an")).to_be_visible()
    first.get_by_label("Begründung für den Anbieter").fill("Nach Prüfung durch das Team als Fälschung eingestuft.")
    first.get_by_role("button", name="Inserat entfernen").click()
    expect(admin.locator("li", has_text="Die Schrift sieht falsch aus.")).to_have_count(0)
    expect(admin.get_by_text("1 offene Meldung", exact=True)).to_be_visible()
    second = admin.locator("li", has_text="@Sammlerin").filter(has_text="Profil")
    second.get_by_role("button", name="Kein Verstoß").click()
    expect(admin.get_by_text("Keine offenen Meldungen.")).to_be_visible()
    step("Team entfernt Inserat mit Begründung und weist Profilmeldung ab")

    guest.goto(glurak_url)
    expect(guest.get_by_text("404")).to_be_visible()
    seller.goto(glurak_url)
    expect(seller.get_by_text("Vom Team entfernt")).to_be_visible()
    expect(seller.get_by_text("Nach Prüfung durch das Team als Fälschung eingestuft.")).to_be_visible()
    expect(seller.get_by_role("link", name="Bearbeiten")).to_have_count(0)
    shot(seller, "14-entfernt")
    seller.goto(glurak_url + "/bearbeiten")
    expect(seller).to_have_url(re.compile(re.escape(glurak_url) + "$"))
    seller.goto(f"{BASE}/de/meine-inserate")
    expect(seller.get_by_text("Entfernt")).to_be_visible()
    step("Verkäuferin sieht Begründung, kann entferntes Inserat nicht bearbeiten")

    admin.goto(glurak_url)
    admin.get_by_role("button", name="Wieder freigeben").click()
    expect(admin.get_by_text("Erledigt.")).to_be_visible()
    guest.goto(glurak_url)
    expect(guest.get_by_role("heading", name="Glurak ex 199/165 Pokémon 151")).to_be_visible()
    step("Team gibt Inserat wieder frei")

    # --- Erledigt und Löschen ----------------------------------------------------
    seller.goto(glurak_url)
    seller.get_by_role("button", name="Erledigt").click()
    expect(seller.get_by_text("Status geändert.")).to_be_visible()
    guest.goto(f"{BASE}/de/marktplatz")
    expect(guest.get_by_text("1 Inserat", exact=True)).to_be_visible()
    step("Erledigte Inserate verschwinden aus dem Marktplatz")

    seller.goto(glurak_url)
    seller.get_by_role("button", name="Löschen").click()
    seller.get_by_role("button", name="Ja, endgültig löschen").click()
    expect(seller).to_have_url(re.compile(r"/de/meine-inserate$"))
    expect(seller.get_by_text("Glurak")).to_have_count(0)
    assert not file_exists(photo_srcs[0])
    shot(seller, "15-meine-inserate")
    step("Löschen entfernt Inserat und Fotos")

    # --- Englisch und Startseite -------------------------------------------------
    guest.goto(f"{BASE}/en/marktplatz")
    expect(guest.get_by_role("heading", name="Marketplace")).to_be_visible()
    expect(guest.get_by_text("1 listing", exact=True)).to_be_visible()
    guest.goto(f"{BASE}/de")
    expect(guest.get_by_role("heading", name="Neu im Marktplatz")).to_be_visible()
    shot(guest, "16-start")
    step("Englische Oberfläche und neue Inserate auf der Startseite")

    browser.close()

print(f"\nAlle {step_no} Schritte bestanden.")

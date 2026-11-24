"""Oberflächentest Social: Profilmenü, Profilbild, Privatsphäre, Folgen mit Anfrage, Abzeichen, Fotos im Chat.

Voraussetzungen wie in tests/e2e/README.md (frisch gestarteter mock_supabase.py!).
Aufruf: python3 tests/e2e/social_flow.py http://127.0.0.1:8787 [screenshot-ordner]
"""

import os
import re
import sys
import tempfile

from PIL import Image, ImageDraw
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


def open_menu(page):
    page.get_by_role("button", name="Mein Profil").click()
    expect(page.get_by_role("menu")).to_be_visible()


def images_loaded(page, selector):
    page.wait_for_function(
        "sel => { const els = [...document.querySelectorAll(sel)]; return els.length > 0 && els.every(i => i.complete && i.naturalWidth > 0); }",
        arg=selector,
    )


tmp = tempfile.mkdtemp()


def picture(name, color, size=(1000, 800)):
    path = os.path.join(tmp, name)
    img = Image.new("RGB", size, color)
    ImageDraw.Draw(img).ellipse([200, 100, 800, 700], fill=(255, 255, 255))
    img.save(path, "JPEG")
    return path


with sync_playwright() as p:
    browser = p.chromium.launch(executable_path=CHROME, args=["--no-sandbox"])
    mobile = {"viewport": {"width": 390, "height": 844}, "locale": "de-DE", "has_touch": True}

    admin = browser.new_context(**mobile).new_page()
    register(admin, "chefin@tracacon.de", "Chefin")
    seller = browser.new_context(**mobile).new_page()
    register(seller, "sammlerin@example.com", "Sammlerin")
    fan = browser.new_context(**mobile).new_page()
    register(fan, "fan@example.com", "Fan")
    step("Drei Konten registriert; nach der Registrierung erscheint das eigene Profil")

    # --- Profilmenü ---------------------------------------------------------------
    expect(seller.get_by_role("heading", name="@Sammlerin")).to_be_visible()
    expect(seller.get_by_role("link", name="Profil bearbeiten")).to_be_visible()
    open_menu(seller)
    for label in ["Meine Inserate", "Nachrichten", "Meine Follower", "Folge ich", "Follower-Anfragen", "Abzeichen", "Einstellungen"]:
        expect(seller.get_by_role("menu").get_by_role("link", name=re.compile(label))).to_be_visible()
    expect(seller.get_by_role("menu").get_by_role("button", name="Abmelden")).to_be_visible()
    shot(seller, "30-profilmenue")
    seller.get_by_role("menu").get_by_role("link", name=re.compile("Meine Inserate")).click()
    expect(seller).to_have_url(re.compile(r"/de/meine-inserate$"))
    expect(seller.get_by_role("menu")).to_have_count(0)
    step("Tippen auf das Profil öffnet ein Menü; ein Eintrag führt weiter und schließt es")

    # --- Profilbild und Angaben ---------------------------------------------------
    seller.goto(f"{BASE}/de/einstellungen")
    seller.get_by_role("button", name="Profilbild hinzufügen").first.click()
    sheet = seller.get_by_role("dialog", name="Profilbild")
    expect(sheet.get_by_text("Foto aufnehmen")).to_be_visible()
    assert seller.locator("#avatar-camera").get_attribute("capture") == "user"
    sheet.get_by_role("button", name="Abbrechen").click()
    seller.locator("#avatar-gallery").set_input_files(picture("ich.jpg", (200, 60, 90)))
    cropper = seller.get_by_role("dialog", name="Ausschnitt wählen")
    expect(cropper).to_be_visible()
    box = cropper.locator("div.touch-none")
    bb = box.bounding_box()
    seller.mouse.move(bb["x"] + bb["width"] / 2, bb["y"] + bb["height"] / 2)
    seller.mouse.down()
    seller.mouse.move(bb["x"] + bb["width"] / 2 + 40, bb["y"] + bb["height"] / 2 + 10, steps=5)
    seller.mouse.up()
    cropper.get_by_label("Zoomen").fill("1.5")
    shot(seller, "29-profilbild-ausschnitt")
    cropper.get_by_role("button", name="Übernehmen").click()
    expect(seller.get_by_role("button", name="Profilbild ändern").first).to_be_visible(timeout=15000)
    seller.get_by_label("Über mich").fill("Sammle Vintage-Pokémon und tausche gern.")
    seller.get_by_role("button", name="Speichern", exact=True).first.click()
    expect(seller.get_by_text("Gespeichert.").first).to_be_visible()
    seller.goto(f"{BASE}/de/profil")
    images_loaded(seller, "header img")
    expect(seller.get_by_text("Sammle Vintage-Pokémon und tausche gern.")).to_be_visible()
    step("Profilbild: Menü mit Frontkamera, Ausschnitt verschoben und gezoomt, hochgeladen")

    # --- Inserat, damit es etwas zu sehen gibt ----------------------------------------
    seller.goto(f"{BASE}/de/marktplatz/neu")
    seller.get_by_label("Titel").fill("Base Set Display")
    seller.get_by_label("Spiel").select_option("pokemon")
    seller.get_by_label("Art", exact=True).select_option("sealed")
    seller.get_by_label("Preis (€)").fill("9000")
    seller.get_by_role("button", name="Inserat veröffentlichen").click()
    expect(seller).to_have_url(re.compile(r"/de/marktplatz/[0-9a-f-]{36}$"))
    listing_url = seller.url
    seller.goto(f"{BASE}/de/profil")
    expect(seller.get_by_role("link", name=re.compile("Base Set Display"))).to_be_visible()
    step("Inserate erscheinen im Raster auf dem Profil")

    # --- Privatsphäre ---------------------------------------------------------------
    seller.goto(f"{BASE}/de/einstellungen")
    seller.get_by_label(re.compile("Nur meine Follower")).check()
    seller.get_by_label(re.compile("Follower bestätigen")).check()
    seller.get_by_role("button", name="Speichern", exact=True).nth(1).click()
    expect(seller.get_by_text("Gespeichert.").last).to_be_visible()
    shot(seller, "31-einstellungen")
    step("Profil auf „nur Follower“ und Follower-Bestätigung gestellt")

    fan.goto(f"{BASE}/de/u/Sammlerin")
    expect(fan.get_by_text("Dieses Profil ist privat")).to_be_visible()
    expect(fan.get_by_text("Sammle Vintage-Pokémon")).to_have_count(0)
    expect(fan.locator("header img")).to_have_count(0)
    expect(fan.get_by_role("link", name=re.compile("Base Set Display"))).to_have_count(0)
    shot(fan, "32-privates-profil")
    guest = browser.new_context(**mobile).new_page()
    guest.goto(f"{BASE}/de/u/Sammlerin")
    expect(guest.get_by_text("Dieses Profil ist privat")).to_be_visible()
    guest.goto(listing_url)
    expect(guest.get_by_role("heading", name="Base Set Display")).to_be_visible()
    step("Privates Profil verbirgt Bild, Beschreibung und Inserate; Marktplatz bleibt sichtbar")

    # --- Folgen mit Anfrage -----------------------------------------------------------
    fan.get_by_role("button", name="Folgen", exact=True).click()
    expect(fan.get_by_role("button", name="Angefragt")).to_be_visible()
    seller.goto(f"{BASE}/de/profil")
    open_menu(seller)
    expect(seller.get_by_role("menu").get_by_role("link", name=re.compile("Follower-Anfragen"))).to_contain_text("1")
    seller.get_by_role("menu").get_by_role("link", name=re.compile("Follower-Anfragen")).click()
    expect(seller.get_by_role("link", name="@Fan")).to_be_visible()
    shot(seller, "33-anfragen")
    seller.get_by_role("button", name="Annehmen").click()
    expect(seller.get_by_text("Keine offenen Anfragen.")).to_be_visible()
    step("Folgen erzeugt eine Anfrage, die angenommen wird")

    fan.reload()
    expect(fan.get_by_text("Sammle Vintage-Pokémon und tausche gern.")).to_be_visible()
    expect(fan.get_by_role("button", name="Folge ich")).to_be_visible()
    images_loaded(fan, "header img")
    expect(fan.get_by_role("link", name=re.compile("Base Set Display"))).to_be_visible()
    shot(fan, "34-fremdes-profil")
    step("Nach Annahme sieht der Follower das volle Profil")

    # --- Listen -------------------------------------------------------------------------
    seller.goto(f"{BASE}/de/u/Sammlerin/follower")
    expect(seller.get_by_role("link", name="@Fan")).to_be_visible()
    expect(seller.get_by_role("button", name="Entfernen")).to_be_visible()
    fan.goto(f"{BASE}/de/u/Fan/folgt")
    expect(fan.get_by_role("link", name="@Sammlerin")).to_be_visible()
    step("Follower- und Folge-ich-Listen")

    fan.goto(f"{BASE}/de/u/Chefin")
    fan.get_by_role("button", name="Folgen", exact=True).click()
    expect(fan.get_by_role("button", name="Folge ich")).to_be_visible()
    fan.reload()
    expect(fan.get_by_role("link", name=re.compile("1\\s*Follower"))).to_be_visible()
    step("Öffentlichem Profil sofort folgen, Zähler steigt")

    fan.get_by_role("link", name=re.compile("Abzeichen")).click()
    expect(fan.get_by_text("Team", exact=True)).to_be_visible()
    expect(fan.get_by_text("Gründungsmitglied")).to_be_visible()
    shot(fan, "35-abzeichen")
    step("Abzeichen-Bereich zeigt Team und Gründungsmitglied")

    fan.get_by_role("button", name="Folge ich").click()
    expect(fan.get_by_role("button", name="Folgen", exact=True)).to_be_visible()
    step("Entfolgen")

    # --- Fotos im Chat ------------------------------------------------------------------
    fan.goto(listing_url)
    fan.get_by_role("button", name=re.compile("Nachricht schreiben")).click()
    expect(fan).to_have_url(re.compile(r"/de/nachrichten/[0-9a-f-]{36}$"))
    conv_url = fan.url
    fan.get_by_label("Nachricht", exact=True).fill("So sieht meine Tauschkarte aus:")
    fan.get_by_role("button", name="Foto anhängen").click()
    expect(fan.get_by_role("dialog", name="Foto anhängen").get_by_text("Foto aufnehmen")).to_be_visible()
    fan.get_by_role("dialog", name="Foto anhängen").get_by_role("button", name="Abbrechen").click()
    fan.locator("#chat-photo-gallery").set_input_files(picture("karte.jpg", (30, 120, 200), (900, 1260)))
    preview = fan.get_by_role("dialog", name="Foto senden")
    expect(preview).to_be_visible()
    expect(preview.get_by_label("Text zum Foto")).to_have_value("So sieht meine Tauschkarte aus:")
    shot(fan, "37-foto-vorschau")
    expect(fan.locator("ol img")).to_have_count(0)  # vor dem Bestätigen wird nichts gesendet
    preview.get_by_role("button", name="Senden").click()
    expect(fan.get_by_text("Foto wird gesendet")).to_have_count(0, timeout=15000)
    expect(fan.locator("li").get_by_text("So sieht meine Tauschkarte aus:")).to_be_visible()
    images_loaded(fan, "ol img")
    expect(fan.get_by_label("Nachricht", exact=True)).to_have_value("")
    step("Chat-Foto: Vorschau mit Text, erst nach Bestätigen gesendet")

    seller.goto(conv_url)
    images_loaded(seller, "ol img")
    src = seller.locator("ol img").first.get_attribute("src")
    assert "/object/sign/chat-photos/" in src, src
    shot(seller, "36-chat-foto")
    seller.goto(f"{BASE}/de/nachrichten")
    expect(seller.get_by_text("📷 So sieht meine Tauschkarte aus:")).to_be_visible()
    step("Empfängerin sieht das Foto (geschützte, signierte Adresse) und Kennzeichen im Postfach")

    stranger = browser.new_context(**mobile).new_page()
    bad = src.split("?token=")[0] + "?token=falsch"
    resp = stranger.request.get(bad)
    assert resp.status != 200
    step("Chat-Foto ist ohne gültige Signatur nicht abrufbar")

    browser.close()

print(f"\nAlle {step_no} Schritte bestanden.")

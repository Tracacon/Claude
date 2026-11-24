"""Oberflächentest Phase 1 im echten Browser.

Voraussetzungen (siehe tests/e2e/README.md):
  1. python3 tests/e2e/mock_supabase.py 54321
  2. App gebaut und gestartet mit NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321
  3. python3 tests/e2e/flow.py http://127.0.0.1:3005 [screenshot-ordner]
"""

import os
import re
import sys

from playwright.sync_api import expect, sync_playwright

BASE = sys.argv[1] if len(sys.argv) > 1 else "http://127.0.0.1:3005"
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
        page.screenshot(path=os.path.join(SHOTS, f"{name}.png"), full_page=True)


PASSWORD = "Sammeln-2026!"


def fill_registration(page, email, nickname, password=PASSWORD, password2=None):
    page.get_by_label("E-Mail-Adresse").fill(email)
    page.get_by_label("Nickname").fill(nickname)
    page.get_by_label("Passwort", exact=True).fill(password)
    page.get_by_label("Passwort wiederholen").fill(password2 or password)
    page.get_by_label("Ich bin mindestens 16 Jahre alt.").check()
    page.get_by_role("checkbox", name=re.compile("Community-Regeln")).check()
    page.get_by_role("button", name="Konto erstellen").click()


def register(page, email, nickname):
    page.goto(f"{BASE}/de/registrieren")
    fill_registration(page, email, nickname)
    expect(page.get_by_role("heading", name="E-Mail-Adresse bestätigen")).to_be_visible()
    page.get_by_label("Bestätigungscode").fill("123456")
    page.get_by_role("button", name="Konto aktivieren").click()


with sync_playwright() as p:
    browser = p.chromium.launch(executable_path=CHROME, args=["--no-sandbox"])
    mobile = {"viewport": {"width": 390, "height": 844}, "locale": "de-DE"}

    # --- Erster Nutzer (wird im Testserver Admin) ---------------------------
    admin_ctx = browser.new_context(**mobile)
    a = admin_ctx.new_page()
    a.goto(f"{BASE}/")
    expect(a).to_have_url(re.compile(r"/de$"))
    expect(a.get_by_role("heading", name="Collect. Connect. Trade.")).to_be_visible()
    shot(a, "01-start")
    step("Startseite leitet auf /de und zeigt den Claim")

    a.get_by_role("link", name="Anmelden", exact=True).first.click()
    expect(a.get_by_role("heading", name="Anmelden")).to_be_visible()
    expect(a.get_by_label("Passwort", exact=True)).to_be_visible()
    expect(a.get_by_text("Code senden")).to_have_count(0)
    shot(a, "02-anmelden")
    a.get_by_role("link", name="Registrieren").click()
    expect(a).to_have_url(re.compile(r"/de/registrieren$"))
    step("Anmeldeseite nur mit E-Mail und Passwort, Registrierung auf eigener Seite")

    a.get_by_role("button", name="Konto erstellen").click()
    expect(a.get_by_text("Bitte gib eine gültige E-Mail-Adresse ein.")).to_be_visible()
    expect(a.get_by_text("Der Nickname passt nicht")).to_be_visible()
    expect(a.get_by_text("Das Passwort braucht mindestens 8 Zeichen.")).to_be_visible()
    expect(a.get_by_text("Die App ist ab 16 Jahren. Bitte bestätige dein Alter.")).to_be_visible()
    expect(a.get_by_text("Bitte akzeptiere die Community-Regeln.")).to_be_visible()
    step("Registrierung prüft alle Pflichtangaben")

    fill_registration(a, "dani@tracacon.de", "Dani_TCG", PASSWORD, "anders-12345")
    expect(a.get_by_text("Die beiden Passwörter stimmen nicht überein.")).to_be_visible()
    expect(a.get_by_label("Nickname")).to_have_value("Dani_TCG")
    step("Ungleiche Passwörter werden gemeldet, Eingaben bleiben")

    fill_registration(a, "dani@tracacon.de", "Dani_TCG")
    expect(a.get_by_role("heading", name="E-Mail-Adresse bestätigen")).to_be_visible()
    shot(a, "03-bestaetigen")
    a.get_by_label("Bestätigungscode").fill("000000")
    a.get_by_role("button", name="Konto aktivieren").click()
    expect(a.get_by_text("Der Code ist falsch oder abgelaufen")).to_be_visible()
    a.get_by_label("Bestätigungscode").fill("123456")
    a.get_by_role("button", name="Konto aktivieren").click()
    expect(a).to_have_url(re.compile(r"/de/profil$"))
    expect(a.get_by_role("heading", name="@Dani_TCG")).to_be_visible()
    step("Konto mit Bestätigungscode aktiviert, Profil direkt fertig")

    a.get_by_role("link", name="Profil bearbeiten").click()
    expect(a).to_have_url(re.compile(r"/de/einstellungen$"))
    a.get_by_label("Ort", exact=True).fill("Stuttgart")
    a.get_by_label("Über mich").fill("Sammle Pokémon und One Piece.")
    a.get_by_label("Link (z. B. Instagram)").fill("http://unsicher.de")
    a.get_by_role("button", name="Speichern", exact=True).first.click()
    expect(a.get_by_text("Bitte gib einen vollständigen Link mit https:// ein.")).to_be_visible()
    a.get_by_label("Link (z. B. Instagram)").fill("https://instagram.com/tracacon")
    a.get_by_role("button", name="Speichern", exact=True).first.click()
    expect(a.get_by_text("Gespeichert.").first).to_be_visible()
    shot(a, "03-profil")
    step("Profil speichern mit Prüfung des Links")

    a.goto(f"{BASE}/de/willkommen")
    expect(a).to_have_url(re.compile(r"/de/profil$"))
    a.goto(f"{BASE}/de/anmelden")
    expect(a).to_have_url(re.compile(r"/de/profil$"))
    a.goto(f"{BASE}/de/registrieren")
    expect(a).to_have_url(re.compile(r"/de/profil$"))
    step("Angemeldete werden von Anmeldung und Registrierung weitergeleitet")

    dup = browser.new_context(**mobile).new_page()
    dup.goto(f"{BASE}/de/registrieren")
    fill_registration(dup, "dani@tracacon.de", "Andere_Person")
    expect(dup.get_by_text("Für diese E-Mail-Adresse gibt es schon ein Konto.")).to_be_visible()
    step("Doppelte Registrierung derselben E-Mail wird verhindert")

    # --- Zweites Gerät: Anmeldung mit Passwort ------------------------------
    phone = browser.new_context(**mobile).new_page()
    phone.goto(f"{BASE}/de/anmelden")
    expect(phone.get_by_role("heading", name="Anmelden")).to_be_visible()
    phone.get_by_label("E-Mail-Adresse").fill("dani@tracacon.de")
    phone.get_by_label("Passwort", exact=True).fill("falsch-falsch")
    phone.get_by_role("button", name="Anmelden", exact=True).click()
    expect(phone.get_by_text("E-Mail-Adresse oder Passwort ist falsch.")).to_be_visible()
    phone.get_by_label("Passwort", exact=True).fill(PASSWORD)
    phone.get_by_role("button", name="Anmelden", exact=True).click()
    expect(phone).to_have_url(re.compile(r"/de/profil$"))
    expect(phone.get_by_role("heading", name="@Dani_TCG")).to_be_visible()
    shot(phone, "07-zweites-geraet")
    step("Anmeldung auf einem zweiten Gerät mit E-Mail und Passwort")

    phone.goto(f"{BASE}/de/einstellungen")
    phone.get_by_label("Neues Passwort").fill("Neues-Passwort-1")
    phone.get_by_label("Passwort wiederholen").fill("Neues-Passwort-1")
    phone.get_by_role("button", name="Passwort speichern").click()
    expect(phone.get_by_text("Passwort gespeichert.")).to_be_visible()
    step("Passwort im Profil geändert")

    forgot = browser.new_context(**mobile).new_page()
    forgot.goto(f"{BASE}/de/anmelden")
    forgot.get_by_role("link", name="Passwort vergessen?").click()
    expect(forgot.get_by_role("heading", name="Passwort vergessen")).to_be_visible()
    forgot.get_by_label("E-Mail-Adresse").fill("dani@tracacon.de")
    forgot.get_by_role("button", name="Code senden").click()
    forgot.get_by_label("Code aus der E-Mail").fill("123456")
    forgot.get_by_role("button", name="Weiter").click()
    expect(forgot.get_by_role("heading", name="Neues Passwort festlegen")).to_be_visible()
    forgot.get_by_label("Neues Passwort").fill("Drittes-Passwort-3")
    forgot.get_by_label("Passwort wiederholen").fill("Drittes-Passwort-3")
    forgot.get_by_role("button", name="Passwort speichern und anmelden").click()
    expect(forgot).to_have_url(re.compile(r"/de/profil$"))
    step("Passwort vergessen: Code, neues Passwort, angemeldet")

    again = browser.new_context(**mobile).new_page()
    again.goto(f"{BASE}/de/anmelden")
    again.get_by_label("E-Mail-Adresse").fill("dani@tracacon.de")
    again.get_by_label("Passwort", exact=True).fill("Drittes-Passwort-3")
    again.get_by_role("button", name="Anmelden", exact=True).click()
    expect(again).to_have_url(re.compile(r"/de/profil$"))
    step("Anmeldung mit dem neuen Passwort")

    ghost = browser.new_context(**mobile).new_page()
    ghost.goto(f"{BASE}/de/passwort-vergessen")
    ghost.get_by_label("E-Mail-Adresse").fill("gibtsnicht@example.com")
    ghost.get_by_role("button", name="Code senden").click()
    expect(ghost.get_by_text("Falls es ein Konto mit gibtsnicht@example.com gibt")).to_be_visible()
    step("Passwort vergessen verrät nicht, ob ein Konto existiert, und legt keins an")

    # --- Zweiter Nutzer (Mitglied) ------------------------------------------
    member_ctx = browser.new_context(**mobile)
    m = member_ctx.new_page()
    register(m, "sammler@example.com", "vergeben")
    expect(m).to_have_url(re.compile(r"/de/willkommen$"))
    m.get_by_label("Nickname").fill("Kartenfan")
    m.get_by_label("Passwort", exact=True).fill(PASSWORD)
    m.get_by_label("Passwort wiederholen").fill(PASSWORD)
    m.get_by_label("Ich bin mindestens 16 Jahre alt.").check()
    m.get_by_role("checkbox", name=re.compile("Community-Regeln")).check()
    m.get_by_role("button", name="Los geht's").click()
    expect(m).to_have_url(re.compile(r"/de/profil$"))
    step("Inzwischen vergebener Nickname: neue Wahl auf der Begrüßungsseite")
    m.get_by_role("button", name="Mein Profil").click()
    expect(m.get_by_role("menu")).to_be_visible()
    expect(m.get_by_role("link", name="Verwaltung")).to_have_count(0)
    m.keyboard.press("Escape")
    m.goto(f"{BASE}/de/admin")
    expect(m).to_have_url(re.compile(r"/de$"))
    step("Mitglied sieht keine Verwaltung und wird von /admin weggeleitet")

    m.goto(f"{BASE}/de/u/dani_tcg")
    expect(m.get_by_role("heading", name="@Dani_TCG")).to_be_visible()
    expect(m.get_by_text("Sammle Pokémon und One Piece.")).to_be_visible()
    expect(m.get_by_text("Admin", exact=True)).to_be_visible()
    shot(m, "04-oeffentliches-profil")
    step("Öffentliches Profil für Mitglieder sichtbar, Rolle als Abzeichen")

    # --- Admin vergibt Rollen -----------------------------------------------
    a.goto(f"{BASE}/de/profil")
    a.get_by_role("button", name="Mein Profil").click()
    a.get_by_role("link", name="Verwaltung").click()
    expect(a.get_by_role("heading", name=re.compile("Verwaltung"))).to_be_visible()
    row = a.locator("li", has_text="sammler@example.com")
    row.get_by_label("Rolle").select_option("team")
    row.get_by_role("button", name="Ändern").click()
    expect(row.get_by_text("Rolle geändert.")).to_be_visible()
    shot(a, "05-verwaltung")
    step("Admin macht Mitglied zum Team")

    own = a.locator("li", has_text="dani@tracacon.de")
    own.get_by_label("Rolle").select_option("member")
    own.get_by_role("button", name="Ändern").click()
    expect(own.get_by_text("Der letzte Admin kann nicht entfernt werden.")).to_be_visible()
    step("Letzter Admin kann sich nicht selbst herabstufen")

    # --- Sprache -------------------------------------------------------------
    a.goto(f"{BASE}/de/einstellungen")
    a.get_by_label("Sprache", exact=True).select_option("en")
    expect(a).to_have_url(re.compile(r"/en/einstellungen$"))
    expect(a.get_by_role("heading", name="Settings")).to_be_visible()
    shot(a, "06-profil-englisch")
    step("Sprachumschaltung auf Englisch")

    # --- Abmelden -------------------------------------------------------------
    a.get_by_role("button", name="My profile").click()
    a.get_by_role("button", name="Sign out").click()
    expect(a).to_have_url(re.compile(r"/en$"))
    expect(a.get_by_role("link", name="Sign in", exact=True).first).to_be_visible()
    a.goto(f"{BASE}/de/profil")
    expect(a).to_have_url(re.compile(r"/de/anmelden$"))
    step("Abmelden beendet die Sitzung")

    # --- Konto löschen ---------------------------------------------------------
    m.goto(f"{BASE}/de/einstellungen")
    m.get_by_text("Konto löschen").click()
    m.get_by_label("Zur Bestätigung LÖSCHEN eingeben").fill("nein")
    m.get_by_role("button", name="Konto endgültig löschen").click()
    expect(m.get_by_text("Bitte gib zur Bestätigung LÖSCHEN ein.")).to_be_visible()
    m.get_by_label("Zur Bestätigung LÖSCHEN eingeben").fill("löschen")
    m.get_by_role("button", name="Konto endgültig löschen").click()
    expect(m).to_have_url(re.compile(r"/de$"))
    expect(m.get_by_role("link", name="Anmelden", exact=True).first).to_be_visible()
    step("Konto löschen mit Bestätigung")

    browser.close()

print(f"\nAlle {step_no} Schritte bestanden.")

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


def login(page, email, *, wrong_code_first=False):
    page.goto(f"{BASE}/de/anmelden")
    page.get_by_label("E-Mail-Adresse").fill(email)
    page.get_by_role("button", name="Code senden").click()
    expect(page.get_by_text(f"Wir haben dir einen Code an {email} geschickt")).to_be_visible()
    if wrong_code_first:
        page.get_by_label("Einmalcode").fill("000000")
        page.get_by_role("button", name="Anmelden", exact=True).click()
        expect(page.get_by_text("Der Code ist falsch oder abgelaufen")).to_be_visible()
    page.get_by_label("Einmalcode").fill("123456")
    page.get_by_role("button", name="Anmelden", exact=True).click()


def onboard(page, nickname):
    expect(page).to_have_url(re.compile(r"/de/willkommen$"))
    page.get_by_label("Nickname").fill(nickname)
    page.get_by_label("Ich bin mindestens 16 Jahre alt.").check()
    page.get_by_role("checkbox", name=re.compile("Community-Regeln")).check()
    page.get_by_role("button", name="Los geht's").click()


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

    a.goto(f"{BASE}/de/anmelden")
    a.get_by_label("E-Mail-Adresse").fill("keine-mail")
    a.get_by_role("button", name="Code senden").click()
    expect(a.get_by_text("Bitte gib eine gültige E-Mail-Adresse ein.")).to_be_visible()
    step("Ungültige E-Mail wird abgelehnt")

    login(a, "dani@tracacon.de", wrong_code_first=True)
    shot(a, "02-willkommen")
    step("Falscher Code abgelehnt, richtiger Code meldet an")

    a.get_by_label("Nickname").fill("Dani_TCG")
    a.get_by_role("button", name="Los geht's").click()
    expect(a.get_by_text("Die App ist ab 16 Jahren. Bitte bestätige dein Alter.")).to_be_visible()
    step("Begrüßung verlangt Altersbestätigung")

    a.get_by_label("Nickname").fill("ab")
    a.get_by_label("Ich bin mindestens 16 Jahre alt.").check()
    a.get_by_role("checkbox", name=re.compile("Community-Regeln")).check()
    a.get_by_role("button", name="Los geht's").click()
    expect(a.get_by_text("Der Nickname passt nicht")).to_be_visible()
    step("Zu kurzer Nickname wird abgelehnt")

    onboard(a, "vergeben")
    expect(a.get_by_text("Dieser Nickname ist schon vergeben.")).to_be_visible()
    step("Vergebener Nickname wird gemeldet")

    onboard(a, "Dani_TCG")
    expect(a).to_have_url(re.compile(r"/de/profil$"))
    expect(a.get_by_role("heading", name="Mein Profil")).to_be_visible()
    step("Begrüßung abgeschlossen, Profilseite erreicht")

    a.get_by_label("Ort").fill("Stuttgart")
    a.get_by_label("Über mich").fill("Sammle Pokémon und One Piece.")
    a.get_by_label("Link (z. B. Instagram)").fill("http://unsicher.de")
    a.get_by_role("button", name="Speichern").click()
    expect(a.get_by_text("Bitte gib einen vollständigen Link mit https:// ein.")).to_be_visible()
    a.get_by_label("Link (z. B. Instagram)").fill("https://instagram.com/tracacon")
    a.get_by_role("button", name="Speichern").click()
    expect(a.get_by_text("Gespeichert.")).to_be_visible()
    shot(a, "03-profil")
    step("Profil speichern mit Prüfung des Links")

    a.goto(f"{BASE}/de/willkommen")
    expect(a).to_have_url(re.compile(r"/de/profil$"))
    a.goto(f"{BASE}/de/anmelden")
    expect(a).to_have_url(re.compile(r"/de/profil$"))
    step("Angemeldete werden von Anmeldung und Begrüßung weitergeleitet")

    # --- Zweiter Nutzer (Mitglied) ------------------------------------------
    member_ctx = browser.new_context(**mobile)
    m = member_ctx.new_page()
    login(m, "sammler@example.com")
    onboard(m, "Kartenfan")
    expect(m).to_have_url(re.compile(r"/de/profil$"))
    expect(m.get_by_role("link", name="Verwaltung")).to_have_count(0)
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
    a.goto(f"{BASE}/de/profil")
    a.get_by_label("Sprache", exact=True).select_option("en")
    expect(a).to_have_url(re.compile(r"/en/profil$"))
    expect(a.get_by_role("heading", name="My profile")).to_be_visible()
    shot(a, "06-profil-englisch")
    step("Sprachumschaltung auf Englisch")

    # --- Abmelden -------------------------------------------------------------
    a.get_by_role("button", name="Sign out").click()
    expect(a).to_have_url(re.compile(r"/en$"))
    expect(a.get_by_role("link", name="Sign in", exact=True)).to_be_visible()
    a.goto(f"{BASE}/de/profil")
    expect(a).to_have_url(re.compile(r"/de/anmelden$"))
    step("Abmelden beendet die Sitzung")

    # --- Konto löschen ---------------------------------------------------------
    m.goto(f"{BASE}/de/profil")
    m.get_by_text("Konto löschen").click()
    m.get_by_label("Zur Bestätigung LÖSCHEN eingeben").fill("nein")
    m.get_by_role("button", name="Konto endgültig löschen").click()
    expect(m.get_by_text("Bitte gib zur Bestätigung LÖSCHEN ein.")).to_be_visible()
    m.get_by_label("Zur Bestätigung LÖSCHEN eingeben").fill("löschen")
    m.get_by_role("button", name="Konto endgültig löschen").click()
    expect(m).to_have_url(re.compile(r"/de$"))
    expect(m.get_by_role("link", name="Anmelden", exact=True)).to_be_visible()
    step("Konto löschen mit Bestätigung")

    browser.close()

print(f"\nAlle {step_no} Schritte bestanden.")

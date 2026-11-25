"""Oberflächentest Feed wie Instagram: Leiste unten, Beitrag mit Fotos, Gefällt mir, Kommentare,
Suche/Entdecken, Profilraster, Melden und Ausblenden, Hervorheben, Löschen.

Voraussetzungen wie in tests/e2e/README.md (frisch gestarteter mock_supabase.py!).
Aufruf: python3 tests/e2e/feed_flow.py http://127.0.0.1:8787 [screenshot-ordner]
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


def shot(page, name, full=False):
    if SHOTS:
        os.makedirs(SHOTS, exist_ok=True)
        page.screenshot(path=os.path.join(SHOTS, f"{name}.png"), full_page=full)


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


def picture(name, color):
    path = os.path.join(tmp, name)
    img = Image.new("RGB", (1200, 1500), color)
    ImageDraw.Draw(img).rounded_rectangle([250, 250, 950, 1250], 40, fill=(250, 250, 250))
    img.save(path, "JPEG")
    return path


def make_post(page, files, caption):
    page.get_by_role("button", name="Erstellen").click()
    page.get_by_role("dialog", name="Erstellen").get_by_role("link", name=re.compile("^Beitrag")).click()
    expect(page).to_have_url(re.compile(r"/de/beitrag/neu$"))
    page.locator("#post-photo-gallery").set_input_files(files)
    for _ in files:
        page.get_by_role("button", name="Übernehmen").click()
    expect(page.get_by_text("Wird hochgeladen …")).to_have_count(0, timeout=15000)
    page.get_by_label("Text").fill(caption)
    page.get_by_role("button", name="Teilen", exact=True).click()
    expect(page).to_have_url(re.compile(r"/de/p/[0-9a-f-]{36}$"))
    return page.url


with sync_playwright() as p:
    browser = p.chromium.launch(executable_path=CHROME, args=["--no-sandbox"])
    mobile = {"viewport": {"width": 390, "height": 844}, "locale": "de-DE", "has_touch": True}

    admin = browser.new_context(**mobile).new_page()
    register(admin, "chefin@tracacon.de", "Chefin")
    ana = browser.new_context(**mobile).new_page()
    register(ana, "ana@example.com", "Ana")
    ben = browser.new_context(**mobile).new_page()
    register(ben, "ben@example.com", "Ben")
    step("Drei Konten angelegt")

    # --- Leiste unten wie Instagram ---------------------------------------------
    nav = ana.get_by_role("navigation", name="Navigation")
    names = [nav.get_by_role("link").nth(i).get_attribute("aria-label") for i in range(4)]
    assert names == ["Startseite", "Marktplatz", "Nachrichten", "Suchen"], names
    expect(nav.get_by_role("button", name="Mein Profil")).to_be_visible()
    expect(nav.get_by_text("Startseite")).to_have_count(0)  # nur Symbole, keine Beschriftung
    step("Leiste unten: Feed, Marktplatz, Nachrichten, Suchen, Profil – nur Symbole")

    # --- Beitrag mit zwei Fotos -----------------------------------------------------
    post_url = make_post(ana, [picture("a1.jpg", (200, 40, 60)), picture("a2.jpg", (40, 120, 200))], "Mein Glurak-Binder 🔥\nWer will tauschen?")
    article = ana.get_by_role("article", name="Beitrag von Ana")
    expect(article.get_by_role("img", name="Foto 1 von 2")).to_be_visible()
    expect(article.get_by_text("1/2")).to_be_visible()
    expect(article.get_by_text("Mein Glurak-Binder 🔥")).to_be_visible()
    shot(ana, "60-beitrag")
    step("Beitrag mit zwei Fotos (4:5 zugeschnitten) und Text geteilt")

    # --- Feed eines anderen: Gefällt mir und Kommentar ---------------------------
    ben.goto(f"{BASE}/de")
    post = ben.get_by_role("article", name="Beitrag von Ana")
    expect(post).to_be_visible()
    shot(ben, "61-feed")
    with ben.expect_response(lambda r: r.request.method == "POST"):
        post.get_by_role("button", name="Gefällt mir").click()
    expect(post.get_by_text("1 „Gefällt mir“")).to_be_visible()
    ben.reload()
    expect(ben.get_by_role("article", name="Beitrag von Ana").get_by_role("button", name="Gefällt mir nicht mehr")).to_be_visible()
    step("Feed zeigt Beitrag; Gefällt mir bleibt nach Neuladen erhalten")

    img = ben.get_by_role("article", name="Beitrag von Ana").get_by_role("img", name="Foto 1 von 2")
    img.dblclick()
    ben.wait_for_timeout(800)
    expect(ben.get_by_role("article", name="Beitrag von Ana").get_by_text("1 „Gefällt mir“")).to_be_visible()
    step("Doppeltippen nimmt Gefällt mir nicht wieder weg")

    ben.get_by_role("article", name="Beitrag von Ana").get_by_role("link", name="Kommentare").click()
    expect(ben).to_have_url(re.compile(r"/de/p/[0-9a-f-]{36}#kommentare$"))
    ben.get_by_label("Kommentieren …").fill("Tausche gern gegen Turtok!")
    ben.get_by_role("button", name="Posten").click()
    expect(ben.get_by_text("Tausche gern gegen Turtok!")).to_be_visible()
    expect(ben.get_by_role("heading", name="1 Kommentar")).to_be_visible()
    shot(ben, "62-kommentare")
    ana.goto(f"{BASE}/de")
    expect(ana.get_by_role("link", name="Kommentar ansehen")).to_be_visible()
    step("Kommentar geschrieben; im Feed erscheint der Hinweis")

    # Ana löscht den Kommentar unter ihrem Beitrag
    ana.goto(post_url)
    ana.get_by_role("button", name="Löschen").click()
    expect(ana.get_by_text("Tausche gern gegen Turtok!")).to_have_count(0)
    step("Beitragsinhaberin löscht einen Kommentar")

    # --- Suchen und Entdecken ---------------------------------------------------
    ben.get_by_role("navigation", name="Navigation").get_by_role("link", name="Suchen").click()
    expect(ben).to_have_url(re.compile(r"/de/suche$"))
    expect(ben.get_by_role("link", name=re.compile(r"^Beitrag: 1 Gefällt mir"))).to_be_visible()
    shot(ben, "63-entdecken")
    ben.get_by_role("searchbox", name="Suchbegriff").fill("an")
    ben.keyboard.press("Enter")
    expect(ben).to_have_url(re.compile(r"/de/suche\?q=an$"))
    expect(ben.get_by_role("link", name=re.compile("^Ana"))).to_be_visible()
    expect(ben.get_by_role("link", name="Im Marktplatz nach „an“ suchen")).to_be_visible()
    step("Suchen: Entdecken-Raster und Personensuche")

    # --- Profil mit Raster -------------------------------------------------------
    ben.get_by_role("link", name=re.compile("^Ana")).click()
    expect(ben).to_have_url(re.compile(r"/de/u/Ana$"))
    expect(ben.get_by_role("link", name=re.compile(r"^1\s*Beiträge"))).to_be_visible()
    expect(ben.get_by_role("link", name=re.compile(r"^Beitrag: 1 Gefällt mir"))).to_be_visible()
    shot(ben, "64-profilraster")
    step("Profil zeigt Zahl der Beiträge und das Raster")

    # --- Folgen ändert den Feed; Hervorheben -------------------------------------
    ben.get_by_role("button", name="Folgen", exact=True).click()
    expect(ben.get_by_role("button", name="Folge ich")).to_be_visible()
    make_post(admin, [picture("c1.jpg", (30, 200, 210))], "Nächste Trade Night am Dienstag!")
    ben.goto(f"{BASE}/de")
    expect(ben.get_by_role("article", name="Beitrag von Ana")).to_be_visible()
    expect(ben.get_by_role("article", name="Beitrag von Chefin")).to_have_count(0)
    step("Wer jemandem folgt, sieht nur Gefolgte im Feed")

    admin.get_by_role("article", name="Beitrag von Chefin").get_by_role("button", name="Mehr Optionen").click()
    admin.get_by_role("button", name="Für alle hervorheben").click()
    expect(admin.get_by_text("Gespeichert ✓")).to_be_visible()
    ben.reload()
    hl = ben.get_by_role("article", name="Beitrag von Chefin")
    expect(hl).to_be_visible()
    expect(hl.get_by_text("Von TRACACON hervorgehoben")).to_be_visible()
    step("Vom Team hervorgehobener Beitrag erscheint bei allen")

    # --- Melden und Ausblenden ----------------------------------------------------
    ben.get_by_role("article", name="Beitrag von Ana").get_by_role("button", name="Mehr Optionen").click()
    ben.get_by_role("button", name="Melden").click()
    ben.get_by_role("radio", name="Betrugsverdacht").check()
    ben.get_by_role("button", name="Melden", exact=True).click()
    expect(ben.get_by_text("Danke, das Team schaut sich das an.")).to_be_visible()
    step("Beitrag gemeldet")

    admin.goto(f"{BASE}/de/moderation")
    expect(admin.get_by_role("link", name="Beitrag ansehen")).to_be_visible()
    admin.get_by_label("Begründung für den Anbieter").first.fill("Verdacht auf Betrug")
    admin.get_by_role("button", name="Beitrag ausblenden").click()
    expect(admin.get_by_role("link", name="Beitrag ansehen")).to_have_count(0)
    ben.goto(f"{BASE}/de")
    expect(ben.get_by_role("article", name="Beitrag von Ana")).to_have_count(0)
    ana.goto(post_url)
    expect(ana.get_by_text("Vom Team ausgeblendet")).to_be_visible()
    step("Team blendet gemeldeten Beitrag aus; die Verfasserin sieht den Hinweis")

    # --- Eigenen Beitrag löschen -----------------------------------------------
    ana.get_by_role("article", name="Beitrag von Ana").get_by_role("button", name="Mehr Optionen").click()
    ana.get_by_role("button", name="Löschen").click()
    expect(ana.get_by_text("Beitrag löschen?")).to_be_visible()
    ana.get_by_role("dialog").get_by_role("button", name="Löschen").click()
    expect(ana).to_have_url(re.compile(r"/de/profil$"))
    expect(ana.get_by_text("Teile Fotos deiner Sammlung")).to_be_visible()
    step("Eigenen Beitrag gelöscht; Profil ist wieder leer")

    browser.close()

print(f"Alle {step_no} Schritte bestanden.")

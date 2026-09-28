import sys
from playwright.sync_api import sync_playwright

BASE = "http://localhost:8001/index.html?sid=30512&name=%ED%85%8C%EC%8A%A4%ED%8A%B8&preview=1"

console_errors = []
page_errors = []

def log_console(msg):
    if msg.type == "error":
        console_errors.append(msg.text)

def click_choice(page, value):
    page.locator(f'.choice-btn[data-choice="{value}"]').click()

def fill_all_textareas(page, text="테스트 응답입니다"):
    areas = page.locator("textarea.text-field")
    n = areas.count()
    for i in range(n):
        areas.nth(i).fill(text + str(i))

def click_next(page):
    page.locator("#navNext").click()
    page.wait_for_timeout(150)

with sync_playwright() as p:
    browser = p.chromium.launch(headless=True, executable_path="/opt/pw-browsers/chromium")
    page = browser.new_page(viewport={"width": 768, "height": 1024})
    page.on("console", log_console)
    page.on("pageerror", lambda exc: page_errors.append(str(exc)))

    page.goto(BASE)
    page.wait_for_load_state("networkidle")

    step_count = 0
    max_steps = 20
    while step_count < max_steps:
        step_count += 1
        # step 0: start choice
        if page.locator('.choice-btn[data-choice="criticize"]').count() > 0 and not page.locator('.choice-btn.selected').count():
            click_choice(page, "criticize")
        # judgment steps (A/B/C)
        for cid in ["A", "B", "C"]:
            loc = page.locator(f'.choice-btn[data-choice="{cid}"]')
            if loc.count() > 0 and page.locator('.choice-list .choice-btn.selected').count() == 0:
                loc.first.click()
                break
        # interpretation view cards
        view_card = page.locator('.view-card[data-choice="view1"]')
        if view_card.count() > 0 and page.locator('.view-card.selected').count() == 0:
            view_card.click()

        fill_all_textareas(page)
        page.wait_for_timeout(100)

        next_btn = page.locator("#navNext")
        if next_btn.is_visible():
            disabled = next_btn.get_attribute("disabled")
            if disabled is not None:
                print(f"[step {step_count}] next disabled after filling — possible bug")
                page.screenshot(path=f"/tmp/step_{step_count}_stuck.png", full_page=True)
                break
            next_btn.click()
            page.wait_for_timeout(200)
        else:
            print(f"[step {step_count}] reached final screen (no next button)")
            break

    page.wait_for_timeout(300)
    page.screenshot(path="/tmp/joseon_sarim_recap.png", full_page=True)

    recap_text = page.locator("#app").inner_text()
    print("\n=== RECAP TEXT (tail) ===")
    print(recap_text[-1500:])

    print("\n=== JS RUNTIME ERRORS (pageerror) ===")
    if page_errors:
        for e in page_errors:
            print(" -", e)
    else:
        print("(none)")

    print("\n=== CONSOLE ERRORS (may include blocked external CDN/font in this sandbox) ===")
    if console_errors:
        for e in console_errors:
            print(" -", e)
    else:
        print("(none)")

    browser.close()

if page_errors:
    sys.exit(1)

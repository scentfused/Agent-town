import json, subprocess, time, sys, base64, io
from playwright.sync_api import sync_playwright
from PIL import Image
srv = subprocess.Popen(["python3","-m","http.server","8765","-d",__import__("os").path.join(__import__("os").path.dirname(__import__("os").path.abspath(__file__)),"..")],stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL)
time.sleep(1)
Image.new("RGB",(900,600),(200,80,60)).save("logo-test.png")
errs=[]; fails=[]
def check(name, cond):
    print(("PASS " if cond else "FAIL ")+name)
    if not cond: fails.append(name)
GEM_MODELS={"models":[{"name":"models/gemini-2.5-flash","supportedGenerationMethods":["generateContent"]}]}
def gem(route):
    r=route.request
    if r.method=="GET": return route.fulfill(status=200,content_type="application/json",body=json.dumps(GEM_MODELS))
    body=r.post_data or ""
    txt="OK" if "connection test" in body else "Here is a draft for the owner."
    route.fulfill(status=200,content_type="application/json",body=json.dumps({"candidates":[{"content":{"parts":[{"text":txt}]}}]}))
with sync_playwright() as p:
    b=p.chromium.launch(); ctx=b.new_context(viewport={"width":1280,"height":800},service_workers="block"); 
    ctx.route("**/cdn.jsdelivr.net/**",lambda r:r.abort()); ctx.route("**/fonts.googleapis.com/**",lambda r:r.abort()); ctx.route("**/fonts.gstatic.com/**",lambda r:r.abort())
    ctx.route("https://generativelanguage.googleapis.com/**",gem)
    pg=ctx.new_page(); pg.on("pageerror",lambda e:errs.append(str(e))); pg.on("console",lambda m: errs.append(m.text) if m.type=="error" and "ERR_FAILED" not in m.text and "Failed to load resource" not in m.text else None)
    pg.goto("http://localhost:8765/index.html"); pg.wait_for_selector("#wiz .wiz-card h1")
    check("wizard shows on first run", "Welcome" in pg.inner_text("#wiz"))
    pg.click("text=Get started")
    check("continue disabled without name", pg.is_disabled('[data-a=next]'))
    pg.fill("#w-name","Sunrise Bakery"); pg.set_input_files("#w-file","logo-test.png"); pg.wait_for_selector("#w-logo img")
    pg.fill("#w-about","We sell sourdough bread for 6 dollars.")
    pg.click('[data-a=next]'); pg.wait_for_selector(".pv-card")
    check("3 provider cards", pg.locator(".pv-card").count()==3)
    check("skip label when none connected", "Skip for now" in pg.inner_text('[data-a=next]'))
    c=pg.locator('.pv-card[data-p=gemini]'); c.locator(".pv-key").fill("AIzaFAKEKEY1234"); c.locator(".pv-test").click()
    pg.wait_for_selector('.pv-card[data-p=gemini].ok',timeout=8000)
    check("gemini connected", "Connected" in pg.inner_text('.pv-card[data-p=gemini] .pv-state'))
    check("continue label", "Continue" in pg.inner_text('[data-a=next]'))
    pg.click('[data-a=next]'); pg.wait_for_selector(".tpl")
    check("templates listed", pg.locator(".tpl").count()>=9)
    pg.fill('[data-n=marketing]',"Mia")
    pg.click('[data-a=custom]'); pg.fill("#e-name","Dough"); pg.fill("#e-title","Baker Helper"); pg.fill("#e-ins","Helps plan daily baking quantities and recipes."); pg.click("#e-save")
    check("custom agent added", "Dough" in pg.inner_text("#wiz"))
    pg.click('[data-a=next]'); pg.wait_for_function("document.querySelector('#wiz')===null || !document.querySelector('#wiz')",timeout=10000) if False else None
    pg.wait_for_selector("#view-sims canvas",timeout=15000); pg.wait_for_timeout(1500)
    check("wizard gone after setup", pg.locator("#wiz").count()==0)
    check("brand name shown", pg.inner_text(".brand .word")=="Sunrise Bakery")
    check("logo shown", pg.locator(".brand .mark img").count()==1)
    check("tour opens", pg.locator("#tour.on").count()==1)
    pg.click("#tour [data-a=close]")
    info=pg.evaluate("({n:window.TEAM.order.length, names:window.TEAM.order.map(i=>window.TEAM.agents[i].name), mgr:window.TEAM.manager, desks:Object.keys(window.OFFICE.layout.desks).length, actors:Object.keys(window.sims.sim.S.actors).length})")
    print(info)
    check("6 agents (5 + custom)", info["n"]==6 and info["actors"]==6 and info["desks"]==6)
    check("renamed Mia", "Mia" in info["names"])
    # chat: click an agent head in the dock
    pg.evaluate("openChat('agent-mia')"); pg.wait_for_selector("#chat-input, textarea",timeout=5000)
    ta=pg.locator("textarea").last; ta.fill("Write a caption for our croissants"); pg.keyboard.press("Enter")
    pg.wait_for_selector("text=Here is a draft for the owner.",timeout=10000)
    check("agent answered via mocked Gemini", True)
    # dashboard
    pg.click("#hr-open"); pg.wait_for_selector(".hr-card"); 
    check("6 team cards", pg.locator(".hr-card").count()==6)
    check("add agent button", pg.locator("#hr-add").count()==1)
    pg.click('#hr-tabs [data-tab=connections]'); pg.wait_for_selector("#tab-connections .pv-card")
    check("connections tab shows connected", "Connected" in pg.inner_text("#tab-connections"))
    pg.click('#hr-tabs [data-tab=company]'); pg.wait_for_selector("#c-about")
    check("company notes saved text", "sourdough" in pg.input_value("#c-about"))
    pg.click('#hr-tabs [data-tab=layout]'); pg.wait_for_timeout(500)
    check("layout tab renders", pg.locator("#tab-layout .layout-cell").count()>100)
    # edit agent via more settings
    pg.click('#hr-tabs [data-tab=team]'); pg.locator(".hr-more").first.click(); pg.wait_for_selector("#e-name")
    pg.fill("#e-title","Head Strategist"); pg.click("#e-save")
    pg.wait_for_selector("#view-sims canvas",timeout=10000); pg.wait_for_timeout(1200)
    check("edit persisted across reload", pg.evaluate("Object.values(window.TEAM.agents).some(a=>a.designation==='Head Strategist')"))
    # reload keeps data, no wizard
    pg.reload(); pg.wait_for_selector("#view-sims canvas"); pg.wait_for_timeout(1000)
    check("reload keeps setup", pg.locator("#wiz").count()==0 and pg.inner_text(".brand .word")=="Sunrise Bakery")
    hist=pg.evaluate("fetch('/api/chats').then(r=>r.json()).then(d=>d.chats.find(c=>c.id==='agent-mia').messages.length)")
    check("chat history survived reload", hist>=2)
    # second tab blocked
    p2=ctx.new_page(); p2.goto("http://localhost:8765/index.html"); p2.wait_for_timeout(1500)
    check("second tab is blocked", p2.locator(".at-modal.block").count()==1)
    # export has no keys
    exp=pg.evaluate("fetch('/api/data/export').then(r=>r.text())")
    check("export has no API key", "AIzaFAKEKEY" not in exp)
    pg.screenshot(path="/tmp/office.png")
    # mobile
    m=b.new_context(viewport={"width":390,"height":780},service_workers="block",is_mobile=True,device_scale_factor=2)
    m.route("**/cdn.jsdelivr.net/**",lambda r:r.abort()); m.route("**/fonts.*/**",lambda r:r.abort())
    mp=m.new_page(); mp.goto("http://localhost:8765/index.html"); mp.wait_for_selector("#wiz h1"); mp.click("text=Get started"); mp.fill("#w-name","Phone Co")
    mp.screenshot(path="/tmp/wiz-mobile.png")
    ow=mp.evaluate("document.documentElement.scrollWidth<=window.innerWidth+1")
    check("wizard no horizontal scroll on phone", ow)
    b.close()
srv.terminate()
real=[e for e in errs]
print("console/page errors:",real[:8])
print("FAILS:",fails)

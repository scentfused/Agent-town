# Agent Town (web edition)

Your own small AI office that runs in any browser (Chrome, Edge, Firefox, Safari, phone or PC).
There is **no installer, no desktop app and no server of yours to run**. It is just a website made of static files.

## What a new user does
1. Open the website.
2. A setup wizard asks for: **company name**, **logo** (optional), **notes about the business** (optional).
3. **Connect an AI** with their own key:
   - **Google Gemini** (free tier available): key from https://aistudio.google.com/apikey. Also gives Google Search.
   - **OpenAI** (paid, pay per use): key from https://platform.openai.com/api-keys.
   - **Claude / Anthropic** (paid, pay per use): key from https://console.anthropic.com/settings/keys.
4. **Pick agents** (Chief of Staff, Marketing, Sales, Social, Designer, Finance, Support, Research, Writer) or add a custom one. Up to 10.
5. Click an agent to give a task. The Dashboard has: Team, Branding & interior, Office layout, AI connections, Company notes, Backup & data.

## Putting it online (pick ONE)
**Easiest, no account needed for a test: Netlify Drop.** Go to https://app.netlify.com/drop and drag this whole folder onto the page. You get a link like `https://something.netlify.app` to share.

**GitHub Pages (free, permanent):**
1. Create a GitHub repository and upload everything in this folder (including the hidden `.github` folder).
2. Repository Settings > Pages > Source: **GitHub Actions**.
3. Push or run the "Publish Agent Town" workflow. Your site appears at `https://<you>.github.io/<repo>/`.

**Cloudflare Pages / any static host:** upload the folder as is. HTTPS is required for "install as app" on phones.

## Privacy and how it works
- Everything (agents, chats, images, keys) is stored **inside the visitor's own browser**. Nothing is sent to you.
- API keys are sent only to the AI company the visitor chose (Google, OpenAI, Anthropic) and never to the website host.
- Backups: Dashboard > Backup & data. Backups do not contain keys.
- Agents only write **drafts**; the owner approves everything.

## Things to know (honest limits)
- A website **cannot use a Claude.ai or ChatGPT subscription login**. Those need API keys, which are billed separately from the subscriptions. Gemini's free tier is the no-cost option.
- Data lives in one browser on one device. Use Backup & restore to move it. Clearing browser data erases it.
- Only one tab at a time may be open (a second tab is paused to protect data).
- Agents work only while the tab is open. Closing it interrupts running tasks.
- Image creation needs a Gemini key. Free-tier quotas can be limited.
- The **Pixel view** loads its graphics library (Phaser) from a CDN and needs internet. The default Sims view works without it.
- Some AI providers may rate-limit free keys; the app retries and shows a plain-English message.

## Testing
- `node tests/logic.test.js` checks the engine (providers, agents, chats, backup) with a fake network.
- `python3 tests/ui.test.py` (needs Playwright) walks the whole wizard in a browser with mocked AI replies.

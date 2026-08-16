# Wavelength — Anonymous Stranger Chat (starter build)

A working, no-login, anonymous 1-on-1 text chat site. Two strangers land on the
site, hit "Find a stranger," and get randomly paired for a live conversation —
no accounts, no signup, nothing persisted after disconnect.

## What's included
- `server.js` — Node.js + WebSocket backend. Handles the waiting queue,
  random pairing, message relay, skip/"next stranger," typing indicator,
  and disconnect notifications. Serves the frontend too.
- `public/index.html`, `public/style.css`, `public/script.js` — the frontend:
  landing screen, "scanning" screen, and the chat UI itself.

## Run it locally
```bash
npm install
node server.js
```
Then open http://localhost:3000 in two different browser tabs (or two
different devices on the same network) to simulate two strangers meeting.

## Deploying so real strangers across India can use it
This needs a host that supports persistent WebSocket connections (not a
static host). Reasonable low-cost options:
- Render, Railway, or Fly.io (free/cheap tiers, WebSocket-friendly)
- A basic VPS (DigitalOcean, Hetzner, AWS Lightsail) running this with
  `pm2` or similar as a process manager, behind Nginx + a domain + HTTPS
  (required for `wss://` on a real domain)

## What this build does NOT include yet (important before real users)
This is a working technical foundation, not a launch-ready product. Before
opening it to the public, especially in India, you'd want:

1. **Content moderation** — automated filtering for abusive/explicit text,
   plus a report/block button wired to real action (this UI mockup has none
   yet).
2. **CSAM detection & reporting pipeline** — mandatory, not optional, for
   any platform where strangers (including possibly minors) can message
   each other. Requires a real process for detection + reporting to
   authorities.
3. **Age gate** that's more than a checkbox, and a clear Terms of Use /
   Privacy Policy reviewed against India's IT Act 2000, IT Rules 2021, and
   POCSO obligations (grievance officer, takedown timelines, etc.).
4. **Rate limiting / abuse prevention** — the current server has no
   protection against a single client flooding messages, opening many
   connections, or scripting mass reconnects.
5. **Scaling beyond one server** — this in-memory queue only works on a
   single process. Multiple servers (for real traffic) need shared state,
   e.g. Redis, for the matching queue.

Happy to help build out any of these next — moderation hook, report/block
flow, or deployment config — whichever you want to tackle first.

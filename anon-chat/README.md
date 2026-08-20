# Wavelength — Anonymous Chat + Persistent Inbox

## What's new: the Inbox feature

You can now add someone as a contact (🤝 in chat → they accept), and message
them **anytime after that** — even if they're offline. Messages are stored
in a real database and delivered the next time they open the app.

This needs a free MongoDB Atlas database to work. Without it, the app still
runs fine — anonymous live chat keeps working exactly as before, the Inbox
just stays empty.

## One-time setup: MongoDB Atlas (free forever)

1. Go to https://www.mongodb.com/cloud/atlas/register and sign up (free).
2. Create a new project, then click **Build a Database** → choose the
   **M0 Free** tier → pick a region close to India (e.g. Mumbai or
   Singapore) → Create.
3. When asked to create a database user, set a username and password
   (save these somewhere).
4. Under **Network Access** (left sidebar), click **Add IP Address** →
   choose **Allow Access from Anywhere** (0.0.0.0/0). This is needed
   because Render's free tier doesn't have a fixed IP.
5. Go to **Database** → click **Connect** on your cluster → **Drivers** →
   copy the connection string. It looks like:
   ```
   mongodb+srv://<username>:<password>@cluster0.xxxxx.mongodb.net/?retryWrites=true&w=majority
   ```
6. Replace `<username>` and `<password>` with the ones you created in
   step 3. Add a database name before the `?`, e.g.:
   ```
   mongodb+srv://youruser:[email protected]/wavelength?retryWrites=true&w=majority
   ```

## Add it to Render

1. Go to your Render dashboard → your service → **Environment** (left sidebar)
2. Click **Add Environment Variable**
   - Key: `MONGODB_URI`
   - Value: the full connection string from step 6 above
3. Save — Render will automatically redeploy with the database connected.
4. Check the **Logs** tab — you should see:
   ```
   Connected to MongoDB — inbox feature enabled.
   ```

## How it works technically

- Each browser gets a random permanent ID (`crypto.randomUUID()`), saved in
  `localStorage`. This is NOT tied to a login/password — it's just how the
  server knows "this browser = this inbox."
- When two people accept a contact request, a `Contact` record is saved in
  MongoDB for both directions.
- Messages sent via the Inbox are saved to MongoDB immediately. If the
  recipient is online, it's also pushed to them live over WebSocket. If not,
  it just waits in the database until they next connect and open their inbox.
- **Security note:** there's no password on the inbox. Anyone who has access
  to a browser's `localStorage` (or the same device) can read that inbox.
  Fine for a small group of friends testing this — not something to expose
  publicly without adding real auth.

## Local testing without Atlas

If `MONGODB_URI` isn't set, the server still starts and anonymous chat still
works — you'll just see this in the logs and the Inbox will always be empty:
```
MONGODB_URI not set — inbox/contacts feature disabled, anonymous chat still works.
```

## Run it locally
```bash
npm install
node server.js
```
Then open http://localhost:3000

## Files
- `server.js` — WebSocket backend: random pairing, live chat, contact
  requests, and inbox message routing
- `db.js` — MongoDB models and persistence functions (Contact, Message)
- `public/` — frontend (landing, chat, inbox, thread screens)

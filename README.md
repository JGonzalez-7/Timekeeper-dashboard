# Timekeeper Dashboard

> A dark, responsive productivity dashboard for tracking work time, events, projects, meetings, and subscriptions — backed by a lightweight Node API and MongoDB.

![Node.js](https://img.shields.io/badge/Node.js-server-339933?logo=node.js&logoColor=white)
![MongoDB](https://img.shields.io/badge/MongoDB-Atlas-47A248?logo=mongodb&logoColor=white)
![Frontend](https://img.shields.io/badge/Frontend-Vanilla%20JS-F7DF1E?logo=javascript&logoColor=black)
![Build](https://img.shields.io/badge/Build%20step-none-blue)

**🔗 Live app:** <https://timekeeper-dashboard.onrender.com>

**🔗 Test page:** <https://jgonzalez-7.github.io/Timekeeper-dashboard/>

The frontend is plain HTML, CSS, and JavaScript with no build step. A small
Node server (`server.js`) serves the page and exposes a JSON API that persists
data to MongoDB, replacing the original browser `localStorage` storage.

---

## Table of Contents

- [Features](#features)
- [Tech Stack](#tech-stack)
- [Quick Start](#quick-start)
- [Configuration](#configuration)
- [API Reference](#api-reference)
- [Deployment](#deployment)
- [Data Storage](#data-storage)
- [Project Structure](#project-structure)
- [Notes & Behavior](#notes--behavior)

---

## Features

- **Live clock & date** in the header and overview.
- **Work timer** with start, pause, resume, stop, reset, and task naming.
- **Recent sessions** list with delete plus daily and weekly totals.
- **Events** with title, one or more dates, time, location, notes, recurring schedules, and upcoming/past views (add, edit, delete).
- **Projects & meetings** with badges, status labels, overdue detection, multiple meeting dates, recurring meetings, and upcoming/past meeting views (add, edit, delete).
- **Subscriptions** tracker with platform names, amounts, active/past views, deleted dates, and a total cost.
- **Monthly calendar** with markers on days that have items.
- **Responsive dark UI** with neon-lime accents.
- **MongoDB persistence** through a small Node API.

## Tech Stack

| Layer | Technology |
| --- | --- |
| Frontend | HTML, CSS, vanilla JavaScript (no framework, no bundler) |
| Backend | Node.js HTTP server (built-in modules only) |
| Database | MongoDB (Atlas) via the official `mongodb` driver |
| Hosting | Render (backend) + GitHub Pages (optional frontend) |

---

## Quick Start

> **Prerequisites:** Node.js 18+ and a MongoDB connection string (e.g. from MongoDB Atlas).

```bash
# 1. Install dependencies (first time only)
npm install

# 2. Create your local environment file from the template
cp .env.example .env

# 3. Add your MongoDB connection string to .env (see Configuration below)

# 4. Start the server
npm start
```

Then open **http://localhost:5400**.

> ⚠️ Open the app **through the Node server**, not by double-clicking
> `index.html`. Opening the file directly bypasses the server, so `/api/data`
> is unavailable and nothing saves to MongoDB.

---

## Configuration

All settings are read from environment variables (locally via `.env`). Copy
`.env.example` to `.env` and fill in your values:

| Variable | Required | Default | Description |
| --- | --- | --- | --- |
| `MONGODB_URI` | ✅ | — | Full MongoDB Atlas connection string. |
| `MONGODB_DB` | | `timekeeper` | Database name. |
| `MONGODB_COLLECTION` | | `dashboard_data` | Collection name. |
| `PORT` | | `5400` | Port the server listens on. |
| `ALLOWED_ORIGINS` | | — | Comma-separated origins allowed to call the API (used when the frontend is hosted separately). |

Example `.env`:

```bash
MONGODB_URI=mongodb+srv://<db_user>:<db_password>@<cluster-host>/?retryWrites=true&w=majority&appName=<app_name>
MONGODB_DB=timekeeper
MONGODB_COLLECTION=dashboard_data
```

### Security notes

- **Never** put your MongoDB password in `js/app.js` or any other browser file —
  the browser can expose it. The connection string belongs only in `.env`
  (local) or in your host's environment variables (production).
- Use the **database user** username and password from MongoDB Atlas, not your
  MongoDB website login.
- `.env` is gitignored, so your credentials are never committed.

---

## API Reference

The server serves static files for any non-`/api/` path and exposes the
following JSON endpoints:

| Method | Endpoint | Description |
| --- | --- | --- |
| `GET` | `/api/health` | Health check. Returns `{ "ok": true }`. |
| `GET` | `/api/data` | Returns all data: `{ sessions, events, projects, meetings, subscriptions }`. |
| `PUT` | `/api/data/:key` | Replaces one list. `:key` ∈ `sessions \| events \| projects \| meetings \| subscriptions`. Body must be a JSON **array**. |

A `PUT` with a non-array body returns `400`, and an unknown `:key` returns `404`.

---

## Deployment

Recommended topology:

```text
GitHub Pages (frontend)  ->  Render (Node API)  ->  MongoDB Atlas (data)
```

MongoDB Atlas stores the data but does not run the backend. Render runs
`server.js`, keeps `MONGODB_URI` private, and exposes the `/api/data` endpoint
that the frontend calls.

### 1. MongoDB Atlas

1. Create a database user under **Database Access**.
2. Copy the Atlas connection string for your cluster.
3. Under **Network Access**, allow your host to connect. For a quick test, allow
   `0.0.0.0/0`; for production, restrict to a static outbound IP.

### 2. Render (backend)

Create a Render **Web Service** from this repository:

- **Build command:** `npm install`
- **Start command:** `npm start`

Add these environment variables in the Render dashboard (never commit them):

```text
MONGODB_URI=mongodb+srv://<db_user>:<db_password>@<cluster-host>/?retryWrites=true&w=majority&appName=<app_name>
MONGODB_DB=timekeeper
MONGODB_COLLECTION=dashboard_data
ALLOWED_ORIGINS=https://<github-username>.github.io
```

After saving, redeploy and verify:

```text
https://timekeeper-dashboard.onrender.com/api/health   ->   {"ok":true}
```

> **`ALLOWED_ORIGINS` tip:** browser origins do not include paths. Use
> `https://<github-username>.github.io`, **not**
> `https://<github-username>.github.io/<repo-name>`.

<details>
<summary><strong>Troubleshooting deployment</strong></summary>

- **`querySrv ENOTFOUND _mongodb._tcp.YOUR_CLUSTER_HOST`** — `MONGODB_URI` in
  Render is still a placeholder. Replace the whole value with the string from
  Atlas **Database → Connect → Drivers**. It should contain your real hostname
  (usually ending in `.mongodb.net`), not `YOUR_CLUSTER_HOST` or `<cluster-host>`.
- **`tlsv1 alert internal error`** — Atlas is rejecting the TLS handshake before
  authentication. Check Atlas **Network Access** and allow the Render outbound
  IP range, or temporarily allow `0.0.0.0/0` to confirm network access is the
  cause.

</details>

### 3. GitHub Pages (optional frontend)

- **Backend only on Render:** leave `js/config.js` blank (`''`) so the browser
  uses the same Render service for `/api/data`.
- **Frontend on GitHub Pages:** point `js/config.js` at the public Render base
  URL (the app appends `/api/data` for you):

  ```js
  window.TIMEKEEPER_API_URL = 'https://timekeeper-dashboard.onrender.com';
  ```

This URL is safe to commit — it is not a secret. The MongoDB URI must stay only
in Render's environment variables and your local `.env`. Commit and push the
frontend changes, then open the GitHub Pages site; new data should save through
Render into MongoDB.

---

## Data Storage

The API stores five documents in MongoDB, one per app area:

- `sessions`
- `events`
- `projects`
- `meetings`
- `subscriptions`

The database and collection are created automatically the first time the server
saves data. On first run, existing `localStorage` data is copied into MongoDB
once (only if the matching MongoDB list is empty), then the old `localStorage`
keys are removed after the copy succeeds.

---

## Project Structure

```text
index.html        Entry point served by the Node server
server.js         MongoDB API + static file server
css/
  style.css       All styles
js/
  app.js          Frontend application logic
  config.js       Sets the API base URL (window.TIMEKEEPER_API_URL)
package.json      Dependencies and the start script
.env.example      Environment variable template
README.md         This file
```

---

## Notes & Behavior

- The work week starts on **Monday** for weekly totals.
- Timer sessions shorter than **1 second** are discarded.
- No timezone conversion is applied; dates and times use the **browser's local time**.
- The `.env` file is gitignored, so MongoDB credentials are never committed.
- Keep real Atlas hostnames, usernames, passwords, and app names in `.env` only.

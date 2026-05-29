# Timekeeper Dashboard

A modern, Apple-inspired static dashboard for tracking work time, upcoming events, projects, and meetings. Runs entirely client-side with localStorage persistence. Deployable on GitHub Pages.

## Features

- **Live clock & today's date** in the header and overview
- **Work timer** with start/pause/resume/stop/reset and task naming
- **Recent sessions list** with delete and daily/weekly totals
- **Upcoming events** with title, date, time, location, notes — add/edit/delete
- **Projects & meetings** with type badges, status labels, overdue detection — add/edit/delete
- **Monthly calendar** with dot markers for days that have items, click-to-filter
- **Responsive layout** for desktop, tablet, and mobile
- **Apple-inspired design** with glassy panels, soft shadows, rounded corners, and smooth transitions
- **All data persisted in localStorage** — no backend, no auth, no API keys

## Run Locally

Open `index.html` directly in a browser, or serve with any static file server:

```bash
# Python
python3 -m http.server 8000

# Node (npx)
npx serve .
```

## Deploy to GitHub Pages

1. Push this repo to GitHub.
2. Go to **Settings > Pages**.
3. Under **Source**, select **Deploy from a branch**.
4. Choose `main` branch and `/ (root)` folder.
5. Save — your site will be live at `https://<username>.github.io/<repo>/`.

## File Structure

```
index.html        Entry point
css/style.css     All styles
js/app.js         All application logic
README.md         This file
```

## Assumptions

- No backend or authentication — all data lives in the browser's localStorage.
- Week starts on Monday for weekly totals.
- Timer sessions shorter than 1 second are discarded.
- No timezone conversion — all times are local browser time.
- Calendar marks days that have any event, project, or meeting.
# Timekeeper Dashboard

A dark productivity dashboard for tracking work time, upcoming events, projects, and meetings. The app now runs through a small Node server and stores dashboard data in MongoDB instead of browser localStorage.

## Features

- Live clock and today's date in the header and overview
- Work timer with start, pause, resume, stop, reset, and task naming
- Recent sessions list with delete and daily/weekly totals
- Upcoming events with title, date, time, location, notes, add, edit, and delete
- Projects and meetings with badges, status labels, overdue detection, add, edit, and delete
- Monthly calendar with markers for days that have items
- Responsive dark UI with neon lime accents
- MongoDB persistence through a local Node API

## Connect MongoDB

Do not put your MongoDB password in `js/app.js` or any browser file. The browser can expose it. Put the connection string in `.env` and let `server.js` connect privately.

1. In MongoDB Atlas, create or confirm a database user.
2. In Atlas Network Access, allow your current IP address.
3. Copy the connection string for the cluster shown in your MongoDB extension.
4. Create `.env` from the example:

```bash
cp .env.example .env
```

5. Edit `.env` and replace the placeholders:

```bash
MONGODB_URI=mongodb+srv://<db_user>:<db_password>@<cluster-host>/?retryWrites=true&w=majority&appName=<app_name>
MONGODB_DB=timekeeper
MONGODB_COLLECTION=dashboard_data
```

Use the username and password from your Atlas database user, not your MongoDB website login.

## Run Locally

Install dependencies once:

```bash
npm install
```

Start the server:

```bash
npm start
```

Open:

```text
http://localhost:5400
```

The app must be opened through the Node server so `/api/data` is available. Opening `index.html` directly will not connect to MongoDB.

## Data Storage

The API stores four documents in MongoDB, one for each app area:

- `sessions`
- `events`
- `projects`
- `meetings`

The database and collection are created automatically when the server first saves data. Existing localStorage data is copied to MongoDB once if the matching MongoDB list is empty, then the old localStorage keys are removed after the copy succeeds.

## File Structure

```text
index.html        Entry point served by Node
server.js         MongoDB API and static file server
css/style.css     All styles
js/app.js         Frontend application logic
package.json      Node dependency and start script
.env.example      Environment variable template
README.md         This file
```

## Notes

- Week starts on Monday for weekly totals.
- Timer sessions shorter than 1 second are discarded.
- No timezone conversion is applied; dates and times use the browser's local time.
- The `.env` file is ignored by Git so your MongoDB credentials are not committed.
- Keep real Atlas hostnames, usernames, passwords, and app names in `.env` only.

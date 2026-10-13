<p align="center">
  <img src="docs/preview.svg" alt="Daymark checklist" width="720">
</p>

<h1 align="center">Daymark</h1>

<p align="center">
  A checklist you can install on your phone.<br>
  Add a task, check it off, and pick up the same list on your phone.
</p>

<p align="center">
  <img alt="Next.js" src="https://img.shields.io/badge/Next.js-14-111111?style=flat-square&logo=nextdotjs&logoColor=white">
  <img alt="Installable" src="https://img.shields.io/badge/installable-on%20your%20phone-b6e38a?style=flat-square&labelColor=1a2118">
</p>

## What it does

| | |
|---|---|
| **Add** | Type a task and tap Add. Daymark then asks when it is due (No date limit, Today, Tomorrow, or a day you pick), whether to remind you, and its priority. |
| **Check** | Tap the box to finish a task. Tap it again to bring it back. Checking a task finishes its steps. |
| **Edit** | Tap the title to rename it, change when it is due or its priority, or turn the reminder on or off. |
| **Due** | Open tasks split into Overdue, Today, Later, and No date limit. Overdue and later tasks show their day under the title. |
| **Priority** | Mark a task High, Medium, or Low. It shows !!!, !!, or ! before the title, and higher priority tasks sit at the top of their section. |
| **Lists** | Inbox is the start. Add Work, Personal, or anything else, and switch with the chips. |
| **Steps** | Add a step under a task when it is more than one action. |
| **Reorder** | Drag the grip on a task to move it among tasks with the same day and priority. |
| **Delete** | Each task has its own delete button. Undo sits at the bottom for a few seconds. |
| **Remind** | Turn on Remind me for a task with a day. Once the Vercel setup below is done, the reminder arrives around 9 AM that day even when Daymark is closed. Without it, the reminder only shows while Daymark is open. On iPhone, notifications only work after Daymark is added to the Home Screen. |
| **Install** | Add it to your home screen. It opens like an app, with its own icon. |

## Sync and reminders on Vercel

Out of the box, each browser keeps its own list and the status line says **On this device**. Four steps in the Vercel project give every device the same list and send reminders while Daymark is closed:

1. Open **Storage**, create an **Upstash for Redis** database (the free plan is enough), and connect it to the project. That adds `KV_REST_API_URL` and `KV_REST_API_TOKEN`.
2. In **Settings → Environment Variables**, add `DAYMARK_PASSCODE` (8 characters or more) and `CRON_SECRET` (any long random text).
3. Redeploy.
4. On each phone or computer, open Daymark and enter the passcode once. The status line changes to **Synced**. Then turn on **Remind me** for a task and allow notifications. On iPhone, open Daymark from its Home Screen icon first.

The passcode keeps the list private. Without it, a connected database stays shut and the status line asks for `DAYMARK_PASSCODE`.

Reminders go out once a day for tasks due that day or overdue. The time is in `vercel.json`, in UTC: `30 3 * * *` is 9 AM in India. On Vercel's free plan the job can run any time within that hour. Once a device is signed up, the note under **Remind me** says "even when Daymark is closed".

On this computer, `npm run dev` keeps the list in `engine/var/board.json`, so every browser on that server shares it. Put `DAYMARK_PASSCODE` in `.env.local` to require the passcode here too.

## Run it here

```bash
npm install
npm run dev
npm test
```

Open http://localhost:3000.

## Put it on a phone

Deploy the repository on Vercel with the Next.js preset. Then open the site in the phone browser.

- **Android, Chrome:** menu, then Install app or Add to Home screen.
- **iPhone, Safari:** Share, then Add to Home Screen.

## Project

```
app/            the checklist
app/api/        sync, reminder sign-up, and the daily reminder job
public/         icon, manifest, service worker
tests/          checklist and passcode tests
engine/         optional local command line and SQLite store
docs/           the picture at the top of this page
```

The engine is a separate list for this computer's command line:

```bash
python3 -m venv .venv
.venv/bin/pip install -r engine/requirements.txt
.venv/bin/python -m engine.cli add --list Inbox "Buy milk"
.venv/bin/python -m engine.cli tasks
.venv/bin/python -m pytest engine/tests -q
```

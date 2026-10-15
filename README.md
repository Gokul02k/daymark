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
  <img alt="Installable" src="https://img.shields.io/badge/installable-on%20your%20phone-0f766e?style=flat-square&labelColor=1c1915">
</p>

## What it does

| | |
|---|---|
| **Add** | Tap the + button. Choose Task or Habit. A task then asks when it is due (No date limit, Today, Tomorrow, or a day you pick), whether to remind you, and its priority. A habit asks for its name. |
| **Check** | Tap the box to finish a task. Tap it again to bring it back. Checking a task finishes its steps. |
| **Edit** | Tap Edit on a task, or its title, to change its name, when it is due, the reminder and its time, or its priority. A step only has a name to change. |
| **Due** | Open tasks split into Overdue, Today, Later, and No date limit. Overdue and later tasks show their day under the title. |
| **Priority** | Mark a task High, Medium, or Low. It shows !!!, !!, or ! before the title, and higher priority tasks sit at the top of their section. |
| **Lists** | Inbox is the start. Add Work, Personal, or anything else, and switch with the chips. |
| **Steps** | Add a step under a task when it is more than one action. |
| **Reorder** | Drag the grip on a task to move it among tasks with the same day and priority. |
| **Delete** | Each task has its own delete button. Undo sits at the bottom for a few seconds. |
| **Habits** | Each habit shows a streak and its last 7 days. Tap one to choose its days, see a 5-week calendar, mark past days, or delete it. |
| **Remind** | Turn on Remind me for a task with a day and pick a time. It starts at 9 AM, or the next hour if 9 AM has already passed today. With the Vercel setup below, the reminder arrives at that time even when Daymark is closed. Without it, the reminder only shows while Daymark is open. On iPhone, notifications only work after Daymark is added to the Home Screen. |
| **Daily note** | Tap the bell and pick a time. Daymark sends one notification then, naming the habits and tasks still open that day. It arrives while Daymark is open. With the closed-app setup below, it can also arrive at that time when Daymark is closed. |
| **Home** | The home screen lists your habits and your tasks. Anything still open today sits in a small row at the top, so you can check it off without opening a big card. |
| **Activity** | Switch to Activity to log things you did that aren't tasks, like "Gym 1 hour". Today opens with bars for habits checked and tasks finished. Under that, each of the last 7 days is one column: the number on top is the total, and the column stacks tasks finished on time, tasks finished late, habits checked, and things you logged. Below the chart, each day lists what you logged, the habits you checked, the tasks you added, and the tasks you finished. |
| **Theme** | Tap the moon beside the title for a dark theme, or the sun to come back to light. Daymark remembers the choice on this device. |
| **Install** | Add it to your home screen. It opens like an app, with its own icon. |

## Sync and reminders on Vercel

Out of the box, each browser keeps its own list and the status line says **On this device**. These steps in the Vercel project give every device the same list and send reminders while Daymark is closed:

1. Open **Storage**, create an **Upstash for Redis** database (the free plan is enough), and connect it to the project. That adds `KV_REST_API_URL` and `KV_REST_API_TOKEN`.
2. For reminders at the time you pick, also add **Upstash QStash** (free plan) from the same Storage page, or from the Upstash console. The project needs `QSTASH_TOKEN`. Skip this and reminders for a closed Daymark come once a day, around 9 AM.
3. In **Settings → Environment Variables**, add `DAYMARK_PASSCODE` (4 digits, like `4821`) and `CRON_SECRET` (any long random text).
4. Redeploy.
5. On each phone or computer, open Daymark and type the 4 digits once. The status line changes to **Synced**. Then turn on **Remind me** for a task and allow notifications. On iPhone, open Daymark from its Home Screen icon first.

The passcode keeps the list private. Without four digits in `DAYMARK_PASSCODE`, a connected database stays shut and the status line says so. Four digits are quick to guess, so after 5 wrong tries from one network Daymark refuses passcodes from there for 15 minutes.

The device doesn't keep the passcode. Typing it gets that device a pass that runs out after 24 hours, and then Daymark asks for the 4 digits again. Set `DAYMARK_UNLOCK_HOURS` to change how long the pass lasts, or to `0` to ask every time Daymark is opened. While it is locked, the list still works on that device and syncs once you unlock. Changing `DAYMARK_PASSCODE` signs every device out.

Once a device is signed up, the note under **Remind me** says whether the reminder will arrive at its time while Daymark is closed. With QStash, Daymark asks QStash to wake it at each reminder's time, up to 7 days ahead. Further out, it schedules once the day comes within that week. A daily job at 9 AM India time also catches anything missed. That time is in `vercel.json`, in UTC (`30 3 * * *`), and on Vercel's free plan it can run any time within that hour.

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

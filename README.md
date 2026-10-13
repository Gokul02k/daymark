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
| **Remind** | A task with a day can send a notification at 9 AM that day if Daymark is open, or the next time you open it. It cannot notify you while Daymark is closed. On iPhone, notifications only work after Daymark is added to the Home Screen. |
| **Install** | Add it to your home screen. It opens like an app, with its own icon. |

## The same list in two places

On this computer, `npm run dev` stores the list in one file, so every browser on that server sees the same tasks.

The phone and the computer share a list when both open the deployed site and the project has a Vercel KV or Upstash database. Set `KV_REST_API_URL` and `KV_REST_API_TOKEN` in the Vercel project. The status line says **Synced**.

Without that database, the status line says **On this device**. The list stays in that browser.

There is no sign-in yet. Once the database is connected, anyone who opens the deployed link sees and can change the same list, so keep the link to yourself.

## Run it here

```bash
npm install
npm run dev
```

Open http://localhost:3000.

## Put it on a phone

Deploy the repository on Vercel with the Next.js preset. Then open the site in the phone browser.

- **Android, Chrome:** menu, then Install app or Add to Home screen.
- **iPhone, Safari:** Share, then Add to Home Screen.

## Project

```
app/            the checklist
public/         icon, manifest, service worker
engine/         optional local command line and SQLite store
docs/           the picture at the top of this page
```

The phone app keeps its own list. The engine is for this computer:

```bash
python3 -m venv .venv
.venv/bin/pip install -r engine/requirements.txt
.venv/bin/python -m engine.cli add --list Inbox "Buy milk"
.venv/bin/python -m engine.cli tasks
.venv/bin/python -m pytest engine/tests -q
```

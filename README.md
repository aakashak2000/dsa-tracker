# DSA Tracker

A local spaced repetition tracker for 496 DSA problems. Inspired by Anki — solve problems, rate your confidence, and the app schedules reviews so you never forget what you've learned.

## Prerequisites

- [Claude Code](https://claude.ai/code) (includes Node.js)

## Setup

**1. Clone the repo**
```bash
git clone <repo-url>
cd dsa-tracker
```

**2. Place the problem sheet**

Put `master_dsa_sheet.csv` in the parent folder (one level above `dsa-tracker/`):
```
Downloads/DSA/
├── master_dsa_sheet.csv   ← goes here
└── dsa-tracker/           ← the app
```

**3. Install and run**
```bash
npm install
npm run dev
```

Open **http://localhost:3000**

On first run, all 496 problems are seeded automatically. Your progress is saved to `db.json` in the parent folder and persists across restarts.

## Features

- **Dashboard** — solved count, streak, due today, activity heatmap
- **Problem Sheet** — filterable table, one-click log, inline notes
- **Focus Mode** — topic-based progressive sessions (weakest sub-topics first)
- **Review Queue** — spaced repetition flashcard mode (SM-2 algorithm)
- **Notes** — per-problem journal with revision briefing
- **Stats** — heatmap, velocity chart, topic breakdown, weak pattern detector
- **Gamification** — XP, levels, badges, streaks

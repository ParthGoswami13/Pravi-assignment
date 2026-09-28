# PRAVI — Public Infrastructure Asset Intelligence

PRAVI is a MERN platform that municipal corporations use to track physical public assets across their whole lifecycle. It covers **bridges, street lights, roads, traffic signals, water pumping stations, and public buildings**, from planning through maintenance to retirement.

> Demo organisation: **Navpur Municipal Corporation** (fictional). Seed data: 64 assets (7 types) across 8 wards, 33 dependency links.

### 3-minute demo story
1. **Dashboard**: *Failure forecast* shows 9 assets reaching Critical within 90 days. *Service impact* shows feeder pillar **FDP-0002** is damaged, leaving 6 street lights without power.
2. **Map**: the affected lights have dashed amber rings. Click one, and its popup reads "No service: FDP-0002 is damaged".
3. **FDP-0002 → Dependencies tab**: the dependency map. Start and complete its repair work order, and the pillar returns to Active and the 6 lights are no longer affected.
4. **BRG-0001 Riverfront Bridge**: the forecast chart projects its trend line to Critical around Jul 2027.
5. **STL-0009 → QR tag**: scan the sticker with a phone, file a complaint, and it appears in Work orders as a citizen complaint.
6. Log in as **Viewer**: everything is read-only, and the API returns 403 on any write.

## What makes it more than CRUD

| Feature | How it works |
|---|---|
| **Enforced lifecycle state machine** | `PLANNED → ACTIVE ⇄ UNDER_MAINTENANCE / DAMAGED → RETIRED`. The server rejects illegal changes (422). Only admins can retire, and only when no work is open. Every change is logged with who, when, and why. |
| **Work orders linked to assets** | Starting a work order automatically moves the asset to *Under maintenance*. Completing it restores the asset to *Active*. This runs inside a **MongoDB transaction**, so the work order, asset, and history never go out of sync. |
| **Asset health score (0–100)** | `condition × 20`, −15 if the inspection is overdue, −20 if past its design life, −10 per open repair (max −30), capped at 30 if damaged. This drives the **Needs attention** list. |
| **Live city map** | Leaflet map with pins coloured by status or health, plus category and status filters. |
| **Inspections** | Recording an inspection updates the asset's condition, sets the next due date from the category interval, and recalculates health. |
| **QR asset tags + citizen complaints** | Every asset has a printable QR sticker. Scanning it opens the public page `/report?asset=STL-0009` (no login), which confirms the asset and files a high-priority work order with a tracking number. |
| **Failure forecast** | A least-squares linear regression over each asset's inspection history projects when it will reach Critical (condition 1). For example: *"Riverfront Bridge: Critical around Jul 2027 (~10 months), −0.83 pts/yr, R² 0.99"*. The dashboard lists assets predicted to fail within 12 months. |
| **Dependency impact** | Assets are linked (feeder pillar **powers** street lights, bridge **carries** road, pumping station **supplies** building). When a provider goes down, a breadth-first search flags every dependent asset as having no service. This shows on the map (dashed ring), the dashboard, and the asset page, and is logged in each dependent's history. Links are validated: allowed type pairs only, one power source per light, and no cycles. |
| **Ask PRAVI (AI assistant)** | A chat assistant powered by **Google Gemini with function calling**. Gemini calls 6 **read-only** server tools (search assets, asset details, city KPIs, failure forecast, service impact, work orders) that run real MongoDB queries, then answers from those results. It never invents data, can't modify anything, and asset codes in answers become links. Supports English and Hindi. |
| **Dashboard** | KPIs and charts from a single `$facet` aggregation. Every KPI links to the filtered list behind it. |
| **Audit trail** | An append-only activity log per asset. No update or delete routes exist. |

## Roles
| Role | Can |
|---|---|
| **Admin** | Everything, including retiring assets |
| **Engineer** | Create and edit assets, change status (except retire), record inspections, manage work orders |
| **Viewer** | Read-only (councillor or auditor). The server returns 403 on any write. |

**Demo logins** (password `Pravi@2026`), also available as one-click buttons on the login page:
`admin@navpur.gov.demo` · `engineer@navpur.gov.demo` · `viewer@navpur.gov.demo`

## Architecture
![PRAVI system architecture](docs/architecture/1-system-overview.png)

More diagrams, covering the work-order transaction, the Ask PRAVI flow and the lifecycle rules, are in [docs/architecture](docs/architecture) and [docs/architecture.html](docs/architecture.html).

## Tech stack
**MongoDB Atlas + Mongoose · Express 5 · React 19 (Vite) · Node.js**, with Zod validation, JWT in an httpOnly cookie, bcrypt, helmet, rate limiting, TanStack Query, Tailwind CSS 4, Recharts, and Leaflet.

```
Browser (React + React Query)
   │  /api/*  (httpOnly JWT cookie, same origin)
   ▼
Express ─ helmet · auth · requireRole · zod validate · errorHandler
   ├─ routes            (HTTP only)
   ├─ services          lifecycle (changeStatus = the ONLY way status changes), health score, activity log
   └─ Mongoose models   User · Asset · Inspection · WorkOrder · Activity · Counter
   ▼
MongoDB Atlas
```
In production, Express also serves the built React app, so everything runs on **one URL** and cookie auth works without CORS.

## Run locally
```bash
npm install                 # root (concurrently)
npm run install:all         # server + client dependencies
# create server/.env  (see server/.env.example): MONGO_URI, JWT_SECRET, PORT=5000
# optional: GEMINI_API_KEY=... (free key from https://aistudio.google.com/apikey) to enable Ask PRAVI
npm run seed                # loads the Navpur demo data and prints the KPI report
npm run dev                 # API on :5000, React on http://localhost:5173
npm test                    # 12 unit tests: health score, state machine, forecast, dependency impact
```

## Deploy (Render, one web service)
1. Push the repo to GitHub. `.env` is git-ignored, so secrets are not pushed.
2. Render → New → **Web Service** → pick the repo.
   - Build command: `npm run build`
   - Start command: `npm start`
   - Environment: `MONGO_URI`, `JWT_SECRET` (a long random string), `NODE_ENV=production`, and optionally `GEMINI_API_KEY`
3. MongoDB Atlas → Network Access → allow `0.0.0.0/0` (Render IPs are dynamic).
4. Open the Render URL and log in with a demo account. Render's free tier sleeps after inactivity, so open the URL a minute before a demo.

## API overview
`POST /api/auth/login|logout` · `GET /api/auth/me` · `GET/POST /api/assets` · `GET/PATCH /api/assets/:id` · `POST /api/assets/:id/status` · `GET /api/assets/:id/activity|inspections` · `GET /api/assets/map|attention|export` · `POST /api/inspections` · `GET/POST /api/workorders` · `POST /api/workorders/:id/start|complete` · `GET /api/dashboard` · `POST /api/public/report` · `GET /api/public/assets/:code` · `GET /api/assets/:id/prediction` · `GET /api/dashboard/forecast` · `GET /api/assets/:id/relationships` · `POST /api/relationships` · `DELETE /api/relationships/:id` · `GET /api/impact` · `GET /api/ai/status` · `POST /api/ai/ask`

Errors are `{ "error": "message", "details"?: [...] }` with 400 validation · 401 · 403 role · 404 · 422 business rule.

## Roadmap
Notifications (warranty expiry, overdue inspections, new complaints), photo uploads for inspections, offline mobile inspections, and ward budget and replacement planning. The full plan is in [docs/PRAVI_IMPLEMENTATION_PLAN.md](docs/PRAVI_IMPLEMENTATION_PLAN.md).

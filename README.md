# Google Ads Automation Suite

A single MERN application merging two previously separate projects:

| Source repo | What it contributed |
| --- | --- |
| [Google-Ads-Automation](https://github.com/HarshitTiwari111/Google-Ads-Automation) | The entire UI design system, campaign monitoring, alert rules + Telegram/email alerting, GCLID/landing-click tracking, reports, 2FA/security, audit logs |
| [Warming-Farming](https://github.com/HarshitTiwari111/Warming-Farming) | Account warming ("farming") ramps, keywords, ad copies, publish + history, notifications, activity logs, multi-MCC account provisioning, the Google Ads access-invitation email |

Everything runs behind **one login**. No feature from either project was dropped.

---

## Quick start

```bash
npm run install:all
```

Copy the environment templates and fill in what you need:

```bash
cp backend/.env.example backend/.env
```

Then run the two dev servers in separate terminals:

```bash
npm run dev:backend
```

```bash
npm run dev:frontend
```

The frontend is served at `http://localhost:5173` and proxies `/api` to the backend on port 5000.

No MongoDB installed? The backend can boot against a throwaway in-memory database:

```bash
npm --prefix backend run dev:memory
```

On first boot the server seeds an admin account from `ADMIN_EMAIL` / `ADMIN_PASSWORD`
(default `admin@example.com` / `changeme123` — change these before deploying).

---

## The three things the merge had to get right

### 1. One login, everything behind it

There is a single `User` collection, a single JWT login, and a single session.
Signing in once gives access to both halves of the product — monitoring, alerts and
reports from the automation project, and keywords, ad copies and publishing from the
farming project.

**There is no self-registration.** Accounts are created by an admin from the Users
page; the only public auth route is sign-in.

Two roles:

| | `admin` | `user` |
| --- | --- | --- |
| Accounts & campaigns | every user's | only their own MCC's |
| MCC ID column | shown | hidden |
| Users page | yes | no |
| Workspace settings, alert rules | read + write | read only |

Each user connects their **own** Google Ads account under **Settings**, so several
media buyers can work in the same installation without sharing credentials.

### Data is scoped to your MCC

A user sees the accounts and campaigns belonging to the MCC(s) on their own Google Ads
connection — so two media buyers on the same MCC share its data, and neither sees
another MCC's. Records they created that have no MCC yet (a local draft, or a failed
provisioning attempt) stay private to them. With no MCC configured this degrades to
"own records only", which is the safe direction. Admins are exempt and see everything.

### 2. Multiple MCCs

The warming project's multi-MCC support is preserved and extended into the merged UI.

* **Settings → MCC (Manager Account) IDs** manages the list of manager accounts.
  *Discover* asks Google which manager accounts your connected login can actually
  reach, so ids don't have to be typed from memory.
* Both creation forms have a **Select MCC** dropdown. Pick one and the account is
  created under **exactly that MCC** — no fallback, no guessing.
* Leave it on **Automatic** and creation walks the saved list top-down, using the
  first MCC that accepts the new client account. An MCC can refuse a client for
  reasons specific to it (billing not approved, client limit reached), so a failure on
  one is not fatal while another may still succeed.
* **In production an MCC is mandatory.** With `NODE_ENV=production`, creating an
  account with no MCC selected and none configured is rejected up front, so a live
  account can never land under an unintended manager account. Development stays
  permissive so the flow can be exercised without a Google connection.
* The MCC that actually accepted an account is recorded on the account as
  `sourceMccId`, because every later Google Ads call for that customer must send it as
  `login-customer-id`.
* Both creation forms (single and bulk) also let you pin a specific MCC instead of
  letting it fall through the list.

### 3. Budgets you set yourself

The original warming project generated a random daily budget (80–110) for every
account it created. That is gone. Every budget in the merged app is entered by the
operator:

Three separate amounts, all entered on the account form:

* **Daily Budget** — the account's own daily budget, stored on the Account record.
* **Campaign Budget** — the per-campaign, per-day spend each warm-up campaign is
  created at in Google Ads. Falls back to the daily budget if left blank. Editing a
  campaign's budget later pushes the change through to the real Google Ads campaign
  budget.
* **Spending Limit** — the account-level cap applied to Google Ads billing.
* **Warming ramp** — the `/api/warming` endpoints take an explicit day/budget schedule
  (or `{ days, startBudget, endBudget }` to generate one), so a ramp is always exactly
  the budgets you asked for.

Defaults are pre-filled from the `default_daily_budget` / `default_billing_budget`
workspace settings so a form starts from a sane number, but the value sent is always
the one on screen.

### The campaign email

The Google Ads **access-invitation email** comes from the Warming-Farming flow: when
an account is provisioned with an invite email, Google itself emails that address an
`ADMIN` access invitation for the new account. It can also be re-sent later from the
Accounts page.

That is separate from — and additional to — this dashboard's own SMTP notifications
(account created, status changed), which are still sent via `EMAIL_*` config.

---

## Project layout

```
backend/
  server.js                 boot: DB, seeds, index migration, cron
  src/
    app.js                  express wiring, CORS, rate limits, static frontend
    config/                 env, db, googleAds, campaignTemplates
    controllers/            account, campaign, keyword, ad, publish, warming,
                            notification, activityLog, dashboard, appSettings,
                            alert, rule, report, performance, tracking,
                            auth, twoFactor, user, audit, settings
    cron/                   campaign monitor, warm-up monitoring, reporting
    middleware/             auth, validators, sanitize, activityLogger, errors
    models/                 Account, Campaign, User, Keyword, Ad, Setting,
                            PublishHistory, Notification, ActivityLog,
                            AlertRules, AlertHistory, AuditLog, CampaignMetrics,
                            GclidLogs, GoogleAdsCache, LandingClicks,
                            Performance, Report
    routes/                 one router per resource, mounted in routes/index.js
    services/               googleAds, campaign, warming, alert, rule engine,
                            recommendation, gclid, landingClick, noClicksWarning,
                            notification, email, telegram
frontend/
  src/
    components/             Layout, Sidebar, forms, tables, charts
    context/                Auth, Theme, Toast
    pages/                  every screen
    services/api.js         the whole API surface, one module
```

## API surface

| Area | Routes |
| --- | --- |
| Auth | `/api/auth/*`, `/api/auth/2fa/*` |
| Accounts | `/api/accounts`, `/api/accounts/google-ads/*`, `/api/accounts/:id/invite` |
| Campaigns | `/api/campaigns`, `/api/campaigns/monitoring`, `/api/campaigns/:id/status` |
| Keywords | `/api/keywords`, `/api/campaigns/:campaignId/keywords` |
| Ad copies | `/api/ads`, `/api/campaigns/:campaignId/ads` |
| Bulk content | `/api/campaigns/bulk/content` — same keywords + ad copies across many campaigns |
| Publish | `/api/publish/:campaignId`, `/api/publish/history` |
| Warming | `/api/warming`, `/api/warming/:accountId/{start,advance,reset}`, `/api/warming/schedule/preview` (API only — no UI page, see MERGE-NOTES.md) |
| Monitoring | `/api/alerts`, `/api/rules`, `/api/performance`, `/api/tracking` |
| Reporting | `/api/reports`, `/api/dashboard/stats`, `/api/accounts/stats` |
| Admin | `/api/users`, `/api/audit-logs`, `/api/activity-logs` |
| Settings | `/api/settings` (own Google connection + MCC list), `/api/app-settings` (workspace defaults) |

## Notes

* `GOOGLE_ADS_SIMULATION_MODE=true` (the default) generates simulated metrics and
  never calls Google Ads — safe for local development.
* Real provisioning requires a connected Google account; without one, account creation
  still writes the local record and marks it `failed` with the reason, so nothing is
  lost and it can be retried.
* Time-series collections (metrics, landing clicks, GCLID logs, alert history) use TTL
  indexes; retention is configurable in `.env`.

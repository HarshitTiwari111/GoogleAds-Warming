# Merge notes

How the two repositories were combined, and what had to change to make them work as
one application. Useful when tracing why something looks different from its original
repo.

## Base choice

**Google-Ads-Automation** is the base: its `backend/src/...` layout, its UI design
system, and its auth/validation/error middleware. **Warming-Farming**'s features were
ported onto that base rather than the other way round, because the brief called for
the Google-Ads-Automation UI.

## Feature coverage

Everything from both repos is present. Nothing was dropped.

### From Google-Ads-Automation
Dashboard · Monitoring · Accounts (+ Google Ads sync, bulk create, invite) · Account
detail · Campaigns · Audience · Alert history · Alert rules · Reports (CSV/PDF) ·
Profile · Settings · Security (2FA, sessions) · Users · Login/Register · Theme +
toast system · GCLID / landing-click tracking pixel · Telegram alerting · SMTP
notification emails · No-clicks auto-warning and auto-pause · Recommendation engine ·
Audit logs · Cron jobs (campaign monitor, warm-up monitoring, daily/weekly reports)

### From Warming-Farming
Keywords (match types, negatives) · Ad copies (with Google Ads character limits) ·
Publish + publish history · Multi-MCC provisioning with per-MCC fallback · Google Ads
access-invitation email · Account-level billing / spending limit setup · Workspace
settings (countries, bid strategies, campaign types, budget defaults, warming ramp)

## Navigation: only pages that actually existed

Warming-Farming's repo contains `Warming.jsx`, `NotificationsPage.jsx` and
`ActivityLogs.jsx`, but **none of them are routed** in its `App.jsx` and none appear
in its sidebar — they are dead files. Its real nav is Dashboard, Accounts, Campaigns,
Reports, Security, Users, Settings.

So the merged sidebar is the union of the two projects' *real* navs:

> Dashboard · Monitoring · Accounts · Campaigns (Campaigns, Audience) · Alerts ·
> Rules · Reports · Security · Settings · Users · Profile

Keywords and Ad Copies are **campaign-scoped sub-pages**, not top-level sections —
matching Warming-Farming, where they hung off a campaign row rather than the sidebar.
They live at `/campaigns/:campaignId/{keywords,ads}` and are reached from the per-row
buttons on the Campaigns page. There is no Publish page: Warming-Farming routed one
but nothing ever linked to it, so it was dropped along with Warming/Notifications/
Activity Logs. Its backend (`/api/publish/*`) is still present.

**Campaigns** is Warming-Farming's table (name, Google Ads id, status, clicks,
impressions, CTR, spend, CPC, conversions, device, country, daily budget, then the
Ad Copy / Keywords buttons, plus an MCC ID column for admins). The
Google-Ads-Automation campaign browser — pick a synced account, then edit its live
keywords, ads, device bids and geo targeting — is preserved alongside it at
**Campaigns → Google Ads**, so neither project's page was lost.

Rows are also selectable. With any number of campaigns ticked, **Add Keywords & Ad
Copies** applies the same keywords and ad copies to all of them via
`POST /api/campaigns/bulk/content`, which is the part of batch setup that was
otherwise one-campaign-at-a-time. The endpoint resolves the selection through the
same MCC scope filter as every other read, so a campaign outside the caller's scope
is skipped and counted rather than written to.

**Accounts** is Warming-Farming's table too: Name · Google Ads ID · Currency ·
Billing Budget · Timezone · Status · (MCC ID, admin only) · Actions, with per-column
sort, a name search, Currency/Status filters, and Sync Ads + Add Accounts. Rows come
from the local Account records, which is where the operator-set billing budget,
timezone and status actually live.

The warming, notification and activity-log **backend APIs are still present and
working** (`/api/warming`, `/api/notifications`, `/api/activity-logs`) — only the
unrouted pages were dropped, so surfacing them later is a UI-only change.

## Model reconciliation

Both repos had an `Account`, a `Campaign` and a `User`. They were merged rather than
duplicated:

* **Account** — canonical name field is `accountName` (the automation project's
  spelling). Warming-Farming used `name`, so a read/write virtual alias keeps ported
  code working. `clientName` / `clientEmail` were relaxed from required to optional,
  because the warming creation flow only asks for a name plus an invite email. Added:
  `owner`, `sourceMccId`, `inviteEmail`, `dailyBudget`, `billingBudget`, `country`,
  `autoTagging`, `audienceUnknown`, `isDeleted`, and the warming ramp fields.
  The status enum is the union of both.
* **Campaign** — union of the provisioning fields, the monitoring fields
  (`googleCampaignId`, `assignedTo`, `noClicksWarning`) and the warming fields
  (`owner`, `sourceMccId`, rolled-up metrics, `device`, `country`, `publishedAt`,
  `failedReason`).
* **User** — the automation project's model, extended with
  `googleAdsConfig.managerAccountIds` (the MCC list), `avatar` and `lastLogin`.
* Warming-Farming's `Keyword`, `Ad`, `PublishHistory`, `Notification`, `ActivityLog`
  and `Setting` carried over unchanged.

`Setting` (workspace key/value, mounted at `/api/app-settings`) and the automation
project's per-user Google connection (`/api/settings`) answer different questions, so
both were kept under distinct paths.

## Compatibility shims

* `requireAuth` now populates **both** `req.user.id` (string, used by the automation
  code) and `req.user._id` (ObjectId, used by the ported warming code), so neither
  side needed rewriting.
* `src/utils/helpers.js` re-exports `asyncHandler`, so ported controllers keep their
  original imports.
* `middlewares/` → `middleware/` on every ported file, matching the base layout.

## Bugs found and fixed during the merge

These were pre-existing in the source repos and would have broken the merged app:

1. **`googleCampaignId` unique index collided on `null`.** A `sparse` unique index only
   skips documents where the field is *absent*; an explicit `null` still counts as a
   value. Every locally-created campaign defaulted to `null`, so the second one always
   failed with a duplicate-key error. Replaced with a partial index covering only real
   string ids, and the field no longer defaults to `null`.
2. **Account validators didn't match the controllers.** `accounts.create` validated
   `body('name')` while every controller reads `accountName`, and `accounts.invite`
   validated `body('email')` while `sendInvite` reads `emailAddress`. Both were
   rewritten to match the actual API, with budget/MCC validation added.
3. **`sendInvite`'s catch block referenced an out-of-scope variable.** `emailAddress`
   was destructured inside the `try`, so the error path threw a `ReferenceError`
   instead of returning the intended message. Moved out of the `try`.
4. **`createAccount` dropped ownership.** No `owner` was set, so every per-user scoped
   query (dashboard, warming, campaigns) treated the account as invisible.
5. **Mongoose errors surfaced as 500s.** Validation failures, bad ids and duplicate
   keys now map to 400/400/409 with an actionable message.
6. **Duplicate key `'2356'` in the campaign country map** (India was listed twice).

## Behaviour changes

* **Random budgets removed.** Warming-Farming generated `Math.floor(Math.random() * 31) + 80`
  as the daily budget for every account it created, and the automation project
  hardcoded `$1/day`. Both are replaced by an explicit operator-supplied budget with a
  configurable workspace default. `campaignService.createWarmupCampaign` now uses the
  account's budget rather than the template's.
* **Provisioned accounts are persisted.** The automation project's Google Ads creation
  flow only created accounts *in Google Ads* — no local record, so those accounts never
  appeared on the pages that read local documents. They are now written as `Account` +
  `Campaign` documents.
* **MCC is no longer "the first accessible customer".** It was
  `listAccessibleCustomers()[0]`, which is not necessarily a manager account at all.
  It now resolves through: explicitly chosen MCC → the user's saved MCC list → every
  manager account discovered from the token, trying each until one succeeds.
* **`login-customer-id` is threaded through.** Calls that operate on a client account
  now carry the MCC it lives under, which is required once more than one MCC is in play.

## Verified

* Backend boots, seeds admin/rules/settings, migrates indexes, schedules cron.
* Full API flow exercised end to end: login → MCC list (dedupe + normalise) → account
  with explicit budgets → campaign budget inheritance → explicit campaign budget →
  keywords (single + bulk) → ad copies (+ URL validation) → warming start/advance with
  an operator-defined ramp → budget edit → publish (failure path recorded in history)
  → status change → dashboard rollup → activity logs → notifications.
* Frontend builds clean and every page renders with no console errors.

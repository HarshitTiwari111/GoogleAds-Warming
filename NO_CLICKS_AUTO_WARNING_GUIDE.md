# No-Clicks Auto-Warning & Auto-Pause Feature Guide

## Overview

The **No-Clicks Auto-Warning & Auto-Pause Automation** feature automatically monitors Google Ads campaigns for lack of clicks and takes action to pause underperforming campaigns without manual intervention.

## How It Works

### Workflow

1. **Continuous Monitoring** (Every monitoring cycle, typically 1 minute)
   - System checks each active campaign for clicks in the past 5 minutes
   - If 0 clicks detected → warning count incremented by 1
   - If clicks detected → warning count reset to 0

2. **Warning Escalation**
   - Campaign reaches warning count limit (default: 3) → Auto-pause triggered
   - Campaign stored with `isAutoPaused: true` and `pauseReason` documented

3. **Click Recovery**
   - If campaign gets clicks before reaching limit → warning resets to 0
   - Manual pause reversal via API endpoint

## Configuration

### Environment Variables

```env
# No-Clicks Auto-Warning & Auto-Pause
# Default warning limit: auto-pause campaign after this many consecutive checks with no clicks
NO_CLICKS_WARNING_LIMIT=3

# Monitoring period in minutes: how often to check for clicks
NO_CLICKS_MONITORING_PERIOD_MINUTES=5
```

### Database Fields (Campaign Model)

Each campaign now tracks warning state:

```javascript
noClicksWarning: {
  count: Number,              // Current warning count (0-N)
  warningLimit: Number,       // Auto-pause after this many warnings (default: 3)
  lastCheckedAt: Date,        // When we last checked for clicks
  pausedAt: Date,             // When campaign was auto-paused
  pauseReason: String,        // Human-readable pause reason
  isAutoPaused: Boolean,      // True if paused by auto-warning system
}
```

## API Endpoints

### 1. Get Campaign Warning Status

```bash
GET /api/campaigns/:campaignId/warning-status
```

**Response:**
```json
{
  "success": true,
  "data": {
    "campaignId": "1000000001",
    "campaignName": "CPS - Weight Loss - US",
    "warningCount": 2,
    "warningLimit": 3,
    "isAutoPaused": false,
    "lastCheckedAt": "2026-01-15T10:30:45Z",
    "pausedAt": null,
    "pauseReason": null
  }
}
```

### 2. Manually Resume Auto-Paused Campaign

```bash
POST /api/campaigns/:campaignId/resume
```

**Response:**
```json
{
  "success": true,
  "message": "Campaign resumed and warnings reset",
  "data": {
    "campaignId": "1000000001",
    "campaignName": "CPS - Weight Loss - US",
    "warningCount": 0,
    "isAutoPaused": false,
    "pausedAt": null,
    "pauseReason": null
  }
}
```

### 3. Update Campaign Warning Limit

```bash
PUT /api/campaigns/:campaignId/warning-limit
Content-Type: application/json

{
  "warningLimit": 5
}
```

**Response:**
```json
{
  "success": true,
  "message": "Warning limit updated",
  "data": {
    "campaignId": "1000000001",
    "warningLimit": 5,
    "warningCount": 2
  }
}
```

## Log Messages

The system logs all actions for complete audit trail:

### Warning Increment
```
[NO_CLICKS_WARNING] Campaign "CPS - Weight Loss - US" (1000000001): warning count incremented to 1/3
```

### Warning Reset
```
[NO_CLICKS_WARNING_RESET] Campaign "CPS - Weight Loss - US" (1000000001): clicks resumed, warning count reset from 2 to 0
```

### Auto-Pause Action
```
[AUTO_PAUSE] Google Ads campaign "CPS - Weight Loss - US" (1000000001) paused via API
[AUTO_PAUSE] Campaign "CPS - Weight Loss - US" (1000000001): Database status updated to PAUSED
[AUTO_PAUSE_REASON] Auto-paused: No clicks detected for 3 consecutive monitoring periods (warning limit: 3)
```

### Manual Resume
```
[MANUAL_RESUME] Campaign "CPS - Weight Loss - US" (1000000001) manually resumed and warnings reset
```

## Use Cases

### Scenario 1: Campaign Gets Paused Automatically
1. Campaign has 0 clicks for 5 minutes → warning = 1
2. Campaign has 0 clicks for 5 minutes → warning = 2
3. Campaign has 0 clicks for 5 minutes → warning = 3 → **AUTO-PAUSED**
4. Campaign stays paused until manually resumed

### Scenario 2: Campaign Recovers Mid-Warning
1. Campaign has 0 clicks for 5 minutes → warning = 1
2. Campaign has 0 clicks for 5 minutes → warning = 2
3. Campaign gets 5 clicks in next 5 minutes → warning reset to 0
4. Process restarts

### Scenario 3: Adjusting Warning Limit per Campaign
- High-volume campaigns: Set `warningLimit = 5` (more tolerance)
- Test campaigns: Set `warningLimit = 1` (aggressive pause)
- Default: `warningLimit = 3`

## Implementation Details

### Files Modified

1. **Database Model**
   - `src/models/Campaign.js` - Added `noClicksWarning` fields

2. **Services**
   - `src/services/noClicksWarningService.js` (NEW)
     - `hasCampaignReceivedClicks()` - Check if campaign got clicks
     - `incrementWarningCount()` - Increment warning on no-clicks
     - `resetWarningCount()` - Reset on clicks resume
     - `autoPauseCampaign()` - Pause campaign when limit reached
     - `processNoClicksWarning()` - Main logic called per monitoring cycle
     - `manuallyResumeCampaign()` - Resume paused campaign
     - `getWarningStatus()` - Get current status

   - `src/services/googleAdsService.js`
     - Added `pauseCampaign()` function to pause campaigns in Google Ads

3. **Controllers**
   - `src/controllers/campaignController.js`
     - Added `getWarningStatus()` endpoint
     - Added `resumeAutoPausedCampaign()` endpoint
     - Added `updateWarningLimit()` endpoint

4. **Routes**
   - `src/routes/campaignRoutes.js` - Added warning management routes

5. **Cron Jobs**
   - `src/cron/campaignMonitorJob.js` - Integrated warning service into monitoring cycle

6. **Configuration**
   - `src/config/env.js` - Added `noClicksWarning` config section
   - `.env.example` - Added no-clicks configuration variables

## Testing the Feature Locally

### 1. Start the Development Server
```bash
cd backend
npm run dev:memory
```

### 2. Check Campaign Warning Status
```bash
curl http://localhost:5000/api/campaigns/1000000001/warning-status
```

### 3. Monitor Logs
Watch the terminal output for warning increment messages:
```
[NO_CLICKS_WARNING] Campaign "CPS - Weight Loss - US" (1000000001): warning count incremented to 1/3
```

### 4. Update Warning Limit
```bash
curl -X PUT http://localhost:5000/api/campaigns/1000000001/warning-limit \
  -H "Content-Type: application/json" \
  -d '{"warningLimit": 2}'
```

### 5. Manually Resume Campaign
```bash
curl -X POST http://localhost:5000/api/campaigns/1000000001/resume
```

## Database Queries

### Find All Auto-Paused Campaigns
```javascript
db.campaigns.find({ 'noClicksWarning.isAutoPaused': true })
```

### Find Campaigns at Risk (High Warning Count)
```javascript
db.campaigns.find({ 
  'noClicksWarning.count': { $gte: 2 },
  'noClicksWarning.isAutoPaused': false
})
```

### Check Warning Status for Specific Campaign
```javascript
db.campaigns.findOne({ googleCampaignId: "1000000001" }, 
  { noClicksWarning: 1, campaignName: 1 })
```

## Troubleshooting

### Issue: Warning count not incrementing

**Possible Causes:**
- Monitoring job not running (check cron schedule)
- Campaign has clicks (check CampaignMetrics)
- Campaign not in database

**Solution:**
```bash
# Check if monitoring job is scheduled
grep "Campaign monitor job scheduled" logs

# Check latest metrics for campaign
db.campaignmetrics.findOne({ campaignId: "1000000001" }, { clicks: 1 })
```

### Issue: Campaign not pausing despite high warning count

**Possible Causes:**
- Google Ads API error (check logs for [AUTO_PAUSE] errors)
- Campaign already paused manually
- Database update failed

**Solution:**
- Check logs for `[AUTO_PAUSE]` messages
- Verify campaign in Google Ads dashboard
- Check Campaign.noClicksWarning.isAutoPaused status

## Performance Considerations

- **Monitoring Overhead**: Minimal - one query per campaign per cycle
- **Database Impact**: Small - one update per campaign if warning changes
- **API Calls**: Only when auto-pausing (async to Google Ads)

## Future Enhancements

1. **Configurable monitoring periods** per campaign type
2. **Notification alerts** when warning count increases
3. **Auto-resume on clicks** option
4. **Batch pause/resume** operations
5. **Warning history** tracking
6. **Exemption rules** (e.g., newly created campaigns)

---

**Last Updated**: 2026-01-15
**Version**: 1.0.0

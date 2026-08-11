# No-Clicks Auto-Warning & Auto-Pause - Testing Checklist

## ✅ Server Status

- [ ] Backend running on http://localhost:5000
- [ ] Frontend running on http://localhost:5173
- [ ] Both servers started without errors

## 📊 Database Verification

### Check Campaign Model
```bash
# In MongoDB or terminal, verify noClicksWarning fields exist
db.campaigns.findOne({}, { noClicksWarning: 1 })
```
Expected output should include:
```javascript
{
  noClicksWarning: {
    count: 0,
    warningLimit: 3,
    lastCheckedAt: null,
    pausedAt: null,
    pauseReason: null,
    isAutoPaused: false
  }
}
```

- [ ] noClicksWarning field present in campaigns
- [ ] Default warning limit is 3
- [ ] All fields initialized correctly

## 🔄 Monitoring Job Verification

### Check Logs
Watch the backend terminal output for monitoring cycles:

```
[TIMESTAMP] [32minfo[39m: Campaign monitor cycle complete in Xms (Y campaigns)
```

- [ ] Monitoring job runs every minute
- [ ] No errors in monitoring cycle logs
- [ ] Campaign count is correct

## 🧪 API Endpoint Testing

### Test 1: Get Warning Status

```bash
curl -s http://localhost:5000/api/campaigns/1000000001/warning-status | jq .
```

Expected response:
```json
{
  "success": true,
  "data": {
    "campaignId": "1000000001",
    "campaignName": "CPS - Weight Loss - US",
    "warningCount": 0,
    "warningLimit": 3,
    "isAutoPaused": false,
    "lastCheckedAt": null,
    "pausedAt": null,
    "pauseReason": null
  }
}
```

- [ ] Endpoint responds successfully
- [ ] Returns campaign ID
- [ ] Returns warning count
- [ ] Returns warning limit
- [ ] Returns auto-pause status

### Test 2: Update Warning Limit

```bash
curl -s -X PUT http://localhost:5000/api/campaigns/1000000001/warning-limit \
  -H "Content-Type: application/json" \
  -d '{"warningLimit": 5}' | jq .
```

Expected: Warning limit updated to 5

- [ ] Endpoint accepts PUT request
- [ ] Warning limit updated in database
- [ ] Response includes updated data

### Test 3: Get Updated Status

```bash
curl -s http://localhost:5000/api/campaigns/1000000001/warning-status | jq '.data.warningLimit'
```

Expected: `5`

- [ ] Warning limit shows as 5

### Test 4: Reset Warning Limit Back

```bash
curl -s -X PUT http://localhost:5000/api/campaigns/1000000001/warning-limit \
  -H "Content-Type: application/json" \
  -d '{"warningLimit": 3}' | jq .
```

- [ ] Can update back to default (3)
- [ ] No errors on update

## 📝 Log Verification

### Monitor These Log Messages

#### 1. Normal Monitoring (No warnings)
If campaign has clicks, you should see:
- No warning messages
- Campaign continues normally
- Warning count stays at 0

#### 2. No-Clicks Scenario
Simulate by monitoring a campaign with 0 clicks:
- [ ] See: `[NO_CLICKS_WARNING] Campaign "..." (...): warning count incremented to 1/3`
- [ ] On next cycle: `[NO_CLICKS_WARNING] Campaign "..." (...): warning count incremented to 2/3`
- [ ] On third cycle: `[NO_CLICKS_WARNING] Campaign "..." (...): warning count incremented to 3/3`

#### 3. Auto-Pause Scenario
When warning reaches limit:
- [ ] See: `[AUTO_PAUSE] Google Ads campaign "..." (...) paused via API`
- [ ] See: `[AUTO_PAUSE] Campaign "..." (...): Database status updated to PAUSED`
- [ ] See: `[AUTO_PAUSE_REASON] Auto-paused: No clicks detected for...`

#### 4. Clicks Resume Scenario
If campaign gets clicks before pause:
- [ ] See: `[NO_CLICKS_WARNING_RESET] Campaign "..." (...): clicks resumed, warning count reset from 2 to 0`

## 🔧 Manual Testing

### Scenario 1: Manual Resume

Assuming a campaign is auto-paused:

```bash
curl -s -X POST http://localhost:5000/api/campaigns/1000000001/resume | jq .
```

Expected response:
```json
{
  "success": true,
  "message": "Campaign resumed and warnings reset",
  "data": {
    "campaignId": "1000000001",
    "warningCount": 0,
    "isAutoPaused": false
  }
}
```

- [ ] Endpoint accepts POST request
- [ ] Campaign marked as not auto-paused
- [ ] Warning count reset to 0
- [ ] Status reflects in database

### Scenario 2: Check Resume in Database

```bash
# Check campaign status in MongoDB
db.campaigns.findOne(
  { googleCampaignId: "1000000001" },
  { status: 1, 'noClicksWarning': 1 }
)
```

Expected:
```javascript
{
  status: "active",  // Changed from "paused"
  noClicksWarning: {
    isAutoPaused: false,
    count: 0,
    pausedAt: null,
    pauseReason: null
  }
}
```

- [ ] Campaign status changed from "paused" to "active"
- [ ] isAutoPaused is false
- [ ] pauseReason is null
- [ ] pausedAt is null

## 🔗 Integration Tests

### Test with Dashboard

1. [ ] Open http://localhost:5173 in browser
2. [ ] Login with admin/changeme123
3. [ ] Check if campaigns display correctly
4. [ ] (Optional) Check if warning status shows on campaign cards

## 🗄️ Database Queries

### Find All Auto-Paused Campaigns

```javascript
db.campaigns.find({ 'noClicksWarning.isAutoPaused': true }).pretty()
```

Expected: Empty set initially (unless some are auto-paused)

- [ ] Query runs without errors
- [ ] Returns expected results

### Find Campaigns at High Warning

```javascript
db.campaigns.find({ 'noClicksWarning.count': { $gte: 2 } }).pretty()
```

- [ ] Query runs without errors
- [ ] Shows campaigns with warning count >= 2

### Check Specific Campaign

```javascript
db.campaigns.findOne({ googleCampaignId: "1000000001" }, { noClicksWarning: 1 })
```

- [ ] Shows complete warning structure
- [ ] All fields present

## ⚠️ Error Scenarios

### Test Invalid Campaign ID

```bash
curl http://localhost:5000/api/campaigns/999999999/warning-status
```

Expected: 404 error with message "Campaign not found"

- [ ] Handles missing campaign gracefully
- [ ] Returns appropriate error code

### Test Invalid Warning Limit

```bash
curl -X PUT http://localhost:5000/api/campaigns/1000000001/warning-limit \
  -H "Content-Type: application/json" \
  -d '{"warningLimit": -1}'
```

Expected: 400 error with validation message

- [ ] Validates input
- [ ] Rejects invalid values

### Test Resume Non-Auto-Paused Campaign

```bash
# Try to resume a campaign that wasn't auto-paused
curl -X POST http://localhost:5000/api/campaigns/1000000002/resume
```

Expected: 400 error or success with no change

- [ ] Handles gracefully
- [ ] Doesn't cause errors

## 📊 Performance Checks

### Check Monitoring Speed

Watch backend logs for:
```
Campaign monitor cycle complete in Xms (Y campaigns)
```

- [ ] Cycle completes in < 1000ms (1 second)
- [ ] No performance degradation
- [ ] All campaigns processed each cycle

## 🎯 Summary Checklist

### Must Pass
- [ ] Backend server running
- [ ] Database fields exist
- [ ] API endpoints return 200
- [ ] Warning count updates correctly
- [ ] Auto-pause triggers at limit
- [ ] Manual resume works
- [ ] Logs show expected messages

### Should Pass
- [ ] Performance acceptable
- [ ] Error handling works
- [ ] Database queries work
- [ ] Configuration is correct

### Nice to Have
- [ ] Frontend shows warnings
- [ ] Dashboard integration complete
- [ ] All edge cases handled

---

## 📋 Testing Notes

**Date Tested**: _______________
**Tester**: _______________
**Result**: ✅ PASS / ❌ FAIL

**Issues Found**: 
- [ ] None
- [ ] (Please list any issues below)

```
Issue 1: _________________________________
Issue 2: _________________________________
```

**Sign-off**: Ready for production ✅ / Needs fixes ❌

---

## 🚀 Next Steps After Testing

1. Review all changes in git
2. Create pull request
3. Get code review approval
4. Merge to main branch
5. Deploy to staging
6. Deploy to production with monitoring

---

**Test Plan Version**: 1.0.0
**Last Updated**: 2026-01-15

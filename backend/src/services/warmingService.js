const Account = require('../models/Account');
const Setting = require('../models/Setting');
const { logActivity } = require('../middleware/activityLogger');

const FALLBACK_SCHEDULE = [
  { day: 1, budget: 500 },
  { day: 2, budget: 700 },
  { day: 3, budget: 1000 },
  { day: 4, budget: 1200 },
  { day: 5, budget: 1500 },
  { day: 6, budget: 1800 },
  { day: 7, budget: 2000 },
  { day: 8, budget: 2500 },
  { day: 9, budget: 3000 },
  { day: 10, budget: 3500 },
];

/**
 * Day-by-day account warming ("farming") ramp.
 *
 * Every budget in the ramp is operator-controlled — there is no randomised
 * budget anywhere. A caller can supply an explicit `customSchedule`, ask for
 * a generated linear ramp via `{ days, startBudget, endBudget }`, or fall
 * back to the org-wide default stored under the `warming_schedule` setting.
 */
class WarmingService {
  /**
   * Build a linear ramp of `days` entries from `startBudget` to `endBudget`.
   * Used by the "generate schedule" option on the Warming page so an operator
   * can set any ramp they want without hand-entering every day.
   */
  buildSchedule({ days = 10, startBudget = 500, endBudget = 3500 } = {}) {
    const total = Math.min(Math.max(parseInt(days, 10) || 10, 1), 90);
    const from = Number(startBudget) || 0;
    const to = Number(endBudget) || from;
    // With a single day there is no ramp — just use the start budget.
    const step = total > 1 ? (to - from) / (total - 1) : 0;

    return Array.from({ length: total }, (_, i) => ({
      day: i + 1,
      budget: Math.round((from + step * i) * 100) / 100,
      status: 'pending',
    }));
  }

  /** Org-wide default ramp, overridable via the `warming_schedule` setting. */
  async getDefaultSchedule() {
    const setting = await Setting.findOne({ key: 'warming_schedule' });
    const source = Array.isArray(setting?.value) && setting.value.length ? setting.value : FALLBACK_SCHEDULE;
    return source.map((entry, i) => ({
      day: entry.day ?? i + 1,
      budget: Number(entry.budget) || 0,
      status: 'pending',
    }));
  }

  /**
   * Normalise whatever the caller passed into a concrete schedule:
   * an explicit array wins, then a generator spec, then the default.
   */
  async resolveSchedule(customSchedule) {
    if (Array.isArray(customSchedule) && customSchedule.length) {
      return customSchedule.map((entry, i) => ({
        day: entry.day ?? i + 1,
        budget: Number(entry.budget) || 0,
        status: entry.status || 'pending',
      }));
    }
    if (customSchedule && typeof customSchedule === 'object') {
      return this.buildSchedule(customSchedule);
    }
    return this.getDefaultSchedule();
  }

  async startWarming(accountId, userId, customSchedule = null) {
    const account = await Account.findById(accountId);
    if (!account) throw new Error('Account not found');

    const schedule = await this.resolveSchedule(customSchedule);

    account.status = 'warming';
    account.warmingStage = 1;
    account.warmingStartDate = new Date();
    account.warmingSchedule = schedule;
    // Keep the account's live daily budget in step with day 1 of the ramp.
    if (schedule.length) account.dailyBudget = schedule[0].budget;
    await account.save();

    await logActivity(userId, 'warming_started', 'warming', accountId, `Warming started for ${account.accountName}`);
    return account;
  }

  async advanceWarming(accountId, userId) {
    const account = await Account.findById(accountId);
    if (!account || account.status !== 'warming') throw new Error('Account is not in warming state');

    const currentStage = account.warmingStage;
    const schedule = account.warmingSchedule;

    if (currentStage > 0 && currentStage <= schedule.length) {
      schedule[currentStage - 1].status = 'completed';
      schedule[currentStage - 1].completedAt = new Date();
    }

    if (currentStage >= schedule.length) {
      account.status = 'active';
      account.warmingStage = schedule.length;
      account.warmingSchedule = schedule;
      await account.save();
      await logActivity(userId, 'warming_completed', 'warming', accountId, `Warming completed for ${account.accountName}`);
      return { account, completed: true };
    }

    account.warmingStage = currentStage + 1;
    account.warmingSchedule = schedule;
    account.dailyBudget = schedule[account.warmingStage - 1].budget;
    await account.save();
    await logActivity(userId, 'warming_advanced', 'warming', accountId, `Warming advanced to day ${account.warmingStage}`);
    return { account, completed: false };
  }

  async getWarmingStatus(accountId) {
    const account = await Account.findById(accountId);
    if (!account) throw new Error('Account not found');

    const schedule = account.warmingSchedule || [];
    const currentStage = account.warmingStage || 0;
    const completedStages = schedule.filter((s) => s.status === 'completed').length;
    const progress = schedule.length > 0 ? Math.round((completedStages / schedule.length) * 100) : 0;

    return {
      accountId: account._id,
      accountName: account.accountName,
      googleAdsCustomerId: account.googleAdsCustomerId,
      status: account.status,
      currentDay: currentStage,
      totalDays: schedule.length,
      currentBudget:
        currentStage > 0 && currentStage <= schedule.length ? schedule[currentStage - 1].budget : 0,
      progress,
      schedule,
      startDate: account.warmingStartDate,
    };
  }
}

module.exports = new WarmingService();

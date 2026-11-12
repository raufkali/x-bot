/**
 * Automated Post Scheduler for X_BOT
 * Automatically triggers daily post generation at configured time (e.g. 09:00 Asia/Karachi)
 * and dispatches it to owner's WhatsApp for review.
 */

import { config } from '../config.js';
import { whatsappWorkflow } from '../whatsapp/workflow.js';
import { ansi } from './ansi.js';

class PostScheduler {
  constructor() {
    this.timer = null;
    this.enabled = config.scheduleEnabled;
    this.dailyTimes = config.scheduleTimes || ['09:00', '14:00', '20:00']; // 9am, 2pm, 8pm
    this.dailyTime = config.scheduleTime || this.dailyTimes[0];
    this.timezone = config.scheduleTimezone; // e.g. "Asia/Karachi"
    this.lastRun = null;
    this.lastTriggeredKey = '';
  }

  /**
   * Returns current time string HH:MM in configured timezone
   */
  getCurrentTimeInTimezone() {
    try {
      return new Date().toLocaleTimeString('en-US', {
        timeZone: this.timezone,
        hour12: false,
        hour: '2-digit',
        minute: '2-digit'
      });
    } catch (e) {
      // Fallback if timezone string is invalid
      const now = new Date();
      return `${String(now.getUTCHours()).padStart(2, '0')}:${String(now.getUTCMinutes()).padStart(2, '0')}`;
    }
  }

  /**
   * Returns current date string YYYY-MM-DD in configured timezone
   */
  getCurrentDateInTimezone() {
    try {
      return new Date().toLocaleDateString('en-CA', {
        timeZone: this.timezone
      });
    } catch (e) {
      return new Date().toISOString().slice(0, 10);
    }
  }

  /**
   * Starts the cron check loop (evaluates every 30 seconds)
   */
  start() {
    if (this.timer) return;

    console.log(ansi.separator('-', 64, ansi.cyan));
    console.log(ansi.boldText(`⏰ [Scheduler] Auto-Post Daily Timer Activated`));
    console.log(`   Scheduled Times: ${ansi.emeraldText(this.dailyTimes.join(', '))} (${this.timezone})`);
    console.log(`   Current Time:    ${ansi.cyanText(this.getCurrentTimeInTimezone())} (${this.timezone})`);
    console.log(`   Status:          ${this.enabled ? ansi.emeraldText('ACTIVE') : ansi.yellowText('PAUSED')}`);
    console.log(ansi.separator('-', 64, ansi.cyan));

    this.timer = setInterval(() => this.check(), 30000);
  }

  /**
   * Stops the timer
   */
  stop() {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  /**
   * Evaluates if it is time to generate and send (9:00 AM, 2:00 PM, 8:00 PM)
   */
  async check() {
    if (!this.enabled) return;

    const currentTime = this.getCurrentTimeInTimezone();
    const currentDate = this.getCurrentDateInTimezone();

    // Check if current time matches any of the scheduled times
    const isScheduledTime = this.dailyTimes.includes(currentTime) || currentTime === this.dailyTime;
    const triggerKey = `${currentDate}_${currentTime}`;

    if (isScheduledTime && this.lastTriggeredKey !== triggerKey) {
      this.lastTriggeredKey = triggerKey;
      this.lastRun = new Date().toISOString();

      console.log(`\n⏰ [Scheduler Triggered] Auto-generating scheduled post at ${currentTime} (${this.timezone})...`);
      try {
        const result = await whatsappWorkflow.generateAndSend();
        console.log(ansi.emeraldText('✓ [Scheduler] Scheduled post successfully generated and sent to WhatsApp!'));
        return result;
      } catch (err) {
        console.error('[Scheduler Error]', err.message);
      }
    }
  }

  /**
   * Updates schedule settings at runtime
   */
  updateConfig({ time, times, timezone, enabled }) {
    if (time) this.dailyTime = String(time).trim();
    if (Array.isArray(times) && times.length > 0) this.dailyTimes = times.map(t => String(t).trim());
    if (timezone) this.timezone = String(timezone).trim();
    if (typeof enabled === 'boolean') this.enabled = enabled;

    console.log(`⏰ [Scheduler Updated] Times: ${this.dailyTimes.join(', ')} | Timezone: ${this.timezone} | Enabled: ${this.enabled}`);
    return this.getStatus();
  }

  /**
   * Returns current status summary
   */
  getStatus() {
    return {
      enabled: this.enabled,
      dailyTime: this.dailyTime,
      dailyTimes: this.dailyTimes,
      timezone: this.timezone,
      currentTime: this.getCurrentTimeInTimezone(),
      currentDate: this.getCurrentDateInTimezone(),
      lastRun: this.lastRun
    };
  }
}

export const postScheduler = new PostScheduler();

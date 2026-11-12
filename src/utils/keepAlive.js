/**
 * Keep-Alive Service for Free Cloud Hosting (Render, Railway, etc.)
 * Continuously pings the application public endpoint to prevent the container
 * from spinning down (sleeping).
 * 
 * When the bot is awaiting owner response on WhatsApp, it pings aggressively
 * every 4 minutes to guarantee the container never sleeps while waiting for the user.
 */

export class KeepAliveService {
  constructor(targetUrl = process.env.RENDER_EXTERNAL_URL || 'https://x-bot-7p2s.onrender.com') {
    this.targetUrl = targetUrl;
    this.intervalTimer = null;
    this.isWaitingForResponse = false;
    this.standardIntervalMs = 10 * 60 * 1000; // 10 minutes when idle
    this.activeWaitIntervalMs = 4 * 60 * 1000; // 4 minutes when awaiting owner response
  }

  setWaitingForResponse(waiting = true) {
    if (this.isWaitingForResponse === waiting) return;
    this.isWaitingForResponse = Boolean(waiting);

    if (this.isWaitingForResponse) {
      console.log('⚡ [KeepAlive] Bot is AWAITING OWNER RESPONSE. Switching to 4-minute active keep-alive mode.');
    } else {
      console.log('💤 [KeepAlive] User responded or session ended. Reverting to standard 10-minute keep-alive mode.');
    }

    // Restart timer with the updated interval
    if (this.intervalTimer) {
      this.stop();
      this.start();
    }
  }

  async triggerImmediatePing() {
    if (!this.targetUrl) return;
    try {
      const pingUrl = `${this.targetUrl.replace(/\/$/, '')}/health`;
      const res = await fetch(pingUrl);
      if (res.ok) {
        console.log(`[KeepAlive Ping] Immediate wake ping sent to ${pingUrl} (HTTP ${res.status}).`);
      }
    } catch (err) {
      // Quiet ignore on background ping errors
    }
  }

  start() {
    if (this.intervalTimer) return;
    if (!this.targetUrl) return;

    const intervalMs = this.isWaitingForResponse ? this.activeWaitIntervalMs : this.standardIntervalMs;
    const intervalMinutes = Math.round(intervalMs / 60000);

    console.log(`[KeepAlive] Service active. Auto-pinging ${this.targetUrl}/health every ${intervalMinutes} minutes.`);

    this.intervalTimer = setInterval(async () => {
      try {
        const pingUrl = `${this.targetUrl.replace(/\/$/, '')}/health`;
        const res = await fetch(pingUrl);
        if (res.ok) {
          const modeStr = this.isWaitingForResponse ? '(Awaiting User Response)' : '(Idle)';
          console.log(`[KeepAlive Ping] ${pingUrl} (HTTP ${res.status}) ${modeStr}. Server kept awake.`);
        }
      } catch (err) {
        console.warn(`[KeepAlive Warning] Ping to ${this.targetUrl} failed:`, err.message);
      }
    }, intervalMs);
  }

  stop() {
    if (this.intervalTimer) {
      clearInterval(this.intervalTimer);
      this.intervalTimer = null;
    }
  }
}

export const keepAliveService = new KeepAliveService();

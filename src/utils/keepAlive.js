/**
 * Keep-Alive Service for Free Cloud Hosting (Render, Railway, etc.)
 * Pings the application endpoint every 10 minutes to prevent the container
 * from spinning down (sleeping) due to inactivity.
 */

export class KeepAliveService {
  constructor(targetUrl = process.env.RENDER_EXTERNAL_URL || 'https://x-bot-7p2s.onrender.com') {
    this.targetUrl = targetUrl;
    this.intervalTimer = null;
    this.pingIntervalMs = 10 * 60 * 1000; // 10 minutes (Render sleeps after 15 min)
  }

  start() {
    if (this.intervalTimer) return;
    if (!this.targetUrl) return;

    console.log(`[KeepAlive] Service active. Auto-pinging ${this.targetUrl}/health every 10 minutes to prevent sleep.`);

    this.intervalTimer = setInterval(async () => {
      try {
        const pingUrl = `${this.targetUrl.replace(/\/$/, '')}/health`;
        const res = await fetch(pingUrl);
        if (res.ok) {
          console.log(`[KeepAlive Ping] Successfully pinged ${pingUrl} (HTTP ${res.status}). Server kept awake.`);
        }
      } catch (err) {
        console.warn(`[KeepAlive Warning] Ping to ${this.targetUrl} failed:`, err.message);
      }
    }, this.pingIntervalMs);
  }

  stop() {
    if (this.intervalTimer) {
      clearInterval(this.intervalTimer);
      this.intervalTimer = null;
    }
  }
}

export const keepAliveService = new KeepAliveService();

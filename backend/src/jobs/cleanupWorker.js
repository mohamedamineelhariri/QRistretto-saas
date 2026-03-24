import { Worker } from 'bullmq';
import { redisClient } from '../config/redis.js';
import { cleanupExpiredTokens } from '../services/qrToken.service.js';
import { sessionPool } from '../whatsapp/sessionPool.js';

export const healthCheckWorker = new Worker('session-healthcheck', async job => {
  if (job.name === 'check-sessions') {
      try {
        // Run database cleanup
        const count = await cleanupExpiredTokens();
        if (count > 0) {
            console.log(`[System Job] Cleared ${count} expired QR tokens.`);
        }

        // Ideally, we'd also run a sweep of the sessionPool
        // But sessionPool uses a repeating interval natively. 
        // We can just print stats here for monitoring.
        const stats = sessionPool.getStats();
        if (stats.totalSessions > 0) {
           console.log(`[System Job] Active WhatsApp Sessions: ${stats.totalSessions}/${stats.maxSessions}`);
        }
      } catch (err) {
        console.error('[System Job] Error:', err.message);
      }
  }
}, { connection: redisClient });

healthCheckWorker.on('failed', (job, err) => {
  console.error(`[Job ${job.id}] Failed system job:`, err.message);
});

console.log('[Workers] System maintenance worker initialized.');

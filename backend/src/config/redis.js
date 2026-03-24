import Redis from 'ioredis';

// Shared Redis connection for session cache and BullMQ
const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379';

// This is the default client for session management & queues
export const redisClient = new Redis(redisUrl, {
  maxRetriesPerRequest: null,
  enableReadyCheck: false,
  retryStrategy(times) {
    const delay = Math.min(times * 100, 3000);
    return delay;
  },
  reconnectOnError: (err) => {
    console.error('[Redis] Reconnect error:', err.message);
    return true; 
  }
});

redisClient.on('error', (err) => {
  console.warn('[Redis] Connection Error (Workers may be offline):', err.message);
});

redisClient.on('connect', () => {
  console.log('[Redis] Connected to Redis server.');
});

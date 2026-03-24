import { Queue } from 'bullmq';
import { redisClient } from './redis.js';

// BullMQ requires reusing the connection
const connection = redisClient;

// Queues definitions based on the RFC
export const whatsappIncomingQueue = new Queue('whatsapp-incoming', {
  connection,
  defaultJobOptions: {
    attempts: 3,
    backoff: { type: 'exponential', delay: 2000 }
  }
});

export const whatsappOutgoingQueue = new Queue('whatsapp-outgoing', {
  connection,
  defaultJobOptions: {
    attempts: 5,
    backoff: { type: 'exponential', delay: 3000 }
  }
});

// Alias for use by workers
export const outgoingQueue = whatsappOutgoingQueue;

export const orderCreateQueue = new Queue('order-create', {
  connection,
  defaultJobOptions: {
    attempts: 3,
    backoff: { type: 'fixed', delay: 1000 }
  }
});

// Periodic health checks
export const healthCheckQueue = new Queue('session-healthcheck', { connection });

// Socket.IO instance holder — set once from server.js,
// used by workers that run outside the HTTP request context.
let _ioInstance = null;

export function setIOInstance(io) {
  _ioInstance = io;
}

export function getIOInstance() {
  return _ioInstance;
}

export const initSystemJobs = async () => {
  await healthCheckQueue.add('check-sessions', {}, {
    repeat: { every: 30000 } // Every 30s
  });
  console.log('[BullMQ] System repeating jobs initialized.');
};

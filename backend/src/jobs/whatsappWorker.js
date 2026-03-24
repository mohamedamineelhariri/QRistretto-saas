import { Worker } from 'bullmq';
import { redisClient } from '../config/redis.js';
import { handleIncomingMessage } from '../whatsapp/messageHandler.js';
import { sendWithProtection } from '../whatsapp/antiBan.js';
import { sessionPool } from '../whatsapp/sessionPool.js';

export const whatsappIncWorker = new Worker('whatsapp-incoming', async job => {
  const { tenantId, message } = job.data;
  try {
    const session = await sessionPool.getSession(tenantId);
    if (!session || !session.socket) {
      throw new Error(`No active WhatsApp session for tenant ${tenantId}`);
    }
    await handleIncomingMessage(tenantId, message, session.socket);
  } catch (err) {
     console.error(`[WHATSAPP-INC] Job ${job.id} failed:`, err.message);
     throw err;
  }
}, { connection: redisClient });

export const whatsappOutWorker = new Worker('whatsapp-outgoing', async job => {
  const { tenantId, toPhoneNumber, message } = job.data;
  
  try {
    const session = await sessionPool.getSession(tenantId);
    if (!session || !session.socket) {
      throw new Error(`No active WhatsApp session for tenant ${tenantId}`);
    }
    
    let jid = toPhoneNumber;
    if (!jid.includes('@s.whatsapp.net')) {
      jid = jid.replace(/\D/g, '') + '@s.whatsapp.net';
    }

    await sendWithProtection(session.socket, jid, message, tenantId);
  } catch (err) {
    console.error(`[WHATSAPP-OUT] Job ${job.id} failed:`, err.message);
    throw err;
  }
}, { connection: redisClient });

console.log('[Workers] WhatsApp queue workers initialized.');

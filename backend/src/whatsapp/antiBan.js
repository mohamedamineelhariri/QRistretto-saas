/**
 * Anti-Ban Rate Limiter for WhatsApp
 * 
 * Implements randomized jitter, typing emulation, and request pacing
 * to prevent Meta from banning automated WhatsApp accounts.
 */

const ANTI_BAN_CONFIG = {
    // Message pacing
    minDelayBetweenMessages: 1500,  // ms
    maxDelayBetweenMessages: 4000,  // ms
    jitterRange: 800,               // ms random addition

    // Typing emulation
    typingDurationPerChar: 50,      // ms per character
    minTypingDuration: 1000,        // ms minimum
    maxTypingDuration: 5000,        // ms maximum

    // Session limits
    maxMessagesPerMinute: 15,
    maxMessagesPerHour: 200,
    maxNewConversationsPerDay: 50,

    // Peak hour handling (Ramadan Rush)
    peakHourMultiplier: 0.8,        // Slow down further during peaks
};

// Per-session rate tracking
const sessionRates = new Map(); // tenantId → { minuteCount, hourCount, dayConversations, ... }

/**
 * Get a random delay within the configured range, with jitter
 */
function getRandomDelay() {
    const baseDelay = ANTI_BAN_CONFIG.minDelayBetweenMessages +
        Math.random() * (ANTI_BAN_CONFIG.maxDelayBetweenMessages - ANTI_BAN_CONFIG.minDelayBetweenMessages);
    const jitter = Math.random() * ANTI_BAN_CONFIG.jitterRange;
    return Math.floor(baseDelay + jitter);
}

/**
 * Calculate typing duration based on message length
 */
function getTypingDuration(messageLength) {
    const duration = messageLength * ANTI_BAN_CONFIG.typingDurationPerChar;
    return Math.max(
        ANTI_BAN_CONFIG.minTypingDuration,
        Math.min(duration, ANTI_BAN_CONFIG.maxTypingDuration)
    );
}

/**
 * Sleep for the specified duration
 */
function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Get or create rate tracking for a tenant
 */
function getRateTracker(tenantId) {
    if (!sessionRates.has(tenantId)) {
        sessionRates.set(tenantId, {
            minuteCount: 0,
            minuteReset: Date.now() + 60_000,
            hourCount: 0,
            hourReset: Date.now() + 3_600_000,
            dayConversations: new Set(),
            dayReset: Date.now() + 86_400_000,
        });
    }

    const tracker = sessionRates.get(tenantId);
    const now = Date.now();

    // Reset counters if windows have elapsed
    if (now > tracker.minuteReset) {
        tracker.minuteCount = 0;
        tracker.minuteReset = now + 60_000;
    }
    if (now > tracker.hourReset) {
        tracker.hourCount = 0;
        tracker.hourReset = now + 3_600_000;
    }
    if (now > tracker.dayReset) {
        tracker.dayConversations.clear();
        tracker.dayReset = now + 86_400_000;
    }

    return tracker;
}

/**
 * Check if sending a message would exceed rate limits.
 * @returns {{ allowed: boolean, waitMs?: number, reason?: string }}
 */
export function checkRateLimit(tenantId, recipientPhone) {
    const tracker = getRateTracker(tenantId);

    if (tracker.minuteCount >= ANTI_BAN_CONFIG.maxMessagesPerMinute) {
        const waitMs = tracker.minuteReset - Date.now();
        return { allowed: false, waitMs, reason: 'Per-minute message limit reached' };
    }

    if (tracker.hourCount >= ANTI_BAN_CONFIG.maxMessagesPerHour) {
        const waitMs = tracker.hourReset - Date.now();
        return { allowed: false, waitMs, reason: 'Per-hour message limit reached' };
    }

    // Check new conversation limit
    if (!tracker.dayConversations.has(recipientPhone)) {
        if (tracker.dayConversations.size >= ANTI_BAN_CONFIG.maxNewConversationsPerDay) {
            const waitMs = tracker.dayReset - Date.now();
            return { allowed: false, waitMs, reason: 'Daily new conversation limit reached' };
        }
    }

    return { allowed: true };
}

/**
 * Record that a message was sent (update rate counters)
 */
export function recordMessageSent(tenantId, recipientPhone) {
    const tracker = getRateTracker(tenantId);
    tracker.minuteCount++;
    tracker.hourCount++;
    tracker.dayConversations.add(recipientPhone);
}

/**
 * Send a message with anti-ban protections
 * (typing emulation + random delay + rate checking)
 */
export async function sendWithProtection(socket, recipientJid, message, tenantId) {
    // 1. Check rate limits
    const rateCheck = checkRateLimit(tenantId, recipientJid);
    if (!rateCheck.allowed) {
        throw new Error(`Rate limited: ${rateCheck.reason}. Wait ${Math.ceil(rateCheck.waitMs / 1000)}s`);
    }

    // 2. Random pre-send delay
    const preDelay = getRandomDelay();
    await sleep(preDelay);

    // 3. Typing emulation
    const messageText = typeof message === 'string' ? message : (message.text || '');
    const typingDuration = getTypingDuration(messageText.length);
    await socket.presenceSubscribe(recipientJid);
    await sleep(200);
    await socket.sendPresenceUpdate('composing', recipientJid);
    await sleep(typingDuration);
    await socket.sendPresenceUpdate('paused', recipientJid);
    await sleep(300);

    // 4. Send the message
    const result = await socket.sendMessage(recipientJid, message);

    // 5. Record for rate limiting
    recordMessageSent(tenantId, recipientJid);

    // 6. Post-send cooldown
    const postDelay = getRandomDelay() * 0.5;
    await sleep(postDelay);

    return result;
}

export { ANTI_BAN_CONFIG, getRandomDelay, getTypingDuration, sleep };

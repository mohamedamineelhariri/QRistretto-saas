/**
 * WhatsApp Failover State Machine
 * 
 * Manages graceful degradation when WhatsApp sessions fail:
 * Connected → RateLimited → Cooldown → GracefulDegradation → WebQRFallback
 * Connected → Disconnected → Reconnecting → GracefulDegradation → WebQRFallback
 */

import EventEmitter from 'events';

const STATES = {
    CONNECTED: 'CONNECTED',
    RATE_LIMITED: 'RATE_LIMITED',
    COOLDOWN: 'COOLDOWN',
    DISCONNECTED: 'DISCONNECTED',
    RECONNECTING: 'RECONNECTING',
    DEGRADED: 'DEGRADED',   // Graceful degradation mode
};

const MAX_RECONNECT_ATTEMPTS = 5;
const MAX_COOLDOWN_ATTEMPTS = 3;
const COOLDOWN_BASE_MS = 30_000;    // 30 seconds
const COOLDOWN_MAX_MS = 120_000;    // 2 minutes

class FailoverManager extends EventEmitter {
    constructor() {
        super();
        this.tenantStates = new Map(); // tenantId → { state, attempts, timer }
    }

    /**
     * Get current state for a tenant
     */
    getState(tenantId) {
        return this.tenantStates.get(tenantId)?.state || STATES.DISCONNECTED;
    }

    /**
     * Set tenant as connected
     */
    setConnected(tenantId) {
        const prev = this.getState(tenantId);
        this.tenantStates.set(tenantId, {
            state: STATES.CONNECTED,
            attempts: 0,
            timer: null,
        });

        if (prev !== STATES.CONNECTED) {
            this.emit('state:change', { tenantId, from: prev, to: STATES.CONNECTED });
            this.emit('recovery', { tenantId });
            console.log(`✅ [Failover] Tenant ${tenantId}: ${prev} → CONNECTED`);
        }
    }

    /**
     * Handle rate limiting from Meta
     */
    onRateLimited(tenantId) {
        const current = this.tenantStates.get(tenantId) || { attempts: 0 };
        const attempts = current.attempts + 1;

        if (attempts > MAX_COOLDOWN_ATTEMPTS) {
            return this.enterDegradedMode(tenantId, 'Rate limit retries exhausted');
        }

        const cooldownMs = Math.min(
            COOLDOWN_BASE_MS * Math.pow(2, attempts - 1),
            COOLDOWN_MAX_MS
        );

        this.tenantStates.set(tenantId, {
            state: STATES.COOLDOWN,
            attempts,
            timer: setTimeout(() => {
                this.emit('retry', { tenantId, type: 'rate_limit' });
            }, cooldownMs),
        });

        this.emit('state:change', { tenantId, from: STATES.RATE_LIMITED, to: STATES.COOLDOWN });
        console.log(`⏳ [Failover] Tenant ${tenantId}: Cooldown ${cooldownMs}ms (attempt ${attempts}/${MAX_COOLDOWN_ATTEMPTS})`);
    }

    /**
     * Handle disconnection
     */
    onDisconnected(tenantId) {
        const current = this.tenantStates.get(tenantId) || { attempts: 0 };
        const attempts = current.attempts + 1;

        if (attempts > MAX_RECONNECT_ATTEMPTS) {
            return this.enterDegradedMode(tenantId, 'Reconnect retries exhausted');
        }

        this.tenantStates.set(tenantId, {
            state: STATES.RECONNECTING,
            attempts,
            timer: setTimeout(() => {
                this.emit('retry', { tenantId, type: 'disconnect' });
            }, COOLDOWN_BASE_MS * attempts), // Linear backoff
        });

        this.emit('state:change', { tenantId, from: STATES.DISCONNECTED, to: STATES.RECONNECTING });
        console.log(`🔄 [Failover] Tenant ${tenantId}: Reconnecting (attempt ${attempts}/${MAX_RECONNECT_ATTEMPTS})`);
    }

    /**
     * Enter graceful degradation mode
     * Triggers: WebSocket alert to dashboard, customer redirect to QR menu
     */
    enterDegradedMode(tenantId, reason) {
        // Clear any existing timers
        const current = this.tenantStates.get(tenantId);
        if (current?.timer) clearTimeout(current.timer);

        this.tenantStates.set(tenantId, {
            state: STATES.DEGRADED,
            attempts: 0,
            timer: null,
            reason,
            degradedAt: new Date(),
        });

        this.emit('state:change', { tenantId, from: this.getState(tenantId), to: STATES.DEGRADED });

        // Emit events for downstream handlers
        this.emit('degraded', {
            tenantId,
            reason,
            actions: [
                'alert_waiter_dashboard',
                'redirect_customers_to_qr',
                'send_fallback_message',
            ],
        });

        console.log(`🚨 [Failover] Tenant ${tenantId}: DEGRADED MODE — ${reason}`);
    }

    /**
     * Get status for all tenants (for monitoring dashboard)
     */
    getAllStates() {
        const states = {};
        for (const [tenantId, data] of this.tenantStates) {
            states[tenantId] = {
                state: data.state,
                attempts: data.attempts,
                reason: data.reason,
                degradedAt: data.degradedAt,
            };
        }
        return states;
    }

    /**
     * Reset a tenant's failover state (e.g. after manual intervention)
     */
    reset(tenantId) {
        const current = this.tenantStates.get(tenantId);
        if (current?.timer) clearTimeout(current.timer);
        this.tenantStates.delete(tenantId);
        console.log(`🔃 [Failover] Tenant ${tenantId}: State reset`);
    }
}

export const failoverManager = new FailoverManager();
export { STATES };
export default failoverManager;

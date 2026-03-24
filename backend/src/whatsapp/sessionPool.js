/**
 * WhatsApp Session Pool Manager
 * 
 * Manages multiple Baileys sessions across tenants with:
 * - LRU eviction when pool is full
 * - Auth state persistence to PostgreSQL
 * - Lazy session loading on demand
 * - Health monitoring
 * 
 * NOTE: @whiskeysockets/baileys must be installed separately.
 * This module is designed to be imported conditionally when the feature is enabled.
 */

import prisma from '../config/database.js';
import EventEmitter from 'events';

const MAX_CONCURRENT_SESSIONS = parseInt(process.env.WA_MAX_SESSIONS) || 50;

class SessionPoolManager extends EventEmitter {
    constructor() {
        super();
        this.sessions = new Map();   // tenantId → { socket, lastUsed, phoneNumber }
        this.healthCheckInterval = null;
    }

    /**
     * Get or create a session for a tenant.
     * If the pool is full, evicts the LRU session.
     */
    async getSession(tenantId) {
        // Return existing active session
        if (this.sessions.has(tenantId)) {
            const session = this.sessions.get(tenantId);
            session.lastUsed = Date.now();
            if (session.socket?.user?.id) {
                return session;
            }
            // Session exists but disconnected — remove and recreate
            this.sessions.delete(tenantId);
        }

        // Evict LRU if pool is full
        if (this.sessions.size >= MAX_CONCURRENT_SESSIONS) {
            this._evictLRU();
        }

        // Load auth state from database
        const savedSession = await prisma.whatsAppSession.findFirst({
            where: { tenantId, isActive: true },
        });

        if (!savedSession) {
            return null; // No session configured for this tenant
        }

        try {
            // Dynamic import — baileys is only loaded if WhatsApp feature is used
            const { default: makeWASocket, useMultiFileAuthState, DisconnectReason } =
                await import('@whiskeysockets/baileys');

            // Create auth state from saved data
            const authState = savedSession.authState;

            const socket = makeWASocket({
                auth: authState,
                printQRInTerminal: false,
                browser: ['QRistretto', 'Chrome', '120.0'],
                connectTimeoutMs: 30000,
                defaultQueryTimeoutMs: 60000,
                retryRequestDelayMs: 500,
            });

            const sessionObj = {
                socket,
                tenantId,
                phoneNumber: savedSession.phoneNumber,
                lastUsed: Date.now(),
                status: 'connecting',
            };

            this.sessions.set(tenantId, sessionObj);

            // Handle connection updates
            socket.ev.on('connection.update', (update) => {
                const { connection, lastDisconnect, qr } = update;

                if (qr) {
                    sessionObj.qr = qr;
                }

                if (connection === 'open') {
                    sessionObj.status = 'connected';
                    sessionObj.qr = null; // Clear QR once connected
                    this.emit('session:connected', { tenantId });
                    console.log(`✅ WhatsApp session connected for tenant: ${tenantId}`);
                }

                if (connection === 'close') {
                    sessionObj.status = 'disconnected';
                    const statusCode = lastDisconnect?.error?.output?.statusCode;

                    this.emit('session:disconnected', {
                        tenantId,
                        statusCode,
                        reason: lastDisconnect?.error?.message,
                    });

                    // Remove from pool — will be recreated on next request
                    this.sessions.delete(tenantId);
                    console.log(`❌ WhatsApp session disconnected for tenant: ${tenantId} (code: ${statusCode})`);
                }
            });

            // Handle credential updates — persist to database
            socket.ev.on('creds.update', async () => {
                try {
                    await prisma.whatsAppSession.update({
                        where: { id: savedSession.id },
                        data: {
                            authState: socket.authState,
                            lastUsedAt: new Date(),
                        },
                    });
                } catch (err) {
                    console.error(`Failed to save auth state for tenant ${tenantId}:`, err);
                }
            });

            return sessionObj;
        } catch (error) {
            console.error(`Failed to create WhatsApp session for tenant ${tenantId}:`, error);
            this.emit('session:error', { tenantId, error });
            return null;
        }
    }

    /**
     * Gracefully close a session
     */
    async closeSession(tenantId) {
        const session = this.sessions.get(tenantId);
        if (session?.socket) {
            try {
                await session.socket.logout();
            } catch (e) {
                // Ignore logout errors
            }
            session.socket.end();
        }
        this.sessions.delete(tenantId);
    }

    /**
     * Evict the Least Recently Used session
     */
    _evictLRU() {
        let oldestKey = null;
        let oldestTime = Infinity;

        for (const [tenantId, session] of this.sessions) {
            if (session.lastUsed < oldestTime) {
                oldestTime = session.lastUsed;
                oldestKey = tenantId;
            }
        }

        if (oldestKey) {
            console.log(`🔄 Evicting LRU WhatsApp session: ${oldestKey}`);
            this.closeSession(oldestKey);
        }
    }

    /**
     * Get pool statistics
     */
    getStats() {
        const stats = {
            totalSessions: this.sessions.size,
            maxSessions: MAX_CONCURRENT_SESSIONS,
            sessions: [],
        };

        for (const [tenantId, session] of this.sessions) {
            stats.sessions.push({
                tenantId,
                phoneNumber: session.phoneNumber,
                status: session.status,
                lastUsed: new Date(session.lastUsed).toISOString(),
            });
        }

        return stats;
    }

    /**
     * Start health monitoring
     */
    startHealthCheck(intervalMs = 30000) {
        this.healthCheckInterval = setInterval(() => {
            for (const [tenantId, session] of this.sessions) {
                if (session.status === 'disconnected') {
                    console.log(`🏥 Health check: removing dead session for ${tenantId}`);
                    this.sessions.delete(tenantId);
                    this.emit('session:unhealthy', { tenantId });
                }
            }
        }, intervalMs);
    }

    /**
     * Stop health monitoring and close all sessions
     */
    async shutdown() {
        if (this.healthCheckInterval) {
            clearInterval(this.healthCheckInterval);
        }

        for (const tenantId of this.sessions.keys()) {
            await this.closeSession(tenantId);
        }

        console.log('🛑 WhatsApp session pool shut down');
    }
}

// Singleton instance
export const sessionPool = new SessionPoolManager();
export default sessionPool;

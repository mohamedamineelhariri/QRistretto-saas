/**
 * Async Order Worker — BullMQ
 * 
 * Processes order creation asynchronously for WhatsApp/voice orders.
 * This prevents database latency from blocking WhatsApp message responses.
 * 
 * Runs OUTSIDE the HTTP request context — uses the global Prisma client
 * with explicit tenantId/locationId filters (safe: data comes from
 * authenticated message handler).
 */

import { Worker } from 'bullmq';
import { redisClient } from '../config/redis.js';
import prisma from '../config/database.js';
import { getOrCreateReputation, recordSuccessfulOrder } from '../services/reputation.service.js';
import { getIOInstance } from '../config/bullmq.js';

/**
 * Generate next order number for the day (race-safe via Serializable)
 */
async function getNextOrderNumber(locationId) {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    return prisma.$transaction(async (tx) => {
        const count = await tx.order.count({
            where: {
                locationId,
                createdAt: { gte: today, lt: tomorrow },
            },
        });
        return count + 1;
    }, { isolationLevel: 'Serializable' });
}

export const orderCreateWorker = new Worker('order-create', async (job) => {
    const {
        tenantId,
        locationId,
        items,         // [{ menuItemId, quantity, name }]
        phoneE164,
        source = 'WHATSAPP',
        notes = null,
        recipientJid,  // For sending confirmation back via WhatsApp
        transcription,  // Original voice transcription (if voice order)
    } = job.data;

    console.log(`[Order Worker] Processing async order for ${phoneE164} (Tenant: ${tenantId}, Location: ${locationId})`);

    // 1. Validate menu items belong to this location and are available
    const menuItemIds = items.map(i => i.menuItemId);
    const menuItems = await prisma.menuItem.findMany({
        where: {
            id: { in: menuItemIds },
            locationId,
            available: true,
        },
    });

    if (menuItems.length === 0) {
        throw new Error('No valid menu items found for this order.');
    }

    // Find unmatched items
    const validIds = new Set(menuItems.map(m => m.id));
    const matchedItems = items.filter(i => validIds.has(i.menuItemId));
    const unmatchedItems = items.filter(i => !validIds.has(i.menuItemId));

    if (matchedItems.length === 0) {
        throw new Error('None of the requested items are currently available.');
    }

    // 2. Calculate totals and build order items
    let totalAmount = 0;
    const orderItems = matchedItems.map(item => {
        const menuItem = menuItems.find(m => m.id === item.menuItemId);
        const unitPrice = parseFloat(menuItem.price);
        const quantity = Math.min(Math.max(item.quantity || 1, 1), 20);
        totalAmount += unitPrice * quantity;

        return {
            menuItemId: item.menuItemId,
            quantity,
            unitPrice,
        };
    });

    // 3. Get a default table for WhatsApp orders
    const defaultTable = await prisma.table.findFirst({
        where: { locationId, isActive: true },
    });

    if (!defaultTable) {
        throw new Error('No active tables configured for this location.');
    }

    // 4. Generate order number (Serializable isolation for race safety)
    const orderNumber = await getNextOrderNumber(locationId);

    // 5. Build order notes
    const orderNotes = [
        `WhatsApp order from ${phoneE164}`,
        transcription ? `Voice: "${transcription}"` : null,
        notes,
    ].filter(Boolean).join(' | ');

    // 6. Create the order atomically
    const order = await prisma.order.create({
        data: {
            locationId,
            tableId: defaultTable.id,
            orderNumber,
            totalAmount,
            source,
            status: 'PENDING',
            notes: orderNotes,
            items: {
                create: orderItems,
            },
        },
        include: {
            items: {
                include: {
                    menuItem: {
                        select: { name: true, nameFr: true, nameAr: true },
                    },
                },
            },
            table: {
                select: { tableNumber: true, tableName: true },
            },
        },
    });

    console.log(`[Order Worker] ✅ Order #${orderNumber} created (ID: ${order.id}, Total: ${totalAmount} MAD)`);

    // 7. Emit Socket.IO event to kitchen/waiter dashboards
    try {
        const io = getIOInstance();
        if (io) {
            io.to(`restaurant:${locationId}`).emit('order:new', {
                order,
                tableNumber: defaultTable.tableNumber,
            });
        }
    } catch (ioErr) {
        console.error('[Order Worker] Socket.IO emit failed (non-fatal):', ioErr.message);
    }

    // 8. Send WhatsApp confirmation via outgoing queue
    if (recipientJid) {
        const { outgoingQueue } = await import('../config/bullmq.js');

        // Build confirmation text
        let confirmText = `✅ *Order #${orderNumber} placed!*\n\n`;
        for (const item of matchedItems) {
            const mi = menuItems.find(m => m.id === item.menuItemId);
            const qty = item.quantity || 1;
            confirmText += `  ${qty}x ${mi.name} — ${parseFloat(mi.price) * qty} MAD\n`;
        }
        confirmText += `\n💰 *Total: ${totalAmount} MAD*\n`;

        if (unmatchedItems.length > 0) {
            confirmText += `\n⚠️ Could not find: ${unmatchedItems.map(i => i.name || 'unknown').join(', ')}`;
        }

        if (transcription) {
            confirmText += `\n\n🎙️ We heard: "${transcription}"`;
        }

        confirmText += '\n\n📊 Send "status" to track your order.';

        await outgoingQueue.add('send-confirmation', {
            tenantId,
            recipientJid,
            message: { text: confirmText },
        });
    }

    // 9. Update phone reputation
    try {
        await recordSuccessfulOrder(phoneE164);
    } catch (repErr) {
        console.error('[Order Worker] Reputation update failed (non-fatal):', repErr.message);
    }

    return { orderId: order.id, orderNumber, totalAmount };

}, {
    connection: redisClient,
    concurrency: 5,
    limiter: {
        max: 20,
        duration: 1000,
    },
});

orderCreateWorker.on('completed', (job, result) => {
    console.log(`[Order Worker] Job ${job.id} completed: Order #${result.orderNumber}`);
});

orderCreateWorker.on('failed', (job, err) => {
    console.error(`[Order Worker] Job ${job.id} FAILED:`, err.message);

    // If we have a recipientJid, try to send an error message
    if (job?.data?.recipientJid && job?.data?.tenantId) {
        import('../config/bullmq.js').then(({ outgoingQueue }) => {
            outgoingQueue.add('send-error', {
                tenantId: job.data.tenantId,
                recipientJid: job.data.recipientJid,
                message: {
                    text: '❌ Sorry, we could not process your order. Please try again or scan the QR code at your table.',
                },
            }).catch(() => { /* best effort */ });
        }).catch(() => { /* best effort */ });
    }
});

console.log('[Workers] Order worker initialized (concurrency: 5).');

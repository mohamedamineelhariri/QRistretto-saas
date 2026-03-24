/**
 * WhatsApp Message Handler
 * 
 * Processes incoming WhatsApp messages and routes them through
 * the ordering pipeline with anti-ban protections.
 */

import { downloadMediaMessage } from '@whiskeysockets/baileys';
import { sendWithProtection, checkRateLimit } from './antiBan.js';
import { failoverManager, STATES } from './failover.js';
import { sessionPool } from './sessionPool.js';
import { isBlocked, getOrCreateReputation } from '../services/reputation.service.js';
import { processVoiceOrder } from './voiceProcessor.js';
import { orderCreateQueue } from '../config/bullmq.js';
import prisma from '../config/database.js';

/**
 * Process an incoming WhatsApp message
 */
export async function handleIncomingMessage(tenantId, message, socket) {
    const senderJid = message.key.remoteJid;
    const senderPhone = senderJid.replace('@s.whatsapp.net', '');
    const phoneE164 = senderPhone.startsWith('+') ? senderPhone : `+${senderPhone}`;

    // 1. Check if this phone number is globally blocked
    const blocked = await isBlocked(phoneE164);
    if (blocked) {
        console.log(`🚫 Blocked number attempted order: ${phoneE164} (tenant: ${tenantId})`);
        return; // Silently ignore
    }

    // 2. Check failover state — if degraded, send fallback
    const failoverState = failoverManager.getState(tenantId);
    if (failoverState === STATES.DEGRADED) {
        // Already in degraded mode — don't try to process
        return;
    }

    // 3. Extract message text or audio
    const messageText = extractMessageText(message);
    const hasAudio = message.message?.audioMessage;

    if (!messageText && !hasAudio) return; // Ignore other non-text/audio messages

    try {
        if (hasAudio) {
            // Handle Voice Order processing
            await handleVoiceRequest(tenantId, senderJid, socket, message, phoneE164);
        } else if (messageText) {
            // 4. Process the text message based on content
            const command = parseCommand(messageText);
            
            switch (command.type) {
                case 'menu':
                    await handleMenuRequest(tenantId, senderJid, socket);
                    break;
                case 'order':
                    await handleOrderRequest(tenantId, senderJid, socket, command.items, phoneE164);
                    break;
                case 'status':
                    await handleStatusRequest(tenantId, senderJid, socket, phoneE164);
                    break;
                case 'help':
                default:
                    await handleHelpRequest(tenantId, senderJid, socket);
                    break;
            }
        }
    } catch (error) {
        console.error(`Message handler error for tenant ${tenantId}:`, error);

        if (error.message.includes('Rate limited')) {
            failoverManager.onRateLimited(tenantId);
        }
    }
}

/**
 * Extract text content from various message types
 */
function extractMessageText(message) {
    return message.message?.conversation ||
           message.message?.extendedTextMessage?.text ||
           null;
}

/**
 * Parse a message into a command (V1: keyword matching)
 * Supports French, Arabic (Darija), and English keywords
 */
function parseCommand(text) {
    const lowerText = text.toLowerCase().trim();

    // Menu keywords
    const menuKeywords = ['menu', 'carte', 'القائمة', 'لكارطا', 'lista'];
    if (menuKeywords.some(k => lowerText.includes(k))) {
        return { type: 'menu' };
    }

    // Status keywords
    const statusKeywords = ['status', 'état', 'الحالة', 'فين', 'where', 'track'];
    if (statusKeywords.some(k => lowerText.includes(k))) {
        return { type: 'status' };
    }

    // Order detection (contains numbers + item references)
    const orderPattern = /(\d+)\s*[x×]\s*(.+)/gi;
    const matches = [...text.matchAll(orderPattern)];
    if (matches.length > 0) {
        const items = matches.map(m => ({
            quantity: parseInt(m[1]),
            nameQuery: m[2].trim(),
        }));
        return { type: 'order', items };
    }

    // Help / default
    return { type: 'help' };
}

/**
 * Send the menu to the user
 */
async function handleMenuRequest(tenantId, recipientJid, socket) {
    // Get the tenant's first active location
    const location = await prisma.location.findFirst({
        where: { tenantId, isActive: true },
        include: {
            menuItems: {
                where: { available: true },
                orderBy: [{ category: 'asc' }, { sortOrder: 'asc' }],
            },
        },
    });

    if (!location || location.menuItems.length === 0) {
        await sendWithProtection(socket, recipientJid, {
            text: '📋 Menu is currently unavailable. Please try again later.\n\n📋 القائمة غير متوفرة حاليا. حاول مرة أخرى لاحقا.',
        }, tenantId);
        return;
    }

    // Group by category
    const categories = {};
    for (const item of location.menuItems) {
        if (!categories[item.category]) categories[item.category] = [];
        categories[item.category].push(item);
    }

    // Build menu text
    let menuText = `🍽️ *${location.name}*\n\n`;

    for (const [category, items] of Object.entries(categories)) {
        menuText += `📌 *${category}*\n`;
        for (const item of items) {
            const nameLine = item.nameAr ? `${item.name} / ${item.nameAr}` : item.name;
            menuText += `  • ${nameLine} — ${parseFloat(item.price)} MAD\n`;
        }
        menuText += '\n';
    }

    menuText += '━━━━━━━━━━━━━━\n';
    menuText += '🛒 To order, send:\n';
    menuText += '  `2x Espresso, 1x Croissant`\n';
    menuText += '\n📊 To check order: send "status"';

    await sendWithProtection(socket, recipientJid, { text: menuText }, tenantId);
}

/**
 * Handle an order request (V1: fuzzy matching against menu items)
 */
async function handleOrderRequest(tenantId, recipientJid, socket, items, phoneE164) {
    if (!items || items.length === 0) {
        await sendWithProtection(socket, recipientJid, {
            text: '❌ Could not parse your order. Please use the format:\n`2x Espresso, 1x Croissant`',
        }, tenantId);
        return;
    }

    // Get location and menu
    const location = await prisma.location.findFirst({
        where: { tenantId, isActive: true },
        include: {
            menuItems: { where: { available: true } },
            tables: { where: { isActive: true }, take: 1 }, // Default table for WhatsApp orders
        },
    });

    if (!location) {
        await sendWithProtection(socket, recipientJid, {
            text: '❌ Restaurant is currently closed.',
        }, tenantId);
        return;
    }

    // Match items (fuzzy)
    const matchedItems = [];
    const unmatched = [];

    for (const requestedItem of items) {
        const match = location.menuItems.find(mi => {
            const names = [mi.name, mi.nameFr, mi.nameAr].filter(Boolean).map(n => n.toLowerCase());
            return names.some(n => n.includes(requestedItem.nameQuery.toLowerCase()));
        });

        if (match) {
            matchedItems.push({
                menuItemId: match.id,
                quantity: Math.min(requestedItem.quantity, 20),
                unitPrice: parseFloat(match.price),
                name: match.name,
            });
        } else {
            unmatched.push(requestedItem.nameQuery);
        }
    }

    if (matchedItems.length === 0) {
        await sendWithProtection(socket, recipientJid, {
            text: `❌ Could not find any matching items for: ${unmatched.join(', ')}\n\nSend "menu" to see available items.`,
        }, tenantId);
        return;
    }

    // Calculate total
    const total = matchedItems.reduce((sum, item) => sum + (item.unitPrice * item.quantity), 0);

    // Use a default "WhatsApp" table or the first table
    const defaultTable = location.tables[0];
    if (!defaultTable) {
        await sendWithProtection(socket, recipientJid, {
            text: '❌ No tables configured. Please visit the restaurant.',
        }, tenantId);
        return;
    }

    try {
        // Create the order
        const orderNumber = await prisma.order.count({
            where: { locationId: location.id, createdAt: { gte: new Date(new Date().setHours(0,0,0,0)) } }
        }) + 1;

        const order = await prisma.order.create({
            data: {
                locationId: location.id,
                tableId: defaultTable.id,
                orderNumber,
                totalAmount: total,
                source: 'WHATSAPP',
                status: 'PENDING',
                notes: `WhatsApp order from ${phoneE164}`,
                items: {
                    create: matchedItems.map(item => ({
                        menuItemId: item.menuItemId,
                        quantity: item.quantity,
                        unitPrice: item.unitPrice,
                    })),
                },
            },
        });

        // Build confirmation message
        let confirmText = `✅ *Order #${orderNumber} placed!*\n\n`;
        for (const item of matchedItems) {
            confirmText += `  ${item.quantity}x ${item.name} — ${item.unitPrice * item.quantity} MAD\n`;
        }
        confirmText += `\n💰 *Total: ${total} MAD*\n`;

        if (unmatched.length > 0) {
            confirmText += `\n⚠️ Could not find: ${unmatched.join(', ')}`;
        }

        confirmText += '\n\n📊 Send "status" to track your order.';

        await sendWithProtection(socket, recipientJid, { text: confirmText }, tenantId);

        // Update reputation
        await getOrCreateReputation(phoneE164);

    } catch (error) {
        console.error('WhatsApp order creation error:', error);
        await sendWithProtection(socket, recipientJid, {
            text: '❌ Failed to place your order. Please try again or scan the QR code at your table.',
        }, tenantId);
    }
}

/**
 * Handle order status request
 */
async function handleStatusRequest(tenantId, recipientJid, socket, phoneE164) {
    // Find recent orders from this phone number (via notes field)
    const recentOrder = await prisma.order.findFirst({
        where: {
            location: { tenantId },
            source: 'WHATSAPP',
            notes: { contains: phoneE164 },
            createdAt: { gte: new Date(new Date().setHours(0, 0, 0, 0)) },
        },
        orderBy: { createdAt: 'desc' },
        include: {
            items: { include: { menuItem: { select: { name: true } } } },
        },
    });

    if (!recentOrder) {
        await sendWithProtection(socket, recipientJid, {
            text: '📊 No recent orders found today.\n\nSend "menu" to see our menu.',
        }, tenantId);
        return;
    }

    const statusEmoji = {
        PENDING: '⏳', ACCEPTED: '👍', PREPARING: '👨‍🍳',
        READY: '✅', DELIVERED: '🎉', CANCELLED: '❌',
    };

    let statusText = `📊 *Order #${recentOrder.orderNumber}*\n`;
    statusText += `Status: ${statusEmoji[recentOrder.status] || '❓'} ${recentOrder.status}\n\n`;

    for (const item of recentOrder.items) {
        statusText += `  ${item.quantity}x ${item.menuItem.name}\n`;
    }
    statusText += `\n💰 Total: ${parseFloat(recentOrder.totalAmount)} MAD`;

    await sendWithProtection(socket, recipientJid, { text: statusText }, tenantId);
}

/**
 * Handle help/unknown command
 */
async function handleHelpRequest(tenantId, recipientJid, socket) {
    const helpText = `👋 *Welcome to QRistretto!*\n\n` +
        `Available commands:\n` +
        `📋 *menu* — View our menu / القائمة\n` +
        `🛒 *2x Espresso* — Place an order\n` +
        `📊 *status* — Track your order / الحالة\n` +
        `❓ *help* — Show this message\n\n` +
        `مرحبا! أرسل "القائمة" لرؤية القائمة`;

    await sendWithProtection(socket, recipientJid, { text: helpText }, tenantId);
}

/**
 * Handle voice order request
 */
async function handleVoiceRequest(tenantId, recipientJid, socket, message, phoneE164) {
    try {
        await sendWithProtection(socket, recipientJid, { 
            text: '🎙️ Processing your voice order... / جاري معالجة طلبك الصوتي...' 
        }, tenantId);
        
        // 1. Download the audio buffer
        const buffer = await downloadMediaMessage(
            message,
            'buffer',
            { },
            { logger: console } // Needed by Baileys
        );
        
        const mimeType = message.message.audioMessage.mimetype;
        
        // 2. Process through AI pipeline
        const result = await processVoiceOrder(tenantId, buffer, mimeType);
        
        if (!result.success || !result.structuredOrder || result.structuredOrder.items.length === 0) {
            const errorMsg = result.error || '❌ Could not understand the voice order. Please send text.\n\nلم نتمكن من فهم الطلب الصوتي. يرجى إرسال رسالة نصية.';
            await sendWithProtection(socket, recipientJid, { text: errorMsg }, tenantId);
            return;
        }
        
        // 3. Async queue processing
        // Instead of processing synchronously, hand it off to the order worker
        await orderCreateQueue.add('process-voice-order', {
            tenantId,
            locationId: result.structuredOrder.locationId,
            items: result.structuredOrder.items,
            phoneE164,
            source: 'WHATSAPP_VOICE',
            notes: result.structuredOrder.notes,
            recipientJid,
            transcription: result.transcription,
        });
        
    } catch (error) {
        console.error('WhatsApp voice processing error:', error);
        await sendWithProtection(socket, recipientJid, {
            text: '❌ Failed to process your voice message. Please send text instead.',
        }, tenantId);
    }
}

export { parseCommand, extractMessageText };

/**
 * Reputation Service (Trust & Fraud Engine)
 * Manages phone number reputation across the entire SaaS network.
 */

import prisma from '../config/database.js';

const BLOCK_THRESHOLD = -3;
const VERIFIED_THRESHOLD = 5;

/**
 * Get or create a phone reputation record
 */
export async function getOrCreateReputation(phoneNumber) {
    let reputation = await prisma.phoneReputation.findUnique({
        where: { phoneNumber },
    });

    if (!reputation) {
        reputation = await prisma.phoneReputation.create({
            data: { phoneNumber },
        });
    }

    return reputation;
}

/**
 * Record a successful order (increases reputation)
 */
export async function recordSuccessfulOrder(phoneNumber) {
    const reputation = await getOrCreateReputation(phoneNumber);

    const updatedReputation = await prisma.phoneReputation.update({
        where: { phoneNumber },
        data: {
            globalScore: reputation.globalScore + 1,
            totalOrders: reputation.totalOrders + 1,
            successfulOrders: reputation.successfulOrders + 1,
            lastSeenAt: new Date(),
            // Grant "Verified Buyer" badge at threshold
            isVerified: (reputation.globalScore + 1) >= VERIFIED_THRESHOLD ? true : reputation.isVerified,
        },
    });

    return updatedReputation;
}

/**
 * Flag a phone number (waiter reports fake/abusive order)
 * Returns: { reputation, isNowBlocked }
 */
export async function flagPhoneNumber(phoneNumber, tenantId, flaggedByUserId, reason, orderId = null) {
    const reputation = await getOrCreateReputation(phoneNumber);

    // Create the flag record
    await prisma.phoneFlag.create({
        data: {
            phoneNumber,
            tenantId,
            flaggedByUserId,
            reason,
            orderId,
        },
    });

    const newScore = reputation.globalScore - 1;
    const isNowBlocked = newScore <= BLOCK_THRESHOLD;

    const updatedReputation = await prisma.phoneReputation.update({
        where: { phoneNumber },
        data: {
            globalScore: newScore,
            flaggedCount: reputation.flaggedCount + 1,
            totalOrders: reputation.totalOrders + 1,
            lastSeenAt: new Date(),
            // Auto-block at threshold
            isGloballyBlocked: isNowBlocked ? true : reputation.isGloballyBlocked,
            blockedReason: isNowBlocked ? `Auto-blocked: score reached ${newScore}` : reputation.blockedReason,
            blockedAt: isNowBlocked ? new Date() : reputation.blockedAt,
        },
    });

    return { reputation: updatedReputation, isNowBlocked };
}

/**
 * Check if a phone number is blocked
 */
export async function isBlocked(phoneNumber) {
    const reputation = await prisma.phoneReputation.findUnique({
        where: { phoneNumber },
        select: { isGloballyBlocked: true, globalScore: true },
    });

    return reputation?.isGloballyBlocked || false;
}

/**
 * Check if a phone number is verified
 */
export async function isVerified(phoneNumber) {
    const reputation = await prisma.phoneReputation.findUnique({
        where: { phoneNumber },
        select: { isVerified: true, globalScore: true },
    });

    return reputation?.isVerified || false;
}

/**
 * Get reputation details for display
 */
export async function getReputationDetails(phoneNumber) {
    return prisma.phoneReputation.findUnique({
        where: { phoneNumber },
        include: {
            flags: {
                orderBy: { createdAt: 'desc' },
                take: 10,
            },
        },
    });
}

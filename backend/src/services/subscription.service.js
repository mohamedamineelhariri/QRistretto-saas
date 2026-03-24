/**
 * Subscription Service
 * Manages plan enforcement, subscription lifecycle, and billing checks.
 */

import prisma from '../config/database.js';

/**
 * Get the active subscription for a tenant
 */
export async function getSubscription(tenantId) {
    return prisma.subscription.findUnique({
        where: { tenantId },
        include: { plan: true },
    });
}

/**
 * Check if a tenant has access to a specific feature
 */
export async function hasFeature(tenantId, featureName) {
    const subscription = await getSubscription(tenantId);
    if (!subscription || !['ACTIVE', 'TRIAL'].includes(subscription.status)) {
        return false;
    }
    const features = subscription.plan.features || [];
    return features.includes(featureName);
}

/**
 * Get remaining orders for today (null = unlimited)
 */
export async function getRemainingOrders(tenantId) {
    const subscription = await getSubscription(tenantId);
    if (!subscription) return 0;

    const maxOrders = subscription.plan.maxOrdersPerDay;
    if (maxOrders === null) return null; // unlimited

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const todayCount = await prisma.order.count({
        where: {
            location: { tenantId },
            createdAt: { gte: today },
        },
    });

    return Math.max(0, maxOrders - todayCount);
}

/**
 * Check if subscription is active (including trial)
 */
export async function isSubscriptionActive(tenantId) {
    const subscription = await getSubscription(tenantId);
    return subscription && ['ACTIVE', 'TRIAL'].includes(subscription.status);
}

/**
 * Get usage stats for a tenant
 */
export async function getUsageStats(tenantId) {
    const subscription = await getSubscription(tenantId);
    if (!subscription) return null;

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const [userCount, locationCount, todayOrders] = await Promise.all([
        prisma.user.count({ where: { tenantId, isActive: true } }),
        prisma.location.count({ where: { tenantId, isActive: true } }),
        prisma.order.count({ where: { location: { tenantId }, createdAt: { gte: today } } }),
    ]);

    return {
        plan: subscription.plan,
        subscriptionStatus: subscription.status,
        trialEndsAt: subscription.trialEndsAt,
        usage: {
            staff: { current: userCount, max: subscription.plan.maxStaff },
            locations: { current: locationCount, max: subscription.plan.maxLocations },
            ordersToday: { current: todayOrders, max: subscription.plan.maxOrdersPerDay },
        },
    };
}

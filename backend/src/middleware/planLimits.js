/**
 * Plan Limits Middleware
 * 
 * Enforces plan-based constraints:
 * - Orders per day limit
 * - Staff count limit
 * - Location count limit
 */

import prisma from '../config/database.js';

/**
 * Check if the tenant has exceeded their daily order limit.
 * Must be used AFTER tenantScope middleware.
 */
export function enforceOrderLimit() {
    return async (req, res, next) => {
        try {
            const tenantId = req.tenantId;

            const subscription = await prisma.subscription.findUnique({
                where: { tenantId },
                include: { plan: true },
            });

            if (!subscription || !subscription.plan) {
                return res.status(403).json({
                    success: false,
                    message: 'Active subscription required to place orders.',
                });
            }

            const maxOrders = subscription.plan.maxOrdersPerDay;

            // null = unlimited
            if (maxOrders === null) {
                return next();
            }

            // Count today's orders across all locations for this tenant
            const today = new Date();
            today.setHours(0, 0, 0, 0);

            const todayOrderCount = await prisma.order.count({
                where: {
                    location: { tenantId },
                    createdAt: { gte: today },
                },
            });

            if (todayOrderCount >= maxOrders) {
                return res.status(429).json({
                    success: false,
                    message: `Daily order limit reached (${maxOrders} orders/day on ${subscription.plan.displayName} plan). Upgrade your plan to continue.`,
                    code: 'ORDER_LIMIT_REACHED',
                    currentCount: todayOrderCount,
                    limit: maxOrders,
                    plan: subscription.plan.name,
                });
            }

            // Attach remaining orders count for informational purposes
            req.remainingOrders = maxOrders - todayOrderCount;
            next();
        } catch (error) {
            console.error('Order limit check error:', error);
            next(); // Fail open — don't block orders if limit check fails
        }
    };
}

/**
 * Check staff count before creating a new staff member
 */
export async function enforceStaffLimit(tenantId) {
    const subscription = await prisma.subscription.findUnique({
        where: { tenantId },
        include: { plan: true },
    });

    if (!subscription || !subscription.plan) {
        throw new Error('Active subscription required.');
    }

    const maxStaff = subscription.plan.maxStaff;

    // null = unlimited
    if (maxStaff === null) return;

    const currentStaffCount = await prisma.user.count({
        where: { tenantId, isActive: true },
    });

    if (currentStaffCount >= maxStaff) {
        throw new Error(
            `Staff limit reached (${maxStaff} on ${subscription.plan.displayName} plan). Upgrade to add more staff.`
        );
    }
}

/**
 * Check location count before creating a new location
 */
export async function enforceLocationLimit(tenantId) {
    const subscription = await prisma.subscription.findUnique({
        where: { tenantId },
        include: { plan: true },
    });

    if (!subscription || !subscription.plan) {
        throw new Error('Active subscription required.');
    }

    const maxLocations = subscription.plan.maxLocations;

    // null = unlimited
    if (maxLocations === null) return;

    const currentLocationCount = await prisma.location.count({
        where: { tenantId, isActive: true },
    });

    if (currentLocationCount >= maxLocations) {
        throw new Error(
            `Location limit reached (${maxLocations} on ${subscription.plan.displayName} plan). Upgrade to add more locations.`
        );
    }
}

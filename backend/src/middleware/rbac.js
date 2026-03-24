/**
 * RBAC (Role-Based Access Control) Middleware
 * 
 * Provides two guard functions:
 * 1. checkPermission() — Validates the user has the required permission
 * 2. checkFeature()    — Validates the tenant's plan includes the required feature
 */

// Role hierarchy: higher roles inherit all permissions from lower roles
const ROLE_HIERARCHY = {
    OWNER:   5,
    MANAGER: 4,
    WAITER:  3,
    KITCHEN: 2,
    STAFF:   1,
};

// Base permissions per role (accumulated from hierarchy)
const ROLE_PERMISSIONS = {
    STAFF:   ['orders:read'],
    KITCHEN: ['orders:read', 'orders:prepare', 'orders:ready'],
    WAITER:  ['orders:read', 'orders:accept', 'orders:deliver', 'orders:history:own'],
    MANAGER: [
        'orders:read', 'orders:accept', 'orders:deliver', 'orders:history:own',
        'orders:history:all', 'orders:cancel',
        'location:manage', 'menu:read', 'menu:write',
        'inventory:read', 'inventory:manage',
        'staff:read', 'staff:manage',
        'tables:read', 'tables:manage',
        'qr:manage',
        'reports:read',
    ],
    OWNER: [
        'orders:read', 'orders:accept', 'orders:deliver', 'orders:history:own',
        'orders:history:all', 'orders:cancel',
        'location:manage', 'location:create', 'location:delete',
        'menu:read', 'menu:write',
        'inventory:read', 'inventory:manage',
        'staff:read', 'staff:manage', 'staff:create', 'staff:delete',
        'tables:read', 'tables:manage',
        'qr:manage',
        'reports:read', 'reports:export',
        'tenant:manage', 'tenant:settings',
        'billing:manage',
        'whatsapp:manage',
    ],
};

/**
 * Check if a user has the required permission based on role + custom permissions.
 * 
 * Usage: router.get('/menu', verifyToken, tenantScope, checkPermission('menu:read'), handler)
 */
export function checkPermission(...requiredPermissions) {
    return (req, res, next) => {
        const userRole = req.userRole;
        const customPermissions = req.userPermissions || [];

        if (!userRole) {
            return res.status(403).json({
                success: false,
                message: 'Access denied. No role assigned.',
            });
        }

        // Get base permissions for the user's role
        const rolePermissions = ROLE_PERMISSIONS[userRole] || [];

        // Combine role permissions + custom permissions
        const allPermissions = new Set([...rolePermissions, ...customPermissions]);

        // Check if user has ALL required permissions
        const hasAllPermissions = requiredPermissions.every(perm => {
            // Support wildcard: 'orders:*' matches 'orders:read', 'orders:write', etc.
            if (allPermissions.has(perm)) return true;

            // Check for wildcard matches
            const [domain] = perm.split(':');
            return allPermissions.has(`${domain}:*`) || allPermissions.has('*');
        });

        if (!hasAllPermissions) {
            return res.status(403).json({
                success: false,
                message: `Access denied. Required: ${requiredPermissions.join(', ')}`,
            });
        }

        next();
    };
}

/**
 * Check if the tenant's subscription plan includes the required feature.
 * 
 * Usage: router.post('/whatsapp', verifyToken, tenantScope, checkFeature('whatsapp_bot'), handler)
 */
export function checkFeature(...requiredFeatures) {
    return async (req, res, next) => {
        try {
            const tenantId = req.tenantId;

            if (!tenantId) {
                return res.status(403).json({
                    success: false,
                    message: 'Tenant context required.',
                });
            }

            // Fetch the tenant's subscription and plan
            const { default: prisma } = await import('../config/database.js');

            const subscription = await prisma.subscription.findUnique({
                where: { tenantId },
                include: { plan: true },
            });

            if (!subscription || subscription.status === 'CANCELLED') {
                return res.status(403).json({
                    success: false,
                    message: 'Active subscription required.',
                });
            }

            if (subscription.status === 'SUSPENDED') {
                return res.status(403).json({
                    success: false,
                    message: 'Subscription suspended. Please contact support.',
                });
            }

            const planFeatures = subscription.plan.features || [];

            const hasAllFeatures = requiredFeatures.every(feature =>
                planFeatures.includes(feature)
            );

            if (!hasAllFeatures) {
                return res.status(403).json({
                    success: false,
                    message: `Feature not available on your plan (${subscription.plan.displayName}). Upgrade required.`,
                    requiredFeatures,
                    currentPlan: subscription.plan.name,
                });
            }

            // Attach plan info to request for downstream use
            req.plan = subscription.plan;
            req.subscription = subscription;

            next();
        } catch (error) {
            console.error('Feature check error:', error);
            return res.status(500).json({
                success: false,
                message: 'Failed to verify feature access.',
            });
        }
    };
}

export { ROLE_PERMISSIONS, ROLE_HIERARCHY };

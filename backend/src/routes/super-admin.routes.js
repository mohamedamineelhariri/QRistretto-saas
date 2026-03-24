import express from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { body, param, query } from 'express-validator';
import prisma from '../config/database.js';
import { validate } from '../middleware/validation.js';
import { verifySuperAdmin } from '../middleware/auth.js';

const router = express.Router();

/**
 * POST /api/super-admin/login
 * Super Admin login (separate auth domain)
 */
router.post(
    '/login',
    [
        body('email').isEmail().normalizeEmail(),
        body('password').isLength({ min: 8 }),
        validate,
    ],
    async (req, res) => {
        try {
            const { email, password } = req.body;

            const admin = await prisma.superAdmin.findUnique({
                where: { email },
            });

            if (!admin || !admin.isActive) {
                return res.status(401).json({ success: false, message: 'Invalid credentials' });
            }

            const isValid = await bcrypt.compare(password, admin.passwordHash);
            if (!isValid) {
                return res.status(401).json({ success: false, message: 'Invalid credentials' });
            }

            // Update last login
            await prisma.superAdmin.update({
                where: { id: admin.id },
                data: { lastLoginAt: new Date() },
            });

            const token = jwt.sign(
                { adminId: admin.id, type: 'super_admin' },
                process.env.JWT_SECRET,
                { expiresIn: '4h' }
            );

            res.json({
                success: true,
                data: {
                    token,
                    admin: { id: admin.id, name: admin.name, email: admin.email },
                },
            });
        } catch (error) {
            console.error('Super Admin login error:', error);
            res.status(500).json({ success: false, message: 'Login failed' });
        }
    }
);

// All routes below require Super Admin auth
router.use(verifySuperAdmin);

/**
 * GET /api/super-admin/tenants
 * List all tenants with pagination and filters
 */
router.get('/tenants', async (req, res) => {
    try {
        const page = parseInt(req.query.page) || 1;
        const limit = Math.min(parseInt(req.query.limit) || 20, 100);
        const status = req.query.status;
        const search = req.query.search;

        const where = {};
        if (status) where.status = status;
        if (search) {
            where.OR = [
                { businessName: { contains: search, mode: 'insensitive' } },
                { slug: { contains: search, mode: 'insensitive' } },
            ];
        }

        const [tenants, total] = await Promise.all([
            prisma.tenant.findMany({
                where,
                include: {
                    subscription: {
                        include: { plan: { select: { name: true, displayName: true } } },
                    },
                    _count: {
                        select: { users: true, locations: true },
                    },
                },
                orderBy: { createdAt: 'desc' },
                skip: (page - 1) * limit,
                take: limit,
            }),
            prisma.tenant.count({ where }),
        ]);

        res.json({
            success: true,
            data: {
                tenants,
                pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
            },
        });
    } catch (error) {
        console.error('List tenants error:', error);
        res.status(500).json({ success: false, message: 'Failed to fetch tenants' });
    }
});

/**
 * GET /api/super-admin/tenants/:tenantId
 * Get tenant details with full usage stats
 */
router.get(
    '/tenants/:tenantId',
    [param('tenantId').isUUID(), validate],
    async (req, res) => {
        try {
            const tenant = await prisma.tenant.findUnique({
                where: { id: req.params.tenantId },
                include: {
                    subscription: { include: { plan: true } },
                    users: {
                        select: { id: true, name: true, email: true, role: true, isActive: true, lastLoginAt: true },
                    },
                    locations: {
                        select: { id: true, name: true, isActive: true },
                    },
                    _count: {
                        select: { users: true, locations: true },
                    },
                },
            });

            if (!tenant) {
                return res.status(404).json({ success: false, message: 'Tenant not found' });
            }

            // Get order stats across all locations
            const today = new Date();
            today.setHours(0, 0, 0, 0);

            const locationIds = tenant.locations.map(l => l.id);
            const [totalOrders, todayOrders, totalRevenue] = await Promise.all([
                prisma.order.count({ where: { locationId: { in: locationIds } } }),
                prisma.order.count({ where: { locationId: { in: locationIds }, createdAt: { gte: today } } }),
                prisma.order.aggregate({
                    where: { locationId: { in: locationIds }, status: 'DELIVERED' },
                    _sum: { totalAmount: true },
                }),
            ]);

            res.json({
                success: true,
                data: {
                    tenant,
                    stats: {
                        totalOrders,
                        todayOrders,
                        totalRevenue: parseFloat(totalRevenue._sum.totalAmount || 0),
                    },
                },
            });
        } catch (error) {
            console.error('Get tenant error:', error);
            res.status(500).json({ success: false, message: 'Failed to fetch tenant' });
        }
    }
);

/**
 * PATCH /api/super-admin/tenants/:tenantId/status
 * Approve, suspend, or reactivate a tenant
 */
router.patch(
    '/tenants/:tenantId/status',
    [
        param('tenantId').isUUID(),
        body('status').isIn(['ACTIVE', 'SUSPENDED', 'CHURNED']).withMessage('Invalid status'),
        body('reason').optional().trim().isLength({ max: 500 }),
        validate,
    ],
    async (req, res) => {
        try {
            const { status, reason } = req.body;

            const tenant = await prisma.tenant.findUnique({
                where: { id: req.params.tenantId },
            });

            if (!tenant) {
                return res.status(404).json({ success: false, message: 'Tenant not found' });
            }

            const updatedTenant = await prisma.tenant.update({
                where: { id: req.params.tenantId },
                data: { status },
            });

            // If activating, also activate the subscription
            if (status === 'ACTIVE') {
                await prisma.subscription.updateMany({
                    where: { tenantId: req.params.tenantId },
                    data: { status: 'ACTIVE' },
                });
            }

            // If suspending, also suspend the subscription
            if (status === 'SUSPENDED') {
                await prisma.subscription.updateMany({
                    where: { tenantId: req.params.tenantId },
                    data: { status: 'SUSPENDED' },
                });
            }

            res.json({
                success: true,
                message: `Tenant ${status.toLowerCase()} successfully`,
                data: { tenant: updatedTenant },
            });
        } catch (error) {
            console.error('Update tenant status error:', error);
            res.status(500).json({ success: false, message: 'Failed to update tenant status' });
        }
    }
);

/**
 * GET /api/super-admin/analytics
 * Platform-wide analytics
 */
router.get('/analytics', async (req, res) => {
    try {
        const today = new Date();
        today.setHours(0, 0, 0, 0);

        const [
            totalTenants,
            activeTenants,
            pendingTenants,
            totalUsers,
            totalOrders,
            todayOrders,
            totalRevenue,
        ] = await Promise.all([
            prisma.tenant.count(),
            prisma.tenant.count({ where: { status: 'ACTIVE' } }),
            prisma.tenant.count({ where: { status: 'PENDING_APPROVAL' } }),
            prisma.user.count(),
            prisma.order.count(),
            prisma.order.count({ where: { createdAt: { gte: today } } }),
            prisma.order.aggregate({
                where: { status: 'DELIVERED' },
                _sum: { totalAmount: true },
            }),
        ]);

        // Plan distribution
        const planDistribution = await prisma.subscription.groupBy({
            by: ['planId'],
            _count: true,
            where: { status: { in: ['ACTIVE', 'TRIAL'] } },
        });

        res.json({
            success: true,
            data: {
                totalTenants,
                activeTenants,
                pendingTenants,
                totalUsers,
                totalOrders,
                todayOrders,
                totalRevenue: parseFloat(totalRevenue._sum.totalAmount || 0),
                planDistribution,
            },
        });
    } catch (error) {
        console.error('Analytics error:', error);
        res.status(500).json({ success: false, message: 'Failed to fetch analytics' });
    }
});

/**
 * CRUD /api/super-admin/plans
 * Manage subscription plans
 */
router.get('/plans', async (req, res) => {
    try {
        const plans = await prisma.plan.findMany({
            include: { _count: { select: { subscriptions: true } } },
            orderBy: { sortOrder: 'asc' },
        });
        res.json({ success: true, data: { plans } });
    } catch (error) {
        res.status(500).json({ success: false, message: 'Failed to fetch plans' });
    }
});

router.post(
    '/plans',
    [
        body('name').trim().isLength({ min: 2 }),
        body('displayName').trim().isLength({ min: 2 }),
        body('priceMAD').isInt({ min: 0 }),
        body('features').isArray(),
        validate,
    ],
    async (req, res) => {
        try {
            const plan = await prisma.plan.create({ data: req.body });
            res.status(201).json({ success: true, data: { plan } });
        } catch (error) {
            res.status(500).json({ success: false, message: 'Failed to create plan' });
        }
    }
);

/**
 * GET /api/super-admin/blocked-numbers
 * Get globally blocked phone numbers
 */
router.get('/blocked-numbers', async (req, res) => {
    try {
        const blockedNumbers = await prisma.phoneReputation.findMany({
            where: { isGloballyBlocked: true },
            include: {
                flags: {
                    orderBy: { createdAt: 'desc' },
                    take: 5,
                },
            },
            orderBy: { blockedAt: 'desc' },
        });
        res.json({ success: true, data: { blockedNumbers } });
    } catch (error) {
        res.status(500).json({ success: false, message: 'Failed to fetch blocked numbers' });
    }
});

/**
 * PATCH /api/super-admin/blocked-numbers/:phoneNumber/unblock
 * Unblock a phone number (Super Admin review)
 */
router.patch(
    '/blocked-numbers/:phoneNumber/unblock',
    async (req, res) => {
        try {
            const phone = await prisma.phoneReputation.update({
                where: { phoneNumber: req.params.phoneNumber },
                data: {
                    isGloballyBlocked: false,
                    globalScore: 0, // Reset score
                    blockedReason: null,
                    blockedAt: null,
                },
            });
            res.json({ success: true, message: 'Phone number unblocked', data: { phone } });
        } catch (error) {
            res.status(500).json({ success: false, message: 'Failed to unblock number' });
        }
    }
);

export default router;

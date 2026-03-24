import express from 'express';
import { body, param } from 'express-validator';
import bcrypt from 'bcryptjs';
import { validate } from '../middleware/validation.js';
import { verifyToken } from '../middleware/auth.js';
import { tenantScope } from '../middleware/tenantScope.js';
import { checkPermission } from '../middleware/rbac.js';
import { enforceStaffLimit } from '../middleware/planLimits.js';
import prisma from '../config/database.js';
import { getUsageStats } from '../services/subscription.service.js';

const router = express.Router();

// All admin routes require authentication + tenant scope
router.use(verifyToken);
router.use(tenantScope);

/**
 * GET /api/admin/dashboard
 * Get dashboard stats for the current location
 */
router.get('/dashboard', async (req, res) => {
    try {
        const locationId = req.locationId;
        if (!locationId) {
            return res.status(400).json({ success: false, message: 'Location ID required (set via X-Location-Id header)' });
        }

        const today = new Date();
        today.setHours(0, 0, 0, 0);

        const [
            todayOrders,
            pendingOrders,
            totalMenuItems,
            totalTables,
            todayRevenue,
            usageStats,
        ] = await Promise.all([
            prisma.order.count({
                where: { locationId, createdAt: { gte: today } },
            }),
            prisma.order.count({
                where: {
                    locationId,
                    status: { in: ['PENDING', 'ACCEPTED', 'PREPARING', 'READY'] },
                },
            }),
            prisma.menuItem.count({
                where: { locationId },
            }),
            prisma.table.count({
                where: { locationId, isActive: true },
            }),
            prisma.order.aggregate({
                where: { locationId, createdAt: { gte: today }, status: 'DELIVERED' },
                _sum: { totalAmount: true },
            }),
            getUsageStats(req.tenantId),
        ]);

        res.json({
            success: true,
            data: {
                todayOrders,
                pendingOrders,
                totalMenuItems,
                totalTables,
                todayRevenue: parseFloat(todayRevenue._sum.totalAmount || 0),
                plan: usageStats?.plan?.name || 'UNKNOWN',
                usage: usageStats?.usage || null,
            },
        });
    } catch (error) {
        console.error('Dashboard error:', error);
        res.status(500).json({ success: false, message: 'Failed to fetch dashboard data' });
    }
});

/**
 * GET /api/admin/location
 * Get current location details (replaces /restaurant)
 */
router.get('/location', async (req, res) => {
    try {
        const locationId = req.locationId;
        if (!locationId) {
            return res.status(400).json({ success: false, message: 'Location ID required' });
        }

        const location = await prisma.location.findUnique({
            where: { id: locationId },
            include: {
                wifiNetworks: true,
                tenant: {
                    select: {
                        id: true,
                        businessName: true,
                        businessNameFr: true,
                        businessNameAr: true,
                        logoUrl: true,
                        phoneNumber: true,
                        settings: true,
                    },
                },
                _count: {
                    select: { tables: true, menuItems: true, orders: true },
                },
            },
        });

        if (!location) {
            return res.status(404).json({ success: false, message: 'Location not found' });
        }

        res.json({ success: true, data: { location } });
    } catch (error) {
        console.error('Get location error:', error);
        res.status(500).json({ success: false, message: 'Failed to fetch location data' });
    }
});

/**
 * PUT /api/admin/location
 * Update current location details (replaces PUT /restaurant)
 */
router.put(
    '/location',
    [
        body('name').optional().trim().isLength({ min: 2, max: 100 }),
        body('nameFr').optional().trim().isLength({ max: 100 }),
        body('nameAr').optional().trim().isLength({ max: 100 }),
        body('address').optional().trim().isLength({ min: 5, max: 200 }),
        body('phoneNumber').optional().trim().isLength({ min: 5, max: 20 }),
        body('settings').optional().isObject(),
        validate,
    ],
    checkPermission('location:manage'),
    async (req, res) => {
        try {
            const locationId = req.locationId;
            if (!locationId) {
                return res.status(400).json({ success: false, message: 'Location ID required' });
            }

            const { name, nameFr, nameAr, address, phoneNumber, settings } = req.body;

            const location = await prisma.location.update({
                where: { id: locationId },
                data: { name, nameFr, nameAr, address, phoneNumber, settings: settings || undefined },
            });

            res.json({ success: true, message: 'Location updated', data: { location } });
        } catch (error) {
            console.error('Update location error:', error);
            res.status(500).json({ success: false, message: 'Failed to update location' });
        }
    }
);

/**
 * PUT /api/admin/tenant
 * Update tenant-level settings (business name, logo, etc.)
 */
router.put(
    '/tenant',
    [
        body('businessName').optional().trim().isLength({ min: 2, max: 100 }),
        body('logoUrl').optional().isURL(),
        validate,
    ],
    checkPermission('tenant:manage'),
    async (req, res) => {
        try {
            const { businessName, businessNameFr, businessNameAr, logoUrl } = req.body;

            const tenant = await prisma.tenant.update({
                where: { id: req.tenantId },
                data: { businessName, businessNameFr, businessNameAr, logoUrl },
            });

            res.json({ success: true, message: 'Tenant updated', data: { tenant } });
        } catch (error) {
            console.error('Update tenant error:', error);
            res.status(500).json({ success: false, message: 'Failed to update tenant' });
        }
    }
);

/**
 * POST /api/admin/wifi-networks
 * Add WiFi network to current location
 */
router.post(
    '/wifi-networks',
    [
        body('networkName').trim().isLength({ min: 1, max: 50 }),
        body('ipRange').matches(/^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}\/\d{1,2}$/),
        body('networkType').optional().isIn(['main', '5G', '2.4G', 'guest']),
        validate,
    ],
    checkPermission('location:manage'),
    async (req, res) => {
        try {
            const locationId = req.locationId;
            if (!locationId) {
                return res.status(400).json({ success: false, message: 'Location ID required' });
            }

            const { networkName, ipRange, networkType } = req.body;

            const network = await prisma.wifiNetwork.create({
                data: { locationId, networkName, ipRange, networkType: networkType || 'main' },
            });

            res.status(201).json({ success: true, message: 'WiFi network added', data: { network } });
        } catch (error) {
            console.error('Add WiFi network error:', error);
            res.status(500).json({ success: false, message: 'Failed to add WiFi network' });
        }
    }
);

/**
 * DELETE /api/admin/wifi-networks/:networkId
 */
router.delete(
    '/wifi-networks/:networkId',
    [param('networkId').isUUID(), validate],
    checkPermission('location:manage'),
    async (req, res) => {
        try {
            const network = await prisma.wifiNetwork.findFirst({
                where: { id: req.params.networkId, locationId: req.locationId },
            });

            if (!network) {
                return res.status(404).json({ success: false, message: 'Network not found' });
            }

            await prisma.wifiNetwork.delete({ where: { id: req.params.networkId } });
            res.json({ success: true, message: 'WiFi network deleted' });
        } catch (error) {
            console.error('Delete WiFi network error:', error);
            res.status(500).json({ success: false, message: 'Failed to delete WiFi network' });
        }
    }
);

/**
 * GET /api/admin/staff
 * Get all staff members for this tenant
 */
router.get('/staff', checkPermission('staff:read'), async (req, res) => {
    try {
        const staff = await prisma.user.findMany({
            where: { tenantId: req.tenantId },
            select: {
                id: true,
                name: true,
                email: true,
                role: true,
                isActive: true,
                lastLoginAt: true,
                createdAt: true,
            },
            orderBy: { name: 'asc' },
        });

        res.json({ success: true, data: { staff } });
    } catch (error) {
        console.error('Get staff error:', error);
        res.status(500).json({ success: false, message: 'Failed to fetch staff' });
    }
});

/**
 * POST /api/admin/staff
 * Create staff member (User with role + PIN)
 */
router.post(
    '/staff',
    [
        body('name').trim().isLength({ min: 2, max: 50 }),
        body('email').isEmail().normalizeEmail(),
        body('pin').isLength({ min: 4, max: 6 }).isNumeric().withMessage('PIN must be 4-6 digits'),
        body('role').isIn(['WAITER', 'KITCHEN', 'MANAGER', 'STAFF']),
        validate,
    ],
    checkPermission('staff:create'),
    async (req, res) => {
        try {
            // Check plan limit
            await enforceStaffLimit(req.tenantId);

            const { name, email, pin, role } = req.body;

            // Check if email already exists
            const existing = await prisma.user.findUnique({ where: { email } });
            if (existing) {
                return res.status(400).json({ success: false, message: 'Email already in use' });
            }

            const hashedPin = await bcrypt.hash(pin, 10);
            const passwordHash = await bcrypt.hash(pin + 'staff', 10); // Default password

            const staff = await prisma.user.create({
                data: {
                    tenantId: req.tenantId,
                    name,
                    email,
                    passwordHash,
                    pin: hashedPin,
                    role,
                },
                select: { id: true, name: true, email: true, role: true, createdAt: true },
            });

            res.status(201).json({ success: true, message: 'Staff member created', data: { staff } });
        } catch (error) {
            console.error('Create staff error:', error);
            if (error.message.includes('Staff limit')) {
                return res.status(403).json({ success: false, message: error.message });
            }
            res.status(500).json({ success: false, message: 'Failed to create staff member' });
        }
    }
);

/**
 * DELETE /api/admin/staff/:staffId
 */
router.delete(
    '/staff/:staffId',
    [param('staffId').isUUID(), validate],
    checkPermission('staff:delete'),
    async (req, res) => {
        try {
            const staff = await prisma.user.findFirst({
                where: { id: req.params.staffId, tenantId: req.tenantId },
            });

            if (!staff) {
                return res.status(404).json({ success: false, message: 'Staff member not found' });
            }

            // Don't allow deleting the last OWNER
            if (staff.role === 'OWNER') {
                const ownerCount = await prisma.user.count({
                    where: { tenantId: req.tenantId, role: 'OWNER' },
                });
                if (ownerCount <= 1) {
                    return res.status(400).json({
                        success: false,
                        message: 'Cannot delete the last owner',
                    });
                }
            }

            await prisma.user.delete({ where: { id: req.params.staffId } });
            res.json({ success: true, message: 'Staff member deleted' });
        } catch (error) {
            console.error('Delete staff error:', error);
            res.status(500).json({ success: false, message: 'Failed to delete staff member' });
        }
    }
);

/**
 * GET /api/admin/locations
 * Get all locations for this tenant
 */
router.get('/locations', checkPermission('location:manage'), async (req, res) => {
    try {
        const locations = await prisma.location.findMany({
            where: { tenantId: req.tenantId },
            include: {
                _count: { select: { tables: true, menuItems: true, orders: true } },
            },
            orderBy: { name: 'asc' },
        });

        res.json({ success: true, data: { locations } });
    } catch (error) {
        console.error('Get locations error:', error);
        res.status(500).json({ success: false, message: 'Failed to fetch locations' });
    }
});

export default router;

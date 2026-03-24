import express from 'express';
import { body, param } from 'express-validator';
import { validate } from '../middleware/validation.js';
import { verifyToken } from '../middleware/auth.js';
import { tenantScope } from '../middleware/tenantScope.js';
import { checkPermission } from '../middleware/rbac.js';
import prisma from '../config/database.js';

const router = express.Router();

/**
 * GET /api/tables
 * Get all tables for current location (admin)
 */
router.get(
    '/',
    verifyToken,
    tenantScope,
    checkPermission('tables:read'),
    async (req, res) => {
        try {
            const locationId = req.locationId;
            if (!locationId) {
                return res.status(400).json({ success: false, message: 'Location ID required' });
            }

            const tables = await prisma.table.findMany({
                where: { locationId },
                include: {
                    qrTokens: {
                        orderBy: { createdAt: 'desc' },
                        take: 1,
                    },
                    _count: {
                        select: {
                            orders: {
                                where: { status: { notIn: ['DELIVERED', 'CANCELLED'] } },
                            },
                        },
                    },
                },
                orderBy: { tableNumber: 'asc' },
            });

            const apiBaseUrl = process.env.API_URL || 'http://localhost:5000';

            const tablesWithQR = await Promise.all(tables.map(async (table) => {
                const activeToken = table.qrTokens[0];
                const qrUrl = `${apiBaseUrl}/api/qr/scan/${table.id}`;
                let qrDataUrl = null;

                try {
                    const QRCode = (await import('qrcode')).default;
                    qrDataUrl = await QRCode.toDataURL(qrUrl, { width: 400, margin: 2 });
                } catch (e) {
                    // QR generation failed
                }

                let qrCodes = [];
                if (activeToken) {
                    qrCodes = [{
                        id: activeToken.id,
                        token: activeToken.token,
                        qrUrl,
                        qrDataUrl,
                        expiresAt: activeToken.expiresAt,
                        active: new Date(activeToken.expiresAt) > new Date(),
                    }];
                } else {
                    qrCodes = [{
                        id: 'stable',
                        token: 'stable',
                        qrUrl,
                        qrDataUrl,
                        expiresAt: new Date(0).toISOString(),
                        active: false,
                    }];
                }

                return { ...table, qrCodes, qrTokens: undefined };
            }));

            res.json({ success: true, data: { tables: tablesWithQR } });
        } catch (error) {
            console.error('Get tables error:', error);
            res.status(500).json({ success: false, message: 'Failed to fetch tables' });
        }
    }
);

/**
 * POST /api/tables
 * Create new table (admin)
 */
router.post(
    '/',
    verifyToken,
    tenantScope,
    checkPermission('tables:manage'),
    [
        body('tableNumber').isInt({ min: 1, max: 999 }),
        body('tableName').optional().trim().isLength({ max: 50 }),
        body('capacity').optional().isInt({ min: 1, max: 50 }),
        validate,
    ],
    async (req, res) => {
        try {
            const locationId = req.locationId;
            if (!locationId) {
                return res.status(400).json({ success: false, message: 'Location ID required' });
            }

            const { tableNumber, tableName, capacity } = req.body;

            const existing = await prisma.table.findFirst({
                where: { locationId, tableNumber },
            });

            if (existing) {
                return res.status(400).json({
                    success: false,
                    message: `Table ${tableNumber} already exists`,
                });
            }

            const table = await prisma.table.create({
                data: { locationId, tableNumber, tableName, capacity: capacity || 4 },
            });

            res.status(201).json({ success: true, message: 'Table created', data: { table } });
        } catch (error) {
            console.error('Create table error:', error);
            res.status(500).json({ success: false, message: 'Failed to create table' });
        }
    }
);

/**
 * PUT /api/tables/:tableId
 * Update table (admin)
 */
router.put(
    '/:tableId',
    verifyToken,
    tenantScope,
    checkPermission('tables:manage'),
    [
        param('tableId').isUUID(),
        body('tableName').optional().trim().isLength({ max: 50 }),
        body('capacity').optional().isInt({ min: 1, max: 50 }),
        body('isActive').optional().isBoolean(),
        validate,
    ],
    async (req, res) => {
        try {
            const { tableId } = req.params;
            const { tableName, capacity, isActive } = req.body;

            const table = await prisma.table.findFirst({
                where: { id: tableId, locationId: req.locationId },
            });

            if (!table) {
                return res.status(404).json({ success: false, message: 'Table not found' });
            }

            const updated = await prisma.table.update({
                where: { id: tableId },
                data: { tableName, capacity, isActive },
            });

            res.json({ success: true, message: 'Table updated', data: { table: updated } });
        } catch (error) {
            console.error('Update table error:', error);
            res.status(500).json({ success: false, message: 'Failed to update table' });
        }
    }
);

/**
 * DELETE /api/tables/:tableId
 */
router.delete(
    '/:tableId',
    verifyToken,
    tenantScope,
    checkPermission('tables:manage'),
    [param('tableId').isUUID(), validate],
    async (req, res) => {
        try {
            const { tableId } = req.params;

            const table = await prisma.table.findFirst({
                where: { id: tableId, locationId: req.locationId },
            });

            if (!table) {
                return res.status(404).json({ success: false, message: 'Table not found' });
            }

            await prisma.table.delete({ where: { id: tableId } });
            res.json({ success: true, message: 'Table deleted' });
        } catch (error) {
            console.error('Delete table error:', error);
            res.status(500).json({ success: false, message: 'Failed to delete table' });
        }
    }
);

export default router;

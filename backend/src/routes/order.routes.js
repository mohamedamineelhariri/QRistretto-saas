import express from 'express';
import rateLimit from 'express-rate-limit';
import { body, param } from 'express-validator';
import { validate } from '../middleware/validation.js';
import { verifyToken } from '../middleware/auth.js';
import { tenantScope } from '../middleware/tenantScope.js';
import { checkPermission } from '../middleware/rbac.js';
import { enforceOrderLimit } from '../middleware/planLimits.js';
import * as orderService from '../services/order.service.js';
import * as qrService from '../services/qrToken.service.js';

const router = express.Router();

/**
 * POST /api/orders
 * Create new order (customer — requires Wi-Fi validation)
 */
const orderLimiter = rateLimit({
    windowMs: 60 * 1000,
    max: 3,
    message: {
        success: false,
        message: 'Too many orders placed. Please wait a minute.',
        messageAr: 'تم تقديم الكثير من الطلبات. يرجى الانتظار لمدة دقيقة.',
        messageFr: 'Trop de commandes. Veuillez attendre une minute.',
    },
});

router.post(
    '/',
    [
        orderLimiter,
        body('token').isString().notEmpty().withMessage('QR token required'),
        body('items').isArray({ min: 1 }).withMessage('At least one item required'),
        body('items.*.menuItemId').isUUID().withMessage('Valid menu item ID required'),
        body('items.*.quantity').optional().isInt({ min: 1, max: 20 }),
        body('items.*.notes').optional().trim().isLength({ max: 200 }),
        body('notes').optional().trim().isLength({ max: 500 }),
        validate,
    ],
    async (req, res) => {
        try {
            const { token, items, notes } = req.body;

            // Validate QR token → returns { tableId, locationId, tableNumber }
            const tableInfo = await qrService.validateQRToken(token);

            if (!tableInfo) {
                return res.status(400).json({
                    success: false,
                    message: 'Invalid or expired QR code. Please scan again.',
                    messageAr: 'رمز QR غير صالح أو منتهي الصلاحية.',
                    messageFr: 'Code QR invalide ou expiré.',
                    code: 'INVALID_QR',
                });
            }

            // Create order using locationId from table info
            const order = await orderService.createOrder(
                tableInfo.locationId,
                tableInfo.tableId,
                items,
                notes
            );

            // Emit to waiter/kitchen dashboards
            const io = req.app.get('io');
            const roomName = `restaurant:${tableInfo.locationId}`;
            io.to(roomName).emit('order:new', {
                order,
                tableNumber: tableInfo.tableNumber,
            });

            res.status(201).json({
                success: true,
                message: 'Order placed successfully',
                messageAr: 'تم تقديم الطلب بنجاح',
                messageFr: 'Commande passée avec succès',
                data: { order, tableNumber: tableInfo.tableNumber },
            });
        } catch (error) {
            console.error('Create order error:', error);
            if (error.message === 'Some items are not available') {
                return res.status(400).json({
                    success: false,
                    message: 'Some items are no longer available',
                });
            }
            res.status(500).json({ success: false, message: 'Failed to place order' });
        }
    }
);

/**
 * GET /api/orders/:orderId
 * Get order by ID (for customer tracking — no auth required)
 */
router.get(
    '/:orderId',
    [param('orderId').isUUID(), validate],
    async (req, res) => {
        try {
            const order = await orderService.getOrderById(req.params.orderId);

            if (!order) {
                return res.status(404).json({ success: false, message: 'Order not found' });
            }

            res.json({ success: true, data: { order } });
        } catch (error) {
            console.error('Get order error:', error);
            res.status(500).json({ success: false, message: 'Failed to fetch order' });
        }
    }
);

/**
 * GET /api/orders/active/list
 * Get active orders for kitchen/waiter (requires auth)
 */
router.get(
    '/active/list',
    verifyToken,
    tenantScope,
    checkPermission('orders:read'),
    async (req, res) => {
        try {
            const locationId = req.locationId;
            if (!locationId) {
                return res.status(400).json({ success: false, message: 'Location ID required' });
            }

            const orders = await orderService.getOrdersByStatus(locationId);
            res.json({ success: true, data: { orders } });
        } catch (error) {
            console.error('Get active orders error:', error);
            res.status(500).json({ success: false, message: 'Failed to fetch orders' });
        }
    }
);

/**
 * PATCH /api/orders/:orderId/status
 * Update order status (staff only)
 */
router.patch(
    '/:orderId/status',
    verifyToken,
    tenantScope,
    [
        param('orderId').isUUID(),
        body('status').isIn(['ACCEPTED', 'PREPARING', 'READY', 'DELIVERED', 'CANCELLED']),
        validate,
    ],
    async (req, res) => {
        try {
            const { orderId } = req.params;
            const { status } = req.body;

            const order = await orderService.updateOrderStatus(
                orderId,
                req.locationId,
                status,
                req.userId,
                req.userRole
            );

            // Emit status update
            const io = req.app.get('io');
            io.to(`restaurant:${req.locationId}`).emit('order:updated', { order });
            io.to(`order:${orderId}`).emit('order:status', {
                orderId,
                status: order.status,
                updatedAt: order.updatedAt,
            });

            res.json({
                success: true,
                message: `Order status updated to ${status}`,
                data: { order },
            });
        } catch (error) {
            console.error('Update order status error:', error);
            if (error.message.includes('Cannot transition')) {
                return res.status(400).json({ success: false, message: error.message });
            }
            if (error.message === 'Order not found') {
                return res.status(404).json({ success: false, message: 'Order not found' });
            }
            res.status(500).json({ success: false, message: 'Failed to update order status' });
        }
    }
);

/**
 * GET /api/orders/history/list
 * Get order history (authenticated)
 */
router.get(
    '/history/list',
    verifyToken,
    tenantScope,
    checkPermission('orders:read'),
    async (req, res) => {
        try {
            const limit = Math.min(parseInt(req.query.limit) || 50, 100);
            const offset = parseInt(req.query.offset) || 0;
            const staffId = req.query.staffId || null;

            // Waiters can only see their own history
            const filterStaffId = req.userRole === 'WAITER' ? req.userId : staffId;

            const orders = await orderService.getOrderHistory(
                req.locationId, limit, offset, filterStaffId
            );

            res.json({
                success: true,
                data: { orders, pagination: { limit, offset } },
            });
        } catch (error) {
            console.error('Get order history error:', error);
            res.status(500).json({ success: false, message: 'Failed to fetch order history' });
        }
    }
);

/**
 * GET /api/orders/table/:token
 * Get orders for a table (customer view)
 */
router.get(
    '/table/:token',
    async (req, res) => {
        try {
            const tableInfo = await qrService.validateQRToken(req.params.token);

            if (!tableInfo) {
                return res.status(400).json({
                    success: false,
                    message: 'Invalid or expired QR code',
                    code: 'INVALID_QR',
                });
            }

            const orders = await orderService.getOrdersByTable(tableInfo.tableId);
            res.json({ success: true, data: { orders, table: tableInfo } });
        } catch (error) {
            console.error('Get table orders error:', error);
            res.status(500).json({ success: false, message: 'Failed to fetch orders' });
        }
    }
);

export default router;

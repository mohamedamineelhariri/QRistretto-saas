import express from 'express';
import { body, param } from 'express-validator';
import { validate } from '../middleware/validation.js';
import { verifyToken } from '../middleware/auth.js';
import { tenantScope } from '../middleware/tenantScope.js';
import { checkPermission } from '../middleware/rbac.js';
import * as inventoryService from '../services/inventory.service.js';

const router = express.Router();

// All inventory routes require auth + tenant scope
router.use(verifyToken);
router.use(tenantScope);

/**
 * GET /api/admin/inventory
 * Get all inventory items for current location
 */
router.get(
    '/',
    checkPermission('inventory:read'),
    async (req, res) => {
        try {
            const locationId = req.locationId;
            if (!locationId) {
                return res.status(400).json({ success: false, message: 'Location ID required' });
            }

            const items = await inventoryService.getAllInventoryItems(locationId);
            res.json({ success: true, data: { items } });
        } catch (error) {
            console.error('Get inventory error:', error);
            res.status(500).json({ success: false, message: 'Failed to fetch inventory' });
        }
    }
);

/**
 * GET /api/admin/inventory/low-stock
 */
router.get(
    '/low-stock',
    checkPermission('inventory:read'),
    async (req, res) => {
        try {
            const items = await inventoryService.getLowStockItems(req.locationId);
            res.json({ success: true, data: { items } });
        } catch (error) {
            console.error('Get low stock error:', error);
            res.status(500).json({ success: false, message: 'Failed to fetch low stock items' });
        }
    }
);

/**
 * POST /api/admin/inventory
 */
router.post(
    '/',
    checkPermission('inventory:manage'),
    [
        body('name').trim().notEmpty(),
        body('unit').trim().notEmpty(),
        body('currentStock').isNumeric(),
        body('minStock').isNumeric(),
        body('costPerUnit').isNumeric(),
        validate,
    ],
    async (req, res) => {
        try {
            const item = await inventoryService.createInventoryItem(req.locationId, req.body);
            res.status(201).json({ success: true, message: 'Inventory item created', data: { item } });
        } catch (error) {
            console.error('Create inventory error:', error);
            res.status(500).json({ success: false, message: 'Failed to create inventory item' });
        }
    }
);

/**
 * PUT /api/admin/inventory/:id
 */
router.put(
    '/:id',
    checkPermission('inventory:manage'),
    [param('id').isUUID(), validate],
    async (req, res) => {
        try {
            const item = await inventoryService.updateInventoryItem(
                req.params.id, req.locationId, req.body
            );
            res.json({ success: true, message: 'Inventory item updated', data: { item } });
        } catch (error) {
            console.error('Update inventory error:', error);
            if (error.message === 'Inventory item not found') {
                return res.status(404).json({ success: false, message: error.message });
            }
            res.status(500).json({ success: false, message: 'Failed to update inventory item' });
        }
    }
);

/**
 * PATCH /api/admin/inventory/:id/add-stock
 */
router.patch(
    '/:id/add-stock',
    checkPermission('inventory:manage'),
    [
        param('id').isUUID(),
        body('quantity').isNumeric(),
        validate,
    ],
    async (req, res) => {
        try {
            const item = await inventoryService.addStock(
                req.params.id, req.body.quantity, req.locationId
            );
            res.json({ success: true, message: 'Stock added successfully', data: { item } });
        } catch (error) {
            console.error('Add stock error:', error);
            res.status(500).json({ success: false, message: error.message || 'Failed to add stock' });
        }
    }
);

/**
 * DELETE /api/admin/inventory/:id
 */
router.delete(
    '/:id',
    checkPermission('inventory:manage'),
    [param('id').isUUID(), validate],
    async (req, res) => {
        try {
            await inventoryService.deleteInventoryItem(req.params.id, req.locationId);
            res.json({ success: true, message: 'Inventory item deleted' });
        } catch (error) {
            console.error('Delete inventory error:', error);
            if (error.message.includes('used in recipes')) {
                return res.status(400).json({ success: false, message: error.message });
            }
            res.status(500).json({ success: false, message: 'Failed to delete inventory item' });
        }
    }
);

export default router;

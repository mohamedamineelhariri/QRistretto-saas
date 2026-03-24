import express from 'express';
import { body, param, query } from 'express-validator';
import { validate } from '../middleware/validation.js';
import { verifyToken } from '../middleware/auth.js';
import { tenantScope } from '../middleware/tenantScope.js';
import { checkPermission } from '../middleware/rbac.js';
import * as menuService from '../services/menu.service.js';

const router = express.Router();

/**
 * GET /api/menu/:locationId
 * Get menu for customers (public, requires valid locationId)
 */
router.get(
    '/:locationId',
    [
        param('locationId').isUUID().withMessage('Invalid location ID'),
        query('locale').optional().isIn(['en', 'fr', 'ar']),
        validate,
    ],
    async (req, res) => {
        try {
            const { locationId } = req.params;
            const locale = req.query.locale || 'en';

            const menu = await menuService.getMenuByLocation(locationId, locale);

            res.json({
                success: true,
                data: { categories: menu, locale },
            });
        } catch (error) {
            console.error('Get menu error:', error);
            res.status(500).json({ success: false, message: 'Failed to fetch menu' });
        }
    }
);

/**
 * GET /api/menu/admin/all
 * Get all menu items for admin (includes unavailable)
 */
router.get(
    '/admin/all',
    verifyToken,
    tenantScope,
    checkPermission('menu:read'),
    async (req, res) => {
        try {
            const locationId = req.locationId;
            if (!locationId) {
                return res.status(400).json({ success: false, message: 'Location ID required' });
            }

            const items = await menuService.getAllMenuItems(locationId);
            res.json({ success: true, data: { items } });
        } catch (error) {
            console.error('Get all menu items error:', error);
            res.status(500).json({ success: false, message: 'Failed to fetch menu items' });
        }
    }
);

/**
 * POST /api/menu
 * Create new menu item (admin only)
 */
router.post(
    '/',
    verifyToken,
    tenantScope,
    checkPermission('menu:write'),
    [
        body('name').trim().isLength({ min: 1, max: 100 }),
        body('category').trim().isLength({ min: 1, max: 50 }),
        body('price').isFloat({ min: 0 }),
        body('nameFr').optional().trim().isLength({ max: 100 }),
        body('nameAr').optional().trim().isLength({ max: 100 }),
        body('description').optional().trim().isLength({ max: 500 }),
        body('descriptionFr').optional().trim().isLength({ max: 500 }),
        body('descriptionAr').optional().trim().isLength({ max: 500 }),
        body('categoryFr').optional().trim().isLength({ max: 50 }),
        body('categoryAr').optional().trim().isLength({ max: 50 }),
        body('imageUrl').optional().isURL(),
        body('available').optional().isBoolean(),
        body('sortOrder').optional().isInt({ min: 0 }),
        validate,
    ],
    async (req, res) => {
        try {
            const locationId = req.locationId;
            if (!locationId) {
                return res.status(400).json({ success: false, message: 'Location ID required' });
            }

            const item = await menuService.createMenuItem(locationId, req.body);
            res.status(201).json({ success: true, message: 'Menu item created', data: { item } });
        } catch (error) {
            console.error('Create menu item error:', error);
            res.status(500).json({ success: false, message: 'Failed to create menu item' });
        }
    }
);

/**
 * PUT /api/menu/:itemId
 * Update menu item (admin only)
 */
router.put(
    '/:itemId',
    verifyToken,
    tenantScope,
    checkPermission('menu:write'),
    [
        param('itemId').isUUID(),
        body('name').optional().trim().isLength({ min: 1, max: 100 }),
        body('category').optional().trim().isLength({ min: 1, max: 50 }),
        body('price').optional().isFloat({ min: 0 }),
        body('available').optional().isBoolean(),
        validate,
    ],
    async (req, res) => {
        try {
            const item = await menuService.updateMenuItem(
                req.params.itemId,
                req.locationId,
                req.body
            );

            res.json({ success: true, message: 'Menu item updated', data: { item } });
        } catch (error) {
            console.error('Update menu item error:', error);
            if (error.message === 'Menu item not found') {
                return res.status(404).json({ success: false, message: 'Menu item not found' });
            }
            res.status(500).json({ success: false, message: 'Failed to update menu item' });
        }
    }
);

/**
 * PATCH /api/menu/:itemId/toggle
 * Toggle item availability (admin only)
 */
router.patch(
    '/:itemId/toggle',
    verifyToken,
    tenantScope,
    checkPermission('menu:write'),
    [param('itemId').isUUID(), validate],
    async (req, res) => {
        try {
            const item = await menuService.toggleItemAvailability(
                req.params.itemId,
                req.locationId
            );

            // Emit socket event for real-time update
            const io = req.app.get('io');
            io.to(`restaurant:${req.locationId}`).emit('menu:updated', {
                itemId: item.id,
                available: item.available,
            });

            res.json({
                success: true,
                message: `Item ${item.available ? 'enabled' : 'disabled'}`,
                data: { item },
            });
        } catch (error) {
            console.error('Toggle availability error:', error);
            res.status(500).json({ success: false, message: 'Failed to toggle availability' });
        }
    }
);

/**
 * DELETE /api/menu/:itemId
 */
router.delete(
    '/:itemId',
    verifyToken,
    tenantScope,
    checkPermission('menu:write'),
    [param('itemId').isUUID(), validate],
    async (req, res) => {
        try {
            await menuService.deleteMenuItem(req.params.itemId, req.locationId);
            res.json({ success: true, message: 'Menu item deleted' });
        } catch (error) {
            console.error('Delete menu item error:', error);
            if (error.message === 'Menu item not found') {
                return res.status(404).json({ success: false, message: 'Menu item not found' });
            }
            res.status(500).json({ success: false, message: 'Failed to delete menu item' });
        }
    }
);

/**
 * GET /api/menu/categories/:locationId
 * Get unique categories (public)
 */
router.get(
    '/categories/:locationId',
    [param('locationId').isUUID(), validate],
    async (req, res) => {
        try {
            const categories = await menuService.getCategories(req.params.locationId);
            res.json({ success: true, data: { categories } });
        } catch (error) {
            console.error('Get categories error:', error);
            res.status(500).json({ success: false, message: 'Failed to fetch categories' });
        }
    }
);

export default router;

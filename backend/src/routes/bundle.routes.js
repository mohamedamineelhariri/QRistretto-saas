import express from 'express';
import { body, param } from 'express-validator';
import { validate } from '../middleware/validation.js';
import { verifyToken } from '../middleware/auth.js';
import { tenantScope } from '../middleware/tenantScope.js';
import { checkPermission } from '../middleware/rbac.js';
import * as bundleService from '../services/bundle.service.js';

const router = express.Router();

// All bundle routes require auth + tenant scope
router.use(verifyToken);
router.use(tenantScope);

/**
 * GET /api/admin/bundles
 */
router.get('/', checkPermission('menu:read'), async (req, res) => {
    try {
        const bundles = await bundleService.getAllBundles(req.locationId);
        res.json({ success: true, data: { bundles } });
    } catch (error) {
        console.error('Get bundles error:', error);
        res.status(500).json({ success: false, message: 'Failed to fetch bundles' });
    }
});

/**
 * GET /api/admin/bundles/:id
 */
router.get(
    '/:id',
    checkPermission('menu:read'),
    [param('id').isUUID(), validate],
    async (req, res) => {
        try {
            const bundle = await bundleService.getBundle(req.params.id, req.locationId);

            if (!bundle) {
                return res.status(404).json({ success: false, message: 'Bundle not found' });
            }

            res.json({ success: true, data: { bundle } });
        } catch (error) {
            console.error('Get bundle error:', error);
            res.status(500).json({ success: false, message: 'Failed to fetch bundle' });
        }
    }
);

/**
 * POST /api/admin/bundles
 */
router.post(
    '/',
    checkPermission('menu:write'),
    [
        body('name').trim().notEmpty(),
        body('price').isNumeric(),
        body('items').isArray({ min: 1 }),
        body('items.*.menuItemId').isUUID(),
        body('items.*.quantity').optional().isInt({ min: 1 }),
        validate,
    ],
    async (req, res) => {
        try {
            const bundle = await bundleService.createBundle(req.locationId, req.body);
            res.status(201).json({ success: true, message: 'Bundle created', data: { bundle } });
        } catch (error) {
            console.error('Create bundle error:', error);
            res.status(500).json({ success: false, message: error.message || 'Failed to create bundle' });
        }
    }
);

/**
 * PUT /api/admin/bundles/:id
 */
router.put(
    '/:id',
    checkPermission('menu:write'),
    [param('id').isUUID(), validate],
    async (req, res) => {
        try {
            const bundle = await bundleService.updateBundle(
                req.params.id, req.locationId, req.body
            );
            res.json({ success: true, message: 'Bundle updated', data: { bundle } });
        } catch (error) {
            console.error('Update bundle error:', error);
            if (error.message === 'Bundle not found') {
                return res.status(404).json({ success: false, message: error.message });
            }
            res.status(500).json({ success: false, message: error.message || 'Failed to update bundle' });
        }
    }
);

/**
 * PATCH /api/admin/bundles/:id/toggle
 */
router.patch(
    '/:id/toggle',
    checkPermission('menu:write'),
    [param('id').isUUID(), validate],
    async (req, res) => {
        try {
            const bundle = await bundleService.toggleBundleAvailability(
                req.params.id, req.locationId
            );
            res.json({ success: true, message: 'Bundle availability toggled', data: { bundle } });
        } catch (error) {
            console.error('Toggle bundle error:', error);
            res.status(500).json({ success: false, message: error.message || 'Failed to toggle bundle' });
        }
    }
);

/**
 * DELETE /api/admin/bundles/:id
 */
router.delete(
    '/:id',
    checkPermission('menu:write'),
    [param('id').isUUID(), validate],
    async (req, res) => {
        try {
            await bundleService.deleteBundle(req.params.id, req.locationId);
            res.json({ success: true, message: 'Bundle deleted' });
        } catch (error) {
            console.error('Delete bundle error:', error);
            res.status(500).json({ success: false, message: 'Failed to delete bundle' });
        }
    }
);

export default router;

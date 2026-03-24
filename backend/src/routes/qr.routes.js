import express from 'express';
import { param } from 'express-validator';
import { validate } from '../middleware/validation.js';
import { verifyToken } from '../middleware/auth.js';
import { tenantScope } from '../middleware/tenantScope.js';
import { checkPermission } from '../middleware/rbac.js';
import * as qrService from '../services/qrToken.service.js';

const router = express.Router();

/**
 * GET /api/qr/scan/:tableId
 * Dynamic redirector — generates a new token and redirects to frontend
 */
router.get(
    '/scan/:tableId',
    [param('tableId').isUUID(), validate],
    async (req, res) => {
        try {
            const { tableId } = req.params;
            const baseUrl = process.env.FRONTEND_URL || 'http://localhost:3000';

            console.log(`[QR Scan] Table scan detected: ${tableId}`);

            const tokenData = await qrService.createQRToken(tableId);

            // Notify admin dashboards
            const io = req.app.get('io');
            if (io && tokenData.locationId) {
                io.to(`restaurant:${tokenData.locationId}`).emit('table:updated', { tableId });
            }

            // Redirect to the tenant-specific SaaS URL
            const slug = tokenData.tenantSlug || 'demo';
            const redirectUrl = `${baseUrl}/${slug}/qr?token=${tokenData.token}`;
            console.log(`[QR Scan] Redirecting to: ${redirectUrl}`);
            res.redirect(redirectUrl);
        } catch (error) {
            console.error('QR Scan error:', error);
            const baseUrl = process.env.FRONTEND_URL || 'http://localhost:3000';
            res.redirect(`${baseUrl}?error=table_not_found`);
        }
    }
);

/**
 * GET /api/qr/validate/:token
 * Validate a QR token and get table/location info
 */
router.get(
    '/validate/:token',
    [param('token').isString().notEmpty(), validate],
    async (req, res) => {
        try {
            const tableInfo = await qrService.validateQRToken(req.params.token);

            if (!tableInfo) {
                return res.status(400).json({
                    success: false,
                    message: 'Invalid or expired QR code.',
                    messageAr: 'رمز QR غير صالح أو منتهي الصلاحية.',
                    messageFr: 'Code QR invalide ou expiré.',
                    code: 'INVALID_QR',
                });
            }

            res.json({ success: true, data: tableInfo });
        } catch (error) {
            console.error('Validate QR error:', error);
            res.status(500).json({ success: false, message: 'Failed to validate QR code' });
        }
    }
);

/**
 * POST /api/qr/generate/:tableId
 * Generate new QR code for a table (admin only)
 */
router.post(
    '/generate/:tableId',
    verifyToken,
    tenantScope,
    checkPermission('qr:manage'),
    [param('tableId').isUUID(), validate],
    async (req, res) => {
        try {
            const { tableId } = req.params;
            const baseUrl = process.env.FRONTEND_URL || 'http://localhost:3000';

            const qrData = await qrService.generateQRCodeImage(tableId, baseUrl);

            res.json({ success: true, message: 'QR code generated', data: qrData });
        } catch (error) {
            console.error('Generate QR error:', error);
            if (error.message === 'Table not found') {
                return res.status(404).json({ success: false, message: 'Table not found' });
            }
            res.status(500).json({ success: false, message: 'Failed to generate QR code' });
        }
    }
);

/**
 * POST /api/qr/refresh-all
 * Refresh all QR codes for the current location (admin only)
 */
router.post(
    '/refresh-all',
    verifyToken,
    tenantScope,
    checkPermission('qr:manage'),
    async (req, res) => {
        try {
            const locationId = req.locationId;
            if (!locationId) {
                return res.status(400).json({ success: false, message: 'Location ID required' });
            }

            const tokens = await qrService.refreshAllTokens(locationId);

            const io = req.app.get('io');
            io.to(`restaurant:${locationId}`).emit('qr:refreshed', {
                message: 'All QR codes have been refreshed',
                count: tokens.length,
            });

            res.json({
                success: true,
                message: `${tokens.length} QR codes refreshed`,
                data: { count: tokens.length },
            });
        } catch (error) {
            console.error('Refresh all QR error:', error);
            res.status(500).json({ success: false, message: 'Failed to refresh QR codes' });
        }
    }
);

/**
 * POST /api/qr/cleanup
 * Cleanup expired tokens (cron job)
 */
router.post('/cleanup', async (req, res) => {
    try {
        const apiKey = req.headers['x-api-key'];
        if (apiKey !== process.env.CRON_API_KEY && process.env.NODE_ENV === 'production') {
            return res.status(401).json({ success: false, message: 'Unauthorized' });
        }

        const count = await qrService.cleanupExpiredTokens();
        res.json({ success: true, message: `${count} expired tokens cleaned up`, data: { count } });
    } catch (error) {
        console.error('Cleanup tokens error:', error);
        res.status(500).json({ success: false, message: 'Failed to cleanup tokens' });
    }
});

export default router;

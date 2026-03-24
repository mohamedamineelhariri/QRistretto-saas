import { Router } from 'express';
import { tenantScope } from '../middleware/tenantScope.js';
import { verifyToken } from '../middleware/auth.js';
import { checkPermission, checkFeature } from '../middleware/rbac.js';
import { sessionPool } from '../whatsapp/sessionPool.js';

const router = Router();

// All WhatsApp routes require auth, tenant scope, and the whatsapp_bot feature
router.use(verifyToken);
router.use(tenantScope);
router.use(checkFeature('whatsapp_bot'));

/**
 * GET /api/whatsapp/status
 * Get the current connection status of the WhatsApp session
 */
router.get('/status', checkPermission('location:manage'), async (req, res) => {
    try {
        const dbSession = await req.prisma.whatsAppSession.findFirst({
            where: { isActive: true }
        });
        
        if (!dbSession) {
            return res.json({ success: true, status: 'unconfigured' });
        }
        
        const activePoolSession = sessionPool.sessions.get(req.tenantId);
        
        if (activePoolSession) {
             return res.json({ 
                 success: true, 
                 status: activePoolSession.status,
                 phoneNumber: dbSession.phoneNumber,
                 qr: activePoolSession.qr || null
             });
        }
        
        return res.json({ success: true, status: 'disconnected', phoneNumber: dbSession.phoneNumber });
    } catch (error) {
        console.error('Fetch whatsapp status error:', error);
        res.status(500).json({ success: false, message: 'Server error check status' });
    }
});

/**
 * POST /api/whatsapp/connect
 * Initiates the whatsapp session and returns the QR code representing pairing
 */
router.post('/connect', checkPermission('location:manage'), async (req, res) => {
    try {
        const { phoneNumber } = req.body;
        
        // Ensure a DB record exists
        let dbSession = await req.prisma.whatsAppSession.findFirst({
            where: { isActive: true }
        });
        
        if (!dbSession) {
            if (!phoneNumber) {
                return res.status(400).json({ success: false, message: 'Phone number is required for initial setup' });
            }
            dbSession = await req.prisma.whatsAppSession.create({
                data: { phoneNumber, authState: {} }
            });
        }
        
        // Attempt to start session
        const session = await sessionPool.getSession(req.tenantId);
        
        if (!session) {
            return res.status(500).json({ success: false, message: 'Failed to initialize WhatsApp Engine' });
        }
        
        return res.json({ 
            success: true, 
            status: session.status,
            qr: session.qr || null 
        });
        
    } catch (error) {
        console.error('Connect WhatsApp error:', error);
        res.status(500).json({ success: false, message: 'Server error on connection' });
    }
});

/**
 * POST /api/whatsapp/disconnect
 * Disconnects the session immediately
 */
router.post('/disconnect', checkPermission('location:manage'), async (req, res) => {
    try {
        await sessionPool.closeSession(req.tenantId);
        
        await req.prisma.whatsAppSession.updateMany({
            where: { isActive: true },
            data: { isActive: false }
        });
        
        res.json({ success: true, message: 'WhatsApp session disconnected' });
    } catch (error) {
         console.error('Disconnect WhatsApp error:', error);
         res.status(500).json({ success: false, message: 'Server error disconnecting session' });
    }
});

export default router;

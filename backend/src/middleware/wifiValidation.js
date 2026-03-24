import prisma from '../config/database.js';

/**
 * WiFi Validation Middleware
 * Validates that the customer is on the restaurant's WiFi network.
 * Updated for multi-tenant: uses locationId instead of restaurantId.
 * 
 * WiFi validation can be enabled/disabled per-location via settings.
 */
export const validateWifi = async (req, res, next) => {
    try {
        // Get client IP address
        const clientIp = req.headers['x-forwarded-for']?.split(',')[0]?.trim() ||
                         req.connection?.remoteAddress ||
                         req.socket?.remoteAddress ||
                         '127.0.0.1';

        // Normalize IPv6 localhost to IPv4
        const normalizedIp = clientIp === '::1' ? '127.0.0.1' : clientIp;

        // Store for downstream use
        req.clientIp = normalizedIp;

        // If in development and connecting from localhost, skip validation
        if (process.env.NODE_ENV === 'development' && 
            (normalizedIp === '127.0.0.1' || normalizedIp === '::1' || normalizedIp.startsWith('192.168.'))) {
            return next();
        }

        // Determine the locationId from various sources
        const { tableId } = req.params;
        const token = req.body?.token || req.query?.token;
        let locationId = req.locationId || null;

        // Priority 1: Direct locationId from auth
        // Priority 2: From table lookup
        if (!locationId && tableId) {
            const table = await prisma.table.findUnique({
                where: { id: tableId },
                select: { locationId: true },
            });
            if (table) locationId = table.locationId;
        }

        // Priority 3: From QR token lookup
        if (!locationId && token) {
            const qrToken = await prisma.qRToken.findFirst({
                where: { token },
                include: { table: { select: { locationId: true } } },
            });
            if (qrToken) locationId = qrToken.table.locationId;
        }

        if (!locationId) {
            // Cannot determine location — skip WiFi check but log warning
            console.warn('[WiFi] Cannot determine location for WiFi validation');
            return next();
        }

        // Get location settings
        const location = await prisma.location.findUnique({
            where: { id: locationId },
            select: {
                settings: true,
                wifiNetworks: true,
            },
        });

        if (!location) {
            return next();
        }

        // Check if WiFi validation is enabled
        const settings = location.settings || {};
        if (!settings.wifiValidationEnabled) {
            // WiFi validation disabled — allow all
            req.locationId = locationId;
            return next();
        }

        // Get configured WiFi networks for this location
        const networks = location.wifiNetworks;
        if (!networks || networks.length === 0) {
            // No networks configured — skip validation
            req.locationId = locationId;
            return next();
        }

        // Check if client IP is in any of the configured networks
        const isOnWifi = networks.some(network => isIpInRange(normalizedIp, network.ipRange));

        if (!isOnWifi) {
            return res.status(403).json({
                success: false,
                message: 'Please connect to the restaurant WiFi to place an order.',
                messageAr: 'يرجى الاتصال بشبكة WiFi الخاصة بالمطعم لتقديم طلب.',
                messageFr: 'Veuillez vous connecter au WiFi du restaurant pour passer commande.',
                code: 'WIFI_REQUIRED',
                clientIp: normalizedIp,
                locationId,
            });
        }

        req.locationId = locationId;
        next();
    } catch (error) {
        console.error('[WiFi Validation Error]:', error);
        // Fail open — don't block orders if WiFi check fails
        next();
    }
};

/**
 * Check if an IP address is within a CIDR range
 */
function isIpInRange(ip, cidr) {
    try {
        const [range, bits] = cidr.split('/');
        const mask = ~(Math.pow(2, 32 - parseInt(bits)) - 1);

        const ipNum = ipToNumber(ip);
        const rangeNum = ipToNumber(range);

        return (ipNum & mask) === (rangeNum & mask);
    } catch (e) {
        return false;
    }
}

/**
 * Convert IP address to number
 */
function ipToNumber(ip) {
    return ip.split('.')
        .reduce((acc, octet) => (acc << 8) + parseInt(octet), 0) >>> 0;
}

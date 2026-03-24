import { v4 as uuidv4 } from 'uuid';
import QRCode from 'qrcode';
import prisma from '../config/database.js';

/**
 * Generate a new secure random token
 */
function generateSecureToken() {
    return `${uuidv4()}-${Date.now().toString(36)}`;
}

/**
 * Get token expiry time based on config
 */
function getExpiryTime() {
    const minutes = parseInt(process.env.QR_TOKEN_EXPIRY_MINUTES) || 15;
    return new Date(Date.now() + minutes * 60 * 1000);
}

/**
 * Create or refresh a QR token for a table
 */
export async function createQRToken(tableId) {
    const table = await prisma.table.findUnique({
        where: { id: tableId },
        include: {
            location: {
                select: { 
                    id: true, 
                    name: true, 
                    nameFr: true, 
                    nameAr: true,
                    tenant: { select: { slug: true } }
                },
            },
        },
    });

    if (!table) {
        throw new Error('Table not found');
    }

    const token = generateSecureToken();
    const expiresAt = getExpiryTime();

    const qrToken = await prisma.qRToken.create({
        data: { tableId, token, expiresAt },
    });

    return {
        token: qrToken.token,
        expiresAt: qrToken.expiresAt,
        tableId,
        tableNumber: table.tableNumber,
        locationId: table.location.id,
        locationName: table.location.name,
        tenantSlug: table.location.tenant.slug,
    };
}

/**
 * Validate a QR token
 * Returns table info if valid, null if invalid/expired
 */
export async function validateQRToken(token) {
    const now = new Date();

    const qrToken = await prisma.qRToken.findFirst({
        where: { token },
        include: {
            table: {
                include: {
                    location: {
                        select: {
                            id: true,
                            name: true,
                            nameFr: true,
                            nameAr: true,
                            tenant: {
                                select: {
                                    id: true,
                                    slug: true,
                                    businessName: true,
                                    businessNameFr: true,
                                    businessNameAr: true,

                                },
                            },
                        },
                    },
                },
            },
        },
    });

    if (!qrToken) return null;

    const isExpired = new Date(qrToken.expiresAt) <= now;
    if (isExpired) return null;

    if (!qrToken.table.isActive) return null;

    return {
        tableId: qrToken.table.id,
        tableNumber: qrToken.table.tableNumber,
        tableName: qrToken.table.tableName,
        locationId: qrToken.table.location.id,
        location: qrToken.table.location,
        tenant: qrToken.table.location.tenant,
        expiresAt: qrToken.expiresAt,
    };
}

/**
 * Generate QR code image as data URL
 */
export async function generateQRCodeImage(tableId, baseUrl) {
    const tokenData = await createQRToken(tableId);

    const apiBaseUrl = process.env.API_URL || 'http://localhost:5000';
    const qrUrl = `${apiBaseUrl}/api/qr/scan/${tableId}`;
    
    // NOTE: The direct QR logic to frontend might also be needed here if the frontend scans directly,
    // but the `qrUrl` here is actually pointing to the BACKEND `/api/qr/scan` endpoint which redirects.
    // The backend redirect itself needs the tenantSlug.

    const qrDataUrl = await QRCode.toDataURL(qrUrl, {
        width: 400,
        margin: 2,
        color: {
            dark: '#1C1917',
            light: '#FFFFFF',
        },
        errorCorrectionLevel: 'H',
    });

    return {
        qrDataUrl,
        qrUrl,
        token: tokenData.token,
        expiresAt: tokenData.expiresAt,
        tableNumber: tokenData.tableNumber,
    };
}

/**
 * Cleanup expired tokens
 */
export async function cleanupExpiredTokens() {
    const result = await prisma.qRToken.deleteMany({
        where: { expiresAt: { lt: new Date() } },
    });
    return result.count;
}

/**
 * Refresh all tokens for a location (was: restaurant)
 */
export async function refreshAllTokens(locationId) {
    const tables = await prisma.table.findMany({
        where: { locationId, isActive: true },
    });

    await prisma.qRToken.deleteMany({
        where: { tableId: { in: tables.map(t => t.id) } },
    });

    const newTokens = await Promise.all(
        tables.map(table => createQRToken(table.id))
    );

    return newTokens;
}

import jwt from 'jsonwebtoken';
import prisma from '../config/database.js';

/**
 * Verify JWT token for authenticated routes.
 * Supports both admin (User) tokens and legacy staff tokens.
 * Sets: req.userId, req.tenantId, req.userRole, req.userPermissions, req.locationId
 */
export const verifyToken = async (req, res, next) => {
    try {
        // Get token from Authorization header or cookie
        const authHeader = req.headers.authorization;
        let token = null;

        if (authHeader && authHeader.startsWith('Bearer ')) {
            token = authHeader.substring(7);
        } else if (req.cookies && req.cookies.token) {
            token = req.cookies.token;
        }

        if (!token) {
            return res.status(401).json({
                success: false,
                message: 'Access denied. No token provided.',
            });
        }

        // Verify token
        const decoded = jwt.verify(token, process.env.JWT_SECRET);

        // Token contains: { userId, tenantId, role, locationId? }
        const user = await prisma.user.findUnique({
            where: { id: decoded.userId },
            select: {
                id: true,
                tenantId: true,
                email: true,
                name: true,
                role: true,
                isActive: true,
                permissions: {
                    select: { permission: true },
                },
                tenant: {
                    select: {
                        id: true,
                        status: true,
                        businessName: true,
                    },
                },
            },
        });

        if (!user || !user.isActive) {
            return res.status(401).json({
                success: false,
                message: 'User not found or inactive.',
            });
        }

        if (!user.tenant || user.tenant.status !== 'ACTIVE') {
            return res.status(401).json({
                success: false,
                message: 'Tenant not active. Contact support.',
            });
        }

        // Attach auth context to request
        req.userId = user.id;
        req.tenantId = user.tenantId;
        req.userRole = user.role;
        req.userEmail = user.email;
        req.userName = user.name;
        req.userPermissions = user.permissions.map(p => p.permission);
        req.tenant = user.tenant;

        // Location context — from token or header
        req.locationId = decoded.locationId || req.headers['x-location-id'] || null;

        next();
    } catch (error) {
        if (error.name === 'TokenExpiredError') {
            return res.status(401).json({
                success: false,
                message: 'Token expired. Please login again.',
            });
        }

        if (error.name === 'JsonWebTokenError') {
            return res.status(401).json({
                success: false,
                message: 'Invalid token.',
            });
        }

        console.error('Auth middleware error:', error);
        return res.status(500).json({
            success: false,
            message: 'Authentication error.',
        });
    }
};

/**
 * Verify Super Admin token (separate auth domain)
 */
export const verifySuperAdmin = async (req, res, next) => {
    try {
        const authHeader = req.headers.authorization;
        let token = null;

        if (authHeader && authHeader.startsWith('Bearer ')) {
            token = authHeader.substring(7);
        }

        if (!token) {
            return res.status(401).json({
                success: false,
                message: 'Access denied. Super Admin token required.',
            });
        }

        const decoded = jwt.verify(token, process.env.JWT_SECRET);

        if (decoded.type !== 'super_admin') {
            return res.status(403).json({
                success: false,
                message: 'Super Admin access required.',
            });
        }

        const admin = await prisma.superAdmin.findUnique({
            where: { id: decoded.adminId },
            select: { id: true, email: true, name: true, isActive: true },
        });

        if (!admin || !admin.isActive) {
            return res.status(401).json({
                success: false,
                message: 'Super Admin not found or inactive.',
            });
        }

        req.superAdmin = admin;
        next();
    } catch (error) {
        if (error.name === 'TokenExpiredError' || error.name === 'JsonWebTokenError') {
            return res.status(401).json({
                success: false,
                message: 'Invalid or expired token.',
            });
        }

        console.error('Super Admin auth error:', error);
        return res.status(500).json({
            success: false,
            message: 'Authentication error.',
        });
    }
};

/**
 * Optional auth — attaches user info if token present, doesn't require it
 */
export const optionalAuth = async (req, res, next) => {
    try {
        const authHeader = req.headers.authorization;

        if (authHeader && authHeader.startsWith('Bearer ')) {
            const token = authHeader.substring(7);
            const decoded = jwt.verify(token, process.env.JWT_SECRET);
            req.userId = decoded.userId;
            req.tenantId = decoded.tenantId;
            req.userRole = decoded.role;
            req.locationId = decoded.locationId || null;
        }
    } catch (error) {
        // Token invalid or missing — acceptable for optional auth
    }

    next();
};

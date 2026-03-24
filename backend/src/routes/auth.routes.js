import express from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { body } from 'express-validator';
import prisma from '../config/database.js';
import { validate } from '../middleware/validation.js';

const router = express.Router();

/**
 * POST /api/auth/login
 * Unified login for all users (Owner, Manager, Waiter, Kitchen, Staff)
 */
router.post(
    '/login',
    [
        body('email').isEmail().normalizeEmail().withMessage('Valid email required'),
        body('password').isLength({ min: 6 }).withMessage('Password must be at least 6 characters'),
        validate,
    ],
    async (req, res) => {
        try {
            const { email, password } = req.body;

            const user = await prisma.user.findUnique({
                where: { email },
                include: {
                    tenant: {
                        select: {
                            id: true,
                            businessName: true,
                            status: true,
                            slug: true,
                        },
                    },
                    permissions: { select: { permission: true } },
                },
            });

            if (!user || !user.isActive) {
                return res.status(401).json({
                    success: false,
                    message: 'Invalid credentials',
                });
            }

            if (!user.tenant || user.tenant.status !== 'ACTIVE') {
                return res.status(401).json({
                    success: false,
                    message: 'Account pending approval or suspended.',
                });
            }

            const isValidPassword = await bcrypt.compare(password, user.passwordHash);
            if (!isValidPassword) {
                return res.status(401).json({
                    success: false,
                    message: 'Invalid credentials',
                });
            }

            // Update last login
            await prisma.user.update({
                where: { id: user.id },
                data: { lastLoginAt: new Date() },
            });

            // Get user's default location (first active location)
            const defaultLocation = await prisma.location.findFirst({
                where: { tenantId: user.tenantId, isActive: true },
                select: { id: true, name: true },
            });

            const token = jwt.sign(
                {
                    userId: user.id,
                    tenantId: user.tenantId,
                    role: user.role,
                    locationId: defaultLocation?.id || null,
                },
                process.env.JWT_SECRET,
                { expiresIn: user.role === 'OWNER' ? '7d' : '12h' }
            );

            res.cookie('token', token, {
                httpOnly: true,
                secure: process.env.NODE_ENV === 'production',
                sameSite: 'strict',
                maxAge: user.role === 'OWNER' ? 7 * 24 * 60 * 60 * 1000 : 12 * 60 * 60 * 1000,
            });

            res.json({
                success: true,
                message: 'Login successful',
                data: {
                    token,
                    user: {
                        id: user.id,
                        name: user.name,
                        email: user.email,
                        role: user.role,
                        tenantId: user.tenantId,
                        permissions: user.permissions.map(p => p.permission),
                    },
                    tenant: user.tenant,
                    location: defaultLocation,
                },
            });
        } catch (error) {
            console.error('Login error:', error);
            res.status(500).json({ success: false, message: 'Login failed' });
        }
    }
);

/**
 * POST /api/auth/staff-login
 * Quick PIN-based login for staff (Waiter, Kitchen)
 */
router.post(
    '/staff-login',
    [
        body('userId').isUUID().withMessage('Valid user ID required'),
        body('pin').isLength({ min: 4, max: 6 }).isNumeric().withMessage('PIN must be 4-6 digits'),
        body('locationId').isUUID().withMessage('Location ID required'),
        validate,
    ],
    async (req, res) => {
        try {
            const { userId, pin, locationId } = req.body;

            const user = await prisma.user.findUnique({
                where: { id: userId },
                include: {
                    tenant: {
                        select: { id: true, businessName: true, status: true },
                    },
                },
            });

            if (!user || !user.isActive || !user.pin) {
                return res.status(401).json({
                    success: false,
                    message: 'Invalid credentials',
                });
            }

            if (!user.tenant || user.tenant.status !== 'ACTIVE') {
                return res.status(401).json({
                    success: false,
                    message: 'Account not active.',
                });
            }

            // Verify PIN
            const isValidPin = await bcrypt.compare(pin, user.pin);
            if (!isValidPin) {
                return res.status(401).json({
                    success: false,
                    message: 'Invalid credentials',
                });
            }

            // Verify location belongs to tenant
            const location = await prisma.location.findFirst({
                where: { id: locationId, tenantId: user.tenantId, isActive: true },
                select: { id: true, name: true },
            });

            if (!location) {
                return res.status(401).json({
                    success: false,
                    message: 'Invalid location.',
                });
            }

            // Update last login
            await prisma.user.update({
                where: { id: user.id },
                data: { lastLoginAt: new Date() },
            });

            const token = jwt.sign(
                {
                    userId: user.id,
                    tenantId: user.tenantId,
                    role: user.role,
                    locationId: location.id,
                },
                process.env.JWT_SECRET,
                { expiresIn: '12h' }
            );

            res.json({
                success: true,
                message: 'Staff login successful',
                data: {
                    token,
                    user: {
                        id: user.id,
                        name: user.name,
                        role: user.role,
                        tenantId: user.tenantId,
                    },
                    tenant: user.tenant,
                    location,
                },
            });
        } catch (error) {
            console.error('Staff login error:', error);
            res.status(500).json({ success: false, message: 'Server error' });
        }
    }
);

/**
 * GET /api/auth/staff
 * Get list of active staff for PIN login screen
 * Requires locationId query parameter
 */
router.get('/staff', async (req, res) => {
    try {
        const { locationId } = req.query;

        if (!locationId) {
            return res.status(400).json({
                success: false,
                message: 'locationId query parameter required',
            });
        }

        // Get the tenant from the location
        const location = await prisma.location.findUnique({
            where: { id: locationId },
            select: { tenantId: true, isActive: true },
        });

        if (!location || !location.isActive) {
            return res.status(404).json({
                success: false,
                message: 'Location not found',
            });
        }

        const staff = await prisma.user.findMany({
            where: {
                tenantId: location.tenantId,
                isActive: true,
                pin: { not: null }, // Only staff with PIN set
                role: { in: ['WAITER', 'KITCHEN', 'MANAGER', 'STAFF'] },
            },
            select: {
                id: true,
                name: true,
                role: true,
            },
            orderBy: { name: 'asc' },
        });

        res.json({
            success: true,
            data: { staff },
        });
    } catch (error) {
        console.error('Fetch staff error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch staff list',
        });
    }
});

/**
 * POST /api/auth/logout
 */
router.post('/logout', (req, res) => {
    res.clearCookie('token');
    res.json({ success: true, message: 'Logged out successfully' });
});

export default router;

import express from 'express';
import bcrypt from 'bcryptjs';

import jwt from 'jsonwebtoken';
import { body } from 'express-validator';

import prisma from '../config/database.js';
import { validate } from '../middleware/validation.js';

const router = express.Router();

/**
 * POST /api/signup
 * Register a new tenant (business owner signup)
 * Creates: Tenant (PENDING_APPROVAL) + User (OWNER) + Subscription (TRIAL)
 */
router.post(
    '/',
    [
        body('businessName').trim().isLength({ min: 2, max: 100 }).withMessage('Business name required (2-100 chars)'),
        body('businessNameFr').optional().trim().isLength({ max: 100 }),
        body('businessNameAr').optional().trim().isLength({ max: 100 }),
        body('ownerName').trim().isLength({ min: 2, max: 50 }).withMessage('Owner name required'),
        body('email').isEmail().normalizeEmail().withMessage('Valid email required'),
        body('password').isLength({ min: 8 }).withMessage('Password must be at least 8 characters'),
        body('phoneNumber').optional().trim().isLength({ min: 5, max: 20 }),
        body('city').optional().trim().isLength({ max: 50 }),
        body('planName').isIn(['STARTER', 'PRO', 'ENTERPRISE']).withMessage('Valid plan required'),
        validate,
    ],
    async (req, res) => {
        try {
            const {
                businessName, businessNameFr, businessNameAr,
                ownerName, email, password,
                phoneNumber, city, planName
            } = req.body;

            // Check if email already exists
            const existingUser = await prisma.user.findUnique({
                where: { email },
            });

            if (existingUser) {
                return res.status(400).json({
                    success: false,
                    message: 'Email already registered',
                });
            }

            // Find the selected plan
            const plan = await prisma.plan.findUnique({
                where: { name: planName },
            });

            if (!plan || !plan.isActive) {
                return res.status(400).json({
                    success: false,
                    message: 'Selected plan is not available',
                });
            }

            // Generate slug from business name
            const slug = businessName
                .toLowerCase()
                .replace(/[^a-z0-9]+/g, '-')
                .replace(/^-|-$/g, '')
                + '-' + Date.now().toString(36);

            // Hash password
            const passwordHash = await bcrypt.hash(password, 12);

            // Create everything in a transaction
            const result = await prisma.$transaction(async (tx) => {
                // 1. Create Tenant
                const tenant = await tx.tenant.create({
                    data: {
                        slug,
                        businessName,
                        businessNameFr,
                        businessNameAr,
                        phoneNumber,
                        city,
                        status: 'PENDING_APPROVAL',
                    },
                });

                // 2. Create Owner User
                const user = await tx.user.create({
                    data: {
                        tenantId: tenant.id,
                        email,
                        passwordHash,
                        name: ownerName,
                        role: 'OWNER',
                    },
                });

                // 3. Create Subscription (Trial)
                const now = new Date();
                const trialEnd = new Date(now.getTime() + 14 * 24 * 60 * 60 * 1000); // 14-day trial

                const subscription = await tx.subscription.create({
                    data: {
                        tenantId: tenant.id,
                        planId: plan.id,
                        status: 'TRIAL',
                        currentPeriodStart: now,
                        currentPeriodEnd: trialEnd,
                        trialEndsAt: trialEnd,
                    },
                });

                // 4. Create default Location
                const location = await tx.location.create({
                    data: {
                        tenantId: tenant.id,
                        name: businessName,
                        nameFr: businessNameFr,
                        nameAr: businessNameAr,
                    },
                });

                return { tenant, user, subscription, location };
            });

            res.status(201).json({
                success: true,
                message: 'Registration submitted. Your account is pending approval.',
                data: {
                    tenant: {
                        id: result.tenant.id,
                        slug: result.tenant.slug,
                        businessName: result.tenant.businessName,
                        status: result.tenant.status,
                    },
                    user: {
                        id: result.user.id,
                        name: result.user.name,
                        email: result.user.email,
                        role: result.user.role,
                    },
                    plan: {
                        name: plan.name,
                        displayName: plan.displayName,
                    },
                    token: jwt.sign(
                        {
                            userId: result.user.id,
                            tenantId: result.tenant.id,
                            role: result.user.role,
                            locationId: result.location.id,
                        },
                        process.env.JWT_SECRET,
                        { expiresIn: '7d' }
                    ),
                    locationId: result.location.id,
                },
            });

        } catch (error) {
            console.error('Signup error:', error);
            res.status(500).json({
                success: false,
                message: 'Registration failed. Please try again.',
            });
        }
    }
);

/**
 * GET /api/signup/plans
 * Get available subscription plans (public)
 */
router.get('/plans', async (req, res) => {
    try {
        const plans = await prisma.plan.findMany({
            where: { isActive: true },
            select: {
                id: true,
                name: true,
                displayName: true,
                displayNameFr: true,
                displayNameAr: true,
                priceMAD: true,
                maxOrdersPerDay: true,
                maxStaff: true,
                maxLocations: true,
                features: true,
                sortOrder: true,
            },
            orderBy: { sortOrder: 'asc' },
        });

        res.json({
            success: true,
            data: { plans },
        });
    } catch (error) {
        console.error('Fetch plans error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch plans',
        });
    }
});

export default router;

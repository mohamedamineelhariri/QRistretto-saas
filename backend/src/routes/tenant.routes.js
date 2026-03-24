import express from 'express';
import { param } from 'express-validator';
import { validate } from '../middleware/validation.js';
import prisma from '../config/database.js';

const router = express.Router();

/**
 * GET /api/tenant/resolve/:slug
 * Public endpoint to resolve a tenant slug into IDs for the frontend
 */
router.get(
    '/resolve/:slug',
    [param('slug').isString().notEmpty().trim(), validate],
    async (req, res) => {
        try {
            const { slug } = req.params;

            // Find the tenant and their primary active location
            const tenant = await prisma.tenant.findUnique({
                where: { slug },
                include: {
                    locations: {
                        where: { isActive: true },
                        take: 1, // Currently assuming 1 location per tenant for SaaS V1
                        select: { id: true, name: true, nameFr: true, nameAr: true },
                    },
                },
            });

            if (!tenant || tenant.status !== 'ACTIVE') {
                return res.status(404).json({
                    success: false,
                    message: 'Restaurant not found or inactive',
                });
            }

            if (tenant.locations.length === 0) {
                return res.status(404).json({
                    success: false,
                    message: 'Restaurant has no active locations',
                });
            }

            const primaryLocation = tenant.locations[0];

            // Only return safe, necessary public info
            res.json({
                success: true,
                data: {
                    tenantId: tenant.id,
                    slug: tenant.slug,
                    businessName: tenant.businessName,
                    businessNameFr: tenant.businessNameFr,
                    businessNameAr: tenant.businessNameAr,
                    locationId: primaryLocation.id,
                    locationName: primaryLocation.name,
                },
            });
        } catch (error) {
            console.error('Tenant resolve error:', error);
            res.status(500).json({ success: false, message: 'Failed to resolve tenant' });
        }
    }
);

export default router;

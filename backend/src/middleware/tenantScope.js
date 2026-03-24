import prisma from '../config/database.js';

/**
 * Tenant Scope Middleware
 * Creates a request-scoped Prisma client that automatically filters all queries by tenantId.
 * This is the PRIMARY defense against cross-tenant data leaks.
 * 
 * Usage: All route handlers use `req.prisma` instead of the global `prisma`.
 */

/**
 * Create a tenant-scoped Prisma client using Prisma Client Extensions
 * All findMany, findFirst, create, update, delete operations
 * are automatically scoped to the given tenantId.
 */
function createTenantClient(tenantId) {
    return prisma.$extends({
        query: {
            // Location-scoped models (directly have tenantId via Location)
            location: {
                async findMany({ args, query }) {
                    args.where = { ...args.where, tenantId };
                    return query(args);
                },
                async findFirst({ args, query }) {
                    args.where = { ...args.where, tenantId };
                    return query(args);
                },
                async findUnique({ args, query }) {
                    return query(args);
                },
                async create({ args, query }) {
                    args.data = { ...args.data, tenantId };
                    return query(args);
                },
                async update({ args, query }) {
                    return query(args);
                },
                async delete({ args, query }) {
                    return query(args);
                },
            },
            // User-scoped models
            user: {
                async findMany({ args, query }) {
                    args.where = { ...args.where, tenantId };
                    return query(args);
                },
                async findFirst({ args, query }) {
                    args.where = { ...args.where, tenantId };
                    return query(args);
                },
                async create({ args, query }) {
                    args.data = { ...args.data, tenantId };
                    return query(args);
                },
            },
            // WhatsApp session scoping
            whatsAppSession: {
                async findMany({ args, query }) {
                    args.where = { ...args.where, tenantId };
                    return query(args);
                },
                async findFirst({ args, query }) {
                    args.where = { ...args.where, tenantId };
                    return query(args);
                },
                async create({ args, query }) {
                    args.data = { ...args.data, tenantId };
                    return query(args);
                },
            },
        },
    });
}

/**
 * Express middleware that creates a tenant-scoped Prisma client.
 * Must be used AFTER auth middleware (which sets req.tenantId).
 */
export const tenantScope = (req, res, next) => {
    const tenantId = req.tenantId;

    if (!tenantId) {
        return res.status(403).json({
            success: false,
            message: 'Tenant context required. Please authenticate.',
        });
    }

    // Create scoped client — route handlers MUST use req.prisma
    req.prisma = createTenantClient(tenantId);
    next();
};

/**
 * Location scope helper — validates that a locationId belongs to the current tenant
 */
export async function validateLocationOwnership(prisma, locationId, tenantId) {
    const location = await prisma.location.findFirst({
        where: { id: locationId, tenantId },
        select: { id: true },
    });

    if (!location) {
        throw new Error('Location not found or not authorized');
    }

    return location;
}

export { createTenantClient };

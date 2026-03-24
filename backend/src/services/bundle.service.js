import prisma from '../config/database.js';

/**
 * Get all bundles for a location
 */
export async function getAllBundles(locationId) {
    return prisma.bundle.findMany({
        where: { locationId },
        include: {
            items: {
                include: {
                    menuItem: {
                        select: {
                            id: true,
                            name: true,
                            nameFr: true,
                            nameAr: true,
                            price: true,
                            imageUrl: true,
                        },
                    },
                },
            },
        },
        orderBy: { createdAt: 'desc' },
    });
}

/**
 * Get single bundle
 */
export async function getBundle(id, locationId) {
    return prisma.bundle.findFirst({
        where: { id, locationId },
        include: {
            items: { include: { menuItem: true } },
        },
    });
}

/**
 * Create new bundle
 */
export async function createBundle(locationId, data) {
    const { items, ...bundleData } = data;

    // Validate that all menu items exist and belong to this location
    if (items && items.length > 0) {
        const menuItemIds = items.map(item => item.menuItemId);
        const menuItems = await prisma.menuItem.findMany({
            where: { id: { in: menuItemIds }, locationId },
        });

        if (menuItems.length !== menuItemIds.length) {
            throw new Error('Some menu items not found or do not belong to this location');
        }
    }

    return prisma.bundle.create({
        data: {
            ...bundleData,
            locationId,
            items: items ? {
                create: items.map(item => ({
                    menuItemId: item.menuItemId,
                    quantity: item.quantity || 1,
                })),
            } : undefined,
        },
        include: {
            items: { include: { menuItem: true } },
        },
    });
}

/**
 * Update bundle
 */
export async function updateBundle(id, locationId, data) {
    const bundle = await prisma.bundle.findFirst({
        where: { id, locationId },
    });

    if (!bundle) {
        throw new Error('Bundle not found');
    }

    const { items, ...bundleData } = data;

    if (items) {
        const menuItemIds = items.map(item => item.menuItemId);
        const menuItems = await prisma.menuItem.findMany({
            where: { id: { in: menuItemIds }, locationId },
        });

        if (menuItems.length !== menuItemIds.length) {
            throw new Error('Some menu items not found');
        }

        await prisma.bundleItem.deleteMany({
            where: { bundleId: id },
        });
    }

    return prisma.bundle.update({
        where: { id },
        data: {
            ...bundleData,
            items: items ? {
                create: items.map(item => ({
                    menuItemId: item.menuItemId,
                    quantity: item.quantity || 1,
                })),
            } : undefined,
        },
        include: {
            items: { include: { menuItem: true } },
        },
    });
}

/**
 * Delete bundle
 */
export async function deleteBundle(id, locationId) {
    const bundle = await prisma.bundle.findFirst({
        where: { id, locationId },
    });

    if (!bundle) {
        throw new Error('Bundle not found');
    }

    return prisma.bundle.delete({ where: { id } });
}

/**
 * Toggle bundle availability
 */
export async function toggleBundleAvailability(id, locationId) {
    const bundle = await prisma.bundle.findFirst({
        where: { id, locationId },
    });

    if (!bundle) {
        throw new Error('Bundle not found');
    }

    return prisma.bundle.update({
        where: { id },
        data: { available: !bundle.available },
    });
}

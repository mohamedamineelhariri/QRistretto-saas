import prisma from '../config/database.js';

/**
 * Get menu items for a location, grouped by category
 * (Renamed from getMenuByRestaurant → getMenuByLocation)
 */
export async function getMenuByLocation(locationId, locale = 'en') {
    const items = await prisma.menuItem.findMany({
        where: {
            locationId,
            available: true,
        },
        orderBy: [
            { category: 'asc' },
            { sortOrder: 'asc' },
            { name: 'asc' },
        ],
    });

    // Group by category
    const grouped = {};

    items.forEach(item => {
        let categoryName = item.category;
        if (locale === 'fr' && item.categoryFr) categoryName = item.categoryFr;
        if (locale === 'ar' && item.categoryAr) categoryName = item.categoryAr;

        if (!grouped[categoryName]) {
            grouped[categoryName] = {
                category: categoryName,
                categoryEn: item.category,
                categoryFr: item.categoryFr,
                categoryAr: item.categoryAr,
                items: [],
            };
        }

        let name = item.name;
        let description = item.description;

        if (locale === 'fr') {
            name = item.nameFr || item.name;
            description = item.descriptionFr || item.description;
        } else if (locale === 'ar') {
            name = item.nameAr || item.name;
            description = item.descriptionAr || item.description;
        }

        grouped[categoryName].items.push({
            id: item.id,
            name,
            nameEn: item.name,
            nameFr: item.nameFr,
            nameAr: item.nameAr,
            description,
            descriptionEn: item.description,
            descriptionFr: item.descriptionFr,
            descriptionAr: item.descriptionAr,
            price: parseFloat(item.price),
            imageUrl: item.imageUrl,
            available: item.available,
        });
    });

    return Object.values(grouped);
}

// Backward-compatible alias
export const getMenuByRestaurant = getMenuByLocation;

/**
 * Get all menu items for admin (including unavailable)
 */
export async function getAllMenuItems(locationId) {
    return prisma.menuItem.findMany({
        where: { locationId },
        include: {
            recipeItems: {
                include: { inventoryItem: true },
            },
        },
        orderBy: [
            { category: 'asc' },
            { sortOrder: 'asc' },
        ],
    });
}

/**
 * Create a new menu item
 */
export async function createMenuItem(locationId, data) {
    const { recipeItems, ...menuData } = data;

    return prisma.menuItem.create({
        data: {
            locationId,
            name: menuData.name,
            nameFr: menuData.nameFr,
            nameAr: menuData.nameAr,
            description: menuData.description,
            descriptionFr: menuData.descriptionFr,
            descriptionAr: menuData.descriptionAr,
            category: menuData.category,
            categoryFr: menuData.categoryFr,
            categoryAr: menuData.categoryAr,
            price: menuData.price,
            imageUrl: menuData.imageUrl,
            available: menuData.available ?? true,
            sortOrder: menuData.sortOrder ?? 0,
            prepTimeMinutes: menuData.prepTimeMinutes,
            calories: menuData.calories,
            recipeItems: recipeItems ? {
                create: recipeItems.map(item => ({
                    inventoryItemId: item.inventoryItemId,
                    quantity: item.quantity,
                })),
            } : undefined,
        },
        include: {
            recipeItems: { include: { inventoryItem: true } },
        },
    });
}

/**
 * Update a menu item
 */
export async function updateMenuItem(itemId, locationId, data) {
    const item = await prisma.menuItem.findFirst({
        where: { id: itemId, locationId },
    });

    if (!item) {
        throw new Error('Menu item not found');
    }

    const { recipeItems, ...menuData } = data;

    if (recipeItems !== undefined) {
        await prisma.recipeItem.deleteMany({
            where: { menuItemId: itemId },
        });
    }

    return prisma.menuItem.update({
        where: { id: itemId },
        data: {
            name: menuData.name,
            nameFr: menuData.nameFr,
            nameAr: menuData.nameAr,
            description: menuData.description,
            descriptionFr: menuData.descriptionFr,
            descriptionAr: menuData.descriptionAr,
            category: menuData.category,
            categoryFr: menuData.categoryFr,
            categoryAr: menuData.categoryAr,
            price: menuData.price,
            imageUrl: menuData.imageUrl,
            available: menuData.available,
            sortOrder: menuData.sortOrder,
            prepTimeMinutes: menuData.prepTimeMinutes,
            calories: menuData.calories,
            recipeItems: recipeItems ? {
                create: recipeItems.map(item => ({
                    inventoryItemId: item.inventoryItemId,
                    quantity: item.quantity,
                })),
            } : undefined,
        },
        include: {
            recipeItems: { include: { inventoryItem: true } },
        },
    });
}

/**
 * Toggle menu item availability
 */
export async function toggleItemAvailability(itemId, locationId) {
    const item = await prisma.menuItem.findFirst({
        where: { id: itemId, locationId },
    });

    if (!item) {
        throw new Error('Menu item not found');
    }

    return prisma.menuItem.update({
        where: { id: itemId },
        data: { available: !item.available },
    });
}

/**
 * Delete a menu item
 */
export async function deleteMenuItem(itemId, locationId) {
    const item = await prisma.menuItem.findFirst({
        where: { id: itemId, locationId },
    });

    if (!item) {
        throw new Error('Menu item not found');
    }

    return prisma.menuItem.delete({ where: { id: itemId } });
}

/**
 * Get unique categories for a location
 */
export async function getCategories(locationId) {
    return prisma.menuItem.findMany({
        where: { locationId },
        select: {
            category: true,
            categoryFr: true,
            categoryAr: true,
        },
        distinct: ['category'],
    });
}

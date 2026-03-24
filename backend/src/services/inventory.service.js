import prisma from '../config/database.js';

/**
 * Get all inventory items for a location
 */
export async function getAllInventoryItems(locationId) {
    return prisma.inventoryItem.findMany({
        where: { locationId },
        orderBy: [
            { currentStock: 'asc' },
            { name: 'asc' },
        ],
    });
}

/**
 * Get single inventory item
 */
export async function getInventoryItem(id, locationId) {
    return prisma.inventoryItem.findFirst({
        where: { id, locationId },
    });
}

/**
 * Create new inventory item
 */
export async function createInventoryItem(locationId, data) {
    return prisma.inventoryItem.create({
        data: { ...data, locationId },
    });
}

/**
 * Update inventory item
 */
export async function updateInventoryItem(id, locationId, data) {
    const item = await prisma.inventoryItem.findFirst({
        where: { id, locationId },
    });

    if (!item) {
        throw new Error('Inventory item not found');
    }

    return prisma.inventoryItem.update({
        where: { id },
        data,
    });
}

/**
 * Delete inventory item
 */
export async function deleteInventoryItem(id, locationId) {
    const item = await prisma.inventoryItem.findFirst({
        where: { id, locationId },
    });

    if (!item) {
        throw new Error('Inventory item not found');
    }

    const recipeCount = await prisma.recipeItem.count({
        where: { inventoryItemId: id },
    });

    if (recipeCount > 0) {
        throw new Error('Cannot delete inventory item used in recipes');
    }

    return prisma.inventoryItem.delete({ where: { id } });
}

/**
 * Get low stock items (below minimum threshold)
 */
export async function getLowStockItems(locationId) {
    return prisma.$queryRaw`
        SELECT * FROM inventory_items
        WHERE "locationId" = ${locationId}
        AND "currentStock" <= "minStock"
        ORDER BY ("currentStock" / NULLIF("minStock", 0)) ASC
    `;
}

/**
 * Deduct stock from inventory
 */
export async function deductStock(inventoryItemId, quantity) {
    const item = await prisma.inventoryItem.findUnique({
        where: { id: inventoryItemId },
    });

    if (!item) {
        throw new Error('Inventory item not found');
    }

    const newStock = parseFloat(item.currentStock) - parseFloat(quantity);

    if (newStock < 0) {
        throw new Error(`Insufficient stock for ${item.name}. Available: ${item.currentStock}, Required: ${quantity}`);
    }

    return prisma.inventoryItem.update({
        where: { id: inventoryItemId },
        data: { currentStock: newStock },
    });
}

/**
 * Add stock to inventory (restocking)
 */
export async function addStock(inventoryItemId, quantity, locationId) {
    const item = await prisma.inventoryItem.findFirst({
        where: { id: inventoryItemId, locationId },
    });

    if (!item) {
        throw new Error('Inventory item not found');
    }

    const newStock = parseFloat(item.currentStock) + parseFloat(quantity);

    return prisma.inventoryItem.update({
        where: { id: inventoryItemId },
        data: { currentStock: newStock },
    });
}

/**
 * Deduct stock for an entire order (atomic transaction)
 */
export async function deductStockForOrder(orderId) {
    return prisma.$transaction(async (tx) => {
        const order = await tx.order.findUnique({
            where: { id: orderId },
            include: {
                items: {
                    include: {
                        menuItem: {
                            include: {
                                recipeItems: {
                                    include: { inventoryItem: true },
                                },
                            },
                        },
                    },
                },
            },
        });

        if (!order) {
            throw new Error('Order not found');
        }

        const stockDeductions = [];

        for (const orderItem of order.items) {
            for (const recipeItem of orderItem.menuItem.recipeItems) {
                const totalQuantity = parseFloat(recipeItem.quantity) * orderItem.quantity;

                const existing = stockDeductions.find(
                    sd => sd.inventoryItemId === recipeItem.inventoryItemId
                );

                if (existing) {
                    existing.quantity += totalQuantity;
                } else {
                    stockDeductions.push({
                        inventoryItemId: recipeItem.inventoryItemId,
                        quantity: totalQuantity,
                        name: recipeItem.inventoryItem.name,
                    });
                }
            }
        }

        // Check stock availability
        const errors = [];
        for (const deduction of stockDeductions) {
            const item = await tx.inventoryItem.findUnique({
                where: { id: deduction.inventoryItemId },
            });

            if (!item) continue;

            const newStock = parseFloat(item.currentStock) - deduction.quantity;
            if (newStock < 0) {
                errors.push(
                    `Insufficient ${item.name}: needs ${deduction.quantity}${item.unit}, have ${item.currentStock}${item.unit}`
                );
            }
        }

        if (errors.length > 0) {
            throw new Error(`Stock shortage: ${errors.join('; ')}`);
        }

        // Perform atomic deductions
        const results = [];
        for (const deduction of stockDeductions) {
            const item = await tx.inventoryItem.findUnique({
                where: { id: deduction.inventoryItemId },
            });

            if (!item) continue;

            const newStock = parseFloat(item.currentStock) - deduction.quantity;
            const result = await tx.inventoryItem.update({
                where: { id: deduction.inventoryItemId },
                data: { currentStock: newStock },
            });
            results.push(result);
        }

        return results;
    });
}

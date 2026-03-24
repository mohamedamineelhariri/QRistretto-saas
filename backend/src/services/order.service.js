import prisma from '../config/database.js';

/**
 * Generate next order number for the day (atomic, race-safe)
 * Now scoped per location instead of restaurant
 */
async function getNextOrderNumber(locationId) {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    const result = await prisma.$transaction(async (tx) => {
        const count = await tx.order.count({
            where: {
                locationId,
                createdAt: {
                    gte: today,
                    lt: tomorrow,
                },
            },
        });
        return count + 1;
    }, {
        isolationLevel: 'Serializable',
    });

    return result;
}

/**
 * Create a new order
 * Security: Validates all items belong to the location
 */
export async function createOrder(locationId, tableId, items, notes = null, source = 'QR') {
    const menuItemIds = items.map(item => item.menuItemId);

    const menuItems = await prisma.menuItem.findMany({
        where: {
            id: { in: menuItemIds },
            locationId,
            available: true,
        },
    });

    if (menuItems.length !== menuItemIds.length) {
        throw new Error('Some items are not available');
    }

    let totalAmount = 0;
    const orderItems = items.map(item => {
        const menuItem = menuItems.find(m => m.id === item.menuItemId);
        const unitPrice = parseFloat(menuItem.price);
        const quantity = item.quantity || 1;
        totalAmount += unitPrice * quantity;

        return {
            menuItemId: item.menuItemId,
            quantity,
            unitPrice,
            notes: item.notes,
        };
    });

    const orderNumber = await getNextOrderNumber(locationId);

    const order = await prisma.order.create({
        data: {
            locationId,
            tableId,
            orderNumber,
            totalAmount,
            notes,
            status: 'PENDING',
            source,
            items: {
                create: orderItems,
            },
        },
        include: {
            items: {
                include: {
                    menuItem: {
                        select: { name: true, nameFr: true, nameAr: true },
                    },
                },
            },
            table: {
                select: { tableNumber: true, tableName: true },
            },
        },
    });

    return order;
}

/**
 * Get orders by status for kitchen/waiter view
 */
export async function getOrdersByStatus(locationId, statuses = ['PENDING', 'ACCEPTED', 'PREPARING', 'READY']) {
    return prisma.order.findMany({
        where: {
            locationId,
            status: { in: statuses },
        },
        include: {
            items: {
                include: {
                    menuItem: {
                        select: { name: true, nameFr: true, nameAr: true },
                    },
                },
            },
            table: {
                select: { tableNumber: true, tableName: true },
            },
        },
        orderBy: { createdAt: 'asc' },
    });
}

/**
 * Get order by ID
 */
export async function getOrderById(orderId) {
    return prisma.order.findUnique({
        where: { id: orderId },
        include: {
            items: {
                include: {
                    menuItem: {
                        select: { name: true, nameFr: true, nameAr: true },
                    },
                },
            },
            table: {
                select: { tableNumber: true, tableName: true },
            },
        },
    });
}

/**
 * Update order status
 * Security: Only allows valid status transitions
 */
export async function updateOrderStatus(orderId, locationId, newStatus, userId = null, role = null) {
    const validTransitions = {
        PENDING: ['ACCEPTED', 'CANCELLED'],
        ACCEPTED: ['PREPARING', 'CANCELLED', 'PENDING'],
        PREPARING: ['READY', 'CANCELLED', 'ACCEPTED'],
        READY: ['DELIVERED', 'PREPARING'],
        DELIVERED: [],
        CANCELLED: [],
    };

    const order = await prisma.order.findFirst({
        where: { id: orderId, locationId },
    });

    if (!order) {
        throw new Error('Order not found');
    }

    if (!validTransitions[order.status].includes(newStatus)) {
        throw new Error(`Cannot transition from ${order.status} to ${newStatus}`);
    }

    const updateData = { status: newStatus };

    // If accepting order, assign to waiter
    if (newStatus === 'ACCEPTED' && userId && role === 'WAITER') {
        if (order.waiterId && order.waiterId !== userId) {
            throw new Error('Order is already being handled by another waiter');
        }
        updateData.waiterId = userId;
    }

    // Reverting to PENDING should unassign the waiter
    if (newStatus === 'PENDING') {
        updateData.waiterId = null;
    }

    // Validate ownership for delivery
    if (newStatus === 'DELIVERED') {
        if (order.waiterId && userId && order.waiterId !== userId) {
            throw new Error('Only the assigned waiter can deliver this order');
        }

        // Deduct stock
        try {
            const { deductStockForOrder } = await import('./inventory.service.js');
            await deductStockForOrder(orderId);
        } catch (error) {
            console.error('Stock deduction error:', error.message);
        }
    }

    return prisma.order.update({
        where: { id: orderId },
        data: updateData,
        include: {
            items: {
                include: {
                    menuItem: {
                        select: { name: true, nameFr: true, nameAr: true },
                    },
                },
            },
            table: {
                select: { tableNumber: true, tableName: true },
            },
        },
    });
}

/**
 * Get order history
 */
export async function getOrderHistory(locationId, limit = 50, offset = 0, userId = null) {
    const where = {
        locationId,
        status: { in: ['DELIVERED', 'CANCELLED'] },
    };

    if (userId) {
        where.waiterId = userId;
    }

    return prisma.order.findMany({
        where,
        include: {
            items: {
                include: {
                    menuItem: {
                        select: { name: true, nameFr: true, nameAr: true },
                    },
                },
            },
            table: {
                select: { tableNumber: true, tableName: true },
            },
        },
        orderBy: { createdAt: 'desc' },
        take: limit,
        skip: offset,
    });
}

/**
 * Get orders for a specific table (customer view)
 */
export async function getOrdersByTable(tableId) {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    return prisma.order.findMany({
        where: {
            tableId,
            createdAt: { gte: today },
        },
        include: {
            items: {
                include: {
                    menuItem: {
                        select: { name: true, nameFr: true, nameAr: true },
                    },
                },
            },
        },
        orderBy: { createdAt: 'desc' },
    });
}

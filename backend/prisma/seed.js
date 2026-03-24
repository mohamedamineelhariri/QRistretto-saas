/**
 * Database Seed — SaaS Plans + Super Admin
 * 
 * Run with: node prisma/seed.js
 */

import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
    console.log('🌱 Seeding database...');

    // ============================================
    // 1. SEED PLANS
    // ============================================
    const plans = [
        {
            name: 'STARTER',
            displayName: 'Starter',
            displayNameFr: 'Débutant',
            displayNameAr: 'المبتدئ',
            priceMAD: 14900, // 149 MAD
            maxOrdersPerDay: 150,
            maxStaff: 3,
            maxLocations: 1,
            features: ['qr_menu', 'kitchen_dashboard', 'basic_orders'],
            sortOrder: 1,
        },
        {
            name: 'PRO',
            displayName: 'Pro',
            displayNameFr: 'Professionnel',
            displayNameAr: 'المحترف',
            priceMAD: 39900, // 399 MAD
            maxOrdersPerDay: null, // unlimited
            maxStaff: 15,
            maxLocations: 1,
            features: [
                'qr_menu', 'kitchen_dashboard', 'basic_orders',
                'whatsapp_bot', 'inventory_alerts', 'unlimited_orders',
            ],
            sortOrder: 2,
        },
        {
            name: 'ENTERPRISE',
            displayName: 'Enterprise',
            displayNameFr: 'Entreprise',
            displayNameAr: 'المؤسسة',
            priceMAD: 89900, // 899 MAD
            maxOrdersPerDay: null, // unlimited
            maxStaff: null, // unlimited
            maxLocations: 100, // essentially unlimited
            features: [
                'qr_menu', 'kitchen_dashboard', 'basic_orders',
                'whatsapp_bot', 'inventory_alerts', 'unlimited_orders',
                'multi_location', 'pdf_reports', 'support_tickets', 'unlimited_staff',
            ],
            sortOrder: 3,
        },
    ];

    for (const plan of plans) {
        await prisma.plan.upsert({
            where: { name: plan.name },
            update: plan,
            create: plan,
        });
        console.log(`  ✅ Plan: ${plan.name} (${plan.priceMAD / 100} MAD/mo)`);
    }

    // ============================================
    // 2. SEED SUPER ADMIN
    // ============================================
    const superAdminEmail = process.env.SUPER_ADMIN_EMAIL || 'admin@qristretto.com';
    const superAdminPassword = process.env.SUPER_ADMIN_PASSWORD || 'SuperAdmin@2026!';

    const passwordHash = await bcrypt.hash(superAdminPassword, 12);

    await prisma.superAdmin.upsert({
        where: { email: superAdminEmail },
        update: { passwordHash },
        create: {
            email: superAdminEmail,
            passwordHash,
            name: 'Super Admin',
        },
    });

    console.log(`  ✅ Super Admin: ${superAdminEmail}`);

    // ============================================
    // 3. SEED DEMO TENANT (for development only)
    // ============================================
    if (process.env.NODE_ENV === 'development') {
        const demoOwnerPassword = await bcrypt.hash('demo12345', 12);
        const demoStaffPin = await bcrypt.hash('1234', 12);

        const starterPlan = await prisma.plan.findUnique({ where: { name: 'STARTER' } });

        // Create demo tenant
        const tenant = await prisma.tenant.upsert({
            where: { slug: 'cafe-demo-dev' },
            update: {},
            create: {
                slug: 'cafe-demo-dev',
                businessName: 'Café Demo',
                businessNameFr: 'Café Démo',
                businessNameAr: 'مقهى ديمو',
                city: 'Casablanca',
                status: 'ACTIVE',
            },
        });

        // Create subscription
        const now = new Date();
        const trialEnd = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);

        await prisma.subscription.upsert({
            where: { tenantId: tenant.id },
            update: {},
            create: {
                tenantId: tenant.id,
                planId: starterPlan.id,
                status: 'TRIAL',
                currentPeriodStart: now,
                currentPeriodEnd: trialEnd,
                trialEndsAt: trialEnd,
            },
        });

        // Create owner
        const owner = await prisma.user.upsert({
            where: { email: 'owner@demo.cafe' },
            update: {},
            create: {
                tenantId: tenant.id,
                email: 'owner@demo.cafe',
                passwordHash: demoOwnerPassword,
                name: 'Demo Owner',
                role: 'OWNER',
            },
        });

        // Create default location
        const location = await prisma.location.upsert({
            where: { id: tenant.id }, // Will miss on first run, that's fine
            update: {},
            create: {
                tenantId: tenant.id,
                name: 'Café Demo - Downtown',
                nameFr: 'Café Démo - Centre-ville',
                address: '123 Bd Mohammed V, Casablanca',
            },
        });

        // Create staff
        await prisma.user.upsert({
            where: { email: 'waiter@demo.cafe' },
            update: {},
            create: {
                tenantId: tenant.id,
                email: 'waiter@demo.cafe',
                passwordHash: demoOwnerPassword,
                name: 'Ahmed (Waiter)',
                role: 'WAITER',
                pin: demoStaffPin,
            },
        });

        await prisma.user.upsert({
            where: { email: 'kitchen@demo.cafe' },
            update: {},
            create: {
                tenantId: tenant.id,
                email: 'kitchen@demo.cafe',
                passwordHash: demoOwnerPassword,
                name: 'Fatima (Kitchen)',
                role: 'KITCHEN',
                pin: demoStaffPin,
            },
        });

        // Create tables
        for (let i = 1; i <= 6; i++) {
            await prisma.table.upsert({
                where: {
                    locationId_tableNumber: { locationId: location.id, tableNumber: i },
                },
                update: {},
                create: {
                    locationId: location.id,
                    tableNumber: i,
                    tableName: `Table ${i}`,
                    capacity: i <= 4 ? 4 : 6,
                },
            });
        }

        // Create menu items
        const menuItems = [
            { name: 'Espresso', nameFr: 'Espresso', nameAr: 'إسبريسو', category: 'Coffee', categoryFr: 'Café', categoryAr: 'قهوة', price: 15, sortOrder: 1 },
            { name: 'Latte', nameFr: 'Latte', nameAr: 'لاتيه', category: 'Coffee', categoryFr: 'Café', categoryAr: 'قهوة', price: 25, sortOrder: 2 },
            { name: 'Cappuccino', nameFr: 'Cappuccino', nameAr: 'كابوتشينو', category: 'Coffee', categoryFr: 'Café', categoryAr: 'قهوة', price: 25, sortOrder: 3 },
            { name: 'Mint Tea', nameFr: 'Thé à la menthe', nameAr: 'أتاي', category: 'Tea', categoryFr: 'Thé', categoryAr: 'شاي', price: 12, sortOrder: 1 },
            { name: 'Croissant', nameFr: 'Croissant', nameAr: 'كرواسان', category: 'Pastries', categoryFr: 'Pâtisseries', categoryAr: 'حلويات', price: 18, sortOrder: 1 },
            { name: 'Pain au Chocolat', nameFr: 'Pain au Chocolat', nameAr: 'بان أو شوكولا', category: 'Pastries', categoryFr: 'Pâtisseries', categoryAr: 'حلويات', price: 20, sortOrder: 2 },
        ];

        for (const item of menuItems) {
            const existing = await prisma.menuItem.findFirst({
                where: { locationId: location.id, name: item.name },
            });

            if (!existing) {
                await prisma.menuItem.create({
                    data: { locationId: location.id, ...item },
                });
            }
        }

        console.log(`  ✅ Demo tenant: ${tenant.businessName} (${tenant.slug})`);
        console.log(`     Owner: owner@demo.cafe / demo12345`);
        console.log(`     Staff PIN: 1234`);
    }

    console.log('\n🌱 Seeding complete!');
}

main()
    .catch(e => {
        console.error('Seed error:', e);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });

import { orderCreateQueue } from '../src/config/bullmq.js';
import '../src/jobs/orderWorker.js'; // Ensure the worker is registered

async function runTests() {
    console.log('🧪 Running Order Worker Smoke Tests...');

    if (!orderCreateQueue) throw new Error('orderCreateQueue is not exported from bullmq.js');
    
    console.log('✅ orderCreateQueue verified.');
    console.log('ℹ️ Note: Full integration tests require a running Redis instance and Prisma connection.');
    console.log('✅ Order Worker structural check passed.');
}

runTests().catch(err => {
    console.error('❌ Tests failed:', err);
    process.exit(1);
});

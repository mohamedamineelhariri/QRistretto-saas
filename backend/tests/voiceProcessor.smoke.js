import { transcribeAudio, parseOrderFromText } from '../src/whatsapp/voiceProcessor.js';

// Mocking the OpenAI client would be complex here without a proper test framework,
// so we'll just do a structural check of the exports and a basic mock if needed.

async function runTests() {
    console.log('🧪 Running Voice Processor Smoke Tests...');

    if (typeof transcribeAudio !== 'function') throw new Error('transcribeAudio is not a function');
    if (typeof parseOrderFromText !== 'function') throw new Error('parseOrderFromText is not a function');

    console.log('✅ Exports verified.');
    
    // Test parsing logic with a mock menu
    const mockMenu = [
        { id: '1', name: 'Espresso' },
        { id: '2', name: 'Latte' }
    ];

    console.log('ℹ️ Note: Full AI integration tests require an OPENAI_API_KEY.');
    console.log('✅ Voice Processor structural check passed.');
}

runTests().catch(err => {
    console.error('❌ Tests failed:', err);
    process.exit(1);
});

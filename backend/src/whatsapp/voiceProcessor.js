/**
 * Voice Processor — OpenAI Whisper + GPT-4o-mini
 * 
 * Converts WhatsApp audio messages into structured JSON orders.
 * Pipeline: Audio Buffer → Whisper (STT) → GPT-4o-mini (NLU) → Structured Order
 */

import OpenAI from 'openai';
import prisma from '../config/database.js';

let openaiClient = null;

/**
 * Lazy-init the OpenAI client (only when first voice message arrives)
 */
function getOpenAI() {
    if (!openaiClient) {
        const apiKey = process.env.OPENAI_API_KEY;
        if (!apiKey) {
            throw new Error('OPENAI_API_KEY is not set in environment variables.');
        }
        openaiClient = new OpenAI({ apiKey });
    }
    return openaiClient;
}

/**
 * Transcribe an audio buffer using OpenAI Whisper
 * @param {Buffer} audioBuffer — Raw audio from Baileys (OGG/Opus typically)
 * @param {string} [mimeType='audio/ogg'] — MIME type of the audio
 * @returns {Promise<string>} — Transcribed text
 */
export async function transcribeAudio(audioBuffer, mimeType = 'audio/ogg') {
    const openai = getOpenAI();

    // Map MIME to file extension for the OpenAI API
    const extMap = {
        'audio/ogg': 'ogg',
        'audio/ogg; codecs=opus': 'ogg',
        'audio/mpeg': 'mp3',
        'audio/mp4': 'mp4',
        'audio/wav': 'wav',
        'audio/webm': 'webm',
    };
    const ext = extMap[mimeType] || 'ogg';

    // OpenAI expects a File-like object — create one from the buffer
    const file = new File([audioBuffer], `voice.${ext}`, { type: mimeType });

    const transcription = await openai.audio.transcriptions.create({
        model: 'whisper-1',
        file,
        language: undefined, // Auto-detect (supports Arabic, French, English)
        prompt: 'This is a food order from a Moroccan restaurant. The speaker may use Darija, French, or Arabic to order items like espresso, café, latte, croissant, atay, msemen, harcha, jus, thé.',
    });

    return transcription.text;
}

/**
 * Parse transcribed text into a structured order using GPT-4o-mini
 * @param {string} text — Transcription from Whisper
 * @param {Array} menuItems — Available menu items [{id, name, nameFr, nameAr, price}]
 * @returns {Promise<{items: Array<{menuItemId: string, quantity: number, name: string}>, notes?: string}>}
 */
export async function parseOrderFromText(text, menuItems) {
    const openai = getOpenAI();

    // Build a concise menu reference for the prompt
    const menuRef = menuItems.map(item => {
        const names = [item.name, item.nameFr, item.nameAr].filter(Boolean).join(' / ');
        return `- ID: "${item.id}" | Names: ${names} | Price: ${parseFloat(item.price)} MAD`;
    }).join('\n');

    const systemPrompt = `You are a food order parser for a Moroccan restaurant/café. 
Your job is to extract structured order data from customer speech that may be in:
- Moroccan Darija (e.g., "bghit jouj café w wahed croissant")
- French (e.g., "je veux deux cafés et un croissant")  
- Arabic (e.g., "أبغي اثنين قهوة وواحد كرواسان")
- English (e.g., "I want two coffees and a croissant")
- Mixed languages (very common in Morocco)

Common Darija number words: wahed/wahda=1, jouj=2, tlata=3, rb3a=4, khmsa=5, stta=6, sb3a=7, tmnya=8, ts3oud=9, 3chra=10
Common Darija food terms: atay=mint tea, qehwa/café=coffee, 7lib=milk, khobz=bread, msemen=flatbread, harcha=semolina bread

Here is the restaurant's current menu:
${menuRef}

RULES:
1. Match spoken items to the closest menu item ID from the list above
2. If quantity is not specified, default to 1
3. If an item cannot be matched to any menu item, skip it but mention it in notes
4. Maximum quantity per item is 20
5. Return ONLY valid JSON, no markdown

Return format:
{
  "items": [{"menuItemId": "uuid-here", "quantity": 2, "name": "Item Name"}],
  "notes": "optional notes about unmatched items or special requests"
}`;

    const response = await openai.chat.completions.create({
        model: 'gpt-4o-mini',
        messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: `Parse this order: "${text}"` },
        ],
        temperature: 0.1,
        response_format: { type: 'json_object' },
        max_tokens: 500,
    });

    const content = response.choices[0]?.message?.content;
    if (!content) {
        throw new Error('GPT returned empty response');
    }

    const parsed = JSON.parse(content);

    // Validate and sanitize the output
    if (!parsed.items || !Array.isArray(parsed.items)) {
        return { items: [], notes: 'Could not parse any items from the voice message.' };
    }

    // Filter only items that reference valid menu IDs
    const validMenuIds = new Set(menuItems.map(m => m.id));
    const validItems = parsed.items
        .filter(item => item.menuItemId && validMenuIds.has(item.menuItemId))
        .map(item => ({
            menuItemId: item.menuItemId,
            quantity: Math.min(Math.max(parseInt(item.quantity) || 1, 1), 20),
            name: item.name || menuItems.find(m => m.id === item.menuItemId)?.name || 'Unknown',
        }));

    return {
        items: validItems,
        notes: parsed.notes || null,
    };
}

/**
 * Main entry point — process a voice order end-to-end
 * @param {string} tenantId — Tenant UUID
 * @param {Buffer} audioBuffer — Raw audio buffer from Baileys
 * @param {string} [mimeType='audio/ogg'] — Audio MIME type
 * @returns {Promise<{success: boolean, transcription?: string, structuredOrder?: object, error?: string}>}
 */
export async function processVoiceOrder(tenantId, audioBuffer, mimeType = 'audio/ogg') {
    try {
        // 1. Check if OPENAI_API_KEY is configured
        if (!process.env.OPENAI_API_KEY) {
            return {
                success: false,
                error: 'Voice ordering is not configured. OPENAI_API_KEY is missing.',
                structuredOrder: null,
            };
        }

        console.log(`🎙️ [Voice Processor] Processing audio for tenant ${tenantId} (${audioBuffer.length} bytes)`);

        // 2. Get the tenant's active menu items
        const location = await prisma.location.findFirst({
            where: { tenantId, isActive: true },
            include: {
                menuItems: {
                    where: { available: true },
                    select: { id: true, name: true, nameFr: true, nameAr: true, price: true },
                },
            },
        });

        if (!location || location.menuItems.length === 0) {
            return {
                success: false,
                error: 'No menu items available for this restaurant.',
                structuredOrder: null,
            };
        }

        // 3. Transcribe audio → text
        const transcription = await transcribeAudio(audioBuffer, mimeType);
        console.log(`🎙️ [Voice Processor] Transcription: "${transcription}"`);

        if (!transcription || transcription.trim().length === 0) {
            return {
                success: false,
                error: 'Could not understand the audio message.',
                transcription: '',
                structuredOrder: null,
            };
        }

        // 4. Parse text → structured order
        const structuredOrder = await parseOrderFromText(transcription, location.menuItems);
        console.log(`🎙️ [Voice Processor] Parsed ${structuredOrder.items.length} items`);

        if (structuredOrder.items.length === 0) {
            return {
                success: false,
                error: 'Could not identify any menu items in the voice message.',
                transcription,
                structuredOrder: null,
            };
        }

        return {
            success: true,
            transcription,
            structuredOrder: {
                ...structuredOrder,
                locationId: location.id,
            },
        };

    } catch (error) {
        console.error(`🎙️ [Voice Processor] Error:`, error.message);

        // Handle specific OpenAI errors gracefully
        if (error.code === 'insufficient_quota') {
            return { success: false, error: 'AI service quota exceeded. Please try text ordering.', structuredOrder: null };
        }
        if (error.status === 429) {
            return { success: false, error: 'AI service is busy. Please try again in a moment.', structuredOrder: null };
        }

        return {
            success: false,
            error: 'Voice processing failed. Please try ordering by text.',
            structuredOrder: null,
        };
    }
}

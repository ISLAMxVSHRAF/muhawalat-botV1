// ==========================================
// 💬 QUOTES UTILITY
// إدارة الاقتباسات المحفزة
// ==========================================

const fs = require('fs');
const path = require('path');

let quotes = [];

function loadQuotes() {
    try {
        // ✅ FIX: المسار الصح من src/utils/ للـ root
        const quotesPath = path.join(__dirname, '../../quotes.json');
        if (fs.existsSync(quotesPath)) {
            const data = fs.readFileSync(quotesPath, 'utf8');
            quotes = JSON.parse(data);
            console.log(`✅ Loaded ${quotes.length} quotes`);
        } else {
            console.warn('⚠️ quotes.json not found, using defaults');
            quotes = getDefaultQuotes();
        }
    } catch (e) {
        console.error('❌ Failed to load quotes:', e.message);
        quotes = getDefaultQuotes();
    }
}

function getRandomQuote(isFemale = false) {
    if (quotes.length === 0) {
        return isFemale
            ? 'قليل دائم خير من كثير منقطع 🌸'
            : 'قليل دائم خير من كثير منقطع 💪';
    }

    let quote = quotes[Math.floor(Math.random() * quotes.length)];

    if (isFemale) {
        quote = quote
            .replace(/ابدأ/g, 'ابدأي')
            .replace(/استمر/g, 'استمري')
            .replace(/كمل/g, 'كملي')
            .replace(/💪/g, '🌸');
    }

    return quote;
}

function getDefaultQuotes() {
    return [
        'أنت لا ترتقي لمستوى أهدافك، بل تنحدر لمستوى أنظمتك. - جيمس كلير',
        'النجاح هو نتاج عادات يومية صغيرة، مش تحولات ضخمة بتحصل مرة واحدة.',
        'قليل دائم خير من كثير منقطع.',
        'العادة هي اللي بتخليك تبدأ، لكن الانضباط هو اللي بيخليك تكمل.',
        'مفيش لحظة مثالية للبداية، ابدأ دلوقتي وحسن في الطريق.',
        'الاستمرارية أهم من الكفاءة في البدايات.',
        'ركز على أن تكون أفضل بنسبة 1% بس كل يوم.'
    ];
}

loadQuotes();

module.exports = { getRandomQuote, loadQuotes };

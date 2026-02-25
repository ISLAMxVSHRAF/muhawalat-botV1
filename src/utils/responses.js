// ==========================================
// 💬 RESPONSES UTILITY
// إدارة الردود المنظمة حسب النوع والمناسبة
// ==========================================

const fs = require('fs');
const path = require('path');

let responses = {};

function loadResponses() {
    try {
        const responsesPath = path.join(__dirname, '../../responses.json');
        if (fs.existsSync(responsesPath)) {
            const data = fs.readFileSync(responsesPath, 'utf8');
            responses = JSON.parse(data);
            console.log('✅ Responses loaded successfully');
        } else {
            console.warn('⚠️ responses.json not found, using defaults');
            responses = getDefaultResponses();
        }
    } catch (e) {
        console.error('❌ Failed to load responses:', e.message);
        responses = getDefaultResponses();
    }
}

function getRandom(arr) {
    if (!arr || !arr.length) return null;
    return arr[Math.floor(Math.random() * arr.length)];
}

// ==========================================
// 🌅 رسالة الصباح
// ==========================================
function getMorningMessage(isFemale = false) {
    const gender = isFemale ? 'female' : 'male';
    const messages = responses.morning?.[gender] || [];
    return getRandom(messages) || (isFemale
        ? 'صباح الخير! ابدأي يومك بنشاط 🌸'
        : 'صباح الخير! ابدأ يومك بنشاط 💪');
}

// ==========================================
// 🌙 رسالة المساء — يوم مكتمل
// ==========================================
function getEveningPerfectMessage(isFemale = false, mention = '') {
    const gender = isFemale ? 'female' : 'male';
    const messages = responses.evening_perfect?.[gender] || [];
    const msg = getRandom(messages) || (isFemale
        ? `أحسنتي النهاردة يا ${mention} 🤍`
        : `أحسنت النهاردة يا ${mention} 🤍`);
    return msg.replace('{mention}', mention);
}

// ==========================================
// 🌙 رسالة المساء — عادات ناقصة
// ==========================================
function getEveningMissingMessage(isFemale = false) {
    const gender = isFemale ? 'female' : 'male';
    const messages = responses.evening_missing?.[gender] || [];
    return getRandom(messages) || (isFemale
        ? 'لسه فيه وقت، حاولي تخلصي عادة واحدة على الأقل 🤍'
        : 'لسه فيه وقت، حاول تخلص عادة واحدة على الأقل 🤍');
}

// ==========================================
// ✅ رسالة إتمام عادة واحدة
// ==========================================
function getHabitSingleMessage(isFemale = false) {
    const gender = isFemale ? 'female' : 'male';
    const messages = responses.habit_single?.[gender] || [];
    return getRandom(messages) || (isFemale ? 'عاشت! 💪' : 'عاش! 💪');
}

// ==========================================
// الدوال القديمة — محتفظ بها للتوافق مع باقي الكود
// ==========================================
function getEveningMessage(rate, isFemale = false) {
    const gender = isFemale ? 'female' : 'male';
    let category;
    if (rate === 100)       category = 'perfect';
    else if (rate >= 70)    category = 'good';
    else if (rate >= 50)    category = 'medium';
    else                    category = 'tough';

    const messages = responses.evening?.[category]?.[gender]?.messages || [];
    const title    = responses.evening?.[category]?.[gender]?.title || '';

    if (!messages.length) {
        return { title: '📊 محاسبة اليوم', message: `أنجزت ${rate}% من عاداتك اليوم` };
    }

    return { title, message: messages[Math.floor(Math.random() * messages.length)] };
}

function getHabitCompleteMessage(allCompleted, isFemale = false) {
    if (!allCompleted) return getHabitSingleMessage(isFemale);
    const gender   = isFemale ? 'female' : 'male';
    const messages = responses.habit_complete?.all?.[gender] || [];
    if (!messages.length) {
        return allCompleted
            ? (isFemale ? 'عاشت! خلصتي كل حاجة 💎' : 'عاش! خلصت كل حاجة 💎')
            : getHabitSingleMessage(isFemale);
    }
    return messages[Math.floor(Math.random() * messages.length)];
}

function getVentingResponse(type, isFemale = false) {
    const gender = isFemale ? 'female' : 'male';
    let category;
    if (type === 'modal_vent_success')      category = 'success_response';
    else if (type === 'modal_vent_medium')  category = 'medium_response';
    else                                    category = 'fail_response';

    const messages = responses.venting?.[category]?.[gender] || [];
    if (!messages.length) {
        return isFemale ? 'شكراً على مشاركة أفكارك 🌸' : 'شكراً على مشاركة أفكارك 💪';
    }

    return messages[Math.floor(Math.random() * messages.length)];
}

function getStreakMilestone(streak, isFemale = false) {
    const gender     = isFemale ? 'female' : 'male';
    const milestones = responses.streak_milestones?.[gender] || {};

    if (milestones[streak]) return milestones[streak];

    if (streak >= 100) return milestones['100'] || '100 يوم! أسطورة 👑';
    if (streak >= 50)  return milestones['50']  || '50 يوم! إرادة حديد ⚡';
    if (streak >= 30)  return milestones['30']  || (isFemale ? 'شهر كامل! وحشة 🦁' : 'شهر كامل! وحش 🦁');
    if (streak >= 14)  return milestones['14']  || 'أسبوعين! الالتزام بيبان 💪';
    if (streak >= 7)   return milestones['7']   || (isFemale ? 'أسبوع كامل! عاشت 🔥' : 'أسبوع كامل! عاش 🔥');
    if (streak >= 3)   return milestones['3']   || '3 أيام! بداية قوية 🌱';

    return null;
}

function getDefaultResponses() {
    return {
        morning: {
            male:   ['صباح الخير يا بطل! 💪 ابدأ يومك بنشاط'],
            female: ['صباح الخير يا بطلة! 🌸 ابدأي يومك بنشاط']
        },
        evening_perfect: {
            male:   ['أحسنت النهاردة يا {mention} 🤍'],
            female: ['أحسنتي النهاردة يا {mention} 🤍']
        },
        evening_missing: {
            male:   ['لسه فيه وقت، حاول تخلص عادة واحدة على الأقل 🤍'],
            female: ['لسه فيه وقت، حاولي تخلصي عادة واحدة على الأقل 🤍']
        },
        habit_single: {
            male:   ['عاش! 💪'],
            female: ['عاشت! 💪']
        }
    };
}

loadResponses();

module.exports = {
    getMorningMessage,
    getEveningPerfectMessage,
    getEveningMissingMessage,
    getHabitSingleMessage,
    // دوال قديمة محتفظ بها للتوافق
    getEveningMessage,
    getHabitCompleteMessage,
    getVentingResponse,
    getStreakMilestone,
    loadResponses
};

// ==========================================
// 🆕 ONBOARDING HANDLER
// التسجيل الجديد للمستخدمين
// ==========================================

const { ModalBuilder, TextInputBuilder, TextInputStyle, ActionRowBuilder, MessageFlags } = require('discord.js');
const { updateDashboard } = require('../utils/dashboard');

// ==========================================
// 🧠 ENHANCED GENDER DETECTION
// كشف النوع بدقة عالية
// ==========================================
function detectGender(genderInput) {
    const input = genderInput.toLowerCase().trim();
    
    // Female keywords (أنثى)
    const femaleKeywords = [
        'أنثى', 'انثى', 'انثي', 'أنثي',
        'بنت', 'female', 'girl', 'woman',
        'f', 'ف'
    ];
    
    // Male keywords (ذكر)
    const maleKeywords = [
        'ذكر', 'رجل', 'ولد', 'male', 'boy', 'man',
        'm', 'ذ'
    ];
    
    // Check female first (more specific)
    for (const keyword of femaleKeywords) {
        if (input.includes(keyword)) {
            return 'female';
        }
    }
    
    // Check male
    for (const keyword of maleKeywords) {
        if (input.includes(keyword)) {
            return 'male';
        }
    }
    
    // Default to male if unclear
    return 'male';
}
const { getRandomQuote } = require('../utils/quotes');

// ==========================================
// 🎯 SHOW REGISTRATION MODAL
// عرض نموذج التسجيل
// ==========================================
async function showRegistrationModal(interaction) {
    const modal = new ModalBuilder()
        .setCustomId('modal_register')
        .setTitle('✨ ابدأ رحلتك');

    // 1️⃣ الاسم الثنائي
    const nameInput = new TextInputBuilder()
        .setCustomId('user_name')
        .setLabel('اسمك الثنائي (أو اللقب)')
        .setStyle(TextInputStyle.Short)
        .setPlaceholder('مثال: إسلام أشرف')
        .setRequired(true);

    // 2️⃣ الهدف الأساسي
    const goalInput = new TextInputBuilder()
        .setCustomId('user_goal')
        .setLabel('هدفك الأساسي')
        .setStyle(TextInputStyle.Paragraph)
        .setPlaceholder('مثال: عايز أنتظم في الصلاة وأتعلم برمجة...')
        .setRequired(true);

    // 3️⃣ النوع
    const genderInput = new TextInputBuilder()
        .setCustomId('user_gender')
        .setLabel('النوع (اكتب: ذكر / أنثى)')
        .setStyle(TextInputStyle.Short)
        .setPlaceholder('عشان أظبط صيغة الكلام')
        .setRequired(true);

    // 4️⃣ العادات (اختياري)
    const habitsInput = new TextInputBuilder()
        .setCustomId('user_habits')
        .setLabel('عادات صغيرة تبدأ بيها (اختياري)')
        .setStyle(TextInputStyle.Paragraph)
        .setPlaceholder('مثال:\nصلاة الفجر\nقراءة صفحة قرآن')
        .setRequired(false);

    modal.addComponents(
        new ActionRowBuilder().addComponents(nameInput),
        new ActionRowBuilder().addComponents(goalInput),
        new ActionRowBuilder().addComponents(genderInput),
        new ActionRowBuilder().addComponents(habitsInput)
    );

    await interaction.showModal(modal);
}

// ==========================================
// 💾 PROCESS REGISTRATION
// معالجة بيانات التسجيل
// ==========================================
async function processRegistration(interaction, db) {
    try {
        // ✅ FIX: Use deferReply with ephemeral flag
        await interaction.deferReply({ flags: MessageFlags.Ephemeral });

        const name = interaction.fields.getTextInputValue('user_name');
        const goal = interaction.fields.getTextInputValue('user_goal');
        const genderRaw = interaction.fields.getTextInputValue('user_gender');
        const habitsInput = interaction.fields.getTextInputValue('user_habits');

        // ✅ ENHANCED: معالجة النوع بدقة أكبر
        const gender = detectGender(genderRaw);

        // Check if user is archived — restore instead of creating new thread
        const existingUser = db.getUser(interaction.user.id);
        if (existingUser && existingUser.status === 'archived') {
            // Restore the user
            db.restoreUser(interaction.user.id);
            
            // Try to unarchive their existing thread
            if (existingUser.thread_id) {
                try {
                    const oldThread = await interaction.guild.channels.fetch(existingUser.thread_id).catch(() => null);
                    if (oldThread) {
                        if (oldThread.archived) await oldThread.setArchived(false).catch(() => {});
                        await updateDashboard(oldThread, interaction.user.id, db);
                        return interaction.editReply(`✅ مرحباً بعودتك! مساحتك جاهزة: <#${existingUser.thread_id}>`);
                    }
                } catch (e) {
                    console.error('❌ Restore thread error:', e.message);
                }
            }
            // If thread not found, fall through to create a new one
            db.updateUser(interaction.user.id, { status: 'active' });
        }

        const existing = db.getUser(interaction.user.id);
        if (existing?.thread_id) {
            return interaction.editReply('✅ أنت مسجل بالفعل! مساحتك: <#' + existing.thread_id + '>');
        }

        const config = db.getConfig(interaction.guild.id);
        if (!config || !config.forum_id) {
            return interaction.editReply('❌ خطأ: لم يتم إعداد النظام بعد. تواصل مع الأدمن.');
        }

        const forum = await interaction.guild.channels.fetch(config.forum_id).catch(() => null);
        if (!forum) {
            return interaction.editReply("❌ خطأ: لم يتم العثور على قناة العادات.");
        }

        const thread = await forum.threads.create({
            name: `مساحة ${name} 🌱`,
            message: { content: '🌱 جاري التحضير...' }
        });

        if (existing) {
            db.updateUser(interaction.user.id, { name, goal, gender, thread_id: thread.id });
        } else {
            db.createUser(interaction.user.id, name, goal, gender, thread.id, goal);
        }

        if (habitsInput) {
            const habitsList = habitsInput.split(/\r?\n/);
            habitsList.forEach(h => {
                if (h.trim()) {
                    db.addHabit(interaction.user.id, h.trim());
                }
            });
        }

        // عرض Dashboard
        await updateDashboard(thread, interaction.user.id, db);

        // ✅ FIX: رسالة Pinned موحدة (ذكر وأنثى) — دليل شامل ومحدّث
        const pinnedContent =
            `📌 **دليلك السريع في مساحتك الخاصة!** <@${interaction.user.id}>\n\n` +
            `**كيف تستفيد من البوت في مجتمع محاولات؟**\n` +
            `✅ **عاداتك اليومية:** استخدم زر (➕ إضافة عادة) للبدء، واضغط على العادة عند إنجازها لتسجيلها.\n` +
            `📝 **التقرير اليومي:** يومياً الساعة 10 مساءً يتم نشر بوست التقارير في القسم المخصص، اكتب تقريرك هناك (15 كلمة على الأقل) وسيسجله البوت في إحصائياتك تلقائياً.\n` +
            `🎯 **الأهداف والمهام:** سجل أهدافك (الأسبوعية/الشهرية) من لوحة التحكم، وشارك في المهام المجتمعية.\n` +
            `📊 **إحصائياتك:** تابع تقدمك، الستريك الخاص بك، والإنجازات التي حققتها من القائمة المنسدلة بالأسفل.\n\n` +
            `> 💡 _قليلٌ دائم.. خيرٌ من كثيرٍ منقطع_`;

        const pinnedMsg = await thread.send({ content: pinnedContent });
        await pinnedMsg.pin().catch(() => {});

        // رسالة ترحيبية مؤقتة
        const welcomeMsg = await thread.send({ 
            content: `👋 <@${interaction.user.id}> دي مساحتك الخاصة.\n*(هتتمسح الرسالة دي تلقائياً بعد دقيقة)*` 
        });

        // حذف الرسالة بعد 60 ثانية
        setTimeout(() => welcomeMsg.delete().catch(() => {}), 60000);

        await interaction.editReply(`✅ **تم!** مساحتك جاهزة: <#${thread.id}>`);

    } catch (e) {
        console.error('❌ Registration Error:', e.message);
        await interaction.editReply('❌ حدث خطأ أثناء التسجيل. حاول مرة أخرى.').catch(() => {});
    }
}

module.exports = {
    showRegistrationModal,
    processRegistration,
    detectGender  // ✅ للاختبار
};

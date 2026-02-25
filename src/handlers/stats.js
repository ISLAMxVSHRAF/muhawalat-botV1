// ==========================================
// 📊 STATS HANDLER
// عرض الإحصائيات والإنجازات
// ==========================================

const { MessageFlags } = require('discord.js');
const { createStatsEmbed, createAchievementsEmbed } = require('../utils/embeds');

// ==========================================
// 📊 SHOW STATS - عرض الإحصائيات
// ==========================================
async function showStats(interaction, db) {
    try {
        const userId = interaction.user.id;
        let user = db.getUser(userId);

        // ✅ FIX: تسجيل تلقائي صامت بدلاً من رسالة خطأ
        // لو مسح الداتابيز — نسجل العضو تلقائياً ونكمل بسلاسة
        if (!user) {
            db.createUser(
                userId,
                interaction.user.globalName || interaction.user.username,
                '',
                'male',
                null,
                null
            );
            user = db.getUser(userId);
        }

        // جلب التحليلات
        const analytics = db.getUserAnalytics(userId);

        // ✅ FIX: إضافة db كمعامل رابع لـ createStatsEmbed
        const embed = createStatsEmbed(user, analytics, interaction, db);

        await interaction.reply({
            embeds: [embed],
            flags: MessageFlags.Ephemeral
        });

    } catch (e) {
        console.error('❌ Show Stats Error:', e.message);
        await interaction.reply({
            content: '❌ حدث خطأ أثناء عرض الإحصائيات.',
            flags: MessageFlags.Ephemeral
        }).catch(() => {});
    }
}

// ==========================================
// 🏆 SHOW ACHIEVEMENTS - عرض الإنجازات
// ==========================================
async function showAchievements(interaction, db) {
    try {
        const userId = interaction.user.id;
        let user = db.getUser(userId);

        // ✅ FIX: تسجيل تلقائي صامت بدلاً من رسالة خطأ
        // لو مسح الداتابيز — نسجل العضو تلقائياً ونكمل بسلاسة
        if (!user) {
            db.createUser(
                userId,
                interaction.user.globalName || interaction.user.username,
                '',
                'male',
                null,
                null
            );
            user = db.getUser(userId);
        }

        // جلب الإنجازات
        const achievements = db.getUserAchievements(userId);

        // إنشاء Embed
        const embed = createAchievementsEmbed(user, achievements);

        await interaction.reply({
            embeds: [embed],
            flags: MessageFlags.Ephemeral
        });

    } catch (e) {
        console.error('❌ Show Achievements Error:', e.message);
        await interaction.reply({
            content: '❌ حدث خطأ أثناء عرض الإنجازات.',
            flags: MessageFlags.Ephemeral
        }).catch(() => {});
    }
}

module.exports = {
    showStats,
    showAchievements
};

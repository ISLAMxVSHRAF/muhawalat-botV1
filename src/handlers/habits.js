// ==========================================
// 📝 HABITS HANDLER
// Version: 7.0.0 - Fixed & Enhanced
// ==========================================

const { ModalBuilder, TextInputBuilder, TextInputStyle, ActionRowBuilder, StringSelectMenuBuilder, MessageFlags } = require('discord.js');
const { updateDashboard } = require('../utils/dashboard');
const { getHabitCompleteMessage, getStreakMilestone } = require('../utils/responses');
const CONFIG = require('../config');

// ==========================================
// ➕ ADD HABIT
// ==========================================
async function showAddHabitModal(interaction) {
    const modal = new ModalBuilder()
        .setCustomId('modal_add_habit')
        .setTitle('➕ أضف عادة جديدة');

    modal.addComponents(new ActionRowBuilder().addComponents(
        new TextInputBuilder()
            .setCustomId('habit_name')
            .setLabel('اسم العادة')
            .setStyle(TextInputStyle.Short)
            .setPlaceholder('مثال: قراءة 10 صفحات')
            .setRequired(true)
    ));

    await interaction.showModal(modal);
}

async function processAddHabit(interaction, db) {
    try {
        await interaction.deferUpdate();
        const habitName = interaction.fields.getTextInputValue('habit_name').trim();
        if (!habitName) return;

        // ✅ FIX: تسجيل تلقائي صامت قبل إضافة العادة
        // لو الداتابيز ممسوحة — نسجل العضو تلقائياً عشان ما يحصلش خطأ
        if (!db.getUser(interaction.user.id)) {
            db.createUser(
                interaction.user.id,
                interaction.user.globalName || interaction.user.username,
                '',
                'male',
                null,
                null
            );
        }

        db.addHabit(interaction.user.id, habitName);
        await updateDashboard(interaction.channel, interaction.user.id, db);
    } catch (e) {
        console.error('❌ Add Habit Error:', e.message);
    }
}

// ==========================================
// ✅ TOGGLE HABIT
// BUG FIX: كان فيه `const user` متعرّف مرتين في نفس الـ scope
// BUG FIX: sendToAchieversChannel كانت بتتسمّى كـ undefined أحياناً
// ==========================================
async function toggleHabit(interaction, habitId, db) {
    try {
        await interaction.deferUpdate();
        const userId = interaction.user.id;

        db.toggleHabit(habitId);

        // ✅ BUG FIX: جيب الحالة بعد الـ toggle مش قبله
        const habits = db.getHabits(userId);
        const currentHabit = habits.find(h => h.id === habitId);

        if (currentHabit?.completed) {
            db.incrementUserTotal(userId);
        } else {
            db.decrementUserTotal(userId);
        }

        await updateDashboard(interaction.channel, userId, db);

        // ==========================================
        // 🎉 تحقق من 100%
        // ==========================================
        if (currentHabit?.completed) {
            const allDone = habits.length > 0 && habits.every(h => h.completed);
            const user = db.getUser(userId); // BUG FIX: تعريف واحد بس
            const isFemale = user?.gender === 'female';

            if (allDone) {
                // 🌟 100% — رسالة تهنئة + قناة المتفوقين
                const msg = getHabitCompleteMessage(true, isFemale);
                const cheerMsg = await interaction.channel.send(`🎉 **${msg}**`);
                setTimeout(() => cheerMsg.delete().catch(() => {}), 60000);

                // إرسال للمتفوقين
                await sendToAchieversChannel(interaction, userId, db, user);

            } else {
                // 💪 عادة واحدة
                const msg = getHabitCompleteMessage(false, isFemale);
                const singleMsg = await interaction.channel.send(`👌 <@${userId}> ${msg}`);
                setTimeout(() => singleMsg.delete().catch(() => {}), 15000);
            }

            // Streak milestone
            if (user) {
                const streakMsg = getStreakMilestone(user.days_streak || 0, isFemale);
                if (streakMsg) {
                    const m = await interaction.channel.send(`🔥 ${streakMsg}`);
                    setTimeout(() => m.delete().catch(() => {}), 30000);
                }
            }

            // ✅ إشعار الإنجازات الجديدة
            await checkAndAnnounceAchievements(interaction, userId, db, user);
        }

    } catch (e) {
        console.error('❌ Toggle Habit Error:', e.message);
    }
}

// ==========================================
// 🗑️ DELETE HABIT
// ==========================================
async function showDeleteMenu(interaction, db) {
    try {
        const habits = db.getHabits(interaction.user.id);
        if (!habits.length) {
            return interaction.reply({ content: '❌ القائمة فارغة.', flags: MessageFlags.Ephemeral });
        }

        const menu = new StringSelectMenuBuilder()
            .setCustomId('del_menu')
            .setPlaceholder('اختر العادة للحذف')
            .addOptions(habits.map(h => ({ label: h.name, value: h.id.toString(), emoji: '🗑️' })));

        await interaction.reply({
            content: '⚠️ **اختر العادة للحذف:**',
            components: [new ActionRowBuilder().addComponents(menu)],
            flags: MessageFlags.Ephemeral
        });
    } catch (e) {
        console.error('❌ Delete Menu Error:', e.message);
    }
}

async function processDeleteHabit(interaction, db) {
    try {
        await interaction.deferUpdate();
        const habitId = parseInt(interaction.values[0]);
        db.deleteHabit(habitId);
        await updateDashboard(interaction.channel, interaction.user.id, db);
        await interaction.editReply({ content: '✅ تم الحذف.', components: [] });
    } catch (e) {
        console.error('❌ Process Delete Error:', e.message);
    }
}

// ==========================================
// 🏆 ACHIEVERS CHANNEL
// BUG FIX: كانت بتتسمّى بـ typeof check لأن الـ function مش exported
//          الحل: نقلناها هنا وبنمررلها user كـ parameter
// ==========================================
async function sendToAchieversChannel(interaction, userId, db, user) {
    try {
        if (!user || user.achieved_today) return;

        const config = db.getConfig(interaction.guild.id);
        if (!config?.achieve_id) return;

        const achieveCh = await interaction.guild.channels.fetch(config.achieve_id).catch(() => null);
        if (!achieveCh) return;

        const { createAchieversEmbed } = require('../utils/embeds');
        const analytics = db.getUserAnalytics(userId);
        const discordUser = await interaction.client.users.fetch(userId).catch(() => null);
        const embed = createAchieversEmbed(user, analytics, discordUser);

        const genderMsg = user.gender === 'female' ? '👏 **تحية خاصة للمجتهدة**' : '👏 **تحية خاصة للمجتهد**';
        await achieveCh.send({ content: `${genderMsg} <@${userId}>`, embeds: [embed] });

        db.updateStats(userId, user.total_done, user.days_streak, true);
    } catch (e) {
        console.error('❌ Achievers Channel Error:', e.message);
    }
}

// ==========================================
// 🏆 CHECK & ANNOUNCE NEW ACHIEVEMENTS
// FIX: كان المنطق معكوساً — `alreadyHad` كانت تتسبب في تخطي الإرسال دائماً
//      الحل: حذف التحقق بـ alreadyHad، والاعتماد فقط على التحقق الزمني (آخر دقيقة)
// ==========================================
async function checkAndAnnounceAchievements(interaction, userId, db, user) {
    try {
        if (!user) return;
        const CONFIG = require('../config');
        const isFemale = user.gender === 'female';
        const streak = user.days_streak || 0;
        const total = user.total_done || 0;

        // قائمة الإنجازات المحتملة حسب الحالة الحالية
        const toCheck = [];
        if (streak >= 1)   toCheck.push('first_day');
        if (streak >= 7)   toCheck.push('week_streak');
        if (streak >= 30)  toCheck.push('month_streak');
        if (streak >= 100) toCheck.push('century_streak');
        if (total >= 100)  toCheck.push('century_tasks');
        if (total >= 500)  toCheck.push('half_k_tasks');
        if (total >= 1000) toCheck.push('thousand_tasks');

        for (const type of toCheck) {
            // ✅ FIX: حذف تحقق alreadyHad المعكوس — نعتمد فقط على التحقق الزمني
            const achievements = db.getUserAchievements(userId);
            const ach = achievements.find(a => a.achievement_type === type);
            if (!ach) continue;

            const earnedAt = new Date(ach.earned_at).getTime();
            const now = Date.now();
            if (now - earnedAt > 60000) continue; // أكتر من دقيقة — مش جديد

            const achConfig = CONFIG.ACHIEVEMENTS[type];
            if (!achConfig) continue;

            const celebMsg = isFemale
                ? `🎉 <@${userId}> حققتِ إنجاز جديد!\n\n${achConfig.emoji} **${achConfig.name}**\n_${achConfig.desc}_`
                : `🎉 <@${userId}> حققت إنجاز جديد!\n\n${achConfig.emoji} **${achConfig.name}**\n_${achConfig.desc}_`;

            const m = await interaction.channel.send(celebMsg);
            setTimeout(() => m.delete().catch(() => {}), 60000);
            break; // إنجاز واحد في كل مرة
        }
    } catch (e) {
        console.error('❌ checkAndAnnounceAchievements:', e.message);
    }
}

module.exports = {
    showAddHabitModal,
    processAddHabit,
    toggleHabit,
    showDeleteMenu,
    processDeleteHabit
};

// ==========================================
// 👤 PROFILE HANDLER
// تعديل البروفايل والهدف الأسبوعي
// ==========================================

const { ModalBuilder, TextInputBuilder, TextInputStyle, ActionRowBuilder, MessageFlags } = require('discord.js');
const { updateDashboard } = require('../utils/dashboard');

// ==========================================
// ✏️ SHOW EDIT PROFILE MODAL
// ==========================================
async function showEditProfileModal(interaction, db) {
    const user = db.getUser(interaction.user.id);
    if (!user) {
        return interaction.reply({ content: '❌ لم يتم العثور على بياناتك.', flags: MessageFlags.Ephemeral });
    }

    const modal = new ModalBuilder()
        .setCustomId('modal_save_profile')
        .setTitle('✏️ تعديل الملف الشخصي');

    modal.addComponents(
        new ActionRowBuilder().addComponents(
            new TextInputBuilder()
                .setCustomId('profile_name')
                .setLabel('الاسم')
                .setStyle(TextInputStyle.Short)
                .setValue(user.name || '')
                .setRequired(true)
        ),
        new ActionRowBuilder().addComponents(
            new TextInputBuilder()
                .setCustomId('profile_goal')
                .setLabel('هدفك الأساسي')
                .setStyle(TextInputStyle.Paragraph)
                .setValue(user.goal || user.bio || '')
                .setRequired(true)
        )
    );

    await interaction.showModal(modal);
}

// ==========================================
// 💾 PROCESS SAVE PROFILE
// ==========================================
async function processSaveProfile(interaction, db) {
    try {
        await interaction.deferReply({ flags: MessageFlags.Ephemeral });

        const name = interaction.fields.getTextInputValue('profile_name');
        const goal = interaction.fields.getTextInputValue('profile_goal');

        db.updateUser(interaction.user.id, { name, goal });

        // تحديث الداشبورد — يبقى في الصفحة الرئيسية
        await updateDashboard(interaction.channel, interaction.user.id, db);

        await interaction.editReply('✅ **تم تحديث ملفك الشخصي!**');
    } catch (e) {
        console.error('❌ processSaveProfile:', e.message);
        await interaction.editReply('❌ حدث خطأ أثناء الحفظ.').catch(() => {});
    }
}

function getCurrentWeekPeriod() {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-W${Math.ceil(now.getDate() / 7)}`;
}
function getCurrentMonthPeriod() {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}
function getCurrentYearPeriod() {
    return new Date().getFullYear().toString();
}

// ==========================================
// 🎯 SHOW YEARLY GOAL MODAL (هدف واحد فقط)
// ==========================================
async function showYearlyGoalModal(interaction, db) {
    const currentYear = getCurrentYearPeriod();
    const existing = db.getGoals(interaction.user.id, 'yearly', currentYear);

    const modal = new ModalBuilder()
        .setCustomId('modal_yearly_goal')
        .setTitle('🎯 هدف السنة');

    modal.addComponents(
        new ActionRowBuilder().addComponents(
            new TextInputBuilder()
                .setCustomId('yearly_goal_text')
                .setLabel('هدفك لهذا العام')
                .setStyle(TextInputStyle.Paragraph)
                .setValue(existing[0]?.goal_text || '')
                .setPlaceholder('مثال: أكون نسخة أفضل من نفسي في 2026')
                .setRequired(true)
        )
    );

    await interaction.showModal(modal);
}

// ==========================================
// 🗓️ SHOW MONTHLY GOAL MODAL (حد أقصى 3)
// ==========================================
async function showMonthlyGoalModal(interaction, db) {
    const currentMonth = getCurrentMonthPeriod();
    const existing = db.getGoals(interaction.user.id, 'monthly', currentMonth);

    const modal = new ModalBuilder()
        .setCustomId('modal_monthly_goal')
        .setTitle('🗓️ أهداف الشهر');

    const labels = ['الهدف الأول', 'الهدف الثاني', 'الهدف الثالث'];
    for (let i = 0; i < 3; i++) {
        modal.addComponents(
            new ActionRowBuilder().addComponents(
                new TextInputBuilder()
                    .setCustomId(`monthly_goal_${i + 1}`)
                    .setLabel(labels[i])
                    .setStyle(TextInputStyle.Short)
                    .setValue(existing[i]?.goal_text || '')
                    .setPlaceholder(i === 0 ? 'مثال: قراءة كتاب واحد' : 'اختياري')
                    .setRequired(i === 0)
            )
        );
    }

    await interaction.showModal(modal);
}

// ==========================================
// 📅 SHOW WEEKLY GOAL MODAL (حد أقصى 4)
// ==========================================
async function showWeeklyGoalModal(interaction, db) {
    const currentWeek = getCurrentWeekPeriod();
    const existing = db.getGoals(interaction.user.id, 'weekly', currentWeek);
    const legacy = db.getWeeklyGoal(interaction.user.id);

    const modal = new ModalBuilder()
        .setCustomId('modal_weekly_goal')
        .setTitle('📅 أهداف الأسبوع');

    const labels = ['الهدف الأول', 'الهدف الثاني', 'الهدف الثالث', 'الهدف الرابع'];
    const values = existing.length ? existing.map(g => g.goal_text) : (legacy?.goal_text ? [legacy.goal_text, '', '', ''] : ['', '', '', '']);
    for (let i = 0; i < 4; i++) {
        modal.addComponents(
            new ActionRowBuilder().addComponents(
                new TextInputBuilder()
                    .setCustomId(`weekly_goal_${i + 1}`)
                    .setLabel(labels[i])
                    .setStyle(TextInputStyle.Short)
                    .setValue(values[i] || '')
                    .setPlaceholder(i === 0 ? 'مثال: 5 مراجعات' : 'اختياري')
                    .setRequired(i === 0)
            )
        );
    }

    await interaction.showModal(modal);
}

// ==========================================
// 💾 PROCESS SAVE YEARLY GOAL
// FIX: تمرير 'goals' لـ updateDashboard لإبقاء المستخدم في قسم الأهداف
// ==========================================
async function processSaveYearlyGoal(interaction, db) {
    try {
        await interaction.deferReply({ flags: MessageFlags.Ephemeral });
        const goalText = interaction.fields.getTextInputValue('yearly_goal_text').trim();
        if (!goalText) return interaction.editReply('❌ أدخل هدف السنة.');
        const period = getCurrentYearPeriod();
        db.deleteGoalsByTypePeriod(interaction.user.id, 'yearly', period);
        db.addGoal(interaction.user.id, goalText, 'yearly', period);
        // ✅ FIX: تمرير 'goals' للإبقاء على المستخدم في قسم الأهداف
        await updateDashboard(interaction.channel, interaction.user.id, db, 'goals');
        await interaction.editReply('✅ **تم حفظ هدف السنة!**');
    } catch (e) {
        console.error('❌ processSaveYearlyGoal:', e.message);
        await interaction.editReply('❌ حدث خطأ أثناء الحفظ.').catch(() => {});
    }
}

// ==========================================
// 💾 PROCESS SAVE MONTHLY GOAL
// FIX: تمرير 'goals' لـ updateDashboard لإبقاء المستخدم في قسم الأهداف
// ==========================================
async function processSaveMonthlyGoal(interaction, db) {
    try {
        await interaction.deferReply({ flags: MessageFlags.Ephemeral });
        const goals = [1, 2, 3].map(i => interaction.fields.getTextInputValue(`monthly_goal_${i}`).trim()).filter(Boolean);
        if (!goals.length) return interaction.editReply('❌ أدخل هدفاً واحداً على الأقل.');
        if (goals.length > 3) return interaction.editReply('❌ حد أقصى 3 أهداف للشهر.');
        const period = getCurrentMonthPeriod();
        db.deleteGoalsByTypePeriod(interaction.user.id, 'monthly', period);
        goals.forEach(t => db.addGoal(interaction.user.id, t, 'monthly', period));
        // ✅ FIX: تمرير 'goals' للإبقاء على المستخدم في قسم الأهداف
        await updateDashboard(interaction.channel, interaction.user.id, db, 'goals');
        await interaction.editReply('✅ **تم حفظ أهداف الشهر!**');
    } catch (e) {
        console.error('❌ processSaveMonthlyGoal:', e.message);
        await interaction.editReply('❌ حدث خطأ أثناء الحفظ.').catch(() => {});
    }
}

// ==========================================
// 💾 PROCESS SAVE WEEKLY GOAL
// FIX: تمرير 'goals' لـ updateDashboard لإبقاء المستخدم في قسم الأهداف
// ==========================================
async function processSaveWeeklyGoal(interaction, db) {
    try {
        await interaction.deferReply({ flags: MessageFlags.Ephemeral });
        const goals = [1, 2, 3, 4].map(i => interaction.fields.getTextInputValue(`weekly_goal_${i}`).trim()).filter(Boolean);
        if (!goals.length) return interaction.editReply('❌ أدخل هدفاً واحداً على الأقل.');
        if (goals.length > 4) return interaction.editReply('❌ حد أقصى 4 أهداف للأسبوع.');
        const period = getCurrentWeekPeriod();
        db.deleteGoalsByTypePeriod(interaction.user.id, 'weekly', period);
        goals.forEach(t => db.addGoal(interaction.user.id, t, 'weekly', period));
        // ✅ FIX: تمرير 'goals' للإبقاء على المستخدم في قسم الأهداف
        await updateDashboard(interaction.channel, interaction.user.id, db, 'goals');
        await interaction.editReply('✅ **تم حفظ أهداف الأسبوع!**');
    } catch (e) {
        console.error('❌ processSaveWeeklyGoal:', e.message);
        await interaction.editReply('❌ حدث خطأ أثناء الحفظ.').catch(() => {});
    }
}

module.exports = {
    showEditProfileModal,
    processSaveProfile,
    showYearlyGoalModal,
    showMonthlyGoalModal,
    showWeeklyGoalModal,
    processSaveYearlyGoal,
    processSaveMonthlyGoal,
    processSaveWeeklyGoal
};

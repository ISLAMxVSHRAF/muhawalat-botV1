// ==========================================
// 🔄 SYNC_CHALLENGE — ربط ثريد تحدي بالمدة والنقاط
// ==========================================

const { SlashCommandBuilder, PermissionFlagsBits, ModalBuilder, TextInputBuilder, TextInputStyle, ActionRowBuilder } = require('discord.js');
const CONFIG = require('../config');
const ERR = CONFIG.ADMIN?.unifiedErrorMessage || '❌ حدث خطأ داخلي.';

const _syncChallengeThreadCache = new Map();

const data = new SlashCommandBuilder()
    .setName('sync_challenge')
    .setDescription('ربط ثريد تحدي موجود بالمدة والنقاط')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addStringOption(o => o.setName('thread_id').setDescription('معرف الـ Thread').setRequired(true));

async function execute(interaction, { db, client }) {
    try {
        const threadId = interaction.options.getString('thread_id').trim();
        const thread = await client.channels.fetch(threadId).catch(() => null);
        if (!thread) return interaction.reply({ content: '❌ الـ Thread غير موجود.', ephemeral: true });

        const existing = db.getChallengeByThread(threadId);
        if (existing) return interaction.reply({ content: '❌ التحدي مربوط مسبقاً بهذا الثريد. استخدم تحدي آخر أو عدّل من الداتابيز.', ephemeral: true });

        _syncChallengeThreadCache.set(interaction.user.id, threadId);

        const modal = new ModalBuilder()
            .setCustomId('modal_sync_challenge')
            .setTitle('🏆 ربط التحدي');
        modal.addComponents(
            new ActionRowBuilder().addComponents(
                new TextInputBuilder()
                    .setCustomId('duration_days')
                    .setLabel('المدة بالأيام')
                    .setStyle(TextInputStyle.Short)
                    .setPlaceholder('مثال: 30')
                    .setRequired(true)
            ),
            new ActionRowBuilder().addComponents(
                new TextInputBuilder()
                    .setCustomId('total_points')
                    .setLabel('إجمالي النقاط (وقت التحدي بالدقائق)')
                    .setStyle(TextInputStyle.Short)
                    .setPlaceholder('مثال: 30')
                    .setRequired(true)
            )
        );
        await interaction.showModal(modal);
    } catch (e) {
        console.error('❌ sync_challenge:', e);
        await interaction.reply({ content: ERR, ephemeral: true }).catch(() => {});
    }
}

async function processSyncChallengeModal(interaction, db, client) {
    await interaction.deferReply({ ephemeral: true });
    try {
        const threadId = _syncChallengeThreadCache.get(interaction.user.id);
        _syncChallengeThreadCache.delete(interaction.user.id);
        if (!threadId) return interaction.editReply('❌ انتهت الجلسة. نفّذ /sync_challenge مرة أخرى.');

        const durationDays = parseInt(interaction.fields.getTextInputValue('duration_days').trim(), 10);
        const totalPoints = parseInt(interaction.fields.getTextInputValue('total_points').trim(), 10);
        if (!durationDays || durationDays < 1 || !totalPoints || totalPoints < 1) {
            return interaction.editReply('❌ المدة والنقاط يجب أن يكونا رقماً صحيحاً موجباً.');
        }

        const thread = await client.channels.fetch(threadId).catch(() => null);
        if (!thread) return interaction.editReply('❌ الـ Thread غير موجود.');

        const title = thread.name.replace(/^🏆\s*/, '').trim() || 'تحدي';
        const startDate = new Date();
        const endDate = new Date(startDate);
        endDate.setDate(endDate.getDate() + durationDays);
        const startStr = startDate.toISOString().split('T')[0];
        const endStr = endDate.toISOString().split('T')[0];

        const chartMsg = await thread.send('📊 **ليدربورد التحدي**\n_لم يسجل أحد بعد_').catch(() => null);
        const chartMessageId = chartMsg?.id || null;

        const challengeId = db.createChallenge({
            title,
            description: null,
            image_url: null,
            keyword: null,
            forum_thread_id: threadId,
            chart_message_id: chartMessageId,
            start_date: startStr,
            end_date: endStr,
            created_by: interaction.user.id,
            min_minutes: 0,
            max_minutes: totalPoints,
            challenge_time: totalPoints,
            bonus_minutes: 0
        });

        if (!challengeId) return interaction.editReply('❌ فشل حفظ التحدي.');

        await interaction.editReply(
            `✅ **تم ربط التحدي** (ID: \`${challengeId}\`)\n\n` +
            `📌 **${title}**\n` +
            `📅 ${durationDays} يوم | ⏱️ ${totalPoints} دقيقة\n` +
            `Thread: <#${threadId}>`
        );
    } catch (e) {
        console.error('❌ processSyncChallengeModal:', e);
        await interaction.editReply(ERR).catch(() => {});
    }
}

module.exports = { data, execute, processSyncChallengeModal };

// ==========================================
// 📅 TASKS — Slash Commands
// /task_create, /task_list
// ==========================================

const {
    SlashCommandBuilder,
    PermissionFlagsBits,
    EmbedBuilder,
    ModalBuilder,
    TextInputBuilder,
    TextInputStyle,
    ActionRowBuilder
} = require('discord.js');
const CONFIG = require('../config');

const ERR = CONFIG.ADMIN?.unifiedErrorMessage || '❌ حدث خطأ داخلي.';

const _taskCreateCache = new Map();

const taskCreateData = new SlashCommandBuilder()
    .setName('task_create')
    .setDescription('إنشاء مهمة جديدة (أسبوعية أو شهرية)')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addStringOption(o => o.setName('type').setDescription('نوع المهمة')
        .addChoices(
            { name: 'أسبوعية', value: 'weekly' },
            { name: 'شهرية', value: 'monthly' }
        ).setRequired(true))
    .addIntegerOption(o => o.setName('duration_hours').setDescription('الوقت بالساعات حتى الإغلاق').setRequired(true))
    .addIntegerOption(o => o.setName('week_number').setDescription('رقم الأسبوع في الموسم (للمهام الأسبوعية)').setRequired(false))
    .addAttachmentOption(o => o.setName('image').setDescription('صورة مرفقة (اختياري)').setRequired(false));

async function taskCreateExecute(interaction, { db, client }) {
    try {
        const type = interaction.options.getString('type');
        const duration = interaction.options.getInteger('duration_hours');
        const week = interaction.options.getInteger('week_number') ?? 1;
        const image = interaction.options.getAttachment('image');
        const key = `${interaction.user.id}_task_create`;
        _taskCreateCache.set(key, {
            type,
            duration,
            week,
            imageUrl: image ? image.url : null
        });
        const modal = new ModalBuilder()
            .setCustomId(`modal_task_create_${type}`)
            .setTitle('📌 مهمة جديدة');
        modal.addComponents(
            new ActionRowBuilder().addComponents(
                new TextInputBuilder()
                    .setCustomId('title')
                    .setLabel('العنوان')
                    .setStyle(TextInputStyle.Short)
                    .setPlaceholder('عنوان المهمة')
                    .setRequired(true)
            ),
            new ActionRowBuilder().addComponents(
                new TextInputBuilder()
                    .setCustomId('description')
                    .setLabel('الوصف')
                    .setStyle(TextInputStyle.Paragraph)
                    .setPlaceholder('وصف المهمة')
                    .setRequired(true)
            )
        );
        await interaction.showModal(modal);
    } catch (e) {
        console.error('❌ task_create:', e);
        await interaction.reply({ content: ERR, ephemeral: true }).catch(() => {});
    }
}

async function processTaskCreateModal(interaction, db, client) {
    const id = interaction.customId;
    if (!id.startsWith('modal_task_create_')) return;
    await interaction.deferReply({ ephemeral: true });
    try {
        const key = `${interaction.user.id}_task_create`;
        const cacheData = _taskCreateCache.get(key);
        _taskCreateCache.delete(key);
        if (!cacheData) return interaction.editReply('❌ انتهت الجلسة، يرجى إعادة المحاولة.');

        const title = interaction.fields.getTextInputValue('title').trim();
        const description = interaction.fields.getTextInputValue('description').trim();

        const forumId = cacheData.type === 'weekly'
            ? process.env.WEEKLY_TASKS_FORUM_ID
            : process.env.MONTHLY_TASKS_FORUM_ID;

        if (!forumId) return interaction.editReply('❌ قناة المهام غير محددة في .env');

        const forum = await interaction.guild.channels.fetch(forumId).catch(() => null);
        if (!forum) return interaction.editReply('❌ القناة غير موجودة');

        const season = db.getActiveMonth ? db.getActiveMonth() : null;
        const seasonPrefix = season ? season.start_date : new Date().toISOString().split('T')[0];
        const period = cacheData.type === 'weekly'
            ? `${seasonPrefix}_W${cacheData.week}`
            : `${seasonPrefix}_Monthly`;

        const graceHours = cacheData.duration;
        const lockAt = new Date(Date.now() + graceHours * 60 * 60 * 1000);

        const messageOpts = { content: description };
        if (cacheData.imageUrl) messageOpts.files = [cacheData.imageUrl];

        const thread = await forum.threads.create({
            name: title,
            message: messageOpts
        });

        db.createTask(
            interaction.guild.id, cacheData.type, title, description,
            thread.id, period, graceHours,
            lockAt.toISOString(), interaction.user.id
        );

        const lockTs = Math.floor(lockAt.getTime() / 1000);
        await interaction.editReply(
            `✅ تم إنشاء المهمة.\n` +
            `Thread: <#${thread.id}>\n` +
            `⏰ تقفل: <t:${lockTs}:R>`
        );
    } catch (e) {
        console.error('❌ processTaskCreateModal:', e);
        await interaction.editReply(ERR).catch(() => {});
    }
}

const taskListData = new SlashCommandBuilder()
    .setName('task_list')
    .setDescription('عرض المهام النشطة الحالية')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator);

async function taskListExecute(interaction, { db }) {
    await interaction.deferReply({ ephemeral: true });
    try {
        const weeklyTasks = db.getActiveTasks(interaction.guild.id, 'weekly');
        const monthlyTasks = db.getActiveTasks(interaction.guild.id, 'monthly');
        const all = [...weeklyTasks, ...monthlyTasks];

        if (!all.length) {
            return interaction.editReply('📭 لا توجد مهام نشطة حالياً.');
        }

        const list = all.map(t => {
            const typeEmoji = t.type === 'weekly' ? '📅' : '🗓️';
            const lockTs = Math.floor(new Date(t.lock_at).getTime() / 1000);
            return `${typeEmoji} **#${t.id}** ${t.title}\n   يقفل: <t:${lockTs}:R>`;
        }).join('\n\n');

        const embed = new EmbedBuilder()
            .setColor(CONFIG.COLORS.primary)
            .setTitle('📌 المهام النشطة')
            .setDescription(list)
            .setTimestamp();

        await interaction.editReply({ embeds: [embed] });
    } catch (e) {
        console.error('❌ task_list:', e);
        await interaction.editReply(ERR).catch(() => {});
    }
}

// ==========================================
// /task_link — ربط ثريد موجود بنظام المهام
// ==========================================
const taskLinkData = new SlashCommandBuilder()
    .setName('task_link')
    .setDescription('ربط ثريد موجود مسبقاً بنظام المهام')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addStringOption(o => o.setName('thread_id').setDescription('معرف الثريد').setRequired(true))
    .addStringOption(o => o.setName('type').setDescription('نوع المهمة')
        .addChoices(
            { name: 'أسبوعية', value: 'weekly' },
            { name: 'شهرية', value: 'monthly' }
        ).setRequired(true))
    .addIntegerOption(o => o.setName('duration_hours').setDescription('الوقت بالساعات حتى الإغلاق').setRequired(true))
    .addIntegerOption(o => o.setName('week_number').setDescription('رقم الأسبوع في الموسم (للمهام الأسبوعية)').setRequired(false));

async function taskLinkExecute(interaction, { db }) {
    try {
        await interaction.deferReply({ ephemeral: true });
        const threadId = interaction.options.getString('thread_id').trim();
        const type = interaction.options.getString('type');
        const durationHours = interaction.options.getInteger('duration_hours');
        const weekNumber = interaction.options.getInteger('week_number') ?? 1;

        const thread = await interaction.guild.channels.fetch(threadId).catch(() => null);
        if (!thread) return interaction.editReply('❌ القناة أو الثريد غير موجود.');

        const season = db.getActiveMonth ? db.getActiveMonth() : null;
        const seasonPrefix = season ? season.start_date : new Date().toISOString().split('T')[0];
        const period = type === 'weekly'
            ? `${seasonPrefix}_W${weekNumber}`
            : `${seasonPrefix}_Monthly`;

        const lockAt = new Date(Date.now() + durationHours * 60 * 60 * 1000);

        db.createTask(
            interaction.guild.id, type, thread.name, 'Linked existing thread',
            thread.id, period, durationHours, lockAt.toISOString(), interaction.user.id
        );

        const lockTs = Math.floor(lockAt.getTime() / 1000);
        await interaction.editReply(
            `✅ تم ربط المهمة ( **${thread.name}** ) وسيتم قفلها <t:${lockTs}:R>\n<#${thread.id}>`
        );
    } catch (e) {
        console.error('❌ task_link:', e);
        await interaction.editReply(ERR).catch(() => {});
    }
}

const commands = [
    { data: taskCreateData, execute: taskCreateExecute },
    { data: taskListData, execute: taskListExecute },
    { data: taskLinkData, execute: taskLinkExecute },
];

module.exports = { commands, processTaskCreateModal };

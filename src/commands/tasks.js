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

const _taskCreateImageCache = new Map();

const taskCreateData = new SlashCommandBuilder()
    .setName('task_create')
    .setDescription('إنشاء مهمة جديدة (أسبوعية أو شهرية)')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addStringOption(o => o.setName('type').setDescription('نوع المهمة')
        .addChoices(
            { name: 'أسبوعية', value: 'weekly' },
            { name: 'شهرية', value: 'monthly' }
        ).setRequired(true))
    .addAttachmentOption(o => o.setName('image').setDescription('صورة مرفقة (اختياري)').setRequired(false));

async function taskCreateExecute(interaction, { db, client }) {
    try {
        const type = interaction.options.getString('type');
        const image = interaction.options.getAttachment('image');
        const key = `${interaction.user.id}_task_create`;
        if (image) _taskCreateImageCache.set(key, image.url);
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
        const type = id.replace('modal_task_create_', '');
        const key = `${interaction.user.id}_task_create`;
        const imageUrl = _taskCreateImageCache.get(key) || null;
        _taskCreateImageCache.delete(key);
        const title = interaction.fields.getTextInputValue('title').trim();
        const description = interaction.fields.getTextInputValue('description').trim();

        const forumId = type === 'weekly'
            ? process.env.WEEKLY_TASKS_FORUM_ID
            : process.env.MONTHLY_TASKS_FORUM_ID;

        if (!forumId) return interaction.editReply('❌ قناة المهام غير محددة في .env');

        const forum = await interaction.guild.channels.fetch(forumId).catch(() => null);
        if (!forum) return interaction.editReply('❌ القناة غير موجودة');

        const graceHours = type === 'weekly' ? 48 : 120;
        const now = new Date();
        const lockAt = new Date(now.getTime() + graceHours * 60 * 60 * 1000);

        let period;
        if (type === 'weekly') {
            const weekNum = Math.ceil(now.getDate() / 7);
            period = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-W${weekNum}`;
        } else {
            period = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
        }

        const typeAr = type === 'weekly' ? 'الأسبوعية' : 'الشهرية';

        const content = [
            `# 📌 المهمة ${typeAr}`,
            '',
            `**${title}**`,
            '',
            description,
            '',
            `⏰ آخر موعد للتسجيل: <t:${Math.floor(lockAt.getTime() / 1000)}:F>`,
            '',
            '✅ **عشان تسجل إتمامك، اكتب رسالة فوق 10 كلمات**'
        ].join('\n');

        const messageOpts = { content };
        if (imageUrl) messageOpts.files = [imageUrl];

        const thread = await forum.threads.create({
            name: `📌 المهمة ${typeAr} | ${title}`,
            message: messageOpts
        });

        db.createTask(
            interaction.guild.id, type, title, description,
            thread.id, period, graceHours,
            lockAt.toISOString(), interaction.user.id
        );

        await interaction.editReply(
            `✅ تم إنشاء المهمة ${typeAr}\n` +
            `📌 **${title}**\n` +
            `⏰ تقفل: <t:${Math.floor(lockAt.getTime() / 1000)}:R>\n` +
            `Thread: <#${thread.id}>`
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

const commands = [
    { data: taskCreateData, execute: taskCreateExecute },
    { data: taskListData, execute: taskListExecute },
];

module.exports = { commands, processTaskCreateModal };

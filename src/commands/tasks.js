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

// ==========================================
// 🔄 sync_tasks — Thread + نوع + ترتيب
// (logic moved from sync_tasks.js)
// ==========================================

const { updateDashboard } = require('../utils/dashboard');

async function syncTasksExecute(interaction, { db, client }) {
    try {
        await interaction.deferReply({ ephemeral: true });

        const threadId = interaction.options.getString('thread_id').trim();
        const type = interaction.options.getString('type');
        const orderNum = interaction.options.getInteger('number');
        const order = isNaN(orderNum) || orderNum < 1 ? 1 : orderNum;

        const thread = await client.channels.fetch(threadId).catch(() => null);
        if (!thread) {
            return interaction.editReply(
                '❌ الـ Thread غير موجود. تأكد من الـ ID.'
            );
        }

        const now = new Date();
        const year = now.getFullYear();
        const month = String(now.getMonth() + 1).padStart(2, '0');
        const period =
            type === 'weekly' ? `${year}-${month}-W${order}` : `${year}-${month}`;
        const graceHours = type === 'weekly' ? 48 : 120;
        const lockAt = new Date(now.getTime() + graceHours * 60 * 60 * 1000);
        const title =
            (thread.name || 'مهمة')
                .replace(/^📌\s*المهمة\s*(أسبوعية|شهرية)\s*\|\s*/i, '')
                .trim() || 'مهمة';

        let task = db.getTaskByThread(threadId);
        if (task) {
            db.updateTask(task.id, {
                type,
                task_order: order,
                period,
                lock_at: lockAt.toISOString()
            });
            task = db.getTaskByThread(threadId);
        } else {
            const starter = await thread.fetchStarterMessage().catch(() => null);
            const description = (starter?.content || '').slice(0, 500) || '';
            db.createTask(
                interaction.guild.id,
                type,
                title,
                description,
                threadId,
                period,
                graceHours,
                lockAt.toISOString(),
                interaction.user.id,
                order
            );
            task = db.getTaskByThread(threadId);
        }

        if (!task) return interaction.editReply('❌ فشل حفظ المهمة.');

        let allMessages = [];
        let lastId = null;
        // eslint-disable-next-line no-constant-condition
        while (true) {
            const opts = { limit: 100 };
            if (lastId) opts.before = lastId;
            const batch = await thread.messages.fetch(opts);
            if (!batch.size) break;
            allMessages.push(...batch.values());
            lastId = batch.last()?.id;
            if (batch.size < 100) break;
        }

        const starter = await thread.fetchStarterMessage().catch(() => null);
        if (starter) {
            allMessages = allMessages.filter(m => m.id !== starter.id);
        }

        const valid = allMessages.filter(m => {
            if (m.author.bot) return false;
            const words = m.content
                .trim()
                .split(/\s+/)
                .filter(w => w.length > 0).length;
            const hasAttachment = m.attachments && m.attachments.size > 0;
            return words >= 10 || hasAttachment;
        });

        const userMap = new Map();
        for (const msg of valid) {
            const uid = msg.author.id;
            const words = msg.content
                .trim()
                .split(/\s+/)
                .filter(w => w.length > 0).length;
            const hasAttachment = msg.attachments && msg.attachments.size > 0;
            const score = words + (hasAttachment ? 1000 : 0);
            const existing = userMap.get(uid);
            if (!existing || score > existing.score) {
                userMap.set(uid, { msg, score });
            }
        }

        let registered = 0;
        let skipped = 0;
        for (const [userId, { msg }] of userMap) {
            if (!db.getUser(userId)) {
                const member = await interaction.guild.members
                    .fetch(userId)
                    .catch(() => null);
                const name =
                    member?.nickname ||
                    member?.user?.globalName ||
                    member?.user?.username ||
                    userId;
                db.createUser(userId, name, '', 'male', null, null);
            }
            if (db.getUserTaskCompletions(task.id, userId) > 0) {
                skipped++;
                continue;
            }
            let content = (msg.content || '').trim();
            if (msg.attachments && msg.attachments.size > 0) {
                const url = msg.attachments.first().url;
                content = content ? `${content}\n${url}` : url;
            }
            db.completeTask(task.id, userId, msg.id, content);
            registered++;
            const user = db.getUser(userId);
            if (user?.thread_id) {
                const userThread = await client.channels
                    .fetch(user.thread_id)
                    .catch(() => null);
                if (userThread) {
                    await updateDashboard(userThread, userId, db, 'home').catch(
                        () => {}
                    );
                }
            }
        }

        const typeAr = type === 'weekly' ? 'الأسبوعية' : 'الشهرية';
        const embed = new EmbedBuilder()
            .setColor(CONFIG.COLORS.success)
            .setTitle(`🔄 Sync المهمة ${typeAr}`)
            .setDescription(`**${task.title}**`)
            .addFields(
                {
                    name: '✅ تم التسجيل',
                    value: `${registered} عضو`,
                    inline: true
                },
                {
                    name: '⏭️ موجودين',
                    value: `${skipped} عضو`,
                    inline: true
                },
                {
                    name: '📊 إجمالي',
                    value: `${userMap.size} عضو`,
                    inline: true
                }
            )
            .setTimestamp();

        await interaction.editReply({ embeds: [embed] });
    } catch (e) {
        console.error('❌ sync_tasks:', e);
        await interaction.editReply(ERR).catch(() => {});
    }
}

// ==========================================
// Central handler for /admin tasks group
// ==========================================

async function handleTasks(interaction, deps) {
    const sub = interaction.options.getSubcommand();
    switch (sub) {
        case 'task_create':
            return taskCreateExecute(interaction, deps);
        case 'task_list':
            return taskListExecute(interaction, deps);
        case 'task_link':
            return taskLinkExecute(interaction, deps);
        case 'sync_tasks':
            return syncTasksExecute(interaction, deps);
        default:
            throw new Error(`Unknown tasks subcommand: ${sub}`);
    }
}

module.exports = { handleTasks, processTaskCreateModal };


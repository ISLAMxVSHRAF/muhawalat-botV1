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
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    StringSelectMenuBuilder
} = require('discord.js');
const CONFIG = require('../config');

const ERR = CONFIG.ADMIN?.unifiedErrorMessage || '❌ حدث خطأ داخلي.';

function parseDateTime(dateStr, timeStr) {
    const dateMatch = dateStr.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/);
    const timeMatch = timeStr.match(/^(\d{1,2}):(\d{2})$/);
    
    if (!dateMatch || !timeMatch) return null;
    
    const day = parseInt(dateMatch[1], 10);
    const month = parseInt(dateMatch[2], 10) - 1;
    const year = parseInt(dateMatch[3], 10);
    const hour = parseInt(timeMatch[1], 10);
    const minute = parseInt(timeMatch[2], 10);
    
    const d = new Date(year, month, day, hour, minute);
    return isNaN(d.getTime()) ? null : d;
}

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
        const endDate = interaction.options.getString('end_date');
        const endTime = interaction.options.getString('end_time');
        const week = interaction.options.getInteger('week_number') ?? 1;
        const image = interaction.options.getAttachment('image');
        const key = `${interaction.user.id}_task_create`;
        _taskCreateCache.set(key, {
            type,
            endDate,
            endTime,
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

        // Parse end date and time
        const lockAt = parseDateTime(cacheData.endDate, cacheData.endTime);
        if (!lockAt) {
            return interaction.editReply('❌ صيغة التاريخ أو الوقت غير صحيحة. استخدم: DD-MM-YYYY و HH:mm');
        }

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

        const graceHours = Math.max(1, Math.round((lockAt.getTime() - Date.now()) / 3600000));

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
        const guildId = interaction.guild.id;
        const weeklyTasks = db.getActiveTasks(guildId, 'weekly') || [];
        const monthlyTasks = db.getActiveTasks(guildId, 'monthly') || [];
        const activeTasks = [...weeklyTasks, ...monthlyTasks];

        // Get last 5 locked tasks
        let lockedTasks = [];
        try {
            const s = db.db.prepare(
                `SELECT * FROM tasks WHERE guild_id = ? AND is_locked = 1 ORDER BY lock_at DESC LIMIT 5` 
            );
            s.bind([guildId]);
            while (s.step()) lockedTasks.push(s.getAsObject());
            s.free();
        } catch (_) {}

        const formatTask = (t, locked = false) => {
            const typeEmoji = t.type === 'weekly' ? '📅' : '🗓️';
            const lockTs = Math.floor(new Date(t.lock_at).getTime() / 1000);
            const status = locked ? '🔒' : '🟢';
            return `${status} ${typeEmoji} **#${t.id}** ${t.title}\n   ${locked ? 'أُقفلت' : 'يقفل'}: <t:${lockTs}:R>`;
        };

        let desc = '';
        if (activeTasks.length) {
            desc += '**🟢 نشطة:**\n' + activeTasks.map(t => formatTask(t, false)).join('\n\n');
        } else {
            desc += '� لا توجد مهام نشطة حالياً.';
        }
        if (lockedTasks.length) {
            desc += '\n\n**🔒 آخر مهام مقفولة:**\n' + lockedTasks.map(t => formatTask(t, true)).join('\n\n');
        }

        const embed = new EmbedBuilder()
            .setColor(CONFIG.COLORS.primary)
            .setTitle('📌 قائمة المهام')
            .setDescription(desc)
            .setFooter({ text: 'استخدم task_id في أوامر task_edit_deadline و task_delete' })
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
        const endDate = interaction.options.getString('end_date');
        const endTime = interaction.options.getString('end_time');
        const weekNumber = interaction.options.getInteger('week_number') ?? 1;

        // Parse end date and time
        const lockAt = parseDateTime(endDate, endTime);
        if (!lockAt) {
            return interaction.editReply('❌ صيغة التاريخ أو الوقت غير صحيحة. استخدم: DD-MM-YYYY و HH:mm');
        }

        const thread = await interaction.guild.channels.fetch(threadId).catch(() => null);
        if (!thread) return interaction.editReply('❌ القناة أو الثريد غير موجود.');

        const season = db.getActiveMonth ? db.getActiveMonth() : null;
        const seasonPrefix = season ? season.start_date : new Date().toISOString().split('T')[0];
        const period = type === 'weekly'
            ? `${seasonPrefix}_W${weekNumber}`
            : `${seasonPrefix}_Monthly`;

        const graceHours = Math.max(1, Math.round((lockAt.getTime() - Date.now()) / 3600000));

        db.createTask(
            interaction.guild.id, type, thread.name, 'Linked existing thread',
            thread.id, period, graceHours, lockAt.toISOString(), interaction.user.id
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

        // Use manual deadline if provided, otherwise fallback to auto
        const endDateOpt = interaction.options.getString('end_date');
        const endTimeOpt = interaction.options.getString('end_time') || '23:59';
        let lockAt;
        if (endDateOpt) {
            lockAt = parseDateTime(endDateOpt, endTimeOpt);
            if (!lockAt) {
                return interaction.editReply('❌ صيغة التاريخ غير صحيحة. استخدم DD-MM-YYYY و HH:mm');
            }
        } else {
            const graceHours = type === 'weekly' ? 48 : 120;
            lockAt = new Date(now.getTime() + graceHours * 60 * 60 * 1000);
        }
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
            const content = (msg.content || '').trim();
            const attachmentUrl = msg.attachments && msg.attachments.size > 0
                ? msg.attachments.first().url
                : null;
            db.completeTask(task.id, userId, msg.id, content, attachmentUrl);
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

async function taskEditDeadlineExecute(interaction, { db }) {
    await interaction.deferReply({ ephemeral: true });
    try {
        const taskId = interaction.options.getInteger('task_id');
        const endDate = interaction.options.getString('end_date');
        const endTime = interaction.options.getString('end_time');

        // Parse end date and time
        const lockAt = parseDateTime(endDate, endTime);
        if (!lockAt) {
            return interaction.editReply('❌ صيغة التاريخ أو الوقت غير صحيحة. استخدم: DD-MM-YYYY و HH:mm');
        }

        // Check if task exists (optional but good practice)
        const task = db.getTask(taskId);
        if (!task) {
            return interaction.editReply(`❌ المهمة رقم ${taskId} غير موجودة. استخدم /admin tasks task_list لمشاهدة الأرقام الصحيحة.`);
        }

        // Update the task deadline
        db.updateTask(taskId, { lock_at: lockAt.toISOString() });

        const lockTs = Math.floor(lockAt.getTime() / 1000);
        await interaction.editReply('✅ تم تعديل موعد انتهاء المهمة بنجاح، ستقفل <t:' + lockTs + ':R>');
    } catch (e) {
        console.error('❌ task_edit_deadline:', e);
        await interaction.editReply(ERR).catch(() => {});
    }
}

async function taskDeleteExecute(interaction, { db }) {
    try {
        await interaction.deferReply({ ephemeral: true });
        const taskId = interaction.options.getInteger('task_id');
        const confirmed = interaction.options.getBoolean('confirm');
        const task = db.getTask(taskId);
        if (!task) return interaction.editReply('❌ المهمة غير موجودة. استخدم task_list لمعرفة الـ IDs.');
        if (!confirmed) {
            const lockTs = Math.floor(new Date(task.lock_at).getTime() / 1000);
            const typeAr = task.type === 'weekly' ? 'أسبوعية' : 'شهرية';
            return interaction.editReply(
                `⚠️ **تأكيد الحذف:**\n**${task.title}** (${typeAr}) — يقفل <t:${lockTs}:R>\n\n` +
                `لتأكيد الحذف: \`/admin tasks task_delete task_id:${taskId} confirm:true\`\n` +
                `⚠️ كل تسجيلات الأعضاء فيها ستُحذف.` 
            );
        }
        db.safeBackup('before-delete-task');
        db.deleteTask(taskId);
        await interaction.editReply(`✅ تم حذف المهمة **${task.title}** بنجاح.`);
    } catch (e) {
        console.error('❌ task_delete:', e);
        await interaction.editReply(ERR).catch(() => {});
    }
}

// ==========================================
// Central handler for /admin tasks group
// ==========================================

async function tasksOverviewExecute(interaction, { db }) {
    await interaction.deferReply({ ephemeral: true });
    try {
        const guildId = interaction.guild.id;
        const weeklyTasks = db.getActiveTasks(guildId, 'weekly');
        const monthlyTasks = db.getActiveTasks(guildId, 'monthly');
        const all = [...weeklyTasks, ...monthlyTasks];

        if (!all.length) {
            return interaction.editReply('📭 لا توجد مهام نشطة حالياً.');
        }

        // Get active members count
        let totalMembers = db.getAllUsers().length;
        if (process.env.MEMBER_ROLE_ID) {
            try {
                let guildMembers = interaction.guild.members.cache;
                if (guildMembers.size < 2) {
                    guildMembers = await interaction.guild.members.fetch({ time: 10000 }).catch(() => interaction.guild.members.cache);
                }
                totalMembers = db.getAllUsers().filter(u => {
                    const m = guildMembers.get(u.user_id);
                    return m && m.roles.cache.has(process.env.MEMBER_ROLE_ID);
                }).length;
            } catch (_) {}
        }

        const formatTask = (t) => {
            const typeEmoji = t.type === 'weekly' ? '📅' : '🗓️';
            const lockTs = Math.floor(new Date(t.lock_at).getTime() / 1000);
            const count = db.getTaskCompletionCount ? db.getTaskCompletionCount(t.id) : 0;
            const pct = totalMembers > 0 ? Math.round((count / totalMembers) * 100) : 0;
            const bar = pct >= 70 ? '🟢' : pct >= 40 ? '🟡' : '🔴';
            return `${typeEmoji} **${t.title}**\n   ${bar} ${count}/${totalMembers} (${pct}%) | يقفل: <t:${lockTs}:R>`;
        };

        const weeklyVal = weeklyTasks.length > 0
            ? weeklyTasks.map(formatTask).join('\n\n')
            : '—';
        const monthlyVal = monthlyTasks.length > 0
            ? monthlyTasks.map(formatTask).join('\n\n')
            : '—';

        const embed = new EmbedBuilder()
            .setColor(CONFIG.COLORS.primary)
            .setTitle('🎯 نظرة شاملة على المهام')
            .addFields(
                { name: `📅 مهام أسبوعية (${weeklyTasks.length})`, value: weeklyVal, inline: false },
                { name: `🗓️ مهام شهرية (${monthlyTasks.length})`, value: monthlyVal, inline: false }
            )
            .setFooter({ text: `إجمالي الأعضاء النشطين: ${totalMembers}` })
            .setTimestamp();

        await interaction.editReply({ embeds: [embed] });
    } catch (e) {
        console.error('❌ tasks_overview:', e);
        await interaction.editReply(ERR).catch(() => {});
    }
}

async function handleTasks(interaction, deps) {
    const sub = interaction.options.getSubcommand();
    switch (sub) {
        case 'task_create':
            return taskCreateExecute(interaction, deps);
        case 'task_list':
            return taskListExecute(interaction, deps);
        case 'tasks_overview':
            return tasksOverviewExecute(interaction, deps);
        case 'task_link':
            return taskLinkExecute(interaction, deps);
        case 'task_edit_deadline':
            return taskEditDeadlineExecute(interaction, deps);
        case 'task_edit':
            return taskEditExecute(interaction, deps);
        case 'task_delete':
            return taskDeleteExecute(interaction, deps);
        case 'sync_tasks':
            return syncTasksExecute(interaction, deps);
        default:
            throw new Error(`Unknown tasks subcommand: ${sub}`);
    }
}

async function taskEditExecute(interaction, { db }) {
    try {
        await interaction.deferReply({ ephemeral: true });
        const taskId = interaction.options.getInteger('task_id');
        const task = db.getTask ? db.getTask(taskId) : null;

        if (!task) {
            return interaction.editReply(`❌ المهمة رقم ${taskId} غير موجودة.`);
        }

        const lockTs = Math.floor(new Date(task.lock_at).getTime() / 1000);
        const embed = new EmbedBuilder()
            .setColor(0xF9C22E)
            .setTitle(`✏️ تعديل المهمة #${task.id}`)
            .setDescription(
                `**العنوان:** ${task.title}\n` +
                `**النوع:** ${task.type === 'weekly' ? 'أسبوعية' : 'شهرية'}\n` +
                `**الترتيب:** ${task.task_order}\n` +
                `**الديدلاين:** <t:${lockTs}:F>` 
            );

        const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setCustomId(`btn_task_edit_info_${taskId}`)
                .setLabel('✏️ تعديل المعلومات')
                .setStyle(ButtonStyle.Primary),
            new ButtonBuilder()
                .setCustomId(`btn_task_edit_dl_${taskId}`)
                .setLabel('📅 تعديل الديدلاين')
                .setStyle(ButtonStyle.Secondary),
            new ButtonBuilder()
                .setCustomId(`btn_task_delete_${taskId}`)
                .setLabel('🗑️ حذف المهمة')
                .setStyle(ButtonStyle.Danger)
        );

        await interaction.editReply({ embeds: [embed], components: [row] });
    } catch (e) {
        console.error('❌ taskEditExecute:', e);
        await interaction.editReply(ERR).catch(() => {});
    }
}

module.exports = {
    taskListExecute,
    taskCreateExecute,
    taskLinkExecute,
    tasksOverviewExecute,
    taskEditDeadlineExecute,
    taskDeleteExecute,
    syncTasksExecute,
    taskEditExecute,
    handleTasks,
};

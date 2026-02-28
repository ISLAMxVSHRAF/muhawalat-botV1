// ==========================================
// 🔄 SYNC TASKS — Thread ID ثم Modal (نوع + ترتيب)
// ==========================================

const { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder, ModalBuilder, TextInputBuilder, TextInputStyle, ActionRowBuilder } = require('discord.js');
const CONFIG = require('../config');
const { updateDashboard } = require('../utils/dashboard');
const ERR = CONFIG.ADMIN?.unifiedErrorMessage || '❌ حدث خطأ داخلي.';

const _syncTasksThreadCache = new Map();

const data = new SlashCommandBuilder()
    .setName('sync_tasks')
    .setDescription('مزامنة مهمة من Thread (أدخل الـ Thread ثم اختر النوع والترتيب)')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addStringOption(o => o.setName('thread_id').setDescription('ID بتاع Thread المهمة').setRequired(true));

async function execute(interaction, { db, client }) {
    try {
        const threadId = interaction.options.getString('thread_id').trim();
        const thread = await client.channels.fetch(threadId).catch(() => null);
        if (!thread) return interaction.reply({ content: '❌ مش قادر أجيب الـ Thread — تأكد من الـ ID', ephemeral: true });

        _syncTasksThreadCache.set(interaction.user.id, threadId);

        const modal = new ModalBuilder()
            .setCustomId('modal_sync_tasks')
            .setTitle('📌 نوع المهمة والترتيب');
        modal.addComponents(
            new ActionRowBuilder().addComponents(
                new TextInputBuilder()
                    .setCustomId('type')
                    .setLabel('أسبوعية أو شهرية (weekly / monthly)')
                    .setStyle(TextInputStyle.Short)
                    .setPlaceholder('weekly أو monthly')
                    .setRequired(true)
            ),
            new ActionRowBuilder().addComponents(
                new TextInputBuilder()
                    .setCustomId('order')
                    .setLabel('الرقم / الترتيب (مثال: 1 أو 2)')
                    .setStyle(TextInputStyle.Short)
                    .setPlaceholder('1')
                    .setRequired(true)
            )
        );
        await interaction.showModal(modal);
    } catch (e) {
        console.error('❌ sync_tasks:', e);
        await interaction.reply({ content: ERR, ephemeral: true }).catch(() => {});
    }
}

async function processSyncTasksModal(interaction, db, client) {
    await interaction.deferReply({ ephemeral: true });
    try {
        const threadId = _syncTasksThreadCache.get(interaction.user.id);
        _syncTasksThreadCache.delete(interaction.user.id);
        if (!threadId) return interaction.editReply('❌ انتهت الجلسة. نفّذ /sync_tasks مرة أخرى.');

        let type = (interaction.fields.getTextInputValue('type') || '').trim().toLowerCase();
        if (type === 'أسبوعية' || type === 'اسبوعية') type = 'weekly';
        if (type === 'شهرية') type = 'monthly';
        if (type !== 'weekly' && type !== 'monthly') {
            return interaction.editReply('❌ النوع لازم يكون weekly أو monthly');
        }

        const orderNum = parseInt(interaction.fields.getTextInputValue('order').trim(), 10);
        const order = isNaN(orderNum) ? 1 : Math.max(1, orderNum);

        const thread = await client.channels.fetch(threadId).catch(() => null);
        if (!thread) return interaction.editReply('❌ الـ Thread غير موجود.');

        const now = new Date();
        const year = now.getFullYear();
        const month = String(now.getMonth() + 1).padStart(2, '0');
        const period = type === 'weekly' ? `${year}-${month}-W${order}` : `${year}-${month}`;
        const graceHours = type === 'weekly' ? 48 : 120;
        const lockAt = new Date(now.getTime() + graceHours * 60 * 60 * 1000);
        const title = (thread.name || 'مهمة').replace(/^📌\s*المهمة\s*(أسبوعية|شهرية)\s*\|\s*/i, '').trim() || 'مهمة';

        let task = db.getTaskByThread(threadId);
        if (task) {
            db.updateTask(task.id, { type, task_order: order, period, lock_at: lockAt.toISOString() });
            task = db.getTaskByThread(threadId);
        } else {
            const starter = await thread.fetchStarterMessage().catch(() => null);
            const description = (starter?.content || '').slice(0, 500) || '';
            db.createTask(
                interaction.guild.id, type, title, description,
                threadId, period, graceHours, lockAt.toISOString(),
                interaction.user.id, order
            );
            task = db.getTaskByThread(threadId);
        }

        if (!task) return interaction.editReply('❌ فشل حفظ المهمة.');

        // مزامنة الإتمام من الرسائل
        let allMessages = [];
        let lastId = null;
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
        if (starter) allMessages = allMessages.filter(m => m.id !== starter.id);

        const valid = allMessages.filter(m =>
            !m.author.bot &&
            m.content.trim().split(/\s+/).filter(w => w.length > 0).length >= 10
        );

        const userMap = new Map();
        for (const msg of valid) {
            const uid = msg.author.id;
            const words = msg.content.trim().split(/\s+/).length;
            const existing = userMap.get(uid);
            if (!existing || words > existing.words) userMap.set(uid, { msg, words });
        }

        let registered = 0, skipped = 0;
        for (const [userId, { msg }] of userMap) {
            if (!db.getUser(userId)) {
                const member = await interaction.guild.members.fetch(userId).catch(() => null);
                const name = member?.nickname || member?.user?.globalName || member?.user?.username || userId;
                db.createUser(userId, name, '', 'male', null, null);
            }
            if (db.getUserTaskCompletions(task.id, userId) > 0) { skipped++; continue; }
            db.completeTask(task.id, userId, msg.id, msg.content);
            registered++;
            const user = db.getUser(userId);
            if (user?.thread_id) {
                const userThread = await client.channels.fetch(user.thread_id).catch(() => null);
                if (userThread) await updateDashboard(userThread, userId, db, 'home').catch(() => {});
            }
        }

        const typeAr = type === 'weekly' ? 'الأسبوعية' : 'الشهرية';
        const embed = new EmbedBuilder()
            .setColor(CONFIG.COLORS.success)
            .setTitle(`🔄 Sync المهمة ${typeAr}`)
            .setDescription(`**${task.title}**`)
            .addFields(
                { name: '✅ تم التسجيل', value: `${registered} عضو`, inline: true },
                { name: '⏭️ موجودين', value: `${skipped} عضو`, inline: true },
                { name: '📊 إجمالي', value: `${userMap.size} عضو`, inline: true }
            )
            .setTimestamp();

        await interaction.editReply({ embeds: [embed] });
    } catch (e) {
        console.error('❌ processSyncTasksModal:', e);
        await interaction.editReply(ERR).catch(() => {});
    }
}

module.exports = { data, execute, processSyncTasksModal };

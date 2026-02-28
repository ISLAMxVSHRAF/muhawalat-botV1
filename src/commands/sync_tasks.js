// ==========================================
// 🔄 SYNC TASKS — Thread + نوع + ترتيب (خيارات مباشرة)
// ==========================================

const { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder } = require('discord.js');
const CONFIG = require('../config');
const { updateDashboard } = require('../utils/dashboard');
const ERR = CONFIG.ADMIN?.unifiedErrorMessage || '❌ حدث خطأ داخلي.';

const data = new SlashCommandBuilder()
    .setName('sync_tasks')
    .setDescription('مزامنة مهمة من Thread (معرف الثريد + النوع + الرقم)')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addStringOption(o => o.setName('thread_id').setDescription('ID ثريد المهمة').setRequired(true))
    .addStringOption(o =>
        o.setName('type')
            .setDescription('نوع المهمة')
            .setRequired(true)
            .addChoices(
                { name: 'أسبوعية', value: 'weekly' },
                { name: 'شهرية', value: 'monthly' }
            )
    )
    .addIntegerOption(o => o.setName('number').setDescription('رقم أو ترتيب المهمة').setRequired(true));

async function execute(interaction, { db, client }) {
    try {
        await interaction.deferReply({ ephemeral: true });

        const threadId = interaction.options.getString('thread_id').trim();
        const type = interaction.options.getString('type');
        const orderNum = interaction.options.getInteger('number');
        const order = isNaN(orderNum) || orderNum < 1 ? 1 : orderNum;

        const thread = await client.channels.fetch(threadId).catch(() => null);
        if (!thread) return interaction.editReply('❌ الـ Thread غير موجود. تأكد من الـ ID.');

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

        const valid = allMessages.filter(m => {
            if (m.author.bot) return false;
            const words = m.content.trim().split(/\s+/).filter(w => w.length > 0).length;
            const hasAttachment = m.attachments && m.attachments.size > 0;
            return words >= 10 || hasAttachment;
        });

        const userMap = new Map();
        for (const msg of valid) {
            const uid = msg.author.id;
            const words = msg.content.trim().split(/\s+/).filter(w => w.length > 0).length;
            const hasAttachment = msg.attachments && msg.attachments.size > 0;
            const score = words + (hasAttachment ? 1000 : 0);
            const existing = userMap.get(uid);
            if (!existing || score > existing.score) userMap.set(uid, { msg, score });
        }

        let registered = 0, skipped = 0;
        for (const [userId, { msg }] of userMap) {
            if (!db.getUser(userId)) {
                const member = await interaction.guild.members.fetch(userId).catch(() => null);
                const name = member?.nickname || member?.user?.globalName || member?.user?.username || userId;
                db.createUser(userId, name, '', 'male', null, null);
            }
            if (db.getUserTaskCompletions(task.id, userId) > 0) { skipped++; continue; }
            let content = (msg.content || '').trim();
            if (msg.attachments && msg.attachments.size > 0) {
                const url = msg.attachments.first().url;
                content = content ? `${content}\n${url}` : url;
            }
            db.completeTask(task.id, userId, msg.id, content);
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
        console.error('❌ sync_tasks:', e);
        await interaction.editReply(ERR).catch(() => {});
    }
}

module.exports = { data, execute };

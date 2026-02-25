// ==========================================
// 🔄 SYNC TASKS — Slash Command
// /sync_tasks type: thread_id:
// ==========================================

const { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder } = require('discord.js');
const CONFIG = require('../config');
// ✅ FIX: نقل require لأعلى الملف خارج الدوال لتجنب الاستدعاء المتكرر داخل الـ Loop
const { updateDashboard } = require('../utils/dashboard');
const ERR = CONFIG.ADMIN?.unifiedErrorMessage || '❌ حدث خطأ داخلي.';

const data = new SlashCommandBuilder()
    .setName('sync_tasks')
    .setDescription('مزامنة إتمام مهمة من Thread موجود')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addStringOption(o => o.setName('type')
        .setDescription('نوع المهمة')
        .addChoices(
            { name: 'أسبوعية', value: 'weekly' },
            { name: 'شهرية',  value: 'monthly' }
        ).setRequired(true))
    .addStringOption(o => o.setName('thread_id')
        .setDescription('ID بتاع Thread المهمة')
        .setRequired(true));

async function execute(interaction, { db, client }) {
    await interaction.deferReply({ ephemeral: true });
    try {
        const type     = interaction.options.getString('type');
        const threadId = interaction.options.getString('thread_id').trim();

        const thread = await client.channels.fetch(threadId).catch(() => null);
        if (!thread) return interaction.editReply('❌ مش قادر أجيب الـ Thread — تأكد من الـ ID');

        const task = db.getTaskByThread(threadId);
        if (!task) return interaction.editReply('❌ مفيش مهمة مرتبطة بالـ Thread ده في الداتابيز');

        // جيب كل الرسائل
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

        // شيل starter message
        const starter = await thread.fetchStarterMessage().catch(() => null);
        if (starter) allMessages = allMessages.filter(m => m.id !== starter.id);

        // فلتر — رسائل بشر فوق 10 كلمات
        const valid = allMessages.filter(m =>
            !m.author.bot &&
            m.content.trim().split(/\s+/).filter(w => w.length > 0).length >= 10
        );

        // لكل عضو — رسالة واحدة بس (الأطول)
        const userMap = new Map();
        for (const msg of valid) {
            const uid    = msg.author.id;
            const words  = msg.content.trim().split(/\s+/).length;
            const existing = userMap.get(uid);
            if (!existing || words > existing.words) {
                userMap.set(uid, { msg, words });
            }
        }

        let registered = 0;
        let skipped    = 0;

        for (const [userId, { msg }] of userMap) {
            // تسجيل أو تحديث اسم العضو
            if (!db.getUser(userId)) {
                const member = await interaction.guild.members.fetch(userId).catch(() => null);
                const name   = member?.nickname || member?.user?.globalName || member?.user?.username || userId;
                db.createUser(userId, name, '', 'male', null, null);
            }

            // سجّل إتمام المهمة لو مش موجود
            const alreadyDone = db.getUserTaskCompletions(task.id, userId) > 0;
            if (!alreadyDone) {
                db.completeTask(task.id, userId, msg.id, msg.content);
                registered++;

                // تحديث داشبورد العضو
                // ✅ FIX: updateDashboard مُعرّفة في أعلى الملف — لا حاجة لـ require هنا
                const user = db.getUser(userId);
                if (user?.thread_id) {
                    const userThread = await client.channels.fetch(user.thread_id).catch(() => null);
                    if (userThread) {
                        await updateDashboard(userThread, userId, db, 'home').catch(() => {});
                    }
                }
            } else {
                skipped++;
            }
        }

        const typeAr = type === 'weekly' ? 'الأسبوعية' : 'الشهرية';
        const embed = new EmbedBuilder()
            .setColor(CONFIG.COLORS.success)
            .setTitle(`🔄 Sync المهمة ${typeAr}`)
            .setDescription(`**${task.title}**`)
            .addFields(
                { name: '✅ تم التسجيل', value: `${registered} عضو`, inline: true },
                { name: '⏭️ موجودين',    value: `${skipped} عضو`,    inline: true },
                { name: '📊 إجمالي',     value: `${userMap.size} عضو`, inline: true }
            )
            .setTimestamp();

        await interaction.editReply({ embeds: [embed] });
    } catch (e) {
        console.error('❌ sync_tasks:', e);
        await interaction.editReply(ERR).catch(() => {});
    }
}

module.exports = { data, execute };

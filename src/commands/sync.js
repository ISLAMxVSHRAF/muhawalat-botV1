// ==========================================
// 🔄 SYNC_REPORTS — Slash Command
// ==========================================

const { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder } = require('discord.js');
const CONFIG = require('../config');
const ERR = CONFIG.ADMIN?.unifiedErrorMessage || '❌ حدث خطأ داخلي.';

function parseDate(str) {
    if (!str) return null;
    str = str.trim();
    if (/^\d{4}-\d{2}-\d{2}$/.test(str)) return str;
    const m = str.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/);
    if (m) return `${m[3]}-${m[2].padStart(2,'0')}-${m[1].padStart(2,'0')}`;
    return null;
}

const data = new SlashCommandBuilder()
    .setName('sync_reports')
    .setDescription('مزامنة التقارير اليومية من Thread')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addStringOption(o => o.setName('thread_id').setDescription('معرف الـ Thread').setRequired(true))
    .addStringOption(o => o.setName('date').setDescription('التاريخ اللي هيتسجل به — مثال: 22/02/2026').setRequired(true));

async function execute(interaction, { db, client }) {
    try {
        await interaction.deferReply({ ephemeral: true });

        const threadId = interaction.options.getString('thread_id').trim();
        const dateStr  = parseDate(interaction.options.getString('date').trim());
        if (!dateStr) return interaction.editReply('❌ صيغة التاريخ غلط! استخدم: `22/02/2026`');

        const thread = await client.channels.fetch(threadId).catch(() => null);
        if (!thread) return interaction.editReply('❌ الـ Thread غير موجود.');

        // جلب كل الرسائل بـ pagination
        const allMessages = [];
        let lastId = null;
        while (true) {
            const opts = { limit: 100 };
            if (lastId) opts.before = lastId;
            const batch = await thread.messages.fetch(opts);
            if (!batch.size) break;
            for (const [, msg] of batch) allMessages.push(msg);
            lastId = [...batch.values()].pop()?.id;
            if (batch.size < 100) break;
        }

        // تجاهل رسالة البداية
        let starterId = null;
        try {
            const s = await thread.fetchStarterMessage().catch(() => null);
            if (s) starterId = s.id;
        } catch (_) {}

        const registered = new Map(); // userId → أطول رسالة
        let skippedShort = 0;

        for (const msg of allMessages) {
            if (msg.author.bot) continue;
            if (starterId && msg.id === starterId) continue;

            const words = msg.content.trim().split(/\s+/).filter(w => w.length > 0);
            if (words.length < 15) { skippedShort++; continue; }

            const userId = msg.author.id;

            // لو عنده أكتر من رسالة — خد الأطول
            if (!registered.has(userId) || words.length > registered.get(userId).words) {
                registered.set(userId, { content: msg.content, words: words.length });
            }
        }

        // سجّل كل عضو بالتاريخ اللي الأدمن داخله
        for (const [userId, data] of registered) {
            if (!db.getUser(userId)) {
                const du = await client.users.fetch(userId).catch(() => null);
                const name = du ? (du.globalName || du.username || 'مستخدم') : 'مستخدم';
                db.createUser(userId, name, '', 'male', null, null);
            }
            db.recordDailyReport(userId, thread.id, data.content, data.words, dateStr);
        }

        const embed = new EmbedBuilder()
            .setColor(CONFIG.COLORS.success)
            .setTitle('🔄 مزامنة التقارير')
            .setDescription(
                `**التاريخ المسجّل:** ${dateStr}\n` +
                `**Thread:** <#${threadId}>\n\n` +
                `✅ تم تسجيل: **${registered.size}** عضو\n` +
                `📨 إجمالي الرسائل: **${allMessages.length}**\n` +
                `📝 أقل من 15 كلمة (اتجاهلت): **${skippedShort}**`
            )
            .setTimestamp();

        await interaction.editReply({ embeds: [embed] });
    } catch (e) {
        console.error('❌ sync_reports:', e);
        await interaction.editReply(ERR).catch(() => {});
    }
}

module.exports = { data, execute };

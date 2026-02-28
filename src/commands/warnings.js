// ==========================================
// ⚠️ WARNINGS — Slash Commands + issueWarning مركزية
// ==========================================

const { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const CONFIG = require('../config');

const ERR = CONFIG.ADMIN?.unifiedErrorMessage || '❌ حدث خطأ داخلي، تمت كتابة التفاصيل في السجل.';

/**
 * إصدار إنذار مركزية: إشعار العضو، NOTIFY_CORNER، والإنذار الثالث → أدمن بأزرار
 * @param {string} userId
 * @param {string} reason
 * @param {string|null} adminId
 * @param {{ db: object, client: object }} deps
 */
async function issueWarning(userId, reason, adminId, { db, client }) {
    const user = db.getUser(userId);
    if (!user) return;

    const newCount = db.addWarning(userId, reason, adminId);
    if (newCount < 0) return;

    const emoji = ['1️⃣', '2️⃣', '3️⃣'][newCount - 1] || '⚠️';

    if (user.thread_id) {
        const thread = await client.channels.fetch(user.thread_id).catch(() => null);
        if (thread) {
            await thread.send(
                `${emoji} **إنذار رسمي #${newCount}** <@${userId}>\n\n` +
                `**السبب:** ${reason}\n\n` +
                (newCount >= 3
                    ? '🚨 هذا إنذارك الثالث — ستتم مراجعة حالتك مع الإدارة.'
                    : 'الإنذار يُرفع تلقائياً بعد أسبوعين التزام متتالي. 💪')
            ).catch(() => {});
        }
    }

    const notifyId = process.env.NOTIFY_CORNER_ID;
    if (notifyId) {
        const notifyCh = await client.channels.fetch(notifyId).catch(() => null);
        if (notifyCh) {
            await notifyCh.send(
                `${emoji} **إنذار #${newCount}** — **${user.name}** <@${userId}>\n**السبب:** ${reason}`
            ).catch(() => {});
        }
    }

    if (newCount >= 3) {
        const adminChId = process.env.ADMIN_CHANNEL_ID;
        if (adminChId) {
            const adminCh = await client.channels.fetch(adminChId).catch(() => null);
            if (adminCh) {
                const row = new ActionRowBuilder().addComponents(
                    new ButtonBuilder().setCustomId(`admin_timeout_${userId}_1`).setLabel('تايم أوت يوم').setStyle(ButtonStyle.Danger),
                    new ButtonBuilder().setCustomId(`admin_timeout_${userId}_3`).setLabel('تايم أوت 3 أيام').setStyle(ButtonStyle.Danger),
                    new ButtonBuilder().setCustomId(`admin_timeout_${userId}_7`).setLabel('تايم أوت أسبوع').setStyle(ButtonStyle.Danger),
                    new ButtonBuilder().setCustomId(`admin_kick_${userId}`).setLabel('كيك').setStyle(ButtonStyle.Danger),
                    new ButtonBuilder().setCustomId(`admin_warn_ignore_${userId}`).setLabel('تجاهل').setStyle(ButtonStyle.Secondary)
                );
                await adminCh.send({
                    content: `🚨 **إنذار ثالث!**\nالعضو: **${user.name}** <@${userId}>\n**السبب:** ${reason}`,
                    components: [row]
                }).catch(() => {});
            }
        }
        db.addTimeoutPending(userId, reason, 3);
    }
}

function reply(interaction, content, ephemeral = true) {
    return interaction.reply({ content, ephemeral }).catch(() => {});
}
function editReply(interaction, content) {
    return interaction.editReply(content).catch(() => {});
}

const warnData = new SlashCommandBuilder()
    .setName('warn')
    .setDescription('إعطاء إنذار يدوي لعضو')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addUserOption(o => o.setName('user').setDescription('العضو').setRequired(true))
    .addStringOption(o => o.setName('reason').setDescription('سبب الإنذار (اختياري)'));

async function warnExecute(interaction, { db, client }) {
    try {
        await interaction.deferReply({ ephemeral: true });
        const userOpt = interaction.options.getUser('user');
        const reason = interaction.options.getString('reason') || 'إنذار يدوي من الإدارة';
        const userId = userOpt.id;
        const user = db.getUser(userId);
        if (!user) return editReply(interaction, '❌ العضو غير مسجل في النظام.');
        await issueWarning(userId, reason, interaction.user.id, { db, client });
        const updated = db.getUser(userId);
        const newCount = updated?.warning_count || 1;
        await interaction.editReply(
            `${['1️⃣', '2️⃣', '3️⃣'][newCount - 1] || '⚠️'} **تم إصدار إنذار #${newCount}** لـ ${userOpt.username}\nالسبب: ${reason}\n` +
            (newCount >= 3 ? '🚨 **تحذير: هذا الإنذار الثالث!**' : '')
        );
    } catch (e) {
        console.error('❌ warn:', e);
        await editReply(interaction, ERR);
    }
}

const removeWarnData = new SlashCommandBuilder()
    .setName('remove_warn')
    .setDescription('رفع إنذار واحد عن عضو')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addUserOption(o => o.setName('user').setDescription('العضو').setRequired(true));

async function removeWarnExecute(interaction, { db, client }) {
    try {
        await interaction.deferReply({ ephemeral: true });
        const userOpt = interaction.options.getUser('user');
        const userId = userOpt.id;
        const user = db.getUser(userId);
        if (!user) return editReply(interaction, '❌ العضو غير مسجل في النظام.');
        const before = user.warning_count || 0;
        if (before === 0) return editReply(interaction, `ℹ️ **${userOpt.username}** ليس لديه إنذارات.`);
        db.removeWarning(userId);
        await editReply(interaction, `✅ تم رفع إنذار عن **${userOpt.username}** (${before} → ${before - 1})`);
        const thread = await client.channels.fetch(user.thread_id).catch(() => null);
        if (thread) await thread.send(`✅ <@${userId}> تم رفع إنذار عنك! إنذاراتك الحالية: **${before - 1}**`);
    } catch (e) {
        console.error('❌ remove_warn:', e);
        await editReply(interaction, ERR);
    }
}

const clearWarnsData = new SlashCommandBuilder()
    .setName('clear_warns')
    .setDescription('مسح كل إنذارات عضو')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addUserOption(o => o.setName('user').setDescription('العضو').setRequired(true));

async function clearWarnsExecute(interaction, { db, client }) {
    try {
        await interaction.deferReply({ ephemeral: true });
        const userOpt = interaction.options.getUser('user');
        const userId = userOpt.id;
        const user = db.getUser(userId);
        if (!user) return editReply(interaction, '❌ العضو غير مسجل في النظام.');
        db.clearWarnings(userId);
        await editReply(interaction, `✅ تم مسح كل إنذارات **${userOpt.username}**`);
        const thread = await client.channels.fetch(user.thread_id).catch(() => null);
        if (thread) await thread.send(`🎉 <@${userId}> تم مسح كل إنذاراتك. صفحة جديدة! 🌱`);
    } catch (e) {
        console.error('❌ clear_warns:', e);
        await editReply(interaction, ERR);
    }
}

const warningsData = new SlashCommandBuilder()
    .setName('warnings')
    .setDescription('عرض سجل إنذارات عضو')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addUserOption(o => o.setName('user').setDescription('العضو').setRequired(true));

async function warningsExecute(interaction, { db }) {
    try {
        await interaction.deferReply({ ephemeral: true });
        const userOpt = interaction.options.getUser('user');
        const userId = userOpt.id;
        const user = db.getUser(userId);
        if (!user) return editReply(interaction, '❌ العضو غير مسجل في النظام.');
        const log = db.getWarningsLog(userId);
        const count = user.warning_count || 0;
        const embed = new EmbedBuilder()
            .setColor(CONFIG.COLORS.warning)
            .setTitle(`⚠️ سجل إنذارات ${userOpt.username}`)
            .setDescription(`الإنذارات الحالية: **${count}/3**`)
            .setTimestamp();
        if (!log.length) embed.addFields({ name: 'السجل', value: 'لا يوجد سجل إنذارات.', inline: false });
        else embed.addFields({ name: 'آخر الإنذارات', value: log.slice(0, 10).map((w, i) => `${i + 1}. ${new Date(w.issued_at).toLocaleDateString('ar-EG')} — ${(w.reason || 'بدون سبب').slice(0, 80)}`).join('\n'), inline: false });
        await interaction.editReply({ embeds: [embed] });
    } catch (e) {
        console.error('❌ warnings:', e);
        await editReply(interaction, ERR);
    }
}

const warningsAllData = new SlashCommandBuilder()
    .setName('warnings_all')
    .setDescription('عرض كل الأعضاء ذوي إنذارات')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator);

async function warningsAllExecute(interaction, { db }) {
    try {
        await interaction.deferReply({ ephemeral: true });
        const users = db.getAllUsers().filter(u => (u.warning_count || 0) > 0);
        if (!users.length) {
            return interaction.editReply({ embeds: [new EmbedBuilder().setColor(CONFIG.COLORS.success).setTitle('✅ لا إنذارات').setDescription('لا يوجد أعضاء لديهم إنذارات حالياً.').setTimestamp()] });
        }
        const sorted = users.sort((a, b) => (b.warning_count || 0) - (a.warning_count || 0));
        const list = sorted.slice(0, 25).map(u => '⚠️'.repeat(Math.min(u.warning_count || 0, 3)) + ` **${u.name}** — <@${u.user_id}> (${u.warning_count}/3)`).join('\n');
        const extra = sorted.length > 25 ? `\n_… و ${sorted.length - 25} آخرين_` : '';
        const embed = new EmbedBuilder()
            .setColor(CONFIG.COLORS.warning)
            .setTitle('⚠️ الأعضاء ذوو الإنذارات')
            .setDescription(list + extra)
            .setFooter({ text: `إجمالي: ${sorted.length} عضو` })
            .setTimestamp();
        await interaction.editReply({ embeds: [embed] });
    } catch (e) {
        console.error('❌ warnings_all:', e);
        await editReply(interaction, ERR);
    }
}

const warningsAutoToggleData = new SlashCommandBuilder()
    .setName('warnings_auto_toggle')
    .setDescription('إيقاف/تشغيل نظام الإنذارات التلقائية')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator);

async function warningsAutoToggleExecute(interaction, { db }) {
    try {
        await interaction.deferReply({ ephemeral: true });
        const enabled = db.toggleAutoWarnings();
        if (enabled) {
            await interaction.editReply('✅ **تم تفعيل** نظام الإنذارات التلقائية. البوت سيقوم بفحص وتقييم الأعضاء أسبوعياً.');
        } else {
            await interaction.editReply('⏸️ **تم إيقاف** نظام الإنذارات التلقائية مؤقتاً.');
        }
    } catch (e) {
        console.error('❌ warnings_auto_toggle:', e);
        await interaction.editReply(ERR).catch(() => {});
    }
}

const commands = [
    { data: warnData, execute: warnExecute },
    { data: removeWarnData, execute: removeWarnExecute },
    { data: clearWarnsData, execute: clearWarnsExecute },
    { data: warningsData, execute: warningsExecute },
    { data: warningsAllData, execute: warningsAllExecute },
    { data: warningsAutoToggleData, execute: warningsAutoToggleExecute }
];

module.exports = { commands, issueWarning };

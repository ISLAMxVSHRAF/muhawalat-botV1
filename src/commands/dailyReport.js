// ==========================================
// 📝 DAILY REPORT — Slash Commands
// ==========================================

const { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ModalBuilder, TextInputBuilder, TextInputStyle } = require('discord.js');
const CONFIG = require('../config');
const ERR = CONFIG.ADMIN?.unifiedErrorMessage || '❌ حدث خطأ داخلي.';

function getTodayDate() { return new Date().toISOString().split('T')[0]; }

function parseDate(str) {
    if (!str) return null;
    str = str.trim();
    if (/^\d{4}-\d{2}-\d{2}$/.test(str)) return str;
    const m = str.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/);
    if (m) return `${m[3]}-${m[2].padStart(2,'0')}-${m[1].padStart(2,'0')}`;
    return null;
}

function formatDate(d) {
    return new Date(d + 'T00:00:00').toLocaleDateString('ar-EG', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
}

const PER_PAGE = 20;

function buildPages(users, dateLabel, title, color, footer) {
    const pages = [];
    for (let i = 0; i < Math.max(1, Math.ceil(users.length / PER_PAGE)); i++) {
        const slice = users.slice(i * PER_PAGE, (i + 1) * PER_PAGE);
        const desc = users.length
            ? slice.map((u, j) => `${i * PER_PAGE + j + 1}. **${u.name}** <@${u.user_id}>`).join('\n')
            : '—';
        pages.push(
            new EmbedBuilder()
                .setColor(color)
                .setTitle(title)
                .setDescription(`📅 ${dateLabel}\n\n${desc}`)
                .setFooter({ text: `${footer} | صفحة ${i + 1} من ${Math.ceil(users.length / PER_PAGE) || 1}` })
                .setTimestamp()
        );
    }
    return pages;
}

function buildRow(page, total, type, dateStr) {
    const btns = [
        new ButtonBuilder()
            .setCustomId(`dr_prev_${type}_${page}_${dateStr}`)
            .setLabel('◀')
            .setStyle(ButtonStyle.Secondary)
            .setDisabled(page === 0),
        new ButtonBuilder()
            .setCustomId(`dr_page_${type}_${page}_${dateStr}`)
            .setLabel(`${page + 1} / ${total}`)
            .setStyle(ButtonStyle.Primary)
            .setDisabled(true),
        new ButtonBuilder()
            .setCustomId(`dr_next_${type}_${page}_${dateStr}`)
            .setLabel('▶')
            .setStyle(ButtonStyle.Secondary)
            .setDisabled(page === total - 1),
        new ButtonBuilder()
            .setCustomId(`dr_copy_${type}_${dateStr}`)
            .setLabel('📋 نسخ')
            .setStyle(ButtonStyle.Success)
    ];

    if (type === 'missing') {
        btns.push(
            new ButtonBuilder()
                .setCustomId(`dr_notify_${type}_${dateStr}`)
                .setLabel('🔔 إشعار نوتي كورنر')
                .setStyle(ButtonStyle.Danger)
        );
    }

    return new ActionRowBuilder().addComponents(btns);
}

// ==========================================
// ✅ /daily_done
// ==========================================
const dailyDoneData = new SlashCommandBuilder()
    .setName('daily_done')
    .setDescription('من عمل تقريره (أو في تاريخ محدد)')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addStringOption(o => o.setName('date').setDescription('التاريخ — مثال: 22/02/2026').setRequired(false));

async function dailyDoneExecute(interaction, { db }) {
    try {
        await interaction.deferReply({ ephemeral: true });
        const dateInput  = interaction.options.getString('date');
        const targetDate = dateInput ? parseDate(dateInput) : getTodayDate();
        if (dateInput && !targetDate) return interaction.editReply('❌ صيغة التاريخ غلط! استخدم: `22/02/2026`');

        const allUsers  = db.getAllUsers();
        const reports   = db.getDailyReports(targetDate);
        const doneIds   = new Set(reports.map(r => r.user_id));
        const done      = allUsers.filter(u => doneIds.has(u.user_id));
        const dateLabel = formatDate(targetDate);
        const isToday   = targetDate === getTodayDate();
        const title     = isToday ? '✅ من عمل تقريره اليوم' : `✅ من عمل تقريره — ${targetDate}`;

        const pages = buildPages(done, dateLabel, title, CONFIG.COLORS.success, `${done.length} / ${allUsers.length} عضو`);
        const components = done.length > 0 ? [buildRow(0, pages.length, 'done', targetDate)] : [];
        await interaction.editReply({ embeds: [pages[0]], components });
    } catch (e) {
        console.error('❌ daily_done:', e);
        await interaction.editReply(ERR).catch(() => {});
    }
}

// ==========================================
// ❌ /daily_missing
// ==========================================
const dailyMissingData = new SlashCommandBuilder()
    .setName('daily_missing')
    .setDescription('من لم يعمل تقريره (أو في تاريخ محدد)')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addStringOption(o => o.setName('date').setDescription('التاريخ — مثال: 22/02/2026').setRequired(false));

async function dailyMissingExecute(interaction, { db }) {
    try {
        await interaction.deferReply({ ephemeral: true });
        const dateInput  = interaction.options.getString('date');
        const targetDate = dateInput ? parseDate(dateInput) : getTodayDate();
        if (dateInput && !targetDate) return interaction.editReply('❌ صيغة التاريخ غلط! استخدم: `22/02/2026`');

        const allUsers  = db.getAllUsers();
        const reports   = db.getDailyReports(targetDate);
        const doneIds   = new Set(reports.map(r => r.user_id));
        const missing   = allUsers.filter(u => !doneIds.has(u.user_id));
        const dateLabel = formatDate(targetDate);
        const isToday   = targetDate === getTodayDate();
        const title     = isToday ? '❌ من لم يعمل تقريره بعد' : `❌ من لم يعمل تقريره — ${targetDate}`;

        const pages = buildPages(missing, dateLabel, title, CONFIG.COLORS.danger, `${missing.length} / ${allUsers.length} عضو`);
        const components = missing.length > 0 ? [buildRow(0, pages.length, 'missing', targetDate)] : [];
        await interaction.editReply({ embeds: [pages[0]], components });
    } catch (e) {
        console.error('❌ daily_missing:', e);
        await interaction.editReply(ERR).catch(() => {});
    }
}

// ==========================================
// 🔘 HANDLE BUTTONS
// ==========================================
async function handleDailyReportButton(interaction, db) {
    try {
        const parts   = interaction.customId.split('_');
        const action  = parts[1]; // prev / next / page / copy / notify
        const type    = parts[2]; // done / missing
        const dateStr = parts[parts.length - 1];

        const allUsers = db.getAllUsers();
        const reports  = db.getDailyReports(dateStr);
        const doneIds  = new Set(reports.map(r => r.user_id));
        const users    = type === 'done'
            ? allUsers.filter(u => doneIds.has(u.user_id))
            : allUsers.filter(u => !doneIds.has(u.user_id));

        // 📋 زرار نسخ — بعت في قناة الأدمن
        if (action === 'copy') {
            const mentions = users.map(u => `<@${u.user_id}>`).join(' ');
            if (!mentions) return interaction.reply({ content: 'مفيش أحد', ephemeral: true });

            const modal = new ModalBuilder()
                .setCustomId(`dr_modal_${type}_${dateStr}`)
                .setTitle('📋 المنشنات');

            const input = new TextInputBuilder()
                .setCustomId('mentions_text')
                .setLabel('انسخ المنشنات من هنا')
                .setStyle(TextInputStyle.Paragraph)
                .setValue(mentions)
                .setRequired(false);

            modal.addComponents(new ActionRowBuilder().addComponents(input));
            return interaction.showModal(modal);
        }

        // 🔔 زرار نوتي كورنر
        if (action === 'notify') {
            const mentions = users.map(u => `<@${u.user_id}>`).join(' ');
            if (!mentions) return interaction.reply({ content: '🎉 مفيش أحد معملش تقرير!', ephemeral: true });

            const notifyId = process.env.NOTIFY_CORNER_ID;
            if (!notifyId) return interaction.reply({ content: '❌ NOTIFY_CORNER_ID مش موجود في .env', ephemeral: true });

            const channel = await interaction.client.channels.fetch(notifyId).catch(() => null);
            if (!channel) return interaction.reply({ content: '❌ مش قادر أجيب قناة النوتي كورنر', ephemeral: true });

            // جيب اسم الـ thread
            let threadName = dateStr;
            const post = db.getDailyPostByDate ? db.getDailyPostByDate(dateStr) : null;
            if (post?.thread_id) {
                const thread = await interaction.client.channels.fetch(post.thread_id).catch(() => null);
                if (thread?.name) threadName = thread.name;
            }

            await channel.send(
                `📢 **مشرفينا في النوتي كورنر!**\n` +
                `الأعضاء دول معملوش التقرير بتاع **${threadName}**:\n\n` +
                `${mentions}`
            );

            return interaction.reply({ content: `✅ تم الإرسال في <#${notifyId}>`, ephemeral: true });
        }

        // أزرار التنقل
        let page = parseInt(parts[3]);
        if (action === 'next') page++;
        if (action === 'prev') page--;

        const dateLabel = formatDate(dateStr);
        const isToday   = dateStr === getTodayDate();
        const title = type === 'done'
            ? (isToday ? '✅ من عمل تقريره اليوم' : `✅ من عمل تقريره — ${dateStr}`)
            : (isToday ? '❌ من لم يعمل تقريره بعد' : `❌ من لم يعمل تقريره — ${dateStr}`);
        const color  = type === 'done' ? CONFIG.COLORS.success : CONFIG.COLORS.danger;
        const footer = `${users.length} / ${allUsers.length} عضو`;

        const pages = buildPages(users, dateLabel, title, color, footer);
        page = Math.max(0, Math.min(page, pages.length - 1));

        await interaction.update({
            embeds: [pages[page]],
            components: [buildRow(page, pages.length, type, dateStr)]
        });
    } catch (e) {
        console.error('❌ daily report button:', e);
    }
}

const commands = [
    { data: dailyDoneData,    execute: dailyDoneExecute    },
    { data: dailyMissingData, execute: dailyMissingExecute }
];

module.exports = { commands, handleDailyReportButton };

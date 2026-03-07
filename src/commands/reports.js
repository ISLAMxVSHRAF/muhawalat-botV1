const {
    EmbedBuilder,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    ModalBuilder,
    TextInputBuilder,
    TextInputStyle
} = require('discord.js');
const CONFIG = require('../config');

const ERR = CONFIG.ADMIN?.unifiedErrorMessage || '❌ حدث خطأ داخلي.';

// ==========================================
// Helpers copied from dailyReport.js
// ==========================================

function getTodayDate() {
    return new Date().toISOString().split('T')[0];
}

function parseDateDaily(str) {
    if (!str) return null;
    str = str.trim();
    if (/^\d{4}-\d{2}-\d{2}$/.test(str)) return str;
    const m = str.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/);
    if (m) return `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
    return null;
}

function formatDate(d) {
    return new Date(d + 'T00:00:00').toLocaleDateString('ar-EG', {
        weekday: 'long',
        year: 'numeric',
        month: 'long',
        day: 'numeric'
    });
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
                .setFooter({
                    text: `${footer} | صفحة ${i + 1} من ${Math.ceil(users.length / PER_PAGE) || 1}`
                })
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

async function dailyDoneExecute(interaction, { db }) {
    try {
        await interaction.deferReply({ ephemeral: true });
        const dateInput = interaction.options.getString('date');
        const targetDate = dateInput ? parseDateDaily(dateInput) : getTodayDate();
        if (dateInput && !targetDate)
            return interaction.editReply('❌ صيغة التاريخ غلط! استخدم: `22/02/2026`');

        const allUsers = db.getAllUsers();
        const reports = db.getDailyReports(targetDate);
        const doneIds = new Set(reports.map(r => r.user_id));
        const done = allUsers.filter(u => doneIds.has(u.user_id));
        const dateLabel = formatDate(targetDate);
        const isToday = targetDate === getTodayDate();
        const title = isToday
            ? '✅ من عمل تقريره اليوم'
            : `✅ من عمل تقريره — ${targetDate}`;

        const pages = buildPages(
            done,
            dateLabel,
            title,
            CONFIG.COLORS.success,
            `${done.length} / ${allUsers.length} عضو`
        );
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

async function dailyMissingExecute(interaction, { db }) {
    try {
        await interaction.deferReply({ ephemeral: true });
        const dateInput = interaction.options.getString('date');
        const targetDate = dateInput ? parseDateDaily(dateInput) : getTodayDate();
        if (dateInput && !targetDate)
            return interaction.editReply('❌ صيغة التاريخ غلط! استخدم: `22/02/2026`');

        const allUsers = db.getAllUsers();
        const reports = db.getDailyReports(targetDate);
        const doneIds = new Set(reports.map(r => r.user_id));
        const missing = allUsers.filter(u => !doneIds.has(u.user_id));
        const dateLabel = formatDate(targetDate);
        const isToday = targetDate === getTodayDate();
        const title = isToday
            ? '❌ من لم يعمل تقريره بعد'
            : `❌ من لم يعمل تقريره — ${targetDate}`;

        const pages = buildPages(
            missing,
            dateLabel,
            title,
            CONFIG.COLORS.danger,
            `${missing.length} / ${allUsers.length} عضو`
        );
        const components =
            missing.length > 0 ? [buildRow(0, pages.length, 'missing', targetDate)] : [];
        await interaction.editReply({ embeds: [pages[0]], components });
    } catch (e) {
        console.error('❌ daily_missing:', e);
        await interaction.editReply(ERR).catch(() => {});
    }
}

async function dailyOverviewExecute(interaction, { db }) {
    try {
        await interaction.deferReply({ ephemeral: true });
        const dateInput = interaction.options.getString('date');
        const targetDate = dateInput ? parseDateDaily(dateInput) : getTodayDate();
        if (dateInput && !targetDate)
            return interaction.editReply('❌ صيغة التاريخ غلط! استخدم: `22/02/2026`');

        const allUsers = db.getAllUsers();

        // Filter active members by MEMBER_ROLE if set
        let activeUsers = allUsers;
        if (process.env.MEMBER_ROLE_ID) {
            try {
                let guildMembers = interaction.guild.members.cache;
                if (guildMembers.size < 2) {
                    guildMembers = await interaction.guild.members.fetch({ time: 10000 }).catch(() => interaction.guild.members.cache);
                }
                activeUsers = allUsers.filter(u => {
                    const m = guildMembers.get(u.user_id);
                    return m && m.roles.cache.has(process.env.MEMBER_ROLE_ID);
                });
            } catch (_) {}
        }

        const reports = db.getDailyReports(targetDate);
        const doneIds = new Set(reports.map(r => r.user_id));
        const done = activeUsers.filter(u => doneIds.has(u.user_id));
        const missing = activeUsers.filter(u => !doneIds.has(u.user_id));
        const pct = activeUsers.length > 0 ? Math.round((done.length / activeUsers.length) * 100) : 0;

        const isToday = targetDate === getTodayDate();
        const dateLabel = formatDate(targetDate);

        const doneVal = done.length > 0
            ? done.slice(0, 30).map(u => `<@${u.user_id}>`).join('\n')
            : '—';
        const missingVal = missing.length > 0
            ? missing.slice(0, 30).map(u => `<@${u.user_id}>`).join('\n')
            : '✅ الكل عمل تقريره!';

        const embed = new EmbedBuilder()
            .setColor(pct >= 70 ? CONFIG.COLORS.success : pct >= 40 ? CONFIG.COLORS.warning : CONFIG.COLORS.danger)
            .setTitle(isToday ? '📊 نظرة شاملة — تقارير اليوم' : `📊 نظرة شاملة — ${dateLabel}`)
            .setDescription(`**${done.length}** من **${activeUsers.length}** عضو — نسبة الالتزام: **${pct}%**`)
            .addFields(
                { name: `✅ عملوا تقريرهم (${done.length})`, value: doneVal, inline: true },
                { name: `❌ لم يعملوا بعد (${missing.length})`, value: missingVal, inline: true }
            )
            .setFooter({ text: dateLabel });

        await interaction.editReply({ embeds: [embed] });
    } catch (e) {
        console.error('❌ daily_overview:', e);
        await interaction.editReply(ERR).catch(() => {});
    }
}

// ==========================================
// 🔘 HANDLE BUTTONS (from dailyReport.js)
// ==========================================

async function handleDailyReportButton(interaction, db) {
    try {
        const parts = interaction.customId.split('_');
        const action = parts[1]; // prev / next / page / copy / notify
        const type = parts[2]; // done / missing
        const dateStr = parts[parts.length - 1];

        const allUsers = db.getAllUsers();
        const reports = db.getDailyReports(dateStr);
        const doneIds = new Set(reports.map(r => r.user_id));
        const users =
            type === 'done'
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
            if (!mentions)
                return interaction.reply({
                    content: '🎉 مفيش أحد معملش تقرير!',
                    ephemeral: true
                });

            const notifyId = process.env.NOTIFY_CORNER_ID;
            if (!notifyId)
                return interaction.reply({
                    content: '❌ NOTIFY_CORNER_ID مش موجود في .env',
                    ephemeral: true
                });

            const channel = await interaction.client.channels.fetch(notifyId).catch(() => null);
            if (!channel)
                return interaction.reply({
                    content: '❌ مش قادر أجيب قناة النوتي كورنر',
                    ephemeral: true
                });

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
        const isToday = dateStr === getTodayDate();
        const title =
            type === 'done'
                ? isToday
                    ? '✅ من عمل تقريره اليوم'
                    : `✅ من عمل تقريره — ${dateStr}`
                : isToday
                ? '❌ من لم يعمل تقريره بعد'
                : `❌ من لم يعمل تقريره — ${dateStr}`;
        const color = type === 'done' ? CONFIG.COLORS.success : CONFIG.COLORS.danger;
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

// ==========================================
// 🔄 SYNC_REPORTS — from sync.js
// ==========================================

function parseDateSync(str) {
    if (!str) return null;
    str = str.trim();
    if (/^\d{4}-\d{2}-\d{2}$/.test(str)) return str;
    const m = str.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/);
    if (m) return `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
    return null;
}

async function syncReportsExecute(interaction, { db, client }) {
    try {
        await interaction.deferReply({ ephemeral: true });

        const threadId = interaction.options.getString('thread_id').trim();
        const dateStr = parseDateSync(interaction.options.getString('date').trim());
        if (!dateStr) return interaction.editReply('❌ صيغة التاريخ غلط! استخدم: `22/02/2026`');

        const thread = await client.channels.fetch(threadId).catch(() => null);
        if (!thread) return interaction.editReply('❌ الـ Thread غير موجود.');

        // جلب كل الرسائل بـ pagination
        const allMessages = [];
        let lastId = null;
        // eslint-disable-next-line no-constant-condition
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
            if (words.length < 15) {
                skippedShort++;
                continue;
            }

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
                const name = du ? du.globalName || du.username || 'مستخدم' : 'مستخدم';
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

// ==========================================
// 🔄 /unsync_reports — from old admin.js
// ==========================================

async function unsyncReportsExecute(interaction, { db }) {
    try {
        await interaction.deferReply({ ephemeral: true });
        const input = (interaction.options.getString('date') || '').trim();
        const m = input.match(/^(\d{2})-(\d{2})-(\d{4})$/);
        if (!m) {
            return interaction.editReply(
                '❌ صيغة التاريخ غير صحيحة. استخدم **DD-MM-YYYY** (مثال: 28-02-2026).'
            );
        }
        const [, dd, mm, yyyy] = m;
        const isoDate = `${yyyy}-${mm}-${dd}`;
        const d = new Date(isoDate);
        if (
            Number.isNaN(d.getTime()) ||
            d.getFullYear().toString() !== yyyy ||
            String(d.getMonth() + 1).padStart(2, '0') !== mm ||
            String(d.getDate()).padStart(2, '0') !== dd
        ) {
            return interaction.editReply('❌ تاريخ غير صالح. تأكد من اليوم والشهر والسنة.');
        }
        db.removeAllReportsForDate(isoDate);
        await interaction.editReply(
            `✅ تم حذف جميع التقارير اليومية لكل الأعضاء ليوم **${input}** بنجاح. يمكنك إعادة المزامنة الآن.`
        );
    } catch (e) {
        console.error('❌ unsync_reports:', e);
        await interaction.editReply(ERR).catch(() => {});
    }
}

// ==========================================
// Central handler for /admin reports group
// ==========================================

async function handleReports(interaction, deps) {
    const sub = interaction.options.getSubcommand();
    switch (sub) {
        case 'daily_done':
            return dailyDoneExecute(interaction, deps);
        case 'daily_missing':
            return dailyMissingExecute(interaction, deps);
        case 'daily_overview':
            return dailyOverviewExecute(interaction, deps);
        case 'sync_reports':
            return syncReportsExecute(interaction, deps);
        case 'unsync_reports':
            return unsyncReportsExecute(interaction, deps);
        default:
            throw new Error(`Unknown reports subcommand: ${sub}`);
    }
}

module.exports = {
    handleReports,
    handleDailyReportButton,
    dailyOverviewExecute
};


const {
    EmbedBuilder,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    ModalBuilder,
    TextInputBuilder,
    TextInputStyle,
    Collection,
    StringSelectMenuBuilder
} = require('discord.js');
const CONFIG = require('../config');
const { createConfirmation } = require('../utils/embeds');
const { updateDashboard } = require('../utils/dashboard');

const ERR = CONFIG.ADMIN?.unifiedErrorMessage || '❌ حدث خطأ داخلي، تمت كتابة التفاصيل في السجل.';

const NUDGE_MESSAGES = {
    zero: [
        'إزيك يا {name}؟ 🧡\nنتمنى تكون بخير وأيامك طيبة 🌿\n\nلاحظنا إن تقاريرك الفترة دي كانت {count} من أصل {days}.\n\nفي سبب معين عطّلك؟ لو تقدر تشاركنا إحنا موجودين وهنساعدك 🧡\n\n— فريق محاولات �',
        'إزيك يا {name}؟ 🧡\nنتمنى تكون بخير وأيامك طيبة 🌿\n\nلاحظنا إنك مكتبتش تقارير الفترة دي — {count} من أصل {days}.\n\nمش لازم تشرح أو تعتذر، بس لو في حاجة تقدر تشاركنا إحنا هنا 🧡\n\n— فريق محاولات 🌱',
        'إزيك يا {name}؟ 🧡\nنتمنى تكون بخير وأيامك طيبة 🌿\n\n{count} من أصل {days} تقارير الفترة دي — طمّنا عليك.\n\nلو محتاج أي حاجة إحنا موجودين 🧡\n\n— فريق محاولات 🌱',
    ],
    danger: [
        'إزيك يا {name}؟ 🧡\nنتمنى تكون بخير وأيامك طيبة 🌿\n\nلاحظنا إن تقاريرك الفترة دي كانت {count} من أصل {days}.\n\nمش بنطلب منك تعوّض اللي فات — ركّز في النهارده بس 🧡\n\n— فريق محاولات 🌱',
        'إزيك يا {name}؟ 🧡\nنتمنى تكون بخير وأيامك طيبة 🌿\n\n{count} من أصل {days} تقارير — شايفين إنك بتحاول.\n\nمش لازم يكون 100%، النهارده بس يكفي 🧡\n\n— فريق محاولات 🌱',
        'إزيك يا {name}؟ 🧡\nنتمنى تكون بخير وأيامك طيبة 🌿\n\nتقاريرك الفترة دي كانت {count} من أصل {days}.\n\nاللي فات فات — النهارده فرصة جديدة 🧡\n\n— فريق محاولات 🌱',
    ],
    good: [
        'إزيك يا {name}؟ 🧡\nنتمنى تكون بخير وأيامك طيبة �\n\nتقاريرك الفترة دي كانت {count} من أصل {days} — شايفين مجهودك وبنقدّره 💛\n\nكمّل على نفس الوتيرة 🧡\n\n— فريق محاولات 🌱',
        'إزيك يا {name}؟ 🧡\nنتمنى تكون بخير وأيامك طيبة �\n\n{count} من أصل {days} تقارير — ده مجهود حقيقي يستاهل 💛\n\nاستمر، إحنا شايفينك 🧡\n\n— فريق محاولات 🌱',
        'إزيك يا {name}؟ 🧡\nنتمنى تكون بخير وأيامك طيبة �\n\nتقاريرك الفترة دي كانت {count} من أصل {days} — كمّل على نفس الإيقاع 💛\n\nبنتابعك وبنقدّر مجهودك 🧡\n\n— فريق محاولات 🌱',
    ],
    complete: [
        'إزيك يا {name}؟ 🧡\nنتمنى تكون بخير وأيامك طيبة 🌿\n\n{count} من أصل {days} تقارير — ده مجهود استثنائي يستاهل كل التقدير 💛\n\nشكراً إنك بتلتزم وبتكون قدوة للمجتمع 🧡\n\n— فريق محاولات 🌱',
        'إزيك يا {name}؟ 🧡\nنتمنى تكون بخير وأيامك طيبة 🌿\n\n{count} من أصل {days} تقارير — شايفين ثباتك وبنقدّره جداً 💛\n\nاستمر، ثباتك ده مش بيمر من غير ما نشوفه 🧡\n\n— فريق محاولات 🌱',
        'إزيك يا {name}؟ 🧡\nنتمنى تكون بخير وأيامك طيبة 🌿\n\n{count} من أصل {days} تقارير — الالتزام ده بيبان وبيأثر في المجتمع كله 💛\n\nكمّل على نفس الإيقاع 🧡\n\n— فريق محاولات 🌱',
    ]
};

const RADAR_CATEGORIES = [
    { key: 'complete', label: 'ملتزم تماماً', emoji: '🏆', color: 0xF9C22E },
    { key: 'good',     label: 'أداء جيد',     emoji: '⭐', color: 0xF9C22E },
    { key: 'danger',   label: 'في خطر',       emoji: '🟠', color: 0xF15946 },
    { key: 'zero',     label: 'مختفي',         emoji: '🔴', color: 0xF15946 },
];

// ==========================================
// ⚠️ issueWarning + helpers (from warnings.js)
// ==========================================

async function issueWarning(userId, reason, adminId, { db, client }, reasonType = 'manual', period = null) {
    const user = db.getUser(userId);
    if (!user) return null;

    const newCount = db.addWarning(userId, reason, adminId, reasonType, period);
    if (newCount < 0) return null; // -1 = error, -2 = duplicate

    const emoji = ['1️⃣', '2️⃣', '3️⃣'][newCount - 1] || '⚠️';

    const warningMsg = 
        `${emoji} **إنذار رسمي #${newCount}** <@${userId}>\n\n` +
        `**السبب:** ${reason}\n\n` +
        (newCount >= 3
            ? '🚨 هذا إنذارك الثالث — ستتم مراجعة حالتك مع الإدارة.'
            : 'الإنذار يُرفع تلقائياً بعد أسبوعين التزام متتالي. 💪');

    if (user.thread_id) {
        const thread = await client.channels.fetch(user.thread_id).catch(() => null);
        if (thread) {
            await thread.send(warningMsg).catch(() => {});
        } else {
            // Fallback to DM if thread not found
            try {
                const discordUser = await client.users.fetch(userId).catch(() => null);
                if (discordUser) await discordUser.send(warningMsg).catch(() => {});
            } catch (_) {}
        }
    } else {
        // No thread — send DM directly
        try {
            const discordUser = await client.users.fetch(userId).catch(() => null);
            if (discordUser) await discordUser.send(warningMsg).catch(() => {});
        } catch (_) {}
    }

    const notifyId = process.env.NOTIFY_CORNER_ID;
    if (notifyId) {
        const notifyCh = await client.channels.fetch(notifyId).catch(() => null);
        if (notifyCh) {
            await notifyCh
                .send(
                    `${emoji} **إنذار #${newCount}** — **${user.name}** <@${userId}>\n**السبب:** ${reason}`
                )
                .catch(() => {});
        }
    }

    if (newCount >= 3) {
        const adminChId = process.env.ADMIN_CHANNEL_ID;
        if (adminChId) {
            const adminCh = await client.channels.fetch(adminChId).catch(() => null);
            if (adminCh) {
                const row = new ActionRowBuilder().addComponents(
                    new ButtonBuilder()
                        .setCustomId(`admin_timeout_${userId}_1`)
                        .setLabel('تايم أوت يوم')
                        .setStyle(ButtonStyle.Danger),
                    new ButtonBuilder()
                        .setCustomId(`admin_timeout_${userId}_3`)
                        .setLabel('تايم أوت 3 أيام')
                        .setStyle(ButtonStyle.Danger),
                    new ButtonBuilder()
                        .setCustomId(`admin_timeout_${userId}_7`)
                        .setLabel('تايم أوت أسبوع')
                        .setStyle(ButtonStyle.Danger),
                    new ButtonBuilder()
                        .setCustomId(`admin_kick_${userId}`)
                        .setLabel('كيك')
                        .setStyle(ButtonStyle.Danger),
                    new ButtonBuilder()
                        .setCustomId(`admin_warn_ignore_${userId}`)
                        .setLabel('تجاهل')
                        .setStyle(ButtonStyle.Secondary)
                );
                await adminCh
                    .send({
                        content:
                            `🚨 **إنذار ثالث!**\nالعضو: **${user.name}** <@${userId}>\n**السبب:** ${reason}`,
                        components: [row]
                    })
                    .catch(() => {});
            }
        }
        db.addTimeoutPending(userId, reason, 3);
    }

    return newCount;
}

function reply(interaction, content, ephemeral = true) {
    return interaction.reply({ content, ephemeral }).catch(() => {});
}
function editReply(interaction, content) {
    return interaction.editReply(content).catch(() => {});
}

// ==========================================
// Slash command execute functions (from warnings.js)
// ==========================================

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
            `${['1️⃣', '2️⃣', '3️⃣'][newCount - 1] || '⚠️'} **تم إصدار إنذار #${newCount}** لـ ${
                userOpt.username
            }\nالسبب: ${reason}\n` +
                (newCount >= 3 ? '🚨 **تحذير: هذا الإنذار الثالث!**' : '')
        );
    } catch (e) {
        console.error('❌ warn:', e);
        await editReply(interaction, ERR);
    }
}

async function removeWarnExecute(interaction, { db, client }) {
    try {
        await interaction.deferReply({ ephemeral: true });
        const userOpt = interaction.options.getUser('user');
        const userId = userOpt.id;
        const user = db.getUser(userId);
        if (!user) return editReply(interaction, '❌ العضو غير مسجل في النظام.');
        const before = user.warning_count || 0;
        if (before === 0)
            return editReply(interaction, `ℹ️ **${userOpt.username}** ليس لديه إنذارات.`);
        db.removeWarning(userId);
        await editReply(
            interaction,
            `✅ تم رفع إنذار عن **${userOpt.username}** (${before} → ${before - 1})`
        );
        const thread = await client.channels.fetch(user.thread_id).catch(() => null);
        if (thread)
            await thread.send(
                `✅ <@${userId}> تم رفع إنذار عنك! إنذاراتك الحالية: **${before - 1}**`
            );
    } catch (e) {
        console.error('❌ remove_warn:', e);
        await editReply(interaction, ERR);
    }
}

async function clearWarnsExecute(interaction, { db, client }) {
    try {
        await interaction.deferReply({ ephemeral: true });
        const userOpt = interaction.options.getUser('user');
        const userId = userOpt.id;
        const user = db.getUser(userId);
        if (!user) return editReply(interaction, '❌ العضو غير مسجل في النظام.');
        
        // Safety: Add confirmation and backup before clearing warnings
        
        await interaction.editReply({ content: '⏳ جارٍ التحضير...' });
        
        const confirmed = await createConfirmation(interaction, {
            title: '⚠️ تأكيد مسح الإنذارات',
            description: `سيتم مسح **كل** إنذارات <@${userId}> (${userOpt.username}).\n\n**هذه العملية لا يمكن التراجع عنها.**`,
            confirmLabel: '✅ نعم، امسح كل الإنذارات',
            cancelLabel: '❌ إلغاء'
        });
        
        if (!confirmed) return; // user cancelled or timed out
        
        // Auto-backup before executing
        db.safeBackup('before-clear-warnings');
        
        // Execute the destructive operation
        db.clearWarnings(userId);
        await editReply(interaction, `✅ تم مسح كل إنذارات **${userOpt.username}**`);
        const thread = await client.channels.fetch(user.thread_id).catch(() => null);
        if (thread)
            await thread.send(
                `🎉 <@${userId}> تم مسح كل إنذاراتك. صفحة جديدة! 🌱`
            );
    } catch (e) {
        console.error('❌ clear_warns:', e);
        await editReply(interaction, ERR);
    }
}

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
        if (!log.length)
            embed.addFields({ name: 'السجل', value: 'لا يوجد سجل إنذارات.', inline: false });
        else
            embed.addFields({
                name: 'آخر الإنذارات',
                value: log
                    .slice(0, 10)
                    .map(
                        (w, i) =>
                            `${i + 1}. ${new Date(w.issued_at).toLocaleDateString(
                                'ar-EG'
                            )} — ${(w.reason || 'بدون سبب').slice(0, 80)}`
                    )
                    .join('\n'),
                inline: false
            });
        await interaction.editReply({ embeds: [embed] });
    } catch (e) {
        console.error('❌ warnings:', e);
        await editReply(interaction, ERR);
    }
}

async function warningsAllExecute(interaction, { db }) {
    try {
        await interaction.deferReply({ ephemeral: true });
        const users = db.getAllUsers().filter(u => (u.warning_count || 0) > 0);
        if (!users.length) {
            return interaction.editReply({
                embeds: [
                    new EmbedBuilder()
                        .setColor(CONFIG.COLORS.success)
                        .setTitle('✅ لا إنذارات')
                        .setDescription('لا يوجد أعضاء لديهم إنذارات حالياً.')
                        .setTimestamp()
                ]
            });
        }
        const sorted = users.sort((a, b) => (b.warning_count || 0) - (a.warning_count || 0));
        const list = sorted
            .slice(0, 25)
            .map(
                u =>
                    '⚠️'.repeat(Math.min(u.warning_count || 0, 3)) +
                    ` **${u.name}** — <@${u.user_id}> (${u.warning_count}/3)`
            )
            .join('\n');
        const extra =
            sorted.length > 25 ? `\n_… و ${sorted.length - 25} آخرين_` : '';
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

async function warningsAutoToggleExecute(interaction, { db }) {
    try {
        await interaction.deferReply({ ephemeral: true });
        const enabled = db.toggleAutoWarnings();
        if (enabled) {
            await interaction.editReply(
                '✅ **تم تفعيل** نظام الإنذارات التلقائية. البوت سيقوم بفحص وتقييم الأعضاء أسبوعياً.'
            );
        } else {
            await interaction.editReply(
                '⏸️ **تم إيقاف** نظام الإنذارات التلقائية مؤقتاً.'
            );
        }
    } catch (e) {
        console.error('❌ warnings_auto_toggle:', e);
        await interaction.editReply(ERR).catch(() => {});
    }
}

// ==========================================
// timeout_list command (from maintenance.js)
// ==========================================

async function timeoutListExecute(interaction, { db }) {
    try {
        await interaction.deferReply({ ephemeral: true });
        const pending = db.getPendingTimeouts();
        if (!pending.length) {
            return interaction.editReply({
                embeds: [
                    new EmbedBuilder()
                        .setColor(CONFIG.COLORS.success)
                        .setTitle('⏱️ قائمة Timeout المعلقة')
                        .setDescription('لا يوجد أي timeout معلق حالياً.')
                        .setTimestamp()
                ]
            });
        }
        const list = pending
            .slice(0, 15)
            .map((p, i) => {
                const date = new Date(p.notified_at).toLocaleDateString('ar-EG');
                return `${i + 1}. **${p.name || p.user_id}** <@${p.user_id}>\n   الإنذارات: ${
                    p.warning_count
                }/3 · منذ: ${date}`;
            })
            .join('\n\n');
        const extra =
            pending.length > 15 ? `\n_… و ${pending.length - 15} آخرين_` : '';
        const embed = new EmbedBuilder()
            .setColor(CONFIG.COLORS.warning)
            .setTitle('⏱️ قائمة Timeout المعلقة')
            .setDescription(list + extra)
            .setFooter({ text: 'التنفيذ عبر الأزرار في قناة الأدمن' })
            .setTimestamp();
        await interaction.editReply({ embeds: [embed] });
    } catch (e) {
        console.error('❌ timeout_list:', e);
        await interaction.editReply(ERR).catch(() => {});
    }
}

// ==========================================
// Radar V2 — نشاط الأعضاء
// ==========================================

function buildDateRange(days) {
    const TZ = process.env.TIMEZONE || 'Africa/Cairo';
    const cairoNow = new Date(new Date().toLocaleString('en-US', { timeZone: TZ }));

    // لو قبل 10 بليل، اليوم الأخير هو امبارح عشان التقرير اليومي لسه ما نزلش
    const hour = cairoNow.getHours();
    const end = new Date(
        cairoNow.getFullYear(),
        cairoNow.getMonth(),
        cairoNow.getDate()
    );
    if (hour < 22) {
        end.setDate(end.getDate() - 1);
    }

    const start = new Date(end);
    start.setDate(start.getDate() - (days - 1));

    const toISO = d => {
        const y = d.getFullYear();
        const m = String(d.getMonth() + 1).padStart(2, '0');
        const day = String(d.getDate()).padStart(2, '0');
        return `${y}-${m}-${day}`;
    };

    return { startStr: toISO(start), endStr: toISO(end) };
}

async function segmentUsersByReports(db, days, guild) {
    const { startStr, endStr } = buildDateRange(days);
    const allUsers = db.getAllUsers();

    // Fetch all members once using cache
    let guildMembers = guild.members.cache;
    if (guildMembers.size < 2) {
        guildMembers = await guild.members.fetch({ time: 15000 }).catch(() => guild.members.cache);
    }

    const complete = [];
    const good = [];
    const danger = [];
    const zero = [];

    for (const u of allUsers) {
        const member = guildMembers.get(u.user_id);
        if (!member) continue;
        if (process.env.MEMBER_ROLE_ID && !member.roles.cache.has(process.env.MEMBER_ROLE_ID)) continue;

        const count = db.getReportCountInRange(u.user_id, startStr, endStr);
        const entry = { ...u, reportCount: count };

        if (count === days) complete.push(entry);
        else if (count > Math.floor(days / 2) && count < days) good.push(entry);
        else if (count > 0 && count <= Math.floor(days / 2)) danger.push(entry);
        else zero.push(entry);
    }

    return { complete, good, danger, zero, startStr, endStr };
}

async function showRadarCategoryPage(interaction, adminId, pageIndex, days, data) {
    const cat = RADAR_CATEGORIES[pageIndex];
    const members = data[cat.key] || [];

    const formatList = arr =>
        arr.length ? arr.slice(0, 25).map(u => `<@${u.user_id}>`).join('\n') : '—';

    const formatWithCounts = arr =>
        arr.length ? arr.slice(0, 25).map(u => `<@${u.user_id}> — ${u.reportCount ?? 0} تقارير`).join('\n') : '—';

    const value = (cat.key === 'complete' || cat.key === 'zero')
        ? formatList(members)
        : formatWithCounts(members);

    const embed = new EmbedBuilder()
        .setColor(cat.color)
        .setTitle(`📡 رادار النشاط — ${cat.emoji} ${cat.label}`)
        .setDescription(`تحليل نشاط الأعضاء خلال آخر **${days}** يوم.\nالفترة: **${data.rangeLabel}**`)
        .addFields({
            name: `${cat.emoji} ${cat.label} (${members.length} عضو)`,
            value: value || '—',
            inline: false
        })
        .setFooter({ text: `الصفحة ${pageIndex + 1} من ${RADAR_CATEGORIES.length}` });

    const navRow = new ActionRowBuilder();

    if (pageIndex > 0) {
        navRow.addComponents(
            new ButtonBuilder()
                .setCustomId(`btn_radar_cat_${adminId}_${pageIndex - 1}_${days}`)
                .setLabel('◀️ السابق')
                .setStyle(ButtonStyle.Secondary)
        );
    }

    if (pageIndex < RADAR_CATEGORIES.length - 1) {
        navRow.addComponents(
            new ButtonBuilder()
                .setCustomId(`btn_radar_cat_${adminId}_${pageIndex + 1}_${days}`)
                .setLabel('التالي ▶️')
                .setStyle(ButtonStyle.Secondary)
        );
    }

    const nudgeRow = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId(`btn_radar_nudge_${cat.key}_${days}`)
            .setLabel(`🔔 تنبيه ${cat.label}`)
            .setStyle(cat.key === 'zero' ? ButtonStyle.Danger : cat.key === 'danger' ? ButtonStyle.Primary : ButtonStyle.Success)
            .setDisabled(members.length === 0)
    );

    await interaction.editReply({ embeds: [embed], components: [navRow, nudgeRow] });
}

async function radarExecute(interaction, { db }) {
    try {
        await interaction.deferReply({ ephemeral: true });
        const daysInput = interaction.options.getInteger('days');
        const days = daysInput && daysInput > 0 ? daysInput :7;

        const { complete, good, danger, zero, startStr, endStr } = await segmentUsersByReports(
            db, days, interaction.guild
        );

        const rangeLabel = days === 1 ? startStr : `${startStr} → ${endStr}`;

        _radarSelectionCache.set(`overview_${interaction.user.id}`, {
            days, complete, good, danger, zero, rangeLabel
        });

        await showRadarCategoryPage(interaction, interaction.user.id, 0, days, { complete, good, danger, zero, rangeLabel });
    } catch (e) {
        console.error('❌ radar:', e);
        await interaction.editReply(ERR).catch(() => {});
    }
}

async function handleRadarCategoryNav(interaction) {
    try {
        await interaction.deferUpdate();
        const parts = interaction.customId.split('_'); // btn_radar_cat_adminId_pageIndex_days
        const adminId = parts[3];
        const pageIndex = parseInt(parts[4], 10);
        const days = parseInt(parts[5], 10) || 7;

        const cached = _radarSelectionCache.get(`overview_${adminId}`);
        if (!cached) {
            return interaction.editReply({ content: '❌ انتهت الجلسة، أعد تشغيل الرادار.', embeds: [], components: [] });
        }

        await showRadarCategoryPage(interaction, adminId, pageIndex, days, cached);
    } catch (e) {
        console.error('❌ handleRadarCategoryNav:', e);
    }
}

// Cache for Radar V2 nudges
const _radarNudgeCache = new Map();
const _radarSelectionCache = new Map(); // stores { type, days, targets, excluded, page }

async function handleRadarNudgeButton(interaction, deps) {
    try {
        const parts = interaction.customId.split('_');
        const type = parts[3];
        const days = parseInt(parts[4], 10) || 7;

        await interaction.deferReply({ ephemeral: true });

        const { db } = deps;
        const { complete, good, danger, zero } = await segmentUsersByReports(db, days, interaction.guild);

        const allTargets = type === 'zero' ? zero : type === 'danger' ? danger : type === 'complete' ? complete : good;

        if (!allTargets.length) {
            return interaction.editReply(`ℹ️ لا يوجد أعضاء في فئة ${type === 'zero' ? 'المختفي' : type === 'danger' ? 'في خطر' : 'أداء جيد'}.`);
        }

        _radarSelectionCache.set(interaction.user.id, {
            type, days,
            targets: allTargets,
            excluded: new Set(),
            page: 0
        });

        await showRadarSelectionPage(interaction, type, days, allTargets, new Set(), 0);
    } catch (e) {
        console.error('❌ handleRadarNudgeButton:', e);
        await interaction.editReply(ERR).catch(() => {});
    }
}

async function showRadarSelectionPage(interaction, type, days, targets, excluded, page) {
    const PAGE_SIZE = 25;
    const totalPages = Math.ceil(targets.length / PAGE_SIZE);
    const pageTargets = targets.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);
    const remaining = targets.filter(u => !excluded.has(u.user_id));

    const typeLabel = type === 'zero' ? '🔴 المختفي' : type === 'danger' ? '🟠 في خطر' : type === 'complete' ? '� ملتزم تماماً' : '⭐ أداء جيد';

    const embed = new EmbedBuilder()
        .setColor(type === 'zero' ? 0xF15946 : type === 'danger' ? 0xF9C22E : type === 'complete' ? 0xF9C22E : 0xF9C22E)
        .setTitle(`📡 اختيار الأعضاء — ${typeLabel}`)
        .setDescription(
            `إجمالي الأعضاء: **${targets.length}** | سيتم الإرسال لـ: **${remaining.length}**\n` +
            `الصفحة ${page + 1} من ${totalPages}\n\n` +
            `اختر الأعضاء اللي **مش** عايز تبعتلهم من القائمة أدناه:` 
        )
        .addFields({
            name: `أعضاء الصفحة الحالية (${pageTargets.length})`,
            value: pageTargets.map(u => `${excluded.has(u.user_id) ? '~~' : ''}<@${u.user_id}>${excluded.has(u.user_id) ? '~~ ❌' : ''}`).join(' · ') || '—'
        });

    const components = [];

    // Select menu to exclude members (only if there are members on this page)
    if (pageTargets.length === 0) {
        await interaction.editReply({ content: '❌ لا يوجد أعضاء في هذه الصفحة.', embeds: [], components: [] });
        return;
    }

    const selectMenu = new StringSelectMenuBuilder()
        .setCustomId(`radar_exclude_${type}_${days}_${page}`)
        .setPlaceholder('اختر أعضاء لاستثنائهم من الإرسال (اختياري)')
        .setMinValues(0)
        .setMaxValues(Math.max(1, pageTargets.length))
        .addOptions(pageTargets.map(u => ({
            label: (u.name || u.user_id).slice(0, 25),
            value: u.user_id,
            default: excluded.has(u.user_id),
            description: `${u.reportCount ?? 0} تقارير` 
        })));

    components.push(new ActionRowBuilder().addComponents(selectMenu));

    // Navigation + action buttons
    const navRow = new ActionRowBuilder();

    if (page > 0) {
        navRow.addComponents(
            new ButtonBuilder()
                .setCustomId(`btn_radar_page_${type}_${days}_${page - 1}`)
                .setLabel('◀️ السابق')
                .setStyle(ButtonStyle.Secondary)
        );
    }

    if (page < totalPages - 1) {
        navRow.addComponents(
            new ButtonBuilder()
                .setCustomId(`btn_radar_page_${type}_${days}_${page + 1}`)
                .setLabel('التالي ▶️')
                .setStyle(ButtonStyle.Secondary)
        );
    }

    navRow.addComponents(
        new ButtonBuilder()
            .setCustomId(`btn_radar_confirm_${type}_${days}`)
            .setLabel(`✅ متابعة (${remaining.length} عضو)`)
            .setStyle(ButtonStyle.Success)
            .setDisabled(remaining.length === 0)
    );

    components.push(navRow);

    await interaction.editReply({ embeds: [embed], components });
}

async function processRadarNudgeModal(interaction) {
    await interaction.deferReply({ ephemeral: true });
    try {
        const parts = interaction.customId.split('_'); // modal_radar_type_days
        const type = parts[2];
        const days = parseInt(parts[3], 10) || 7;

        const message = interaction.fields
            .getTextInputValue('radar_message')
            .trim();

        _radarNudgeCache.set(interaction.user.id, {
            type,
            days,
            message
        });

        const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setCustomId(`btn_radar_send_dm_${type}_${days}`)
                .setLabel('📩 DM فقط')
                .setStyle(ButtonStyle.Secondary),
            new ButtonBuilder()
                .setCustomId(`btn_radar_send_thread_${type}_${days}`)
                .setLabel('💬 في المساحات فقط')
                .setStyle(ButtonStyle.Primary),
            new ButtonBuilder()
                .setCustomId(`btn_radar_send_both_${type}_${days}`)
                .setLabel('📩 + 💬 الاثنين معًا')
                .setStyle(ButtonStyle.Success)
        );

        await interaction.editReply({
            content: 'اختر طريقة الإرسال:',
            components: [row]
        });
    } catch (e) {
        console.error('❌ processRadarNudgeModal:', e);
        await interaction.editReply(ERR).catch(() => {});
    }
}

async function handleRadarExcludeSelect(interaction) {
    try {
        await interaction.deferUpdate();
        const parts = interaction.customId.split('_'); // radar_exclude_type_days_page
        const type = parts[2];
        const days = parseInt(parts[3], 10) || 7;
        const page = parseInt(parts[4], 10) || 0;

        const selected = interaction.values; // user IDs to exclude
        const cached = _radarSelectionCache.get(interaction.user.id);
        if (!cached) return;

        // Update excluded: remove all on this page first, then add selected
        const PAGE_SIZE = 25;
        const pageTargets = cached.targets.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);
        for (const u of pageTargets) cached.excluded.delete(u.user_id);
        for (const uid of selected) cached.excluded.add(uid);

        await showRadarSelectionPage(interaction, type, days, cached.targets, cached.excluded, page);
    } catch (e) {
        console.error('❌ handleRadarExcludeSelect:', e);
    }
}

async function handleRadarPageNav(interaction) {
    try {
        await interaction.deferUpdate();
        const parts = interaction.customId.split('_'); // btn_radar_page_type_days_newpage
        const type = parts[3];
        const days = parseInt(parts[4], 10) || 7;
        const newPage = parseInt(parts[5], 10) || 0;

        const cached = _radarSelectionCache.get(interaction.user.id);
        if (!cached) return;

        cached.page = newPage;
        await showRadarSelectionPage(interaction, type, days, cached.targets, cached.excluded, newPage);
    } catch (e) {
        console.error('❌ handleRadarPageNav:', e);
    }
}

async function handleRadarConfirm(interaction) {
    try {
        const parts = interaction.customId.split('_'); // btn_radar_confirm_type_days
        const type = parts[3];
        const days = parseInt(parts[4], 10) || 7;

        const cached = _radarSelectionCache.get(interaction.user.id);
        if (!cached) return interaction.reply({ content: '❌ انتهت الجلسة.', ephemeral: true });

        const pool = NUDGE_MESSAGES[type] || NUDGE_MESSAGES.zero;
        const defaultText = pool[Math.floor(Math.random() * pool.length)];

        const modal = new ModalBuilder()
            .setCustomId(`modal_radar_${type}_${days}`)
            .setTitle(`رسالة التنبيه — ${type === 'zero' ? '🔴 المختفي' : type === 'danger' ? '🟠 في خطر' : '🌟 أداء جيد'}`);

        modal.addComponents(
            new ActionRowBuilder().addComponents(
                new TextInputBuilder()
                    .setCustomId('radar_message')
                    .setLabel('نص رسالة التنبيه')
                    .setStyle(TextInputStyle.Paragraph)
                    .setRequired(true)
                    .setValue(defaultText)
            )
        );

        await interaction.showModal(modal);
    } catch (e) {
        console.error('❌ handleRadarConfirm:', e);
    }
}

async function executeRadarRouting(interaction, { db, client }) {
    try {
        await interaction.deferReply({ ephemeral: true });

        const parts = interaction.customId.split('_'); // btn_radar_send_method_type_days
        const method = parts[3]; // dm | thread | both
        const type = parts[4]; // zero | danger | good
        const days = parseInt(parts[5], 10) || 7;

        const cached = _radarNudgeCache.get(interaction.user.id);
        if (!cached || cached.type !== type || cached.days !== days) {
            return interaction.editReply(
                '❌ لا يوجد رسالة مخزنة لهذه الجلسة. يرجى إعادة تشغيل الرادار واختيار الرسالة.'
            );
        }

        const { message } = cached;
        
        const selectionCached = _radarSelectionCache.get(interaction.user.id);
        let targets;
        if (selectionCached && selectionCached.type === type && selectionCached.days === days && selectionCached.targets) {
            // Use cached targets with exclusions applied
            targets = selectionCached.targets.filter(u => !selectionCached.excluded.has(u.user_id));
        } else {
            // Fallback: fetch fresh
            const { good, danger, zero } = await segmentUsersByReports(db, days, interaction.guild);
            targets = type === 'zero' ? zero : type === 'danger' ? danger : good;
        }

        if (!targets.length) {
            return interaction.editReply(
                'ℹ️ لا يوجد أعضاء مستهدفين لهذه الفئة حاليًا.'
            );
        }

        const validTargets = targets;
        let members = new Collection();
        try {
            members = await interaction.guild.members.fetch({ time: 30000 });
        } catch (err) {
            console.log('Radar member fetch timed out gracefully.');
        }

        if (!validTargets.length) {
            return interaction.editReply(
                'ℹ️ لا يوجد أعضاء صالحين للإرسال بعد التحقق من العضوية.'
            );
        }

        let dmSent = 0;
        let threadSent = 0;
        let failed = 0;

        for (const user of validTargets) {
            let dmOk = false;
            let threadOk = false;

            const userName = user.name || 'عضو';
            const personalizedMessage = message
                .replace(/{name}/g, userName)
                .replace(/{count}/g, String(user.reportCount ?? 0))
                .replace(/{days}/g, String(days));

            if (method === 'dm' || method === 'both') {
                try {
                    const dmUser = await client.users.fetch(user.user_id);
                    await dmUser.send(personalizedMessage);
                    dmOk = true;
                    dmSent++;
                } catch (_) {
                    // DM failed
                }
            }

            if (method === 'thread' || method === 'both') {
                if (user.thread_id) {
                    try {
                        const thread = await client.channels.fetch(user.thread_id);
                        if (thread) {
                            await thread.send(personalizedMessage);
                            threadOk = true;
                            threadSent++;
                        }
                    } catch (_) {
                        threadOk = false;
                    }
                }
            }

            if (!dmOk && !threadOk) {
                failed++;
            }

            await new Promise(res => setTimeout(res, 300));
        }

        await interaction.editReply(
            `✅ تم إرسال تنبيه الرادار لفئة **${type === 'zero' ? 'المختفي' : type === 'danger' ? 'في خطر' : type === 'complete' ? 'ملتزم تماماً' : 'أداء جيد'}** خلال آخر ${days} يوم.\n` +
                `• DM: ${dmSent}\n` +
                `• Threads: ${threadSent}\n` +
                `• فشل الإرسال: ${failed}`
        );
    } catch (e) {
        console.error('❌ executeRadarRouting:', e);
        await interaction.editReply(ERR).catch(() => {});
    }
}

// ==========================================
// Central handler for /admin users group
// ==========================================

// ==========================================
// 🧹 CLEAN DEPARTED USERS - Admin cleanup command
// ==========================================

async function cleanDepartedExecute(interaction, { db, client }) {
    await interaction.deferReply({ ephemeral: true });
    
    try {
        const allUsers = db.getAllUsers();
        // هنجيب الناس اللي ليهم مساحات مربوطة فعلاً
        const safeUsers = allUsers.filter(u => u.thread_id !== null);

        if (safeUsers.length === 0) {
            return interaction.editReply('⚠️ مفيش أي حد مربوط بمساحة حالياً.');
        }

        let msg = `📊 **تقرير بالأعضاء اللي مساحاتهم متسجلة بأمان (عددهم: ${safeUsers.length}):**\n\n`;

        // هنجيب أول 10 أشخاص عشان رسالة ديسكورد متطولش وتتبعت بدون مشاكل
        const limit = Math.min(10, safeUsers.length);
        for (let i = 0; i < limit; i++) {
            const u = safeUsers[i];
            let userHabits = [];
            
            try {
                // بنقرأ عاداتهم من الداتابيز
                userHabits = db.db.prepare('SELECT * FROM habits WHERE user_id = ?').all(u.user_id);
            } catch(e) {}
            
            msg += `👤 **${u.name}** ➡️ مساحته: <#${u.thread_id}>\n`;
            
            if (userHabits.length > 0) {
                msg += `✅ متسجل ليه **${userHabits.length}** عادات.\n`;
                // نطبع أول عادتين كمثال للتقدم
                const sampleHabits = userHabits.slice(0, 2);
                for (const habit of sampleHabits) {
                    msg += `   - عادة: "${habit.habit_name}" (أنجز منها: ${habit.current_progress || 0})\n`;
                }
                msg += '\n';
            } else {
                msg += `⚠️ معندوش عادات متسجلة لسه.\n\n`;
            }
        }

        if (safeUsers.length > 10) {
            msg += `\n*...و ${safeUsers.length - 10} أعضاء كمان مساحاتهم وعاداتهم في الأمان التام.*`;
        }

        await interaction.editReply({ content: msg.substring(0, 1900) });
    } catch (e) {
        console.error('❌ Safe Users Scan Error:', e);
        await interaction.editReply(`❌ حدث خطأ: ${e.message}`);
    }
}

// ==========================================
// 🗄️ ARCHIVE/RESTORE SYSTEM - Member Archive/Restore
// ==========================================

async function archiveExecute(interaction, { db, client }) {
    await interaction.deferReply({ ephemeral: true });
    
    try {
        const userOpt = interaction.options.getUser('user');
        const userId = userOpt.id;
        const user = db.getUser(userId);
        
        if (!user) {
            return interaction.editReply('❌ العضو غير مسجل في النظام.');
        }
        
        if (user.status === 'archived') {
            return interaction.editReply('⚠️ هذا العضو مجمد بالفعل.');
        }
        
        // Safety: Add confirmation before archiving
        
        await interaction.editReply({ content: '⏳ جارٍ التحضير...' });
        
        const confirmed = await createConfirmation(interaction, {
            title: '⚠️ تجميد عضو',
            description: `سيتم تجميد ${user.name} وأرشفة مساحته. يمكن استعادته لاحقاً.`,
            confirmLabel: '✅ نعم، جمّد العضو',
            cancelLabel: '❌ إلغاء'
        });
        
        if (!confirmed) return;
        
        // Auto-backup before executing
        db.safeBackup('before-archive');
        
        // Archive the user
        db.archiveUser(userId);
        
        // Archive the thread if it exists
        if (user.thread_id) {
            try {
                const thread = await client.channels.fetch(user.thread_id).catch(() => null);
                if (thread) {
                    await thread.setArchived(true).catch(() => {});
                }
            } catch (e) {
                console.error('❌ Archive thread error:', e.message);
            }
        }
        
        await interaction.editReply(`✅ تم تجميد ${user.name} وأرشفة مساحته.`);
        
    } catch (e) {
        console.error('❌ archiveExecute error:', e);
        await interaction.editReply('❌ حدث خطأ أثناء تجميد العضو.');
    }
}

async function restoreExecute(interaction, { db, client }) {
    await interaction.deferReply({ ephemeral: true });
    
    try {
        const userOpt = interaction.options.getUser('user');
        const userId = userOpt.id;
        const user = db.getUser(userId);
        
        if (!user) {
            return interaction.editReply('❌ العضو غير مسجل في النظام.');
        }
        
        if (user.status !== 'archived') {
            return interaction.editReply('⚠️ هذا العضو ليس مجمداً.');
        }
        
        // Restore the user
        db.restoreUser(userId);
        
        // Try to unarchive their thread
        if (user.thread_id) {
            try {
                const thread = await client.channels.fetch(user.thread_id).catch(() => null);
                if (thread) {
                    if (thread.archived) {
                        await thread.setArchived(false).catch(() => {});
                    }
                    // Rebuild dashboard
                    await updateDashboard(thread, userId, db);
                    return interaction.editReply(`✅ تم استعادة ${user.name}. مساحته: <#${user.thread_id}>`);
                }
            } catch (e) {
                console.error('❌ Restore thread error:', e.message);
            }
        }
        
        await interaction.editReply(`✅ تم استعادة ${user.name}.`);
        
    } catch (e) {
        console.error('❌ restoreExecute error:', e);
        await interaction.editReply('❌ حدث خطأ أثناء استعادة العضو.');
    }
}

async function deleteExecute(interaction, { db, client }) {
    await interaction.deferReply({ ephemeral: true });
    
    try {
        const userOpt = interaction.options.getUser('user');
        const userId = userOpt.id;
        const user = db.getUser(userId);
        
        if (!user) {
            return interaction.editReply('❌ العضو غير مسجل في النظام.');
        }
        
        // Safety: Add confirmation before permanent deletion
        
        await interaction.editReply({ content: '⏳ جارٍ التحضير...' });
        
        const confirmed = await createConfirmation(interaction, {
            title: '🗑️ حذف نهائي',
            description: `سيتم حذف كل بيانات ${user.name} نهائياً. **لا يمكن التراجع.**`,
            confirmLabel: '🗑️ نعم، احذف نهائياً',
            cancelLabel: '❌ إلغاء'
        });
        
        if (!confirmed) return;
        
        // Auto-backup before executing
        db.safeBackup('before-permanent-delete');
        
        // Delete the thread if it exists
        if (user.thread_id) {
            try {
                const thread = await client.channels.fetch(user.thread_id).catch(() => null);
                if (thread) {
                    await thread.delete().catch(() => {});
                }
            } catch (e) {
                console.error('❌ Delete thread error:', e.message);
            }
        }
        
        // Permanently delete user data
        db.deleteUserPermanently(userId);
        
        await interaction.editReply(`✅ تم الحذف النهائي لبيانات ${user.name}.`);
        
    } catch (e) {
        console.error('❌ deleteExecute error:', e);
        await interaction.editReply('❌ حدث خطأ أثناء حذف العضو.');
    }
}

async function archivedExecute(interaction, { db }) {
    await interaction.deferReply({ ephemeral: true });
    
    try {
        const archivedUsers = db.getArchivedUsers();
        
        if (!archivedUsers.length) {
            return interaction.editReply('لا يوجد أعضاء مجمّدون حالياً.');
        }
        
        const embed = new EmbedBuilder()
            .setColor(CONFIG.COLORS.warning)
            .setTitle('🗄️ الأعضاء المجمّدون')
            .setDescription(`قائمة الأعضاء المجمدين (${archivedUsers.length} عضو)`)
            .setTimestamp();
        
        for (const user of archivedUsers) {
            const createdDate = user.created_at ? new Date(user.created_at).toLocaleDateString('ar-EG') : 'غير معروف';
            const threadInfo = user.thread_id ? `<#${user.thread_id}>` : 'لا يوجد مساحة';
            
            embed.addFields({
                name: `${user.name} (<@${user.user_id}>)`,
                value: `📅 انضم: ${createdDate}\n🧵 المساحة: ${threadInfo}`,
                inline: false
            });
        }
        
        await interaction.editReply({ embeds: [embed] });
        
    } catch (e) {
        console.error('❌ archivedExecute error:', e);
        await interaction.editReply('❌ حدث خطأ أثناء عرض الأعضاء المجمدة.');
    }
}

async function handleSyncMembersButtons(interaction, { db, client }) {
    try {
        await interaction.deferUpdate();
        const cached = _radarSelectionCache.get(`sync_members_${interaction.user.id}`);
        if (!cached) {
            return interaction.editReply({ content: '❌ انتهت الجلسة، أعد تشغيل الأمر.', embeds: [], components: [] });
        }

        const toArchive = interaction.customId === 'btn_archive_departed'
            ? cached.departed
            : cached.noRole;

        db.safeBackup('before-bulk-archive');

        let count = 0;
        for (const u of toArchive) {
            db.archiveUser(u.user_id);
            if (u.thread_id) {
                try {
                    const thread = await client.channels.fetch(u.thread_id).catch(() => null);
                    if (thread) await thread.setArchived(true).catch(() => {});
                } catch (_) {}
            }
            count++;
            await new Promise(r => setTimeout(r, 200));
        }

        _radarSelectionCache.delete(`sync_members_${interaction.user.id}`);
        await interaction.editReply({ content: `✅ تم أرشفة **${count}** عضو بنجاح.`, embeds: [], components: [] });
    } catch (e) {
        console.error('❌ handleSyncMembersButtons:', e);
    }
}

async function syncMembersExecute(interaction, { db, client }) {
    await interaction.deferReply({ ephemeral: true });
    try {
        const guild = interaction.guild;
        // Fetch members with roles populated
        await guild.roles.fetch().catch(() => {});
        let guildMembers;
        try {
            guildMembers = await guild.members.fetch();
            console.log(`✅ members fetched: ${guildMembers.size}`);
        } catch (e) {
            console.error('❌ members fetch error:', e.message);
            guildMembers = guild.members.cache;
            console.log(`⚠️ cache fallback: ${guildMembers.size}`);
        }
        if (!guildMembers || guildMembers.size === 0) {
            return interaction.editReply('❌ تعذر جلب أعضاء السيرفر. حاول مرة أخرى.');
        }

        const allUsers = db.getAllUsers();
        const active = [];
        const noRole = [];
        const departed = [];

        // Build a plain Map with string keys for reliable lookup
        const memberMap = new Map();
        guildMembers.forEach(m => memberMap.set(m.user.id, m));

        for (const u of allUsers) {
            if (u.status === 'archived') continue; // skip already archived
            const member = memberMap.get(String(u.user_id));
            if (!member) {
                departed.push(u);
            } else if (process.env.MEMBER_ROLE_ID && !member.roles.cache.has(process.env.MEMBER_ROLE_ID)) {
                noRole.push(u);
            } else {
                active.push(u);
            }
        }

        const fmt = arr => arr.length ? arr.map(u => `**${u.name}**`).join('، ') : '—';

        const embed = new EmbedBuilder()
            .setColor(0xF9C22E)
            .setTitle('👥 مراجعة الأعضاء')
            .addFields(
                { name: `✅ نشط (${active.length})`, value: fmt(active).slice(0, 500), inline: false },
                { name: `⚠️ بدون رول (${noRole.length})`, value: fmt(noRole).slice(0, 500), inline: false },
                { name: `❌ غادر السيرفر (${departed.length})`, value: fmt(departed).slice(0, 500), inline: false }
            )
            .setFooter({ text: `إجمالي في الداتابيز: ${allUsers.length}` });

        const rows = [];

        if (departed.length > 0) {
            rows.push(new ActionRowBuilder().addComponents(
                new ButtonBuilder()
                    .setCustomId('btn_archive_departed')
                    .setLabel(`🗃️ أرشف الغادرين (${departed.length})`)
                    .setStyle(ButtonStyle.Danger)
            ));
        }

        if (noRole.length > 0) {
            rows.push(new ActionRowBuilder().addComponents(
                new ButtonBuilder()
                    .setCustomId('btn_archive_norole')
                    .setLabel(`🗃️ أرشف بدون رول (${noRole.length})`)
                    .setStyle(ButtonStyle.Secondary)
            ));
        }

        // Cache for button handlers
        _radarSelectionCache.set(`sync_members_${interaction.user.id}`, { departed, noRole });

        await interaction.editReply({ embeds: [embed], components: rows });
    } catch (e) {
        console.error('❌ syncMembersExecute:', e);
        await interaction.editReply('❌ حدث خطأ أثناء مراجعة الأعضاء.').catch(() => {});
    }
}

async function handleUsers(interaction, deps) {
    const sub = interaction.options.getSubcommand();
    switch (sub) {
        case 'warn':
            return warnExecute(interaction, deps);
        case 'remove_warn':
            return removeWarnExecute(interaction, deps);
        case 'clear_warns':
            return clearWarnsExecute(interaction, deps);
        case 'warnings':
            return warningsExecute(interaction, deps);
        case 'warnings_all':
            return warningsAllExecute(interaction, deps);
        case 'warnings_auto_toggle':
            return warningsAutoToggleExecute(interaction, deps);
        case 'timeout_list':
            return timeoutListExecute(interaction, deps);
        case 'radar':
            return radarExecute(interaction, deps);
        case 'clean_departed':
            return cleanDepartedExecute(interaction, deps);
        case 'sync_members':
            return syncMembersExecute(interaction, deps);
        case 'archive':
            return archiveExecute(interaction, deps);
        case 'restore':
            return restoreExecute(interaction, deps);
        case 'delete':
            return deleteExecute(interaction, deps);
        case 'archived':
            return archivedExecute(interaction, deps);
        default:
            throw new Error(`Unknown users subcommand: ${sub}`);
    }
}

module.exports = {
    handleUsers,
    issueWarning,
    handleRadarNudgeButton,
    processRadarNudgeModal,
    executeRadarRouting,
    handleRadarExcludeSelect,
    handleRadarPageNav,
    handleRadarConfirm,
    handleRadarCategoryNav,
    handleSyncMembersButtons
};


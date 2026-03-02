const {
    EmbedBuilder,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    ModalBuilder,
    TextInputBuilder,
    TextInputStyle,
    Collection
} = require('discord.js');
const CONFIG = require('../config');

const ERR = CONFIG.ADMIN?.unifiedErrorMessage || '❌ حدث خطأ داخلي، تمت كتابة التفاصيل في السجل.';

// ==========================================
// ⚠️ issueWarning + helpers (from warnings.js)
// ==========================================

async function issueWarning(userId, reason, adminId, { db, client }) {
    const user = db.getUser(userId);
    if (!user) return;

    const newCount = db.addWarning(userId, reason, adminId);
    if (newCount < 0) return;

    const emoji = ['1️⃣', '2️⃣', '3️⃣'][newCount - 1] || '⚠️';

    if (user.thread_id) {
        const thread = await client.channels.fetch(user.thread_id).catch(() => null);
        if (thread) {
            await thread
                .send(
                    `${emoji} **إنذار رسمي #${newCount}** <@${userId}>\n\n` +
                        `**السبب:** ${reason}\n\n` +
                        (newCount >= 3
                            ? '🚨 هذا إنذارك الثالث — ستتم مراجعة حالتك مع الإدارة.'
                            : 'الإنذار يُرفع تلقائياً بعد أسبوعين التزام متتالي. 💪')
                )
                .catch(() => {});
        }
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
                const { ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
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
    const today = new Date();
    const end = new Date(
        today.getFullYear(),
        today.getMonth(),
        today.getDate()
    );
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
    
    const complete = [];
    const good = [];
    const danger = [];
    const zero = [];

    // هنلف على الأعضاء من الداتابيز مباشرة عشان نضمن السرعة
    for (const u of allUsers) {
        // فحص العضو بشكل فردي عشان نتجنب الـ Timeout
        const member = await guild.members.fetch(u.user_id).catch(() => null);
        
        // لو العضو خرج من السيرفر، أو معندوش رول الأعضاء -> تجاهل
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

async function radarExecute(interaction, { db }) {
    try {
        await interaction.deferReply({ ephemeral: true });
        const daysInput = interaction.options.getInteger('days');
        const days = daysInput && daysInput > 0 ? daysInput : 7;

        const { complete, good, danger, zero, startStr, endStr } = await segmentUsersByReports(
            db,
            days,
            interaction.guild
        );

        const rangeLabel =
            days === 1
                ? startStr
                : `${startStr} → ${endStr}`;

        const formatList = arr =>
            arr.length
                ? arr
                      .slice(0, 30)
                      .map(u => `<@${u.user_id}>`)
                      .join(' · ')
                : '—';

        const formatWithCounts = arr =>
            arr.length
                ? arr
                      .slice(0, 30)
                      .map(
                          u =>
                              `<@${u.user_id}> (${u.reportCount} تقارير)`
                      )
                      .join('\n')
                : '—';

        const embed = new EmbedBuilder()
            .setColor(CONFIG.COLORS.primary)
            .setTitle('📡 رادار النشاط')
            .setDescription(
                `تحليل نشاط الأعضاء خلال آخر **${days}** يوم.\n` +
                    `الفترة: **${rangeLabel}**`
            )
            .addFields(
                {
                    name: `🟢 **ملتزم تماماً** (${complete.length})`,
                    value: formatList(complete),
                    inline: false
                },
                {
                    name: `� **أداء جيد** (${good.length})`,
                    value: formatWithCounts(good),
                    inline: false
                },
                {
                    name: `🟡 **في خطر** (${danger.length})`,
                    value: formatWithCounts(danger),
                    inline: false
                },
                {
                    name: `🔴 **مختفي** (${zero.length})`,
                    value: formatList(zero),
                    inline: false
                }
            );

        const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setCustomId(`btn_radar_nudge_zero_${days}`)
                .setLabel('🔔 المختفي')
                .setStyle(ButtonStyle.Danger),
            new ButtonBuilder()
                .setCustomId(`btn_radar_nudge_danger_${days}`)
                .setLabel('🔔 في خطر')
                .setStyle(ButtonStyle.Primary),
            new ButtonBuilder()
                .setCustomId(`btn_radar_nudge_good_${days}`)
                .setLabel('🌟 تشجيع الجيد')
                .setStyle(ButtonStyle.Success)
        );

        await interaction.editReply({
            embeds: [embed],
            components: [row]
        });
    } catch (e) {
        console.error('❌ radar:', e);
        await interaction.editReply(ERR).catch(() => {});
    }
}

// Cache for Radar V2 nudges
const _radarNudgeCache = new Map();

async function handleRadarNudgeButton(interaction) {
    try {
        const parts = interaction.customId.split('_'); // ['btn','radar','nudge',type,days]
        const type = parts[3]; // zero | danger | good
        const days = parseInt(parts[4], 10) || 7;

        const modal = new ModalBuilder()
            .setCustomId(`modal_radar_${type}_${days}`)
            .setTitle('رسالة التنبيه - رادار النشاط');

        const defaultText =
            type === 'zero'
                ? 'مفتقدينك في التقرير اليومي الفترة اللي فاتت، مستنيين نشوف عودتك قريبًا 🌱'
                : type === 'danger'
                ? 'خدنا بالنا إن تقاريرك متقطعة الفترة دي، شد حيلك والتزم معانا أكتر! 💪'
                : 'عاش جداً على مجهودك الأيام اللي فاتت! كمل على نفس المستوى وإحنا فخورين بيك 🌟';

        const input = new TextInputBuilder()
            .setCustomId('radar_message')
            .setLabel('نص رسالة التنبيه')
            .setStyle(TextInputStyle.Paragraph)
            .setRequired(true)
            .setValue(defaultText);

        modal.addComponents(new ActionRowBuilder().addComponents(input));

        await interaction.showModal(modal);
    } catch (e) {
        console.error('❌ handleRadarNudgeButton:', e);
    }
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
        const { complete, good, danger, zero } = await segmentUsersByReports(db, days, interaction.guild);

        const targets =
            type === 'zero'
                ? zero
                : type === 'danger'
                ? danger
                : good;

        if (!targets.length) {
            return interaction.editReply(
                'ℹ️ لا يوجد أعضاء مستهدفين لهذه الفئة حاليًا.'
            );
        }

        // Filter members again for safe sending
        let members;
        try {
            members = await interaction.guild.members.fetch({ time: 120000 }); // wait up to 2 minutes
        } catch (err) {
            console.log('Radar member fetch timed out gracefully.');
            members = new Collection(); // fallback to empty collection
        }
        const validTargets = targets.filter(user => {
            const member = members.get(user.user_id);
            return member && (!process.env.MEMBER_ROLE_ID || member.roles.cache.has(process.env.MEMBER_ROLE_ID));
        });

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

            if (method === 'dm' || method === 'both') {
                try {
                    const dmUser = await client.users.fetch(user.user_id);
                    await dmUser.send(message);
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
                            await thread.send(message);
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
            `✅ تم إرسال تنبيه الرادار لفئة **${type === 'zero' ? 'المختفي' : type === 'danger' ? 'في خطر' : 'أداء جيد'}** خلال آخر ${days} يوم.\n` +
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
    const fs = require('fs');
    const path = require('path');
    try {
        const dataPath = path.join(process.cwd(), 'data');
        let msg = '📁 **نتيجة البحث داخل مجلد data:**\n';
        
        if (fs.existsSync(dataPath)) {
            const files = fs.readdirSync(dataPath);
            msg += `\`\`\`\n${files.join('\n')}\n\`\`\`\n`;
            
            // البحث عن مجلد backups داخل data
            const backupPath = path.join(dataPath, 'backups');
            if (fs.existsSync(backupPath)) {
                const bFiles = fs.readdirSync(backupPath).filter(f => f.includes('.db') || f.includes('backup'));
                msg += `\n📦 **لقيت ملفات الباك أب دي:**\n\`\`\`\n${bFiles.join('\n')}\n\`\`\``;
            }
        } else {
            msg += '❌ المجلد مش موجود.';
        }
        
        await interaction.reply({ content: msg.substring(0, 1900), ephemeral: true });
    } catch(e) {
        await interaction.reply({ content: `❌ Error: ${e.message}`, ephemeral: true });
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
        default:
            throw new Error(`Unknown users subcommand: ${sub}`);
    }
}

module.exports = {
    handleUsers,
    issueWarning,
    handleRadarNudgeButton,
    processRadarNudgeModal,
    executeRadarRouting
};


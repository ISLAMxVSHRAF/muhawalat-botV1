const {
    EmbedBuilder,
    ModalBuilder,
    TextInputBuilder,
    TextInputStyle,
    ActionRowBuilder
} = require('discord.js');
const CONFIG = require('../config');

const ERR = CONFIG.ADMIN?.unifiedErrorMessage || '❌ حدث خطأ داخلي، تمت كتابة التفاصيل في السجل.';

// ==========================================
// AUTO RESPONDER — from autoResponder.js
// ==========================================

let _cache = [];
let _lastCacheTime = 0;
const CACHE_TTL = 30000;

function getResponsesCache(db) {
    if (Date.now() - _lastCacheTime > CACHE_TTL) {
        _cache = db.getAutoResponses(true);
        _lastCacheTime = Date.now();
    }
    return _cache;
}

function invalidateCache() {
    _lastCacheTime = 0;
}

async function handleAutoResponse(message, db) {
    if (message.author.bot) return;
    const responses = getResponsesCache(db);
    if (!responses.length) return;
    const content = message.content.toLowerCase();
    for (const r of responses) {
        if (r.channel_scope !== 'all') {
            const allowed = r.channel_scope.split(',').map(c => c.trim());
            if (!allowed.includes(message.channelId)) continue;
        }
        let matched =
            r.match_type === 'exact'
                ? content === r.trigger_text
                : r.match_type === 'startswith'
                ? content.startsWith(r.trigger_text)
                : content.includes(r.trigger_text);
        if (matched) {
            try {
                await message.reply(r.response_text);
            } catch (e) {
                console.error('❌ AutoRespond:', e.message);
            }
            break;
        }
    }
}

async function autorespondAddExecute(interaction, { db }) {
    try {
        const chStr = interaction.options.getString('channels')?.trim();
        const scope = chStr ? chStr.replace(/\s/g, '') : 'all';
        const matchType = interaction.options.getString('match') || 'contains';

        const modal = new ModalBuilder()
            .setCustomId(`modal_autorespond_add_${encodeURIComponent(scope)}_${matchType}`)
            .setTitle('إضافة رد تلقائي');
        modal.addComponents(
            new ActionRowBuilder().addComponents(
                new TextInputBuilder()
                    .setCustomId('trigger')
                    .setLabel('الكلمة أو الجملة المحفزة')
                    .setStyle(TextInputStyle.Short)
                    .setRequired(true)
            ),
            new ActionRowBuilder().addComponents(
                new TextInputBuilder()
                    .setCustomId('response')
                    .setLabel('نص الرد')
                    .setStyle(TextInputStyle.Paragraph)
                    .setRequired(true)
            )
        );
        await interaction.showModal(modal);
    } catch (e) {
        console.error('❌ autorespond_add (show modal):', e);
        await interaction.reply({ content: ERR, ephemeral: true }).catch(() => {});
    }
}

async function processAutorespondAddModal(interaction, { db }) {
    try {
        await interaction.deferReply({ ephemeral: true });
        const parts = interaction.customId.split('_');
        // modal_autorespond_add_scope_match
        const scope = decodeURIComponent(parts[3]);
        const matchType = parts[4];

        const trigger = interaction.fields.getTextInputValue('trigger').trim().toLowerCase();
        const response = interaction.fields.getTextInputValue('response').trim();
        const ok = db.addAutoResponse(
            trigger,
            response,
            scope || 'all',
            matchType || 'contains'
        );
        invalidateCache();
        if (!ok) return interaction.editReply('❌ حدث خطأ أثناء حفظ الرد.');
        const mt = matchType || 'contains';
        const matchAr =
            mt === 'exact' ? 'تطابق تام' : mt === 'startswith' ? 'يبدأ بـ' : 'يحتوي على';
        await interaction.editReply(
            `✅ **تم إضافة رد تلقائي**\n🔍 "${trigger}" (${matchAr})\n💬 ${response.slice(
                0,
                60
            )}${response.length > 60 ? '...' : ''}\n📢 ${
                scope === 'all' ? 'كل القنوات' : scope
            }`
        );
    } catch (e) {
        console.error('❌ processAutorespondAddModal:', e);
        await interaction.editReply(ERR).catch(() => {});
    }
}

async function autorespondListExecute(interaction, { db }) {
    try {
        await interaction.deferReply({ ephemeral: true });
        const responses = db.getAutoResponses(false);
        if (!responses.length) {
            return interaction.editReply({
                embeds: [
                    new EmbedBuilder()
                        .setColor(CONFIG.COLORS.info)
                        .setTitle('🤖 الردود التلقائية')
                        .setDescription('لا توجد ردود تلقائية.')
                        .setTimestamp()
                ]
            });
        }
        const list = responses
            .slice(0, 20)
            .map(r => {
                const status = r.is_active ? '🟢' : '🔴';
                const m =
                    r.match_type === 'exact'
                        ? 'تام'
                        : r.match_type === 'startswith'
                        ? 'يبدأ'
                        : 'يحتوي';
                return `${status} **#${r.id}** \`${r.trigger_text}\` (${m})\n   → ${(
                    r.response_text || ''
                ).slice(0, 50)}… · ${
                    r.channel_scope === 'all' ? 'الكل' : r.channel_scope
                }`;
            })
            .join('\n\n');
        const extra =
            responses.length > 20 ? `\n_… و ${responses.length - 20} أخرى_` : '';
        const embed = new EmbedBuilder()
            .setColor(CONFIG.COLORS.primary)
            .setTitle('🤖 الردود التلقائية')
            .setDescription(list + extra)
            .setFooter({
                text: '/autorespond_toggle | /autorespond_delete'
            })
            .setTimestamp();
        await interaction.editReply({ embeds: [embed] });
    } catch (e) {
        console.error('❌ autorespond_list:', e);
        await interaction.editReply(ERR).catch(() => {});
    }
}

async function autorespondToggleExecute(interaction, { db }) {
    try {
        await interaction.deferReply({ ephemeral: true });
        const id = interaction.options.getInteger('id');
        if (id < 1)
            return interaction.editReply(
                '❌ يرجى إدخال رقم صحيح (معرف الرد).'
            );
        db.toggleAutoResponse(id);
        invalidateCache();
        await interaction.editReply(
            `✅ تم تبديل حالة الرد التلقائي [#${id}].`
        );
    } catch (e) {
        console.error('❌ autorespond_toggle:', e);
        await interaction.editReply(ERR).catch(() => {});
    }
}

async function autorespondDeleteExecute(interaction, { db }) {
    try {
        await interaction.deferReply({ ephemeral: true });
        const id = interaction.options.getInteger('id');
        if (id < 1)
            return interaction.editReply(
                '❌ يرجى إدخال رقم صحيح (معرف الرد).'
            );
        
        // Safety: Add confirmation and backup before deleting auto response
        const { createConfirmation } = require('../utils/embeds');
        
        await interaction.editReply({ content: '⏳ جارٍ التحضير...' });
        
        const confirmed = await createConfirmation(interaction, {
            title: '⚠️ تأكيد حذف الرد التلقائي',
            description: `سيتم حذف الرد التلقائي رقم **#${id}**.\n\n**هذه العملية لا يمكن التراجع عنها.**`,
            confirmLabel: '✅ نعم، احذف الرد',
            cancelLabel: '❌ إلغاء'
        });
        
        if (!confirmed) return; // user cancelled or timed out
        
        // Auto-backup before executing
        db.safeBackup('before-delete-autoresponse');
        
        // Execute the destructive operation
        db.deleteAutoResponse(id);
        invalidateCache();
        await interaction.editReply(
            `🗑️ تم حذف الرد التلقائي [#${id}].`
        );
    } catch (e) {
        console.error('❌ autorespond_delete:', e);
        await interaction.editReply(ERR).catch(() => {});
    }
}

// ==========================================
// SCHEDULER — from scheduler.js
// ==========================================

async function scheduleAddExecute(interaction /*, { db, client, automation } */) {
    try {
        const channel = interaction.options.getChannel('channel');
        const repeat = interaction.options.getString('repeat');
        const modal = new ModalBuilder()
            .setCustomId(`modal_schedule_add_${channel.id}_${repeat}`)
            .setTitle('إضافة رسالة مجدولة');
        modal.addComponents(
            new ActionRowBuilder().addComponents(
                new TextInputBuilder()
                    .setCustomId('time')
                    .setLabel('الوقت (HH:MM)')
                    .setStyle(TextInputStyle.Short)
                    .setPlaceholder('مثال: 20:00')
                    .setRequired(true)
            ),
            new ActionRowBuilder().addComponents(
                new TextInputBuilder()
                    .setCustomId('title')
                    .setLabel('العنوان (اختياري)')
                    .setStyle(TextInputStyle.Short)
                    .setRequired(false)
            ),
            new ActionRowBuilder().addComponents(
                new TextInputBuilder()
                    .setCustomId('content')
                    .setLabel('نص الرسالة')
                    .setStyle(TextInputStyle.Paragraph)
                    .setRequired(true)
            ),
            new ActionRowBuilder().addComponents(
                new TextInputBuilder()
                    .setCustomId('media')
                    .setLabel('رابط صورة/ميديا (اختياري)')
                    .setStyle(TextInputStyle.Short)
                    .setRequired(false)
            )
        );
        await interaction.showModal(modal);
    } catch (e) {
        console.error('❌ schedule_add (show modal):', e);
        await interaction.reply({ content: ERR, ephemeral: true }).catch(() => {});
    }
}

async function processScheduleAddModal(interaction, { automation }) {
    try {
        await interaction.deferReply({ ephemeral: true });
        const parts = interaction.customId.split('_');
        // modal_schedule_add_channelId_repeat
        const channelId = parts[3];
        const repeat = parts[4];

        const timeStr = interaction.fields.getTextInputValue('time').trim();
        const match = timeStr.match(/^(\d{1,2}):(\d{2})$/);
        if (!match)
            return interaction.editReply(
                '❌ تنسيق الوقت غير صحيح. استخدم **HH:MM** مثل 20:00 أو 8:30'
            );
        const hour = parseInt(match[1], 10);
        const min = parseInt(match[2], 10);
        if (hour < 0 || hour > 23 || min < 0 || min > 59) {
            return interaction.editReply(
                '❌ وقت غير صالح. الساعة 0–23 والدقائق 0–59.'
            );
        }

        const title = (interaction.fields.getTextInputValue('title') || '').trim();
        const content = (interaction.fields.getTextInputValue('content') || '').trim();
        const mediaUrlRaw = (interaction.fields.getTextInputValue('media') || '').trim();
        const mediaUrl = mediaUrlRaw || null;

        let cronExpr;
        if (repeat === 'daily') cronExpr = `${min} ${hour} * * *`;
        else if (repeat === 'weekly') cronExpr = `${min} ${hour} * * 0`;
        else cronExpr = `${min} ${hour} * * *`;

        const id = automation.addAndSchedule({
            title,
            content,
            mediaUrl,
            channelId,
            cronExpr,
            repeatType: repeat,
            notifyBefore: false,
            createdBy: interaction.user.id
        });
        if (!id)
            return interaction.editReply('❌ حدث خطأ أثناء حفظ الجدولة.');

        const timeDisp = `${hour.toString().padStart(2, '0')}:${min
            .toString()
            .padStart(2, '0')}`;
        const repeatAr =
            repeat === 'daily'
                ? 'يومياً'
                : repeat === 'weekly'
                ? 'أسبوعياً'
                : 'مرة واحدة';
        await interaction.editReply(
            `✅ **تمت الجدولة** (ID: ${id})\n\n📢 <#${channelId}>\n🕐 **${timeDisp}**\n🔁 **${repeatAr}**\n` +
                (title ? `📌 ${title}\n` : '') +
                (mediaUrl ? '🖼️ ميديا\n' : '') +
                `\n📝 ${content.slice(0, 80)}${content.length > 80 ? '...' : ''}`
        );
    } catch (e) {
        console.error('❌ processScheduleAddModal:', e);
        await interaction.editReply(ERR).catch(() => {});
    }
}

async function scheduleListExecute(interaction, { db }) {
    try {
        await interaction.deferReply({ ephemeral: true });
        const msgs = db.getScheduledMessages(false);
        if (!msgs.length) {
            return interaction.editReply({
                embeds: [
                    new EmbedBuilder()
                        .setColor(CONFIG.COLORS.info)
                        .setTitle('📅 الرسائل المجدولة')
                        .setDescription('لا توجد رسائل مجدولة.')
                        .setTimestamp()
                ]
            });
        }
        const list = msgs
            .slice(0, 20)
            .map(m => {
                const status = m.is_active ? '🟢' : '🔴';
                const lastSent = m.last_sent
                    ? new Date(m.last_sent).toLocaleDateString('ar-EG')
                    : 'لم تُرسل بعد';
                const repeatAr =
                    m.repeat_type === 'daily'
                        ? 'يومي'
                        : m.repeat_type === 'weekly'
                        ? 'أسبوعي'
                        : 'مرة واحدة';
                return `${status} **#${m.id}** ${(m.title || 'بدون عنوان').slice(
                    0,
                    30
                )}\n   <#${m.channel_id}> · ${repeatAr} · ${lastSent}`;
            })
            .join('\n\n');
        const extra = msgs.length > 20 ? `\n_… و ${msgs.length - 20} أخرى_` : '';
        const embed = new EmbedBuilder()
            .setColor(CONFIG.COLORS.primary)
            .setTitle('📅 الرسائل المجدولة')
            .setDescription(list + extra)
            .setFooter({
                text: '/schedule_pause | /schedule_resume | /schedule_delete'
            })
            .setTimestamp();
        await interaction.editReply({ embeds: [embed] });
    } catch (e) {
        console.error('❌ schedule_list:', e);
        await interaction.editReply(ERR).catch(() => {});
    }
}

async function schedulePauseExecute(interaction, { automation }) {
    try {
        await interaction.deferReply({ ephemeral: true });
        const id = interaction.options.getInteger('id');
        if (id < 1)
            return interaction.editReply(
                '❌ يرجى إدخال رقم صحيح (معرف الجدولة).'
            );
        automation.toggleScheduledMessage(id, false);
        await interaction.editReply(
            `⏸️ تم إيقاف الرسالة المجدولة [#${id}] مؤقتاً.`
        );
    } catch (e) {
        console.error('❌ schedule_pause:', e);
        await interaction.editReply(ERR).catch(() => {});
    }
}

async function scheduleResumeExecute(interaction, { automation }) {
    try {
        await interaction.deferReply({ ephemeral: true });
        const id = interaction.options.getInteger('id');
        if (id < 1)
            return interaction.editReply(
                '❌ يرجى إدخال رقم صحيح (معرف الجدولة).'
            );
        automation.toggleScheduledMessage(id, true);
        await interaction.editReply(
            `▶️ تم استئناف الرسالة المجدولة [#${id}].`
        );
    } catch (e) {
        console.error('❌ schedule_resume:', e);
        await interaction.editReply(ERR).catch(() => {});
    }
}

async function scheduleDeleteExecute(interaction, { db, automation }) {
    try {
        await interaction.deferReply({ ephemeral: true });
        const id = interaction.options.getInteger('id');
        if (id < 1)
            return interaction.editReply(
                '❌ يرجى إدخال رقم صحيح (معرف الجدولة).'
            );
        
        // Safety: Add confirmation and backup before deleting scheduled message
        const { createConfirmation } = require('../utils/embeds');
        
        await interaction.editReply({ content: '⏳ جارٍ التحضير...' });
        
        const confirmed = await createConfirmation(interaction, {
            title: '⚠️ تأكيد حذف الرسالة المجدولة',
            description: `سيتم حذف الرسالة المجدولة رقم **#${id}**.\n\n**هذه العملية لا يمكن التراجع عنها.**`,
            confirmLabel: '✅ نعم، احذف الرسالة',
            cancelLabel: '❌ إلغاء'
        });
        
        if (!confirmed) return; // user cancelled or timed out
        
        // Auto-backup before executing
        db.safeBackup('before-delete-scheduled-message');
        
        // Execute the destructive operation
        automation.toggleScheduledMessage(id, false);
        db.deleteScheduledMessage(id);
        await interaction.editReply(
            `🗑️ تم حذف الرسالة المجدولة [#${id}].`
        );
    } catch (e) {
        console.error('❌ schedule_delete:', e);
        await interaction.editReply(ERR).catch(() => {});
    }
}

// ==========================================
// Central handler for /admin automation group
// ==========================================

async function handleAutomation(interaction, deps) {
    const sub = interaction.options.getSubcommand();
    switch (sub) {
        case 'autorespond_add':
            return autorespondAddExecute(interaction, deps);
        case 'autorespond_list':
            return autorespondListExecute(interaction, deps);
        case 'autorespond_toggle':
            return autorespondToggleExecute(interaction, deps);
        case 'autorespond_delete':
            return autorespondDeleteExecute(interaction, deps);
        case 'schedule_add':
            return scheduleAddExecute(interaction, deps);
        case 'schedule_list':
            return scheduleListExecute(interaction, deps);
        case 'schedule_pause':
            return schedulePauseExecute(interaction, deps);
        case 'schedule_resume':
            return scheduleResumeExecute(interaction, deps);
        case 'schedule_delete':
            return scheduleDeleteExecute(interaction, deps);
        default:
            throw new Error(`Unknown automation subcommand: ${sub}`);
    }
}

module.exports = {
    handleAutomation,
    handleAutoResponse,
    processScheduleAddModal,
    processAutorespondAddModal
};


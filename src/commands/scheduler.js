// ==========================================
// 📅 SCHEDULER — Slash Commands
// جدولة الرسائل (خيارات صريحة لـ schedule_add)
// ==========================================

const { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder } = require('discord.js');
const CONFIG = require('../config');

const ERR = CONFIG.ADMIN?.unifiedErrorMessage || '❌ حدث خطأ داخلي، تمت كتابة التفاصيل في السجل.';

const scheduleAddData = new SlashCommandBuilder()
    .setName('schedule_add')
    .setDescription('إضافة رسالة مجدولة')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addChannelOption(o => o.setName('channel').setDescription('القناة').setRequired(true))
    .addStringOption(o => o.setName('time').setDescription('الوقت بصيغة HH:MM مثل 20:00').setRequired(true))
    .addStringOption(o => o.setName('content').setDescription('نص الرسالة').setRequired(true))
    .addStringOption(o => o.setName('title').setDescription('عنوان (اختياري)'))
    .addStringOption(o => o.setName('repeat').setDescription('التكرار')
        .addChoices(
            { name: 'يومي', value: 'daily' },
            { name: 'أسبوعي', value: 'weekly' },
            { name: 'مرة واحدة', value: 'once' }
        ))
    .addStringOption(o => o.setName('media').setDescription('رابط صورة/ميديا (اختياري)'));

async function scheduleAddExecute(interaction, { db, client, automation }) {
    try {
        await interaction.deferReply({ ephemeral: true });
        const channel = interaction.options.getChannel('channel');
        const timeStr = interaction.options.getString('time').trim();
        const match = timeStr.match(/^(\d{1,2}):(\d{2})$/);
        if (!match) return interaction.editReply('❌ تنسيق الوقت غير صحيح. استخدم **HH:MM** مثل 20:00 أو 8:30');
        const hour = parseInt(match[1], 10);
        const min = parseInt(match[2], 10);
        if (hour < 0 || hour > 23 || min < 0 || min > 59) return interaction.editReply('❌ وقت غير صالح. الساعة 0–23 والدقائق 0–59.');
        const content = interaction.options.getString('content').trim();
        const title = interaction.options.getString('title')?.trim() || '';
        const repeat = interaction.options.getString('repeat') || 'once';
        const mediaUrl = interaction.options.getString('media')?.trim() || null;
        const channelId = channel.id;
        let cronExpr = repeat === 'daily' ? `${min} ${hour} * * *` : repeat === 'weekly' ? `${min} ${hour} * * 0` : `${min} ${hour} * * *`;
        const id = automation.addAndSchedule({
            title, content, mediaUrl,
            channelId, cronExpr,
            repeatType: repeat,
            notifyBefore: false,
            createdBy: interaction.user.id
        });
        if (!id) return interaction.editReply('❌ حدث خطأ أثناء حفظ الجدولة.');
        const timeDisp = `${hour.toString().padStart(2, '0')}:${min.toString().padStart(2, '0')}`;
        const repeatAr = repeat === 'daily' ? 'يومياً' : repeat === 'weekly' ? 'أسبوعياً' : 'مرة واحدة';
        await interaction.editReply(
            `✅ **تمت الجدولة** (ID: ${id})\n\n📢 <#${channelId}>\n🕐 **${timeDisp}**\n🔁 **${repeatAr}**\n` +
            (title ? `📌 ${title}\n` : '') + (mediaUrl ? '🖼️ ميديا\n' : '') + `\n📝 ${content.slice(0, 80)}${content.length > 80 ? '...' : ''}`
        );
    } catch (e) {
        console.error('❌ schedule_add:', e);
        await interaction.editReply(ERR).catch(() => {});
    }
}

const scheduleListData = new SlashCommandBuilder()
    .setName('schedule_list')
    .setDescription('عرض كل الرسائل المجدولة')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator);

async function scheduleListExecute(interaction, { db }) {
    try {
        await interaction.deferReply({ ephemeral: true });
        const msgs = db.getScheduledMessages(false);
        if (!msgs.length) {
            return interaction.editReply({ embeds: [new EmbedBuilder().setColor(CONFIG.COLORS.info).setTitle('📅 الرسائل المجدولة').setDescription('لا توجد رسائل مجدولة.').setTimestamp()] });
        }
        const list = msgs.slice(0, 20).map(m => {
            const status = m.is_active ? '🟢' : '🔴';
            const lastSent = m.last_sent ? new Date(m.last_sent).toLocaleDateString('ar-EG') : 'لم تُرسل بعد';
            const repeatAr = m.repeat_type === 'daily' ? 'يومي' : m.repeat_type === 'weekly' ? 'أسبوعي' : 'مرة واحدة';
            return `${status} **#${m.id}** ${(m.title || 'بدون عنوان').slice(0, 30)}\n   <#${m.channel_id}> · ${repeatAr} · ${lastSent}`;
        }).join('\n\n');
        const extra = msgs.length > 20 ? `\n_… و ${msgs.length - 20} أخرى_` : '';
        const embed = new EmbedBuilder().setColor(CONFIG.COLORS.primary).setTitle('📅 الرسائل المجدولة').setDescription(list + extra).setFooter({ text: '/schedule_pause | /schedule_resume | /schedule_delete' }).setTimestamp();
        await interaction.editReply({ embeds: [embed] });
    } catch (e) {
        console.error('❌ schedule_list:', e);
        await interaction.editReply(ERR).catch(() => {});
    }
}

const schedulePauseData = new SlashCommandBuilder()
    .setName('schedule_pause')
    .setDescription('إيقاف رسالة مجدولة مؤقتاً')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addIntegerOption(o => o.setName('id').setDescription('معرف الجدولة').setRequired(true));

async function schedulePauseExecute(interaction, { automation }) {
    try {
        await interaction.deferReply({ ephemeral: true });
        const id = interaction.options.getInteger('id');
        if (id < 1) return interaction.editReply('❌ يرجى إدخال رقم صحيح (معرف الجدولة).');
        automation.toggleScheduledMessage(id, false);
        await interaction.editReply(`⏸️ تم إيقاف الرسالة المجدولة [#${id}] مؤقتاً.`);
    } catch (e) {
        console.error('❌ schedule_pause:', e);
        await interaction.editReply(ERR).catch(() => {});
    }
}

const scheduleResumeData = new SlashCommandBuilder()
    .setName('schedule_resume')
    .setDescription('استئناف رسالة مجدولة')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addIntegerOption(o => o.setName('id').setDescription('معرف الجدولة').setRequired(true));

async function scheduleResumeExecute(interaction, { db, automation }) {
    try {
        await interaction.deferReply({ ephemeral: true });
        const id = interaction.options.getInteger('id');
        if (id < 1) return interaction.editReply('❌ يرجى إدخال رقم صحيح (معرف الجدولة).');
        automation.toggleScheduledMessage(id, true);
        await interaction.editReply(`▶️ تم استئناف الرسالة المجدولة [#${id}].`);
    } catch (e) {
        console.error('❌ schedule_resume:', e);
        await interaction.editReply(ERR).catch(() => {});
    }
}

const scheduleDeleteData = new SlashCommandBuilder()
    .setName('schedule_delete')
    .setDescription('حذف رسالة مجدولة')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addIntegerOption(o => o.setName('id').setDescription('معرف الجدولة').setRequired(true));

async function scheduleDeleteExecute(interaction, { db, automation }) {
    try {
        await interaction.deferReply({ ephemeral: true });
        const id = interaction.options.getInteger('id');
        if (id < 1) return interaction.editReply('❌ يرجى إدخال رقم صحيح (معرف الجدولة).');
        automation.toggleScheduledMessage(id, false);
        db.deleteScheduledMessage(id);
        await interaction.editReply(`🗑️ تم حذف الرسالة المجدولة [#${id}].`);
    } catch (e) {
        console.error('❌ schedule_delete:', e);
        await interaction.editReply(ERR).catch(() => {});
    }
}

const commands = [
    { data: scheduleAddData, execute: scheduleAddExecute },
    { data: scheduleListData, execute: scheduleListExecute },
    { data: schedulePauseData, execute: schedulePauseExecute },
    { data: scheduleResumeData, execute: scheduleResumeExecute },
    { data: scheduleDeleteData, execute: scheduleDeleteExecute }
];

module.exports = { commands };

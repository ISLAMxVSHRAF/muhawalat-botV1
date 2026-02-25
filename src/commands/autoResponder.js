// ==========================================
// 🤖 AUTO RESPONDER — Slash Commands
// + handleAutoResponse للرسائل العادية (يستدعيه index)
// ==========================================

const { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder } = require('discord.js');
const CONFIG = require('../config');

const ERR = CONFIG.ADMIN?.unifiedErrorMessage || '❌ حدث خطأ داخلي، تمت كتابة التفاصيل في السجل.';

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
        let matched = r.match_type === 'exact' ? content === r.trigger_text : r.match_type === 'startswith' ? content.startsWith(r.trigger_text) : content.includes(r.trigger_text);
        if (matched) {
            try { await message.reply(r.response_text); } catch (e) { console.error('❌ AutoRespond:', e.message); }
            break;
        }
    }
}

const autorespondAddData = new SlashCommandBuilder()
    .setName('autorespond_add')
    .setDescription('إضافة رد تلقائي')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addStringOption(o => o.setName('trigger').setDescription('الكلمة أو الجملة المحفزة').setRequired(true))
    .addStringOption(o => o.setName('response').setDescription('نص الرد').setRequired(true))
    .addStringOption(o => o.setName('channels').setDescription('معرفات القنوات مفصولة بفاصلة (أو اترك للكل)'))
    .addStringOption(o => o.setName('match').setDescription('نوع المطابقة')
        .addChoices(
            { name: 'يحتوي على', value: 'contains' },
            { name: 'تطابق تام', value: 'exact' },
            { name: 'يبدأ بـ', value: 'startswith' }
        ));

async function autorespondAddExecute(interaction, { db }) {
    try {
        await interaction.deferReply({ ephemeral: true });
        const trigger = interaction.options.getString('trigger').trim().toLowerCase();
        const response = interaction.options.getString('response').trim();
        const chStr = interaction.options.getString('channels')?.trim();
        const scope = chStr ? chStr.replace(/\s/g, '') : 'all';
        const matchType = interaction.options.getString('match') || 'contains';
        const ok = db.addAutoResponse(trigger, response, scope, matchType);
        invalidateCache();
        if (!ok) return interaction.editReply('❌ حدث خطأ أثناء حفظ الرد.');
        const matchAr = matchType === 'exact' ? 'تطابق تام' : matchType === 'startswith' ? 'يبدأ بـ' : 'يحتوي على';
        await interaction.editReply(`✅ **تم إضافة رد تلقائي**\n🔍 "${trigger}" (${matchAr})\n💬 ${response.slice(0, 60)}${response.length > 60 ? '...' : ''}\n📢 ${scope === 'all' ? 'كل القنوات' : scope}`);
    } catch (e) {
        console.error('❌ autorespond_add:', e);
        await interaction.editReply(ERR).catch(() => {});
    }
}

const autorespondListData = new SlashCommandBuilder()
    .setName('autorespond_list')
    .setDescription('عرض كل الردود التلقائية')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator);

async function autorespondListExecute(interaction, { db }) {
    try {
        await interaction.deferReply({ ephemeral: true });
        const responses = db.getAutoResponses(false);
        if (!responses.length) {
            return interaction.editReply({ embeds: [new EmbedBuilder().setColor(CONFIG.COLORS.info).setTitle('🤖 الردود التلقائية').setDescription('لا توجد ردود تلقائية.').setTimestamp()] });
        }
        const list = responses.slice(0, 20).map(r => {
            const status = r.is_active ? '🟢' : '🔴';
            const m = r.match_type === 'exact' ? 'تام' : r.match_type === 'startswith' ? 'يبدأ' : 'يحتوي';
            return `${status} **#${r.id}** \`${r.trigger_text}\` (${m})\n   → ${(r.response_text || '').slice(0, 50)}… · ${r.channel_scope === 'all' ? 'الكل' : r.channel_scope}`;
        }).join('\n\n');
        const extra = responses.length > 20 ? `\n_… و ${responses.length - 20} أخرى_` : '';
        const embed = new EmbedBuilder().setColor(CONFIG.COLORS.primary).setTitle('🤖 الردود التلقائية').setDescription(list + extra).setFooter({ text: '/autorespond_toggle | /autorespond_delete' }).setTimestamp();
        await interaction.editReply({ embeds: [embed] });
    } catch (e) {
        console.error('❌ autorespond_list:', e);
        await interaction.editReply(ERR).catch(() => {});
    }
}

const autorespondToggleData = new SlashCommandBuilder()
    .setName('autorespond_toggle')
    .setDescription('تفعيل/إيقاف رد تلقائي')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addIntegerOption(o => o.setName('id').setDescription('معرف الرد').setRequired(true));

async function autorespondToggleExecute(interaction, { db }) {
    try {
        await interaction.deferReply({ ephemeral: true });
        const id = interaction.options.getInteger('id');
        if (id < 1) return interaction.editReply('❌ يرجى إدخال رقم صحيح (معرف الرد).');
        db.toggleAutoResponse(id);
        invalidateCache();
        await interaction.editReply(`✅ تم تبديل حالة الرد التلقائي [#${id}].`);
    } catch (e) {
        console.error('❌ autorespond_toggle:', e);
        await interaction.editReply(ERR).catch(() => {});
    }
}

const autorespondDeleteData = new SlashCommandBuilder()
    .setName('autorespond_delete')
    .setDescription('حذف رد تلقائي')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addIntegerOption(o => o.setName('id').setDescription('معرف الرد').setRequired(true));

async function autorespondDeleteExecute(interaction, { db }) {
    try {
        await interaction.deferReply({ ephemeral: true });
        const id = interaction.options.getInteger('id');
        if (id < 1) return interaction.editReply('❌ يرجى إدخال رقم صحيح (معرف الرد).');
        db.deleteAutoResponse(id);
        invalidateCache();
        await interaction.editReply(`🗑️ تم حذف الرد التلقائي [#${id}].`);
    } catch (e) {
        console.error('❌ autorespond_delete:', e);
        await interaction.editReply(ERR).catch(() => {});
    }
}

const commands = [
    { data: autorespondAddData, execute: autorespondAddExecute },
    { data: autorespondListData, execute: autorespondListExecute },
    { data: autorespondToggleData, execute: autorespondToggleExecute },
    { data: autorespondDeleteData, execute: autorespondDeleteExecute }
];

module.exports = { commands, handleAutoResponse };

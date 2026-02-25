// ==========================================
// 🛠️ SETUP — Slash Command
// يفتح قائمة الإعداد (تثبيت سريع / مخصص / ربط يدوي)
// ==========================================

const {
    SlashCommandBuilder,
    PermissionFlagsBits,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    ChannelType,
    PermissionsBitField,
    ModalBuilder,
    TextInputBuilder,
    TextInputStyle,
    MessageFlags
} = require('discord.js');
const CONFIG = require('../config');

const data = new SlashCommandBuilder()
    .setName('setup')
    .setDescription('فتح لوحة إعداد نظام محاولات (قنوات العادات والمتفوقين)')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator);

async function execute(interaction, { db, client, automation }) {
    try {
        const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setCustomId('setup_auto')
                .setLabel('⚡ تثبيت سريع (تلقائي)')
                .setStyle(ButtonStyle.Success),
            new ButtonBuilder()
                .setCustomId('setup_custom')
                .setLabel('🛠️ تثبيت مخصص (بالأسماء)')
                .setStyle(ButtonStyle.Primary),
            new ButtonBuilder()
                .setCustomId('setup_manual')
                .setLabel('🔗 ربط يدوي (IDs)')
                .setStyle(ButtonStyle.Secondary)
        );

        const content = [
            '# 🛠️ إعداد نظام "مُحاولات" (System Setup)',
            'أهلاً بك في لوحة التثبيت. هذا البوت سيقوم بتحويل سيرفرك لبيئة إنتاجية متكاملة.',
            '',
            '### 📋 ماذا سيحدث؟',
            '1. **إنشاء تصنيف:** `🌱 Habits System` (أو اسم مخصص).',
            '2. **قناة العادات:** `📅・العادات` (مساحات الأعضاء).',
            '3. **لوحة المتفوقين:** `🏆・المتفوقين` (للاحتفال بالإنجازات).',
            '',
            '**اختر طريقة التثبيت:**',
            '> **⚡ تثبيت سريع:** البوت يقوم بكل شيء بالأسماء الافتراضية.',
            '> **🛠️ تثبيت مخصص:** أنت تختار أسماء القنوات والتصنيف بنفسك.',
            '> **🔗 ربط يدوي:** إذا كانت القنوات موجودة بالفعل وتريد ربطها.'
        ].join('\n');

        await interaction.reply({ content, components: [row] });
    } catch (e) {
        console.error('❌ setup execute:', e);
        const msg = CONFIG.ADMIN?.unifiedErrorMessage || '❌ حدث خطأ داخلي، تمت كتابة التفاصيل في السجل.';
        await interaction.reply({ content: msg, ephemeral: true }).catch(() => {});
    }
}

// ==========================================
// معالجات الأزرار والـ Modals (يستدعيها index.js)
// ==========================================
async function handleAutoSetup(interaction, db) {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    try {
        const guild = interaction.guild;
        const cat = await guild.channels.create({ name: '🌱 Habits System', type: ChannelType.GuildCategory });
        const forum = await guild.channels.create({
            name: '📅・العادات',
            type: ChannelType.GuildForum,
            parent: cat.id,
            topic: 'مساحتك الخاصة لبناء عادات جديدة.'
        });
        const achievers = await guild.channels.create({
            name: '🏆・المتفوقين',
            type: ChannelType.GuildText,
            parent: cat.id,
            permissionOverwrites: [{ id: guild.id, deny: [PermissionsBitField.Flags.SendMessages] }]
        });
        db.setConfig(guild.id, forum.id, achievers.id);
        await createLandingPost(forum);
        await interaction.editReply('✅ **تم تثبيت النظام بنجاح!**');
    } catch (e) {
        console.error('❌ Auto Setup Error:', e.message);
        await interaction.editReply(`❌ خطأ: ${e.message}`);
    }
}

function showCustomSetupModal(interaction) {
    const modal = new ModalBuilder()
        .setCustomId('modal_custom_setup')
        .setTitle('تخصيص أسماء القنوات')
        .addComponents(
            new ActionRowBuilder().addComponents(
                new TextInputBuilder().setCustomId('cat_name').setLabel('اسم التصنيف').setStyle(TextInputStyle.Short).setValue('🌱 Habits System').setRequired(true)
            ),
            new ActionRowBuilder().addComponents(
                new TextInputBuilder().setCustomId('forum_name').setLabel('اسم قناة العادات').setStyle(TextInputStyle.Short).setValue('📅・العادات').setRequired(true)
            ),
            new ActionRowBuilder().addComponents(
                new TextInputBuilder().setCustomId('achieve_name').setLabel('اسم قناة المتفوقين').setStyle(TextInputStyle.Short).setValue('🏆・المتفوقين').setRequired(true)
            )
        );
    return interaction.showModal(modal);
}

async function handleCustomSetup(interaction, db) {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    try {
        const guild = interaction.guild;
        const catName = interaction.fields.getTextInputValue('cat_name');
        const forumName = interaction.fields.getTextInputValue('forum_name');
        const achieveName = interaction.fields.getTextInputValue('achieve_name');
        const cat = await guild.channels.create({ name: catName, type: ChannelType.GuildCategory });
        const forum = await guild.channels.create({ name: forumName, type: ChannelType.GuildForum, parent: cat.id });
        const achievers = await guild.channels.create({
            name: achieveName,
            type: ChannelType.GuildText,
            parent: cat.id,
            permissionOverwrites: [{ id: guild.id, deny: [PermissionsBitField.Flags.SendMessages] }]
        });
        db.setConfig(guild.id, forum.id, achievers.id);
        await createLandingPost(forum);
        await interaction.editReply('✅ **تم التثبيت المخصص!**');
    } catch (e) {
        console.error('❌ Custom Setup Error:', e.message);
        await interaction.editReply(`❌ خطأ: ${e.message}`);
    }
}

function showManualSetupModal(interaction) {
    const modal = new ModalBuilder()
        .setCustomId('modal_manual')
        .setTitle('ربط يدوي')
        .addComponents(
            new ActionRowBuilder().addComponents(
                new TextInputBuilder().setCustomId('fid').setLabel('Forum Channel ID').setStyle(TextInputStyle.Short).setRequired(true)
            ),
            new ActionRowBuilder().addComponents(
                new TextInputBuilder().setCustomId('aid').setLabel('Achievers Channel ID').setStyle(TextInputStyle.Short).setRequired(true)
            )
        );
    return interaction.showModal(modal);
}

async function handleManualSetup(interaction, db) {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    try {
        const fId = interaction.fields.getTextInputValue('fid');
        const aId = interaction.fields.getTextInputValue('aid');
        db.setConfig(interaction.guild.id, fId, aId);
        const forum = interaction.guild.channels.cache.get(fId);
        if (forum) await createLandingPost(forum);
        await interaction.editReply('✅ **تم الربط بنجاح!**');
    } catch (e) {
        console.error('❌ Manual Setup Error:', e.message);
        await interaction.editReply(`❌ خطأ: ${e.message}`);
    }
}

async function createLandingPost(forumChannel) {
    const content = [
        '```',
        '━━━━━━━━━━━━━━━━━━━━━━━━',
        '🏁 MUHAWALAT — نظام المحاولات',
        '━━━━━━━━━━━━━━━━━━━━━━━━',
        '',
        '"قَليلٌ دائمٌ.. خيرٌ من كثيرٍ منقطع"',
        '',
        '📌 WHAT IS THIS?',
        'مساحة شخصية لمتابعة عاداتك وأهدافك',
        'يومياً — أسبوعياً — شهرياً',
        '',
        '✅ HABITS      — تتبع عاداتك اليومية',
        '📝 REPORTS    — سجّل تقريرك كل يوم',
        '🎯 GOALS       — حدد أهدافك وراقب تقدمك',
        '🏆 CHALLENGES — نافس وتحدى نفسك',
        '━━━━━━━━━━━━━━━━━━━━━━━━',
        '```'
    ].join('\n');

    const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId('btn_onboard')
            .setLabel(CONFIG.LANDING_POST.button.label)
            .setEmoji(CONFIG.LANDING_POST.button.emoji)
            .setStyle(ButtonStyle.Success)
    );

    const thread = await forumChannel.threads.create({
        name: CONFIG.LANDING_POST.threadName,
        message: { content, components: [row] }
    });
    await thread.pin();
}

module.exports = {
    data,
    execute,
    handleAutoSetup,
    showCustomSetupModal,
    handleCustomSetup,
    showManualSetupModal,
    handleManualSetup
};

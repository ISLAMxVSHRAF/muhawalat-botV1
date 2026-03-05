const { MessageFlags, ChannelType, PermissionsBitField, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const { updateDashboard } = require('../utils/dashboard');
const CONFIG = require('../config');

const ERR = CONFIG.ADMIN?.unifiedErrorMessage || '❌ حدث خطأ داخلي، تمت كتابة التفاصيل في السجل.';

// ==========================================
// setup execute + helpers (from setup.js)
// ==========================================

async function setupExecute(interaction, { db /*, client, automation */ }) {
    try {
        const { ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
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
        const msg = CONFIG.ADMIN?.unifiedErrorMessage || ERR;
        await interaction.reply({ content: msg, ephemeral: true }).catch(() => {});
    }
}

async function handleAutoSetup(interaction, db) {
    const { ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    try {
        const guild = interaction.guild;
        const cat = await guild.channels.create({
            name: '🌱 Habits System',
            type: ChannelType.GuildCategory
        });
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
            permissionOverwrites: [
                { id: guild.id, deny: [PermissionsBitField.Flags.SendMessages] }
            ]
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
    const {
        ActionRowBuilder,
        ButtonBuilder,
        ButtonStyle,
        ModalBuilder,
        TextInputBuilder,
        TextInputStyle
    } = require('discord.js');
    const modal = new ModalBuilder()
        .setCustomId('modal_custom_setup')
        .setTitle('تخصيص أسماء القنوات')
        .addComponents(
            new ActionRowBuilder().addComponents(
                new TextInputBuilder()
                    .setCustomId('cat_name')
                    .setLabel('اسم التصنيف')
                    .setStyle(TextInputStyle.Short)
                    .setValue('🌱 Habits System')
                    .setRequired(true)
            ),
            new ActionRowBuilder().addComponents(
                new TextInputBuilder()
                    .setCustomId('forum_name')
                    .setLabel('اسم قناة العادات')
                    .setStyle(TextInputStyle.Short)
                    .setValue('📅・العادات')
                    .setRequired(true)
            ),
            new ActionRowBuilder().addComponents(
                new TextInputBuilder()
                    .setCustomId('achieve_name')
                    .setLabel('اسم قناة المتفوقين')
                    .setStyle(TextInputStyle.Short)
                    .setValue('🏆・المتفوقين')
                    .setRequired(true)
            )
        );
    return interaction.showModal(modal);
}

async function handleCustomSetup(interaction, db) {
    const {
        ActionRowBuilder,
        ButtonBuilder,
        ButtonStyle,
        ModalBuilder,
        TextInputBuilder,
        TextInputStyle
    } = require('discord.js');
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    try {
        const guild = interaction.guild;
        const catName = interaction.fields.getTextInputValue('cat_name');
        const forumName = interaction.fields.getTextInputValue('forum_name');
        const achieveName = interaction.fields.getTextInputValue('achieve_name');
        const cat = await guild.channels.create({
            name: catName,
            type: ChannelType.GuildCategory
        });
        const forum = await guild.channels.create({
            name: forumName,
            type: ChannelType.GuildForum,
            parent: cat.id
        });
        const achievers = await guild.channels.create({
            name: achieveName,
            type: ChannelType.GuildText,
            parent: cat.id,
            permissionOverwrites: [
                { id: guild.id, deny: [PermissionsBitField.Flags.SendMessages] }
            ]
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
    const {
        ActionRowBuilder,
        ButtonBuilder,
        ButtonStyle,
        ModalBuilder,
        TextInputBuilder,
        TextInputStyle
    } = require('discord.js');
    const modal = new ModalBuilder()
        .setCustomId('modal_manual')
        .setTitle('ربط يدوي')
        .addComponents(
            new ActionRowBuilder().addComponents(
                new TextInputBuilder()
                    .setCustomId('fid')
                    .setLabel('Forum Channel ID')
                    .setStyle(TextInputStyle.Short)
                    .setRequired(true)
            ),
            new ActionRowBuilder().addComponents(
                new TextInputBuilder()
                    .setCustomId('aid')
                    .setLabel('Achievers Channel ID')
                    .setStyle(TextInputStyle.Short)
                    .setRequired(true)
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
    const {
        ActionRowBuilder,
        ButtonBuilder,
        ButtonStyle,
        ModalBuilder,
        TextInputBuilder,
        TextInputStyle
    } = require('discord.js');
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

// ==========================================
// register_members (from register_members.js)
// ==========================================

async function registerMembersExecute(interaction, { db }) {
    try {
        await interaction.deferReply({ ephemeral: true });

        const roleId = process.env.MEMBER_ROLE_ID;
        if (!roleId) return interaction.editReply('❌ MEMBER_ROLE_ID مش موجود في .env');

        const guild = interaction.guild;

        // جيب الأعضاء بـ chunks عشان نتجنب الـ timeout
        let allMembers = [];
        let after = undefined;
        // eslint-disable-next-line no-constant-condition
        while (true) {
            const opts = { limit: 1000 };
            if (after) opts.after = after;
            const chunk = await guild.members.list(opts);
            if (!chunk.size) break;
            allMembers.push(...chunk.values());
            after = [...chunk.keys()].pop();
            if (chunk.size < 1000) break;
        }

        // فلتر اللي معاهم الرول بس
        const roleMembers = allMembers.filter(
            m => !m.user.bot && m.roles.cache.has(roleId)
        );

        let registered = 0;
        let updated = 0;

        for (const member of roleMembers) {
            const userId = member.user.id;
            const name =
                member.nickname || member.user.globalName || member.user.username;
            const existing = db.getUser(userId);

            if (!existing) {
                db.createUser(userId, name, '', 'male', null, null);
                registered++;
            } else if (existing.name !== name) {
                db.updateUser(userId, { name });
                updated++;
            }
        }

        const role = guild.roles.cache.get(roleId);
        const embed = new EmbedBuilder()
            .setColor(CONFIG.COLORS.success)
            .setTitle('👥 تسجيل الأعضاء')
            .addFields(
                {
                    name: '✅ مسجلين جدد',
                    value: String(registered),
                    inline: true
                },
                {
                    name: '🔄 تم تحديث اسمهم',
                    value: String(updated),
                    inline: true
                },
                {
                    name: '👥 إجمالي الرول',
                    value: String(roleMembers.length),
                    inline: true
                }
            )
            .setFooter({ text: `رول: ${role?.name || roleId}` })
            .setTimestamp();

        await interaction.editReply({ embeds: [embed] });
    } catch (e) {
        console.error('❌ register_members:', e);
        await interaction.editReply(ERR).catch(() => {});
    }
}

// ==========================================
// create_thread & recreate_dashboard (from old admin.js)
// ==========================================

async function recreateDashboardExecute(interaction, { db, client }) {
    try {
        await interaction.deferReply({ ephemeral: true });
        const userOpt = interaction.options.getUser('user');
        const userId = userOpt.id;
        const user = db.getUser(userId);
        if (!user) return interaction.editReply('❌ العضو غير مسجل في النظام.');
        if (!user.thread_id)
            return interaction.editReply(
                '❌ العضو ليس لديه مساحة مسجلة. استخدم /create_thread لإنشاء واحدة.'
            );
        const thread = await client.channels
            .fetch(user.thread_id)
            .catch(() => null);
        if (!thread)
            return interaction.editReply(
                '❌ المساحة المسجلة غير موجودة. استخدم /create_thread لإنشاء مساحة جديدة.'
            );
        await updateDashboard(thread, userId, db);
        await interaction.editReply(
            `✅ **تم إعادة إنشاء الداشبورد لـ** ${userOpt.username}\n\nالمساحة: <#${user.thread_id}>`
        );
    } catch (e) {
        console.error('❌ recreate_dashboard:', e);
        await interaction.editReply(ERR).catch(() => {});
    }
}

async function createThreadExecute(interaction, { db, client }) {
    try {
        await interaction.deferReply({ ephemeral: true });
        const userOpt = interaction.options.getUser('user');
        const userId = userOpt.id;
        const user = db.getUser(userId);
        if (!user) return interaction.editReply('❌ العضو غير مسجل في النظام.');
        const config = db.getConfig(interaction.guild.id);
        if (!config?.forum_id)
            return interaction.editReply(
                '❌ النظام غير معد. استخدم /setup أولاً.'
            );
        const forum = await interaction.guild.channels
            .fetch(config.forum_id)
            .catch(() => null);
        if (!forum) return interaction.editReply('❌ قناة العادات غير موجودة.');
        const thread = await forum.threads.create({
            name: `مساحة ${user.name} 🌱`,
            message: { content: '🌱 جاري التحضير...' }
        });
        db.updateUser(userId, { thread_id: thread.id });
        await updateDashboard(thread, userId, db);
        const welcomeMsg = await thread.send({
            content: `👋 <@${userId}> دي مساحتك الجديدة.\n*(هتتمسح بعد دقيقة)*`
        });
        setTimeout(() => welcomeMsg.delete().catch(() => {}), 60000);
        await interaction.editReply(
            `✅ **تم إنشاء مساحة جديدة لـ** ${userOpt.username}\n\nالمساحة: <#${thread.id}>`
        );
    } catch (e) {
        console.error('❌ create_thread:', e);
        await interaction.editReply(ERR).catch(() => {});
    }
}

// ==========================================
// debug_status & db_backup (from maintenance.js)
// ==========================================

async function debugStatusExecute(interaction, { db, client }) {
    try {
        await interaction.deferReply({ ephemeral: true });
        const users = db.getAllUsers();
        const uptime = Math.floor((client.uptime || 0) / 1000);
        const today = new Date().toISOString().split('T')[0];
        const dailyReports = db.getDailyReports(today);
        const base =
            process.env.WEB_BASE_URL ||
            `http://localhost:${process.env.WEB_PORT || 3000}`;
        const text =
            `**📊 حالة النظام:**\n` +
            `• المستخدمين: ${users.length}\n` +
            `• Uptime: ${Math.floor(uptime / 3600)}h ${Math.floor(
                (uptime % 3600) / 60
            )}m\n` +
            `• تقارير اليوم: ${dailyReports.length}/${users.length}\n` +
            `• الموقع: ${base}\n` +
            `• البوت: Online ✅`;
        await interaction.editReply(text);
    } catch (e) {
        console.error('❌ debug_status:', e);
        await interaction.editReply(ERR).catch(() => {});
    }
}

async function dbBackupExecute(interaction, { db } = {}) {
    const fs = require('fs');
    const path = require('path');
    const os = require('os');
    let tmpPath = null;
    try {
        await interaction.deferReply({ ephemeral: true });
        const srcPath = db?.dbPath || 'muhawalat.db';

        // تأكد إن آخر تغييرات محفوظة قبل النسخ
        try {
            db?.saveImmediate?.();
        } catch (_) {}

        if (!fs.existsSync(srcPath)) {
            return interaction.editReply(`❌ ملف الداتابيز غير موجود: \`${srcPath}\``);
        }

        const fileName = `muhawalat.db.backup.${Date.now()}.db`;
        tmpPath = path.join(os.tmpdir(), fileName);
        fs.copyFileSync(srcPath, tmpPath);

        await interaction.editReply({
            content: `✅ **نسخة احتياطية جاهزة:** \`${fileName}\``,
            files: [{ attachment: tmpPath, name: fileName }]
        });
    } catch (e) {
        console.error('❌ db_backup:', e);
        await interaction.editReply(ERR).catch(() => {});
    } finally {
        if (tmpPath) {
            try {
                const fs = require('fs');
                fs.unlinkSync(tmpPath);
            } catch (_) {}
        }
    }
}

// ==========================================
// Central handler for /admin system group
// ==========================================

async function handleSystem(interaction, deps) {
    const sub = interaction.options.getSubcommand();
    switch (sub) {
        case 'setup':
            return setupExecute(interaction, deps);
        case 'register_members':
            return registerMembersExecute(interaction, deps);
        case 'create_thread':
            return createThreadExecute(interaction, deps);
        case 'recreate_dashboard':
            return recreateDashboardExecute(interaction, deps);
        case 'db_backup':
            return dbBackupExecute(interaction, deps);
        case 'debug_status':
            return debugStatusExecute(interaction, deps);
        default:
            throw new Error(`Unknown system subcommand: ${sub}`);
    }
}

module.exports = {
    handleSystem,
    handleAutoSetup,
    showCustomSetupModal,
    handleCustomSetup,
    showManualSetupModal,
    handleManualSetup
};


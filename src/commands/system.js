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

async function showDashboardPage(interaction, db, client, page) {
    try {
    const guild = interaction.guild;
    const allUsers = db.getAllUsers();
    const archived = db.getArchivedUsers();

    // Use cached guild members
    let activeMembers = allUsers;
    if (process.env.MEMBER_ROLE_ID) {
        try {
            let guildMembers = guild.members.cache;
            if (guildMembers.size < 2) {
                guildMembers = await guild.members.fetch({ time: 10000 }).catch(() => guild.members.cache);
            }
            activeMembers = allUsers.filter(u => {
                const m = guildMembers.get(u.user_id);
                return m && m.roles.cache.has(process.env.MEMBER_ROLE_ID);
            });
        } catch (e) { activeMembers = allUsers; }
    }

    const season = db.getActiveMonth ? db.getActiveMonth() : null;
    const nowCairo = new Date(new Date().toLocaleString('en-US', { timeZone: 'Africa/Cairo' }));
    const todayStr = nowCairo.toLocaleDateString('ar-EG', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });

    // Season info
    let weekNumber = '-', remaining = '-', seasonLabel = 'لا يوجد سيزون نشط';
    if (season) {
        const diff = Math.floor((nowCairo - new Date(season.start_date)) / 86400000);
        weekNumber = Math.min(4, Math.floor(diff / 7) + 1);
        remaining = Math.max(0, (season.duration_days || 28) - diff);
        seasonLabel = `الأسبوع ${weekNumber} — باقي ${remaining} يوم`;
    }

    // Nav
    const nav = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('dash_overview').setLabel('🏠 عام').setStyle(page === 'overview' ? ButtonStyle.Primary : ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId('dash_reports').setLabel('📝 التقارير').setStyle(page === 'reports' ? ButtonStyle.Primary : ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId('dash_tasks').setLabel('🎯 المهام').setStyle(page === 'tasks' ? ButtonStyle.Primary : ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId('dash_warnings').setLabel('⚠️ الإنذارات').setStyle(page === 'warnings' ? ButtonStyle.Primary : ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId('dash_members').setLabel('👥 الأعضاء').setStyle(page === 'members' ? ButtonStyle.Primary : ButtonStyle.Secondary)
    );

    const refreshRow = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('dash_refresh').setLabel('🔄 تحديث').setStyle(ButtonStyle.Success)
    );

    let embed;

    // ══════════════════════════════════
    // 🏠 OVERVIEW
    // ══════════════════════════════════
    if (page === 'overview') {
        const cairoDate = db.getCairoLogicalDate ? db.getCairoLogicalDate() : new Date().toISOString().split('T')[0];
        const todayReports = db.getDailyReports(cairoDate);
        const reportedToday = todayReports.length;
        const totalActive = activeMembers.length;
        const pct = totalActive > 0 ? Math.round((reportedToday / totalActive) * 100) : 0;

        const weekStats = db.getWeeklyReportStats();
        const last7 = weekStats.slice(0, 7).map(s => `${s.count}`).join(' · ') || '—';

        const warned = allUsers.filter(u => (u.warning_count || 0) > 0);
        const weeklyTasks = db.getActiveTasks(guild.id, 'weekly');
        const monthlyTasks = db.getActiveTasks(guild.id, 'monthly');
        const activeTasks = weeklyTasks.length + monthlyTasks.length;

        const topUser = db.getLeaderboard(1)[0];

        embed = new EmbedBuilder()
            .setColor(0xF9C22E)
            .setTitle('📊 لوحة التحكم — نظرة عامة')
            .setDescription(
                `📅 **${todayStr}**\n` +
                `━━━━━━━━━━━━━━━━━━\n` +
                `👥 **الأعضاء:** ${totalActive} نشط | ${archived.length} مؤرشف\n` +
                `� **تقارير النهارده:** ${reportedToday}/${totalActive} — **${pct}%**\n` +
                `� **آخر 7 أيام:** ${last7}\n` +
                `━━━━━━━━━━━━━━━━━━\n` +
                `🗓️ **السيزون:** ${seasonLabel}\n` +
                `🎯 **مهام نشطة:** ${activeTasks}\n` +
                `━━━━━━━━━━━━━━━━━━\n` +
                `${warned.length > 0 ? `⚠️ **إنذارات:** ${warned.length} عضو عندهم إنذارات\n` : '✅ لا يوجد إنذارات\n'}` +
                `${topUser ? `� **أعلى ستريك:** ${topUser.name} (${topUser.days_streak} يوم)` : ''}` 
            )
            .setFooter({ text: 'Muhawalat Dashboard • يتحدث عند كل ضغطة' });
    }

    // ══════════════════════════════════
    // 📝 REPORTS
    // ══════════════════════════════════
    else if (page === 'reports') {
        const cairoDate = db.getCairoLogicalDate ? db.getCairoLogicalDate() : new Date().toISOString().split('T')[0];
        const todayReports = db.getDailyReports(cairoDate);
        const reportedIds = new Set(todayReports.map(r => r.user_id));
        const missing = activeMembers.filter(u => !reportedIds.has(u.user_id));
        const pct = activeMembers.length > 0 ? Math.round((reportedIds.size / activeMembers.length) * 100) : 0;

        const weekStats = db.getWeeklyReportStats();
        const weekSummary = weekStats.slice(0, 7).map(s => `\`${s.report_date}\` — **${s.count}** تقرير`).join('\n') || '—';

        const doneVal = reportedIds.size > 0
            ? [...reportedIds].slice(0, 15).map(id => `<@${id}>`).join(' ')
            : '—';
        const missingVal = missing.length > 0
            ? missing.slice(0, 25).map(u => `<@${u.user_id}>`).join(' ')
            : '✅ الكل عمل تقرير!';

        embed = new EmbedBuilder()
            .setColor(0xF15946)
            .setTitle('📝 لوحة التحكم — التقارير')
            .setDescription(`📅 **${todayStr}** — نسبة اليوم: **${pct}%**`)
            .addFields(
                { name: `✅ عملوا تقرير (${reportedIds.size}/${activeMembers.length})`, value: doneVal, inline: false },
                { name: `❌ لم يعملوا تقرير (${missing.length})`, value: missingVal, inline: false },
                { name: '� إحصائيات آخر 7 أيام', value: weekSummary, inline: false }
            );
    }

    // ══════════════════════════════════
    // 🎯 TASKS
    // ══════════════════════════════════
    else if (page === 'tasks') {
        const weeklyTasks = db.getActiveTasks(guild.id, 'weekly');
        const monthlyTasks = db.getActiveTasks(guild.id, 'monthly');
        const challenges = db.getActiveChallenges ? db.getActiveChallenges() : [];

        const formatTask = (t) => {
            const lockTs = Math.floor(new Date(t.lock_at).getTime() / 1000);
            const count = db.getTaskCompletionCount ? db.getTaskCompletionCount(t.id) : 0;
            const pct = activeMembers.length > 0 ? Math.round((count / activeMembers.length) * 100) : 0;
            return `**${t.title}** — <t:${lockTs}:R> | ${count}/${activeMembers.length} (${pct}%)`;
        };

        const formatChallenge = (c) => {
            const logs = db.getChallengeStats ? db.getChallengeStats(c.id) : null;
            const participants = logs?.participant_count || 0;
            return `**${c.title}** — ${participants} مشارك`;
        };

        embed = new EmbedBuilder()
            .setColor(0xF9C22E)
            .setTitle('🎯 لوحة التحكم — المهام')
            .addFields(
                {
                    name: `📅 مهام أسبوعية (${weeklyTasks.length})`,
                    value: weeklyTasks.length > 0 ? weeklyTasks.map(formatTask).join('\n') : '—',
                    inline: false
                },
                {
                    name: `🗓️ مهام شهرية (${monthlyTasks.length})`,
                    value: monthlyTasks.length > 0 ? monthlyTasks.map(formatTask).join('\n') : '—',
                    inline: false
                },
                {
                    name: `🏆 تحديات نشطة (${challenges.length})`,
                    value: challenges.length > 0 ? challenges.map(formatChallenge).join('\n') : '—',
                    inline: false
                }
            );
    }

    // ══════════════════════════════════
    // ⚠️ WARNINGS
    // ══════════════════════════════════
    else if (page === 'warnings') {
        const warned = allUsers.filter(u => (u.warning_count || 0) > 0).sort((a, b) => b.warning_count - a.warning_count);
        const pendingTimeouts = db.getPendingTimeouts ? db.getPendingTimeouts() : [];

        embed = new EmbedBuilder()
            .setColor(0xF15946)
            .setTitle('⚠️ لوحة التحكم — الإنذارات')
            .setDescription(
                warned.length === 0
                    ? '✅ لا يوجد إنذارات حالياً'
                    : `إجمالي الإنذارات: **${warned.reduce((s, u) => s + (u.warning_count || 0), 0)}**` 
            )
            .addFields(
                {
                    name: `🔴 عندهم إنذارات (${warned.length})`,
                    value: warned.length > 0
                        ? warned.slice(0, 15).map(u => `<@${u.user_id}> — ${'⚠️'.repeat(u.warning_count)} ${u.warning_count}/3`).join('\n')
                        : '—',
                    inline: false
                },
                {
                    name: `⏱️ في انتظار Timeout (${pendingTimeouts.length})`,
                    value: pendingTimeouts.length > 0
                        ? pendingTimeouts.slice(0, 10).map(t => `<@${t.user_id}>`).join(' ')
                        : '✅ لا يوجد',
                    inline: false
                }
            );
    }

    // ══════════════════════════════════
    // 👥 MEMBERS
    // ════════════════════════════════════
    else if (page === 'members') {
        const inactive = db.getInactiveUsers ? db.getInactiveUsers() : [];
        const activeMemberIds = new Set(activeMembers.map(u => u.user_id));
        const activeInactive = inactive.filter(u => activeMemberIds.has(u.user_id));
        const leaderboard = db.getLeaderboard(5);

        embed = new EmbedBuilder()
            .setColor(0x7286A0)
            .setTitle('👥 لوحة التحكم — الأعضاء')
            .addFields(
                {
                    name: `📦 مؤرشفين (${archived.length})`,
                    value: archived.length > 0 ? archived.slice(0, 10).map(u => `**${u.name}**`).join('، ') : '✅ لا يوجد',
                    inline: false
                },
                {
                    name: `😴 أقل من 5 تقارير هذا الأسبوع (${activeInactive.length})`,
                    value: activeInactive.length > 0
                        ? activeInactive.slice(0, 20).map(u => `<@${u.user_id}>`).join(' ')
                        : '✅ الكل نشط!',
                    inline: false
                },
                {
                    name: '🏆 أفضل 5 هذا الأسبوع',
                    value: leaderboard.length > 0
                        ? leaderboard.map((u, i) => `${['🥇','🥈','🥉','4️⃣','5️⃣'][i]} **${u.name}** — ${Math.round(u.avg_rate || 0)}%`).join('\n')
                        : '—',
                    inline: false
                }
            );
    }

    if (interaction.replied || interaction.deferred) {
        await interaction.editReply({ embeds: [embed], components: [nav, refreshRow] });
    } else {
        await interaction.reply({ embeds: [embed], components: [nav, refreshRow], flags: 64 });
    }
    } catch (e) {
        console.error('❌ showDashboardPage error:', e.message, e.stack);
        const msg = { content: `❌ خطأ: ${e.message}`, embeds: [], components: [] };
        if (interaction.replied || interaction.deferred) await interaction.editReply(msg).catch(() => {});
        else await interaction.reply({ ...msg, flags: 64 }).catch(() => {});
    }
}

async function dashboardExecute(interaction, { db, client }) {
    await interaction.deferReply({ flags: 64 });
    await showDashboardPage(interaction, db, client, 'overview');
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
        case 'dashboard':
            return dashboardExecute(interaction, deps);
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
    handleManualSetup,
    dashboardExecute,
    showDashboardPage
};


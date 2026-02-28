// ==========================================
// 🌱 MUHAWALAT BOT - MAIN ENTRY
// Version: 7.2.0 + Web Dashboard
// ==========================================

require('dotenv').config();
const path = require('path');
const fs = require('fs');
const { Client, GatewayIntentBits, InteractionType, MessageFlags, EmbedBuilder, Collection } = require('discord.js');

const CONFIG = require('./src/config');
const MuhawalatDatabase        = require('./src/database');
const AutomationSystem         = require('./src/automation');
// const { startWebServer }       = require('./website/server');  // ← Web Dashboard

// Handlers
const { showRegistrationModal, processRegistration }                                            = require('./src/handlers/onboarding');
const { showAddHabitModal, processAddHabit, toggleHabit, showDeleteMenu, processDeleteHabit }  = require('./src/handlers/habits');
const { showEditProfileModal, processSaveProfile, showYearlyGoalModal, showMonthlyGoalModal, showWeeklyGoalModal, processSaveYearlyGoal, processSaveMonthlyGoal, processSaveWeeklyGoal } = require('./src/handlers/profile');
const { showStats, showAchievements }                                                           = require('./src/handlers/stats');
const { updateDashboard, showJournalModal, processJournalModal, showJournalLog } = require('./src/utils/dashboard');
const { handleChallengeMessage, handleChallengeLeaderboardButton } = require('./src/commands/challenges');

// Setup & message handlers (buttons/modals/auto-response)
const { handleAutoSetup, showCustomSetupModal, handleCustomSetup, showManualSetupModal, handleManualSetup } = require('./src/commands/setup');
const { handleAutoResponse } = require('./src/commands/autoResponder');
const { handleHelpButton } = require('./src/commands/help');
const { handleDailyReportButton } = require('./src/commands/dailyReport');
const { processTaskCreateModal } = require('./src/commands/tasks');
const { processChallengeCreateModal } = require('./src/commands/challenges');
const { processSyncTasksModal } = require('./src/commands/sync_tasks');
const { processSyncChallengeModal } = require('./src/commands/sync_challenge');

// ==========================================
// CLIENT
// ==========================================
const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent
    ]
});

client.commands = new Collection();
let db;
let automation;

// DB path: Railway persistent volume or local
const dbPath = process.env.RAILWAY_ENVIRONMENT_NAME
    ? '/app/data/muhawalat.db'
    : path.join(__dirname, 'muhawalat.db');

// ==========================================
// READY
// ==========================================
client.once('ready', async () => {
    console.log('\n' + '='.repeat(50));
    console.log('🌱 MUHAWALAT BOT - READY');
    console.log('='.repeat(50));

    db = new MuhawalatDatabase(dbPath);
    await db.init();
    console.log('✅ Database initialized');

    automation = new AutomationSystem(client, db);
    automation.start();

    const commandsPath = path.join(__dirname, 'src', 'commands');
    const commandFiles = fs.readdirSync(commandsPath).filter(f => f.endsWith('.js'));
    for (const file of commandFiles) {
        const mod = require(path.join(commandsPath, file));
        if (mod.data && typeof mod.execute === 'function') {
            client.commands.set(mod.data.name, mod);
        } else if (Array.isArray(mod.commands)) {
            for (const c of mod.commands) {
                if (c.data && typeof c.execute === 'function') client.commands.set(c.data.name, c);
            }
        }
    }
    console.log(`✅ Slash commands loaded: ${client.commands.size}`);

    client.db = db; // عشان الأزرار تقدر توصل للداتابيز
    // startWebServer(db);

    console.log(`✅ Bot: ${client.user.tag}`);
    console.log(`📊 Users: ${db.getAllUsers().length}`);
    console.log('='.repeat(50) + '\n');
});

// ==========================================
// MESSAGE CREATE
// ==========================================
client.on('messageCreate', async message => {
    if (message.author.bot) return;

    const dailyForumId = process.env.DAILY_REPORTS_FORUM_ID;
    if (db && dailyForumId && message.channel.parentId === dailyForumId) {
        const postData = db.getDailyPostByThread(message.channel.id);

        // Shifted Day (Cairo): 22:00–23:59 = Today | 00:00–12:00 = Yesterday | 12:01–21:59 = ➖
        const cairoNow = new Date(new Date().toLocaleString('en-US', { timeZone: 'Africa/Cairo' }));
        const hour = cairoNow.getHours();
        const todayStr = new Date().toLocaleDateString('en-CA', { timeZone: 'Africa/Cairo' });
        const ymd = todayStr.split('-').map(Number);
        const yesterdayDate = new Date(ymd[0], ymd[1] - 1, ymd[2] - 1);
        const yesterdayStr = yesterdayDate.getFullYear() + '-' + String(yesterdayDate.getMonth() + 1).padStart(2, '0') + '-' + String(yesterdayDate.getDate()).padStart(2, '0');
        let postDate = postData ? postData.post_date : todayStr;
        if (hour >= 0 && hour < 12) postDate = yesterdayStr;
        else if (hour >= 22 && hour <= 23) postDate = todayStr;

        const words = (message.content || '').trim().split(/\s+/).filter(w => w.length > 0);

        // بين 10 و14 كلمة — بعت تنبيه للأدمن
        if (words.length >= 10 && words.length < 15) {
            const adminChId = process.env.ADMIN_CHANNEL_ID;
            const adminCh = adminChId ? await client.channels.fetch(adminChId).catch(() => null) : null;
            if (adminCh) {
                const adminRoleId = process.env.ADMIN_ROLE_ID;
                const mention = adminRoleId ? `<@&${adminRoleId}>` : '⚠️ أدمن';
                await adminCh.send(
                    `${mention} تقرير العضو <@${message.author.id}> يحتوي ${words.length} كلمة فقط — يحتاج مراجعة.\n🔗 ${message.url}`
                ).catch(() => {});
            }
        }

        if (words.length >= 15) {
            // سجّل أو حدّث العضو
            if (!db.getUser(message.author.id)) {
                const name = message.member?.nickname || message.author.globalName || message.author.username;
                db.createUser(message.author.id, name, '', 'male', null, null);
            } else {
                const newName = message.member?.nickname || message.author.globalName || message.author.username;
                const existing = db.getUser(message.author.id);
                if (existing.name !== newName) db.updateUser(message.author.id, { name: newName });
            }
            db.recordDailyReport(message.author.id, message.channel.id, message.content, words.length, postDate);
            await message.react('👏').catch(() => {});
            const user = db.getUser(message.author.id);
            // ✅ رسالة تأكيد تشجيعية مؤقتة
            const isFemale = user?.gender === 'female';
            const name = user?.name || '';
            const confirmMsg = isFemale
                ? `✅ تم تسجيل تقريرك يا ${name}! 🌸`
                : `✅ تم تسجيل تقريرك يا ${name}! 💪`;
            const m = await message.channel.send(confirmMsg).catch(() => null);
            if (m) setTimeout(() => m.delete().catch(() => {}), 10000);
            if (user?.thread_id) {
                const userThread = await client.channels.fetch(user.thread_id).catch(() => null);
                if (userThread) await updateDashboard(userThread, message.author.id, db);
            }
        }

        return;
    }

    const weeklyForum = process.env.WEEKLY_TASKS_FORUM_ID;
    const monthlyForum = process.env.MONTHLY_TASKS_FORUM_ID;
    if (db && ((weeklyForum && message.channel.parentId === weeklyForum) || (monthlyForum && message.channel.parentId === monthlyForum))) {
        const words = (message.content || '').trim().split(/\s+/).filter(w => w.length > 0);
        if (words.length >= 10) {
            const task = db.getTaskByThread(message.channel.id);
            if (task && !task.is_locked) {
                // حد أقصى اتنين تسجيلات للعضو في نفس التاسك
                const completions = db.getUserTaskCompletions(task.id, message.author.id);
                if (completions < 2) {
                    // تحديث اسم العضو
                    if (!db.getUser(message.author.id)) {
                        const name = message.member?.nickname || message.author.globalName || message.author.username;
                        db.createUser(message.author.id, name, '', 'male', null, null);
                    } else {
                        const newName = message.member?.nickname || message.author.globalName || message.author.username;
                        const existing = db.getUser(message.author.id);
                        if (existing.name !== newName) db.updateUser(message.author.id, { name: newName });
                    }

                    db.completeTask(task.id, message.author.id, message.id, message.content);
                    await message.react('👏').catch(() => {});

                    // رد ephemeral للعضو
                    const isWeekly = message.channel.parentId === weeklyForum;
                    const reminder = isWeekly
                        ? 'متنساش تسجّل أهدافك الأسبوعية في مساحتك الشخصية 📅'
                        : 'متنساش تسجّل أهدافك الشهرية في مساحتك الشخصية 🗓️';
                    const m = await message.reply(`✅ <@${message.author.id}> تم تسجيل المهمة!\n${reminder}`).catch(() => null);
                    if (m) setTimeout(() => m.delete().catch(() => {}), 10000);

                    const user = db.getUser(message.author.id);
                    if (user?.thread_id) {
                        const userThread = await client.channels.fetch(user.thread_id).catch(() => null);
                        if (userThread) await updateDashboard(userThread, message.author.id, db);
                    }
                    await checkTaskAchievements(message.author.id, message);
                }
            }
        }
        return;
    }

    const challengesForum = process.env.CHALLENGES_FORUM_ID;
    if (db && challengesForum && message.channel.parentId === challengesForum) {
        const challenge = db.getChallengeByThread(message.channel.id);
        if (challenge) await handleChallengeMessage(message, challenge, db);
        return;
    }

    if (db) await handleAutoResponse(message, db);
});

async function checkTaskAchievements(userId, message) {
    const user = db.getUser(userId);
    if (!user) return;
    const totalTasks = db.getTotalCompletedTasksCount(userId);
    const milestones = { 20: 'task_20', 50: 'task_50', 100: 'task_100', 500: 'task_500', 1000: 'task_1000' };
    for (const [milestone, achType] of Object.entries(milestones)) {
        if (totalTasks < parseInt(milestone)) continue;
        if (db.hasAchievement(userId, achType)) continue;
        db.addAchievement(userId, achType);
        const achConfig = CONFIG.ACHIEVEMENTS[achType];
        if (!achConfig) continue;
        const isFemale = user.gender === 'female';
        const celebMsg = isFemale
            ? `🎉 <@${userId}> حققتِ إنجاز جديد!\n\n${achConfig.emoji} **${achConfig.name}**\n_${achConfig.desc}_`
            : `🎉 <@${userId}> حققت إنجاز جديد!\n\n${achConfig.emoji} **${achConfig.name}**\n_${achConfig.desc}_`;
        if (user.thread_id) {
            const thread = await client.channels.fetch(user.thread_id).catch(() => null);
            if (thread) {
                const m = await thread.send(celebMsg);
                setTimeout(() => m.delete().catch(() => {}), 60000);
            }
        }
        const config = db.getConfig(message.guildId);
        if (config?.achieve_id) {
            const achieveCh = await client.channels.fetch(config.achieve_id).catch(() => null);
            if (achieveCh) await achieveCh.send(celebMsg).catch(() => {});
        }
        break;
    }
}

// ==========================================
// INTERACTIONS
// ==========================================
client.on('interactionCreate', async interaction => {
    try {
        if (interaction.isChatInputCommand()) {
            const command = client.commands.get(interaction.commandName);
            if (command) {
                try {
                    await command.execute(interaction, { db, client, automation });
                } catch (e) {
                    console.error(`❌ Slash command ${interaction.commandName}:`, e);
                    const err = CONFIG.ADMIN?.unifiedErrorMessage || '❌ حدث خطأ داخلي، تمت كتابة التفاصيل في السجل.';
                    if (interaction.deferred || interaction.replied) await interaction.editReply(err).catch(() => {});
                    else await interaction.reply({ content: err, ephemeral: true }).catch(() => {});
                }
            }
            return;
        }

        if (interaction.isButton()) {
            const id = interaction.customId;
            if (id.startsWith('help_prev_') || id.startsWith('help_next_')) return handleHelpButton(interaction);
            if (id.startsWith('clb_prev_') || id.startsWith('clb_next_')) return handleChallengeLeaderboardButton(interaction, db);
            if (id.startsWith('dr_')) return handleDailyReportButton(interaction, db);

            // أزرار أقسام الداشبورد
            if (id.startsWith('dash_section_')) {
                const section     = id.replace('dash_section_', '');
                const thread      = interaction.channel;
                const threadOwner = db.getUserByThread(thread.id);
                if (threadOwner && threadOwner.user_id !== interaction.user.id) {
                    return interaction.reply({ content: '😤 بطل لعب يا نجم! دي مش مساحتك.', ephemeral: true });
                }
                const ownerId = threadOwner?.user_id || interaction.user.id;
                if (ownerId === interaction.user.id && !db.getUser(interaction.user.id)) {
                    const cleanName = (thread.name || '')
                        .replace(/\s*مساحة\s*/gi, '')
                        .replace(/[\u{1F300}-\u{1F9FF}]/gu, '')
                        .replace(/\s+/g, ' ')
                        .trim() || interaction.user.globalName || interaction.user.username;
                    db.createUser(interaction.user.id, cleanName, '', 'male', thread.id, null);
                    db.updateUser(interaction.user.id, { thread_id: thread.id });
                }
                await interaction.deferUpdate();
                await updateDashboard(thread, ownerId, db, section);
                return;
            }
            if (id === 'setup_auto')       return handleAutoSetup(interaction, db);
            if (id === 'setup_custom')     return showCustomSetupModal(interaction);
            if (id === 'setup_manual')     return showManualSetupModal(interaction);
            if (id === 'btn_onboard')      return showRegistrationModal(interaction);
            if (id === 'btn_add') {
                const threadOwner = db.getUserByThread(interaction.channel.id);
                if (threadOwner && threadOwner.user_id !== interaction.user.id) {
                    return interaction.reply({ content: '😤 بطل لعب يا نجم! دي مش مساحتك.', ephemeral: true });
                }
                const ownerId = threadOwner?.user_id || interaction.user.id;
                if (ownerId === interaction.user.id && !db.getUser(interaction.user.id)) {
                    const thread = interaction.channel;
                    const cleanName = (thread.name || '').replace(/\s*مساحة\s*/gi, '').replace(/[\u{1F300}-\u{1F9FF}]/gu, '').replace(/\s+/g, ' ').trim() || interaction.user.globalName || interaction.user.username;
                    db.createUser(interaction.user.id, cleanName, '', 'male', thread.id, null);
                    db.updateUser(interaction.user.id, { thread_id: thread.id });
                }
                return showAddHabitModal(interaction);
            }
            if (id === 'btn_delete_mode')  return showDeleteMenu(interaction, db);
            if (id === 'btn_edit_profile') return showEditProfileModal(interaction, db);
            if (id === 'btn_monthly_goal') return showMonthlyGoalModal(interaction, db);
            if (id === 'btn_weekly_goal')  return showWeeklyGoalModal(interaction, db);
            if (id === 'btn_stats')        return showStats(interaction, db);


            if (id.startsWith('admin_timeout_')) {
                const parts = id.split('_');
                const targetId = parts[2];
                const days = parseInt(parts[3]);
                const member = await interaction.guild.members.fetch(targetId).catch(() => null);
                if (member) await member.timeout(days * 24 * 60 * 60 * 1000, `إنذار ثالث - تايم أوت ${days} يوم`);
                return interaction.update({ content: `✅ تم تطبيق التايم أوت (${days} يوم) على <@${targetId}>`, components: [] });
            }
            if (id.startsWith('admin_kick_')) {
                const targetId = id.split('_')[2];
                const member = await interaction.guild.members.fetch(targetId).catch(() => null);
                if (member) await member.kick('إنذار ثالث - كيك من الإدارة');
                return interaction.update({ content: `✅ تم الكيك لـ <@${targetId}>`, components: [] });
            }
            if (id.startsWith('admin_warn_ignore_')) {
                return interaction.update({ content: '✅ تم التجاهل', components: [] });
            }
            if (id === 'btn_achievements') return showAchievements(interaction, db);
            if (id === 'btn_journal') {
                const threadOwner = db.getUserByThread(interaction.channel.id);
                if (threadOwner && threadOwner.user_id !== interaction.user.id) {
                    return interaction.reply({ content: '😤 بطل لعب يا نجم! دي مش مساحتك.', ephemeral: true });
                }
                return showJournalModal(interaction);
            }
            if (id === 'btn_journal_log') {
                const threadOwner = db.getUserByThread(interaction.channel.id);
                if (threadOwner && threadOwner.user_id !== interaction.user.id) {
                    return interaction.reply({ content: '😤 بطل لعب يا نجم! دي مش مساحتك.', ephemeral: true });
                }
                return showJournalLog(interaction, db);
            }

            // ✅ أزرار الـ Timeout
            if (id.startsWith('timeout_approve_')) {
                const userId = id.replace('timeout_approve_', '');
                return handleTimeoutApprove(interaction, userId, db);
            }
            if (id.startsWith('timeout_dismiss_')) {
                const userId = id.replace('timeout_dismiss_', '');
                db.resolveTimeoutPending(userId, 'dismissed');
                return interaction.reply({ content: `✅ تم تجاهل الـ Timeout لـ <@${userId}>.`, ephemeral: true });
            }

            if (id.startsWith('check_')) {
                const threadOwner = db.getUserByThread(interaction.channel.id);
                if (threadOwner && threadOwner.user_id !== interaction.user.id) {
                    return interaction.reply({ content: '😤 بطل لعب يا نجم! دي مش مساحتك.', ephemeral: true });
                }
                const ownerId = threadOwner?.user_id || interaction.user.id;
                if (ownerId === interaction.user.id && !db.getUser(interaction.user.id)) {
                    const thread = interaction.channel;
                    const cleanName = (thread.name || '').replace(/\s*مساحة\s*/gi, '').replace(/[\u{1F300}-\u{1F9FF}]/gu, '').replace(/\s+/g, ' ').trim() || interaction.user.globalName || interaction.user.username;
                    db.createUser(interaction.user.id, cleanName, '', 'male', thread.id, null);
                    db.updateUser(interaction.user.id, { thread_id: thread.id });
                }
                const habitId = parseInt(id.split('_')[1]);
                return toggleHabit(interaction, habitId, db);
            }
            if (id === 'btn_goal_annual')  return showYearlyGoalModal(interaction, db);
            if (id === 'btn_goal_monthly') return showMonthlyGoalModal(interaction, db);
            if (id === 'btn_goal_weekly')  return showWeeklyGoalModal(interaction, db);

            if (id === 'btn_refresh') {
                await interaction.deferUpdate();
                const { updateDashboard } = require('./src/utils/dashboard');
                // ✅ BUG FIX: استخدم صاحب المساحة مش اللي ضغط الزرار
                const threadOwner = db.getUserByThread(interaction.channel.id);
                const ownerId = threadOwner?.user_id || interaction.user.id;
                return updateDashboard(interaction.channel, ownerId, db);
            }
        }
        else if (interaction.isStringSelectMenu()) {
            if (interaction.customId === 'del_menu') return processDeleteHabit(interaction, db);
            if (interaction.customId === 'dashboard_menu') {
                const choice = interaction.values[0];
                if (choice === 'review_history') {
                    const { ModalBuilder, TextInputBuilder, TextInputStyle, ActionRowBuilder } = require('discord.js');
                    const modal = new ModalBuilder().setCustomId('modal_review_date').setTitle('📅 مراجعة يوم محدد');
                    modal.addComponents(new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('review_date').setLabel('التاريخ (DD-MM-YYYY)').setStyle(TextInputStyle.Short).setPlaceholder('مثال: 20-02-2026').setRequired(true)));
                    return interaction.showModal(modal);
                }
                // أقسام الداشبورد
                if (choice.startsWith('section_')) {
                    const section     = choice.replace('section_', '');
                    const thread      = interaction.channel;
                    const threadOwner = db.getUserByThread(thread.id);
                    if (threadOwner && threadOwner.user_id !== interaction.user.id) {
                        return interaction.reply({ content: '😤 بطل لعب يا نجم! دي مش مساحتك.', ephemeral: true });
                    }
                    const ownerId = threadOwner?.user_id || interaction.user.id;
                    if (ownerId === interaction.user.id && !db.getUser(interaction.user.id)) {
                        const cleanName = (thread.name || '').replace(/\s*مساحة\s*/gi, '').replace(/[\u{1F300}-\u{1F9FF}]/gu, '').replace(/\s+/g, ' ').trim() || interaction.user.globalName || interaction.user.username;
                        db.createUser(interaction.user.id, cleanName, '', 'male', thread.id, null);
                        db.updateUser(interaction.user.id, { thread_id: thread.id });
                    }
                    await interaction.deferUpdate();
                    await updateDashboard(thread, ownerId, db, section);
                    return;
                }

                if (choice === 'stats')        return showStats(interaction, db);
                if (choice === 'achievements') return showAchievements(interaction, db);
                if (choice === 'yearly_goal')  return showYearlyGoalModal(interaction, db);
                if (choice === 'monthly_goal') return showMonthlyGoalModal(interaction, db);
                if (choice === 'weekly_goal')  return showWeeklyGoalModal(interaction, db);
                if (choice === 'about')        return showAbout(interaction);
                if (choice === 'my_website') {
                    const { MessageFlags } = require('discord.js');
                    const base = process.env.WEB_BASE_URL || `http://localhost:${process.env.WEB_PORT || 3000}`;
                    return interaction.reply({
                        content: `🌐 **صفحتك على الموقع:**\n${base}/member.html?id=${interaction.user.id}`,
                        flags: MessageFlags.Ephemeral
                    });
                }
            }
            // ✅ اختيار مدة الـ Timeout
            if (interaction.customId.startsWith('timeout_duration_')) {
                const userId = interaction.customId.replace('timeout_duration_', '');
                const duration = parseInt(interaction.values[0]); // بالدقائق
                return executeTimeout(interaction, userId, duration, db);
            }
        }
        else if (interaction.type === InteractionType.ModalSubmit) {
            const id = interaction.customId;
            if (id === 'modal_custom_setup') return handleCustomSetup(interaction, db);
            if (id === 'modal_manual')       return handleManualSetup(interaction, db);
            if (id === 'modal_register')     return processRegistration(interaction, db);
            if (id === 'modal_add_habit')    return processAddHabit(interaction, db);
            if (id === 'modal_save_profile') return processSaveProfile(interaction, db);
            if (id === 'modal_yearly_goal')  return processSaveYearlyGoal(interaction, db);
            if (id === 'modal_monthly_goal') return processSaveMonthlyGoal(interaction, db);
            if (id === 'modal_weekly_goal')  return processSaveWeeklyGoal(interaction, db);

            if (id === 'modal_review_date') {
                await interaction.deferReply({ flags: MessageFlags.Ephemeral });
                const input = interaction.fields.getTextInputValue('review_date');
                const match = input.match(/^(\d{2})-(\d{2})-(\d{4})$/);
                if (!match) return interaction.editReply('❌ تنسيق التاريخ غلط. استخدم DD-MM-YYYY');
                const isoDate = `${match[3]}-${match[2]}-${match[1]}`;
                const report = db.getDailyReport(interaction.user.id, isoDate);
                if (!report) return interaction.editReply(`❌ مفيش تقرير مسجل ليك في ${input}`);
                const dayDisplay = new Date(isoDate).toLocaleDateString('ar-EG', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
                return interaction.editReply(`📅 **تقريرك ليوم ${dayDisplay}:**\n\n${report.content || '—'}`);
            }
            if (id.startsWith('modal_task_create_')) return processTaskCreateModal(interaction, db, client);
            if (id === 'modal_challenge_create') return processChallengeCreateModal(interaction, db, client);
            if (id === 'modal_sync_tasks') return processSyncTasksModal(interaction, db, client);
            if (id === 'modal_sync_challenge') return processSyncChallengeModal(interaction, db, client);
            if (id === 'modal_journal') return processJournalModal(interaction, db);
        }
    } catch (error) {
        console.error('❌ Interaction Error:', error);
        const msg = '❌ حدث خطأ. حاول مرة أخرى.';
        if (interaction.deferred || interaction.replied) await interaction.editReply(msg).catch(()=>{});
        else await interaction.reply({ content: msg, ephemeral: true }).catch(()=>{});
    }
});

// ==========================================
// ⏱️ TIMEOUT SYSTEM
// ==========================================
async function handleTimeoutApprove(interaction, userId, db) {
    const { ActionRowBuilder, StringSelectMenuBuilder } = require('discord.js');

    const user = db.getUser(userId);
    if (!user) return interaction.reply({ content: '❌ المستخدم مش موجود في الداتابيز.', ephemeral: true });

    // اسأل عن المدة
    const row = new ActionRowBuilder().addComponents(
        new StringSelectMenuBuilder()
            .setCustomId(`timeout_duration_${userId}`)
            .setPlaceholder('اختر مدة الـ Timeout')
            .addOptions([
                { label: 'يوم واحد (24 ساعة)',  value: '1440',  emoji: '📅' },
                { label: '3 أيام',               value: '4320',  emoji: '📅' },
                { label: 'أسبوع (7 أيام)',        value: '10080', emoji: '📅' },
            ])
    );

    await interaction.reply({
        content: `⏱️ **تنفيذ Timeout لـ ${user.name}**\n\nاختر المدة:`,
        components: [row],
        ephemeral: true
    });
}

async function executeTimeout(interaction, userId, durationMinutes, db) {
    try {
        await interaction.deferReply({ ephemeral: true });

        const guild = interaction.guild;
        const member = await guild.members.fetch(userId).catch(() => null);
        if (!member) {
            return interaction.editReply('❌ العضو مش موجود في السيرفر.');
        }

        // تنفيذ الـ Timeout
        await member.timeout(durationMinutes * 60 * 1000, 'وصل لـ 3 إنذارات — قرار الإدارة');

        // تحديث الحالة في الداتابيز
        db.resolveTimeoutPending(userId, 'executed');

        const user = db.getUser(userId);
        const days = Math.floor(durationMinutes / 1440);
        const hours = Math.floor((durationMinutes % 1440) / 60);
        const durationText = days > 0 ? `${days} يوم` : `${hours} ساعة`;

        // إشعار العضو في مساحته
        try {
            const thread = await client.channels.fetch(user.thread_id).catch(() => null);
            if (thread) {
                await thread.send(
                    `🚨 <@${userId}> تم تطبيق Timeout عليك لمدة **${durationText}**.\n\n` +
                    `السبب: وصلت لـ 3 إنذارات بسبب قلة المراجعات الأسبوعية.\n` +
                    `بعد انتهاء المدة، يمكنك العودة والبدء من جديد. 💪`
                );
            }
        } catch (_) {}

        await interaction.editReply(
            `✅ تم تنفيذ Timeout لـ **${user?.name || userId}** لمدة **${durationText}**.`
        );

    } catch (e) {
        console.error('❌ executeTimeout:', e.message);
        await interaction.editReply(`❌ حدث خطأ: ${e.message}`);
    }
}

// ==========================================
// ℹ️ SHOW ABOUT
// ✅ FIX: تحديث وصف الـ Embed بمحتوى جديد يعبر عن المرحلة الحالية
// ==========================================
async function showAbout(interaction) {
    const { EmbedBuilder } = require('discord.js');
    const CONFIG = require('./src/config');
    const embed  = new EmbedBuilder()
        .setColor(CONFIG.COLORS.primary)
        .setTitle('📖 عن بوت محاولات')
        .setDescription(
            'بوت محاولات في نسخته الأولية 🌱\n' +
            'تم تطويره خصيصاً لخدمة مجتمع محاولات لمساعدتكم في بناء عادات يومية قوية وتتبع إنجازاتكم بسهولة.\n\n' +
            '_لا يزال البوت قيد التطوير والتحسين المستمر._'
        )
        .setFooter({ text: 'Muhawalat Bot | محاولات', iconURL: interaction.client.user.displayAvatarURL() });
    await interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
}

process.on('unhandledRejection', e => console.error('❌ Unhandled Rejection:', e));
process.on('uncaughtException',  e => { console.error('❌ Uncaught Exception:', e); if (db) db.saveImmediate(); });
process.on('SIGINT', () => {
    console.log('\n🛑 Shutting down...');
    if (automation) automation.stop();
    if (db) db.close();
    process.exit(0);
});

if (!process.env.DISCORD_TOKEN) {
    console.error('❌ DISCORD_TOKEN not found!');
    process.exit(1);
}

client.login(process.env.DISCORD_TOKEN);

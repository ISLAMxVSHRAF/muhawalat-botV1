// ==========================================
// ⏰ AUTOMATION SYSTEM
// Version: 9.0.0 - Refined messages, no evening buttons
// ==========================================

const fs = require('fs');
const path = require('path');
const cron = require('node-cron');
const { announceChallengeEnd } = require('./commands/challenges');
const { ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const CONFIG = require('./config');
const { getRandomQuote } = require('./utils/quotes');
const {
    getMorningMessage,
    getEveningPerfectMessage,
    getEveningMissingMessage
} = require('./utils/responses');
const { issueWarning } = require('./commands/warnings');

const TZ = process.env.TIMEZONE || 'Africa/Cairo';

class AutomationSystem {
    constructor(client, db) {
        this.client = client;
        this.db = db;
        this.jobs = [];
        this._schedulerJobs = new Map();
    }

    // ==========================================
    // 🚀 START
    // ==========================================
    start() {
        console.log('🤖 Starting Automation System (Cairo Time)...\n');

        this.jobs.push(cron.schedule(CONFIG.SCHEDULES.morning,  () => this.morningMessage(),    { timezone: TZ }));
        this.jobs.push(cron.schedule(CONFIG.SCHEDULES.evening,  () => this.eveningReflection(), { timezone: TZ }));
        this.jobs.push(cron.schedule(CONFIG.SCHEDULES.reset,    () => this.dailyReset(),        { timezone: TZ }));
        this.jobs.push(cron.schedule(CONFIG.SCHEDULES.weekly,   () => this.weeklyLeaderboard(), { timezone: TZ }));

        this.jobs.push(cron.schedule('0 9 1 * *',  () => this.monthlyGoalReminder(), { timezone: TZ }));
        this.jobs.push(cron.schedule('0 9 * * 1',  () => this.weeklyWarningCheck(),  { timezone: TZ }));
        this.jobs.push(cron.schedule('0 22 * * *', () => this.createDailyPost(),     { timezone: TZ }));
        this.jobs.push(cron.schedule('0 12 * * *', () => this.lockDailyPost(),       { timezone: TZ }));
        this.jobs.push(cron.schedule('0 * * * *',  () => this.lockTasksCron(),       { timezone: TZ }));
        this.jobs.push(cron.schedule('0 23 * * *', () => this.checkExpiredChallenges(), { timezone: TZ }));

        this.loadScheduledMessages();
        console.log('✅ Automation started\n');
    }

    // ==========================================
    // 🌅 MORNING MESSAGE
    // ==========================================
    async morningMessage() {
        console.log(`🌅 [${new Date().toLocaleTimeString('ar-EG')}] Morning messages...`);
        const users = this.db.getAllUsers();

        for (const user of users) {
            try {
                const thread = await this.client.channels.fetch(user.thread_id).catch(() => null);
                if (!thread) continue;

                const isFemale = user.gender === 'female';
                const habits = this.db.getHabits(user.user_id);
                const streak = user.days_streak || 0;
                const freeze = user.streak_freeze || 0;

                let message;

                if (habits.length === 0) {
                    message = isFemale
                        ? `صباح النور! 🌸\n\nلسه ما ضفتيش أي عادات. دوسي على **➕ إضافة عادة** في مساحتك وابدأي رحلتك النهاردة! 💪`
                        : `صباح النور! ☀️\n\nلسه ما ضفتيش أي عادات. دوس على **➕ إضافة عادة** في مساحتك وابدأ رحلتك النهاردة! 💪`;
                } else {
                    // رسالة الصباح العشوائية + اقتباس
                    const morningGreeting = getMorningMessage(isFemale);
                    const quote = getRandomQuote(isFemale);

                    const streakLine = streak > 0
                        ? (isFemale
                            ? `🔥 أنتِ مستمرة بقالك **${streak} يوم** — متكسريش السلسلة!`
                            : `🔥 أنت مستمر بقالك **${streak} يوم** — متكسرش السلسلة!`)
                        : (isFemale ? `اليوم فرصة تبدأي ستريك جديد! 🌱` : `اليوم فرصة تبدأ ستريك جديد! 🌱`);

                    const habitsLine = isFemale
                        ? `📋 عندك **${habits.length} عادة** النهاردة — خليهم كلهم ✅`
                        : `📋 عندك **${habits.length} عادة** النهاردة — خليهم كلهم ✅`;

                    const freezeLine = freeze > 0 ? `❄️ رصيد الإجازة: **${freeze}** متاح` : '';

                    message = `${morningGreeting}\n\n${streakLine}\n${habitsLine}${freezeLine ? '\n' + freezeLine : ''}\n\n> 💡 ${quote}`;
                }

                await thread.send(`<@${user.user_id}> ${message}`);

                const now = new Date();
                const isMonday = now.getDay() === 1;
                const isFirst  = now.getDate() === 1;

                if (isMonday) {
                    const currentWeek = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-W${Math.ceil(now.getDate() / 7)}`;
                    const weeklyGoals = this.db.getGoals(user.user_id, 'weekly', currentWeek);
                    if (!weeklyGoals.length) {
                        await thread.send(
                            `📅 **تذكير:** لسه محددتش أهداف الأسبوع ده!\n> من القائمة المنسدلة ← هدف الأسبوع 💪`
                        ).catch(() => {});
                    }
                }
                if (isFirst) {
                    const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
                    const monthlyGoals = this.db.getGoals(user.user_id, 'monthly', currentMonth);
                    if (!monthlyGoals.length) {
                        await thread.send(
                            `🗓️ **تذكير:** لسه محددتش أهداف الشهر الجديد!\n> من القائمة المنسدلة ← هدف الشهر 💪`
                        ).catch(() => {});
                    }
                }

                await this.sleep(600);
            } catch (e) {
                console.error(`❌ Morning (${user.name}):`, e.message);
            }
        }
        console.log('✅ Morning done.');
    }

    // ==========================================
    // 📝 DAILY POST — بوست التقرير اليومي 10 مساءً
    // ==========================================
    async createDailyPost() {
        const forumId = process.env.DAILY_REPORTS_FORUM_ID;
        if (!forumId) return;

        const forum = await this.client.channels.fetch(forumId).catch(() => null);
        if (!forum) return;

        const now = new Date();
        const days   = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
        const daysAr = ['الأحد', 'الإثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت'];
        const dayName   = days[now.getDay()];
        const dayNameAr = daysAr[now.getDay()];

        const dd   = String(now.getDate()).padStart(2, '0');
        const mm   = String(now.getMonth() + 1).padStart(2, '0');
        const yyyy = now.getFullYear();
        const dateDisplay = `${dd} - ${mm} - ${yyyy}`;
        const isoDate     = `${yyyy}-${mm}-${dd}`;

        const imagePath = path.join(__dirname, '..', 'assets', 'daily', `${dayName}.png`);
        const imageFile = fs.existsSync(imagePath)
            ? { attachment: imagePath, name: `${dayName}.png` }
            : null;

        const content = [
            'مطلوب منك يومياً تجاوب على الأسئلة دي بوضوح عشان تعرف أنت واقف فين:',
            '',
            '1️⃣ **عن النهاردة:**',
            'أنجزت إيه؟',
            'إيه اللي كنت عايز تعمله ولم ينتهي؟',
            'إيه المشكلات اللي قابلتك؟',
            'ضيعت وقتك في إيه؟',
            'يومك في العموم مشي إزاي؟',
            '',
            '2️⃣ **عن بكرة:**',
            'ناوي تعمل إيه؟',
            '',
            '💡 **عشان خطتك تنجح:**',
            'وأنت بتكتب مهام بكرة، التزم بالقاعدة دي:',
            '',
            'حدد الوقت والمكان: (هعمل المهمة الفلانية، الساعة كذا، في المكان كذا).',
            'واقعية ومقاسة: المهمة لازم تكون محددة وليها "قفلة" واضحة، عشان تقدر تقول (أنا خلصت).',
            '',
            '<@&1446713787162955951>'
        ].join('\n');

        const msgOpts = imageFile ? { content, files: [imageFile] } : { content };

        try {
            const thread = await forum.threads.create({
                name: `التقرير اليومي 📝 | ${dateDisplay} ( ${dayNameAr} )`,
                message: msgOpts
            });
            this.db.saveDailyPost(isoDate, thread.id);
            console.log(`✅ Daily post created: ${dateDisplay}`);
        } catch (e) {
            console.error('❌ createDailyPost:', e.message);
        }
    }

    async lockDailyPost() {
        const yesterday = new Date();
        yesterday.setDate(yesterday.getDate() - 1);
        const isoDate = yesterday.toISOString().split('T')[0];

        const postData = this.db.getDailyPost(isoDate);
        if (!postData?.thread_id) return;

        const thread = await this.client.channels.fetch(postData.thread_id).catch(() => null);
        if (!thread) return;

        await thread.setLocked(true).catch(console.error);
        console.log(`🔒 Daily post locked: ${isoDate}`);
    }

    async lockTasksCron() {
        const toLock = this.db.getTasksToLock();
        for (const t of toLock) {
            this.db.lockTask(t.id);
            console.log(`🔒 Task locked: #${t.id} ${t.title}`);

            try {
                const missed = this.db.getMembersWhoMissedTask(t.id);
                const typeAr = t.type === 'weekly' ? 'الأسبوعية' : 'الشهرية';
                for (const user of missed) {
                    const thread = await this.client.channels.fetch(user.thread_id).catch(() => null);
                    if (thread) {
                        await thread.send(
                            `⏰ <@${user.user_id}> **انتهى وقت المهمة ${typeAr}:** "${t.title}"\nلم يتم تسجيل إتمامك لها. 📌`
                        ).catch(() => {});
                        await this.sleep(300);
                    }
                }
            } catch (e) {
                console.error(`❌ lockTasksCron notify error:`, e.message);
            }
        }
    }

    // ==========================================
    // 🌙 EVENING REFLECTION — بدون أزرار
    // ==========================================
    async eveningReflection() {
        console.log(`🌙 [${new Date().toLocaleTimeString('ar-EG')}] Evening reflection...`);
        const users = this.db.getAllUsers();

        for (const user of users) {
            try {
                const thread = await this.client.channels.fetch(user.thread_id).catch(() => null);
                if (!thread) continue;

                const habits = this.db.getHabits(user.user_id);
                if (habits.length === 0) continue;

                const total     = habits.length;
                const completed = habits.filter(h => h.completed).length;
                const isFemale  = user.gender === 'female';
                const mention   = `<@${user.user_id}>`;

                let content;

                if (completed === total) {
                    // ✅ يوم مكتمل — رسالة من evening_perfect
                    content = getEveningPerfectMessage(isFemale, mention);
                } else {
                    // ❌ يوم ناقص — رسالة من evening_missing + اقتباس
                    const missingMsg = getEveningMissingMessage(isFemale);
                    const quote = getRandomQuote(isFemale);
                    content = `${mention} ${missingMsg}\n\n> 💡 ${quote}`;
                }

                await thread.send(content);
                await this.sleep(600);

            } catch (e) {
                console.error(`❌ Evening (${user.name}):`, e.message);
            }
        }
        console.log('✅ Evening done.');
    }

    // ==========================================
    // 🔄 DAILY RESET
    // ==========================================
    async dailyReset() {
        console.log(`🔄 [12:00 AM] Daily reset...`);
        try {
            const frozenUsers = this.db.dailyReset();

            if (frozenUsers && frozenUsers.length > 0) {
                for (const user of frozenUsers) {
                    try {
                        const thread = await this.client.channels.fetch(user.thread_id).catch(() => null);
                        if (thread) {
                            const isFemale = user.gender === 'female';
                            const msg = isFemale
                                ? `❄️ <@${user.user_id}> استخدمنا رصيد الإجازة بتاعك النهاردة لحماية ستريكك! 🔥\n\nرصيد الإجازة المتبقي: **0** — حافظي على التزامك عشان تجددي رصيدك الشهر الجاي 💪`
                                : `❄️ <@${user.user_id}> استخدمنا رصيد الإجازة بتاعك النهاردة لحماية ستريكك! 🔥\n\nرصيد الإجازة المتبقي: **0** — حافظ على التزامك عشان تجدد رصيدك الشهر الجاي 💪`;
                            await thread.send(msg);
                            await this.sleep(500);
                        }
                    } catch (_) {}
                }
            }

            await this.checkAutoWarningRemoval();
            console.log('✅ Daily reset done.');
        } catch (e) {
            console.error('❌ Daily reset failed:', e.message);
        }
    }

    async checkAutoWarningRemoval() {
        const users = this.db.getAllUsers();
        const today = new Date();
        const twoWeeksAgo = new Date(today);
        twoWeeksAgo.setDate(today.getDate() - 14);
        const startStr = twoWeeksAgo.toISOString().split('T')[0];
        const endStr = today.toISOString().split('T')[0];

        for (const user of users) {
            if ((user.warning_count || 0) === 0) continue;

            const reportCount  = this.db.getReportCountInRange(user.user_id, startStr, endStr);
            const weeklyDone   = this.db.getCompletedTasksInRange(user.user_id, 'weekly', startStr, endStr);
            const weeklyTotal  = this.db.getTotalTasksInRange('weekly', startStr, endStr);
            const avgDaily     = reportCount / 14;
            const allWeeklyDone = weeklyTotal === 0 || weeklyDone >= weeklyTotal;

            if (avgDaily >= 5 / 7 && allWeeklyDone) {
                this.db.removeWarning(user.user_id);
                try {
                    const thread = await this.client.channels.fetch(user.thread_id).catch(() => null);
                    if (thread) {
                        await thread.send(
                            `✅ <@${user.user_id}> تم رفع إنذار عنك تلقائياً!\nأثبت التزامك على مدار أسبوعين متتاليين 💪`
                        );
                    }
                } catch (_) {}
            }
        }
    }

    // ==========================================
    // 🗓️ MONTHLY GOAL REMINDER
    // ==========================================
    async monthlyGoalReminder() {
        console.log(`🗓️ [${new Date().toLocaleTimeString('ar-EG')}] Monthly goal reminder...`);
        const users = this.db.getAllUsers();
        const now = new Date();
        const lastMonth = now.getMonth() === 0
            ? `${now.getFullYear() - 1}-12`
            : `${now.getFullYear()}-${String(now.getMonth()).padStart(2, '0')}`;
        const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
        const webBase = process.env.WEB_BASE_URL || `http://localhost:${process.env.WEB_PORT || 3000}`;

        for (const user of users) {
            try {
                const thread = await this.client.channels.fetch(user.thread_id).catch(() => null);
                if (!thread) continue;

                const monthlyReports = this.db.getMemberMonthlyReports(user.user_id);
                const hadLastMonth = monthlyReports.some(r => r.report_date === lastMonth);
                const name = user.name || 'صديقي';
                const row = new ActionRowBuilder().addComponents(
                    new ButtonBuilder()
                        .setCustomId('btn_monthly_goal')
                        .setLabel('حط أهدافك 🎯')
                        .setStyle(ButtonStyle.Primary)
                );

                let content;
                if (hadLastMonth) {
                    const webUrl = `${webBase}/member.html?id=${user.user_id}&month=${lastMonth}`;
                    content = `🗓️ شهر جديد يا ${name}!\n\nشوف ملفك لشهر ${lastMonth} 👇\n${webUrl}\n\nإيه أهدافك لشهر ${currentMonth}؟`;
                } else {
                    content = `🗓️ شهر جديد يا ${name}!\n\nإيه أهدافك لهذا الشهر؟`;
                }

                await thread.send({ content, components: [row] });
                await this.sleep(600);
            } catch (e) {
                console.error(`❌ Monthly reminder (${user.name}):`, e.message);
            }
        }
        console.log('✅ Monthly goal reminder done.');
    }

    // ==========================================
    // ⚠️ WEEKLY WARNING CHECK
    // ==========================================
    async weeklyWarningCheck() {
        console.log('⚠️ Weekly warning check...');
        try {
            const allUsers = this.db.getAllUsers();
            const today = new Date();
            const weekStart = new Date(today);
            weekStart.setDate(today.getDate() - 7);
            const startStr = weekStart.toISOString().split('T')[0];
            const endStr   = today.toISOString().split('T')[0];

            for (const user of allUsers) {
                const count = this.db.getReportCountInRange(user.user_id, startStr, endStr);
                if (count < 5) {
                    await issueWarning(
                        user.user_id,
                        `لم يكمل 5 من 7 تقارير أسبوعية (عمل ${count}/7)`,
                        null,
                        { db: this.db, client: this.client }
                    );
                    await this.sleep(500);
                }
            }

            await this._sendTimeoutReminders();
            console.log('✅ Warning check done.');
        } catch (e) {
            console.error('❌ Warning check failed:', e.message);
        }
    }

    // ==========================================
    // 🔔 إشعار الأدمن بـ Timeout
    // ==========================================
    async _notifyAdminTimeout(user, warningCount, reasons) {
        try {
            const adminChId = process.env.ADMIN_CHANNEL_ID;
            if (!adminChId) return;

            const guild = this.client.guilds.cache.first();
            if (!guild) return;

            const adminCh = await guild.channels.fetch(adminChId).catch(() => null);
            if (!adminCh) return;

            const { ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
            const row = new ActionRowBuilder().addComponents(
                new ButtonBuilder()
                    .setCustomId(`timeout_approve_${user.user_id}`)
                    .setLabel('تنفيذ Timeout ⏱️')
                    .setStyle(ButtonStyle.Danger),
                new ButtonBuilder()
                    .setCustomId(`timeout_dismiss_${user.user_id}`)
                    .setLabel('تجاهل ✋')
                    .setStyle(ButtonStyle.Secondary)
            );

            const webBase = process.env.WEB_BASE_URL || `http://localhost:${process.env.WEB_PORT || 3000}`;
            await adminCh.send({
                content:
                    `🚨 **إشعار Timeout — ${user.name}**\n\n` +
                    `**الأعضاء:** <@${user.user_id}>\n` +
                    `**عدد الإنذارات:** ${warningCount}/3\n\n` +
                    `**أسباب الإنذارات:**\n${reasons}\n\n` +
                    `📊 [صفحة العضو](${webBase}/member.html?id=${user.user_id})\n\n` +
                    `اختر الإجراء المناسب:`,
                components: [row]
            });
        } catch (e) {
            console.error('❌ Admin notify error:', e.message);
        }
    }

    async _sendTimeoutReminders() {
        try {
            const adminChId = process.env.ADMIN_CHANNEL_ID;
            if (!adminChId) return;

            const overdueList = this.db.getOverdueTimeoutReminders();
            if (!overdueList.length) return;

            const guild = this.client.guilds.cache.first();
            if (!guild) return;

            const adminCh = await guild.channels.fetch(adminChId).catch(() => null);
            if (!adminCh) return;

            let reminderText = `⏰ **تذكير — قائمة Timeout المعلقة:**\n\n`;
            for (const item of overdueList) {
                reminderText += `• **${item.name}** <@${item.user_id}> — ${item.warning_count} إنذارات\n`;
                this.db.updateTimeoutReminderTime(item.user_id);
            }
            reminderText += `\nاستخدم \`$timeout_list\` لعرض القائمة كاملة.`;
            await adminCh.send(reminderText);
        } catch (e) {
            console.error('❌ Timeout reminder error:', e.message);
        }
    }

    // ==========================================
    // 📊 WEEKLY LEADERBOARD
    // ==========================================
    async weeklyLeaderboard() {
        console.log('📊 [Sunday 8PM] Weekly leaderboard...');
        try {
            const leaders = this.db.getLeaderboard(20);
            if (!leaders.length) return;

            const weekNumber = this._getWeekNumber();
            let firstDiscordUser = null;
            try { firstDiscordUser = await this.client.users.fetch(leaders[0].user_id); } catch (_) {}

            const embed = this._buildLeaderboardEmbed(leaders, weekNumber, firstDiscordUser);
            const leaderboardChannelId = process.env.LEADERBOARD_CHANNEL_ID;

            if (leaderboardChannelId) {
                const leaderboardCh = await this.client.channels.fetch(leaderboardChannelId).catch(() => null);
                if (leaderboardCh) {
                    await leaderboardCh.send({ embeds: [embed] });
                    console.log('✅ Leaderboard sent to channel.');
                }
            } else {
                const users = this.db.getAllUsers();
                for (const user of users) {
                    try {
                        const thread = await this.client.channels.fetch(user.thread_id).catch(() => null);
                        if (thread) { await thread.send({ embeds: [embed] }); await this.sleep(600); }
                    } catch (e) {
                        console.error(`❌ Leaderboard (${user.name}):`, e.message);
                    }
                }
                console.log('✅ Leaderboard sent.');
            }
        } catch (e) {
            console.error('❌ Leaderboard failed:', e.message);
        }
    }

    // ==========================================
    // 📅 SCHEDULED MESSAGES SYSTEM
    // ==========================================
    loadScheduledMessages() {
        const messages = this.db.getScheduledMessages(true);
        for (const msg of messages) this._scheduleMessage(msg);
        console.log(`📅 Loaded ${messages.length} scheduled messages`);
    }

    _scheduleMessage(msg) {
        if (this._schedulerJobs.has(msg.id)) {
            this._schedulerJobs.get(msg.id).stop();
        }

        try {
            const job = cron.schedule(msg.cron_expr, async () => {
                await this._sendScheduledMessage(msg);
                if (msg.repeat_type === 'once') {
                    job.stop();
                    this.db.updateScheduledMessage(msg.id, { is_active: 0, last_sent: new Date().toISOString() });
                    this._schedulerJobs.delete(msg.id);
                } else {
                    this.db.updateScheduledMessage(msg.id, { last_sent: new Date().toISOString() });
                }
            }, { timezone: TZ });

            this._schedulerJobs.set(msg.id, job);
        } catch (e) {
            console.error(`❌ Schedule error (id=${msg.id}):`, e.message);
        }
    }

    async _sendScheduledMessage(msg) {
        try {
            const channel = await this.client.channels.fetch(msg.channel_id).catch(() => null);
            if (!channel) { console.error(`❌ Channel ${msg.channel_id} not found`); return; }

            const { ChannelType } = require('discord.js');
            const payload = { content: msg.content };
            if (msg.media_url) payload.files = [{ attachment: msg.media_url }];

            if (channel.type === ChannelType.GuildForum) {
                const threadName = msg.title || `📅 ${new Date().toLocaleDateString('ar-EG', { weekday: 'long', day: 'numeric', month: 'long' })}`;
                await channel.threads.create({ name: threadName, message: payload });
                console.log(`✅ Scheduled Forum thread created: "${threadName}"`);
            } else {
                await channel.send(payload);
                console.log(`✅ Scheduled message sent: "${msg.title || msg.id}"`);
            }
        } catch (e) {
            console.error(`❌ Send scheduled message error:`, e.message);
        }
    }

    addAndSchedule(data) {
        const id = this.db.addScheduledMessage(data);
        if (id) {
            const msg = this.db.getScheduledMessages(false).find(m => m.id === id);
            if (msg) this._scheduleMessage(msg);
        }
        return id;
    }

    toggleScheduledMessage(id, active) {
        this.db.updateScheduledMessage(id, { is_active: active ? 1 : 0 });
        if (!active && this._schedulerJobs.has(id)) {
            this._schedulerJobs.get(id).stop();
            this._schedulerJobs.delete(id);
        } else if (active) {
            const msg = this.db.getScheduledMessages(false).find(m => m.id === id);
            if (msg) this._scheduleMessage(msg);
        }
    }

    // ==========================================
    // 🛠️ HELPERS
    // ==========================================
    _getWeekNumber() {
        const now = new Date();
        const start = new Date(now.getFullYear(), 0, 1);
        return Math.ceil(((now - start) / 86400000 + 1) / 7);
    }

    _buildLeaderboardEmbed(leaders, weekNumber, firstDiscordUser) {
        const { EmbedBuilder } = require('discord.js');
        const medals = ['🥇', '🥈', '🥉'];

        let desc = `**الأسبوع #${weekNumber}**\n> "الاستمرارية هي سر النجاح"\n\n`;

        leaders.slice(0, 3).forEach((l, i) => {
            const rate = l.avg_rate ? Math.round(l.avg_rate) : 0;
            desc += `${medals[i]} **${l.name}**\n   └─ ${rate}% التزام | 🔥 ${l.days_streak || 0} يوم\n\n`;
        });

        if (leaders.length > 3) {
            desc += '**المتفوقون الآخرون:**\n';
            leaders.slice(3, 10).forEach((l, i) => {
                desc += `${i + 4}. ${l.name} — ${Math.round(l.avg_rate || 0)}%\n`;
            });
        }

        const embed = new EmbedBuilder()
            .setColor(CONFIG.COLORS.primary)
            .setTitle('🏆 لوحة الشرف الأسبوعية')
            .setDescription(desc)
            .setFooter({ text: 'محـاولات', iconURL: this.client.user.displayAvatarURL() });

        if (firstDiscordUser) embed.setThumbnail(firstDiscordUser.displayAvatarURL());
        return embed;
    }

    // ==========================================
    // 🏆 CHECK EXPIRED CHALLENGES
    // ==========================================
    async checkExpiredChallenges() {
        try {
            const expired = this.db.getExpiredChallenges();
            if (!expired.length) return;

            for (const ch of expired) {
                await announceChallengeEnd(ch, this.db, this.client);
                this.db.updateChallengeStatus(ch.id, false);
                console.log(`✅ Challenge ended automatically: ${ch.title} (ID: ${ch.id})`);
            }
        } catch (e) {
            console.error('❌ checkExpiredChallenges:', e.message);
        }
    }

    sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

    stop() {
        this.jobs.forEach(j => j.stop());
        this._schedulerJobs.forEach(j => j.stop());
        console.log('🛑 Automation stopped');
    }
}

module.exports = AutomationSystem;

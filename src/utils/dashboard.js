// ==========================================
// 🎨 DASHBOARD UTILITY
// ==========================================

const { ActionRowBuilder, ButtonBuilder, ButtonStyle, StringSelectMenuBuilder, ModalBuilder, TextInputBuilder, TextInputStyle, MessageFlags, EmbedBuilder } = require('discord.js');
const CONFIG = require('../config');

// ==========================================
// 📊 PROGRESS BAR
// ==========================================
function makeBar(percent, length = 10) {
    const filled = Math.round((percent / 100) * length);
    const empty  = length - filled;
    let emoji = '🟩';
    if      (percent < 25) emoji = '🟥';
    else if (percent < 50) emoji = '🟧';
    else if (percent < 75) emoji = '🟨';
    return emoji.repeat(filled) + '⬜'.repeat(empty) + ` ${percent}%`;
}

// ==========================================
// 🏠 HOME SECTION
// تم ضبط توقيت مصر (Shifted Day) وحالة المهام (➖ / ✅ / ❌)
// ==========================================
async function buildHomeSection(userId, db, guildId = null) {
    const user   = db.getUser(userId);
    if (!user) return null;
    const habits = db.getHabits(userId);

    const total     = habits.length;
    const completed = habits.filter(h => h.completed).length;
    const percent   = total > 0 ? Math.round((completed / total) * 100) : 0;

    const now          = new Date();
    const dateLabel    = now.toLocaleDateString('ar-EG', { weekday: 'long', day: 'numeric', month: 'long' });
    const currentYear  = now.getFullYear().toString();
    const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    const currentWeek  = `${currentMonth}-W${Math.ceil(now.getDate() / 7)}`;

    const yearlyGoals  = db.getGoals(userId, 'yearly',  currentYear).map(g => g.goal_text);
    const monthlyGoals = db.getGoals(userId, 'monthly', currentMonth).map(g => g.goal_text);
    const weeklyGoals  = db.getGoals(userId, 'weekly',  currentWeek).map(g => g.goal_text);
    const mainGoal     = user.goal || user.bio || '—';

    // ─────────────────────────────────────────
    // ⏰ 1. معالجة تقرير اليوم (الديلي) بتوقيت مصر (Shifted Day)
    // ─────────────────────────────────────────
    const cairoTimeStr = now.toLocaleString("en-US", { timeZone: "Africa/Cairo" });
    const cairoDate = new Date(cairoTimeStr);
    const hour = cairoDate.getHours();

    const formatDate = (d) => {
        const yyyy = d.getFullYear();
        const mm = String(d.getMonth() + 1).padStart(2, '0');
        const dd = String(d.getDate()).padStart(2, '0');
        return `${yyyy}-${mm}-${dd}`;
    };

    // Shifted Day: 22:00–23:59 = Today | 00:00–12:00 = Yesterday | 12:01–21:59 = ➖
    let dailyStatus = '➖';
    if (hour >= 0 && hour < 12) {
        const yesterday = new Date(cairoDate);
        yesterday.setDate(yesterday.getDate() - 1);
        const report = db.getDailyReport ? db.getDailyReport(userId, formatDate(yesterday)) : null;
        dailyStatus = report ? '✅' : '❌';
    } else if (hour >= 22 && hour <= 23) {
        const report = db.getDailyReport ? db.getDailyReport(userId, formatDate(cairoDate)) : null;
        dailyStatus = report ? '✅' : '❌';
    }

    // مواسم (Seasons) 28 يوم — نحسب التراكرز نسبة للموسم الحالي
    const activeSeason = db.getActiveMonth ? db.getActiveMonth() : null;
    let dailyCount = 0;
    let weeklyCount = 0, weeklyTotal = 4, monthlyCount = 0, monthlyTotal = 1;
    let weeklyStatus = '➖';
    let monthlyStatus = '➖';

    if (activeSeason) {
        const seasonStartDate = new Date(activeSeason.start_date);
        const seasonStartUTC = Date.UTC(seasonStartDate.getFullYear(), seasonStartDate.getMonth(), seasonStartDate.getDate());
        const todayUTC = Date.UTC(cairoDate.getFullYear(), cairoDate.getMonth(), cairoDate.getDate());
        const diffDays = Math.floor((todayUTC - seasonStartUTC) / (24 * 60 * 60 * 1000));
        const duration = activeSeason.duration_days || 28;

        if (diffDays >= 0 && diffDays < duration) {
            const seasonStartStr = formatDate(seasonStartDate);
            const seasonEnd = new Date(seasonStartDate);
            seasonEnd.setDate(seasonEnd.getDate() + duration - 1);
            const seasonEndStr = formatDate(seasonEnd);

            // أسبوع الموسم الحالي (7 أيام متتالية داخل الـ Season)
            const weekIndex = Math.floor(diffDays / 7); // 0..3
            const blockStart = new Date(seasonStartDate);
            blockStart.setDate(blockStart.getDate() + weekIndex * 7);
            const blockEnd = new Date(blockStart);
            blockEnd.setDate(blockEnd.getDate() + 6);
            const blockStartStr = formatDate(blockStart);
            const blockEndStr = formatDate(blockEnd);

            // Daily [X/7] — تقارير هذا البلوك فقط
            dailyCount = db.getReportCountInRange ? db.getReportCountInRange(userId, blockStartStr, blockEndStr) : 0;

            // Weekly [X/4] — عدد المهام الأسبوعية المكتملة في الموسم كله
            weeklyCount = db.getCompletedTasksInRange ? db.getCompletedTasksInRange(userId, 'weekly', seasonStartStr, seasonEndStr) : 0;
            weeklyTotal = 4;
            weeklyStatus = weeklyCount >= weeklyTotal ? '✅' : '❌';

            // Monthly [X/1] — عدد المهام الشهرية (الموسمية) في الموسم كله
            monthlyCount = db.getCompletedTasksInRange ? db.getCompletedTasksInRange(userId, 'monthly', seasonStartStr, seasonEndStr) : 0;
            monthlyTotal = 1;
            monthlyStatus = monthlyCount >= monthlyTotal ? '✅' : '❌';
        }
    }

    // ─────────────────────────────────────────
    // بناء واجهة الداشبورد
    // ─────────────────────────────────────────
    let content = `👋 **مساحة: <@${userId}>**\n📅 ${dateLabel}\n`;
    content += '```\n';
    content += '━━━━━━━━━━━━━━━━━━━━━━━━\n';
    content += '🏠 HOME\n';
    content += '━━━━━━━━━━━━━━━━━━━━━━━━\n';
    content += `🎯 MAIN GOAL\n`;
    content += `${mainGoal}\n\n`;
    content += `📌 GOALS\n`;
    content += `Annual  : ${yearlyGoals.length  ? yearlyGoals.join(' | ')  : '—'}\n`;
    content += `Monthly : ${monthlyGoals.length ? monthlyGoals.join(' | ') : '—'}\n`;
    content += `Weekly  : ${weeklyGoals.length  ? weeklyGoals.join(' | ')  : '—'}\n\n`;
    const maxHabitsFreeze = 2;
    const maxReportsFreeze = 2;
    const habitsFreeze = typeof user.freeze_habits === 'number' ? user.freeze_habits : maxHabitsFreeze;
    const reportsFreeze = typeof user.freeze_reports === 'number' ? user.freeze_reports : maxReportsFreeze;

    content += `📋 COMMUNITY TASKS\n`;
    content += `Daily   : ${dailyStatus} [${dailyCount}/7]\n`;
    content += `Weekly  : ${weeklyStatus} [${weeklyCount}/${weeklyTotal}]\n`;
    content += `Monthly : ${monthlyStatus} [${monthlyCount}/${monthlyTotal}]\n\n`;
    content += `❄️ FREEZES (إجازات)\n`;
    content += `Habits  : [${habitsFreeze}/${maxHabitsFreeze}]\n`;
    content += `Reports : [${reportsFreeze}/${maxReportsFreeze}]\n\n`;
    content += `📈 HABITS — ${completed}/${total}\n`;
    content += makeBar(percent, 15) + '\n';
    content += '━━━━━━━━━━━━━━━━━━━━━━━━\n';
    content += '```\n';
    content += CONFIG.DASHBOARD.habitsTitle + '\n';

    return content;
}

// ==========================================
// 📊 STATS SECTION
// ==========================================
async function buildStatsSection(userId, db) {
    const user = db.getUser(userId);
    if (!user) return null;

    const habits    = db.getHabits(userId);
    const total     = habits.length;
    const completed = habits.filter(h => h.completed).length;
    const percent   = total > 0 ? Math.round((completed / total) * 100) : 0;
    const streak    = user.days_streak || 0;
    const totalDone = user.total_done  || 0;

    let rank = CONFIG.RANKS.beginner;
    for (const r of Object.values(CONFIG.RANKS)) {
        if (streak >= r.min && streak <= r.max) { rank = r; break; }
    }

    const totalReports = db.getUserTotalReports ? db.getUserTotalReports(userId) : 0;
    const maxStreak    = db.getUserMaxStreak    ? db.getUserMaxStreak(userId)    : streak;
    const weeklyData   = db.getWeeklyReport     ? db.getWeeklyReport(userId)    : [];

    const activeChallenges = db.getActiveChallenges ? db.getActiveChallenges() : [];
    const userChallenge    = activeChallenges.find(c => {
        const p = db.getChallengeParticipant ? db.getChallengeParticipant(c.id, userId) : null;
        return !!p;
    });

    const dayMap = { 'السبت':'SAT','الأحد':'SUN','الاثنين':'MON','الثلاثاء':'TUE','الأربعاء':'WED','الخميس':'THU','الجمعة':'FRI' };
    function rateEmoji(r) {
        if (r >= 100) return '🟩';
        if (r >= 75)  return '🟩';
        if (r >= 50)  return '🟨';
        if (r > 0)    return '🟧';
        return '⬛';
    }

    let weekGraph = '';
    if (weeklyData.length) {
        weeklyData.forEach(day => {
            const nameAr = new Date(day.date).toLocaleDateString('ar-EG', { weekday: 'long' });
            const en     = dayMap[nameAr] || 'DAY';
            const r      = day.rate || 0;
            const bars   = Math.floor(r / 10);
            const emoji  = rateEmoji(r);
            weekGraph += `${en.padEnd(3)} : ${emoji.repeat(bars)}${'⬛'.repeat(10 - bars)} ${Math.round(r)}%\n`;
        });
    } else {
        weekGraph = '— No data yet\n';
    }

    let content = `👋 **مساحة: <@${userId}>**\n`;
    content += '```\n';
    content += '━━━━━━━━━━━━━━━━━━━━━━━━\n';
    content += '📊 STATISTICS\n';
    content += '━━━━━━━━━━━━━━━━━━━━━━━━\n';
    content += '🔥 STREAK\n';
    content += `Current : ${streak} days\n`;
    content += `Best    : ${maxStreak} days\n\n`;
    content += '💎 RANK\n';
    content += `Level   : ${rank.name} ${rank.emoji}\n\n`;
    content += '📝 REPORTS\n';
    content += `Total   : ${totalReports} days\n\n`;
    content += '📈 HABITS TODAY\n';
    content += makeBar(percent, 10) + '\n';
    content += `Done    : ${completed} / ${total}\n`;

    if (userChallenge) {
        const participant = db.getChallengeParticipant(userChallenge.id, userId);
        const challengePercent = userChallenge.challenge_time > 0
            ? Math.min(100, Math.round(((participant?.total_minutes || 0) / userChallenge.challenge_time) * 100))
            : 0;
        content += '\n🏆 ACTIVE CHALLENGE\n';
        content += `Name    : ${userChallenge.title}\n`;
        content += makeBar(challengePercent, 10) + '\n';
        content += `Minutes : ${participant?.total_minutes || 0} / ${userChallenge.challenge_time}\n`;
        content += `Days    : ${participant?.days_count || 0}\n`;
    }

    content += '\n📅 THIS WEEK\n';
    content += weekGraph;
    content += '━━━━━━━━━━━━━━━━━━━━━━━━\n';
    content += '```\n';

    return content;
}

// ==========================================
// 🏆 CHALLENGES SECTION
// ==========================================
async function buildChallengesSection(userId, db) {
    const stats = db.getUserChallengeStats ? db.getUserChallengeStats(userId) : { total: 0, total_minutes: 0, top3: 0 };
    const activeChallenges = db.getActiveChallenges ? db.getActiveChallenges() : [];
    const userActive = activeChallenges.filter(c => {
        return db.getChallengeParticipant ? !!db.getChallengeParticipant(c.id, userId) : false;
    });

    let content = `👋 **مساحة: <@${userId}>**\n`;
    content += '```\n';
    content += '━━━━━━━━━━━━━━━━━━━━━━━━\n';
    content += '🏆 CHALLENGES\n';
    content += '━━━━━━━━━━━━━━━━━━━━━━━━\n';
    content += '📊 OVERVIEW\n';
    content += `Total   : ${stats.total} challenges\n`;
    content += `Top 3   : ${stats.top3} times\n`;
    content += `Minutes : ${stats.total_minutes} min\n`;

    if (userActive.length) {
        for (const c of userActive) {
            const p = db.getChallengeParticipant(c.id, userId);
            const pct = c.challenge_time > 0
                ? Math.min(100, Math.round(((p?.total_minutes || 0) / c.challenge_time) * 100))
                : 0;
            content += '\n🔥 ACTIVE CHALLENGE\n';
            content += `Name    : ${c.title}\n`;
            content += makeBar(pct, 10) + '\n';
            content += `Days    : ${p?.days_count || 0}\n`;
            content += `Minutes : ${p?.total_minutes || 0} / ${c.challenge_time}\n`;
        }
    } else {
        content += '\n— No active challenges\n';
    }

    content += '━━━━━━━━━━━━━━━━━━━━━━━━\n';
    content += '```\n';

    return content;
}

// ==========================================
// 🎯 GOALS SECTION
// ==========================================
async function buildGoalsSection(userId, db) {
    const now          = new Date();
    const currentYear  = now.getFullYear().toString();
    const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    const weekNum      = Math.ceil(now.getDate() / 7);
    const currentWeek  = `${currentMonth}-W${weekNum}`;
    const monthName    = now.toLocaleDateString('en-US', { month: 'long' });

    const yearlyGoals  = db.getGoals(userId, 'yearly',  currentYear).map(g => g.goal_text);
    const monthlyGoals = db.getGoals(userId, 'monthly', currentMonth).map(g => g.goal_text);
    const weeklyGoals  = db.getGoals(userId, 'weekly',  currentWeek).map(g => g.goal_text);
    const mainGoal     = db.getUser(userId)?.goal || '—';

    let content = `👋 **مساحة: <@${userId}>**\n`;
    content += '```\n';
    content += '━━━━━━━━━━━━━━━━━━━━━━━━\n';
    content += '🎯 GOALS\n';
    content += '━━━━━━━━━━━━━━━━━━━━━━━━\n';
    content += `🌟 MAIN GOAL\n${mainGoal}\n\n`;
    content += `🗓️  ANNUAL — ${currentYear}\n`;
    content += yearlyGoals.length ? yearlyGoals.map(g => `  • ${g}`).join('\n') + '\n' : '  — Not set\n';
    content += `\n📅 MONTHLY — ${monthName}\n`;
    content += monthlyGoals.length ? monthlyGoals.map(g => `  • ${g}`).join('\n') + '\n' : '  — Not set\n';
    content += `\n📆 WEEKLY — Week ${weekNum}\n`;
    content += weeklyGoals.length ? weeklyGoals.map(g => `  • ${g}`).join('\n') + '\n' : '  — Not set\n';
    content += '━━━━━━━━━━━━━━━━━━━━━━━━\n';
    content += '```\n';

    return content;
}

// ==========================================
// 🔘 BUILD ROWS
// ==========================================
function buildHabitRows(habits) {
    const rows = [];
    const displayHabits = habits.slice(0, 10);
    for (let i = 0; i < displayHabits.length; i += 5) {
        const row = new ActionRowBuilder();
        displayHabits.slice(i, i + 5).forEach(h => {
            row.addComponents(
                new ButtonBuilder()
                    .setCustomId(`check_${h.id}`)
                    .setLabel(h.name)
                    .setStyle(h.completed ? ButtonStyle.Success : ButtonStyle.Secondary)
                    .setEmoji(h.completed ? '✅' : '⏳')
            );
        });
        rows.push(row);
    }
    return rows;
}

function buildControlRow(section) {
    const btns = [];
    if (section === 'home') {
        btns.push(
            new ButtonBuilder().setCustomId('btn_add').setLabel('إضافة عادة').setStyle(ButtonStyle.Primary).setEmoji('➕'),
            new ButtonBuilder().setCustomId('btn_refresh').setLabel('تحديث').setStyle(ButtonStyle.Secondary).setEmoji('🔄'),
            new ButtonBuilder().setCustomId('btn_edit_profile').setLabel('تعديل الملف').setStyle(ButtonStyle.Secondary).setEmoji('✏️'),
            new ButtonBuilder().setCustomId('btn_delete_mode').setLabel('حذف عادة').setStyle(ButtonStyle.Danger).setEmoji('🗑️')
        );
    } else if (section === 'goals') {
        btns.push(
            new ButtonBuilder().setCustomId('btn_goal_annual').setLabel('هدف سنوي').setStyle(ButtonStyle.Primary).setEmoji('🗓️'),
            new ButtonBuilder().setCustomId('btn_goal_monthly').setLabel('هدف شهري').setStyle(ButtonStyle.Primary).setEmoji('📅'),
            new ButtonBuilder().setCustomId('btn_goal_weekly').setLabel('هدف أسبوعي').setStyle(ButtonStyle.Primary).setEmoji('📆'),
            new ButtonBuilder().setCustomId('btn_refresh').setLabel('تحديث').setStyle(ButtonStyle.Secondary).setEmoji('🔄')
        );
    } else {
        btns.push(
            new ButtonBuilder().setCustomId('btn_refresh').setLabel('تحديث').setStyle(ButtonStyle.Secondary).setEmoji('🔄')
        );
    }
    return new ActionRowBuilder().addComponents(btns);
}

function buildPersonalSpaceRow() {
    return new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('btn_freeze').setLabel('طلب إجازة ❄️').setStyle(ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId('btn_journal').setLabel('أضف تدوينة').setStyle(ButtonStyle.Secondary).setEmoji('📝'),
        new ButtonBuilder().setCustomId('btn_journal_log').setLabel('سجل التدوين').setStyle(ButtonStyle.Secondary).setEmoji('🗂️')
    );
}

function buildMenuRow() {
    return new ActionRowBuilder().addComponents(
        new StringSelectMenuBuilder()
            .setCustomId('dashboard_menu')
            .setPlaceholder('📋 القائمة...')
            .addOptions([
                { label: 'الرئيسية',       value: 'section_home',       emoji: '🏠' },
                { label: 'الإحصائيات',     value: 'section_stats',      emoji: '📊' },
                { label: 'تحدياتي',        value: 'section_challenges', emoji: '🏆' },
                { label: 'أهدافي',         value: 'section_goals',      emoji: '🎯' },
                { label: 'مراجعة يوم',     value: 'review_history',     emoji: '📅' },
                { label: 'عن البوت',       value: 'about',              emoji: 'ℹ️' }
            ])
    );
}

// ==========================================
// 📊 UPDATE DASHBOARD
// ==========================================
async function updateDashboard(thread, userId, db, section = 'home') {
    try {
        const user = db.getUser(userId);
        if (!user) return;

        const habits = db.getHabits(userId);
        let content  = '';
        let rows     = [];

        const guildId = thread.guild?.id || thread.guildId || null;

        if (section === 'home') {
            content = await buildHomeSection(userId, db, guildId);
            rows = [...buildHabitRows(habits), buildControlRow('home'), buildPersonalSpaceRow(), buildMenuRow()];
        } else if (section === 'stats') {
            content = await buildStatsSection(userId, db);
            rows = [buildControlRow('stats'), buildMenuRow()];
        } else if (section === 'challenges') {
            content = await buildChallengesSection(userId, db);
            rows = [buildControlRow('challenges'), buildMenuRow()];
        } else if (section === 'goals') {
            content = await buildGoalsSection(userId, db);
            rows = [buildControlRow('goals'), buildMenuRow()];
        }

        if (!content) return;

        const starterMsg = await thread.fetchStarterMessage().catch(() => null);
        if (starterMsg) {
            await starterMsg.edit({ content, embeds: [], components: rows });
        } else {
            await thread.send({ content, components: rows });
        }
    } catch (e) {
        console.error('❌ Dashboard Update Error:', e.message);
    }
}

// ==========================================
// 🎨 WEEKLY GRAPH
// ==========================================
function generateWeeklyGraph(weeklyReport, currentRate = null) {
    const dayMap = { 'السبت':'SAT','الأحد':'SUN','الاثنين':'MON','الثلاثاء':'TUE','الأربعاء':'WED','الخميس':'THU','الجمعة':'FRI' };
    function rateToEmoji(r) {
        if (r >= 75) return '🟩';
        if (r >= 50) return '🟨';
        if (r > 0)   return '🟧';
        return '⬛';
    }
    let graph = '';
    if (!weeklyReport?.length) {
        const dayEn = dayMap[new Date().toLocaleDateString('ar-EG', { weekday: 'long' })] || 'DAY';
        const r     = currentRate || 0;
        const emoji = rateToEmoji(r);
        graph = `${dayEn.padEnd(3)} : ${emoji.repeat(Math.floor(r / 10))}${'⬛'.repeat(10 - Math.floor(r / 10))} ${Math.round(r)}%`;
    } else {
        weeklyReport.forEach(day => {
            const nameAr = new Date(day.date).toLocaleDateString('ar-EG', { weekday: 'long' });
            const dayEn  = dayMap[nameAr] || 'DAY';
            const r      = day.rate || 0;
            const bars   = Math.floor(r / 10);
            const emoji  = rateToEmoji(r);
            graph += `${dayEn.padEnd(3)} : ${emoji.repeat(bars)}${'⬛'.repeat(10 - bars)} ${Math.round(r)}%\n`;
        });
    }
    return graph;
}

function getRankInfo(streak) {
    for (const rank of Object.values(CONFIG.RANKS)) {
        if (streak >= rank.min && streak <= rank.max) return rank;
    }
    return CONFIG.RANKS.beginner;
}

// ==========================================
// 📝 JOURNAL (تدوين)
// ==========================================
function showJournalModal(interaction) {
    const modal = new ModalBuilder()
        .setCustomId('modal_journal')
        .setTitle('📝 تدوين');
    modal.addComponents(
        new ActionRowBuilder().addComponents(
            new TextInputBuilder()
                .setCustomId('journal_mood')
                .setLabel('المود العام (اختياري)')
                .setStyle(TextInputStyle.Short)
                .setPlaceholder('اكتب كلمة أو إيموجي يعبر عن يومك...')
                .setRequired(false)
        ),
        new ActionRowBuilder().addComponents(
            new TextInputBuilder()
                .setCustomId('journal_content')
                .setLabel('أفكارك')
                .setStyle(TextInputStyle.Paragraph)
                .setPlaceholder('اكتب ما يجول في خاطرك...')
                .setRequired(true)
        )
    );
    return interaction.showModal(modal);
}

async function processJournalModal(interaction, db) {
    try {
        await interaction.deferReply({ ephemeral: true });
        const content = (interaction.fields.getTextInputValue('journal_content') || '').trim();
        if (!content) return interaction.editReply('❌ لم تُدخل أي نص.');
        const mood = (interaction.fields.getTextInputValue('journal_mood') || '').trim();
        const toSave = mood ? `المود: ${mood}\n${content}` : content;
        db.addJournal(interaction.user.id, toSave);
        await interaction.editReply('تم حفظ أفكارك في مساحتك الخاصة بسرية ✅');
    } catch (e) {
        console.error('❌ processJournalModal:', e.message);
        await interaction.editReply({ content: '❌ حدث خطأ.', ephemeral: true }).catch(() => {});
    }
}

async function showJournalLog(interaction, db) {
    try {
        await interaction.deferReply({ ephemeral: true });
        const journals = db.getUserJournals ? db.getUserJournals(interaction.user.id, 25) : [];
        if (!journals.length) return interaction.editReply({ content: '🗂️ لا توجد تدوينات بعد. استخدم **📝 تدوين** لكتابة أول تدوينة.', ephemeral: true });

        const perPage = 5;
        const separator = '\n━━━━━━━━━━━━━━\n';
        const pages = [];
        for (let i = 0; i < journals.length; i += perPage) {
            const slice = journals.slice(i, i + perPage);
            const maxEntryLen = 700;
            const desc = slice.map(j => {
                const date = j.created_at ? new Date(j.created_at).toLocaleDateString('ar-EG', { dateStyle: 'medium' }) : '—';
                let content = (j.content || '').trim();
                if (content.length > maxEntryLen) content = content.slice(0, maxEntryLen) + '…';
                return `**📅 ${date}**\n${content}`;
            }).join(separator);
            const embed = new EmbedBuilder()
                .setColor(CONFIG.COLORS?.primary || 0x2ecc71)
                .setTitle('🗂️ سجل التدوين')
                .setDescription(desc)
                .setFooter({ text: `صفحة ${Math.floor(i / perPage) + 1} من ${Math.ceil(journals.length / perPage)}` });
            pages.push(embed);
        }
        await interaction.editReply({ embeds: pages.slice(0, 1), ephemeral: true });
    } catch (e) {
        console.error('❌ showJournalLog:', e.message);
        await interaction.reply({ content: '❌ حدث خطأ.', ephemeral: true }).catch(() => {});
    }
}

module.exports = { updateDashboard, generateWeeklyGraph, getRankInfo, showJournalModal, processJournalModal, showJournalLog };
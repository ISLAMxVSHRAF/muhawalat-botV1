// ==========================================
// 🎨 DASHBOARD UTILITY
// ==========================================

const { ActionRowBuilder, ButtonBuilder, ButtonStyle, StringSelectMenuBuilder } = require('discord.js');
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
// FIX: تستقبل الآن guildId لتمريره لـ getMissingTasks بدلاً من null
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

    const todayIso    = now.toISOString().split('T')[0];
    const todayReport = db.getDailyReport ? db.getDailyReport(userId, todayIso) : null;
    // ✅ FIX: تمرير guildId الفعلي بدلاً من null لضمان عمل المقارنة في قاعدة البيانات
    const activeTasks = db.getMissingTasks ? db.getMissingTasks(userId, guildId) : [];
    const weeklyDone  = !activeTasks.find(t => t.type === 'weekly');
    const monthlyDone = !activeTasks.find(t => t.type === 'monthly');

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
    content += `📋 COMMUNITY TASKS\n`;
    content += `Daily   : ${todayReport  ? '✅' : '❌'}\n`;
    content += `Weekly  : ${weeklyDone   ? '✅' : '❌'}\n`;
    content += `Monthly : ${monthlyDone  ? '✅' : '❌'}\n\n`;
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

    // تحدي نشط
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
// 🔘 BUILD ROWS على حسب القسم
// FIX: slice(0, 10) لمنع تجاوز حد Discord (5 صفوف × 5 أزرار = 25 زر كحد أقصى)
//      نعرض أقصى 10 عادات كأزرار (صفين)
// ==========================================
function buildHabitRows(habits) {
    const rows = [];
    // ✅ FIX: slice(0, 10) — حد أقصى 10 عادات كأزرار لتفادي تجاوز حد Discord
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

function buildMenuRow() {
    return new ActionRowBuilder().addComponents(
        new StringSelectMenuBuilder()
            .setCustomId('dashboard_menu')
            .setPlaceholder('📋 القائمة...')
            .addOptions([
                { label: '🏠 الرئيسية',    value: 'section_home',       emoji: '🏠' },
                { label: '📊 إحصائياتي',   value: 'section_stats',      emoji: '📊' },
                { label: '🏆 تحدياتي',     value: 'section_challenges', emoji: '🏆' },
                { label: '🎯 أهدافي',      value: 'section_goals',      emoji: '🎯' },
                { label: '📅 مراجعة يوم',  value: 'review_history',     emoji: '📅' },
                { label: '👤 بطاقتي',      value: 'my_card',            emoji: '👤' },
                { label: 'ℹ️ عن البوت',    value: 'about',              emoji: 'ℹ️' }
            ])
    );
}

// ==========================================
// 📊 UPDATE DASHBOARD
// FIX: تمرير guild.id لـ buildHomeSection لحل مشكلة Community Tasks
// ==========================================
async function updateDashboard(thread, userId, db, section = 'home') {
    try {
        const user = db.getUser(userId);
        if (!user) return;

        const habits = db.getHabits(userId);
        let content  = '';
        let rows     = [];

        // ✅ FIX: استخراج guildId من الـ thread لتمريره لـ buildHomeSection
        const guildId = thread.guild?.id || thread.guildId || null;

        if (section === 'home') {
            content = await buildHomeSection(userId, db, guildId);
            rows = [...buildHabitRows(habits), buildControlRow('home'), buildMenuRow()];
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

module.exports = { updateDashboard, generateWeeklyGraph, getRankInfo };

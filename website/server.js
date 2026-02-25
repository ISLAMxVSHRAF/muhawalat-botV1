// ==========================================
// 🌐 MUHAWALAT WEB SERVER
// Express API — Bento Grid & Command Center
// Version: 2.0.0
// ==========================================

const express  = require('express');
const path     = require('path');
const crypto   = require('crypto');
const CONFIG   = require('../src/config');

const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// ==========================================
// 🔑 CONFIG
// ==========================================
const ADMIN_PASSWORD = process.env.WEB_ADMIN_PASSWORD || 'muhawalat2026';
const PORT           = process.env.WEB_PORT || 3000;
const TOKEN_SECRET   = process.env.WEB_TOKEN_SECRET || crypto.randomBytes(32).toString('hex');

// In-memory sessions (سريعة — تُمسح عند إعادة تشغيل البوت)
const adminSessions = new Map(); // token → { expiresAt }
const memberTokens  = new Map(); // token → { userId, expiresAt }

// ==========================================
// 🛠️ HELPERS
// ==========================================
function generateToken(len = 32) {
    return crypto.randomBytes(len).toString('hex');
}

/** الرتبة من الستريك — للـ identity في واجهة العضو */
function getRankFromStreak(streak) {
    const s = streak || 0;
    for (const r of Object.values(CONFIG.RANKS || {})) {
        if (s >= r.min && s <= r.max) return { name: r.name, emoji: r.emoji };
    }
    return { name: 'بداية الرحلة', emoji: '🌱' };
}

/** إرجاع خطأ موحد للـ Front-end (Toast Notifications) */
function sendError(res, statusCode, message) {
    return res.status(statusCode).json({ error: message || 'حدث خطأ غير متوقع' });
}

function requireAdmin(req, res, next) {
    const token = req.headers['x-admin-token'] || req.query.token;
    if (!token) return sendError(res, 401, 'غير مصرح');

    const session = adminSessions.get(token);
    if (!session || Date.now() > session.expiresAt) {
        adminSessions.delete(token);
        return sendError(res, 401, 'انتهت الجلسة');
    }
    next();
}

function requireMember(req, res, next) {
    const token = req.headers['x-member-token'] || req.query.token;
    if (!token) return sendError(res, 401, 'رابط غير صالح');

    const session = memberTokens.get(token);
    if (!session || Date.now() > session.expiresAt) {
        memberTokens.delete(token);
        return sendError(res, 401, 'انتهت صلاحية الرابط');
    }
    req.memberId = session.userId;
    next();
}

// ==========================================
// 🔐 ADMIN AUTH
// POST /api/admin/login
// ==========================================
app.post('/api/admin/login', (req, res) => {
    try {
        const { password } = req.body;
        if (password !== ADMIN_PASSWORD) {
            return sendError(res, 401, 'كلمة المرور غير صحيحة');
        }
        const token = generateToken();
        adminSessions.set(token, { expiresAt: Date.now() + 24 * 60 * 60 * 1000 });
        res.json({ token, expiresIn: '24h' });
    } catch (e) {
        sendError(res, 500, e.message || 'فشل تسجيل الدخول');
    }
});

// ==========================================
// 👑 ADMIN ENDPOINTS — غرفة العمليات (Command Center)
// ==========================================

// GET /api/admin/overview — إحصائيات عامة
app.get('/api/admin/overview', requireAdmin, (req, res) => {
    try {
        const db    = req.app.locals.db;
        const users = db.getAllUsers();
        const today = new Date().toISOString().split('T')[0];
        const dailyReports = db.getDailyReports(today);
        const doneIds = new Set(dailyReports.map(r => r.user_id));
        const totalStreak = users.reduce((s, u) => s + (u.days_streak || 0), 0);
        const avgStreak   = users.length ? Math.round(totalStreak / users.length) : 0;
        const withWarnings = users.filter(u => (u.warning_count || 0) > 0).length;
        const leaderboard = db.getLeaderboard(100);
        const avgRate = leaderboard.length
            ? Math.round(leaderboard.reduce((s, u) => s + (u.avg_rate || 0), 0) / leaderboard.length)
            : 0;

        res.json({
            totalUsers:    users.length,
            reportedToday: dailyReports.length,
            missingToday:  users.length - dailyReports.length,
            avgStreak,
            avgRate,
            withWarnings,
            date: today
        });
    } catch (e) {
        sendError(res, 500, e.message || 'فشل جلب النظرة العامة');
    }
});

// GET /api/admin/members — قائمة الأعضاء (مع flag للإنذار الثالث)
app.get('/api/admin/members', requireAdmin, (req, res) => {
    try {
        const db    = req.app.locals.db;
        const users = db.getAllUsers();
        const today = new Date().toISOString().split('T')[0];
        const reports = db.getDailyReports(today);
        const doneIds = new Set(reports.map(r => r.user_id));
        const leaderboard = db.getLeaderboard(200);
        const rateMap = new Map(leaderboard.map(l => [l.user_id, Math.round(l.avg_rate || 0)]));

        const members = users.map(u => ({
            userId:         u.user_id,
            name:           u.name,
            gender:         u.gender,
            goal:           u.goal || u.bio,
            streak:         u.days_streak || 0,
            totalDone:      u.total_done || 0,
            warningCount:   u.warning_count || 0,
            reviewCount:    u.daily_review_count || 0,
            reportedToday:  doneIds.has(u.user_id),
            weeklyRate:     rateMap.get(u.user_id) || 0,
            achievedToday:  !!u.achieved_today,
            flag:           (u.warning_count || 0) >= 3  // يومض بالأحمر في الواجهة
        }));

        res.json(members);
    } catch (e) {
        sendError(res, 500, e.message || 'فشل جلب قائمة الأعضاء');
    }
});

// GET /api/admin/member/:userId — تفاصيل عضو واحد
app.get('/api/admin/member/:userId', requireAdmin, (req, res) => {
    try {
        const db   = req.app.locals.db;
        const user = db.getUser(req.params.userId);
        if (!user) return sendError(res, 404, 'المستخدم غير موجود');

        const analytics   = db.getUserAnalytics(req.params.userId);
        const warningsLog = db.getWarningsLog(req.params.userId);
        const journal     = db.getJournalEntries(req.params.userId, 5);

        res.json({ user, analytics, warningsLog, journal });
    } catch (e) {
        sendError(res, 500, e.message || 'فشل جلب تفاصيل العضو');
    }
});

// GET /api/admin/daily-report — تقرير اليوم (من عمل / من لم يعمل)
app.get('/api/admin/daily-report', requireAdmin, (req, res) => {
    try {
        const db     = req.app.locals.db;
        const date   = req.query.date || new Date().toISOString().split('T')[0];
        const users  = db.getAllUsers();
        const reports = db.getDailyReports(date);
        const doneIds = new Set(reports.map(r => r.user_id));

        res.json({
            date,
            done:    users.filter(u =>  doneIds.has(u.user_id)).map(u => ({ userId: u.user_id, name: u.name })),
            missing: users.filter(u => !doneIds.has(u.user_id)).map(u => ({ userId: u.user_id, name: u.name })),
            total:   users.length
        });
    } catch (e) {
        sendError(res, 500, e.message || 'فشل جلب تقرير اليوم');
    }
});

// GET /api/admin/leaderboard
app.get('/api/admin/leaderboard', requireAdmin, (req, res) => {
    try {
        const db = req.app.locals.db;
        res.json(db.getLeaderboard(20));
    } catch (e) {
        sendError(res, 500, e.message || 'فشل جلب الليدربورد');
    }
});

// GET /api/admin/warnings — أعضاء لديهم إنذارات
app.get('/api/admin/warnings', requireAdmin, (req, res) => {
    try {
        const db    = req.app.locals.db;
        const users = db.getAllUsers().filter(u => (u.warning_count || 0) > 0);
        res.json(users.map(u => ({
            userId:       u.user_id,
            name:         u.name,
            warningCount: u.warning_count,
            reviewCount:  u.daily_review_count,
            flag:         (u.warning_count || 0) >= 3
        })));
    } catch (e) {
        sendError(res, 500, e.message || 'فشل جلب قائمة الإنذارات');
    }
});

// POST /api/admin/generate-member-link — توليد رابط للعضو
app.post('/api/admin/generate-member-link', requireAdmin, (req, res) => {
    try {
        const { userId } = req.body;
        if (!userId) return sendError(res, 400, 'userId مطلوب');

        const db   = req.app.locals.db;
        const user = db.getUser(userId);
        if (!user) return sendError(res, 404, 'المستخدم غير موجود');

        const token = generateToken();
        memberTokens.set(token, {
            userId,
            expiresAt: Date.now() + 24 * 60 * 60 * 1000
        });
        const baseUrl = process.env.WEB_BASE_URL || `http://localhost:${PORT}`;
        res.json({
            token,
            url:       `${baseUrl}/member.html?token=${token}`,
            expiresIn: '24h'
        });
    } catch (e) {
        sendError(res, 500, e.message || 'فشل توليد الرابط');
    }
});

// POST /api/admin/warning/add — إعطاء إنذار لعضو
app.post('/api/admin/warning/add', requireAdmin, (req, res) => {
    try {
        const { userId, reason } = req.body;
        if (!userId) return sendError(res, 400, 'userId مطلوب');
        const db = req.app.locals.db;
        if (!db.getUser(userId)) return sendError(res, 404, 'المستخدم غير موجود');
        const count = db.addWarning(userId, reason || 'مخالفة الشروط', 'admin-web');
        res.json({ success: true, warningCount: count });
    } catch (e) {
        sendError(res, 500, e.message || 'فشل إضافة الإنذار');
    }
});

// POST /api/admin/warning/remove — رفع إنذار من عضو
app.post('/api/admin/warning/remove', requireAdmin, (req, res) => {
    try {
        const { userId } = req.body;
        if (!userId) return sendError(res, 400, 'userId مطلوب');
        const db = req.app.locals.db;
        if (!db.getUser(userId)) return sendError(res, 404, 'المستخدم غير موجود');
        db.removeWarning(userId);
        const user = db.getUser(userId);
        res.json({ success: true, warningCount: user?.warning_count || 0 });
    } catch (e) {
        sendError(res, 500, e.message || 'فشل رفع الإنذار');
    }
});

// ==========================================
// 👤 MEMBER ENDPOINTS — Bento Grid & HUD
// ==========================================

// GET /api/member/me — بيانات العضو مصممة للـ Bento/HUD
app.get('/api/member/me', requireMember, (req, res) => {
    try {
        const db   = req.app.locals.db;
        const user = db.getUser(req.memberId);
        if (!user) return sendError(res, 404, 'لم يتم العثور على بياناتك');

        const habits        = db.getHabits(req.memberId);
        const streak        = user.days_streak || 0;
        const rank          = getRankFromStreak(streak);
        const goalsTree     = db.getMemberGoalsTree(req.memberId);
        const challenges    = db.getMemberChallengesProgress(req.memberId);
        const chartData     = db.getWeeklyChartData(req.memberId);
        const achievements  = db.getUserAchievements(req.memberId);
        const journal       = db.getJournalEntries(req.memberId, 3);
        const recent_reports = db.getMemberDailyReports(req.memberId).slice(0, 3);

        const total     = habits.length;
        const completed = habits.filter(h => h.completed).length;
        const rate      = total > 0 ? Math.round((completed / total) * 100) : 0;

        // كائن مصمم لواجهات Bento Grid والـ HUD
        const payload = {
            identity: {
                name:                user.name,
                goal:                user.goal || user.bio,
                gender:              user.gender,
                created_at:          user.created_at,
                rank:                rank.name,
                rank_emoji:          rank.emoji,
                streak:              streak,
                streak_freeze:       user.streak_freeze ?? 1,
                warning_count:       user.warning_count || 0,
                daily_review_count:  user.daily_review_count ?? 0,
                total_done:          user.total_done || 0,
                last_active:         user.last_active
            },
            habits_today: habits.map(h => ({
                id: h.id,
                name: h.name,
                completed: !!h.completed
            })),
            goals_tree: goalsTree,
            challenges_progress: challenges,
            weekly_chart_data: chartData,
            today_rate: rate,
            journal,
            recent_reports,
            achievements: achievements.map(a => ({
                type:    a.achievement_type,
                earnedAt: a.earned_at
            }))
        };

        res.json(payload);
    } catch (e) {
        sendError(res, 500, e.message || 'فشل جلب بيانات العضو');
    }
});

// GET /api/member/leaderboard — الليدربورد (readonly)
app.get('/api/member/leaderboard', requireMember, (req, res) => {
    try {
        const db = req.app.locals.db;
        const leaders = db.getLeaderboard(20);
        res.json(leaders.map((l, i) => ({
            rank:    i + 1,
            name:    l.name,
            streak:  l.days_streak || 0,
            avgRate: Math.round(l.avg_rate || 0),
            isMe:    l.user_id === req.memberId
        })));
    } catch (e) {
        sendError(res, 500, e.message || 'فشل جلب الليدربورد');
    }
});

// ==========================================
// 🏥 HEALTH CHECK
// ==========================================
app.get('/api/health', (req, res) => {
    try {
        const db   = req.app.locals.db;
        const users = db ? db.getAllUsers().length : 0;
        res.json({ status: 'ok', users, uptime: Math.floor(process.uptime()) });
    } catch (e) {
        sendError(res, 500, e.message);
    }
});

// ==========================================
// 📄 CATCH-ALL — serve index.html
// ==========================================
app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// ==========================================
// 🚀 START SERVER
// ==========================================
function startWebServer(db) {
    app.locals.db = db;
    app.listen(PORT, () => {
        const base = process.env.WEB_BASE_URL || `http://localhost:${PORT}`;
        console.log(`🌐 Web Dashboard: ${base}`);
        console.log(`   Admin: ${base}/admin.html`);
        console.log(`   Port: ${PORT}`);
    });
}

module.exports = { startWebServer };

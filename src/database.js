// ==========================================
// 🗄️ MUHAWALAT DATABASE
// Version: 7.2.0 - Bug Fixes + Daily Reports
// ==========================================

const fs = require('fs');
const initSqlJs = require('sql.js');

class MuhawalatDatabase {
    constructor(dbPath = process.env.DB_PATH || 'muhawalat.db') {
        this.dbPath = dbPath;
        this.db = null;
        this.SQL = null;
        this._saveTimer = null;
    }

    async init() {
        this.SQL = await initSqlJs();
        try {
            if (fs.existsSync(this.dbPath)) {
                const buffer = fs.readFileSync(this.dbPath);
                this.db = new this.SQL.Database(buffer);
                console.log('✅ Database loaded from file');
            } else {
                this.db = new this.SQL.Database();
                console.log('✅ New database created');
            }
        } catch (e) {
            console.error('⚠️ Database init error:', e.message);
            this.db = new this.SQL.Database();
        }
        this.initTables();
        this.runMigrations();
        this.saveImmediate();
    }

    // ==========================================
    // 💾 SAVE - debounced atomic write
    // ==========================================
    save() {
        if (this.dbPath === ':memory:') return;
        if (this._saveTimer) clearTimeout(this._saveTimer);
        this._saveTimer = setTimeout(() => this._writeToDisk(), 500);
    }

    saveImmediate() {
        if (this.dbPath === ':memory:') return;
        if (this._saveTimer) { clearTimeout(this._saveTimer); this._saveTimer = null; }
        this._writeToDisk();
    }

    _writeToDisk() {
        try {
            const data = this.db.export();
            const tmpPath = this.dbPath + '.tmp';
            fs.writeFileSync(tmpPath, Buffer.from(data));
            fs.renameSync(tmpPath, this.dbPath);
        } catch (e) {
            console.error('❌ DB Save Error:', e.message);
        }
    }

    safeBackup(label = 'manual') {
        try {
            if (this.dbPath === ':memory:') return null;
            const fs = require('fs');
            const path = require('path');
            const backupDir = path.join(path.dirname(this.dbPath), 'backups');
            if (!fs.existsSync(backupDir)) fs.mkdirSync(backupDir, { recursive: true });
            const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
            const backupName = `muhawalat.${label}.${timestamp}.db`;
            const dest = path.join(backupDir, backupName);
            this.saveImmediate();
            fs.copyFileSync(this.dbPath, dest);
            // Keep only last 20 backups
            const all = fs.readdirSync(backupDir)
                .filter(f => f.startsWith('muhawalat.') && f.endsWith('.db'))
                .sort().reverse();
            if (all.length > 20) {
                all.slice(20).forEach(old => fs.unlinkSync(path.join(backupDir, old)));
            }
            console.log(`✅ Safe backup created: ${backupName}`);
            return backupName;
        } catch (e) {
            console.error('❌ safeBackup failed:', e.message);
            return null;
        }
    }

    // ==========================================
    // 📋 TABLES
    // ==========================================
    initTables() {
        this.db.run(`CREATE TABLE IF NOT EXISTS config (
            guild_id TEXT PRIMARY KEY,
            forum_id TEXT,
            achieve_id TEXT
        )`);

        this.db.run(`CREATE TABLE IF NOT EXISTS global_settings (
            key   TEXT PRIMARY KEY,
            value TEXT
        )`);

        this.db.run(`CREATE TABLE IF NOT EXISTS users (
            user_id TEXT PRIMARY KEY,
            name TEXT,
            bio TEXT,
            goal TEXT,
            gender TEXT DEFAULT 'male',
            thread_id TEXT,
            daily_msg TEXT,
            warning_count INTEGER DEFAULT 0,
            last_warning_date TEXT,
            daily_review_count INTEGER DEFAULT 0,
            streak_freeze INTEGER DEFAULT 1,
            freeze_habits INTEGER DEFAULT 2,
            freeze_reports INTEGER DEFAULT 2,
            total_done INTEGER DEFAULT 0,
            days_streak INTEGER DEFAULT 0,
            achieved_today INTEGER DEFAULT 0,
            last_active TEXT DEFAULT NULL,
            status TEXT DEFAULT 'active',
            created_at TEXT DEFAULT CURRENT_TIMESTAMP
        )`);

        this.db.run(`CREATE TABLE IF NOT EXISTS habits (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id TEXT,
            name TEXT,
            completed INTEGER DEFAULT 0,
            position INTEGER DEFAULT 0,
            created_at TEXT DEFAULT CURRENT_TIMESTAMP
        )`);

        this.db.run(`CREATE TABLE IF NOT EXISTS stats (
            user_id TEXT PRIMARY KEY,
            total_done INTEGER DEFAULT 0,
            days_streak INTEGER DEFAULT 0,
            achieved_today INTEGER DEFAULT 0,
            last_active TEXT DEFAULT CURRENT_TIMESTAMP
        )`);

        this.db.run(`CREATE TABLE IF NOT EXISTS daily_history (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id TEXT,
            date TEXT,
            total INTEGER DEFAULT 0,
            completed INTEGER DEFAULT 0,
            rate REAL DEFAULT 0,
            UNIQUE(user_id, date)
        )`);

        this.db.run(`CREATE TABLE IF NOT EXISTS journal_logs (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id TEXT,
            type TEXT,
            content TEXT,
            date TEXT DEFAULT CURRENT_TIMESTAMP,
            sentiment TEXT DEFAULT 'neutral'
        )`);

        this.db.run(`CREATE TABLE IF NOT EXISTS achievements (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id TEXT,
            achievement_type TEXT,
            earned_at TEXT DEFAULT CURRENT_TIMESTAMP,
            UNIQUE(user_id, achievement_type)
        )`);

        this.db.run(`CREATE TABLE IF NOT EXISTS weekly_goals (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id TEXT,
            goal_text TEXT,
            week_start TEXT,
            completed INTEGER DEFAULT 0
        )`);

        this.db.run(`CREATE TABLE IF NOT EXISTS scheduled_messages (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            title TEXT DEFAULT '',
            content TEXT NOT NULL,
            media_url TEXT,
            channel_id TEXT NOT NULL,
            cron_expr TEXT NOT NULL,
            repeat_type TEXT DEFAULT 'once',
            is_active INTEGER DEFAULT 1,
            notify_before INTEGER DEFAULT 1,
            last_sent TEXT,
            created_by TEXT,
            created_at TEXT DEFAULT CURRENT_TIMESTAMP
        )`);

        this.db.run(`CREATE TABLE IF NOT EXISTS auto_responses (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            trigger_text TEXT NOT NULL,
            response_text TEXT NOT NULL,
            channel_scope TEXT DEFAULT 'all',
            match_type TEXT DEFAULT 'contains',
            is_active INTEGER DEFAULT 1,
            created_at TEXT DEFAULT CURRENT_TIMESTAMP
        )`);

        this.db.run(`CREATE TABLE IF NOT EXISTS warnings_log (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id TEXT NOT NULL,
            reason TEXT,
            issued_by TEXT,
            issued_at TEXT DEFAULT CURRENT_TIMESTAMP
        )`);

        this.db.run(`CREATE TABLE IF NOT EXISTS reports (
            id          INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id     TEXT NOT NULL,
            type        TEXT NOT NULL,
            report_date TEXT NOT NULL,
            thread_id   TEXT,
            channel_id  TEXT,
            content     TEXT,
            word_count  INTEGER,
            recorded_at TEXT DEFAULT CURRENT_TIMESTAMP,
            UNIQUE(user_id, type, report_date)
        )`);

        // ✅ جدول التقارير اليومية
        // يسجل محتوى التقرير اليومي وعدد كلماته
        this.db.run(`CREATE TABLE IF NOT EXISTS daily_reports (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id TEXT NOT NULL,
            report_date TEXT NOT NULL,
            thread_id TEXT,
            content TEXT,
            word_count INTEGER,
            recorded_at TEXT DEFAULT CURRENT_TIMESTAMP,
            UNIQUE(user_id, report_date)
        )`);

        // ✅ جدول الـ Timeout المعلق — يُستخدم لنظام الإنذارات الثالث
        this.db.run(`CREATE TABLE IF NOT EXISTS timeout_pending (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id TEXT UNIQUE NOT NULL,
            reason TEXT,
            warning_count INTEGER DEFAULT 0,
            status TEXT DEFAULT 'pending',
            notified_at TEXT DEFAULT CURRENT_TIMESTAMP,
            last_reminder_at TEXT
        )`);

        this.db.run(`CREATE TABLE IF NOT EXISTS goals (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id TEXT NOT NULL,
            goal_text TEXT NOT NULL,
            goal_type TEXT NOT NULL,
            period TEXT NOT NULL,
            is_active INTEGER DEFAULT 1,
            created_at TEXT DEFAULT CURRENT_TIMESTAMP
        )`);
        this.db.run(`CREATE TABLE IF NOT EXISTS weekly_reports (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id TEXT NOT NULL,
            report_date TEXT NOT NULL,
            channel_id TEXT,
            content TEXT,
            word_count INTEGER,
            recorded_at TEXT DEFAULT CURRENT_TIMESTAMP,
            UNIQUE(user_id, report_date)
        )`);
        this.db.run(`CREATE TABLE IF NOT EXISTS monthly_reports (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id TEXT NOT NULL,
            report_date TEXT NOT NULL,
            channel_id TEXT,
            content TEXT,
            word_count INTEGER,
            recorded_at TEXT DEFAULT CURRENT_TIMESTAMP,
            UNIQUE(user_id, report_date)
        )`);
        this.db.run(`CREATE TABLE IF NOT EXISTS yearly_reports (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id TEXT NOT NULL,
            report_date TEXT NOT NULL,
            channel_id TEXT,
            content TEXT,
            word_count INTEGER,
            recorded_at TEXT DEFAULT CURRENT_TIMESTAMP,
            UNIQUE(user_id, report_date)
        )`);
        this.db.run(`CREATE TABLE IF NOT EXISTS challenges (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            title TEXT NOT NULL,
            description TEXT,
            image_url TEXT,
            keyword TEXT NOT NULL,
            forum_thread_id TEXT,
            start_date TEXT,
            end_date TEXT,
            created_by TEXT,
            is_active INTEGER DEFAULT 1,
            created_at TEXT DEFAULT CURRENT_TIMESTAMP
        )`);
        this.db.run(`CREATE TABLE IF NOT EXISTS challenge_participants (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            challenge_id INTEGER NOT NULL,
            user_id TEXT NOT NULL,
            joined_at TEXT DEFAULT CURRENT_TIMESTAMP,
            UNIQUE(challenge_id, user_id),
            FOREIGN KEY (challenge_id) REFERENCES challenges(id)
        )`);
        this.db.run(`CREATE TABLE IF NOT EXISTS challenge_daily_logs (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            challenge_id INTEGER NOT NULL,
            user_id TEXT NOT NULL,
            log_date TEXT NOT NULL,
            UNIQUE(challenge_id, user_id, log_date),
            FOREIGN KEY (challenge_id) REFERENCES challenges(id)
        )`);

        // ─── جدول المهام الأسبوعية والشهرية ──────────────────────
        this.db.run(`CREATE TABLE IF NOT EXISTS tasks (
            id          INTEGER PRIMARY KEY AUTOINCREMENT,
            guild_id    TEXT NOT NULL,
            type        TEXT NOT NULL,
            title       TEXT NOT NULL,
            description TEXT,
            thread_id   TEXT NOT NULL,
            period      TEXT NOT NULL,
            grace_hours INTEGER NOT NULL,
            lock_at     TEXT NOT NULL,
            is_locked   INTEGER DEFAULT 0,
            created_at  TEXT DEFAULT (datetime('now')),
            created_by  TEXT NOT NULL
        )`);

        // ─── جدول إتمام المهام ────────────────────────────────────
        this.db.run(`CREATE TABLE IF NOT EXISTS task_completions (
            id           INTEGER PRIMARY KEY AUTOINCREMENT,
            task_id      INTEGER NOT NULL,
            user_id      TEXT NOT NULL,
            message_id   TEXT,
            content      TEXT,
            completed_at TEXT DEFAULT (datetime('now')),
            UNIQUE(task_id, user_id)
        )`);

        // ─── جدول بوستات التقرير اليومي ──────────────────────────
        this.db.run(`CREATE TABLE IF NOT EXISTS daily_posts (
            id         INTEGER PRIMARY KEY AUTOINCREMENT,
            post_date  TEXT NOT NULL UNIQUE,
            thread_id  TEXT NOT NULL,
            created_at TEXT DEFAULT (datetime('now'))
        )`);

        // ─── جدول التدوين (أفكار المستخدم) ───────────────────────
        this.db.run(`CREATE TABLE IF NOT EXISTS journals (
            id         INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id    TEXT NOT NULL,
            content    TEXT NOT NULL,
            created_at TEXT DEFAULT (datetime('now'))
        )`);

        // ─── جدول الشهر المخصص (Custom Month) ───────────────────
        this.db.run(`CREATE TABLE IF NOT EXISTS custom_months (
            id            INTEGER PRIMARY KEY AUTOINCREMENT,
            start_date    TEXT NOT NULL,
            duration_days INTEGER NOT NULL DEFAULT 30,
            is_active     INTEGER DEFAULT 1
        )`);
    }

    // ==========================================
    // 🔄 MIGRATIONS - ترقية آمنة بدون مسح بيانات
    // ==========================================
    runMigrations() {
        const cols = [
            `ALTER TABLE users ADD COLUMN warning_count INTEGER DEFAULT 0`,
            `ALTER TABLE users ADD COLUMN last_warning_date TEXT`,
            `ALTER TABLE users ADD COLUMN daily_review_count INTEGER DEFAULT 0`,
            `ALTER TABLE users ADD COLUMN goal TEXT`,
            `ALTER TABLE users ADD COLUMN streak_freeze INTEGER DEFAULT 1`,
            `ALTER TABLE users ADD COLUMN freeze_habits INTEGER DEFAULT 2`,
            `ALTER TABLE users ADD COLUMN freeze_reports INTEGER DEFAULT 2`,
            `ALTER TABLE daily_reports ADD COLUMN content TEXT`,
            `ALTER TABLE daily_reports ADD COLUMN word_count INTEGER`,
            `ALTER TABLE users ADD COLUMN goals_migrated INTEGER DEFAULT 0`,
            `ALTER TABLE users ADD COLUMN status TEXT DEFAULT 'active'`,
            // Phase 3 migrations
            `ALTER TABLE users ADD COLUMN total_done INTEGER DEFAULT 0`,
            `ALTER TABLE users ADD COLUMN days_streak INTEGER DEFAULT 0`,
            `ALTER TABLE users ADD COLUMN achieved_today INTEGER DEFAULT 0`,
            `ALTER TABLE users ADD COLUMN last_active TEXT DEFAULT NULL`,
            `ALTER TABLE journals ADD COLUMN type TEXT DEFAULT 'general'`,
            `ALTER TABLE journals ADD COLUMN sentiment TEXT DEFAULT 'neutral'`,
            `ALTER TABLE custom_months ADD COLUMN guild_id TEXT`,
            `ALTER TABLE config ADD COLUMN daily_reports_forum_id TEXT`,
            `ALTER TABLE config ADD COLUMN weekly_tasks_forum_id TEXT`,
            `ALTER TABLE config ADD COLUMN monthly_tasks_forum_id TEXT`,
            `ALTER TABLE config ADD COLUMN challenges_forum_id TEXT`,
            `ALTER TABLE config ADD COLUMN leaderboard_channel_id TEXT`,
            `ALTER TABLE config ADD COLUMN notify_corner_id TEXT`,
            `ALTER TABLE config ADD COLUMN admin_channel_id TEXT`,
            `ALTER TABLE config ADD COLUMN general_channel_id TEXT`,
            `ALTER TABLE config ADD COLUMN member_role_id TEXT`,
            `ALTER TABLE config ADD COLUMN admin_role_id TEXT`,
        ];
        for (const sql of cols) {
            try { this.db.run(sql); } catch (e) {
                if (!e.message.includes('duplicate column')) console.warn('⚠️ Migration:', e.message);
            }
        }


        // إنشاء جدول daily_reports لو مش موجود (للقواعد القديمة)
        try {
            this.db.run(`CREATE TABLE IF NOT EXISTS daily_reports (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id TEXT NOT NULL,
                report_date TEXT NOT NULL,
                thread_id TEXT,
                content TEXT,
                word_count INTEGER,
                recorded_at TEXT DEFAULT CURRENT_TIMESTAMP,
                UNIQUE(user_id, report_date)
            )`);
        } catch (e) { /* already exists */ }

        // إنشاء جدول timeout_pending لو مكنش موجود في قواعد قديمة
        try {
            this.db.run(`CREATE TABLE IF NOT EXISTS timeout_pending (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id TEXT UNIQUE NOT NULL,
                reason TEXT,
                warning_count INTEGER DEFAULT 0,
                status TEXT DEFAULT 'pending',
                notified_at TEXT DEFAULT CURRENT_TIMESTAMP,
                last_reminder_at TEXT
            )`);
        } catch (e) { /* already exists */ }

        try {
            this.db.run(`CREATE TABLE IF NOT EXISTS journals (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id TEXT NOT NULL, content TEXT NOT NULL, created_at TEXT DEFAULT (datetime('now')))`);
            this.db.run(`CREATE TABLE IF NOT EXISTS custom_months (id INTEGER PRIMARY KEY AUTOINCREMENT, start_date TEXT NOT NULL, duration_days INTEGER NOT NULL DEFAULT 30, is_active INTEGER DEFAULT 1)`);
        } catch (e) { if (!e.message.includes('already exists')) console.warn('⚠️ Migration journals/custom_months:', e.message); }

        // Fix: Add performance indexes for frequently queried columns
        try {
            this.db.run(`CREATE INDEX IF NOT EXISTS idx_daily_reports_date_user ON daily_reports(report_date, user_id);`);
            this.db.run(`CREATE INDEX IF NOT EXISTS idx_task_completions_task_user ON task_completions(task_id, user_id);`);
            console.log('✅ Database performance indexes created/verified');
        } catch (e) {
            console.warn('⚠️ Index creation warning:', e.message);
        }

        try {
            this.db.run(`CREATE TABLE IF NOT EXISTS freezes_log (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id   TEXT NOT NULL,
                date      TEXT NOT NULL,
                type      TEXT NOT NULL, -- 'habits' | 'reports'
                is_manual INTEGER DEFAULT 0,
                UNIQUE(user_id, date, type)
            )`);
        } catch (e) { if (!e.message.includes('already exists')) console.warn('⚠️ Migration freezes_log:', e.message); }

        [ 'goals', 'weekly_reports', 'monthly_reports', 'yearly_reports', 'challenges', 'challenge_participants', 'challenge_daily_logs', 'tasks', 'task_completions', 'daily_posts' ].forEach(t => {
            try {
                const defs = {
                    goals: `CREATE TABLE IF NOT EXISTS goals (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id TEXT NOT NULL, goal_text TEXT NOT NULL, goal_type TEXT NOT NULL, period TEXT NOT NULL, is_active INTEGER DEFAULT 1, created_at TEXT DEFAULT CURRENT_TIMESTAMP)`,
                    weekly_reports: `CREATE TABLE IF NOT EXISTS weekly_reports (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id TEXT NOT NULL, report_date TEXT NOT NULL, channel_id TEXT, content TEXT, word_count INTEGER, recorded_at TEXT DEFAULT CURRENT_TIMESTAMP, UNIQUE(user_id, report_date))`,
                    monthly_reports: `CREATE TABLE IF NOT EXISTS monthly_reports (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id TEXT NOT NULL, report_date TEXT NOT NULL, channel_id TEXT, content TEXT, word_count INTEGER, recorded_at TEXT DEFAULT CURRENT_TIMESTAMP, UNIQUE(user_id, report_date))`,
                    yearly_reports: `CREATE TABLE IF NOT EXISTS yearly_reports (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id TEXT NOT NULL, report_date TEXT NOT NULL, channel_id TEXT, content TEXT, word_count INTEGER, recorded_at TEXT DEFAULT CURRENT_TIMESTAMP, UNIQUE(user_id, report_date))`,
                    challenges: `CREATE TABLE IF NOT EXISTS challenges (id INTEGER PRIMARY KEY AUTOINCREMENT, title TEXT NOT NULL, description TEXT, image_url TEXT, keyword TEXT NOT NULL, forum_thread_id TEXT, start_date TEXT, end_date TEXT, created_by TEXT, is_active INTEGER DEFAULT 1, created_at TEXT DEFAULT CURRENT_TIMESTAMP)`,
                    challenge_participants: `CREATE TABLE IF NOT EXISTS challenge_participants (id INTEGER PRIMARY KEY AUTOINCREMENT, challenge_id INTEGER NOT NULL, user_id TEXT NOT NULL, joined_at TEXT DEFAULT CURRENT_TIMESTAMP, UNIQUE(challenge_id, user_id), FOREIGN KEY (challenge_id) REFERENCES challenges(id))`,
                    challenge_daily_logs: `CREATE TABLE IF NOT EXISTS challenge_daily_logs (id INTEGER PRIMARY KEY AUTOINCREMENT, challenge_id INTEGER NOT NULL, user_id TEXT NOT NULL, log_date TEXT NOT NULL, minutes INTEGER DEFAULT 0, points INTEGER DEFAULT 0, UNIQUE(challenge_id, user_id, log_date), FOREIGN KEY (challenge_id) REFERENCES challenges(id))`,
                    tasks: `CREATE TABLE IF NOT EXISTS tasks (id INTEGER PRIMARY KEY AUTOINCREMENT, guild_id TEXT NOT NULL, type TEXT NOT NULL, title TEXT NOT NULL, description TEXT, thread_id TEXT NOT NULL, period TEXT NOT NULL, grace_hours INTEGER NOT NULL, lock_at TEXT NOT NULL, is_locked INTEGER DEFAULT 0, created_at TEXT DEFAULT (datetime('now')), created_by TEXT NOT NULL)`,
                    task_completions: `CREATE TABLE IF NOT EXISTS task_completions (id INTEGER PRIMARY KEY AUTOINCREMENT, task_id INTEGER NOT NULL, user_id TEXT NOT NULL, message_id TEXT, content TEXT, completed_at TEXT DEFAULT (datetime('now')))`,
                    daily_posts: `CREATE TABLE IF NOT EXISTS daily_posts (id INTEGER PRIMARY KEY AUTOINCREMENT, post_date TEXT NOT NULL UNIQUE, thread_id TEXT NOT NULL, created_at TEXT DEFAULT (datetime('now')))`
                };
                if (defs[t]) this.db.run(defs[t]);
            } catch (e) { if (!e.message.includes('already exists')) console.warn('⚠️ Migration table ' + t, e.message); }
        });

        // أعمدة التحديات الجديدة
        try {
            const challengeCols = this.db.prepare('PRAGMA table_info(challenges)');
            const colNames = [];
            while (challengeCols.step()) colNames.push(challengeCols.getAsObject().name);
            challengeCols.free();
            if (colNames.indexOf('min_minutes') === -1)       this.db.run('ALTER TABLE challenges ADD COLUMN min_minutes       INTEGER DEFAULT 0');
            if (colNames.indexOf('max_minutes') === -1)       this.db.run('ALTER TABLE challenges ADD COLUMN max_minutes       INTEGER DEFAULT 999');
            if (colNames.indexOf('bonus_minutes') === -1)     this.db.run('ALTER TABLE challenges ADD COLUMN bonus_minutes     INTEGER DEFAULT 0');
            if (colNames.indexOf('challenge_time') === -1)    this.db.run('ALTER TABLE challenges ADD COLUMN challenge_time    INTEGER DEFAULT 0');
            if (colNames.indexOf('chart_message_id') === -1)  this.db.run('ALTER TABLE challenges ADD COLUMN chart_message_id TEXT');
        } catch (e) { if (!e.message.includes('duplicate column')) console.warn('⚠️ Migration challenges cols:', e.message); }

        try {
            const logCols = this.db.prepare('PRAGMA table_info(challenge_daily_logs)');
            const logColNames = [];
            while (logCols.step()) logColNames.push(logCols.getAsObject().name);
            logCols.free();
            if (logColNames.indexOf('minutes') === -1) this.db.run('ALTER TABLE challenge_daily_logs ADD COLUMN minutes INTEGER DEFAULT 0');
            if (logColNames.indexOf('points') === -1)  this.db.run('ALTER TABLE challenge_daily_logs ADD COLUMN points  REAL DEFAULT 0');
        } catch (e) { if (!e.message.includes('duplicate column')) console.warn('⚠️ Migration challenge_daily_logs:', e.message); }

        try {
            const taskCols = this.db.prepare('PRAGMA table_info(tasks)');
            const taskNames = [];
            while (taskCols.step()) taskNames.push(taskCols.getAsObject().name);
            taskCols.free();
            if (taskNames.indexOf('task_order') === -1) this.db.run('ALTER TABLE tasks ADD COLUMN task_order INTEGER');
        } catch (e) { if (!e.message.includes('duplicate column')) console.warn('⚠️ Migration tasks task_order:', e.message); }

        try {
            const arCols = this.db.prepare('PRAGMA table_info(auto_responses)');
            const arNames = [];
            while (arCols.step()) arNames.push(arCols.getAsObject().name);
            arCols.free();
            if (arNames.indexOf('as_embed') === -1)    this.db.run('ALTER TABLE auto_responses ADD COLUMN as_embed    INTEGER DEFAULT 0');
            if (arNames.indexOf('embed_title') === -1) this.db.run('ALTER TABLE auto_responses ADD COLUMN embed_title TEXT');
            if (arNames.indexOf('embed_color') === -1) this.db.run('ALTER TABLE auto_responses ADD COLUMN embed_color TEXT');
        } catch (e) { if (!e.message.includes('duplicate column')) console.warn('⚠️ Migration auto_responses:', e.message); }
    }

    // ==========================================
    // CONFIG
    // ==========================================
    setConfig(guildId, forumId, achieveId) {
        this.db.run(`
            INSERT INTO config (guild_id, forum_id, achieve_id)
            VALUES (?, ?, ?)
            ON CONFLICT(guild_id) DO UPDATE SET
                forum_id  = excluded.forum_id,
                achieve_id = excluded.achieve_id
        `, [guildId, forumId, achieveId]);
        this.save();
    }

    getConfig(guildId) {
        const s = this.db.prepare('SELECT * FROM config WHERE guild_id = ?');
        s.bind([guildId]);
        const r = s.step() ? s.getAsObject() : null;
        s.free(); return r;
    }

    // ==========================================
    // GLOBAL SETTINGS (auto warnings, etc.)
    // ==========================================
    getAutoWarningsStatus() {
        try {
            const s = this.db.prepare(`SELECT value FROM global_settings WHERE key = 'auto_warnings_enabled'`);
            const has = s.step();
            const row = has ? s.getAsObject() : null;
            s.free();
            if (!row || row.value == null) return true;
            const v = String(row.value).toLowerCase();
            return v === '1' || v === 'true' || v === 'yes';
        } catch (e) {
            console.error('❌ getAutoWarningsStatus:', e.message);
            return true;
        }
    }

    toggleAutoWarnings() {
        try {
            const current = this.getAutoWarningsStatus();
            const next = !current;
            const value = next ? '1' : '0';
            this.db.run(
                `INSERT INTO global_settings (key, value)
                 VALUES ('auto_warnings_enabled', ?)
                 ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
                [value]
            );
            this.save();
            return next;
        } catch (e) {
            console.error('❌ toggleAutoWarnings:', e.message);
            return this.getAutoWarningsStatus();
        }
    }

    // ==========================================
    // USERS
    // ==========================================
    createUser(userId, name, bio, gender, threadId, goal = null) {
        try {
            this.db.run(`
                INSERT INTO users (user_id, name, bio, goal, gender, thread_id)
                VALUES (?, ?, ?, ?, ?, ?)
                ON CONFLICT(user_id) DO UPDATE SET
                    name=excluded.name, bio=excluded.bio,
                    goal=excluded.goal, gender=excluded.gender, thread_id=excluded.thread_id
            `, [userId, name, bio, goal || bio, gender, threadId]);
            // Stats are now part of users table, no separate INSERT needed
            this.save();
        } catch (e) { console.error('❌ createUser:', e.message); }
    }

    getUser(userId) {
        const s = this.db.prepare(`
            SELECT user_id, name, bio, goal, gender, thread_id, daily_msg,
                   warning_count, last_warning_date, daily_review_count, streak_freeze,
                   freeze_habits, freeze_reports, created_at, status,
                   total_done, days_streak, achieved_today, last_active
            FROM users
            WHERE user_id = ?
        `);
        s.bind([userId]);
        const r = s.step() ? s.getAsObject() : null;
        s.free(); return r;
        // Note: Archived users ARE returned by getUser (so restore flow works)
    }

    // Helper to get only active users (excludes archived)
    getActiveUser(userId) {
        const user = this.getUser(userId);
        return user?.status === 'active' ? user : null;
    }

    // ✅ جيب يوزر عن طريق thread_id (لإصلاح btn_refresh وتحقق صاحب المساحة)
    getUserByThread(threadId) {
        const s = this.db.prepare(`
            SELECT user_id, name, bio, goal, gender, thread_id, daily_msg,
                   warning_count, last_warning_date, daily_review_count, streak_freeze,
                   freeze_habits, freeze_reports, created_at,
                   total_done, days_streak, achieved_today, last_active
            FROM users
            WHERE thread_id = ?
        `);
        s.bind([threadId]);
        const r = s.step() ? s.getAsObject() : null;
        s.free(); return r;
    }

    updateUser(userId, fields) {
        const allowed = ['name','bio','goal','gender','thread_id','warning_count','last_warning_date','daily_review_count','daily_msg','streak_freeze','freeze_habits','freeze_reports','status'];
        const sets = [], vals = [];
        for (const [k, v] of Object.entries(fields)) {
            if (allowed.includes(k)) { sets.push(`${k} = ?`); vals.push(v); }
        }
        if (!sets.length) return;
        vals.push(userId);
        this.db.run(`UPDATE users SET ${sets.join(', ')} WHERE user_id = ?`, vals);
        this.save();
    }

    // Archive a member (freeze in DB)
    archiveUser(userId) {
        this.db.run(`UPDATE users SET status='archived' WHERE user_id=?`, [userId]);
        this.save();
    }

    // Restore an archived member
    restoreUser(userId) {
        this.db.run(`UPDATE users SET status='active' WHERE user_id=?`, [userId]);
        this.save();
    }

    // Hard delete a member (only called after confirmation + backup)
    deleteUserPermanently(userId) {
        const tables = ['habits', 'daily_history', 'achievements', 'goals',
                        'reports', 'warnings_log', 'timeout_pending', 'freezes_log',
                        'journals', 'task_completions', 'challenge_participants',
                        'challenge_daily_logs', 'daily_history'];
        for (const table of tables) {
            try { this.db.run(`DELETE FROM ${table} WHERE user_id=?`, [userId]); } catch(e) {}
        }
        this.db.run(`DELETE FROM users WHERE user_id=?`, [userId]);
        this.save();
    }

    // Get all archived members
    getArchivedUsers() {
        const s = this.db.prepare(`SELECT user_id, name, gender, thread_id, created_at FROM users WHERE status='archived' ORDER BY name`);
        const rows = [];
        while (s.step()) rows.push(s.getAsObject());
        s.free();
        return rows;
    }

    getAllUsers() {
        const s = this.db.prepare(`
            SELECT user_id, name, bio, goal, gender, thread_id,
                   warning_count, daily_review_count, streak_freeze, freeze_habits, freeze_reports,
                   total_done, days_streak, achieved_today
            FROM users
            WHERE status = 'active' OR status IS NULL
        `);
        const r = [];
        while (s.step()) r.push(s.getAsObject());
        s.free(); return r;
    }

    // ==========================================
    // ✅ DAILY REPORTS - التقارير اليومية
    // تخزين النص الكامل وعدد الكلمات لكل يوم
    // ==========================================

    /**
     * Gets logical Cairo date for daily reports - before 12PM counts as yesterday
     * @returns {string} YYYY-MM-DD format
     */
    getCairoLogicalDate() {
        try {
            const TZ = process.env.TIMEZONE || 'Africa/Cairo';
            const cairoTimeStr = new Date().toLocaleString("en-US", { timeZone: TZ });
            const cairoTime = new Date(cairoTimeStr);
            
            // If before 12:00 PM Cairo time, use yesterday's date
            if (cairoTime.getHours() < 12) {
                cairoTime.setDate(cairoTime.getDate() - 1);
            }
            
            const yyyy = cairoTime.getFullYear();
            const mm = String(cairoTime.getMonth() + 1).padStart(2, '0');
            const dd = String(cairoTime.getDate()).padStart(2, '0');
            return `${yyyy}-${mm}-${dd}`;
        } catch (error) {
            console.error('❌ getCairoLogicalDate error:', error.message);
            return new Date().toISOString().split('T')[0]; // Fallback to current date
        }
    }

    /**
     * يسجل تقرير يومي للعضو مع النص وعدد الكلمات.
     * في حالة وجود تقرير لنفس اليوم، يتم تحديثه إذا كان النص الجديد أطول.
     */
    recordDailyReport(userId, threadId = null, content = null, wordCount = null, reportDate = null) {
        try {
            const reportDateToUse = reportDate || this.getCairoLogicalDate(); // YYYY-MM-DD
            this.db.run(`
                INSERT INTO reports (user_id, type, report_date, thread_id, content, word_count)
                VALUES (?,?,?,?,?,?)
                ON CONFLICT(user_id, type, report_date) DO UPDATE SET
                    thread_id = excluded.thread_id,
                    content = CASE
                        WHEN excluded.content IS NOT NULL
                             AND (reports.content IS NULL OR length(excluded.content) > length(reports.content))
                        THEN excluded.content
                        ELSE reports.content
                    END,
                    word_count = CASE
                        WHEN excluded.word_count IS NOT NULL
                             AND (reports.word_count IS NULL OR excluded.word_count > reports.word_count)
                        THEN excluded.word_count
                        ELSE reports.word_count
                    END
            `, [userId, 'daily', reportDateToUse, threadId, content, wordCount]);
            this.save();
        } catch (e) {
            console.error('❌ recordDailyReport:', e.message);
        }
    }

    /**
     * يرجع كل الأعضاء اللي عملوا تقرير في تاريخ معين
     * @param {string} date - YYYY-MM-DD format
     * @returns {Array} - [{user_id, report_date, thread_id, content, word_count, recorded_at}]
     */
    getDailyReports(date) {
        try {
            const s = this.db.prepare(
                `SELECT * FROM reports WHERE type = 'daily' AND report_date = ? ORDER BY recorded_at DESC`
            );
            s.bind([date]);
            const r = [];
            while (s.step()) r.push(s.getAsObject());
            s.free();
            return r;
        } catch (e) {
            console.error('❌ getDailyReports:', e.message);
            return [];
        }
    }

    /**
     * حذف جميع التقارير اليومية ليوم معين (لأمر unsync_reports)
     * @param {string} date - YYYY-MM-DD
     */
    removeAllReportsForDate(date) {
        this.db.run('DELETE FROM reports WHERE type=\'daily\' AND report_date = ?', [date]);
        this.save();
    }

    /**
     * يرجع إحصائيات التقارير اليومية للأسبوع الماضي
     * مفيد للداشبورد والأدمن
     */
    getWeeklyReportStats() {
        try {
            const s = this.db.prepare(`
                SELECT report_date, COUNT(*) as count
                FROM reports
                WHERE type = 'daily' AND report_date >= date('now', '-7 days')
                GROUP BY report_date
                ORDER BY report_date DESC
            `);
            const r = [];
            while (s.step()) r.push(s.getAsObject());
            s.free();
            return r;
        } catch (e) {
            console.error('❌ getWeeklyReportStats:', e.message);
            return [];
        }
    }

    /**
     * عدد التقارير التي كتبها العضو خلال آخر عدد أيام محدد.
     * يُستخدم في فحص الإنذارات الأسبوعي بناءً على التقارير الفعلية.
     */
    getUserReportsCountInLastDays(userId, days = 7) {
        try {
            const s = this.db.prepare(`
                SELECT COUNT(*) as count
                FROM reports
                WHERE type = 'daily' AND user_id = ?
                  AND report_date >= date('now', ?)
            `);
            s.bind([userId, `-${days} days`]);
            const has = s.step();
            const row = has ? s.getAsObject() : { count: 0 };
            s.free();
            return row.count || 0;
        } catch (e) {
            console.error('❌ getUserReportsCountInLastDays:', e.message);
            return 0;
        }
    }

    /**
     * إرجاع كل التقارير اليومية لعضو معيّن مرتبة تنازلياً بالتاريخ.
     * مخصصة للاستخدام في واجهة الويب (أرشيف التقارير).
     */
    getMemberDailyReports(userId) {
        try {
            const s = this.db.prepare(`
                SELECT user_id, report_date, thread_id, content, word_count, recorded_at
                FROM daily_reports
                WHERE user_id = ?
                ORDER BY report_date DESC, recorded_at DESC
            `);
            s.bind([userId]);
            const r = [];
            while (s.step()) r.push(s.getAsObject());
            s.free();
            return r;
        } catch (e) {
            console.error('❌ getMemberDailyReports:', e.message);
            return [];
        }
    }

    saveDailyPost(postDate, threadId) {
        try {
            this.db.run(
                `INSERT OR REPLACE INTO daily_posts (post_date, thread_id) VALUES (?, ?)`,
                [postDate, threadId]
            );
            this.save();
        } catch (e) { console.error('❌ saveDailyPost:', e.message); }
    }

    getDailyPost(postDate) {
        const s = this.db.prepare('SELECT * FROM daily_posts WHERE post_date = ?');
        s.bind([postDate]);
        const r = s.step() ? s.getAsObject() : null;
        s.free();
        return r;
    }

    getUserTotalReports(userId) {
        try {
            const s = this.db.prepare(`SELECT COUNT(*) as cnt FROM daily_reports WHERE user_id = ?`);
            s.bind([userId]);
            const r = s.step() ? s.getAsObject() : { cnt: 0 };
            s.free();
            return r.cnt || 0;
        } catch (e) { return 0; }
    }

    getUserMaxStreak(userId) {
        try {
            // نحسب أطول streak من التقارير
            const s = this.db.prepare(`SELECT report_date FROM daily_reports WHERE user_id = ? ORDER BY report_date ASC`);
            s.bind([userId]);
            const dates = [];
            while (s.step()) { dates.push(s.getAsObject().report_date); }
            s.free();
            if (!dates.length) return 0;
            let max = 1, cur = 1;
            for (let i = 1; i < dates.length; i++) {
                const prev = new Date(dates[i-1]);
                const curr = new Date(dates[i]);
                const diff = (curr - prev) / (1000 * 60 * 60 * 24);
                if (diff === 1) { cur++; max = Math.max(max, cur); }
                else cur = 1;
            }
            return max;
        } catch (e) { return 0; }
    }

    getUserChallengeStats(userId) {
        try {
            const s = this.db.prepare(`
                SELECT 
                    COUNT(DISTINCT cp.challenge_id) as total,
                    SUM(cp.total_minutes) as total_minutes
                FROM challenge_participants cp
                WHERE cp.user_id = ?
            `);
            s.bind([userId]);
            const r = s.step() ? s.getAsObject() : { total: 0, total_minutes: 0 };
            s.free();

            // حساب كم مرة في أول 3
            const s2 = this.db.prepare(`
                SELECT challenge_id FROM challenge_participants
                WHERE user_id = ? ORDER BY total_minutes DESC
            `);
            s2.bind([userId]);
            const participations = [];
            while (s2.step()) { participations.push(s2.getAsObject().challenge_id); }
            s2.free();

            let top3 = 0;
            for (const cid of participations) {
                const s3 = this.db.prepare(`
                    SELECT user_id FROM challenge_participants
                    WHERE challenge_id = ? ORDER BY total_minutes DESC LIMIT 3
                `);
                s3.bind([cid]);
                const top = [];
                while (s3.step()) { top.push(s3.getAsObject().user_id); }
                s3.free();
                if (top.includes(userId)) top3++;
            }

            return { total: r.total || 0, total_minutes: r.total_minutes || 0, top3 };
        } catch (e) { return { total: 0, total_minutes: 0, top3: 0 }; }
    }

    getDailyPostByDate(date) {
        try {
            const s = this.db.prepare('SELECT * FROM daily_posts WHERE post_date = ? LIMIT 1');
            s.bind([date]);
            const r = s.step() ? s.getAsObject() : null;
            s.free();
            return r;
        } catch (e) { console.error('❌ getDailyPostByDate:', e.message); return null; }
    }

    getDailyPostByThread(threadId) {
        const s = this.db.prepare('SELECT * FROM daily_posts WHERE thread_id = ?');
        s.bind([threadId]);
        const r = s.step() ? s.getAsObject() : null;
        s.free();
        return r;
    }

    getDailyReport(userId, postDate) {
        const s = this.db.prepare(
            `SELECT * FROM daily_reports WHERE user_id = ? AND report_date = ?`
        );
        s.bind([userId, postDate]);
        const r = s.step() ? s.getAsObject() : null;
        s.free();
        return r;
    }

    hasDailyReport(userId, postDate) {
        const s = this.db.prepare(
            `SELECT id FROM daily_reports WHERE user_id = ? AND report_date = ?`
        );
        s.bind([userId, postDate]);
        const has = s.step();
        s.free();
        return !!has;
    }

    getReportCountInRange(userId, startDate, endDate) {
        const s = this.db.prepare(
            `SELECT COUNT(*) as cnt FROM reports
             WHERE user_id = ? AND type = 'daily' AND report_date >= ? AND report_date <= ?`
        );
        s.bind([userId, startDate, endDate]);
        const row = s.step() ? s.getAsObject() : { cnt: 0 };
        s.free();
        return row.cnt || 0;
    }

    recordWeeklyReport(userId, channelId, content, wordCount, period) {
        try {
            this.db.run(`
                INSERT INTO reports (user_id, type, report_date, channel_id, content, word_count)
                VALUES (?,?,?,?,?,?)
                ON CONFLICT(user_id, type, report_date) DO UPDATE SET channel_id=excluded.channel_id, content=excluded.content, word_count=excluded.word_count
            `, [userId, 'weekly', period, channelId, content, wordCount]);
            this.save();
        } catch (e) { console.error('❌ recordWeeklyReport:', e.message); }
    }

    recordMonthlyReport(userId, channelId, content, wordCount, period) {
        try {
            this.db.run(`
                INSERT INTO reports (user_id, type, report_date, channel_id, content, word_count)
                VALUES (?,?,?,?,?,?)
                ON CONFLICT(user_id, type, report_date) DO UPDATE SET channel_id=excluded.channel_id, content=excluded.content, word_count=excluded.word_count
            `, [userId, 'monthly', period, channelId, content, wordCount]);
            this.save();
        } catch (e) { console.error('❌ recordMonthlyReport:', e.message); }
    }

    recordYearlyReport(userId, channelId, content, wordCount, period) {
        try {
            this.db.run(`
                INSERT INTO reports (user_id, type, report_date, channel_id, content, word_count)
                VALUES (?,?,?,?,?,?)
                ON CONFLICT(user_id, type, report_date) DO UPDATE SET channel_id=excluded.channel_id, content=excluded.content, word_count=excluded.word_count
            `, [userId, 'yearly', period, channelId, content, wordCount]);
            this.save();
        } catch (e) { console.error('❌ recordYearlyReport:', e.message); }
    }

    getMemberWeeklyReports(userId) {
        try {
            const s = this.db.prepare(`SELECT * FROM weekly_reports WHERE user_id=? ORDER BY report_date DESC`);
            s.bind([userId]);
            const r = [];
            while (s.step()) r.push(s.getAsObject());
            s.free();
            return r;
        } catch (e) { console.error('❌ getMemberWeeklyReports:', e.message); return []; }
    }

    getMemberMonthlyReports(userId) {
        try {
            const s = this.db.prepare(`SELECT * FROM monthly_reports WHERE user_id=? ORDER BY report_date DESC`);
            s.bind([userId]);
            const r = [];
            while (s.step()) r.push(s.getAsObject());
            s.free();
            return r;
        } catch (e) { console.error('❌ getMemberMonthlyReports:', e.message); return []; }
    }

    getMemberYearlyReports(userId) {
        try {
            const s = this.db.prepare(`SELECT * FROM yearly_reports WHERE user_id=? ORDER BY report_date DESC`);
            s.bind([userId]);
            const r = [];
            while (s.step()) r.push(s.getAsObject());
            s.free();
            return r;
        } catch (e) { console.error('❌ getMemberYearlyReports:', e.message); return []; }
    }

    // ==========================================
    // WARNINGS
    // ==========================================
    addWarning(userId, reason, issuedBy) {
        try {
            this.db.run(
                `INSERT INTO warnings_log (user_id, reason, issued_by) VALUES (?,?,?)`,
                [userId, reason || 'مخالفة الشروط', issuedBy || 'admin']
            );
            this.db.run(`
                UPDATE users SET warning_count = warning_count + 1, last_warning_date = CURRENT_TIMESTAMP
                WHERE user_id = ?
            `, [userId]);
            this.save();
            return this.getUser(userId)?.warning_count || 0;
        } catch (e) { console.error('❌ addWarning:', e.message); return -1; }
    }

    removeWarning(userId) {
        this.db.run(`UPDATE users SET warning_count = MAX(0, warning_count - 1) WHERE user_id = ?`, [userId]);
        this.save();
    }

    clearWarnings(userId) {
        this.db.run(`UPDATE users SET warning_count = 0, last_warning_date = NULL WHERE user_id = ?`, [userId]);
        this.save();
    }

    getWarningsLog(userId) {
        const s = this.db.prepare(`SELECT * FROM warnings_log WHERE user_id = ? ORDER BY issued_at DESC`);
        s.bind([userId]);
        const r = [];
        while (s.step()) r.push(s.getAsObject());
        s.free(); return r;
    }

    // ==========================================
    // HABITS
    // ==========================================
    addHabit(userId, name) {
        this.db.run(`INSERT INTO habits (user_id, name) VALUES (?,?)`, [userId, name]);
        this.save();
        const s = this.db.prepare('SELECT last_insert_rowid() as id');
        s.step(); const id = s.getAsObject().id; s.free();
        return id;
    }

    getHabits(userId) {
        const s = this.db.prepare(`SELECT * FROM habits WHERE user_id = ? ORDER BY position ASC, id ASC`);
        s.bind([userId]);
        const r = [];
        while (s.step()) r.push(s.getAsObject());
        s.free(); return r;
    }

    toggleHabit(id) {
        this.db.run(`UPDATE habits SET completed = CASE WHEN completed = 0 THEN 1 ELSE 0 END WHERE id = ?`, [id]);
        this.save();
    }

    deleteHabit(id) {
        this.db.run('DELETE FROM habits WHERE id = ?', [id]);
        this.save();
    }

    // ==========================================
    // STATS
    // ==========================================
    updateStats(userId, done, streak, achieved) {
        this.db.run(`
            UPDATE users SET total_done=?, days_streak=?, achieved_today=?, last_active=CURRENT_TIMESTAMP
            WHERE user_id=?
        `, [done, streak, achieved ? 1 : 0, userId]);
        this.save();
    }

    incrementUserTotal(userId) {
        try {
            this.db.run(`UPDATE users SET total_done=total_done+1, last_active=CURRENT_TIMESTAMP WHERE user_id=?`, [userId]);
            this.save();
        } catch (e) { console.error('❌ incrementUserTotal:', e.message); }
    }

    decrementUserTotal(userId) {
        try {
            this.db.run(`UPDATE users SET total_done=MAX(0,total_done-1), last_active=CURRENT_TIMESTAMP WHERE user_id=?`, [userId]);
            this.save();
        } catch (e) { console.error('❌ decrementUserTotal:', e.message); }
    }

    // ==========================================
    // JOURNAL
    // ==========================================
    addJournalEntry(userId, type, content, sentiment = 'neutral') {
        try {
            this.db.run(`INSERT INTO journal_logs (user_id, type, content, sentiment) VALUES (?,?,?,?)`,
                [userId, type, content, sentiment]);
            this.save();
        } catch (e) { console.error('❌ addJournalEntry:', e.message); }
    }

    getJournalEntries(userId, limit = 10) {
        const s = this.db.prepare(`SELECT * FROM journal_logs WHERE user_id=? ORDER BY id DESC LIMIT ?`);
        s.bind([userId, limit]);
        const r = [];
        while (s.step()) r.push(s.getAsObject());
        s.free(); return r;
    }

    // ==========================================
    // JOURNALS (تدوين — أفكار المستخدم)
    // ==========================================
    addJournal(userId, content) {
        try {
            this.db.run(`INSERT INTO journals (user_id, content) VALUES (?,?)`, [userId, (content || '').trim()]);
            this.save();
            const s = this.db.prepare('SELECT last_insert_rowid() as id');
            s.step();
            const id = s.getAsObject().id;
            s.free();
            return id;
        } catch (e) { console.error('❌ addJournal:', e.message); return null; }
    }

    getUserJournals(userId, limit = 50) {
        try {
            const s = this.db.prepare(`SELECT * FROM journals WHERE user_id=? ORDER BY created_at DESC LIMIT ?`);
            s.bind([userId, limit]);
            const r = [];
            while (s.step()) r.push(s.getAsObject());
            s.free();
            return r;
        } catch (e) { console.error('❌ getUserJournals:', e.message); return []; }
    }

    // ==========================================
    // CUSTOM MONTH
    // ==========================================
    startCustomMonth(startDate, durationDays = 30) {
        try {
            this.db.run(`UPDATE custom_months SET is_active = 0`);
            this.db.run(`INSERT INTO custom_months (start_date, duration_days, is_active) VALUES (?,?,1)`, [startDate, durationDays]);
            this.save();
            const s = this.db.prepare('SELECT last_insert_rowid() as id');
            s.step();
            const id = s.getAsObject().id;
            s.free();
            return id;
        } catch (e) { console.error('❌ startCustomMonth:', e.message); return null; }
    }

    endCustomMonth() {
        try {
            this.db.run(`UPDATE custom_months SET is_active = 0 WHERE is_active = 1`);
            this.save();
        } catch (e) { console.error('❌ endCustomMonth:', e.message); }
    }

    getActiveMonth() {
        try {
            const s = this.db.prepare(`SELECT * FROM custom_months WHERE is_active = 1 ORDER BY id DESC LIMIT 1`);
            const r = s.step() ? s.getAsObject() : null;
            s.free();
            return r;
        } catch (e) { console.error('❌ getActiveMonth:', e.message); return null; }
    }

    // ==========================================
    // ACHIEVEMENTS
    // ==========================================
    addAchievement(userId, type) {
        try {
            this.db.run(`INSERT OR IGNORE INTO achievements (user_id, achievement_type) VALUES (?,?)`, [userId, type]);
            this.save(); return true;
        } catch (e) { return false; }
    }

    getUserAchievements(userId) {
        const s = this.db.prepare('SELECT * FROM achievements WHERE user_id=? ORDER BY earned_at DESC');
        s.bind([userId]);
        const r = [];
        while (s.step()) r.push(s.getAsObject());
        s.free(); return r;
    }

    hasAchievement(userId, type) {
        const s = this.db.prepare('SELECT 1 FROM achievements WHERE user_id=? AND achievement_type=?');
        s.bind([userId, type]);
        const has = s.step(); s.free(); return has;
    }

    // ==========================================
    // WEEKLY GOALS
    // ==========================================
    getWeekStart() {
        const now = new Date();
        const day = now.getDay();
        const diff = now.getDate() - day + (day === 0 ? -6 : 1);
        return new Date(now.getFullYear(), now.getMonth(), diff).toISOString().split('T')[0];
    }

    setWeeklyGoal(userId, goalText) {
        this.db.run(`INSERT INTO goals (user_id, goal_text, goal_type, period) VALUES (?,?,?,?)`,
            [userId, goalText, 'weekly', this.getWeekStart()]);
        this.save();
    }

    getWeeklyGoal(userId) {
        const s = this.db.prepare(`SELECT * FROM goals WHERE user_id=? AND goal_type='weekly' ORDER BY created_at DESC LIMIT 1`);
        s.bind([userId]);
        const r = s.step() ? s.getAsObject() : null;
        s.free(); return r;
    }

    updateWeeklyGoal(userId, goalText) {
        this.db.run(`UPDATE goals SET goal_text=? WHERE user_id=? AND goal_type='weekly'`,
            [goalText, userId]);
        this.save();
    }

    addGoal(userId, goalText, goalType, period) {
        try {
            this.db.run(`INSERT INTO goals (user_id, goal_text, goal_type, period) VALUES (?,?,?,?)`,
                [userId, goalText, goalType, period]);
            this.save();
        } catch (e) { console.error('❌ addGoal:', e.message); }
    }

    getGoals(userId, goalType, period) {
        try {
            const s = this.db.prepare(`SELECT * FROM goals WHERE user_id=? AND goal_type=? AND period=? AND is_active=1 ORDER BY id ASC`);
            s.bind([userId, goalType, period]);
            const r = [];
            while (s.step()) r.push(s.getAsObject());
            s.free();
            return r;
        } catch (e) { console.error('❌ getGoals:', e.message); return []; }
    }

    /**
     * شجرة أهداف العضو الحالية (سنوي/شهري/أسبوعي) — للواجهات والـ API.
     * استعلامات خفيفة (3 استعلامات مفهرسة).
     */
    getMemberGoalsTree(userId) {
        const now = new Date();
        const currentYear = now.getFullYear().toString();
        const currentMonth = `${currentYear}-${String(now.getMonth() + 1).padStart(2, '0')}`;
        const currentWeek = `${currentMonth}-W${Math.ceil(now.getDate() / 7)}`;
        return {
            yearly:  this.getGoals(userId, 'yearly', currentYear).map(g => ({ id: g.id, goal_text: g.goal_text, period: g.period })),
            monthly: this.getGoals(userId, 'monthly', currentMonth).map(g => ({ id: g.id, goal_text: g.goal_text, period: g.period })),
            weekly:  this.getGoals(userId, 'weekly', currentWeek).map(g => ({ id: g.id, goal_text: g.goal_text, period: g.period }))
        };
    }

    updateGoal(id, goalText) {
        try {
            this.db.run(`UPDATE goals SET goal_text=? WHERE id=?`, [goalText, id]);
            this.save();
        } catch (e) { console.error('❌ updateGoal:', e.message); }
    }

    deleteGoal(id) {
        try {
            this.db.run(`DELETE FROM goals WHERE id=?`, [id]);
            this.save();
        } catch (e) { console.error('❌ deleteGoal:', e.message); }
    }

    deleteGoalsByTypePeriod(userId, goalType, period) {
        try {
            this.db.run(`DELETE FROM goals WHERE user_id=? AND goal_type=? AND period=?`, [userId, goalType, period]);
            this.save();
        } catch (e) { console.error('❌ deleteGoalsByTypePeriod:', e.message); }
    }

    // ==========================================
    // TASKS — مهام أسبوعية/شهرية
    // ==========================================
    createTask(guildId, type, title, description, threadId, period, graceHours, lockAt, createdBy, taskOrder = null) {
        try {
            this.db.run(
                `INSERT INTO tasks (guild_id, type, title, description, thread_id, period, grace_hours, lock_at, created_by, task_order)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                [guildId, type, title, description, threadId, period, graceHours, lockAt, createdBy, taskOrder]
            );
            this.save();
            const s = this.db.prepare('SELECT last_insert_rowid() as id');
            s.step();
            const row = s.getAsObject();
            s.free();
            return row.id;
        } catch (e) { console.error('❌ createTask:', e.message); return null; }
    }

    getTaskByThread(threadId) {
        const s = this.db.prepare('SELECT * FROM tasks WHERE thread_id = ?');
        s.bind([threadId]);
        const r = s.step() ? s.getAsObject() : null;
        s.free();
        return r;
    }

    getTask(taskId) {
      try {
          const s = this.db.prepare('SELECT * FROM tasks WHERE id = ?');
          s.bind([taskId]);
          const r = s.step() ? s.getAsObject() : null;
          s.free();
          return r;
      } catch (error) {
          console.error('❌ getTask Error:', error.message);
          return null;
      }
  }

    deleteTask(taskId) {
      try {
          this.db.run('DELETE FROM tasks WHERE id = ?', [taskId]);
          this.save();
          return true;
      } catch (error) {
          console.error('❌ deleteTask Error:', error.message);
          return false;
      }
  }

    updateTask(taskId, fields) {
        const allowed = ['type', 'task_order', 'period', 'lock_at', 'is_locked'];
        const sets = [], vals = [];
        for (const [k, v] of Object.entries(fields)) {
            if (allowed.includes(k)) { sets.push(`${k} = ?`); vals.push(v); }
        }
        if (!sets.length) return;
        vals.push(taskId);
        this.db.run(`UPDATE tasks SET ${sets.join(', ')} WHERE id = ?`, vals);
        this.save();
    }

    getActiveTasks(guildId, type) {
        const s = this.db.prepare(
            `SELECT * FROM tasks WHERE guild_id = ? AND type = ? AND is_locked = 0`
        );
        s.bind([guildId, type]);
        const r = [];
        while (s.step()) r.push(s.getAsObject());
        s.free();
        return r;
    }

    getMissingTasks(userId, guildId) {
        const s = this.db.prepare(
            `SELECT t.* FROM tasks t
             WHERE t.guild_id = ? AND t.is_locked = 0
             AND NOT EXISTS (
               SELECT 1 FROM task_completions tc
               WHERE tc.task_id = t.id AND tc.user_id = ?
             )`
        );
        s.bind([guildId, userId]);
        const r = [];
        while (s.step()) r.push(s.getAsObject());
        s.free();
        return r;
    }

    completeTask(taskId, userId, messageId, content) {
        try {
            this.db.run(
                `INSERT INTO task_completions (task_id, user_id, message_id, content)
                 VALUES (?, ?, ?, ?)`,
                [taskId, userId, messageId, content || null]
            );
            this.save();
            return true;
        } catch (e) { return false; }
    }

    getUserTaskCompletions(taskId, userId) {
        try {
            const s = this.db.prepare(
                `SELECT COUNT(*) as cnt FROM task_completions WHERE task_id = ? AND user_id = ?`
            );
            s.bind([taskId, userId]);
            const r = s.step() ? s.getAsObject() : { cnt: 0 };
            s.free();
            return r.cnt || 0;
        } catch (e) { return 0; }
    }

    hasCompletedTask(taskId, userId) {
        const s = this.db.prepare(
            `SELECT id FROM task_completions WHERE task_id = ? AND user_id = ?`
        );
        s.bind([taskId, userId]);
        const has = s.step();
        s.free();
        return !!has;
    }

    lockTask(taskId) {
        this.db.run('UPDATE tasks SET is_locked = 1 WHERE id = ?', [taskId]);
        this.save();
    }

    getTasksToLock() {
        const s = this.db.prepare(
            `SELECT * FROM tasks WHERE is_locked = 0 AND lock_at <= datetime('now')`
        );
        const r = [];
        while (s.step()) r.push(s.getAsObject());
        s.free();
        return r;
    }

    // ✅ جيب الأعضاء اللي ماكملوش تاسك معين (لإشعارهم عند القفل)
    getMembersWhoMissedTask(taskId) {
        const s = this.db.prepare(`
            SELECT u.user_id, u.name, u.thread_id, u.gender FROM users u
            WHERE u.thread_id IS NOT NULL
            AND NOT EXISTS (
                SELECT 1 FROM task_completions tc
                WHERE tc.task_id = ? AND tc.user_id = u.user_id
            )
        `);
        s.bind([taskId]);
        const r = [];
        while (s.step()) r.push(s.getAsObject());
        s.free();
        return r;
    }

    // ✅ جيب التحديات المنتهية اللي لسه مش اتحسبت (لإشعار الأدمن)
    getExpiredChallenges() {
        const today = new Date().toISOString().split('T')[0];
        const s = this.db.prepare(
            `SELECT * FROM challenges WHERE end_date < ? AND is_active = 1`
        );
        s.bind([today]);
        const r = [];
        while (s.step()) r.push(s.getAsObject());
        s.free();
        return r;
    }

    getTotalCompletedTasksCount(userId) {
        const s = this.db.prepare(
            `SELECT COUNT(*) as cnt FROM task_completions WHERE user_id = ?`
        );
        s.bind([userId]);
        const row = s.step() ? s.getAsObject() : { cnt: 0 };
        s.free();
        return row.cnt || 0;
    }

    getCompletedTasksInRange(userId, type, startDate, endDate) {
        const s = this.db.prepare(
            `SELECT COUNT(*) as cnt FROM task_completions tc
             JOIN tasks t ON tc.task_id = t.id
             WHERE tc.user_id = ? AND t.type = ?
             AND tc.completed_at >= ? AND tc.completed_at <= ?`
        );
        s.bind([userId, type, startDate, endDate]);
        const row = s.step() ? s.getAsObject() : { cnt: 0 };
        s.free();
        return row.cnt || 0;
    }

    getTotalTasksInRange(type, startDate, endDate) {
        const s = this.db.prepare(
            `SELECT COUNT(*) as cnt FROM tasks
             WHERE type = ? AND created_at >= ? AND created_at <= ?`
        );
        s.bind([type, startDate, endDate]);
        const row = s.step() ? s.getAsObject() : { cnt: 0 };
        s.free();
        return row.cnt || 0;
    }

    // ==========================================
    // SCHEDULED MESSAGES
    // ==========================================
    addScheduledMessage(data) {
        try {
            this.db.run(`
                INSERT INTO scheduled_messages (title,content,media_url,channel_id,cron_expr,repeat_type,notify_before,created_by)
                VALUES (?,?,?,?,?,?,?,?)
            `, [data.title||'', data.content, data.mediaUrl||null, data.channelId, data.cronExpr, data.repeatType||'once', data.notifyBefore?1:0, data.createdBy||'admin']);
            this.save();
            const s = this.db.prepare('SELECT last_insert_rowid() as id');
            s.step(); const id = s.getAsObject().id; s.free();
            return id;
        } catch (e) { console.error('❌ addScheduledMessage:', e.message); return null; }
    }

    getScheduledMessages(activeOnly = true) {
        const q = activeOnly
            ? `SELECT * FROM scheduled_messages WHERE is_active=1 ORDER BY created_at DESC`
            : `SELECT * FROM scheduled_messages ORDER BY created_at DESC`;
        const s = this.db.prepare(q);
        const r = [];
        while (s.step()) r.push(s.getAsObject());
        s.free(); return r;
    }

    updateScheduledMessage(id, fields) {
        const allowed = ['title','content','media_url','channel_id','cron_expr','repeat_type','is_active','last_sent'];
        const sets = [], vals = [];
        for (const [k,v] of Object.entries(fields)) {
            if (allowed.includes(k)) { sets.push(`${k}=?`); vals.push(v); }
        }
        if (!sets.length) return;
        vals.push(id);
        this.db.run(`UPDATE scheduled_messages SET ${sets.join(',')} WHERE id=?`, vals);
        this.save();
    }

    deleteScheduledMessage(id) {
        this.db.run('DELETE FROM scheduled_messages WHERE id=?', [id]);
        this.save();
    }

    // ==========================================
    // AUTO RESPONSES
    // ==========================================
    addAutoResponse(trigger, response, channelScope = 'all', matchType = 'contains') {
        try {
            this.db.run(`INSERT INTO auto_responses (trigger_text,response_text,channel_scope,match_type) VALUES (?,?,?,?)`,
                [trigger.toLowerCase().trim(), response, channelScope, matchType]);
            this.save(); return true;
        } catch (e) { console.error('❌ addAutoResponse:', e.message); return false; }
    }

    getAutoResponses(activeOnly = true) {
        const q = activeOnly ? `SELECT * FROM auto_responses WHERE is_active=1` : `SELECT * FROM auto_responses`;
        const s = this.db.prepare(q);
        const r = [];
        while (s.step()) r.push(s.getAsObject());
        s.free(); return r;
    }

    toggleAutoResponse(id) {
        this.db.run(`UPDATE auto_responses SET is_active = CASE WHEN is_active=1 THEN 0 ELSE 1 END WHERE id=?`, [id]);
        this.save();
    }

    deleteAutoResponse(id) {
        this.db.run('DELETE FROM auto_responses WHERE id=?', [id]);
        this.save();
    }

    // ==========================================
    // ANALYTICS
    // ==========================================
    getUserAnalytics(userId) {
        const user = this.getUser(userId);
        const habits = this.getHabits(userId);
        const weeklyReport = this.getWeeklyReport(userId);
        const achievements = this.getUserAchievements(userId);
        const weeklyGoal = this.getWeeklyGoal(userId);
        return {
            user, totalHabits: habits.length,
            completedToday: habits.filter(h => h.completed).length,
            weeklyReport, achievements, weeklyGoal,
            streakDays: user?.days_streak || 0
        };
    }

    getWeeklyReport(userId) {
        const s = this.db.prepare(`
            SELECT date, rate, completed, total FROM daily_history
            WHERE user_id=? AND date >= date('now','-7 days') ORDER BY date ASC
        `);
        s.bind([userId]);
        const r = [];
        while (s.step()) r.push(s.getAsObject());
        s.free(); return r;
    }

    /**
     * بيانات الرسم البياني الأسبوعي (آخر 7 أيام) — جاهزة للـ HUD/Charts.
     */
    getWeeklyChartData(userId) {
        return this.getWeeklyReport(userId);
    }

    getLeaderboard(limit = 10) {
        const s = this.db.prepare(`
            SELECT user_id, name, days_streak, total_done,
                   COALESCE(
                       (SELECT AVG(rate) FROM daily_history dh
                        WHERE dh.user_id=users.user_id AND dh.date >= date('now','-7 days')),
                       0
                   ) as avg_rate
            FROM users
            ORDER BY avg_rate DESC, days_streak DESC LIMIT ?
        `);
        s.bind([limit]);
        const r = [];
        while (s.step()) r.push(s.getAsObject());
        s.free(); return r;
    }

    getInactiveUsers() {
        const s = this.db.prepare(`
            SELECT *
            FROM users
            WHERE (
                SELECT COUNT(*) FROM daily_reports dr
                WHERE dr.user_id = users.user_id
                AND dr.report_date >= date('now', '-7 days')
            ) < 5
        `);
        const r = [];
        while (s.step()) r.push(s.getAsObject());
        s.free();
        return r;
    }

    // ==========================================
    // FREEZE (إجازات) — رصيد عطلية الستريك والتقارير
    // ==========================================
    useFreeze(userId, type, isManual = false) {
        try {
            const col = type === 'reports' ? 'freeze_reports' : 'freeze_habits';
            const s = this.db.prepare(`SELECT ${col} as balance FROM users WHERE user_id = ?`);
            s.bind([userId]);
            const row = s.step() ? s.getAsObject() : { balance: 0 };
            s.free();
            const balance = row.balance ?? 0;
            if (balance <= 0) return false;

            this.db.run(`UPDATE users SET ${col} = MAX(0, ${col} - 1) WHERE user_id = ?`, [userId]);

            const today = new Date().toISOString().split('T')[0];
            this.db.run(
                `INSERT OR REPLACE INTO freezes_log (user_id, date, type, is_manual) VALUES (?,?,?,?)`,
                [userId, today, type, isManual ? 1 : 0]
            );
            this.save();
            return true;
        } catch (e) {
            console.error('❌ useFreeze:', e.message);
            return false;
        }
    }

    hasManualFreezeForDate(userId, type, date) {
        try {
            const s = this.db.prepare(
                `SELECT 1 FROM freezes_log WHERE user_id = ? AND type = ? AND date = ? AND is_manual = 1 LIMIT 1`
            );
            s.bind([userId, type, date]);
            const has = s.step();
            s.free();
            return !!has;
        } catch (e) {
            console.error('❌ hasManualFreezeForDate:', e.message);
            return false;
        }
    }

    incrementDailyReview(userId) {
        this.db.run(`UPDATE users SET daily_review_count=daily_review_count+1 WHERE user_id=?`, [userId]);
        this.save();
    }

    // ==========================================
    // TIMEOUT PENDING
    // ==========================================

    /**
     * إضافة أو تحديث سجل Timeout معلق لعضو وصل لثلاثة إنذارات.
     */
    addTimeoutPending(userId, reason, warningCount = 3) {
        try {
            this.db.run(`
                INSERT INTO timeout_pending (user_id, reason, warning_count, status, notified_at)
                VALUES (?,?,?,?,CURRENT_TIMESTAMP)
                ON CONFLICT(user_id) DO UPDATE SET
                    reason = excluded.reason,
                    warning_count = excluded.warning_count,
                    status = 'pending',
                    notified_at = CURRENT_TIMESTAMP
            `, [userId, reason, warningCount, 'pending']);
            this.save();
        } catch (e) {
            console.error('❌ addTimeoutPending:', e.message);
        }
    }

    /**
     * إرجاع كل الـ Timeout المعلقة للأدمن (تُستخدم في $timeout_list).
     */
    getPendingTimeouts() {
        try {
            const s = this.db.prepare(`
                SELECT t.id, t.user_id, t.reason, t.warning_count, t.notified_at,
                       u.name, u.thread_id
                FROM timeout_pending t
                LEFT JOIN users u ON u.user_id = t.user_id
                WHERE t.status = 'pending'
                ORDER BY t.notified_at ASC
            `);
            const r = [];
            while (s.step()) r.push(s.getAsObject());
            s.free();
            return r;
        } catch (e) {
            console.error('❌ getPendingTimeouts:', e.message);
            return [];
        }
    }

    /**
     * تحديث حالة الـ Timeout بعد تنفيذ القرار (executed/dismissed).
     */
    resolveTimeoutPending(userId, status) {
        try {
            this.db.run(`
                UPDATE timeout_pending
                SET status = ?, last_reminder_at = CURRENT_TIMESTAMP
                WHERE user_id = ?
            `, [status, userId]);
            this.save();
        } catch (e) {
            console.error('❌ resolveTimeoutPending:', e.message);
        }
    }

    // ==========================================
    // CHALLENGES
    // ==========================================
    createChallenge(data) {
        try {
            this.db.run(`
                INSERT INTO challenges (title, description, image_url, keyword, forum_thread_id, start_date, end_date, created_by, min_minutes, max_minutes, bonus_minutes)
                VALUES (?,?,?,?,?,?,?,?,?,?,?)
            `, [
                data.title, data.description || null, data.image_url || null, data.keyword,
                data.forum_thread_id || null, data.start_date || null, data.end_date || null, data.created_by || null,
                data.min_minutes ?? 0, data.max_minutes ?? 999, data.bonus_minutes ?? 0
            ]);
            this.save();
            const s = this.db.prepare('SELECT last_insert_rowid() as id');
            s.step();
            const row = s.getAsObject();
            s.free();
            return row.id;
        } catch (e) { console.error('❌ createChallenge:', e.message); return null; }
    }

    getActiveChallenge(threadId) {
        try {
            const s = this.db.prepare(`SELECT * FROM challenges WHERE forum_thread_id=? AND is_active=1 LIMIT 1`);
            s.bind([threadId]);
            const r = s.step() ? s.getAsObject() : null;
            s.free();
            return r;
        } catch (e) { console.error('❌ getActiveChallenge:', e.message); return null; }
    }

    getChallenge(id) {
        try {
            const s = this.db.prepare(`SELECT * FROM challenges WHERE id=?`);
            s.bind([id]);
            const r = s.step() ? s.getAsObject() : null;
            s.free();
            return r;
        } catch (e) { console.error('❌ getChallenge:', e.message); return null; }
    }

    // ✅ إنهاء تحدي — يعمل is_active = 0 عشان ما يظهرش في getExpiredChallenges تاني
    updateChallengeStatus(id, isActive) {
        try {
            this.db.run(`UPDATE challenges SET is_active = ? WHERE id = ?`, [isActive ? 1 : 0, id]);
            this.save();
        } catch (e) { console.error('❌ updateChallengeStatus:', e.message); }
    }

    addChallengeParticipant(challengeId, userId) {
        try {
            const check = this.db.prepare(`SELECT 1 FROM challenge_participants WHERE challenge_id=? AND user_id=?`);
            check.bind([challengeId, userId]);
            if (check.step()) { check.free(); return false; }
            check.free();
            this.db.run(`INSERT INTO challenge_participants (challenge_id, user_id) VALUES (?,?)`, [challengeId, userId]);
            this.save();
            return true;
        } catch (e) { console.error('❌ addChallengeParticipant:', e.message); return false; }
    }

    getChallengeParticipants(challengeId) {
        try {
            const s = this.db.prepare(`SELECT cp.*, u.name FROM challenge_participants cp LEFT JOIN users u ON u.user_id=cp.user_id WHERE cp.challenge_id=? ORDER BY cp.joined_at ASC`);
            s.bind([challengeId]);
            const r = [];
            while (s.step()) r.push(s.getAsObject());
            s.free();
            return r;
        } catch (e) { console.error('❌ getChallengeParticipants:', e.message); return []; }
    }

    getUserChallenges(userId) {
        try {
            const s = this.db.prepare(`
                SELECT c.* FROM challenges c
                INNER JOIN challenge_participants cp ON cp.challenge_id=c.id
                WHERE cp.user_id=? ORDER BY c.end_date DESC
            `);
            s.bind([userId]);
            const r = [];
            while (s.step()) r.push(s.getAsObject());
            s.free();
            return r;
        } catch (e) { console.error('❌ getUserChallenges:', e.message); return []; }
    }

    /**
     * يسجل يوم التحدي للعضو (التاريخ الحالي) مع الدقائق والنقاط.
     * لو العضو غير موجود في challenge_participants يُضاف تلقائياً.
     * @returns {boolean} true إذا تم تسجيل يوم جديد، false إذا كان اليوم مسجلاً مسبقاً
     */
    logChallengeDay(challengeId, userId, minutes = 0, points = 0) {
        try {
            const logDate = new Date().toISOString().split('T')[0];
            this.db.run(`INSERT OR IGNORE INTO challenge_participants (challenge_id, user_id) VALUES (?,?)`, [challengeId, userId]);
            const check = this.db.prepare(`SELECT 1 FROM challenge_daily_logs WHERE challenge_id=? AND user_id=? AND log_date=?`);
            check.bind([challengeId, userId, logDate]);
            if (check.step()) { check.free(); this.save(); return false; }
            check.free();
            this.db.run(
                `INSERT INTO challenge_daily_logs (challenge_id, user_id, log_date, minutes, points) VALUES (?,?,?,?,?)`,
                [challengeId, userId, logDate, minutes, points]
            );
            this.save();
            return true;
        } catch (e) { console.error('❌ logChallengeDay:', e.message); return false; }
    }

    hasChallengeLogToday(challengeId, userId) {
        const today = new Date().toISOString().split('T')[0];
        const s = this.db.prepare(
            `SELECT id FROM challenge_daily_logs
             WHERE challenge_id = ? AND user_id = ? AND log_date = ?`
        );
        s.bind([challengeId, userId, today]);
        const has = s.step();
        s.free();
        return !!has;
    }

    getActiveChallenges() {
        try {
            const s = this.db.prepare(`SELECT * FROM challenges WHERE is_active = 1 ORDER BY created_at DESC`);
            const r = [];
            while (s.step()) r.push(s.getAsObject());
            s.free();
            return r;
        } catch (e) { console.error('❌ getActiveChallenges:', e.message); return []; }
    }

    getChallengeParticipant(challengeId, userId) {
        try {
            const s = this.db.prepare(`
                SELECT 
                    user_id,
                    SUM(minutes) as total_minutes,
                    COUNT(DISTINCT log_date) as days_count,
                    SUM(points) as total_points
                FROM challenge_daily_logs
                WHERE challenge_id = ? AND user_id = ?
                GROUP BY user_id
            `);
            s.bind([challengeId, userId]);
            const r = s.step() ? s.getAsObject() : null;
            s.free();
            return r;
        } catch (e) { console.error('❌ getChallengeParticipant:', e.message); return null; }
    }

    getChallengeByThread(threadId) {
        const s = this.db.prepare(`SELECT * FROM challenges WHERE forum_thread_id = ?`);
        s.bind([threadId]);
        const r = s.step() ? s.getAsObject() : null;
        s.free();
        return r;
    }

    getUserChallengeLogs(challengeId, userId) {
        try {
            const s = this.db.prepare(`SELECT * FROM challenge_daily_logs WHERE challenge_id=? AND user_id=? ORDER BY log_date ASC`);
            s.bind([challengeId, userId]);
            const r = [];
            while (s.step()) r.push(s.getAsObject());
            s.free();
            return r;
        } catch (e) { console.error('❌ getUserChallengeLogs:', e.message); return []; }
    }

    /**
     * ليدربورد التحدي: الأعضاء مرتبون تنازلياً بالنقاط (مع عدد الأيام).
     * @returns {Array<{user_id, name, total_points, days_count}>}
     */
    // ✅ هل سجّل العضو في التحدي النهارده؟
    hasChallengeLog(challengeId, userId, date) {
        try {
            const s = this.db.prepare(`SELECT id FROM challenge_daily_logs WHERE challenge_id=? AND user_id=? AND log_date=? LIMIT 1`);
            s.bind([challengeId, userId, date]);
            const r = s.step();
            s.free();
            return !!r;
        } catch (e) { console.error('❌ hasChallengeLog:', e.message); return false; }
    }

    // ✅ تسجيل يوم في التحدي مع الدقائق والنقاط
    addChallengeLog(challengeId, userId, date, minutes, points) {
        try {
            this.db.run(
                `INSERT OR IGNORE INTO challenge_daily_logs (challenge_id, user_id, log_date, minutes, points) VALUES (?,?,?,?,?)`,
                [challengeId, userId, date, minutes, points]
            );
            // تأكد إن العضو مسجل كمشارك
            this.db.run(
                `INSERT OR IGNORE INTO challenge_participants (challenge_id, user_id) VALUES (?,?)`,
                [challengeId, userId]
            );
            this.save();
        } catch (e) { console.error('❌ addChallengeLog:', e.message); }
    }

    getChallengeLeaderboard(challengeId) {
        try {
            const s = this.db.prepare(`
                SELECT cdl.user_id, u.name,
                       SUM(COALESCE(cdl.points, 0))   as total_points,
                       SUM(COALESCE(cdl.minutes, 0))  as total_minutes,
                       COUNT(cdl.id)                   as days_count
                FROM challenge_daily_logs cdl
                LEFT JOIN users u ON u.user_id = cdl.user_id
                WHERE cdl.challenge_id = ?
                GROUP BY cdl.user_id
                ORDER BY total_points DESC
            `);
            s.bind([challengeId]);
            const r = [];
            while (s.step()) r.push(s.getAsObject());
            s.free();
            return r;
        } catch (e) { console.error('❌ getChallengeLeaderboard:', e.message); return []; }
    }

    getGlobalChallengeLeaderboard() {
        try {
            const s = this.db.prepare(`
                SELECT cdl.user_id, u.name,
                       SUM(COALESCE(cdl.points, 0)) as total_points,
                       COUNT(DISTINCT cdl.challenge_id) as challenges_count
                FROM challenge_daily_logs cdl
                LEFT JOIN users u ON u.user_id = cdl.user_id
                GROUP BY cdl.user_id
                ORDER BY total_points DESC
            `);
            const r = [];
            while (s.step()) r.push(s.getAsObject());
            s.free();
            return r;
        } catch (e) { console.error('❌ getGlobalChallengeLeaderboard:', e.message); return []; }
    }

    /**
     * تقدم العضو في كل التحديات اللي شارك فيها — للواجهات (Bento/Progress).
     * استعلام واحد مع GROUP BY.
     * @returns {Array<{challengeId, title, daysLogged, totalDays, percent, status: 'active'|'ended'}>}
     */
    getMemberChallengesProgress(userId) {
        try {
            const s = this.db.prepare(`
                SELECT c.id AS challenge_id, c.title, c.start_date, c.end_date, COUNT(cdl.log_date) AS days_logged
                FROM challenge_daily_logs cdl
                INNER JOIN challenges c ON c.id = cdl.challenge_id
                WHERE cdl.user_id = ?
                GROUP BY cdl.challenge_id
                ORDER BY c.end_date DESC
            `);
            s.bind([userId]);
            const rows = [];
            while (s.step()) rows.push(s.getAsObject());
            s.free();
            const now = Date.now();
            return rows.map(r => {
                const start = r.start_date ? new Date(r.start_date).getTime() : now;
                const end = r.end_date ? new Date(r.end_date).getTime() : now;
                const totalDays = Math.max(1, Math.ceil((end - start) / 86400000));
                const daysLogged = r.days_logged || 0;
                const percent = totalDays > 0 ? Math.round((daysLogged / totalDays) * 100) : 0;
                const status = end < now ? 'ended' : 'active';
                return {
                    challengeId: r.challenge_id,
                    title: r.title,
                    daysLogged,
                    totalDays,
                    percent,
                    status
                };
            });
        } catch (e) { console.error('❌ getMemberChallengesProgress:', e.message); return []; }
    }

    /**
     * إرجاع قائمة بالـ Timeout التي تحتاج تذكير (كل 24 ساعة تقريباً).
     */
    getOverdueTimeoutReminders() {
        try {
            const s = this.db.prepare(`
                SELECT t.user_id, t.reason, t.warning_count, t.last_reminder_at,
                       u.name
                FROM timeout_pending t
                LEFT JOIN users u ON u.user_id = t.user_id
                WHERE t.status = 'pending'
                  AND (t.last_reminder_at IS NULL OR t.last_reminder_at <= datetime('now','-24 hours'))
            `);
            const r = [];
            while (s.step()) r.push(s.getAsObject());
            s.free();
            return r;
        } catch (e) {
            console.error('❌ getOverdueTimeoutReminders:', e.message);
            return [];
        }
    }

    /**
     * تحديث توقيت آخر تذكير لعضو في قائمة Timeout.
     */
    updateTimeoutReminderTime(userId) {
        try {
            this.db.run(`
                UPDATE timeout_pending
                SET last_reminder_at = CURRENT_TIMESTAMP
                WHERE user_id = ?
            `, [userId]);
            this.save();
        } catch (e) {
            console.error('❌ updateTimeoutReminderTime:', e.message);
        }
    }

    // ==========================================
    // DAILY RESET
    // ==========================================
    dailyReset() {
        const now = new Date();
        const today = now.toISOString().split('T')[0];
        const isMonday = now.getDay() === 1;
        const isFirstDayOfMonth = now.getDate() === 1;
        const users = this.getAllUsers();

        // ✅ تجديد رصيد الـ Streak Freeze في أول يوم من كل شهر لمن انتهى رصيده
        if (isFirstDayOfMonth) {
            this.db.run(`UPDATE users SET streak_freeze = 1 WHERE streak_freeze <= 0`);
        }

        const frozenUsers = [];

        users.forEach(u => {
            const habits = this.getHabits(u.user_id);
            const total = habits.length;
            const completed = habits.filter(h => h.completed).length;
            const rate = total > 0 ? (completed / total) * 100 : 0;

            this.db.run(`
                INSERT OR IGNORE INTO daily_history (user_id, date, total, completed, rate)
                VALUES (?,?,?,?,?)
            `, [u.user_id, today, total, completed, rate]);

            if (total > 0) {
                if (rate >= 50) {
                    const newStreak = (u.days_streak || 0) + 1;
                    this.db.run('UPDATE users SET days_streak=? WHERE user_id=?', [newStreak, u.user_id]);

                    if (newStreak >= 1 && !this.hasAchievement(u.user_id, 'first_day'))
                        this.addAchievement(u.user_id, 'first_day');
                    if (newStreak >= 7 && !this.hasAchievement(u.user_id, 'week_streak'))
                        this.addAchievement(u.user_id, 'week_streak');
                    if (newStreak >= 30 && !this.hasAchievement(u.user_id, 'month_streak'))
                        this.addAchievement(u.user_id, 'month_streak');
                    if (newStreak >= 100 && !this.hasAchievement(u.user_id, 'century_streak'))
                        this.addAchievement(u.user_id, 'century_streak');

                    // رفع إنذار تلقائي بعد 14 يوم التزام متتالي
                    if (newStreak > 0 && newStreak % 14 === 0 && (u.warning_count || 0) > 0) {
                        this.db.run(`UPDATE users SET warning_count=MAX(0,warning_count-1) WHERE user_id=?`, [u.user_id]);
                        console.log(`✅ Auto-removed warning for ${u.name} (${newStreak} day streak)`);
                    }
                } else {
                    // أولاً: تحقق من وجود إجازة يدوية (Freeze) لليوم على مستوى العادات
                    let protectedByFreeze = false;
                    if (this.hasManualFreezeForDate(u.user_id, 'habits', today)) {
                        protectedByFreeze = true;
                    } else {
                        // ثانياً: استخدام إجازة تلقائية من رصيد freeze_habits إن وجد
                        try {
                            const s2 = this.db.prepare('SELECT freeze_habits as balance FROM users WHERE user_id = ?');
                            s2.bind([u.user_id]);
                            const row2 = s2.step() ? s2.getAsObject() : { balance: 0 };
                            s2.free();
                            const balance = row2.balance ?? 0;
                            if (balance > 0 && this.useFreeze(u.user_id, 'habits', false)) {
                                protectedByFreeze = true;
                            }
                        } catch (e) {
                            console.error('❌ auto habits freeze:', e.message);
                        }
                    }

                    if (protectedByFreeze) {
                        // تم إنقاذ الستريك بواسطة الإجازة (اليدوية أو التلقائية)
                        frozenUsers.push(u);
                    } else {
                        // ✅ استخدام Streak Freeze القديم إن وجد بدلاً من كسر الستريك مباشرة
                        const currentFreeze = u.streak_freeze || 0;
                        if (currentFreeze > 0) {
                            this.db.run(
                                `UPDATE users SET streak_freeze = streak_freeze - 1 WHERE user_id = ?`,
                                [u.user_id]
                            );
                            frozenUsers.push(u);
                        } else {
                            this.db.run('UPDATE users SET days_streak=0 WHERE user_id=?', [u.user_id]);
                        }
                    }
                }
            }

            const td = u.total_done || 0;
            if (td >= 100 && !this.hasAchievement(u.user_id, 'century_tasks')) this.addAchievement(u.user_id, 'century_tasks');
            if (td >= 500 && !this.hasAchievement(u.user_id, 'half_k_tasks')) this.addAchievement(u.user_id, 'half_k_tasks');
            if (td >= 1000 && !this.hasAchievement(u.user_id, 'thousand_tasks')) this.addAchievement(u.user_id, 'thousand_tasks');

            if (isMonday) {
                this.db.run('UPDATE users SET daily_review_count=0 WHERE user_id=?', [u.user_id]);
            }
        });

        this.db.run('UPDATE habits SET completed=0');
        this.db.run('UPDATE users SET achieved_today=0');
        this.saveImmediate();
        console.log(`✅ Daily reset done — ${users.length} users processed`);
        return frozenUsers;
    }

    close() {
        if (this.db) { this.saveImmediate(); this.db.close(); }
    }
}

module.exports = MuhawalatDatabase;

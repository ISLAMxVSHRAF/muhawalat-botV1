// ==========================================
// 📊 صيانة واختبار — Slash Commands
// timeout_list, debug_status, db_backup, test_*
// ==========================================

const { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder } = require('discord.js');
const CONFIG = require('../config');

const ERR = CONFIG.ADMIN?.unifiedErrorMessage || '❌ حدث خطأ داخلي، تمت كتابة التفاصيل في السجل.';

const timeoutListData = new SlashCommandBuilder()
    .setName('timeout_list')
    .setDescription('قائمة الـ Timeouts المعلقة')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator);

async function timeoutListExecute(interaction, { db }) {
    try {
        await interaction.deferReply({ ephemeral: true });
        const pending = db.getPendingTimeouts();
        if (!pending.length) {
            return interaction.editReply({ embeds: [new EmbedBuilder().setColor(CONFIG.COLORS.success).setTitle('⏱️ قائمة Timeout المعلقة').setDescription('لا يوجد أي timeout معلق حالياً.').setTimestamp()] });
        }
        const list = pending.slice(0, 15).map((p, i) => {
            const date = new Date(p.notified_at).toLocaleDateString('ar-EG');
            return `${i + 1}. **${p.name || p.user_id}** <@${p.user_id}>\n   الإنذارات: ${p.warning_count}/3 · منذ: ${date}`;
        }).join('\n\n');
        const extra = pending.length > 15 ? `\n_… و ${pending.length - 15} آخرين_` : '';
        const embed = new EmbedBuilder().setColor(CONFIG.COLORS.warning).setTitle('⏱️ قائمة Timeout المعلقة').setDescription(list + extra).setFooter({ text: 'التنفيذ عبر الأزرار في قناة الأدمن' }).setTimestamp();
        await interaction.editReply({ embeds: [embed] });
    } catch (e) {
        console.error('❌ timeout_list:', e);
        await interaction.editReply(ERR).catch(() => {});
    }
}

const debugStatusData = new SlashCommandBuilder()
    .setName('debug_status')
    .setDescription('حالة البوت (أعضاء، uptime، تقارير اليوم)')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator);

async function debugStatusExecute(interaction, { db, client }) {
    try {
        await interaction.deferReply({ ephemeral: true });
        const users = db.getAllUsers();
        const uptime = Math.floor((client.uptime || 0) / 1000);
        const today = new Date().toISOString().split('T')[0];
        const dailyReports = db.getDailyReports(today);
        const base = process.env.WEB_BASE_URL || `http://localhost:${process.env.WEB_PORT || 3000}`;
        const text = `**📊 حالة النظام:**\n• المستخدمين: ${users.length}\n• Uptime: ${Math.floor(uptime / 3600)}h ${Math.floor((uptime % 3600) / 60)}m\n• تقارير اليوم: ${dailyReports.length}/${users.length}\n• الموقع: ${base}\n• البوت: Online ✅`;
        await interaction.editReply(text);
    } catch (e) {
        console.error('❌ debug_status:', e);
        await interaction.editReply(ERR).catch(() => {});
    }
}

const dbBackupData = new SlashCommandBuilder()
    .setName('db_backup')
    .setDescription('نسخة احتياطية من قاعدة البيانات')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator);

async function dbBackupExecute(interaction) {
    try {
        await interaction.deferReply({ ephemeral: true });
        const fs = require('fs');
        const name = `muhawalat.db.backup.${Date.now()}`;
        fs.copyFileSync('muhawalat.db', name);
        await interaction.editReply(`✅ **نسخة احتياطية:** \`${name}\``);
    } catch (e) {
        console.error('❌ db_backup:', e);
        await interaction.editReply(ERR).catch(() => {});
    }
}

function makeTestCommand(name, description, fn) {
    const data = new SlashCommandBuilder()
        .setName(name)
        .setDescription(description)
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator);
    return {
        data,
        async execute(interaction, { db, client, automation }) {
            try {
                await interaction.deferReply({ ephemeral: true });
                await fn(automation);
                await interaction.editReply(`✅ تم تنفيذ **${name}** بنجاح.`);
            } catch (e) {
                console.error(`❌ ${name}:`, e);
                await interaction.editReply(ERR).catch(() => {});
            }
        }
    };
}

const migrateData = new SlashCommandBuilder()
    .setName('migrate_db')
    .setDescription('تحديث قاعدة البيانات (تشغيل مرة واحدة بس)')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator);

async function migrateExecute(interaction, { db }) {
    try {
        await interaction.deferReply({ ephemeral: true });
        const results = [];

        // إزالة UNIQUE من task_completions عشان نسمح باتنين تسجيلات
        try {
            db.db.run(`CREATE TABLE IF NOT EXISTS task_completions_new (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                task_id INTEGER NOT NULL,
                user_id TEXT NOT NULL,
                message_id TEXT,
                content TEXT,
                completed_at TEXT DEFAULT (datetime('now'))
            )`);
            db.db.run(`INSERT OR IGNORE INTO task_completions_new SELECT * FROM task_completions`);
            db.db.run(`DROP TABLE IF EXISTS task_completions`);
            db.db.run(`ALTER TABLE task_completions_new RENAME TO task_completions`);
            db.save();
            results.push('✅ task_completions — تم إزالة UNIQUE');
        } catch (e) {
            results.push(`⚠️ task_completions — ${e.message}`);
        }

        await interaction.editReply(results.join('\n'));
    } catch (e) {
        console.error('❌ migrate_db:', e);
        await interaction.editReply(ERR).catch(() => {});
    }
}

const commands = [
    { data: migrateData, execute: migrateExecute },
    { data: timeoutListData, execute: timeoutListExecute },
    { data: debugStatusData, execute: debugStatusExecute },
    { data: dbBackupData, execute: dbBackupExecute },
    makeTestCommand('test_morning', 'اختبار رسالة الصباح', a => a.morningMessage()),
    makeTestCommand('test_evening', 'اختبار محاسبة المساء', a => a.eveningReflection()),
    makeTestCommand('test_reset', 'اختبار التصفير اليومي', a => a.dailyReset()),
    makeTestCommand('test_weekly', 'اختبار لوحة الشرف', a => a.weeklyLeaderboard()),
    makeTestCommand('test_daily', 'اختبار إنشاء بوست التقرير اليومي', a => a.createDailyPost()),
    makeTestCommand('test_lock_daily', 'اختبار قفل بوست التقرير اليومي', a => a.lockDailyPost()),
    makeTestCommand('test_lock_tasks', 'اختبار قفل المهام المنتهية', a => a.lockTasksCron()),
    makeTestCommand('test_warnings', 'اختبار فحص الإنذارات الأسبوعي', a => a.weeklyWarningCheck()),
    makeTestCommand('test_challenges', 'اختبار فحص التحديات المنتهية', a => a.checkExpiredChallenges()),
    makeTestCommand('test_monthly', 'اختبار تذكير أهداف الشهر', a => a.monthlyGoalReminder())
];

module.exports = { commands };
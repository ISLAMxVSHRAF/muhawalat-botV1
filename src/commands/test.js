const { SlashCommandBuilder } = require('discord.js');
const CONFIG = require('../config');

const ERR = CONFIG.ADMIN?.unifiedErrorMessage || '❌ حدث خطأ داخلي، تمت كتابة التفاصيل في السجل.';

// ==========================================
// makeTestCommand + migrate_db + test_harvest
// (logic moved from maintenance.js and old admin.js)
// ==========================================

function makeTestCommand(name, description, fn) {
    const data = new SlashCommandBuilder()
        .setName(name)
        .setDescription(description);
    return {
        data,
        async execute(interaction, { automation }) {
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

const testCommands = [
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

const migrateData = new SlashCommandBuilder()
    .setName('migrate_db')
    .setDescription('تحديث قاعدة البيانات (تشغيل مرة واحدة بس)');

async function migrateExecute(interaction, { db }) {
    try {
        await interaction.deferReply({ ephemeral: true });
        const results = [];

        try {
            db.db.run(`CREATE TABLE IF NOT EXISTS task_completions_new (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                task_id INTEGER NOT NULL,
                user_id TEXT NOT NULL,
                message_id TEXT,
                content TEXT,
                completed_at TEXT DEFAULT (datetime('now'))
            )`);
            db.db.run(
                `INSERT OR IGNORE INTO task_completions_new SELECT * FROM task_completions`
            );
            db.db.run(`DROP TABLE IF EXISTS task_completions`);
            db.db.run(
                `ALTER TABLE task_completions_new RENAME TO task_completions`
            );
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

async function testHarvestExecute(interaction, { automation }) {
    try {
        await interaction.deferReply({ ephemeral: true });
        if (!automation || typeof automation.weeklyHarvest !== 'function') {
            return interaction.editReply('❌ نظام الأتمتة غير جاهز حالياً.');
        }
        await automation.weeklyHarvest(interaction);
    } catch (e) {
        console.error('❌ test_harvest:', e);
        await interaction.editReply(ERR).catch(() => {});
    }
}

// ==========================================
// Central handler for /admin test group
// ==========================================

async function handleTest(interaction, deps) {
    const sub = interaction.options.getSubcommand();
    if (sub === 'migrate_db') {
        return migrateExecute(interaction, deps);
    }
    if (sub === 'test_harvest') {
        return testHarvestExecute(interaction, deps);
    }

    const cmd = testCommands.find(c => c.data.name === sub);
    if (!cmd) {
        throw new Error(`Unknown test subcommand: ${sub}`);
    }
    return cmd.execute(interaction, deps);
}

module.exports = {
    handleTest
};


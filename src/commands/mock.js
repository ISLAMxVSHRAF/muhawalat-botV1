// ==========================================
// 🧪 MOCK / SANDBOX SYSTEM
// محاكاة بصرية لوظائف البوت — للأدمن فقط
// متصل بقوالب التصميم الأصلية (Embeds)
// ==========================================

const {
    SlashCommandBuilder,
    PermissionFlagsBits,
    EmbedBuilder,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    ChannelType,
    MessageFlags
} = require('discord.js');

// ✅ استدعاء قوالب التصميم الأصلية للبوت عشان الشكل يطلع متطابق 100%
const { createLeaderboardEmbed, createChallengeWinnersEmbed } = require('../utils/embeds');

// ─────────────────────────────────────────
// ⚙️ قنوات الاختبار — عدّلها قبل الاستخدام
// ─────────────────────────────────────────
const TEST_CHANNELS = {
    FORUM: '1475630190263795935',
    TEXT:  '1475711685049188475'
};

// ─────────────────────────────────────────
// 🧑‍🤝‍🧑 بيانات الأعضاء الوهميين
// ─────────────────────────────────────────
const MOCK_USERS = [
    { id: 'mock_001', name: 'أحمد الوهمي',    gender: 'male'   },
    { id: 'mock_002', name: 'منى الوهمية',    gender: 'female' },
    { id: 'mock_003', name: 'خالد المزيف',    gender: 'male'   },
    { id: 'mock_004', name: 'سارة التجريبية', gender: 'female' },
    { id: 'mock_005', name: 'يوسف الاختبار',  gender: 'male'   },
    { id: 'mock_006', name: 'نورا المحاكاة',  gender: 'female' },
    { id: 'mock_007', name: 'عمر الوهمي',     gender: 'male'   },
    { id: 'mock_008', name: 'ليلى التجريب',   gender: 'female' },
    { id: 'mock_009', name: 'فهد الاختبار',   gender: 'male'   },
    { id: 'mock_010', name: 'هدى المزيفة',    gender: 'female' }
];

// ─────────────────────────────────────────
// 🛠️ دوال مساعدة
// ─────────────────────────────────────────

function rand(min, max) {
    return Math.floor(Math.random() * (max - min + 1)) + min;
}

/**
 * يضمن وجود الأعضاء الوهميين باستخدام دوال البوت الآمنة
 */
function ensureMockUsers(db) {
    for (const u of MOCK_USERS) {
        if (!db.getUser(u.id)) {
            try {
                db.createUser(u.id, u.name, 'هدف تجريبي 🧪', u.gender, `mock_thread_${u.id}`, 'هدف تجريبي 🧪');
            } catch (e) {
                console.warn('⚠️ Could not create mock user:', e.message);
            }
        }
    }
}

/**
 * جلب الأعضاء الوهميين
 */
function getMockUsers(db, limit = MOCK_USERS.length) {
    try {
        return db.db.prepare(
            `SELECT * FROM users WHERE user_id LIKE 'mock_%' LIMIT ?`
        ).all(limit);
    } catch (e) {
        return MOCK_USERS.slice(0, limit).map(u => ({ user_id: u.id, name: u.name, gender: u.gender }));
    }
}

// ─────────────────────────────────────────
// 📦 تعريف الأمر
// ─────────────────────────────────────────

const data = new SlashCommandBuilder()
    .setName('mock')
    .setDescription('🧪 محاكاة بصرية لوظائف البوت (مربوطة بالتصميم الأصلي)')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addSubcommand(sub =>
        sub.setName('challenge')
           .setDescription('محاكاة تحدي كامل مع أعضاء وهميين')
    )
    .addSubcommand(sub =>
        sub.setName('warnings')
           .setDescription('محاكاة نظام الإنذارات وتقرير الإدارة')
    )
    .addSubcommand(sub =>
        sub.setName('leaderboard')
           .setDescription('محاكاة لوحة الشرف الأسبوعية بالتصميم الأصلي')
    )
    .addSubcommand(sub =>
        sub.setName('tasks')
           .setDescription('محاكاة المهام المجتمعية والرسائل التحذيرية')
    )
    .addSubcommand(sub =>
        sub.setName('clear')
           .setDescription('مسح جميع البيانات الوهمية من قاعدة البيانات')
    );

// ─────────────────────────────────────────
// 🚀 المعالج الرئيسي
// ─────────────────────────────────────────

async function execute(interaction, { db, client }) {
    if (!interaction.memberPermissions.has(PermissionFlagsBits.Administrator)) {
        return interaction.reply({ content: '🚫 هذا الأمر للأدمن فقط.', flags: MessageFlags.Ephemeral });
    }

    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    const sub = interaction.options.getSubcommand();

    try {
        switch (sub) {
            case 'challenge':   await mockChallenge(interaction, db, client);   break;
            case 'warnings':    await mockWarnings(interaction, db, client);    break;
            case 'leaderboard': await mockLeaderboard(interaction, db, client); break;
            case 'tasks':       await mockTasks(interaction, db, client);       break;
            case 'clear':       await mockClear(interaction, db);               break;
            default:
                await interaction.editReply('❓ أمر غير معروف.');
        }
    } catch (e) {
        console.error(`❌ /mock ${sub} error:`, e);
        await interaction.editReply(`❌ حصل خطأ أثناء المحاكاة:\n\`\`\`${e.message}\`\`\``);
    }
}

// ─────────────────────────────────────────
// 1️⃣  /mock challenge
// ─────────────────────────────────────────

async function mockChallenge(interaction, db, client) {
    ensureMockUsers(db);
    const users = getMockUsers(db);

    const challengeTitle  = `تحدي وهمي 🧪 — ${new Date().toLocaleDateString('ar-EG')}`;
    const challengeDesc   = 'هذا تحدي تجريبي لاختبار عرض النظام بصرياً.';
    const endDate         = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

    // الإرسال البصري ─ Forum Post
    let forumPostUrl = '(لم يتم إنشاء بوست — تحقق من TEST_CHANNELS.FORUM)';
    if (TEST_CHANNELS.FORUM !== 'ضع_ايدي_الفورم_هنا') {
        try {
            const forum = await client.channels.fetch(TEST_CHANNELS.FORUM).catch(() => null);
            if (forum && forum.type === ChannelType.GuildForum) {
                const post = await forum.threads.create({
                    name: `🏆 ${challengeTitle}`,
                    message: {
                        content: [
                            `## 🏆 ${challengeTitle}`,
                            `> ${challengeDesc}`,
                            ``,
                            `📅 **تاريخ الانتهاء:** ${endDate}`,
                            `👥 **عدد المشاركين:** ${users.length}`,
                            ``,
                            `*هذا بوست تجريبي — /mock challenge*`
                        ].join('\n')
                    }
                });
                forumPostUrl = post.url;
            }
        } catch (e) {
            console.warn('⚠️ Forum post skipped:', e.message);
        }
    }

    // تجهيز بيانات وهمية متوافقة مع دالة التصميم الأصلية
    const challengeObj = { title: challengeTitle };
    const top3 = users.slice(0, 3).map(u => ({
        name: u.name,
        total_points: rand(100, 300),
        days_count: rand(3, 7)
    })).sort((a, b) => b.total_points - a.total_points);

    // ✅ استخدام قالب التصميم الأصلي
    const challengeEmbed = createChallengeWinnersEmbed(challengeObj, top3);

    if (TEST_CHANNELS.TEXT !== 'ضع_ايدي_الشات_هنا') {
        try {
            const textCh = await client.channels.fetch(TEST_CHANNELS.TEXT).catch(() => null);
            if (textCh) await textCh.send({ embeds: [challengeEmbed] });
        } catch (e) {
            console.warn('⚠️ Text channel send skipped:', e.message);
        }
    }

    await interaction.editReply([
        `✅ **محاكاة التحدي اكتملت!**`,
        `📌 Forum Post: ${forumPostUrl}`,
        `📊 Embed الأوائل (بالتصميم الأصلي): تم إرساله لـ \`TEST_CHANNELS.TEXT\``
    ].join('\n'));
}

// ─────────────────────────────────────────
// 2️⃣  /mock warnings
// ─────────────────────────────────────────

async function mockWarnings(interaction, db, client) {
    ensureMockUsers(db);
    const users = getMockUsers(db, 5);

    const warningCounts = [1, 1, 2, 3, 3];
    const reasons = [
        'لم يكمل 5 من 7 تقارير أسبوعية (عمل 3/7)',
        'لم يكمل 5 من 7 تقارير أسبوعية (عمل 2/7)',
        'تكرار غياب عن المهام الأسبوعية',
        'لم يكمل 5 من 7 تقارير أسبوعية (عمل 1/7)',
        'غياب متكرر + عدم إكمال المهام الشهرية'
    ];

    if (TEST_CHANNELS.TEXT === 'ضع_ايدي_الشات_هنا') {
        return interaction.editReply('⚠️ يرجى تعيين `TEST_CHANNELS.TEXT` أولاً.');
    }

    const textCh = await client.channels.fetch(TEST_CHANNELS.TEXT).catch(() => null);
    if (!textCh) return interaction.editReply('❌ قناة TEXT غير موجودة.');

    const reportEmbed = new EmbedBuilder()
        .setColor(0xe74c3c)
        .setTitle('⚠️ تقرير الإنذارات — نظرة عامة')
        .setDescription(
            users.map((u, i) =>
                `${warningCounts[i] >= 3 ? '🚨' : warningCounts[i] >= 2 ? '⚠️' : '📌'} **${u.name}** — ${warningCounts[i]}/3 إنذار\n   └─ _${reasons[i]}_`
            ).join('\n\n')
        )
        .setFooter({ text: '🧪 محاكاة — /mock warnings' })
        .setTimestamp();

    await textCh.send({ embeds: [reportEmbed] });

    const timeoutUsers = users.filter((_, i) => warningCounts[i] >= 3);
    for (let i = 0; i < timeoutUsers.length; i++) {
        const u = timeoutUsers[i];
        const idx = users.indexOf(u);

        const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setCustomId(`timeout_approve_${u.user_id}`)
                .setLabel('تنفيذ Timeout ⏱️')
                .setStyle(ButtonStyle.Danger),
            new ButtonBuilder()
                .setCustomId(`timeout_dismiss_${u.user_id}`)
                .setLabel('تجاهل ✋')
                .setStyle(ButtonStyle.Secondary)
        );

        await textCh.send({
            content: [
                `🚨 **إشعار Timeout — ${u.name}**`,
                ``,
                `**العضو:** ${u.name} (\`${u.user_id}\`)`,
                `**عدد الإنذارات:** 3/3`,
                ``,
                `**أسباب الإنذارات:**`,
                `• ${reasons[idx]}`,
                `• تكرار المخالفة بعد الإنذار الأول`,
                ``,
                `اختر الإجراء المناسب:`
            ].join('\n'),
            components: [row]
        });
    }

    await interaction.editReply('✅ **تمت محاكاة تقرير الإنذارات وإرساله للقناة المحددة.**');
}

// ─────────────────────────────────────────
// 3️⃣  /mock leaderboard
// ─────────────────────────────────────────

async function mockLeaderboard(interaction, db, client) {
    ensureMockUsers(db);
    const users = getMockUsers(db);

    // تجهيز بيانات وهمية متوافقة مع دالة التصميم الأصلية
    const leaders = users.map(u => ({
        user_id: u.user_id,
        name: u.name,
        days_streak: rand(5, 30),
        avg_rate: rand(70, 100)
    })).sort((a, b) => b.avg_rate - a.avg_rate).slice(0, 10);

    const weekNumber = Math.ceil((new Date() - new Date(new Date().getFullYear(), 0, 1)) / (86400000 * 7));

    // ✅ استخدام قالب التصميم الأصلي من ملف البوت
    const embed = createLeaderboardEmbed(leaders, weekNumber);

    if (TEST_CHANNELS.TEXT === 'ضع_ايدي_الشات_هنا') {
        return interaction.editReply('⚠️ يرجى تعيين `TEST_CHANNELS.TEXT` أولاً.');
    }

    const textCh = await client.channels.fetch(TEST_CHANNELS.TEXT).catch(() => null);
    if (!textCh) return interaction.editReply('❌ قناة TEXT غير موجودة.');

    await textCh.send({ embeds: [embed] });

    await interaction.editReply([
        `✅ **محاكاة لوحة الشرف اكتملت!**`,
        `📊 تم طباعة التصميم الأصلي بالبيانات الوهمية في قناة الـ TEXT.`
    ].join('\n'));
}

// ─────────────────────────────────────────
// 4️⃣  /mock tasks
// ─────────────────────────────────────────

async function mockTasks(interaction, db, client) {
    ensureMockUsers(db);
    const users = getMockUsers(db);
    const taskTitle = `مهمة وهمية 🧪 — ${new Date().toLocaleDateString('ar-EG')}`;

    const completed = users.slice(0, Math.floor(users.length / 2));
    const missed    = users.slice(Math.floor(users.length / 2));

    if (TEST_CHANNELS.TEXT === 'ضع_ايدي_الشات_هنا') {
        return interaction.editReply('⚠️ يرجى تعيين `TEST_CHANNELS.TEXT` أولاً.');
    }

    const textCh = await client.channels.fetch(TEST_CHANNELS.TEXT).catch(() => null);
    if (!textCh) return interaction.editReply('❌ قناة TEXT غير موجودة.');

    const taskAnnounceEmbed = new EmbedBuilder()
        .setColor(0x3498db)
        .setTitle('📋 مهمة مجتمعية — انتهى الوقت')
        .setDescription([
            `**المهمة:** ${taskTitle}`,
            `**النوع:** أسبوعية`,
            ``,
            `✅ **أكملوا المهمة (${completed.length}):**`,
            completed.map(u => `• ${u.name}`).join('\n') || '—',
            ``,
            `❌ **لم يكملوا المهمة (${missed.length}):**`,
            missed.map(u => `• ${u.name}`).join('\n') || '—'
        ].join('\n'))
        .setFooter({ text: '🧪 محاكاة — /mock tasks' })
        .setTimestamp();

    await textCh.send({ embeds: [taskAnnounceEmbed] });

    for (const u of missed) {
        await textCh.send(
            `> ⏰ **[محاكاة رسالة Thread]**\n` +
            `> \`${u.name}\` (**${u.user_id}**)\n` +
            `> انتهى وقت المهمة الأسبوعية: **"${taskTitle}"**\n` +
            `> لم يتم تسجيل إتمامك لها. 📌`
        );
    }

    await interaction.editReply('✅ **محاكاة المهام والرسائل التحذيرية اكتملت.**');
}

// ─────────────────────────────────────────
// 5️⃣  /mock clear
// ─────────────────────────────────────────

async function mockClear(interaction, db) {
    const tables = [
        { table: 'users', col: 'user_id' },
        { table: 'habits', col: 'user_id' },
        { table: 'reports', col: 'user_id' },
        { table: 'goals', col: 'user_id' }
    ];

    const results = [];
    for (const { table, col } of tables) {
        try {
            const stmt = db.db.prepare(`DELETE FROM ${table} WHERE ${col} LIKE 'mock_%'`);
            const info = stmt.run();
            if (info.changes > 0) results.push(`🗑️ \`${table}\`: حُذف **${info.changes}** سجل`);
        } catch (e) {}
    }

    const summary = results.length > 0 ? results.join('\n') : '✨ لا توجد بيانات وهمية لحذفها.';
    await interaction.editReply(`🧹 **تنظيف البيانات الوهمية اكتمل!**\n\n${summary}`);
}

module.exports = { data, execute };
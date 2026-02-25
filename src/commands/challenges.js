// ==========================================
// 🏆 CHALLENGES — Slash Commands
// /challenge_create, /challenge_stats, /challenge_end
// ==========================================

const { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const CONFIG = require('../config');

const ERR = CONFIG.ADMIN?.unifiedErrorMessage || '❌ حدث خطأ داخلي.';

// ==========================================
// 📊 بناء الشارت (الأعمدة الثلاثة)
// ==========================================
function buildChart(top3, challenge) {
    const MAX_ROWS   = 7; // 🥇
    const ROWS = [7, 6, 5];
    const COLORS = ['🟨', '🟦', '🟫'];
    const MEDALS = ['🥇', '🥈', '🥉'];
    const EMPTY  = '⬜';

    // كل عضو — عدد الأيام اللي سجل فيها = عدد الصفوف الملية
    const columns = top3.map((p, i) => {
        const maxRows  = ROWS[i];
        const filled   = Math.min(p.days_count || 0, maxRows);
        const empty    = maxRows - filled;
        const color    = COLORS[i];
        const medal    = MEDALS[i];

        const rows = [];
        // صفوف فاضية فوق (لو مش وصل للـ max)
        for (let r = 0; r < MAX_ROWS - maxRows; r++) rows.push(EMPTY + EMPTY + EMPTY);
        // صف الميدالية
        if (empty > 0) {
            rows.push(EMPTY + medal + EMPTY);
            for (let r = 1; r < empty; r++) rows.push(EMPTY + EMPTY + EMPTY);
        } else {
            rows.push(color + medal + color);
        }
        // صفوف ملية (ناقص صف الميدالية لو اتحسب)
        const filledRows = empty > 0 ? filled : filled - 1;
        for (let r = 0; r < filledRows; r++) rows.push(color + color + color);

        return { rows, name: p.name || `<@${p.user_id}>`, minutes: p.total_minutes || 0, days: p.days_count || 0 };
    });

    // لو عضو واحد بس
    if (columns.length === 1) {
        const c = columns[0];
        let chart = `**${c.name}**\n👑\n`;
        chart += c.rows.join('\n') + '\n';
        chart += `**${c.minutes} min**`;
        return chart;
    }

    // لو اتنين
    if (columns.length === 2) {
        // التاني على الشمال، الأول في المنتصف
        const [first, second] = columns;
        let lines = [];
        // اسم الأول في المنتصف
        lines.push(`              **${first.name}**`);
        lines.push(`                  👑`);
        for (let r = 0; r < MAX_ROWS; r++) {
            const l = second.rows[r] || EMPTY + EMPTY + EMPTY;
            const m = first.rows[r]  || EMPTY + EMPTY + EMPTY;
            lines.push(`${l}     ${m}`);
        }
        lines.push(`${second.minutes} min      ${first.minutes} min`);
        lines.push(`**${second.name}**      **${first.name}**`);
        return lines.join('\n');
    }

    // الثلاثة — التاني يسار، الأول وسط، التالت يمين
    const [first, second, third] = columns;
    let lines = [];
    lines.push(`              **${first.name}**`);
    lines.push(`                  👑`);
    for (let r = 0; r < MAX_ROWS; r++) {
        const l = second.rows[r] || EMPTY + EMPTY + EMPTY;
        const m = first.rows[r]  || EMPTY + EMPTY + EMPTY;
        const ri = third.rows[r] || EMPTY + EMPTY + EMPTY;
        lines.push(`${l}     ${m}     ${ri}`);
    }
    lines.push(`${second.minutes} min     ${first.minutes} min     ${third.minutes} min`);
    lines.push(`**${second.name}**     **${first.name}**     **${third.name}**`);
    return lines.join('\n');
}

// ==========================================
// 📋 بناء الليدربورد الكاملة (embed مع صفحات)
// ==========================================
function buildLeaderboardPages(leaderboard, challenge) {
    const MEDALS = ['🥇', '🥈', '🥉'];
    const PER_PAGE = 15;
    const pages = [];

    for (let i = 0; i < leaderboard.length; i += PER_PAGE) {
        const slice = leaderboard.slice(i, i + PER_PAGE);
        const desc = slice.map((p, j) => {
            const rank  = i + j + 1;
            const medal = MEDALS[rank - 1] || `${rank}.`;
            return `${medal} <@${p.user_id}> — ${p.total_minutes || 0} دقيقة — ${p.days_count || 0} أيام`;
        }).join('\n');

        pages.push(
            new EmbedBuilder()
                .setColor(CONFIG.COLORS.primary)
                .setTitle(`🏆 ليدربورد — ${challenge.title}`)
                .setDescription(desc || '—')
                .setFooter({ text: `${leaderboard.length} مشارك | صفحة ${Math.floor(i / PER_PAGE) + 1} من ${Math.ceil(leaderboard.length / PER_PAGE)}` })
        );
    }

    return pages.length ? pages : [
        new EmbedBuilder()
            .setColor(CONFIG.COLORS.primary)
            .setTitle(`🏆 ليدربورد — ${challenge.title}`)
            .setDescription('لا يوجد مشاركون بعد.')
    ];
}

function getLeaderboardRow(page, total, challengeId) {
    if (total <= 1) return null;
    return new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId(`clb_prev_${challengeId}_${page}`)
            .setLabel('◀ السابق')
            .setStyle(ButtonStyle.Secondary)
            .setDisabled(page === 0),
        new ButtonBuilder()
            .setCustomId(`clb_page_${challengeId}_${page}`)
            .setLabel(`${page + 1} / ${total}`)
            .setStyle(ButtonStyle.Primary)
            .setDisabled(true),
        new ButtonBuilder()
            .setCustomId(`clb_next_${challengeId}_${page}`)
            .setLabel('التالي ▶')
            .setStyle(ButtonStyle.Secondary)
            .setDisabled(page === total - 1)
    );
}

// ==========================================
// 🏆 /challenge_create
// ==========================================
const challengeCreateData = new SlashCommandBuilder()
    .setName('challenge_create')
    .setDescription('إنشاء تحدي جديد')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addStringOption(o => o.setName('title').setDescription('اسم التحدي (عنوان البوست)').setRequired(true))
    .addStringOption(o => o.setName('content').setDescription('تفاصيل ومحتوى التحدي').setRequired(true))
    .addIntegerOption(o => o.setName('duration').setDescription('المدة بالأيام').setRequired(true))
    .addIntegerOption(o => o.setName('challenge_time').setDescription('وقت التحدي بالدقائق').setRequired(true))
    .addIntegerOption(o => o.setName('min_minutes').setDescription('الحد الأدنى المقبول بالدقائق').setRequired(true))
    .addIntegerOption(o => o.setName('bonus_minutes').setDescription('أقصى دقائق بونص فوق وقت التحدي').setRequired(true))
    .addStringOption(o => o.setName('image').setDescription('رابط صورة (اختياري)'));

async function challengeCreateExecute(interaction, { db, client }) {
    try {
        await interaction.deferReply({ ephemeral: true });

        const forumId = process.env.CHALLENGES_FORUM_ID;
        if (!forumId) return interaction.editReply('❌ CHALLENGES_FORUM_ID مش موجود في .env');

        const forumChannel = await client.channels.fetch(forumId).catch(() => null);
        if (!forumChannel) return interaction.editReply('❌ مش قادر أجيب قناة التحديات.');

        const title         = interaction.options.getString('title').trim();
        const content       = interaction.options.getString('content').trim();
        const duration      = interaction.options.getInteger('duration');
        const challengeTime = interaction.options.getInteger('challenge_time');
        const minMinutes    = interaction.options.getInteger('min_minutes');
        const bonusMinutes  = interaction.options.getInteger('bonus_minutes');
        const imageUrl      = interaction.options.getString('image')?.trim() || null;

        const startDate = new Date();
        const endDate   = new Date(startDate);
        endDate.setDate(endDate.getDate() + duration);
        const startStr  = startDate.toISOString().split('T')[0];
        const endStr    = endDate.toISOString().split('T')[0];

        // بناء محتوى رسالة البوست
        const postContent = imageUrl
            ? { content, files: [], embeds: [new EmbedBuilder().setImage(imageUrl)] }
            : { content };

        const thread = await forumChannel.threads.create({
            name: `🏆 ${title}`,
            message: postContent
        });

        // رسالة الشارت (فاضية في البداية)
        const chartMsg = await thread.send('📊 **ليدربورد التحدي**\n_لم يسجل أحد بعد_');

        const challengeId = db.createChallenge({
            title,
            description: content,
            image_url: imageUrl,
            keyword: null, // مش بنستخدمه — بنعتمد على ✅
            forum_thread_id: thread.id,
            chart_message_id: chartMsg.id,
            start_date: startStr,
            end_date: endStr,
            created_by: interaction.user.id,
            min_minutes: minMinutes,
            max_minutes: challengeTime + bonusMinutes,
            challenge_time: challengeTime,
            bonus_minutes: bonusMinutes
        });

        if (!challengeId) return interaction.editReply('❌ فشل حفظ التحدي.');

        await interaction.editReply(
            `✅ **تم إنشاء التحدي** (ID: \`${challengeId}\`)\n\n` +
            `📌 **${title}**\n` +
            `📅 من ${startStr} إلى ${endStr} (${duration} أيام)\n` +
            `⏱️ وقت التحدي: ${challengeTime} دقيقة | حد أدنى: ${minMinutes} د | بونص: +${bonusMinutes} د\n\n` +
            `Thread: <#${thread.id}>`
        );
    } catch (e) {
        console.error('❌ challenge_create:', e);
        await interaction.editReply(ERR).catch(() => {});
    }
}

// ==========================================
// 🏆 /challenge_stats
// ==========================================
const challengeStatsData = new SlashCommandBuilder()
    .setName('challenge_stats')
    .setDescription('إحصائيات تحدي مع الليدربورد الكاملة')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addIntegerOption(o => o.setName('id').setDescription('معرف التحدي').setRequired(true));

async function challengeStatsExecute(interaction, { db }) {
    try {
        await interaction.deferReply({ ephemeral: true });
        const id        = interaction.options.getInteger('id');
        const challenge = db.getChallenge(id);
        if (!challenge) return interaction.editReply('❌ تحدي غير موجود.');

        const leaderboard = db.getChallengeLeaderboard(id);
        const now         = new Date();
        const end         = challenge.end_date ? new Date(challenge.end_date) : null;
        const daysLeft    = end ? Math.max(0, Math.ceil((end - now) / (24 * 60 * 60 * 1000))) : '—';

        const pages = buildLeaderboardPages(leaderboard, challenge);
        const row   = getLeaderboardRow(0, pages.length, id);
        const components = row ? [row] : [];

        const statsEmbed = new EmbedBuilder()
            .setColor(CONFIG.COLORS.primary)
            .setTitle(`📊 ${challenge.title}`)
            .addFields(
                { name: '👥 المشاركون', value: String(leaderboard.length), inline: true },
                { name: '⏳ متبقي', value: `${daysLeft} يوم`, inline: true },
                { name: '⏱️ وقت التحدي', value: `${challenge.challenge_time || challenge.max_minutes} دقيقة`, inline: true }
            );

        await interaction.editReply({ embeds: [statsEmbed, pages[0]], components });
    } catch (e) {
        console.error('❌ challenge_stats:', e);
        await interaction.editReply(ERR).catch(() => {});
    }
}

// ==========================================
// 🏁 /challenge_end
// ==========================================
const challengeEndData = new SlashCommandBuilder()
    .setName('challenge_end')
    .setDescription('إنهاء تحدي وإعلان الفائزين')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addIntegerOption(o => o.setName('id').setDescription('معرف التحدي').setRequired(true));

async function challengeEndExecute(interaction, { db, client }) {
    await interaction.deferReply({ ephemeral: true });
    try {
        const id        = interaction.options.getInteger('id');
        const challenge = db.getChallenge(id);
        if (!challenge) return interaction.editReply('❌ تحدي غير موجود.');

        await announceChallengeEnd(challenge, db, client);

        db.updateChallengeStatus(id, false);
        await interaction.editReply('✅ تم إنهاء التحدي وإعلان الفائزين.');
    } catch (e) {
        console.error('❌ challenge_end:', e);
        await interaction.editReply(ERR).catch(() => {});
    }
}

// ==========================================
// 📢 إعلان نهاية التحدي (يستخدمه challenge_end + automation)
// ==========================================
async function announceChallengeEnd(challenge, db, client) {
    const leaderboard = db.getChallengeLeaderboard(challenge.id);
    const top3        = leaderboard.slice(0, 3);
    const MEDALS      = ['🥇', '🥈', '🥉'];

    // إضافة إنجازات
    for (let i = 0; i < top3.length; i++) {
        db.addAchievement(top3[i].user_id, `challenge_${challenge.id}_rank_${i + 1}`);
    }

    // قناة المتفوقين
    const achieveId = process.env.LEADERBOARD_CHANNEL_ID;
    const memberRoleId = process.env.MEMBER_ROLE_ID;

    if (achieveId) {
        const achieveCh = await client.channels.fetch(achieveId).catch(() => null);
        if (achieveCh) {
            // بناء الـ embed
            const embed = new EmbedBuilder()
                .setColor(CONFIG.COLORS.primary)
                .setTitle(`🏆 ${challenge.title}`)
                .setDescription(
                    top3.map((w, i) =>
                        `${MEDALS[i]} <@${w.user_id}> — ${w.total_minutes || 0} دقيقة — ${w.days_count || 0} أيام`
                    ).join('\n') || 'لم يشارك أحد.'
                )
                .setTimestamp();

            // ثامبنيل الفائز الأول
            if (top3[0]) {
                try {
                    const guild  = achieveCh.guild;
                    const member = await guild.members.fetch(top3[0].user_id).catch(() => null);
                    if (member) embed.setThumbnail(member.user.displayAvatarURL({ size: 256 }));
                } catch {}
            }

            const mention = memberRoleId ? `<@&${memberRoleId}>` : '';
            await achieveCh.send({
                content: `${mention}\n🏆 **تحدي "${challenge.title}" خلص! ودول أول 3** 🎉`,
                embeds: [embed]
            });
        }
    }

    // قفل البوست
    if (challenge.forum_thread_id) {
        const thread = await client.channels.fetch(challenge.forum_thread_id).catch(() => null);
        if (thread) {
            await thread.setLocked(true).catch(() => {});
            await thread.setArchived(true).catch(() => {});
        }
    }
}

// ==========================================
// 🔘 HANDLE LEADERBOARD BUTTON
// ==========================================
async function handleChallengeLeaderboardButton(interaction, db) {
    try {
        const parts       = interaction.customId.split('_');
        const challengeId = parseInt(parts[2]);
        let page          = parseInt(parts[3]);

        if (interaction.customId.startsWith('clb_next_')) page++;
        if (interaction.customId.startsWith('clb_prev_')) page--;

        const challenge   = db.getChallenge(challengeId);
        const leaderboard = db.getChallengeLeaderboard(challengeId);
        const pages       = buildLeaderboardPages(leaderboard, challenge);

        page = Math.max(0, Math.min(page, pages.length - 1));
        const row = getLeaderboardRow(page, pages.length, challengeId);

        await interaction.update({ embeds: [pages[page]], components: row ? [row] : [] });
    } catch (e) {
        console.error('❌ challenge leaderboard button:', e);
    }
}

// ==========================================
// ✅ تسجيل العضو (يستدعيه index.js)
// ==========================================
async function handleChallengeMessage(message, challenge, db) {
    try {
        const userId  = message.author.id;
        const content = message.content;

        // تجاهل رسائل البوت
        if (message.author.bot) return;

        // لازم يكون فيها ✅
        if (!content.includes('✅')) return;

        // استخراج الرقم
        const numMatch = content.match(/\b(\d+)\b/);
        if (!numMatch) {
            return message.reply({
                content: '❌ مش لاقي الوقت في رسالتك!\nامسح الرسالة وسجل تاني واكتب الوقت بالدقائق مثلاً:\n`تم ✅ - 30 دقيقة`',
                ephemeral: false
            }).then(m => setTimeout(() => m.delete().catch(() => {}), 10000));
        }

        const minutes     = parseInt(numMatch[1]);
        const minMinutes  = challenge.min_minutes  || 0;
        const challengeTime = challenge.challenge_time || challenge.max_minutes || 0;
        const bonusMinutes  = challenge.bonus_minutes || 0;
        const maxAllowed    = challengeTime + bonusMinutes;

        // أقل من الحد الأدنى
        if (minutes < minMinutes) {
            const remaining = minMinutes - minutes;
            return message.reply({
                content: `⏱️ الوقت أقل من المطلوب!\nفاضلك **${remaining} دقيقة** كمّل وتعالى سجل تاني 💪`,
            }).then(m => setTimeout(() => m.delete().catch(() => {}), 10000));
        }

        // أكتر من الحد الأقصى
        if (minutes > maxAllowed) {
            return message.reply({
                content: `❌ الرقم أكبر من الحد الأقصى للتحدي (${maxAllowed} دقيقة)!\nعيد التسجيل بالوقت الصح.`,
            }).then(m => setTimeout(() => m.delete().catch(() => {}), 10000));
        }

        // سجّل قبل كده النهارده؟
        const today    = new Date().toISOString().split('T')[0];
        const alreadyLogged = db.hasChallengeLog(challenge.id, userId, today);
        if (alreadyLogged) {
            return message.reply({
                content: '✅ سجلت النهارده بالفعل! تعالى بكرة 😊',
            }).then(m => setTimeout(() => m.delete().catch(() => {}), 8000));
        }

        // احسب النقاط
        const points = minutes <= challengeTime
            ? minutes
            : challengeTime + Math.floor((minutes - challengeTime) / 5);

        // سجّل في الداتابيز
        db.addChallengeLog(challenge.id, userId, today, minutes, points);

        // ريأكت 👏
        await message.react('👏').catch(() => {});

        // رد ephemeral
        await message.reply({
            content: `✅ تم تسجيلك النهارده في التحدي!`,
        }).then(m => setTimeout(() => m.delete().catch(() => {}), 8000));

        // تحديث الشارت لو الترتيب اتغير
        await updateChallengeChart(challenge, db, message.channel.client);

        // تحديث داشبورد العضو — قسم تحدياتي
        const user = db.getUser(userId);
        if (user?.thread_id) {
            try {
                const { updateDashboard } = require('./dashboard');
                const userThread = await message.channel.client.channels.fetch(user.thread_id).catch(() => null);
                if (userThread) await updateDashboard(userThread, userId, db, 'challenges');
            } catch (_) {}
        }

    } catch (e) {
        console.error('❌ handleChallengeMessage:', e);
    }
}

// ==========================================
// 📊 تحديث الشارت في البوست
// ==========================================
async function updateChallengeChart(challenge, db, client) {
    try {
        if (!challenge.chart_message_id || !challenge.forum_thread_id) return;

        const leaderboard = db.getChallengeLeaderboard(challenge.id);
        const top3        = leaderboard.slice(0, 3);
        if (!top3.length) return;

        const thread = await client.channels.fetch(challenge.forum_thread_id).catch(() => null);
        if (!thread) return;

        const chartMsg = await thread.messages.fetch(challenge.chart_message_id).catch(() => null);
        if (!chartMsg) return;

        const chart = buildChart(top3, challenge);
        await chartMsg.edit(`📊 **ليدربورد التحدي**\n\n${chart}`);
    } catch (e) {
        console.error('❌ updateChallengeChart:', e);
    }
}

const commands = [
    { data: challengeCreateData, execute: challengeCreateExecute },
    { data: challengeStatsData,  execute: challengeStatsExecute  },
    { data: challengeEndData,    execute: challengeEndExecute    }
];

module.exports = {
    commands,
    handleChallengeMessage,
    handleChallengeLeaderboardButton,
    announceChallengeEnd,
    updateChallengeChart
};

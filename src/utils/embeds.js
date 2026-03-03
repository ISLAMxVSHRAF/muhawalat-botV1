// ==========================================
// 🎨 EMBED BUILDERS
// دوال لإنشاء Embeds جاهزة
// ==========================================

const { EmbedBuilder, ButtonBuilder, ButtonStyle, ActionRowBuilder } = require('discord.js');
const CONFIG = require('../config');
const { generateWeeklyGraph, getRankInfo } = require('./dashboard');

// ==========================================
// 📊 STATS EMBED - إحصائيات المستخدم
// ✅ FIX: إضافة db كمعامل رابع لعرض حالة الإنذارات
// ==========================================
function createStatsEmbed(user, analytics, interaction, db) {
    const { getRandomQuote } = require('./quotes');
    if (!user || !analytics) return new EmbedBuilder().setColor(CONFIG.COLORS?.primary || 0x2ecc71).setTitle('👤 البطاقة').setDescription('لا تتوفر بيانات.');
    const totalHabits = analytics.totalHabits ?? 0;
    const completedToday = analytics.completedToday ?? 0;
    const currentRate = totalHabits > 0 ? Math.round((completedToday / totalHabits) * 100) : 0;
    const graph = generateWeeklyGraph(analytics.weeklyReport || [], currentRate);
    const rank = getRankInfo(user.days_streak || 0);
    const isFemale = user.gender === 'female';
    const randomQuote = getRandomQuote(isFemale);

    const embed = new EmbedBuilder()
        .setColor(CONFIG.COLORS?.primary || 0x2ecc71)
        .setTitle(`👤 ${user.name || 'عضو'}`)
        .setDescription(`
**📊 تقرير الأداء الأسبوعي**
> ${randomQuote}

\`\`\`yaml
${graph}
\`\`\`
        `)
        .addFields(
            { name: '💎 الرتبة', value: `**${rank.name} ${rank.emoji}**`, inline: true },
            { name: '📈 الإجمالي', value: `**${user.total_done || 0} عادة**`, inline: true },
            { name: '🔥 الستريك', value: `**${user.days_streak || 0} يوم**`, inline: true },
            { name: '⚠️ الإنذارات', value: `**${user.warning_count || 0}/3**`, inline: true }
        );
    if (interaction?.user?.displayAvatarURL) embed.setThumbnail(interaction.user.displayAvatarURL());
    const footerText = (CONFIG.ACHIEVERS_MESSAGE && CONFIG.ACHIEVERS_MESSAGE.footer) ? CONFIG.ACHIEVERS_MESSAGE.footer : 'محاولات';
    embed.setFooter({ text: footerText, iconURL: interaction?.client?.user?.displayAvatarURL?.() || null });
    return embed;
}

// ==========================================
// 🏆 ACHIEVERS EMBED - رسالة المتفوقين
// FIX: شريط التقدم (bar) يُعرض الآن داخل code block كامل بدلاً من inline code
// ==========================================
function createAchieversEmbed(user, analytics, userObject) {
    const currentRate = analytics.totalHabits > 0
        ? Math.round((analytics.completedToday / analytics.totalHabits) * 100)
        : 0;

    const graph = generateWeeklyGraph(analytics.weeklyReport, currentRate);

    // بروجريس بار
    const barLength = 10;
    const filled    = Math.round((currentRate / 100) * barLength);
    const empty     = barLength - filled;
    let barEmoji    = '🟩';
    if      (currentRate < 25) barEmoji = '🟥';
    else if (currentRate < 50) barEmoji = '🟧';
    else if (currentRate < 75) barEmoji = '🟨';
    const bar = barEmoji.repeat(filled) + '⬜'.repeat(empty) + ` ${currentRate}%`;

    const embed = new EmbedBuilder()
        .setColor(CONFIG.COLORS.primary)
        .setTitle(user.name)
        .setDescription(
            `> *"إنجاز اليوم.. هو بناء الغد."*

` +
            `**📈 TODAY**
\`\`\`yaml
${bar}
\`\`\`
` +
            `**📅 THIS WEEK**
\`\`\`
${graph}\`\`\``
        )
        .setThumbnail(userObject ? userObject.displayAvatarURL() : null)
        .setFooter({
            text: CONFIG.ACHIEVERS_MESSAGE.footer,
            iconURL: userObject ? userObject.client.user.displayAvatarURL() : null
        });

    return embed;
}

// ==========================================
// 🏅 ACHIEVEMENTS EMBED - قائمة الإنجازات
// ==========================================
function createAchievementsEmbed(user, achievements) {
    const embed = new EmbedBuilder()
        .setColor(CONFIG.COLORS.primary)
        .setTitle(`🏆 إنجازات ${user.name}`)
        .setThumbnail(user.avatar_url || null);

    if (achievements.length === 0) {
        embed.setDescription('**لم تحقق أي إنجازات بعد**\n\n💪 استمر في المحاولة وسوف تصل!\n\n*الإنجازات تُمنح تلقائياً عند تحقيق الشروط*');
    } else {
        let list = '**الإنجازات التي حققتها:**\n\n';
        achievements.forEach(ach => {
            const config = CONFIG.ACHIEVEMENTS[ach.achievement_type];
            if (config) {
                const date = new Date(ach.earned_at).toLocaleDateString('ar-EG', {
                    year: 'numeric',
                    month: 'long',
                    day: 'numeric'
                });
                list += `${config.emoji} **${config.name}**\n`;
                list += `   └─ ${config.desc}\n`;
                list += `   └─ *حصلت عليه: ${date}*\n\n`;
            }
        });
        embed.setDescription(list);
    }
    
    embed.setFooter({ 
        text: `${achievements.length} من ${Object.keys(CONFIG.ACHIEVEMENTS).length} إنجاز | محـــــــــاولات`,
        iconURL: null
    });

    return embed;
}

// ==========================================
// 📊 LEADERBOARD EMBED - لوحة الشرف
// ==========================================
function createLeaderboardEmbed(leaders, weekNumber) {
    const embed = new EmbedBuilder()
        .setColor(CONFIG.COLORS.info)
        .setTitle(CONFIG.LEADERBOARD.title)
        .setDescription(
            CONFIG.LEADERBOARD.subtitle.replace('{week_number}', weekNumber)
        );

    if (leaders.length === 0) {
        embed.setDescription(CONFIG.LEADERBOARD.noData);
        return embed;
    }

    let list = '\n';
    leaders.forEach((leader, index) => {
        const medal = CONFIG.LEADERBOARD.medals[index] || '🔹';
        const avgRate = leader.avg_rate ? Math.round(leader.avg_rate) : 0;
        list += `${medal} **${leader.name}** - ${avgRate}% التزام (streak: ${leader.days_streak || 0})\n`;
    });

    embed.setDescription(
        CONFIG.LEADERBOARD.subtitle.replace('{week_number}', weekNumber) + list
    );

    return embed;
}

// ==========================================
// ⚠️ ERROR EMBED - رسالة خطأ
// ==========================================
function createErrorEmbed(message) {
    return new EmbedBuilder()
        .setColor(CONFIG.COLORS.danger)
        .setTitle('⚠️ خطأ')
        .setDescription(message);
}

// ==========================================
// ✅ SUCCESS EMBED - رسالة نجاح
// ==========================================
function createSuccessEmbed(message) {
    return new EmbedBuilder()
        .setColor(CONFIG.COLORS.success)
        .setTitle('✅ تم بنجاح')
        .setDescription(message);
}

// ==========================================
// 🏆 CHALLENGE WINNERS EMBED
// ==========================================
function createChallengeWinnersEmbed(challenge, top3) {
    const medals = ['🥇', '🥈', '🥉'];
    let leaderText = '';

    top3.forEach((p, i) => {
        const pts = p.total_points || 0;
        const bar = '█'.repeat(Math.min(10, Math.floor(pts / 10))) +
            '░'.repeat(Math.max(0, 10 - Math.floor(pts / 10)));
        leaderText +=
            `${medals[i]} ${p.name || 'عضو'}\n` +
            `   النقاط: ${pts} | الأيام: ${p.days_count || 0}\n` +
            `   ${bar}\n\n`;
    });

    return new EmbedBuilder()
        .setColor(CONFIG.COLORS.primary)
        .setTitle(`🏆 ${challenge.title}`)
        .setDescription(
            `**📊 ترتيب الفائزين**\n` +
            `\`\`\`yaml\n${leaderText}\`\`\`\n` +
            `> **"النتائج الكبيرة.. هي تراكم لخطوات صغيرة."**`
        )
        .setFooter({ text: 'محـــــاولات' })
        .setTimestamp();
}

// ==========================================
// ⚠️ CONFIRMATION DIALOG - تأكيد العمليات الخطرة
// ==========================================

async function createConfirmation(interaction, options = {}) {
    const {
        title = '⚠️ تأكيد العملية',
        description = 'هل أنت متأكد؟',
        confirmLabel = '✅ نعم، نفّذ',
        cancelLabel = '❌ إلغاء',
        timeoutMs = 30000
    } = options;

    const confirmId = `confirm_yes_${Date.now()}`;
    const cancelId  = `confirm_no_${Date.now()}`;

    const embed = new EmbedBuilder()
        .setColor('#FAA61A')
        .setTitle(title)
        .setDescription(description + '\n\n*ستنتهي صلاحية هذا الطلب خلال 30 ثانية.*');

    const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId(confirmId).setLabel(confirmLabel).setStyle(ButtonStyle.Danger),
        new ButtonBuilder().setCustomId(cancelId).setLabel(cancelLabel).setStyle(ButtonStyle.Secondary)
    );

    const reply = await interaction.editReply({ embeds: [embed], components: [row] });

    try {
        const collected = await reply.awaitMessageComponent({
            filter: i => i.user.id === interaction.user.id && [confirmId, cancelId].includes(i.customId),
            time: timeoutMs
        });
        await collected.deferUpdate();
        return collected.customId === confirmId;
    } catch {
        await interaction.editReply({ content: '⏱️ انتهى وقت التأكيد، تم الإلغاء.', embeds: [], components: [] }).catch(() => {});
        return false;
    }
}

module.exports = {
    createStatsEmbed,
    createAchieversEmbed,
    createAchievementsEmbed,
    createLeaderboardEmbed,
    createErrorEmbed,
    createSuccessEmbed,
    createChallengeWinnersEmbed,
    createConfirmation
};

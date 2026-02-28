// ==========================================
// 🔧 ADMIN — Slash Commands
// إعادة بناء الداشبورد / إنشاء مساحة جديدة
// ==========================================

const { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder } = require('discord.js');
const { updateDashboard } = require('../utils/dashboard');
const CONFIG = require('../config');

const ERR = CONFIG.ADMIN?.unifiedErrorMessage || '❌ حدث خطأ داخلي، تمت كتابة التفاصيل في السجل.';

const recreateDashboardData = new SlashCommandBuilder()
    .setName('recreate_dashboard')
    .setDescription('إعادة بناء الداشبورد لعضو')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addUserOption(o => o.setName('user').setDescription('العضو').setRequired(true));

async function recreateDashboardExecute(interaction, { db, client }) {
    try {
        await interaction.deferReply({ ephemeral: true });
        const userOpt = interaction.options.getUser('user');
        const userId = userOpt.id;
        const user = db.getUser(userId);
        if (!user) return interaction.editReply('❌ العضو غير مسجل في النظام.');
        if (!user.thread_id) return interaction.editReply('❌ العضو ليس لديه مساحة مسجلة. استخدم /create_thread لإنشاء واحدة.');
        const thread = await client.channels.fetch(user.thread_id).catch(() => null);
        if (!thread) return interaction.editReply('❌ المساحة المسجلة غير موجودة. استخدم /create_thread لإنشاء مساحة جديدة.');
        await updateDashboard(thread, userId, db);
        await interaction.editReply(`✅ **تم إعادة إنشاء الداشبورد لـ** ${userOpt.username}\n\nالمساحة: <#${user.thread_id}>`);
    } catch (e) {
        console.error('❌ recreate_dashboard:', e);
        await interaction.editReply(ERR).catch(() => {});
    }
}

const createThreadData = new SlashCommandBuilder()
    .setName('create_thread')
    .setDescription('إنشاء مساحة (Thread) جديدة لعضو')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addUserOption(o => o.setName('user').setDescription('العضو').setRequired(true));

async function createThreadExecute(interaction, { db, client }) {
    try {
        await interaction.deferReply({ ephemeral: true });
        const userOpt = interaction.options.getUser('user');
        const userId = userOpt.id;
        const user = db.getUser(userId);
        if (!user) return interaction.editReply('❌ العضو غير مسجل في النظام.');
        const config = db.getConfig(interaction.guild.id);
        if (!config?.forum_id) return interaction.editReply('❌ النظام غير معد. استخدم /setup أولاً.');
        const forum = await interaction.guild.channels.fetch(config.forum_id).catch(() => null);
        if (!forum) return interaction.editReply('❌ قناة العادات غير موجودة.');
        const thread = await forum.threads.create({
            name: `مساحة ${user.name} 🌱`,
            message: { content: '🌱 جاري التحضير...' }
        });
        db.updateUser(userId, { thread_id: thread.id });
        await updateDashboard(thread, userId, db);
        const welcomeMsg = await thread.send({ content: `👋 <@${userId}> دي مساحتك الجديدة.\n*(هتتمسح بعد دقيقة)*` });
        setTimeout(() => welcomeMsg.delete().catch(() => {}), 60000);
        await interaction.editReply(`✅ **تم إنشاء مساحة جديدة لـ** ${userOpt.username}\n\nالمساحة: <#${thread.id}>`);
    } catch (e) {
        console.error('❌ create_thread:', e);
        await interaction.editReply(ERR).catch(() => {});
    }
}

// ==========================================
// 📅 /start_season — بدء Season جديد (28 يوم)
// ==========================================
const startSeasonData = new SlashCommandBuilder()
    .setName('start_season')
    .setDescription('بدء Season جديد مدته 28 يوم (Cycle)')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addStringOption(o =>
        o.setName('start_date')
            .setDescription('تاريخ البداية بصيغة DD-MM-YYYY')
            .setRequired(true)
    );

async function startSeasonExecute(interaction, { db }) {
    try {
        await interaction.deferReply({ ephemeral: true });
        const input = interaction.options.getString('start_date').trim();
        const m = input.match(/^(\d{2})-(\d{2})-(\d{4})$/);
        if (!m) {
            return interaction.editReply('❌ تنسيق التاريخ غير صحيح. استخدم **DD-MM-YYYY** (مثال: 01-03-2026).');
        }
        const [ , dd, mm, yyyy ] = m;
        const iso = `${yyyy}-${mm}-${dd}`;
        const d = new Date(iso);
        if (Number.isNaN(d.getTime()) || d.getFullYear().toString() !== yyyy || (d.getMonth() + 1).toString().padStart(2, '0') !== mm || d.getDate().toString().padStart(2, '0') !== dd) {
            return interaction.editReply('❌ تاريخ غير صالح. تأكد من اليوم والشهر والسنة.');
        }

        const duration = 28;
        db.startCustomMonth(iso, duration);
        await interaction.editReply(
            `✅ تم بدء Season جديد (28 يوم).\n📅 بداية السيزون: **${input}** (يحفظ كـ ${iso} في النظام).`
        );
    } catch (e) {
        console.error('❌ start_season:', e);
        await interaction.editReply(ERR).catch(() => {});
    }
}

// ==========================================
// 📅 /end_season — إنهاء الـ Season الحالي
// ==========================================
const endSeasonData = new SlashCommandBuilder()
    .setName('end_season')
    .setDescription('إنهاء الـ Season الحالي يدوياً')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator);

async function endSeasonExecute(interaction, { db }) {
    try {
        await interaction.deferReply({ ephemeral: true });
        db.endCustomMonth();
        await interaction.editReply('✅ تم إغلاق الـ Season الحالي.');
    } catch (e) {
        console.error('❌ end_season:', e);
        await interaction.editReply(ERR).catch(() => {});
    }
}

// ==========================================
// 📊 /season_info — خريطة الموسم الحالي (28 يوم)
// ==========================================
const seasonInfoData = new SlashCommandBuilder()
    .setName('season_info')
    .setDescription('عرض معلومات وخريطة الموسم الحالي')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator);

async function seasonInfoExecute(interaction, { db }) {
    try {
        await interaction.deferReply({ ephemeral: true });
        const active = db.getActiveMonth();
        if (!active) return interaction.editReply('❌ لا يوجد Season نشط حالياً.');

        const TZ = 'Africa/Cairo';
        const seasonStartStr = active.start_date; // YYYY-MM-DD
        const duration = active.duration_days || 28;

        const cairoTimeStr = new Date().toLocaleString('en-US', { timeZone: TZ });
        const cairoDate = new Date(cairoTimeStr);
        const yyyy = cairoDate.getFullYear();
        const mm = String(cairoDate.getMonth() + 1).padStart(2, '0');
        const dd = String(cairoDate.getDate()).padStart(2, '0');
        const todayStr = `${yyyy}-${mm}-${dd}`;

        const seasonStart = new Date(seasonStartStr + 'T00:00:00.000Z');
        const todayUtc = new Date(todayStr + 'T00:00:00.000Z');
        const diffDays = Math.floor((todayUtc - seasonStart) / 86400000);

        const addDays = (base, n) => {
            const d = new Date(base);
            d.setUTCDate(d.getUTCDate() + n);
            return d;
        };
        const toDDMMYYYY = (d) => {
            const day = String(d.getUTCDate()).padStart(2, '0');
            const month = String(d.getUTCMonth() + 1).padStart(2, '0');
            const year = d.getUTCFullYear();
            return `${day}-${month}-${year}`;
        };

        const endDate = addDays(seasonStart, duration - 1);
        const startFormatted = toDDMMYYYY(seasonStart);
        const endFormatted = toDDMMYYYY(endDate);

        let status, currentDayLabel, weekMapLines;
        if (diffDays >= duration) {
            status = 'انتهى 🔴 (يجب بدء موسم جديد)';
            currentDayLabel = '—';
            weekMapLines = [
                `**الأسبوع 1** ${toDDMMYYYY(addDays(seasonStart, 0))} → ${toDDMMYYYY(addDays(seasonStart, 6))}`,
                `**الأسبوع 2** ${toDDMMYYYY(addDays(seasonStart, 7))} → ${toDDMMYYYY(addDays(seasonStart, 13))}`,
                `**الأسبوع 3** ${toDDMMYYYY(addDays(seasonStart, 14))} → ${toDDMMYYYY(addDays(seasonStart, 20))}`,
                `**الأسبوع 4** ${toDDMMYYYY(addDays(seasonStart, 21))} → ${toDDMMYYYY(addDays(seasonStart, 27))}`,
            ];
        } else if (diffDays >= 0 && diffDays < duration) {
            status = 'نشط 🟢';
            const currentDay = diffDays + 1;
            currentDayLabel = `${currentDay} من ${duration}`;
            const weekIndex = Math.floor(diffDays / 7); // 0..3
            weekMapLines = [
                `**الأسبوع 1** ${toDDMMYYYY(addDays(seasonStart, 0))} → ${toDDMMYYYY(addDays(seasonStart, 6))}${weekIndex === 0 ? ' 📍' : ''}`,
                `**الأسبوع 2** ${toDDMMYYYY(addDays(seasonStart, 7))} → ${toDDMMYYYY(addDays(seasonStart, 13))}${weekIndex === 1 ? ' 📍' : ''}`,
                `**الأسبوع 3** ${toDDMMYYYY(addDays(seasonStart, 14))} → ${toDDMMYYYY(addDays(seasonStart, 20))}${weekIndex === 2 ? ' 📍' : ''}`,
                `**الأسبوع 4** ${toDDMMYYYY(addDays(seasonStart, 21))} → ${toDDMMYYYY(addDays(seasonStart, 27))}${weekIndex === 3 ? ' 📍' : ''}`,
            ];
        } else {
            status = 'لم يبدأ بعد 🟡';
            currentDayLabel = '—';
            weekMapLines = [
                `**الأسبوع 1** ${toDDMMYYYY(addDays(seasonStart, 0))} → ${toDDMMYYYY(addDays(seasonStart, 6))}`,
                `**الأسبوع 2** ${toDDMMYYYY(addDays(seasonStart, 7))} → ${toDDMMYYYY(addDays(seasonStart, 13))}`,
                `**الأسبوع 3** ${toDDMMYYYY(addDays(seasonStart, 14))} → ${toDDMMYYYY(addDays(seasonStart, 20))}`,
                `**الأسبوع 4** ${toDDMMYYYY(addDays(seasonStart, 21))} → ${toDDMMYYYY(addDays(seasonStart, 27))}`,
            ];
        }

        const embed = new EmbedBuilder()
            .setColor(CONFIG.COLORS?.primary ?? 0x2ecc71)
            .setTitle('📊 خريطة الموسم الحالي (Season)')
            .addFields(
                { name: 'بداية الموسم', value: startFormatted, inline: true },
                { name: 'نهاية الموسم', value: endFormatted, inline: true },
                { name: 'الحالة', value: status, inline: true },
                { name: 'اليوم الحالي', value: currentDayLabel, inline: false },
                { name: 'خريطة الأسابيع الأربعة', value: weekMapLines.join('\n'), inline: false }
            )
            .setFooter({ text: `توقيت القاهرة (${TZ})` });

        await interaction.editReply({ embeds: [embed] });
    } catch (e) {
        console.error('❌ season_info:', e);
        await interaction.editReply(ERR).catch(() => {});
    }
}

// ==========================================
// 🔄 /unsync_reports — حذف تقارير يوم معين لكل الأعضاء
// ==========================================
const unsyncReportsData = new SlashCommandBuilder()
    .setName('unsync_reports')
    .setDescription('حذف جميع التقارير اليومية ليوم معين (لإعادة المزامنة لاحقاً)')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addStringOption(o => o.setName('thread_id').setDescription('معرف الـ Thread (لمطابقة أمر المزامنة)').setRequired(true))
    .addStringOption(o => o.setName('date').setDescription('تاريخ اليوم بصيغة DD-MM-YYYY').setRequired(true));

async function unsyncReportsExecute(interaction, { db }) {
    try {
        await interaction.deferReply({ ephemeral: true });
        const input = (interaction.options.getString('date') || '').trim();
        const m = input.match(/^(\d{2})-(\d{2})-(\d{4})$/);
        if (!m) {
            return interaction.editReply('❌ صيغة التاريخ غير صحيحة. استخدم **DD-MM-YYYY** (مثال: 28-02-2026).');
        }
        const [, dd, mm, yyyy] = m;
        const isoDate = `${yyyy}-${mm}-${dd}`;
        const d = new Date(isoDate);
        if (Number.isNaN(d.getTime()) || d.getFullYear().toString() !== yyyy || String(d.getMonth() + 1).padStart(2, '0') !== mm || String(d.getDate()).padStart(2, '0') !== dd) {
            return interaction.editReply('❌ تاريخ غير صالح. تأكد من اليوم والشهر والسنة.');
        }
        db.removeAllReportsForDate(isoDate);
        await interaction.editReply(`✅ تم حذف جميع التقارير اليومية لكل الأعضاء ليوم **${input}** بنجاح. يمكنك إعادة المزامنة الآن.`);
    } catch (e) {
        console.error('❌ unsync_reports:', e);
        await interaction.editReply(ERR).catch(() => {});
    }
}

const commands = [
    { data: recreateDashboardData, execute: recreateDashboardExecute },
    { data: createThreadData, execute: createThreadExecute },
    { data: startSeasonData, execute: startSeasonExecute },
    { data: endSeasonData, execute: endSeasonExecute },
    { data: seasonInfoData, execute: seasonInfoExecute },
    { data: unsyncReportsData, execute: unsyncReportsExecute }
];

module.exports = { commands };

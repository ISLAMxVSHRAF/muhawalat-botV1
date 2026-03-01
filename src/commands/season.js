const { EmbedBuilder } = require('discord.js');
const { updateDashboard } = require('../utils/dashboard'); // kept for parity with admin context if needed
const CONFIG = require('../config');

const ERR = CONFIG.ADMIN?.unifiedErrorMessage || '❌ حدث خطأ داخلي، تمت كتابة التفاصيل في السجل.';

// ==========================================
// 📅 /start_season — بدء Season جديد (28 يوم)
// (logic moved from old admin.js without changes)
// ==========================================

async function startSeasonExecute(interaction, { db }) {
    try {
        await interaction.deferReply({ ephemeral: true });
        const input = interaction.options.getString('start_date').trim();
        const m = input.match(/^(\d{2})-(\d{2})-(\d{4})$/);
        if (!m) {
            return interaction.editReply(
                '❌ تنسيق التاريخ غير صحيح. استخدم **DD-MM-YYYY** (مثال: 01-03-2026).'
            );
        }
        const [, dd, mm, yyyy] = m;
        const iso = `${yyyy}-${mm}-${dd}`;
        const d = new Date(iso);
        if (
            Number.isNaN(d.getTime()) ||
            d.getFullYear().toString() !== yyyy ||
            (d.getMonth() + 1).toString().padStart(2, '0') !== mm ||
            d.getDate().toString().padStart(2, '0') !== dd
        ) {
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
        const toDDMMYYYY = d => {
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
                `**الأسبوع 1** ${toDDMMYYYY(addDays(seasonStart, 0))} → ${toDDMMYYYY(
                    addDays(seasonStart, 6)
                )}`,
                `**الأسبوع 2** ${toDDMMYYYY(addDays(seasonStart, 7))} → ${toDDMMYYYY(
                    addDays(seasonStart, 13)
                )}`,
                `**الأسبوع 3** ${toDDMMYYYY(addDays(seasonStart, 14))} → ${toDDMMYYYY(
                    addDays(seasonStart, 20)
                )}`,
                `**الأسبوع 4** ${toDDMMYYYY(addDays(seasonStart, 21))} → ${toDDMMYYYY(
                    addDays(seasonStart, 27)
                )}`
            ];
        } else if (diffDays >= 0 && diffDays < duration) {
            status = 'نشط 🟢';
            const currentDay = diffDays + 1;
            currentDayLabel = `${currentDay} من ${duration}`;
            const weekIndex = Math.floor(diffDays / 7); // 0..3
            weekMapLines = [
                `**الأسبوع 1** ${toDDMMYYYY(addDays(seasonStart, 0))} → ${toDDMMYYYY(
                    addDays(seasonStart, 6)
                )}${weekIndex === 0 ? ' 📍' : ''}`,
                `**الأسبوع 2** ${toDDMMYYYY(addDays(seasonStart, 7))} → ${toDDMMYYYY(
                    addDays(seasonStart, 13)
                )}${weekIndex === 1 ? ' 📍' : ''}`,
                `**الأسبوع 3** ${toDDMMYYYY(addDays(seasonStart, 14))} → ${toDDMMYYYY(
                    addDays(seasonStart, 20)
                )}${weekIndex === 2 ? ' 📍' : ''}`,
                `**الأسبوع 4** ${toDDMMYYYY(addDays(seasonStart, 21))} → ${toDDMMYYYY(
                    addDays(seasonStart, 27)
                )}${weekIndex === 3 ? ' 📍' : ''}`
            ];
        } else {
            status = 'لم يبدأ بعد 🟡';
            currentDayLabel = '—';
            weekMapLines = [
                `**الأسبوع 1** ${toDDMMYYYY(addDays(seasonStart, 0))} → ${toDDMMYYYY(
                    addDays(seasonStart, 6)
                )}`,
                `**الأسبوع 2** ${toDDMMYYYY(addDays(seasonStart, 7))} → ${toDDMMYYYY(
                    addDays(seasonStart, 13)
                )}`,
                `**الأسبوع 3** ${toDDMMYYYY(addDays(seasonStart, 14))} → ${toDDMMYYYY(
                    addDays(seasonStart, 20)
                )}`,
                `**الأسبوع 4** ${toDDMMYYYY(addDays(seasonStart, 21))} → ${toDDMMYYYY(
                    addDays(seasonStart, 27)
                )}`
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
                {
                    name: 'خريطة الأسابيع الأربعة',
                    value: weekMapLines.join('\n'),
                    inline: false
                }
            )
            .setFooter({ text: `توقيت القاهرة (${TZ})` });

        await interaction.editReply({ embeds: [embed] });
    } catch (e) {
        console.error('❌ season_info:', e);
        await interaction.editReply(ERR).catch(() => {});
    }
}

// ==========================================
// Central handler for /admin season group
// ==========================================

async function handleSeason(interaction, deps) {
    const sub = interaction.options.getSubcommand();
    switch (sub) {
        case 'start_season':
            return startSeasonExecute(interaction, deps);
        case 'end_season':
            return endSeasonExecute(interaction, deps);
        case 'season_info':
            return seasonInfoExecute(interaction, deps);
        default:
            throw new Error(`Unknown season subcommand: ${sub}`);
    }
}

module.exports = {
    handleSeason
};


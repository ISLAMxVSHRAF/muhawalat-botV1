const { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder, ActionRowBuilder, StringSelectMenuBuilder } = require('discord.js');
const CONFIG = require('../config');

const HELP_SECTIONS = {
    reports: {
        emoji: '📊',
        label: 'التقارير اليومية',
        description: 'متابعة التقارير اليومية للأعضاء',
        commands: [
            { name: '/admin reports daily_overview', desc: 'نظرة شاملة — من عمل تقريره ومن لم يعمل مع نسبة الالتزام', usage: 'date: (اختياري) مثال: 22/02/2026' },
            { name: '/admin reports daily_done', desc: 'قائمة من عمل تقريره', usage: 'date: (اختياري)' },
            { name: '/admin reports daily_missing', desc: 'قائمة من لم يعمل تقريره', usage: 'date: (اختياري)' },
            { name: '/admin reports sync_reports', desc: 'مزامنة تقارير يوم من ثريد معين', usage: 'thread_id: (مطلوب) | date: (مطلوب)' },
            { name: '/admin reports unsync_reports', desc: 'حذف تقارير يوم معين لإعادة المزامنة', usage: 'thread_id: (مطلوب) | date: (مطلوب)' },
        ]
    },
    tasks: {
        emoji: '📌',
        label: 'المهام',
        description: 'إنشاء وإدارة المهام الأسبوعية والشهرية',
        commands: [
            { name: '/admin tasks task_list', desc: 'عرض المهام النشطة وآخر 5 مهام مقفولة مع الـ IDs', usage: '—' },
            { name: '/admin tasks tasks_overview', desc: 'إحصائيات التسليم لكل مهمة نشطة', usage: '—' },
            { name: '/admin tasks task_create', desc: 'إنشاء مهمة جديدة أسبوعية أو شهرية', usage: 'type: weekly/monthly | end_date: | end_time: (اختياري)' },
            { name: '/admin tasks task_link', desc: 'ربط ثريد موجود بنظام المهام', usage: 'thread_id: | type: weekly/monthly | end_date:' },
            { name: '/admin tasks task_edit_deadline', desc: 'تعديل موعد انتهاء مهمة', usage: 'task_id: | end_date: | end_time:' },
            { name: '/admin tasks task_delete', desc: 'حذف مهمة (اكتب confirm:true للتأكيد)', usage: 'task_id: | confirm: true/false' },
            { name: '/admin tasks sync_tasks', desc: 'مزامنة تسجيلات مهمة من ثريد', usage: 'thread_id: | type: | number: | end_date: (اختياري)' },
        ]
    },
    users: {
        emoji: '👥',
        label: 'الأعضاء والإنذارات',
        description: 'إدارة الأعضاء والإنذارات والرادار',
        commands: [
            { name: '/admin users radar', desc: 'تحليل نشاط الأعضاء وتصنيفهم', usage: 'days: (افتراضي 7)' },
            { name: '/admin users sync_members', desc: 'مقارنة الداتابيز بالسيرفر وأرشفة المغادرين', usage: '—' },
            { name: '/admin users warn', desc: 'إعطاء إنذار يدوي لعضو', usage: 'user: | reason: (اختياري)' },
            { name: '/admin users remove_warn', desc: 'رفع إنذار واحد عن عضو', usage: 'user:' },
            { name: '/admin users clear_warns', desc: 'مسح كل إنذارات عضو', usage: 'user:' },
            { name: '/admin users warnings', desc: 'عرض سجل إنذارات عضو', usage: 'user:' },
            { name: '/admin users warnings_all', desc: 'عرض كل الأعضاء ذوي إنذارات', usage: '—' },
            { name: '/admin users warnings_auto_toggle', desc: 'إيقاف/تشغيل الإنذارات التلقائية', usage: '—' },
            { name: '/admin users timeout_list', desc: 'قائمة الـ Timeouts المعلقة', usage: '—' },
            { name: '/admin users archive', desc: 'تجميد عضو وأرشفة مساحته', usage: 'user:' },
            { name: '/admin users restore', desc: 'استعادة عضو مجمد', usage: 'user:' },
            { name: '/admin users delete', desc: 'حذف عضو نهائياً من الداتابيز', usage: 'user:' },
            { name: '/admin users archived', desc: 'عرض قائمة الأعضاء المجمدين', usage: '—' },
        ]
    },
    season: {
        emoji: '📅',
        label: 'الموسم (Season)',
        description: 'إدارة مواسم الالتزام (28 يوم)',
        commands: [
            { name: '/admin season season_info', desc: 'عرض خريطة الموسم الحالي والأسابيع', usage: '—' },
            { name: '/admin season start_season', desc: 'بدء موسم جديد (28 يوم)', usage: 'start_date: DD-MM-YYYY' },
            { name: '/admin season end_season', desc: 'إنهاء الموسم الحالي', usage: '—' },
        ]
    },
    system: {
        emoji: '⚙️',
        label: 'النظام',
        description: 'إعداد البوت والنسخ الاحتياطي',
        commands: [
            { name: '/admin system setup', desc: 'إعداد نظام محاولات للمرة الأولى', usage: '—' },
            { name: '/admin system create_thread', desc: 'إنشاء مساحة شخصية لعضو', usage: 'user:' },
        { name: '/admin system refresh_dashboard', desc: 'تحديث داشبورد جميع الأعضاء النشطين', usage: '—' },
        { name: '/admin system db_backup', desc: 'نسخة احتياطية من الداتابيز', usage: '—' },
            { name: '/admin system debug_status', desc: 'حالة النظام والأتمتة', usage: '—' },
        ]
    },
    automation: {
        emoji: '🤖',
        label: 'الأتمتة',
        description: 'الردود التلقائية والرسائل المجدولة',
        commands: [
            { name: '/admin automation autorespond_add', desc: 'إضافة رد تلقائي', usage: 'channels: | match: | response:' },
            { name: '/admin automation autorespond_list', desc: 'عرض الردود التلقائية', usage: '—' },
            { name: '/admin automation autorespond_toggle', desc: 'تفعيل/إيقاف رد تلقائي', usage: 'id:' },
            { name: '/admin automation autorespond_delete', desc: 'حذف رد تلقائي', usage: 'id:' },
            { name: '/admin automation schedule_add', desc: 'إضافة رسالة مجدولة', usage: 'channel: | repeat: | ...' },
            { name: '/admin automation schedule_list', desc: 'عرض الرسائل المجدولة', usage: '—' },
            { name: '/admin automation schedule_pause', desc: 'إيقاف رسالة مجدولة', usage: 'id:' },
            { name: '/admin automation schedule_resume', desc: 'استئناف رسالة مجدولة', usage: 'id:' },
            { name: '/admin automation schedule_delete', desc: 'حذف رسالة مجدولة', usage: 'id:' },
        ]
    },
    challenges: {
        emoji: '🏆',
        label: 'التحديات',
        description: 'إنشاء وإدارة التحديات',
        commands: [
            { name: '/admin challenges challenge_create', desc: 'إنشاء تحدي جديد', usage: 'title: | duration: | goal_minutes:' },
            { name: '/admin challenges challenge_list', desc: 'عرض التحديات النشطة', usage: '—' },
            { name: '/admin challenges challenge_end', desc: 'إنهاء تحدي', usage: 'id:' },
            { name: '/admin challenges leaderboard', desc: 'ليدربورد التحدي', usage: 'id:' },
        ]
    },
    test: {
        emoji: '🧪',
        label: 'الاختبار',
        description: 'تشغيل الأتمتة يدوياً للتيست',
        commands: [
            { name: '/admin test test_morning', desc: 'اختبار رسالة الصباح', usage: '—' },
            { name: '/admin test test_evening', desc: 'اختبار محاسبة المساء', usage: '—' },
            { name: '/admin test test_reset', desc: 'اختبار التصفير اليومي', usage: '—' },
            { name: '/admin test test_daily', desc: 'اختبار إنشاء بوست التقرير', usage: '—' },
            { name: '/admin test test_lock_daily', desc: 'اختبار قفل بوست التقرير', usage: '—' },
            { name: '/admin test test_lock_tasks', desc: 'اختبار قفل المهام المنتهية', usage: '—' },
            { name: '/admin test test_warnings', desc: 'اختبار فحص الإنذارات الأسبوعي', usage: '—' },
            { name: '/admin test test_weekly', desc: 'اختبار لوحة الشرف', usage: '—' },
            { name: '/admin test test_challenges', desc: 'اختبار فحص التحديات', usage: '—' },
            { name: '/admin test test_monthly', desc: 'اختبار تذكير الأهداف الشهرية', usage: '—' },
            { name: '/admin test test_harvest', desc: 'اختبار الحصاد الأسبوعي', usage: '—' },
        ]
    }
};

function buildMainEmbed() {
    return new EmbedBuilder()
        .setColor(CONFIG.COLORS.primary)
        .setTitle('🛠️ مركز أوامر محاولات')
        .setDescription('اختر مجموعة من القائمة أدناه لعرض أوامرها بالتفصيل.')
        .addFields(
            Object.entries(HELP_SECTIONS).map(([, s]) => ({
                name: `${s.emoji} ${s.label}`,
                value: s.description,
                inline: true
            }))
        )
        .setFooter({ text: 'محاولات Bot — Admin Help' });
}

function buildSectionEmbed(key) {
    const s = HELP_SECTIONS[key];
    if (!s) return null;
    const fields = s.commands.map(c => ({
        name: `\`${c.name}\``,
        value: `${c.desc}\n> **الخيارات:** ${c.usage}`,
        inline: false
    }));
    return new EmbedBuilder()
        .setColor(CONFIG.COLORS.primary)
        .setTitle(`${s.emoji} ${s.label}`)
        .setDescription(s.description)
        .addFields(fields)
        .setFooter({ text: 'اضغط "رجوع" للقائمة الرئيسية' });
}

function buildSelectMenu(placeholder = 'اختر مجموعة...') {
    return new ActionRowBuilder().addComponents(
        new StringSelectMenuBuilder()
            .setCustomId('help_section_select')
            .setPlaceholder(placeholder)
            .addOptions([
                { label: 'القائمة الرئيسية', value: 'main', emoji: '🏠' },
                ...Object.entries(HELP_SECTIONS).map(([key, s]) => ({
                    label: s.label,
                    value: key,
                    emoji: s.emoji
                }))
            ])
    );
}

const data = new SlashCommandBuilder()
    .setName('help')
    .setDescription('دليل أوامر البوت')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator);

async function execute(interaction) {
    try {
        await interaction.reply({
            embeds: [buildMainEmbed()],
            components: [buildSelectMenu()],
            ephemeral: true
        });
    } catch (e) {
        console.error('❌ help:', e);
        await interaction.reply({ content: '❌ حدث خطأ.', ephemeral: true }).catch(() => {});
    }
}

module.exports = { data, execute, buildMainEmbed, buildSectionEmbed, buildSelectMenu };

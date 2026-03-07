const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const { handleReports } = require('./reports');
const { handleTasks } = require('./tasks');
const { handleChallenges } = require('./challenges');
const { handleSeason } = require('./season');
const { handleUsers } = require('./users');
const { handleSystem } = require('./system');
const { handleAutomation } = require('./automation_cmds');
const { handleTest } = require('./test');

// ==========================================
// /admin — Master Admin Command (Subcommand Groups)
// ==========================================

const data = new SlashCommandBuilder()
    .setName('admin')
    .setDescription('لوحة أوامر الأدمن الموحدة')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)

    // Reports group
    .addSubcommandGroup(group =>
        group
            .setName('reports')
            .setDescription('تقارير يومية ومزامنة')
            .addSubcommand(sub =>
                sub
                    .setName('daily_done')
                    .setDescription('من عمل تقريره (أو في تاريخ محدد)')
                    .addStringOption(o =>
                        o
                            .setName('date')
                            .setDescription('التاريخ — مثال: 22/02/2026')
                            .setRequired(false)
                    )
            )
            .addSubcommand(sub =>
                sub
                    .setName('daily_missing')
                    .setDescription('من لم يعمل تقريره (أو في تاريخ محدد)')
                    .addStringOption(o =>
                        o
                            .setName('date')
                            .setDescription('التاريخ — مثال: 22/02/2026')
                            .setRequired(false)
                    )
            )
            .addSubcommand(sub =>
                sub
                    .setName('daily_overview')
                    .setDescription('نظرة شاملة على التقارير اليومية (من عمل + من لم يعمل)')
                    .addStringOption(o =>
                        o
                            .setName('date')
                            .setDescription('التاريخ — مثال: 22/02/2026 (افتراضي: اليوم)')
                            .setRequired(false)
                    )
            )
            .addSubcommand(sub =>
                sub
                    .setName('sync_reports')
                    .setDescription('مزامنة التقارير اليومية من Thread')
                    .addStringOption(o =>
                        o
                            .setName('thread_id')
                            .setDescription('معرف الـ Thread')
                            .setRequired(true)
                    )
                    .addStringOption(o =>
                        o
                            .setName('date')
                            .setDescription(
                                'التاريخ اللي هيتسجل به — مثال: 22/02/2026'
                            )
                            .setRequired(true)
                    )
            )
            .addSubcommand(sub =>
                sub
                    .setName('unsync_reports')
                    .setDescription(
                        'حذف جميع التقارير اليومية ليوم معين (لإعادة المزامنة لاحقاً)'
                    )
                    .addStringOption(o =>
                        o
                            .setName('thread_id')
                            .setDescription(
                                'معرف الـ Thread (لمطابقة أمر المزامنة)'
                            )
                            .setRequired(true)
                    )
                    .addStringOption(o =>
                        o
                            .setName('date')
                            .setDescription('تاريخ اليوم بصيغة DD-MM-YYYY')
                            .setRequired(true)
                    )
            )
    )

    // Tasks group
    .addSubcommandGroup(group =>
        group
            .setName('tasks')
            .setDescription('إدارة المهام ومزامنتها')
            .addSubcommand(sub =>
                sub
                    .setName('task_create')
                    .setDescription('إنشاء مهمة جديدة (أسبوعية أو شهرية)')
                    .addStringOption(o =>
                        o
                            .setName('type')
                            .setDescription('نوع المهمة')
                            .addChoices(
                                { name: 'أسبوعية', value: 'weekly' },
                                { name: 'شهرية', value: 'monthly' }
                            )
                            .setRequired(true)
                    )
                    .addStringOption(o =>
                        o
                            .setName('end_date')
                            .setDescription('تاريخ الانتهاء (مثال: 04-03-2026)')
                            .setRequired(true)
                    )
                    .addStringOption(o =>
                        o
                            .setName('end_time')
                            .setDescription('ساعة الانتهاء بنظام 24 (مثال: 22:00)')
                            .setRequired(true)
                    )
                    .addIntegerOption(o =>
                        o
                            .setName('week_number')
                            .setDescription(
                                'رقم الأسبوع في الموسم (للمهام الأسبوعية)'
                            )
                            .setRequired(false)
                    )
                    .addAttachmentOption(o =>
                        o
                            .setName('image')
                            .setDescription('صورة مرفقة (اختياري)')
                            .setRequired(false)
                    )
            )
            .addSubcommand(sub =>
                sub
                    .setName('task_link')
                    .setDescription('ربط ثريد موجود مسبقاً بنظام المهام')
                    .addStringOption(o =>
                        o
                            .setName('thread_id')
                            .setDescription('معرف الثريد')
                            .setRequired(true)
                    )
                    .addStringOption(o =>
                        o
                            .setName('type')
                            .setDescription('نوع المهمة')
                            .addChoices(
                                { name: 'أسبوعية', value: 'weekly' },
                                { name: 'شهرية', value: 'monthly' }
                            )
                            .setRequired(true)
                    )
                    .addStringOption(o =>
                        o
                            .setName('end_date')
                            .setDescription('تاريخ الانتهاء (مثال: 04-03-2026)')
                            .setRequired(true)
                    )
                    .addStringOption(o =>
                        o
                            .setName('end_time')
                            .setDescription('ساعة الانتهاء بنظام 24 (مثال: 22:00)')
                            .setRequired(true)
                    )
                    .addIntegerOption(o =>
                        o
                            .setName('week_number')
                            .setDescription(
                                'رقم الأسبوع في الموسم (للمهام الأسبوعية)'
                            )
                            .setRequired(false)
                    )
            )
            .addSubcommand(sub =>
                sub
                    .setName('task_list')
                    .setDescription('عرض المهام النشطة الحالية')
            )
            .addSubcommand(sub =>
                sub
                    .setName('task_edit_deadline')
                    .setDescription('تعديل موعد انتهاء مهمة نشطة')
                    .addIntegerOption(o =>
                        o
                            .setName('task_id')
                            .setDescription('معرف المهمة')
                            .setRequired(true)
                    )
                    .addStringOption(o =>
                        o
                            .setName('end_date')
                            .setDescription('تاريخ الانتهاء (مثال: 04-03-2026)')
                            .setRequired(true)
                    )
                    .addStringOption(o =>
                        o
                            .setName('end_time')
                            .setDescription('ساعة الانتهاء بنظام 24 (مثال: 22:00)')
                            .setRequired(true)
                    )
            )
            .addSubcommand(sub =>
                sub
                    .setName('task_edit')
                    .setDescription('تعديل معلومات مهمة (العنوان، النوع، الترتيب، الديدلاين)')
                    .addIntegerOption(o =>
                        o.setName('task_id')
                         .setDescription('رقم المهمة')
                         .setRequired(true)
                    )
            )
            .addSubcommand(sub =>
                sub.setName('task_delete')
                   .setDescription('حذف مهمة نهائياً')
                   .addIntegerOption(opt =>
                       opt.setName('task_id')
                          .setDescription('رقم المهمة')
                          .setRequired(true)
                   )
            )
            .addSubcommand(sub =>
                sub
                    .setName('sync_tasks')
                    .setDescription(
                        'مزامنة مهمة من Thread (معرف الثريد + النوع + الرقم)'
                    )
                    .addStringOption(o =>
                        o
                            .setName('thread_id')
                            .setDescription('ID ثريد المهمة')
                            .setRequired(true)
                    )
                    .addStringOption(o =>
                        o
                            .setName('type')
                            .setDescription('نوع المهمة')
                            .addChoices(
                                { name: 'أسبوعية', value: 'weekly' },
                                { name: 'شهرية', value: 'monthly' }
                            )
                            .setRequired(true)
                    )
                    .addIntegerOption(o =>
                        o
                            .setName('number')
                            .setDescription('رقم أو ترتيب المهمة')
                            .setRequired(true)
                    )
                    .addStringOption(o =>
                        o
                            .setName('end_date')
                            .setDescription('تاريخ انتهاء المهمة (DD-MM-YYYY) — اختياري')
                            .setRequired(false)
                    )
                    .addStringOption(o =>
                        o
                            .setName('end_time')
                            .setDescription('ساعة الانتهاء (HH:mm) — اختياري، افتراضي 23:59')
                            .setRequired(false)
                    )
            )
    )

    // Challenges group
    .addSubcommandGroup(group =>
        group
            .setName('challenges')
            .setDescription('إدارة التحديات والليدربورد')
            .addSubcommand(sub =>
                sub
                    .setName('challenge_create')
                    .setDescription('إنشاء تحدي جديد (الإعداد الكامل من خطوة واحدة)')
                    .addIntegerOption(o =>
                        o
                            .setName('duration_days')
                            .setDescription('مدة التحدي بالأيام')
                            .setRequired(true)
                    )
                    .addIntegerOption(o =>
                        o
                            .setName('max_minutes')
                            .setDescription('الحد الأقصى للدقائق (وقت التحدي الأساسي)')
                            .setRequired(true)
                    )
                    .addIntegerOption(o =>
                        o
                            .setName('min_minutes')
                            .setDescription('الحد الأدنى المقبول للدقائق (اختياري)')
                            .setRequired(false)
                    )
                    .addIntegerOption(o =>
                        o
                            .setName('bonus_minutes')
                            .setDescription('دقائق البونص المسموح بها فوق الحد الأقصى (اختياري)')
                            .setRequired(false)
                    )
                    .addAttachmentOption(o =>
                        o
                            .setName('image')
                            .setDescription('صورة (اختياري)')
                            .setRequired(false)
                    )
            )
            .addSubcommand(sub =>
                sub
                    .setName('challenge_stats')
                    .setDescription('إحصائيات تحدي مع الليدربورد الكاملة')
                    .addIntegerOption(o =>
                        o
                            .setName('id')
                            .setDescription('معرف التحدي')
                            .setRequired(true)
                    )
            )
            .addSubcommand(sub =>
                sub
                    .setName('challenge_end')
                    .setDescription('إنهاء تحدي وإعلان الفائزين')
                    .addIntegerOption(o =>
                        o
                            .setName('id')
                            .setDescription('معرف التحدي')
                            .setRequired(true)
                    )
            )
            .addSubcommand(sub =>
                sub
                    .setName('sync_challenge')
                    .setDescription('ربط ثريد تحدي موجود بالمدة والنقاط')
                    .addStringOption(o =>
                        o
                            .setName('thread_id')
                            .setDescription('معرف الـ Thread')
                            .setRequired(true)
                    )
            )
    )

    // Season group
    .addSubcommandGroup(group =>
        group
            .setName('season')
            .setDescription('إدارة مواسم الـ Season')
            .addSubcommand(sub =>
                sub
                    .setName('start_season')
                    .setDescription(
                        'بدء Season جديد مدته 28 يوم بتاريخ بداية بصيغة DD-MM-YYYY'
                    )
                    .addStringOption(o =>
                        o
                            .setName('start_date')
                            .setDescription('تاريخ البداية بصيغة DD-MM-YYYY')
                            .setRequired(true)
                    )
            )
            .addSubcommand(sub =>
                sub
                    .setName('end_season')
                    .setDescription('إنهاء الـ Season الحالي يدوياً')
            )
            .addSubcommand(sub =>
                sub
                    .setName('season_info')
                    .setDescription('عرض معلومات وخريطة الموسم الحالي')
            )
    )

    // Users group
    .addSubcommandGroup(group =>
        group
            .setName('users')
            .setDescription('إنذارات الأعضاء والـ Timeout والرادار')
            .addSubcommand(sub =>
                sub
                    .setName('warn')
                    .setDescription('إعطاء إنذار يدوي لعضو')
                    .addUserOption(o =>
                        o
                            .setName('user')
                            .setDescription('العضو')
                            .setRequired(true)
                    )
                    .addStringOption(o =>
                        o
                            .setName('reason')
                            .setDescription('سبب الإنذار (اختياري)')
                    )
            )
            .addSubcommand(sub =>
                sub
                    .setName('remove_warn')
                    .setDescription('رفع إنذار واحد عن عضو')
                    .addUserOption(o =>
                        o
                            .setName('user')
                            .setDescription('العضو')
                            .setRequired(true)
                    )
            )
            .addSubcommand(sub =>
                sub
                    .setName('clear_warns')
                    .setDescription('مسح كل إنذارات عضو')
                    .addUserOption(o =>
                        o
                            .setName('user')
                            .setDescription('العضو')
                            .setRequired(true)
                    )
            )
            .addSubcommand(sub =>
                sub
                    .setName('warnings')
                    .setDescription('عرض سجل إنذارات عضو')
                    .addUserOption(o =>
                        o
                            .setName('user')
                            .setDescription('العضو')
                            .setRequired(true)
                    )
            )
            .addSubcommand(sub =>
                sub
                    .setName('warnings_all')
                    .setDescription('عرض كل الأعضاء ذوي إنذارات')
            )
            .addSubcommand(sub =>
                sub
                    .setName('warnings_auto_toggle')
                    .setDescription(
                        'إيقاف/تشغيل نظام الإنذارات التلقائية'
                    )
            )
            .addSubcommand(sub =>
                sub
                    .setName('timeout_list')
                    .setDescription('قائمة الـ Timeouts المعلقة')
            )
            .addSubcommand(sub =>
                sub
                    .setName('radar')
                    .setDescription('تحليل نشاط الأعضاء خلال فترة محددة')
                    .addIntegerOption(o =>
                        o
                            .setName('days')
                            .setDescription('عدد الأيام للتحليل، الافتراضي 7')
                            .setRequired(false)
                    )
            )
            .addSubcommand(sub =>
                sub
                    .setName('clean_departed')
                    .setDescription('فحص وتنظيف الداتابيز من الأعضاء اللي خرجوا أو فقدوا الرول')
            )
            .addSubcommand(sub =>
                sub
                    .setName('sync_members')
                    .setDescription('مراجعة الأعضاء في الداتابيز ومقارنتهم بالسيرفر')
            )
            .addSubcommand(sub =>
                sub
                    .setName('archive')
                    .setDescription('تجميد عضو وأرشفة مساحته')
                    .addUserOption(o =>
                        o
                            .setName('user')
                            .setDescription('العضو المراد تجميده')
                            .setRequired(true)
                    )
            )
            .addSubcommand(sub =>
                sub
                    .setName('restore')
                    .setDescription('استعادة عضو مجمّد')
                    .addUserOption(o =>
                        o
                            .setName('user')
                            .setDescription('العضو المراد استعادته')
                            .setRequired(true)
                    )
            )
            .addSubcommand(sub =>
                sub
                    .setName('delete')
                    .setDescription('حذف عضو نهائياً')
                    .addUserOption(o =>
                        o
                            .setName('user')
                            .setDescription('العضو المراد حذفه')
                            .setRequired(true)
                    )
            )
            .addSubcommand(sub =>
                sub
                    .setName('archived')
                    .setDescription('عرض قائمة الأعضاء المجمّدين')
            )
    )

    // System group
    .addSubcommandGroup(group =>
        group
            .setName('system')
            .setDescription('إعداد النظام والصيانة')
            .addSubcommand(sub =>
                sub
                    .setName('setup')
                    .setDescription(
                        'فتح لوحة إعداد نظام محاولات (قنوات العادات والمتفوقين)'
                    )
            )
            .addSubcommand(sub =>
                sub
                    .setName('register_members')
                    .setDescription(
                        'تسجيل كل الأعضاء اللي معاهم رول الميمبر في الداتابيز'
                    )
            )
            .addSubcommand(sub =>
                sub
                    .setName('create_thread')
                    .setDescription('إنشاء مساحة (Thread) جديدة لعضو')
                    .addUserOption(o =>
                        o
                            .setName('user')
                            .setDescription('العضو')
                            .setRequired(true)
                    )
            )
            .addSubcommand(sub =>
                sub
                    .setName('recreate_dashboard')
                    .setDescription('إعادة بناء الداشبورد لعضو')
                    .addUserOption(o =>
                        o
                            .setName('user')
                            .setDescription('العضو')
                            .setRequired(true)
                    )
            )
            .addSubcommand(sub =>
                sub
                    .setName('db_backup')
                    .setDescription('نسخة احتياطية من قاعدة البيانات')
            )
            .addSubcommand(sub =>
                sub
                    .setName('debug_status')
                    .setDescription(
                        'حالة البوت (أعضاء، uptime، تقارير اليوم)'
                    )
            )
    )

    // Automation group
    .addSubcommandGroup(group =>
        group
            .setName('automation')
            .setDescription('الردود التلقائية والرسائل المجدولة')
            .addSubcommand(sub =>
                sub
                    .setName('autorespond_add')
                    .setDescription('إضافة رد تلقائي')
                    .addStringOption(o =>
                        o
                            .setName('channels')
                            .setDescription(
                                'معرفات القنوات مفصولة بفاصلة (أو اترك للكل)'
                            )
                    )
                    .addStringOption(o =>
                        o
                            .setName('match')
                            .setDescription('نوع المطابقة')
                            .addChoices(
                                { name: 'يحتوي على', value: 'contains' },
                                { name: 'تطابق تام', value: 'exact' },
                                {
                                    name: 'يبدأ بـ',
                                    value: 'startswith'
                                }
                            )
                    )
            )
            .addSubcommand(sub =>
                sub
                    .setName('autorespond_list')
                    .setDescription('عرض كل الردود التلقائية')
            )
            .addSubcommand(sub =>
                sub
                    .setName('autorespond_toggle')
                    .setDescription('تفعيل/إيقاف رد تلقائي')
                    .addIntegerOption(o =>
                        o
                            .setName('id')
                            .setDescription('معرف الرد')
                            .setRequired(true)
                    )
            )
            .addSubcommand(sub =>
                sub
                    .setName('autorespond_delete')
                    .setDescription('حذف رد تلقائي')
                    .addIntegerOption(o =>
                        o
                            .setName('id')
                            .setDescription('معرف الرد')
                            .setRequired(true)
                    )
            )
            .addSubcommand(sub =>
                sub
                    .setName('schedule_add')
                    .setDescription('إضافة رسالة مجدولة')
                    .addChannelOption(o =>
                        o
                            .setName('channel')
                            .setDescription('القناة')
                            .setRequired(true)
                    )
                    .addStringOption(o =>
                        o
                            .setName('repeat')
                            .setDescription('التكرار')
                            .addChoices(
                                { name: 'يومي', value: 'daily' },
                                { name: 'أسبوعي', value: 'weekly' },
                                { name: 'مرة واحدة', value: 'once' }
                            )
                            .setRequired(true)
                    )
            )
            .addSubcommand(sub =>
                sub
                    .setName('schedule_list')
                    .setDescription('عرض كل الرسائل المجدولة')
            )
            .addSubcommand(sub =>
                sub
                    .setName('schedule_pause')
                    .setDescription('إيقاف رسالة مجدولة مؤقتاً')
                    .addIntegerOption(o =>
                        o
                            .setName('id')
                            .setDescription('معرف الجدولة')
                            .setRequired(true)
                    )
            )
            .addSubcommand(sub =>
                sub
                    .setName('schedule_resume')
                    .setDescription('استئناف رسالة مجدولة')
                    .addIntegerOption(o =>
                        o
                            .setName('id')
                            .setDescription('معرف الجدولة')
                            .setRequired(true)
                    )
            )
            .addSubcommand(sub =>
                sub
                    .setName('schedule_delete')
                    .setDescription('حذف رسالة مجدولة')
                    .addIntegerOption(o =>
                        o
                            .setName('id')
                            .setDescription('معرف الجدولة')
                            .setRequired(true)
                    )
            )
    )

    // Test group
    .addSubcommandGroup(group =>
        group
            .setName('test')
            .setDescription('أوامر الاختبار وتشغيل الأتمتة يدوياً')
            .addSubcommand(sub =>
                sub
                    .setName('migrate_db')
                    .setDescription(
                        'تحديث قاعدة البيانات (تشغيل مرة واحدة بس)'
                    )
            )
            .addSubcommand(sub =>
                sub.setName('test_morning').setDescription('اختبار رسالة الصباح')
            )
            .addSubcommand(sub =>
                sub
                    .setName('test_evening')
                    .setDescription('اختبار محاسبة المساء')
            )
            .addSubcommand(sub =>
                sub.setName('test_reset').setDescription('اختبار التصفير اليومي')
            )
            .addSubcommand(sub =>
                sub
                    .setName('test_weekly')
                    .setDescription('اختبار لوحة الشرف')
            )
            .addSubcommand(sub =>
                sub
                    .setName('test_daily')
                    .setDescription('اختبار إنشاء بوست التقرير اليومي')
            )
            .addSubcommand(sub =>
                sub
                    .setName('test_lock_daily')
                    .setDescription('اختبار قفل بوست التقرير اليومي')
            )
            .addSubcommand(sub =>
                sub
                    .setName('test_lock_tasks')
                    .setDescription('اختبار قفل المهام المنتهية')
            )
            .addSubcommand(sub =>
                sub
                    .setName('test_warnings')
                    .setDescription('اختبار فحص الإنذارات الأسبوعي')
            )
            .addSubcommand(sub =>
                sub
                    .setName('test_challenges')
                    .setDescription('اختبار فحص التحديات المنتهية')
            )
            .addSubcommand(sub =>
                sub
                    .setName('test_monthly')
                    .setDescription('اختبار تذكير أهداف الشهر')
            )
            .addSubcommand(sub =>
                sub
                    .setName('test_harvest')
                    .setDescription(
                        'اختبار رسالة الحصاد للأسبوع الحالي في القناة الحالية'
                    )
            )
    );

async function execute(interaction, deps) {
    const group = interaction.options.getSubcommandGroup();
    switch (group) {
        case 'reports':
            return handleReports(interaction, deps);
        case 'tasks':
            return handleTasks(interaction, deps);
        case 'challenges':
            return handleChallenges(interaction, deps);
        case 'season':
            return handleSeason(interaction, deps);
        case 'users':
            return handleUsers(interaction, deps);
        case 'system':
            return handleSystem(interaction, deps);
        case 'automation':
            return handleAutomation(interaction, deps);
        case 'test':
            return handleTest(interaction, deps);
        default:
            throw new Error(`Unknown admin subcommand group: ${group}`);
    }
}

module.exports = { data, execute };


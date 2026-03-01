// ==========================================
// 📖 HELP — Slash Command (Paginated)
// ==========================================

const { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder } = require('discord.js');
const CONFIG = require('../config');

const ERR = CONFIG.ADMIN?.unifiedErrorMessage || '❌ حدث خطأ داخلي.';

function buildHelpEmbed() {
    return new EmbedBuilder()
        .setColor(CONFIG.COLORS.primary)
        .setTitle('🛠️ دليل أوامر الأدمن — /admin')
        .setDescription(
            'كل أوامر الإدارة أصبحت الآن تحت أمر واحد موحد `/admin` مع مجموعات فرعية واضحة. 👇'
        )
        .addFields(
            {
                name: '📊 reports',
                value: 'تقارير يومية، من عمل تقريره أو لم يعمله، ومزامنة / إلغاء مزامنة التقارير من الثريدات.',
                inline: false
            },
            {
                name: '📌 tasks',
                value: 'إنشاء المهام الأسبوعية / الشهرية، ربط ثريدات موجودة، عرض المهام النشطة، ومزامنة الإكمالات.',
                inline: false
            },
            {
                name: '🏆 challenges',
                value: 'إنشاء التحديات، عرض الإحصائيات والليدربورد، إنهاء التحديات، وربط الثريدات بمدة ونقاط.',
                inline: false
            },
            {
                name: '📅 season',
                value: 'بدء وإنهاء Season جديد لمدة 28 يوم، وعرض خريطة الموسم الحالية والأسابيع.',
                inline: false
            },
            {
                name: '👥 users',
                value: 'إدارة إنذارات الأعضاء، عرض السجلات، تفعيل الإنذارات التلقائية، وقوائم الـ Timeout المعلّقة.',
                inline: false
            },
            {
                name: '⚙️ system',
                value: 'إعداد نظام محاولات، تسجيل الأعضاء، إنشاء/إعادة بناء مساحات الأعضاء، النسخ الاحتياطي، وحالة النظام.',
                inline: false
            },
            {
                name: '🤖 automation',
                value: 'الردود التلقائية (autorespond) والرسائل المجدولة (schedule) مع الإضافة، العرض، الإيقاف، والاستئناف.',
                inline: false
            },
            {
                name: '🧪 test',
                value: 'تشغيل جميع مهام الأتمتة في وضع الاختبار (صباح، مساء، تقارير، حصاد أسبوعي، تحديات… إلخ) وأمر ترحيل قاعدة البيانات.',
                inline: false
            }
        );
}

const data = new SlashCommandBuilder()
    .setName('help')
    .setDescription('عرض كل أوامر الأدمن مع شرح كل أمر')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator);

async function execute(interaction) {
    try {
        await interaction.reply({
            embeds: [buildHelpEmbed()],
            ephemeral: true
        });
    } catch (e) {
        console.error('❌ help:', e);
        await interaction.reply({ content: ERR, ephemeral: true }).catch(() => {});
    }
}

module.exports = { data, execute };

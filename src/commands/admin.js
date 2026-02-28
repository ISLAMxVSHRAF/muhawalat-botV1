// ==========================================
// 🔧 ADMIN — Slash Commands
// إعادة بناء الداشبورد / إنشاء مساحة جديدة
// ==========================================

const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
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
// 📅 /start_month — بدء شهر مخصص
// ==========================================
const startMonthData = new SlashCommandBuilder()
    .setName('start_month')
    .setDescription('بدء شهر مخصص (إعادة ضبط الإحصائيات الشهرية)')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addIntegerOption(o => o.setName('duration').setDescription('مدة الشهر بالأيام').setRequired(false));

async function startMonthExecute(interaction, { db }) {
    try {
        await interaction.deferReply({ ephemeral: true });
        const duration = interaction.options.getInteger('duration') ?? 30;
        const startDate = new Date().toISOString().split('T')[0];
        db.startCustomMonth(startDate, duration);
        await interaction.editReply(`✅ تم بدء شهر مخصص جديد.\n📅 من **${startDate}** لمدة **${duration}** يوم.`);
    } catch (e) {
        console.error('❌ start_month:', e);
        await interaction.editReply(ERR).catch(() => {});
    }
}

// ==========================================
// 📅 /end_month — إنهاء الشهر المخصص
// ==========================================
const endMonthData = new SlashCommandBuilder()
    .setName('end_month')
    .setDescription('إنهاء الشهر المخصص يدوياً')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator);

async function endMonthExecute(interaction, { db }) {
    try {
        await interaction.deferReply({ ephemeral: true });
        db.endCustomMonth();
        await interaction.editReply('✅ تم إغلاق الشهر المخصص.');
    } catch (e) {
        console.error('❌ end_month:', e);
        await interaction.editReply(ERR).catch(() => {});
    }
}

const commands = [
    { data: recreateDashboardData, execute: recreateDashboardExecute },
    { data: createThreadData, execute: createThreadExecute },
    { data: startMonthData, execute: startMonthExecute },
    { data: endMonthData, execute: endMonthExecute }
];

module.exports = { commands };

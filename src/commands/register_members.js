// ==========================================
// 👥 REGISTER_MEMBERS — Slash Command
// تسجيل كل الأعضاء اللي معاهم رول الميمبر في الداتابيز
// ==========================================

const { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder } = require('discord.js');
const CONFIG = require('../config');
const ERR = CONFIG.ADMIN?.unifiedErrorMessage || '❌ حدث خطأ داخلي.';

const data = new SlashCommandBuilder()
    .setName('register_members')
    .setDescription('تسجيل كل الأعضاء اللي معاهم رول الميمبر في الداتابيز')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator);

async function execute(interaction, { db }) {
    try {
        await interaction.deferReply({ ephemeral: true });

        const roleId = process.env.MEMBER_ROLE_ID;
        if (!roleId) return interaction.editReply('❌ MEMBER_ROLE_ID مش موجود في .env');

        const guild = interaction.guild;

        // جيب الأعضاء بـ chunks عشان نتجنب الـ timeout
        let allMembers = [];
        let after = undefined;
        while (true) {
            const opts = { limit: 1000 };
            if (after) opts.after = after;
            const chunk = await guild.members.list(opts);
            if (!chunk.size) break;
            allMembers.push(...chunk.values());
            after = [...chunk.keys()].pop();
            if (chunk.size < 1000) break;
        }

        // فلتر اللي معاهم الرول بس
        const roleMembers = allMembers.filter(m => !m.user.bot && m.roles.cache.has(roleId));

        let registered = 0;
        let updated    = 0;

        for (const member of roleMembers) {
            const userId   = member.user.id;
            const name     = member.nickname || member.user.globalName || member.user.username;
            const existing = db.getUser(userId);

            if (!existing) {
                db.createUser(userId, name, '', 'male', null, null);
                registered++;
            } else if (existing.name !== name) {
                db.updateUser(userId, { name });
                updated++;
            }
        }

        const role = guild.roles.cache.get(roleId);
        const embed = new EmbedBuilder()
            .setColor(CONFIG.COLORS.success)
            .setTitle('👥 تسجيل الأعضاء')
            .addFields(
                { name: '✅ مسجلين جدد',         value: String(registered),       inline: true },
                { name: '🔄 تم تحديث اسمهم',     value: String(updated),          inline: true },
                { name: '👥 إجمالي الرول',        value: String(roleMembers.length), inline: true }
            )
            .setFooter({ text: `رول: ${role?.name || roleId}` })
            .setTimestamp();

        await interaction.editReply({ embeds: [embed] });
    } catch (e) {
        console.error('❌ register_members:', e);
        await interaction.editReply(ERR).catch(() => {});
    }
}

module.exports = { data, execute };

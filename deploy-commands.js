// ==========================================
// 📤 DEPLOY SLASH COMMANDS
// يجمع أوامر الـ Slash من src/commands ويسجلها في Discord
// تشغيل: node deploy-commands.js
// ==========================================

require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { REST, Routes } = require('discord.js');

const DISCORD_TOKEN = process.env.DISCORD_TOKEN;
const CLIENT_ID = process.env.DISCORD_CLIENT_ID || process.env.CLIENT_ID;

if (!DISCORD_TOKEN) {
    console.error('❌ DISCORD_TOKEN غير موجود في .env');
    process.exit(1);
}
if (!CLIENT_ID) {
    console.error('❌ DISCORD_CLIENT_ID أو CLIENT_ID مطلوب في .env (معرف تطبيق البوت)');
    process.exit(1);
}

const commandsDir = path.join(__dirname, 'src', 'commands');
const commandFiles = fs.readdirSync(commandsDir).filter(f => f.endsWith('.js'));

const commands = [];

for (const file of commandFiles) {
    const filePath = path.join(commandsDir, file);
    let mod;
    try {
        mod = require(filePath);
    } catch (e) {
        console.warn(`⚠️ تخطي ${file}:`, e.message);
        continue;
    }

    if (mod.data && typeof mod.execute === 'function') {
        const data = mod.data.toJSON ? mod.data.toJSON() : mod.data;
        commands.push(data);
        console.log(`  ✅ ${data.name}`);
    } else if (Array.isArray(mod.commands)) {
        for (const cmd of mod.commands) {
            if (cmd.data && typeof cmd.execute === 'function') {
                const data = cmd.data.toJSON ? cmd.data.toJSON() : cmd.data;
                commands.push(data);
                console.log(`  ✅ ${data.name}`);
            }
        }
    }
}

const rest = new REST().setToken(DISCORD_TOKEN);

(async () => {
    try {
        console.log(`\n🔄 تسجيل ${commands.length} أمر...`);
        const data = await rest.put(
            Routes.applicationCommands(CLIENT_ID),
            { body: commands }
        );
        console.log(`✅ تم تسجيل ${data.length} أمر بنجاح.\n`);
    } catch (e) {
        console.error('❌ فشل التسجيل:', e);
        if (e.rawError) console.error(e.rawError);
        process.exit(1);
    }
})();

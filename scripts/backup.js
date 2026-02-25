// ==========================================
// 💾 BACKUP SCRIPT
// نسخ احتياطي من الداتابيز
// ==========================================

const fs = require('fs');
const path = require('path');

function backup() {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const backupName = `muhawalat.db.backup.${timestamp}`;
    const backupDir = path.join(__dirname, '../backups');

    // Create backups directory if it doesn't exist
    if (!fs.existsSync(backupDir)) {
        fs.mkdirSync(backupDir);
    }

    const source = path.join(__dirname, '../muhawalat.db');
    const destination = path.join(backupDir, backupName);

    try {
        fs.copyFileSync(source, destination);
        console.log(`✅ Backup created: ${backupName}`);
        
        // Keep only last 10 backups
        const backups = fs.readdirSync(backupDir)
            .filter(f => f.startsWith('muhawalat.db.backup'))
            .sort()
            .reverse();
        
        if (backups.length > 10) {
            backups.slice(10).forEach(old => {
                fs.unlinkSync(path.join(backupDir, old));
                console.log(`🗑️ Removed old backup: ${old}`);
            });
        }
    } catch (e) {
        console.error('❌ Backup failed:', e.message);
    }
}

backup();
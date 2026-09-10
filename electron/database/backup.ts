import fs from 'fs';
import path from 'path';
import { getDbPath, getDatabase } from './db';

/**
 * Copies the live SQLite database to the configured backup directory.
 * Called automatically on application quit.
 */
export function backupDatabase(): { success: boolean; path?: string; error?: string } {
  try {
    const database = getDatabase();
    const settings = database
      .prepare('SELECT backup_directory FROM business_settings WHERE id = 1')
      .get() as { backup_directory: string } | undefined;

    const backupDir =
      settings?.backup_directory ||
      path.join(process.env.USERPROFILE || process.cwd(), 'Documents', 'HSMFurniture', 'backups');

    if (!fs.existsSync(backupDir)) {
      fs.mkdirSync(backupDir, { recursive: true });
    }

    // Checkpoint WAL so backup is consistent
    database.pragma('wal_checkpoint(TRUNCATE)');

    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    const dest = path.join(backupDir, `furniture-erp-backup-${stamp}.db`);
    const source = getDbPath();

    fs.copyFileSync(source, dest);

    // Keep last 30 backups
    const files = fs
      .readdirSync(backupDir)
      .filter((f) => f.startsWith('furniture-erp-backup-') && f.endsWith('.db'))
      .map((f) => ({ name: f, mtime: fs.statSync(path.join(backupDir, f)).mtimeMs }))
      .sort((a, b) => b.mtime - a.mtime);

    for (const old of files.slice(30)) {
      try {
        fs.unlinkSync(path.join(backupDir, old.name));
      } catch {
        /* ignore */
      }
    }

    return { success: true, path: dest };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('[backup]', message);
    return { success: false, error: message };
  }
}

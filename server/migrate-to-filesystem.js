/**
 * Script de migration : base64 en BDD → fichiers sur le disque
 *
 * À exécuter UNE SEULE FOIS après avoir appliqué les migrations SQL :
 *
 *   ALTER TABLE expenses ADD COLUMN receipt_file_path VARCHAR(255) NULL;
 *   ALTER TABLE documents ADD COLUMN file_path VARCHAR(255) NULL;
 *
 * Puis : node server/migrate-to-filesystem.js
 *
 * Le script laisse les anciennes colonnes en place — supprimez-les
 * manuellement après avoir vérifié que tout fonctionne :
 *
 *   ALTER TABLE expenses DROP COLUMN receipt_file;
 *   ALTER TABLE expenses DROP COLUMN receipt_file_type;
 *   ALTER TABLE documents DROP COLUMN file_data;
 */

require('dotenv').config();
const path = require('path');
const fs   = require('fs');
const pool = require('./db');

const EXPENSES_DIR  = path.join(__dirname, 'uploads', 'expenses');
const DOCUMENTS_DIR = path.join(__dirname, 'uploads', 'documents');

fs.mkdirSync(EXPENSES_DIR,  { recursive: true });
fs.mkdirSync(DOCUMENTS_DIR, { recursive: true });

function mimeToExt(mimeType) {
  const map = {
    'image/jpeg': '.jpg', 'image/jpg': '.jpg',
    'image/png': '.png', 'image/webp': '.webp',
    'image/heic': '.heic', 'image/heif': '.heif',
    'application/pdf': '.pdf',
  };
  return map[mimeType] || '.bin';
}

async function migrateExpenses() {
  console.log('\n── Notes de frais ───────────────────────────────────────');
  const [rows] = await pool.execute(
    'SELECT id, receipt_file, receipt_file_name, receipt_file_type FROM expenses WHERE receipt_file IS NOT NULL AND receipt_file_path IS NULL'
  );
  console.log(`${rows.length} justificatif(s) à migrer`);

  let ok = 0, skip = 0, err = 0;
  for (const row of rows) {
    try {
      const ext = row.receipt_file_type
        ? mimeToExt(row.receipt_file_type)
        : path.extname(row.receipt_file_name || '.bin');
      const filename = `${row.id}${ext}`;
      const filepath = path.join(EXPENSES_DIR, filename);

      // Décode le base64 (avec ou sans data-URL prefix)
      const b64 = row.receipt_file.includes(',')
        ? row.receipt_file.split(',')[1]
        : row.receipt_file;

      fs.writeFileSync(filepath, Buffer.from(b64, 'base64'));

      await pool.execute(
        'UPDATE expenses SET receipt_file_path = ? WHERE id = ?',
        [filename, row.id]
      );
      ok++;
      process.stdout.write('.');
    } catch (e) {
      console.error(`\nErreur pour l'expense ${row.id} : ${e.message}`);
      err++;
    }
  }
  console.log(`\n✓ ${ok} migré(s), ${skip} ignoré(s), ${err} erreur(s)`);
}

async function migrateDocuments() {
  console.log('\n── Documents RH ─────────────────────────────────────────');
  const [rows] = await pool.execute(
    'SELECT id, file_name, file_type, file_data FROM documents WHERE file_data IS NOT NULL AND file_path IS NULL'
  );
  console.log(`${rows.length} document(s) à migrer`);

  let ok = 0, err = 0;
  for (const row of rows) {
    try {
      const ext = row.file_type
        ? mimeToExt(row.file_type)
        : path.extname(row.file_name || '.bin');
      const filename = `${row.id}${ext}`;
      const filepath = path.join(DOCUMENTS_DIR, filename);

      const b64 = row.file_data.includes(',')
        ? row.file_data.split(',')[1]
        : row.file_data;

      fs.writeFileSync(filepath, Buffer.from(b64, 'base64'));

      await pool.execute(
        'UPDATE documents SET file_path = ? WHERE id = ?',
        [filename, row.id]
      );
      ok++;
      process.stdout.write('.');
    } catch (e) {
      console.error(`\nErreur pour le document ${row.id} : ${e.message}`);
      err++;
    }
  }
  console.log(`\n✓ ${ok} migré(s), ${err} erreur(s)`);
}

async function main() {
  console.log('Démarrage de la migration base64 → filesystem…');
  try {
    await migrateExpenses();
    await migrateDocuments();
    console.log('\nMigration terminée.');
    console.log('\nÉtapes suivantes :');
    console.log('1. Vérifiez que les fichiers sont bien dans server/uploads/');
    console.log('2. Testez l\'application');
    console.log('3. Supprimez les anciennes colonnes sur Gandi :');
    console.log('   ALTER TABLE expenses DROP COLUMN receipt_file;');
    console.log('   ALTER TABLE expenses DROP COLUMN receipt_file_type;');
    console.log('   ALTER TABLE documents DROP COLUMN file_data;');
  } finally {
    await pool.end();
  }
}

main().catch(e => { console.error(e); process.exit(1); });

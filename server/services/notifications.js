const crypto = require('crypto');
const pool = require('../db');
const { sendNotificationEmail } = require('./email');

async function notify(userId, type, title, body, refType, refId) {
  try {
    // Lire les préférences et infos de l'utilisateur
    const [userRows] = await pool.execute(
      'SELECT notif_in_app, notif_email, email, first_name, last_name FROM users WHERE id = ?',
      [userId]
    );
    const user = userRows[0];
    if (!user) return;

    // Récupérer le nom du club
    let clubName = 'Tennis Club RH';
    try {
      const [settingsRows] = await pool.execute('SELECT club_name FROM app_settings WHERE id = 1');
      if (settingsRows[0]?.club_name) clubName = settingsRows[0].club_name;
    } catch { /* fallback */ }

    // Notification in-app
    if ((user.notif_in_app ?? 1) !== 0) {
      const id = crypto.randomUUID();
      await pool.execute(
        `INSERT INTO notifications (id, user_id, type, title, body, ref_type, ref_id) VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [id, userId, type, title, body || null, refType || null, refId || null]
      );
    }

    // Notification email
    if ((user.notif_email ?? 1) !== 0 && user.email) {
      try {
        await sendNotificationEmail({
          toEmail: user.email,
          toName: `${user.first_name} ${user.last_name}`,
          title,
          body,
          clubName,
        });
      } catch (emailErr) {
        console.error('[notify] email error (silent):', emailErr.message);
      }
    }
  } catch (err) {
    console.error('[notify] error (silent):', err.message);
  }
}

module.exports = { notify };

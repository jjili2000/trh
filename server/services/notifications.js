const crypto = require('crypto');
const pool = require('../db');
const { sendNotificationEmail } = require('./email');

/**
 * Envoie une notification in-app et/ou email selon les préférences du destinataire.
 *
 * @param {string} userId     - Destinataire
 * @param {string} type       - Type technique (ex: 'time_entry_submitted')
 * @param {string} title      - Titre de la notification
 * @param {string} body       - Corps du message
 * @param {string} refType    - Type de la ressource liée (ex: 'time_entry')
 * @param {string|null} refId - ID de la ressource liée
 * @param {string} module     - Module concerné : 'time' | 'absences' | 'expenses' | 'documents' | 'budgets'
 * @param {string} direction  - 'action' (je dois agir) | 'response' (retour sur ma demande)
 */
async function notify(userId, type, title, body, refType, refId, module, direction) {
  try {
    // Récupérer les infos de l'utilisateur
    const [[user]] = await pool.execute(
      'SELECT email, first_name, last_name FROM users WHERE id = ?',
      [userId]
    );
    if (!user) return;

    // Lire les préférences pour ce module/direction
    // En l'absence de ligne dans la table → défaut = activé
    let inApp = true;
    let sendEmail = true;

    if (module && direction) {
      try {
        const [prefRows] = await pool.execute(
          'SELECT in_app, email FROM user_notification_prefs WHERE user_id = ? AND module = ? AND direction = ?',
          [userId, module, direction]
        );
        if (prefRows.length > 0) {
          inApp     = prefRows[0].in_app !== 0;
          sendEmail = prefRows[0].email  !== 0;
        }
        // Pas de ligne = préférences jamais personnalisées = activé par défaut
      } catch { /* table peut ne pas encore exister → on notifie quand même */ }
    }

    // Récupérer le nom du club
    let clubName = 'Tennis Club RH';
    try {
      const [[settings]] = await pool.execute('SELECT club_name FROM app_settings WHERE id = 1');
      if (settings?.club_name) clubName = settings.club_name;
    } catch { /* fallback */ }

    // Notification in-app
    if (inApp) {
      const id = crypto.randomUUID();
      await pool.execute(
        `INSERT INTO notifications (id, user_id, type, title, body, ref_type, ref_id)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [id, userId, type, title, body || null, refType || null, refId || null]
      );
    }

    // Notification email
    if (sendEmail && user.email) {
      try {
        await sendNotificationEmail({
          toEmail: user.email,
          toName:  `${user.first_name} ${user.last_name}`,
          title,
          body:     body || '',
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

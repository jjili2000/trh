const nodemailer = require('nodemailer');

function createTransporter() {
  return nodemailer.createTransport({
    host: process.env.SMTP_HOST || 'mail.gandi.net',
    port: parseInt(process.env.SMTP_PORT || '587'),
    secure: false,
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS,
    },
  });
}

async function sendDocumentNotification({ toEmail, toName, documentType, periodStart, periodEnd, clubName }) {
  if (!process.env.SMTP_USER || !process.env.SMTP_PASS) {
    console.log('Email notification skipped: SMTP not configured');
    return;
  }

  const transporter = createTransporter();
  const period = periodStart
    ? `pour la période ${new Date(periodStart).toLocaleDateString('fr-FR')}${periodEnd ? ' - ' + new Date(periodEnd).toLocaleDateString('fr-FR') : ''}`
    : '';

  await transporter.sendMail({
    from: `"${clubName || 'Tennis Club RH'}" <${process.env.SMTP_USER}>`,
    to: toEmail,
    subject: `Nouveau document disponible : ${documentType}`,
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <div style="background: #2d6a4f; padding: 20px; text-align: center;">
          <h1 style="color: white; margin: 0;">🎾 ${clubName || 'Tennis Club RH'}</h1>
        </div>
        <div style="padding: 30px; background: #f9f9f9;">
          <p>Bonjour ${toName},</p>
          <p>Un nouveau document est disponible dans votre espace RH :</p>
          <div style="background: white; border-left: 4px solid #2d6a4f; padding: 15px; margin: 20px 0;">
            <strong>${documentType}</strong>${period ? '<br><span style="color: #666;">' + period + '</span>' : ''}
          </div>
          <p>Connectez-vous pour le consulter :</p>
          <a href="https://trh.neos.live" style="background: #2d6a4f; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; display: inline-block;">
            Accéder à mes documents
          </a>
        </div>
        <div style="padding: 15px; text-align: center; color: #999; font-size: 12px;">
          ${clubName || 'Tennis Club RH'} — Gestion des Ressources Humaines
        </div>
      </div>
    `,
  });
}

module.exports = { sendDocumentNotification };

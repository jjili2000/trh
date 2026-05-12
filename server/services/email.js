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

async function sendPasswordResetEmail({ toEmail, toName, resetUrl, clubName }) {
  if (!process.env.SMTP_USER || !process.env.SMTP_PASS) {
    console.log('Password reset email skipped: SMTP not configured');
    return;
  }

  const transporter = createTransporter();

  await transporter.sendMail({
    from: `"${clubName || 'Tennis Club RH'}" <${process.env.SMTP_USER}>`,
    to: toEmail,
    subject: 'Réinitialisation de votre mot de passe',
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <div style="background: #2d6a4f; padding: 20px; text-align: center;">
          <h1 style="color: white; margin: 0;">🎾 ${clubName || 'Tennis Club RH'}</h1>
        </div>
        <div style="padding: 30px; background: #f9f9f9;">
          <p>Bonjour ${toName},</p>
          <p>Vous avez demandé la réinitialisation de votre mot de passe.</p>
          <p>Cliquez sur le bouton ci-dessous pour choisir un nouveau mot de passe :</p>
          <div style="text-align: center; margin: 30px 0;">
            <a href="${resetUrl}" style="background: #2d6a4f; color: white; padding: 14px 28px; text-decoration: none; border-radius: 6px; display: inline-block; font-size: 16px;">
              Réinitialiser mon mot de passe
            </a>
          </div>
          <p style="color: #666; font-size: 13px;">Ce lien est valable <strong>1 heure</strong>. Après ce délai, vous devrez faire une nouvelle demande.</p>
          <p style="color: #666; font-size: 13px;">Si vous n'êtes pas à l'origine de cette demande, ignorez simplement cet email.</p>
        </div>
        <div style="padding: 15px; text-align: center; color: #999; font-size: 12px;">
          ${clubName || 'Tennis Club RH'} — Gestion des Ressources Humaines
        </div>
      </div>
    `,
  });
}

module.exports = { sendDocumentNotification, sendPasswordResetEmail };

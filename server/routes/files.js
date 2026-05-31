const express = require('express');
const path = require('path');
const fs = require('fs');
const jwt = require('jsonwebtoken');

const router = express.Router();
const UPLOADS_DIR = path.join(__dirname, '..', 'uploads');
const ALLOWED_MODULES = ['expenses', 'documents'];

/**
 * GET /api/files/:module/:filename
 *
 * Sert un fichier stocké dans server/uploads/:module/.
 * Auth : header Authorization: Bearer <token>  OU  ?token=<token>
 * (Le query param est nécessaire pour les balises <img src="…"> natives)
 */
router.get('/:module/:filename', (req, res) => {
  const { module, filename } = req.params;

  if (!ALLOWED_MODULES.includes(module)) {
    return res.status(404).json({ error: 'Module inconnu' });
  }

  // Auth : header ou query param
  const token =
    req.headers.authorization?.split(' ')[1] ||
    req.query.token;

  if (!token) {
    return res.status(401).json({ error: 'Non autorisé' });
  }

  try {
    jwt.verify(token, process.env.JWT_SECRET);
  } catch {
    return res.status(401).json({ error: 'Token invalide' });
  }

  // Sécurité : empêcher les path traversals
  const safeName = path.basename(filename);
  const filePath = path.join(UPLOADS_DIR, module, safeName);

  if (!fs.existsSync(filePath)) {
    return res.status(404).json({ error: 'Fichier non trouvé' });
  }

  // Cache privé 1 h — les noms sont des UUID donc immuables
  res.set('Cache-Control', 'private, max-age=3600');
  res.sendFile(filePath);
});

module.exports = router;

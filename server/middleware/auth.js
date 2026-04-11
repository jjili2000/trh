const jwt = require('jsonwebtoken');

module.exports = function authMiddleware(req, res, next) {
  const auth = req.headers.authorization;
  if (!auth || !auth.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Non autorisé' });
  }
  try {
    const payload = jwt.verify(auth.slice(7), process.env.JWT_SECRET || 'secret');
    req.user = payload;
    next();
  } catch {
    res.status(401).json({ error: 'Token invalide' });
  }
};

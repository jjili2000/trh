/**
 * Chaîne de validation : trouve le premier responsable habilité
 * à valider un type de demande pour un utilisateur donné.
 *
 * Règle :
 *   1. Remonter la hiérarchie (manager_id).
 *   2. S'arrêter sur le premier responsable dont validates_[type] = 1
 *      et qui n'est pas bloqué.
 *   3. Si on atteint le sommet sans trouver de valideur → retourner
 *      le valideur global (rôle configuré dans app_settings).
 *   4. Si aucun valideur global → null.
 */

const pool = require('../db');

const TYPE_COL = {
  time:      'validates_time',
  absences:  'validates_absences',
  expenses:  'validates_expenses',
};

/**
 * @param {string} userId   – ID de l'auteur de la demande
 * @param {'time'|'absences'|'expenses'} type
 * @returns {Promise<string|null>} ID du valideur désigné, ou null
 */
async function findValidator(userId, type) {
  const col = TYPE_COL[type];
  if (!col) return null;

  const visited = new Set([userId]);
  let currentId = userId;

  while (true) {
    const [[row]] = await pool.execute(
      'SELECT manager_id FROM users WHERE id = ?',
      [currentId]
    );

    if (!row || !row.manager_id) {
      return await getGlobalValidator();
    }

    const managerId = row.manager_id;

    if (visited.has(managerId)) {
      // Protection contre les cycles dans la hiérarchie
      return await getGlobalValidator();
    }
    visited.add(managerId);

    const [[mgr]] = await pool.execute(
      `SELECT id, ${col}, blocked FROM users WHERE id = ?`,
      [managerId]
    );

    if (!mgr) return await getGlobalValidator();

    if (mgr.blocked) {
      // Responsable bloqué → on continue de remonter
      currentId = managerId;
      continue;
    }

    if (mgr[col]) {
      return managerId;   // ce responsable valide ce type
    }

    // Le responsable ne valide pas ce type → on continue de remonter
    currentId = managerId;
  }
}

/**
 * Retourne l'ID de l'utilisateur ayant le rôle de valideur global,
 * tel que configuré dans app_settings.global_validator_role.
 */
async function getGlobalValidator() {
  try {
    const [[settings]] = await pool.execute(
      'SELECT global_validator_role FROM app_settings WHERE id = 1'
    );
    const role = settings?.global_validator_role;
    if (!role) return null;

    const [[user]] = await pool.execute(
      'SELECT id FROM users WHERE role = ? AND (blocked IS NULL OR blocked = 0) LIMIT 1',
      [role]
    );
    return user?.id ?? null;
  } catch {
    return null;
  }
}

/**
 * Vérifie si validatorId est bien le valideur désigné pour la demande
 * de submitterId de type `type`. Les admins peuvent toujours valider.
 */
async function isDesignatedValidator(validatorId, submitterId, type) {
  const designatedId = await findValidator(submitterId, type);
  return designatedId !== null && designatedId === validatorId;
}

module.exports = { findValidator, getGlobalValidator, isDesignatedValidator };

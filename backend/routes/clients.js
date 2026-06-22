// routes/clients.js
const router = require('express').Router();
const db = require('../config/db');
const { auth, adminOnly } = require('../middleware/auth');

// GET /api/clients — liste avec filtres optionnels
router.get('/', auth, async (req, res) => {
  try {
    const { search, categorie, statut } = req.query;
    let sql = 'SELECT * FROM clients WHERE 1=1';
    const params = [];

    if (search) {
      sql += ' AND (nom LIKE ? OR code LIKE ? OR zone LIKE ?)';
      const s = `%${search}%`;
      params.push(s, s, s);
    }
    if (categorie) { sql += ' AND categorie = ?'; params.push(categorie); }
    if (statut)    { sql += ' AND statut = ?';    params.push(statut); }

    sql += ' ORDER BY nom ASC';
    const [rows] = await db.query(sql, params);
    res.json(rows);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// GET /api/clients/:id
router.get('/:id', auth, async (req, res) => {
  try {
    const [rows] = await db.query('SELECT * FROM clients WHERE id = ?', [req.params.id]);
    if (!rows.length) return res.status(404).json({ error: 'Client non trouvé' });
    res.json(rows[0]);
  } catch (e) {
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// POST /api/clients
router.post('/', auth, async (req, res) => {
  try {
    const { nom, telephone, zone, adresse, categorie, statut, observation } = req.body;
    if (!nom || !categorie) return res.status(400).json({ error: 'Nom et catégorie requis' });

    // Génération code automatique
    const [last] = await db.query('SELECT MAX(id) as max_id FROM clients');
    const nextId = (last[0].max_id || 0) + 1;
    const code = 'CLI-' + String(nextId).padStart(3, '0');

    const [result] = await db.query(
      `INSERT INTO clients (code, nom, telephone, zone, adresse, categorie, statut, solde_global, observation)
       VALUES (?, ?, ?, ?, ?, ?, ?, 0, ?)`,
      [code, nom, telephone || null, zone || null, adresse || null,
       categorie, statut || 'actif', observation || null]
    );
    const [newClient] = await db.query('SELECT * FROM clients WHERE id = ?', [result.insertId]);
    res.status(201).json(newClient[0]);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// PUT /api/clients/:id
router.put('/:id', auth, async (req, res) => {
  try {
    const { nom, telephone, zone, adresse, categorie, statut, observation } = req.body;
    if (!nom || !categorie) return res.status(400).json({ error: 'Nom et catégorie requis' });

    await db.query(
      `UPDATE clients SET nom=?, telephone=?, zone=?, adresse=?, categorie=?, statut=?, observation=?
       WHERE id=?`,
      [nom, telephone || null, zone || null, adresse || null,
       categorie, statut || 'actif', observation || null, req.params.id]
    );
    const [updated] = await db.query('SELECT * FROM clients WHERE id = ?', [req.params.id]);
    res.json(updated[0]);
  } catch (e) {
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// DELETE /api/clients/:id — admin uniquement, archive si ventes existantes
router.delete('/:id', auth, adminOnly, async (req, res) => {
  try {
    const [ventes] = await db.query('SELECT COUNT(*) as n FROM ventes WHERE client_id = ?', [req.params.id]);
    if (ventes[0].n > 0) {
      // Archiver au lieu de supprimer
      await db.query('UPDATE clients SET statut = "archive" WHERE id = ?', [req.params.id]);
      return res.json({ message: 'Client archivé (ventes existantes)' });
    }
    await db.query('DELETE FROM clients WHERE id = ?', [req.params.id]);
    res.json({ message: 'Client supprimé' });
  } catch (e) {
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

module.exports = router;

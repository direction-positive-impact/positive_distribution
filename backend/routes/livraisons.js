// routes/livraisons.js — avec upload fichier et modification
const router = require('express').Router();
const db     = require('../config/db');
const { auth, adminOnly } = require('../middleware/auth');
const upload = require('../middleware/upload');
const { logAction } = require('../middleware/journal');

// GET /api/livraisons
router.get('/', auth, async (req, res) => {
  try {
    const [rows] = await db.query('SELECT * FROM livraisons ORDER BY date_livraison DESC, id DESC');
    res.json(rows);
  } catch (e) { res.status(500).json({ error: 'Erreur serveur' }); }
});

// POST /api/livraisons — avec fichier optionnel
router.post('/', auth, upload.single('fichier'), async (req, res) => {
  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();
    const { date_livraison, quantite_cartons, fournisseur, notes } = req.body;
    const qte = parseInt(quantite_cartons);
    if (!qte || qte <= 0) return res.status(400).json({ error: 'Quantité invalide' });

    const fichier = req.file ? req.file.filename : null;

    const [result] = await conn.query(
      'INSERT INTO livraisons (date_livraison, quantite_cartons, fournisseur, notes, fichier_facture) VALUES (?, ?, ?, ?, ?)',
      [date_livraison, qte, fournisseur || null, notes || null, fichier]
    );

    await conn.query('UPDATE stock_actuel SET cartons = cartons + ? WHERE id = 1', [qte]);
    await conn.query(
      `INSERT INTO stock_mouvements (date_mouvement, type_mouvement, cartons, plateaux, oeufs, motif, reference_id, reference_type)
       VALUES (?, 'entree', ?, 0, 0, ?, ?, 'livraison')`,
      [date_livraison, qte, `Livraison du ${date_livraison} — ${fournisseur || 'Fournisseur'}`, result.insertId]
    );

    await conn.commit();
    await logAction(req.user, 'CREATE', 'livraisons', `Livraison de ${qte} cartons — ${fournisseur || 'Fournisseur'}`);

    const [newLiv] = await db.query('SELECT * FROM livraisons WHERE id = ?', [result.insertId]);
    res.status(201).json(newLiv[0]);
  } catch (e) {
    await conn.rollback();
    console.error(e);
    res.status(500).json({ error: 'Erreur serveur' });
  } finally { conn.release(); }
});

// PUT /api/livraisons/:id — modifier quantité, fournisseur, notes + fichier
router.put('/:id', auth, adminOnly, upload.single('fichier'), async (req, res) => {
  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();
    const [rows] = await conn.query('SELECT * FROM livraisons WHERE id = ?', [req.params.id]);
    if (!rows.length) return res.status(404).json({ error: 'Livraison non trouvée' });
    const old = rows[0];

    const { date_livraison, quantite_cartons, fournisseur, notes } = req.body;
    const newQte = parseInt(quantite_cartons);
    if (!newQte || newQte <= 0) return res.status(400).json({ error: 'Quantité invalide' });

    const fichier = req.file ? req.file.filename : old.fichier_facture;
    const diff = newQte - old.quantite_cartons;

    await conn.query(
      'UPDATE livraisons SET date_livraison=?, quantite_cartons=?, fournisseur=?, notes=?, fichier_facture=? WHERE id=?',
      [date_livraison, newQte, fournisseur || null, notes || null, fichier, req.params.id]
    );

    // Ajuster le stock selon la différence
    if (diff !== 0) {
      await conn.query('UPDATE stock_actuel SET cartons = cartons + ? WHERE id = 1', [diff]);
      await conn.query(
        `INSERT INTO stock_mouvements (date_mouvement, type_mouvement, cartons, plateaux, oeufs, motif, reference_id, reference_type)
         VALUES (?, ?, ?, 0, 0, ?, ?, 'livraison')`,
        [date_livraison, diff > 0 ? 'entree' : 'sortie', Math.abs(diff),
         `Modification livraison — ajustement ${diff > 0 ? '+' : ''}${diff} cartons`, req.params.id]
      );
    }

    await conn.commit();
    await logAction(req.user, 'UPDATE', 'livraisons', `Livraison #${req.params.id} modifiée — ${newQte} cartons`);
    const [updated] = await db.query('SELECT * FROM livraisons WHERE id = ?', [req.params.id]);
    res.json(updated[0]);
  } catch (e) {
    await conn.rollback();
    res.status(500).json({ error: 'Erreur serveur' });
  } finally { conn.release(); }
});

// DELETE /api/livraisons/:id
router.delete('/:id', auth, adminOnly, async (req, res) => {
  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();
    const [rows] = await conn.query('SELECT * FROM livraisons WHERE id = ?', [req.params.id]);
    if (!rows.length) return res.status(404).json({ error: 'Non trouvé' });
    await conn.query('UPDATE stock_actuel SET cartons = GREATEST(0, cartons - ?) WHERE id = 1', [rows[0].quantite_cartons]);
    await conn.query('DELETE FROM stock_mouvements WHERE reference_id = ? AND reference_type = "livraison"', [req.params.id]);
    await conn.query('DELETE FROM livraisons WHERE id = ?', [req.params.id]);
    await conn.commit();
    await logAction(req.user, 'DELETE', 'livraisons', `Livraison #${req.params.id} supprimée`);
    res.json({ message: 'Livraison supprimée' });
  } catch (e) {
    await conn.rollback();
    res.status(500).json({ error: 'Erreur serveur' });
  } finally { conn.release(); }
});

module.exports = router;

// routes/recouvrements.js
const router = require('express').Router();
const db     = require('../config/db');
const { auth, adminOnly } = require('../middleware/auth');
const { logAction } = require('../middleware/journal');

router.get('/', auth, async (req, res) => {
  try {
    const { date_debut, date_fin, client_id } = req.query;
    let sql = `SELECT r.*, c.nom as client_nom, c.solde_global
               FROM recouvrements r LEFT JOIN clients c ON r.client_id = c.id WHERE 1=1`;
    const params = [];
    if (date_debut) { sql += ' AND r.date_paiement >= ?'; params.push(date_debut); }
    if (date_fin)   { sql += ' AND r.date_paiement <= ?'; params.push(date_fin); }
    if (client_id)  { sql += ' AND r.client_id = ?'; params.push(client_id); }
    sql += ' ORDER BY r.date_paiement DESC, r.id DESC';
    const [rows] = await db.query(sql, params);
    res.json(rows);
  } catch (e) { res.status(500).json({ error: 'Erreur serveur' }); }
});

router.post('/', auth, async (req, res) => {
  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();

    // Accepter les deux formats possibles
    const client_id    = req.body.client_id;
    const montant_recu = parseFloat(req.body.montant_recu || req.body.montant || 0);
    const date_paiement = req.body.date_paiement;
    const date_suivi   = req.body.date_suivi   || null;
    const observation  = req.body.observation  || null;

    if (!client_id || !montant_recu || montant_recu <= 0 || !date_paiement) {
      await conn.release();
      return res.status(400).json({ error: 'Client, montant et date requis' });
    }

    const [clientRows] = await conn.query('SELECT * FROM clients WHERE id = ?', [client_id]);
    if (!clientRows.length) {
      await conn.release();
      return res.status(404).json({ error: 'Client non trouvé' });
    }
    const client = clientRows[0];
    const montant_restant = Math.max(0, parseFloat(client.solde_global) - montant_recu);

    const [result] = await conn.query(
      `INSERT INTO recouvrements (client_id, date_paiement, montant_recu, montant_restant, date_suivi, observation)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [client_id, date_paiement, montant_recu, montant_restant, date_suivi, observation]
    );

    await conn.query('UPDATE clients SET solde_global = ? WHERE id = ?', [montant_restant, client_id]);
    await conn.commit();

    await logAction(req.user, 'CREATE', 'recouvrements',
      `Paiement de ${montant_recu} FCFA reçu de ${client.nom}`);

    const [newRec] = await db.query(
      `SELECT r.*, c.nom as client_nom FROM recouvrements r
       LEFT JOIN clients c ON r.client_id = c.id WHERE r.id = ?`, [result.insertId]
    );
    res.status(201).json(newRec[0]);
  } catch (e) {
    await conn.rollback();
    console.error(e);
    res.status(500).json({ error: 'Erreur serveur: ' + e.message });
  } finally { conn.release(); }
});

router.put('/:id', auth, adminOnly, async (req, res) => {
  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();
    const [rows] = await conn.query('SELECT * FROM recouvrements WHERE id = ?', [req.params.id]);
    if (!rows.length) return res.status(404).json({ error: 'Non trouvé' });
    const old = rows[0];

    const montant_recu  = parseFloat(req.body.montant_recu || req.body.montant || 0);
    const date_paiement = req.body.date_paiement;
    const observation   = req.body.observation || null;

    // Recalculer le solde client
    const [clientRows] = await conn.query('SELECT * FROM clients WHERE id = ?', [old.client_id]);
    if (!clientRows.length) return res.status(404).json({ error: 'Client non trouvé' });
    const soldeAvant = parseFloat(clientRows[0].solde_global) + parseFloat(old.montant_recu);
    const montant_restant = Math.max(0, soldeAvant - montant_recu);

    await conn.query(
      'UPDATE recouvrements SET date_paiement=?, montant_recu=?, montant_restant=?, observation=? WHERE id=?',
      [date_paiement, montant_recu, montant_restant, observation, req.params.id]
    );
    await conn.query('UPDATE clients SET solde_global = ? WHERE id = ?', [montant_restant, old.client_id]);
    await conn.commit();

    await logAction(req.user, 'UPDATE', 'recouvrements', `Recouvrement #${req.params.id} modifié`);
    const [updated] = await db.query(
      `SELECT r.*, c.nom as client_nom FROM recouvrements r LEFT JOIN clients c ON r.client_id = c.id WHERE r.id = ?`,
      [req.params.id]
    );
    res.json(updated[0]);
  } catch (e) {
    await conn.rollback();
    res.status(500).json({ error: 'Erreur serveur' });
  } finally { conn.release(); }
});

router.delete('/:id', auth, adminOnly, async (req, res) => {
  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();
    const [rows] = await conn.query('SELECT * FROM recouvrements WHERE id = ?', [req.params.id]);
    if (!rows.length) return res.status(404).json({ error: 'Non trouvé' });
    const r = rows[0];
    await conn.query('UPDATE clients SET solde_global = solde_global + ? WHERE id = ?', [r.montant_recu, r.client_id]);
    await conn.query('DELETE FROM recouvrements WHERE id = ?', [req.params.id]);
    await conn.commit();
    await logAction(req.user, 'DELETE', 'recouvrements', `Recouvrement #${req.params.id} supprimé`);
    res.json({ message: 'Recouvrement supprimé, solde restauré' });
  } catch (e) {
    await conn.rollback();
    res.status(500).json({ error: 'Erreur serveur' });
  } finally { conn.release(); }
});

module.exports = router;

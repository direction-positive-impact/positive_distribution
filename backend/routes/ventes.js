// routes/ventes.js
const router = require('express').Router();
const db     = require('../config/db');
const { auth, adminOnly } = require('../middleware/auth');
const { logAction } = require('../middleware/journal');

router.get('/', auth, async (req, res) => {
  try {
    const { date, client_id, statut, date_debut, date_fin } = req.query;
    let sql = `SELECT v.*, c.nom as client_nom, c.zone as client_zone, c.categorie as client_cat
               FROM ventes v LEFT JOIN clients c ON v.client_id = c.id WHERE 1=1`;
    const params = [];
    if (date)       { sql += ' AND v.date_vente = ?';    params.push(date); }
    if (date_debut) { sql += ' AND v.date_vente >= ?';   params.push(date_debut); }
    if (date_fin)   { sql += ' AND v.date_vente <= ?';   params.push(date_fin); }
    if (client_id)  { sql += ' AND v.client_id = ?';     params.push(client_id); }
    if (statut === 'solde')   sql += ' AND v.solde <= 0';
    if (statut === 'impaye')  sql += ' AND v.solde > 0 AND v.paiement = 0';
    if (statut === 'partiel') sql += ' AND v.solde > 0 AND v.paiement > 0';
    sql += ' ORDER BY v.date_vente DESC, v.id DESC';
    const [rows] = await db.query(sql, params);
    res.json(rows);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

router.post('/', auth, async (req, res) => {
  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();
    const { date_vente, client_id, quantite, prix_unitaire, paiement, observations } = req.body;
    const qte  = parseInt(quantite);
    const pu   = parseInt(prix_unitaire);
    const pay  = parseFloat(paiement) || 0;

    if (!client_id || !qte || !pu || qte <= 0 || pu <= 0)
      return res.status(400).json({ error: 'Client, quantité et prix requis' });

    const [stockRows] = await conn.query('SELECT cartons FROM stock_actuel WHERE id = 1');
    const stock = stockRows[0]?.cartons || 0;
    if (qte > stock)
      return res.status(400).json({ error: `Stock insuffisant. Disponible : ${stock} cartons` });

    const total = qte * pu;
    const solde = Math.max(0, total - pay);

    const [lastVente] = await conn.query('SELECT MAX(id) as max_id FROM ventes');
    const nextId = (lastVente[0].max_id || 0) + 1;
    const numero = 'VTE-' + String(nextId).padStart(3, '0');

    const [result] = await conn.query(
      `INSERT INTO ventes (date_vente, numero, client_id, quantite, prix_unitaire, total, paiement, solde, observations)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [date_vente, numero, client_id, qte, pu, total, pay, solde, observations || null]
    );

    await conn.query('UPDATE stock_actuel SET cartons = cartons - ? WHERE id = 1', [qte]);

    const [clientRow] = await conn.query('SELECT nom FROM clients WHERE id = ?', [client_id]);
    const clientNom = clientRow[0]?.nom || 'Client';
    await conn.query(
      `INSERT INTO stock_mouvements (date_mouvement, type_mouvement, cartons, plateaux, oeufs, motif, reference_id, reference_type)
       VALUES (?, 'sortie', ?, 0, 0, ?, ?, 'vente')`,
      [date_vente, qte, `Vente à ${clientNom} — ${qte} cartons`, result.insertId]
    );

    // Mettre à jour solde client
    await conn.query('UPDATE clients SET solde_global = solde_global + ? WHERE id = ?', [solde, client_id]);

    await conn.commit();
    await logAction(req.user, 'CREATE', 'ventes',
      `Vente ${numero} — ${qte} cartons à ${clientNom} — Total: ${total} FCFA`);

    const [newVente] = await db.query(
      `SELECT v.*, c.nom as client_nom FROM ventes v LEFT JOIN clients c ON v.client_id = c.id WHERE v.id = ?`,
      [result.insertId]
    );
    res.status(201).json(newVente[0]);
  } catch (e) {
    await conn.rollback();
    console.error(e);
    res.status(500).json({ error: e.message || 'Erreur serveur' });
  } finally { conn.release(); }
});

router.put('/:id', auth, async (req, res) => {
  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();
    const { date_vente, client_id, quantite, prix_unitaire, paiement, observations } = req.body;
    const qte  = parseInt(quantite);
    const pu   = parseInt(prix_unitaire);
    const pay  = parseFloat(paiement) || 0;
    const total = qte * pu;
    const solde = Math.max(0, total - pay);

    const [oldRows] = await conn.query('SELECT * FROM ventes WHERE id = ?', [req.params.id]);
    if (!oldRows.length) return res.status(404).json({ error: 'Vente non trouvée' });
    const old = oldRows[0];
    const diff = qte - old.quantite;

    const [stockRows] = await conn.query('SELECT cartons FROM stock_actuel WHERE id = 1');
    if (diff > (stockRows[0]?.cartons || 0))
      return res.status(400).json({ error: 'Stock insuffisant' });

    await conn.query(
      `UPDATE ventes SET date_vente=?, client_id=?, quantite=?, prix_unitaire=?, total=?, paiement=?, solde=?, observations=? WHERE id=?`,
      [date_vente, client_id, qte, pu, total, pay, solde, observations || null, req.params.id]
    );

    if (diff !== 0)
      await conn.query('UPDATE stock_actuel SET cartons = cartons - ? WHERE id = 1', [diff]);

    // Recalculer solde client
    await conn.query(
      'UPDATE clients SET solde_global = solde_global - ? + ? WHERE id = ?',
      [old.solde, solde, old.client_id]
    );

    await conn.commit();
    await logAction(req.user, 'UPDATE', 'ventes', `Vente #${req.params.id} modifiée`);
    const [updated] = await db.query('SELECT * FROM ventes WHERE id = ?', [req.params.id]);
    res.json(updated[0]);
  } catch (e) {
    await conn.rollback();
    res.status(500).json({ error: 'Erreur serveur' });
  } finally { conn.release(); }
});

// DELETE — FIX : supprime aussi le solde impayé du client
router.delete('/:id', auth, adminOnly, async (req, res) => {
  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();
    const [rows] = await conn.query('SELECT * FROM ventes WHERE id = ?', [req.params.id]);
    if (!rows.length) return res.status(404).json({ error: 'Vente non trouvée' });
    const v = rows[0];

    // Restaurer le stock
    await conn.query('UPDATE stock_actuel SET cartons = cartons + ? WHERE id = 1', [v.quantite]);

    // Restaurer le solde client — soustraire le solde impayé de cette vente
    await conn.query(
      'UPDATE clients SET solde_global = GREATEST(0, solde_global - ?) WHERE id = ?',
      [v.solde, v.client_id]
    );

    // Supprimer mouvement stock lié
    await conn.query(
      'DELETE FROM stock_mouvements WHERE reference_id = ? AND reference_type = "vente"',
      [req.params.id]
    );

    await conn.query('DELETE FROM ventes WHERE id = ?', [req.params.id]);
    await conn.commit();
    await logAction(req.user, 'DELETE', 'ventes',
      `Vente #${req.params.id} supprimée — stock restauré: ${v.quantite} cartons`);

    res.json({ message: 'Vente supprimée, stock et solde restaurés' });
  } catch (e) {
    await conn.rollback();
    res.status(500).json({ error: 'Erreur serveur' });
  } finally { conn.release(); }
});

module.exports = router;

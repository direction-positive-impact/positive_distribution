// routes/stock.js — Fix soustraction oeufs cassés + affichage détaillé
const router = require('express').Router();
const db     = require('../config/db');
const { auth, adminOnly } = require('../middleware/auth');
const { logAction } = require('../middleware/journal');

// Utilitaire : normaliser un total d'oeufs en { cartons, plateaux, oeufs }
function normaliser(totalOeufs) {
  const t = Math.max(0, totalOeufs);
  return {
    cartons:  Math.floor(t / 360),
    plateaux: Math.floor((t % 360) / 30),
    oeufs:    t % 30,
    total_oeufs: t,
    total_plateaux: Math.floor(t / 30),
  };
}

// GET /api/stock
router.get('/', auth, async (req, res) => {
  try {
    const [rows] = await db.query('SELECT * FROM stock_actuel WHERE id = 1');
    const s = rows[0] || { cartons: 0, plateaux: 0, oeufs: 0 };
    const totalOeufs = s.cartons * 360 + s.plateaux * 30 + s.oeufs;
    res.json({
      ...s,
      total_oeufs:    totalOeufs,
      total_plateaux: Math.floor(totalOeufs / 30),
    });
  } catch (e) { res.status(500).json({ error: 'Erreur serveur' }); }
});

// GET /api/stock/mouvements
router.get('/mouvements', auth, async (req, res) => {
  try {
    const [rows] = await db.query(
      `SELECT id,
        DATE_FORMAT(date_mouvement, '%Y-%m-%d') as date_mouvement,
        type_mouvement, cartons, plateaux, oeufs, motif, reference_type
       FROM stock_mouvements
       ORDER BY date_mouvement DESC, id DESC LIMIT 300`
    );
    res.json(rows);
  } catch (e) { res.status(500).json({ error: 'Erreur serveur' }); }
});

// POST /api/stock/ajustement
router.post('/ajustement', auth, async (req, res) => {
  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();
    const { date_mouvement, type_mouvement, cartons, plateaux, oeufs, motif } = req.body;
    if (!motif || motif.trim().length < 3)
      return res.status(400).json({ error: 'Motif obligatoire (minimum 3 caractères)' });
    if (!date_mouvement)
      return res.status(400).json({ error: 'Date obligatoire' });

    const c = parseInt(cartons)  || 0;
    const p = parseInt(plateaux) || 0;
    const o = parseInt(oeufs)    || 0;
    const totalAjust = c * 360 + p * 30 + o;

    const [stockRows] = await conn.query('SELECT * FROM stock_actuel WHERE id = 1');
    const s = stockRows[0];
    let totalStock = s.cartons * 360 + s.plateaux * 30 + s.oeufs;

    if (type_mouvement === 'entree') {
      totalStock += totalAjust;
    } else if (type_mouvement === 'sortie' || type_mouvement === 'perte') {
      totalStock = Math.max(0, totalStock - totalAjust);
    } else { // ajustement exact
      totalStock = totalAjust;
    }

    const { cartons: nc, plateaux: np, oeufs: no } = normaliser(totalStock);
    await conn.query('UPDATE stock_actuel SET cartons=?, plateaux=?, oeufs=? WHERE id=1', [nc, np, no]);

    await conn.query(
      `INSERT INTO stock_mouvements (date_mouvement, type_mouvement, cartons, plateaux, oeufs, motif)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [date_mouvement, type_mouvement, c, p, o, motif.trim()]
    );

    await conn.commit();
    await logAction(req.user, 'CREATE', 'stock',
      `Ajustement ${type_mouvement} — ${c}crt ${p}plt ${o}oeufs — ${motif}`);

    res.json({ cartons: nc, plateaux: np, oeufs: no, message: 'Stock ajusté' });
  } catch (e) {
    await conn.rollback();
    console.error(e);
    res.status(500).json({ error: e.message || 'Erreur serveur' });
  } finally { conn.release(); }
});

// DELETE /api/stock/mouvements/:id
router.delete('/mouvements/:id', auth, adminOnly, async (req, res) => {
  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();
    const [rows] = await conn.query('SELECT * FROM stock_mouvements WHERE id = ?', [req.params.id]);
    if (!rows.length) return res.status(404).json({ error: 'Mouvement non trouvé' });
    const m = rows[0];

    if (m.reference_type && m.reference_type !== '' && m.reference_type !== null) {
      return res.status(400).json({ error: 'Ce mouvement est lié à une vente/livraison. Supprimez-la directement.' });
    }

    const totalM = m.cartons * 360 + m.plateaux * 30 + m.oeufs;
    const [stockRows] = await conn.query('SELECT * FROM stock_actuel WHERE id = 1');
    const s = stockRows[0];
    let total = s.cartons * 360 + s.plateaux * 30 + s.oeufs;

    if (m.type_mouvement === 'entree') total = Math.max(0, total - totalM);
    else total += totalM;

    const { cartons: nc, plateaux: np, oeufs: no } = normaliser(total);
    await conn.query('UPDATE stock_actuel SET cartons=?, plateaux=?, oeufs=? WHERE id=1', [nc, np, no]);
    await conn.query('DELETE FROM stock_mouvements WHERE id = ?', [req.params.id]);
    await conn.commit();
    await logAction(req.user, 'DELETE', 'stock', `Mouvement stock #${req.params.id} supprimé`);
    res.json({ message: 'Mouvement supprimé, stock restauré', cartons: nc, plateaux: np, oeufs: no });
  } catch (e) {
    await conn.rollback();
    res.status(500).json({ error: 'Erreur serveur' });
  } finally { conn.release(); }
});

module.exports = router;

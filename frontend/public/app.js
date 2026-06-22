// ╔══════════════════════════════════════════════════════════════╗
// ║  Positive Distribution — app.js v3                         ║
// ╚══════════════════════════════════════════════════════════════╝

const API = '/api';

let token        = localStorage.getItem('pd_token');
let currentUser  = JSON.parse(localStorage.getItem('pd_user') || 'null');
let isDark       = localStorage.getItem('pd_theme') !== 'light';
let prixActifs   = {};
let clientsCache = [];
let rapportData  = null;

const today = () => new Date().toISOString().split('T')[0];
const fmt   = n  => Number(n || 0).toLocaleString('fr-FR') + ' FCFA';
const fmtN  = n  => Number(n || 0).toLocaleString('fr-FR');
const pad2  = n  => String(n).padStart(2, '0');

const catLabel = c =>
  c === 'revendeur_principal' ? 'Rev. Principal' :
  c === 'autre_revendeur'     ? 'Autre Rev.'     : 'Patisserie/Conso';

const statutBadge = v => {
  if (!Number(v.solde) || Number(v.solde) <= 0) return '<span class="badge badge-green">Soldé</span>';
  if (Number(v.paiement) > 0)                   return '<span class="badge badge-amber">Partiel</span>';
  return '<span class="badge badge-red">Impayé</span>';
};

const mvtBadge = t => ({
  entree:'<span class="badge badge-green">Entrée</span>',
  sortie:'<span class="badge badge-red">Sortie</span>',
  perte:'<span class="badge badge-amber">Perte</span>',
  ajustement:'<span class="badge badge-blue">Ajustement</span>',
}[t] || `<span class="badge">${t}</span>`);

const actionBadge = a => ({
  CREATE:'<span class="badge badge-green">Création</span>',
  UPDATE:'<span class="badge badge-blue">Modification</span>',
  DELETE:'<span class="badge badge-red">Suppression</span>',
  LOGIN: '<span class="badge badge-amber">Connexion</span>',
}[a] || `<span class="badge">${a}</span>`);

const moduleBadge = m => ({
  ventes:'🛒 Ventes', livraisons:'📦 Livraisons', recouvrements:'💰 Recouvrements',
  stock:'📋 Stock', pertes:'💔 Pertes', banque:'🏦 Banque', clients:'👥 Clients',
  auth:'🔐 Auth', prix:'🏷️ Prix', utilisateurs:'👤 Utilisateurs',
}[m] || m);

const isAdmin = () => currentUser && currentUser.role === 'Admin';

// ── Stock : affichage cartons + conversion ──
function afficherStock(cartons, plateaux, oeufs) {
  const totalO = cartons * 360 + plateaux * 30 + oeufs;
  const totalP = Math.floor(totalO / 30);
  if (document.getElementById('st-cartons')) {
    document.getElementById('st-cartons').textContent  = cartons;
    document.getElementById('st-plateaux').textContent = plateaux;
    document.getElementById('st-oeufs').textContent    = oeufs;
    document.getElementById('st-total-oeufs').textContent  = fmtN(totalO) + ' œufs';
    document.getElementById('st-total-plats').textContent  = fmtN(totalP) + ' plateaux';
  }
  // KPI dashboard
  if (document.getElementById('kpi-stock')) {
    document.getElementById('kpi-stock').textContent = cartons + ' cartons';
    const sub = document.getElementById('kpi-stock-sub');
    if (sub) sub.textContent = `= ${plateaux} plateaux + ${oeufs} œufs restants`;
  }
}

// ── Appel API ──────────────────────────────────────────────────
async function api(path, method = 'GET', body = null) {
  const opts = { method, headers: {} };
  if (token) opts.headers['Authorization'] = 'Bearer ' + token;
  if (body instanceof FormData) {
    opts.body = body;
  } else if (body) {
    opts.headers['Content-Type'] = 'application/json';
    opts.body = JSON.stringify(body);
  }
  const r    = await fetch(API + path, opts);
  const data = await r.json();
  if (r.status === 401) { doLogout(); return; }
  if (!r.ok) throw new Error(data.error || 'Erreur serveur');
  return data;
}

function showToast(msg, type = 'success') {
  const t = document.getElementById('toast');
  t.textContent = msg; t.className = 'toast ' + type + ' show';
  setTimeout(() => t.classList.remove('show'), 3500);
}

// ══════════════════════════════════════════════════════════════
// AUTH
// ══════════════════════════════════════════════════════════════
async function doLogin() {
  const email = document.getElementById('li-email').value.trim();
  const pass  = document.getElementById('li-pass').value;
  const err   = document.getElementById('li-err');
  err.style.display = 'none';
  try {
    const data  = await api('/auth/login', 'POST', { email, mot_de_passe: pass });
    token       = data.token;
    currentUser = data.user;
    localStorage.setItem('pd_token', token);
    localStorage.setItem('pd_user', JSON.stringify(currentUser));
    startApp();
  } catch (e) { err.textContent = e.message; err.style.display = 'block'; }
}

function doLogout() {
  token = null; currentUser = null;
  localStorage.removeItem('pd_token'); localStorage.removeItem('pd_user');
  document.getElementById('login-wrap').style.display = 'flex';
}

function startApp() {
  document.getElementById('login-wrap').style.display = 'none';
  document.getElementById('sb-name').textContent   = currentUser.nom;
  document.getElementById('sb-role').textContent   = currentUser.role;
  document.getElementById('sb-avatar').textContent = currentUser.nom[0].toUpperCase();
  document.getElementById('topbar-date').textContent = new Date().toLocaleDateString('fr-FR',
    { weekday:'long', day:'numeric', month:'long', year:'numeric' });

  // Restrictions commerciaux
  applyRoleRestrictions();
  applyTheme();
  setupNavigation();
  setupImportExport();
  loadPrix().then(() => nav('dashboard'));
}

function applyRoleRestrictions() {
  if (!isAdmin()) {
    // Cacher modules admin dans la sidebar
    document.querySelectorAll('.admin-only').forEach(el => el.style.display = 'none');
  }
}

// ── Thème ──────────────────────────────────────────────────────
function applyTheme() {
  document.body.classList.toggle('light', !isDark);
  const btn = document.getElementById('theme-btn');
  if (btn) btn.textContent = isDark ? '🌙 Thème' : '☀️ Thème';
}
function toggleTheme() {
  isDark = !isDark;
  localStorage.setItem('pd_theme', isDark ? 'dark' : 'light');
  applyTheme();
}

// ── Navigation ─────────────────────────────────────────────────
const pageTitles = {
  dashboard:'Tableau de bord', ventes:'Ventes', livraisons:'Livraison du jour',
  repartition:'Répartition du jour', clients:'Clients', recouvrements:'Recouvrements',
  impayes:'Impayés', stock:'Stock', pertes:'Pertes & Casse', banque:'Banque',
  rapports:'Rapports & PDF', prix:'Prix carton', import:'Import / Export',
  users:'Utilisateurs', journal:'Journal d\'activité',
};

// Pages interdites aux commerciaux
const PAGES_ADMIN = ['banque', 'users', 'journal', 'prix', 'fournisseurs', 'factures'];

function setupNavigation() {
  document.querySelectorAll('.nav-item[data-page]').forEach(item => {
    item.addEventListener('click', () => nav(item.dataset.page));
  });
}

function nav(page) {
  if (!isAdmin() && PAGES_ADMIN.includes(page)) return;
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
  const pg = document.getElementById('page-' + page);
  if (pg) pg.classList.add('active');
  document.querySelectorAll(`.nav-item[data-page="${page}"]`).forEach(n => n.classList.add('active'));
  document.getElementById('page-title').textContent = pageTitles[page] || page;
  if (page === 'rapports') document.getElementById('rpt-date').value = today();
  const loaders = {
    dashboard:loadDashboard, ventes:loadVentes, livraisons:loadLivraisons,
    repartition:loadRepartition, clients:loadClients, recouvrements:loadRecouvrements,
    impayes:loadImpayes, stock:loadStock, pertes:loadPertes, banque:loadBanque,
    prix:loadPrix2, users:loadUsers, journal:loadJournal,
    fournisseurs:loadFournisseursPage, factures:loadFacturesPage,
  };
  if (loaders[page]) loaders[page]();
  if (window.innerWidth <= 768) closeSidebar();
}

function toggleSidebar() { document.getElementById('sidebar').classList.toggle('open'); document.getElementById('mobile-overlay').classList.toggle('show'); }
function closeSidebar()  { document.getElementById('sidebar').classList.remove('open');  document.getElementById('mobile-overlay').classList.remove('show'); }
function openModal(id)   { document.getElementById(id).classList.add('open'); }
function closeModal(id)  { document.getElementById(id).classList.remove('open'); }

// ── Wrappers de chargement pages combinées ──
async function loadFournisseursPage() {
  await loadFournisseurs();
  await loadPrixAchatHistorique();
}
async function loadFacturesPage() {
  if (!fournisseursCache.length) await loadFournisseurs();
  await loadFactures();
}

// ── Prix ───────────────────────────────────────────────────────
async function loadPrix() {
  try { const d = await api('/prix/actifs'); d.forEach(p => { prixActifs[p.categorie] = p.prix_unitaire; }); }
  catch (e) {}
}
const getPrix = cat => prixActifs[cat] || 0;

// ══════════════════════════════════════════════════════════════
// DASHBOARD
// ══════════════════════════════════════════════════════════════
async function loadDashboard() {
  try {
    const [ventes, recouvrements, clients, stock] = await Promise.all([
      api('/ventes?date=' + today()),
      api('/recouvrements?date_debut=' + today() + '&date_fin=' + today()),
      api('/clients'), api('/stock'),
    ]);
    clientsCache = clients;
    const totalV   = ventes.reduce((s,v) => s+Number(v.total), 0);
    const totalP   = ventes.reduce((s,v) => s+Number(v.paiement), 0);
    const totalR   = recouvrements.reduce((s,r) => s+Number(r.montant_recu), 0);
    const totalImp = clients.reduce((s,c) => s+Number(c.solde_global), 0);
    const nbImp    = clients.filter(c => Number(c.solde_global) > 0).length;

    document.getElementById('kpi-ventes').textContent    = fmt(totalV);
    document.getElementById('kpi-ventes-nb').textContent = ventes.length + ' vente(s)';
    document.getElementById('kpi-cash').textContent      = fmt(totalP + totalR);
    document.getElementById('kpi-impayes').textContent   = fmt(totalImp);
    document.getElementById('kpi-imp-nb').textContent    = nbImp + ' client(s) débiteur(s)';
    document.getElementById('badge-imp').textContent     = nbImp;

    // ── Stock avec conversion complète ──
    const { cartons, plateaux, oeufs } = stock;
    document.getElementById('kpi-stock').textContent = cartons + ' cartons';
    const kpiSub = document.getElementById('kpi-stock-sub');
    const totalO = cartons * 360 + plateaux * 30 + oeufs;
    if (kpiSub) {
      if (cartons === 0 && (plateaux > 0 || oeufs > 0)) {
        kpiSub.textContent = `${plateaux} plateau(x) + ${oeufs} œuf(s)`;
      } else if (plateaux > 0 || oeufs > 0) {
        kpiSub.textContent = `+ ${plateaux} plat. + ${oeufs} œufs = ${fmtN(totalO)} œufs`;
      } else {
        kpiSub.textContent = `${fmtN(totalO)} œufs au total`;
      }
    }

    // Banque visible uniquement pour admins
    if (isAdmin()) {
      try {
        const soldeData = await api('/banque/solde');
        if (document.getElementById('kpi-banque')) {
          document.getElementById('kpi-banque').textContent = fmt(soldeData.solde);
        }
      } catch(e) {}

      // Marge bénéficiaire du jour
      try {
        const marge = await api('/rapports/marge/' + today());
        const elMarge = document.getElementById('kpi-marge');
        const elMargeSub = document.getElementById('kpi-marge-sub');
        if (elMarge) {
          elMarge.textContent = fmt(marge.marge_brute);
          elMarge.className = 'kpi-value ' + (marge.marge_brute >= 0 ? 'text-green' : 'text-red');
        }
        if (elMargeSub) {
          if (marge.quantite_vendue > 0) {
            elMargeSub.textContent = `${fmtN(marge.marge_par_carton)} FCFA/carton — prix achat moyen: ${fmtN(marge.prix_achat_moyen)}`;
          } else {
            elMargeSub.textContent = 'Aucune vente aujourd\'hui';
          }
        }
      } catch(e) {}

      // Compte fournisseurs (dette globale ou crédit d'avance)
      try {
        const comptes = await api('/factures/comptes');
        const totalSolde = comptes.reduce((s,f) => s + Number(f.solde_compte || 0), 0);
        const elFourn = document.getElementById('kpi-fournisseur');
        const elFournSub = document.getElementById('kpi-fournisseur-sub');
        if (elFourn) {
          if (totalSolde > 0) {
            elFourn.textContent = fmt(totalSolde);
            elFourn.className = 'kpi-value text-red';
            if (elFournSub) elFournSub.textContent = 'Total dû aux fournisseurs';
          } else if (totalSolde < 0) {
            elFourn.textContent = fmt(Math.abs(totalSolde));
            elFourn.className = 'kpi-value text-green';
            if (elFournSub) elFournSub.textContent = 'Crédit d\'avance disponible';
          } else {
            elFourn.textContent = fmt(0);
            elFourn.className = 'kpi-value text-green';
            if (elFournSub) elFournSub.textContent = 'Comptes à jour';
          }
        }
      } catch(e) {}
    }

    // Chart 7j
    const days = [];
    for (let i = 6; i >= 0; i--) { const d = new Date(); d.setDate(d.getDate()-i); days.push(d.toISOString().split('T')[0]); }
    const allV = await api('/ventes?date_debut=' + days[0] + '&date_fin=' + days[6]);
    const vals = days.map(d => allV.filter(v => v.date_vente === d).reduce((s,v) => s+Number(v.total),0));
    const mx = Math.max(...vals, 1);
    document.getElementById('bars-chart').innerHTML = vals.map((v,i) =>
      `<div class="bar" style="height:${Math.max(4,Math.round(v/mx*100))}px" title="${fmt(v)}"></div>`).join('');
    document.getElementById('bars-labels').innerHTML = days.map(d =>
      `<div class="bar-lbl">${d.slice(8)}</div>`).join('');

    const top = [...clients].filter(c=>Number(c.solde_global)>0).sort((a,b)=>b.solde_global-a.solde_global).slice(0,5);
    document.getElementById('tbl-top-imp').innerHTML = top.map(c =>
      `<tr><td>${c.nom}</td><td class="text-right text-red fw600">${fmt(c.solde_global)}</td></tr>`).join('')
      || '<tr><td colspan="2" class="empty">Aucun impayé 🎉</td></tr>';

    document.getElementById('tbl-vj').innerHTML = ventes.map(v =>
      `<tr><td>${v.client_nom||'?'}</td><td>${v.quantite} crt.</td><td class="text-green">${fmt(v.total)}</td><td>${fmt(v.paiement)}</td><td>${statutBadge(v)}</td></tr>`).join('')
      || '<tr><td colspan="5" class="empty">Aucune vente aujourd\'hui</td></tr>';
  } catch (e) { console.error(e); }
}

// ══════════════════════════════════════════════════════════════
// VENTES
// ══════════════════════════════════════════════════════════════
async function loadVentes() {
  const tbody = document.getElementById('tbl-ventes');
  tbody.innerHTML = '<tr><td colspan="10" class="loading">Chargement…</td></tr>';
  try {
    let q = '';
    const d  = document.getElementById('fv-date').value;
    const cl = document.getElementById('fv-client').value.trim();
    const st = document.getElementById('fv-statut').value;
    if (d)  q += '&date=' + d;
    if (st) q += '&statut=' + st;
    let data = await api('/ventes?' + q);
    if (cl) data = data.filter(v => (v.client_nom||'').toLowerCase().includes(cl.toLowerCase()));
    tbody.innerHTML = data.map(v => {
      const del = isAdmin()
        ? `<button class="btn btn-danger" style="padding:3px 8px;font-size:11px" onclick="deleteVente(${v.id})">✕</button>` : '';
      return `<tr><td>${v.date_vente}</td><td>${v.numero}</td><td>${v.client_nom||'?'}</td><td>${v.quantite}</td><td>${fmtN(v.prix_unitaire)}</td><td class="text-green fw600">${fmt(v.total)}</td><td>${fmt(v.paiement)}</td><td class="${Number(v.solde)>0?'text-red':''}">${fmt(v.solde)}</td><td>${statutBadge(v)}</td><td>${del}</td></tr>`;
    }).join('') || '<tr><td colspan="10" class="empty">Aucune vente</td></tr>';
    document.getElementById('tot-v-total').textContent = fmt(data.reduce((s,v)=>s+Number(v.total),0));
    document.getElementById('tot-v-paye').textContent  = fmt(data.reduce((s,v)=>s+Number(v.paiement),0));
    document.getElementById('tot-v-solde').textContent = fmt(data.reduce((s,v)=>s+Number(v.solde),0));
  } catch (e) { tbody.innerHTML = `<tr><td colspan="10" class="empty" style="color:var(--red)">${e.message}</td></tr>`; }
}

async function openVenteModal() {
  document.getElementById('mv-date').value = today();
  ['mv-qte','mv-pu','mv-total','mv-solde','mv-obs'].forEach(f => document.getElementById(f).value = '');
  document.getElementById('mv-paye').value = '0';
  const sel = document.getElementById('mv-client');
  sel.innerHTML = '<option value="">Sélectionner…</option>';
  try {
    const clients = await api('/clients?statut=actif');
    clientsCache = clients;
    clients.forEach(c => sel.innerHTML += `<option value="${c.id}" data-cat="${c.categorie}">${c.nom}</option>`);
  } catch (e) {}
  openModal('m-vente');
}

function fillVentePrix() {
  const sel = document.getElementById('mv-client');
  const opt = sel.options[sel.selectedIndex];
  if (opt && opt.dataset.cat) document.getElementById('mv-pu').value = getPrix(opt.dataset.cat);
  calcVente();
}
function calcVente() {
  const q   = parseInt(document.getElementById('mv-qte').value)||0;
  const p   = parseInt(document.getElementById('mv-pu').value)||0;
  const pay = parseFloat(document.getElementById('mv-paye').value)||0;
  const tot = q * p;
  document.getElementById('mv-total').value = fmt(tot);
  document.getElementById('mv-solde').value = fmt(Math.max(0, tot - pay));
}
async function saveVente() {
  const client_id = document.getElementById('mv-client').value;
  const quantite  = document.getElementById('mv-qte').value;
  const prix_unitaire = document.getElementById('mv-pu').value;
  const paiement  = document.getElementById('mv-paye').value || 0;
  if (!client_id || !quantite || !prix_unitaire) { showToast('Client, quantité et prix requis', 'error'); return; }
  try {
    await api('/ventes', 'POST', { date_vente:document.getElementById('mv-date').value, client_id, quantite, prix_unitaire, paiement, observations:document.getElementById('mv-obs').value });
    closeModal('m-vente'); showToast('Vente enregistrée ✓'); loadVentes();
  } catch (e) { showToast(e.message, 'error'); }
}
async function deleteVente(id) {
  if (!confirm('Supprimer cette vente ? Stock et solde client seront restaurés.')) return;
  try { await api('/ventes/' + id, 'DELETE'); showToast('Vente supprimée, stock et solde restaurés'); loadVentes(); }
  catch (e) { showToast(e.message, 'error'); }
}

// ══════════════════════════════════════════════════════════════
// LIVRAISONS
// ══════════════════════════════════════════════════════════════
async function loadLivraisons() {
  const tbody = document.getElementById('tbl-livr');
  tbody.innerHTML = '<tr><td colspan="6" class="loading">Chargement…</td></tr>';
  try {
    const data = await api('/livraisons');
    tbody.innerHTML = data.map(l => {
      const fichierLink = l.fichier_facture
        ? `<a href="/uploads/${l.fichier_facture}" target="_blank" style="color:var(--acc);font-size:11px">📎 Voir</a>` : '—';
      const editBtn = `<button class="btn" style="padding:3px 8px;font-size:11px" onclick="openLivrEdit(${l.id})">✏️</button>`;
      const delBtn  = isAdmin() ? `<button class="btn btn-danger" style="padding:3px 8px;font-size:11px" onclick="deleteLivraison(${l.id})">✕</button>` : '';
      return `<tr><td>${l.date_livraison}</td><td class="text-blue fw600">${l.quantite_cartons} cartons</td><td>${l.fournisseur||'—'}</td><td>${l.notes||'—'}</td><td>${fichierLink}</td><td class="flex" style="gap:4px">${editBtn}${delBtn}</td></tr>`;
    }).join('') || '<tr><td colspan="6" class="empty">Aucune livraison</td></tr>';
  } catch (e) { tbody.innerHTML = '<tr><td colspan="6" class="empty">Erreur</td></tr>'; }
}

function openLivrModal() {
  document.getElementById('ml-id').value = ''; document.getElementById('ml-date').value = today();
  ['ml-qte','ml-fourn','ml-notes'].forEach(f => document.getElementById(f).value = '');
  document.getElementById('ml-fichier-info').textContent = '';
  document.getElementById('ml-title').textContent = 'Nouvelle livraison';
  openModal('m-livraison');
}
async function openLivrEdit(id) {
  try {
    const data = await api('/livraisons'); const l = data.find(x => x.id === id); if (!l) return;
    document.getElementById('ml-id').value    = id;
    document.getElementById('ml-title').textContent = 'Modifier livraison';
    document.getElementById('ml-date').value  = l.date_livraison;
    document.getElementById('ml-qte').value   = l.quantite_cartons;
    document.getElementById('ml-fourn').value = l.fournisseur || '';
    document.getElementById('ml-notes').value = l.notes || '';
    document.getElementById('ml-fichier-info').textContent = l.fichier_facture ? `Fichier actuel : ${l.fichier_facture}` : '';
    openModal('m-livraison');
  } catch (e) { showToast(e.message, 'error'); }
}
async function saveLivraison() {
  const qte = document.getElementById('ml-qte').value;
  if (!qte || parseInt(qte) <= 0) { showToast('Quantité invalide', 'error'); return; }
  const id = document.getElementById('ml-id').value;
  const fd = new FormData();
  fd.append('date_livraison',   document.getElementById('ml-date').value);
  fd.append('quantite_cartons', qte);
  fd.append('fournisseur',      document.getElementById('ml-fourn').value);
  fd.append('notes',            document.getElementById('ml-notes').value);
  const fi = document.getElementById('ml-file');
  if (fi && fi.files[0]) fd.append('fichier', fi.files[0]);
  try {
    if (id) await api('/livraisons/' + id, 'PUT', fd);
    else    await api('/livraisons', 'POST', fd);
    closeModal('m-livraison');
    showToast((id ? 'Livraison modifiée' : 'Livraison enregistrée') + ' ✓');
    loadLivraisons();
    if (fi) fi.value = '';
  } catch (e) { showToast(e.message, 'error'); }
}
async function deleteLivraison(id) {
  if (!confirm('Supprimer cette livraison ?')) return;
  try { await api('/livraisons/' + id, 'DELETE'); showToast('Livraison supprimée'); loadLivraisons(); }
  catch (e) { showToast(e.message, 'error'); }
}

// ══════════════════════════════════════════════════════════════
// RÉPARTITION DU JOUR — avec filtre date
// ══════════════════════════════════════════════════════════════
async function loadRepartition() {
  const dateEl = document.getElementById('rep-date-filter');
  const date   = dateEl ? dateEl.value || today() : today();
  const label  = new Date(date + 'T00:00:00').toLocaleDateString('fr-FR',
    { weekday:'long', day:'numeric', month:'long', year:'numeric' });
  document.getElementById('rep-date-lbl').textContent = label;
  try {
    const [ventes, stock] = await Promise.all([
      api('/ventes?date=' + date),
      api('/stock'),
    ]);
    const totalQte = ventes.reduce((s,v) => s+Number(v.quantite), 0);
    const totalF   = ventes.reduce((s,v) => s+Number(v.total), 0);
    document.getElementById('rep-qte').textContent   = totalQte;
    document.getElementById('rep-stock').textContent = stock.cartons + ' cartons';
    document.getElementById('rep-total').textContent = fmt(totalF);
    document.getElementById('tbl-rep').innerHTML = ventes.map(v =>
      `<tr><td>${v.client_nom||'?'}</td><td>${v.client_zone||'—'}</td><td>${v.quantite}</td><td>${Number(v.quantite)*12}</td><td>${fmt(v.total)}</td><td>${statutBadge(v)}</td></tr>`
    ).join('') || `<tr><td colspan="6" class="empty">Aucune distribution le ${label}</td></tr>`;
  } catch (e) { console.error(e); }
}

// ══════════════════════════════════════════════════════════════
// CLIENTS
// ══════════════════════════════════════════════════════════════
async function loadClients() {
  const tbody = document.getElementById('tbl-clients');
  tbody.innerHTML = '<tr><td colspan="8" class="loading">Chargement…</td></tr>';
  try {
    const search = document.getElementById('fc-search').value;
    const cat    = document.getElementById('fc-cat').value;
    let q = '';
    if (search) q += '&search=' + encodeURIComponent(search);
    if (cat)    q += '&categorie=' + cat;
    const data = await api('/clients?' + q);
    clientsCache = data;
    tbody.innerHTML = data.map(c => {
      const del = isAdmin()
        ? `<button class="btn btn-danger" style="padding:3px 8px;font-size:11px" onclick="deleteClient(${c.id})">✕</button>` : '';
      return `<tr><td>${c.code}</td><td><strong>${c.nom}</strong></td><td>${c.zone||'—'}</td><td>${catLabel(c.categorie)}</td><td>${c.telephone||'—'}</td><td class="${Number(c.solde_global)>0?'text-red fw600':''}">${fmt(c.solde_global)}</td><td><span class="badge ${c.statut==='actif'?'badge-green':'badge-red'}">${c.statut}</span></td><td class="flex" style="gap:4px"><button class="btn" style="padding:3px 8px;font-size:11px" onclick="editClient(${c.id})">✏️</button>${del}</td></tr>`;
    }).join('') || '<tr><td colspan="8" class="empty">Aucun client</td></tr>';
  } catch (e) { tbody.innerHTML = '<tr><td colspan="8" class="empty">Erreur</td></tr>'; }
}
function openClientModal() {
  document.getElementById('mc-id').value = '';
  document.getElementById('mc-title').textContent = 'Nouveau client';
  ['mc-nom','mc-tel','mc-zone','mc-addr','mc-obs'].forEach(f => document.getElementById(f).value = '');
  document.getElementById('mc-cat').value    = 'revendeur_principal';
  document.getElementById('mc-statut').value = 'actif';
  openModal('m-client');
}
async function editClient(id) {
  const c = clientsCache.find(x => x.id === id); if (!c) return;
  document.getElementById('mc-id').value = id;
  document.getElementById('mc-title').textContent = 'Modifier client';
  document.getElementById('mc-nom').value  = c.nom;
  document.getElementById('mc-tel').value  = c.telephone || '';
  document.getElementById('mc-zone').value = c.zone || '';
  document.getElementById('mc-addr').value = c.adresse || '';
  document.getElementById('mc-cat').value  = c.categorie;
  document.getElementById('mc-statut').value = c.statut;
  document.getElementById('mc-obs').value  = c.observation || '';
  openModal('m-client');
}
async function saveClient() {
  const nom = document.getElementById('mc-nom').value.trim();
  if (!nom) { showToast('Nom requis', 'error'); return; }
  const id = document.getElementById('mc-id').value;
  const body = { nom, telephone:document.getElementById('mc-tel').value, zone:document.getElementById('mc-zone').value, adresse:document.getElementById('mc-addr').value, categorie:document.getElementById('mc-cat').value, statut:document.getElementById('mc-statut').value, observation:document.getElementById('mc-obs').value };
  try {
    if (id) await api('/clients/' + id, 'PUT', body);
    else    await api('/clients', 'POST', body);
    closeModal('m-client'); showToast('Client enregistré ✓'); loadClients();
  } catch (e) { showToast(e.message, 'error'); }
}
async function deleteClient(id) {
  if (!confirm('Archiver ce client ?')) return;
  try { await api('/clients/' + id, 'DELETE'); showToast('Client archivé'); loadClients(); }
  catch (e) { showToast(e.message, 'error'); }
}

// ══════════════════════════════════════════════════════════════
// RECOUVREMENTS
// ══════════════════════════════════════════════════════════════
async function loadRecouvrements() {
  const tbody = document.getElementById('tbl-recouvrements');
  tbody.innerHTML = '<tr><td colspan="8" class="loading">Chargement…</td></tr>';
  try {
    let q = '';
    const d1 = document.getElementById('fr-d1').value;
    const d2 = document.getElementById('fr-d2').value;
    if (d1) q += '&date_debut=' + d1;
    if (d2) q += '&date_fin='   + d2;
    const data = await api('/recouvrements?' + q);
    tbody.innerHTML = data.map(r => {
      const del = isAdmin()
        ? `<button class="btn btn-danger" style="padding:3px 8px;font-size:11px" onclick="deleteRecouvr(${r.id})">✕</button>` : '';
      return `<tr><td>${r.date_paiement}</td><td>${r.client_nom||'?'}</td><td class="text-green fw600">${fmt(r.montant_recu)}</td><td class="${Number(r.montant_restant)>0?'text-red':''}">${fmt(r.montant_restant)}</td><td>${r.date_suivi||'—'}</td><td>${r.observation||'—'}</td><td></td><td>${del}</td></tr>`;
    }).join('') || '<tr><td colspan="8" class="empty">Aucun recouvrement</td></tr>';
    document.getElementById('tot-rec').textContent = fmt(data.reduce((s,r)=>s+Number(r.montant_recu),0));
    // Bouton versement global visible uniquement pour admin
    const btnVersement = document.getElementById('btn-versement-banque');
    if (btnVersement) btnVersement.style.display = isAdmin() ? 'inline-flex' : 'none';
  } catch (e) { tbody.innerHTML = '<tr><td colspan="8" class="empty">Erreur</td></tr>'; }
}

async function openRecouvrModal(clientId = null) {
  document.getElementById('mr-date').value = today();
  ['mr-montant','mr-solde-act','mr-restant','mr-suivi','mr-obs'].forEach(f => {
    const el = document.getElementById(f); if(el) el.value='';
  });
  const sel = document.getElementById('mr-client');
  sel.innerHTML = '<option value="">Sélectionner…</option>';
  try {
    const clients = clientsCache.length ? clientsCache : await api('/clients');
    clients.filter(c => c.statut === 'actif').forEach(c => {
      sel.innerHTML += `<option value="${c.id}" data-solde="${c.solde_global}">${c.nom}${Number(c.solde_global)>0?' — '+fmt(c.solde_global):''}</option>`;
    });
    if (clientId) { sel.value = clientId; fillSoldeRec(); }
  } catch (e) {}
  openModal('m-recouvr');
}

function fillSoldeRec() {
  const sel   = document.getElementById('mr-client');
  const opt   = sel.options[sel.selectedIndex];
  const solde = opt ? Number(opt.dataset.solde || 0) : 0;
  document.getElementById('mr-solde-act').value = fmt(solde);
  calcRec();
}
function calcRec() {
  const sel   = document.getElementById('mr-client');
  const opt   = sel.options[sel.selectedIndex];
  const solde = opt ? Number(opt.dataset.solde || 0) : 0;
  const m     = parseFloat(document.getElementById('mr-montant').value) || 0;
  document.getElementById('mr-restant').value = fmt(Math.max(0, solde - m));
}
async function saveRecouvr() {
  const client_id     = document.getElementById('mr-client').value;
  const montant       = document.getElementById('mr-montant').value;
  const date_paiement = document.getElementById('mr-date').value;
  if (!client_id)                        { showToast('Veuillez sélectionner un client', 'error'); return; }
  if (!montant || parseFloat(montant) <= 0) { showToast('Veuillez saisir un montant valide', 'error'); return; }
  if (!date_paiement)                    { showToast('Veuillez saisir une date', 'error'); return; }
  try {
    await api('/recouvrements', 'POST', {
      client_id, montant_recu: montant, date_paiement,
      date_suivi:  document.getElementById('mr-suivi').value || null,
      observation: document.getElementById('mr-obs').value   || null,
    });
    closeModal('m-recouvr'); showToast('Paiement enregistré ✓'); loadRecouvrements();
  } catch (e) { showToast(e.message, 'error'); }
}
async function deleteRecouvr(id) {
  if (!confirm('Supprimer ce recouvrement ?')) return;
  try { await api('/recouvrements/' + id, 'DELETE'); showToast('Recouvrement supprimé'); loadRecouvrements(); }
  catch (e) { showToast(e.message, 'error'); }
}

// ══════════════════════════════════════════════════════════════
// VERSEMENT JOURNALIER EN BANQUE — total recouvrements du jour
// ══════════════════════════════════════════════════════════════
async function ouvrirVersementBanque() {
  // Récupérer la date filtrée (ou aujourd'hui)
  const d1 = document.getElementById('fr-d1').value || today();
  try {
    const resume = await api('/banque/resume-jour/' + d1);
    if (resume.total === 0) {
      showToast('Aucun recouvrement à verser pour le ' + d1, 'error');
      return;
    }
    // Construire la description avec la liste des clients
    const detail = resume.recouvrements.map(r => `${r.client_nom}: ${fmtN(r.montant_recu)}`).join(' / ');
    const desc   = `Versement recouvrements du ${d1.split('-').reverse().join('/')}`;

    // Pré-remplir le modal banque
    nav('banque');
    await new Promise(r => setTimeout(r, 200));
    openBanqueModal();
    document.getElementById('mb-date').value    = today();
    document.getElementById('mb-desc').value    = desc;
    document.getElementById('mb-montant').value = resume.total;
    document.getElementById('mb-type').value    = 'encaissement';
    document.getElementById('mb-categorie').value = 'recouvrement';
    document.getElementById('mb-comment').value = detail;

    // Afficher le récap dans le modal
    const infoEl = document.getElementById('mb-versement-info');
    if (infoEl) {
      infoEl.style.display = 'block';
      infoEl.innerHTML = `
        <strong>Récapitulatif recouvrements du ${d1.split('-').reverse().join('/')} :</strong><br>
        ${resume.recouvrements.map(r => `• ${r.client_nom} : ${fmt(r.montant_recu)}`).join('<br>')}
        <br><strong style="color:var(--green)">Total à verser : ${fmt(resume.total)}</strong>
      `;
    }
  } catch (e) { showToast(e.message, 'error'); }
}

// ══════════════════════════════════════════════════════════════
// IMPAYÉS
// ══════════════════════════════════════════════════════════════
async function loadImpayes() {
  const tbody = document.getElementById('tbl-impayes');
  tbody.innerHTML = '<tr><td colspan="7" class="loading">Chargement…</td></tr>';
  try {
    const [clients, allVentes] = await Promise.all([api('/clients'), api('/ventes')]);
    const impayes = clients.filter(c => Number(c.solde_global) > 0).sort((a,b) => b.solde_global - a.solde_global);
    const total   = impayes.reduce((s,c) => s+Number(c.solde_global), 0);
    document.getElementById('total-imp-lbl').textContent = 'Total : ' + fmt(total);
    document.getElementById('badge-imp').textContent = impayes.length;
    tbody.innerHTML = impayes.map(c => {
      const lastV = allVentes.filter(v => Number(v.client_id) === c.id).sort((a,b) => b.date_vente.localeCompare(a.date_vente))[0];
      return `<tr><td><strong>${c.nom}</strong></td><td>${catLabel(c.categorie)}</td><td>${c.zone||'—'}</td><td>${c.telephone||'—'}</td><td class="text-red fw600">${fmt(c.solde_global)}</td><td>${lastV?lastV.date_vente:'—'}</td><td><button class="btn btn-primary" style="padding:4px 10px;font-size:11px" onclick="quickPaiement(${c.id})">💰 Paiement</button></td></tr>`;
    }).join('') || '<tr><td colspan="7" class="empty text-green">Aucun impayé 🎉</td></tr>';
  } catch (e) { tbody.innerHTML = '<tr><td colspan="7" class="empty">Erreur</td></tr>'; }
}
async function quickPaiement(id) {
  nav('recouvrements');
  await new Promise(r => setTimeout(r, 150));
  openRecouvrModal(id);
}

// ══════════════════════════════════════════════════════════════
// STOCK — affichage cartons + conversion plateaux/oeufs
// ══════════════════════════════════════════════════════════════
async function loadStock() {
  try {
    const [stock, mvts] = await Promise.all([api('/stock'), api('/stock/mouvements')]);
    afficherStock(stock.cartons, stock.plateaux, stock.oeufs);
    document.getElementById('tbl-stock-mvt').innerHTML = mvts.map(m => {
      const canDel = isAdmin() && (!m.reference_type || m.reference_type === '');
      const del = canDel
        ? `<button class="btn btn-danger" style="padding:3px 6px;font-size:10px" onclick="deleteMvtStock(${m.id})">✕</button>` : '';
      return `<tr><td>${m.date_mouvement}</td><td>${mvtBadge(m.type_mouvement)}</td><td>${m.cartons}</td><td>${m.plateaux}</td><td>${m.oeufs}</td><td>${m.motif}</td><td>${del}</td></tr>`;
    }).join('') || '<tr><td colspan="7" class="empty">Aucun mouvement</td></tr>';
  } catch (e) { console.error(e); }
}

function openStockModal() {
  document.getElementById('ms-date').value  = today();
  ['ms-c','ms-p','ms-o'].forEach(f => document.getElementById(f).value = '0');
  document.getElementById('ms-motif').value = '';
  document.getElementById('ms-type').value  = 'entree';
  openModal('m-stock');
}
async function saveStockAdj() {
  const motif = document.getElementById('ms-motif').value.trim();
  if (!motif || motif.length < 3) { showToast('Motif obligatoire (min. 3 caractères)', 'error'); return; }
  try {
    await api('/stock/ajustement', 'POST', {
      date_mouvement: document.getElementById('ms-date').value,
      type_mouvement: document.getElementById('ms-type').value,
      cartons:  document.getElementById('ms-c').value || 0,
      plateaux: document.getElementById('ms-p').value || 0,
      oeufs:    document.getElementById('ms-o').value || 0,
      motif,
    });
    closeModal('m-stock'); showToast('Stock ajusté ✓'); loadStock();
  } catch (e) { showToast(e.message, 'error'); }
}
async function deleteMvtStock(id) {
  if (!confirm('Supprimer ce mouvement ?')) return;
  try { await api('/stock/mouvements/' + id, 'DELETE'); showToast('Mouvement supprimé'); loadStock(); }
  catch (e) { showToast(e.message, 'error'); }
}

// ══════════════════════════════════════════════════════════════
// PERTES — fix déduction stock
// ══════════════════════════════════════════════════════════════
async function loadPertes() {
  try {
    const data = await api('/pertes');
    const now  = new Date();
    const mois = data.filter(p => { const d=new Date(p.date_perte); return d.getMonth()===now.getMonth()&&d.getFullYear()===now.getFullYear(); });
    const totO = mois.reduce((s,p) => s+Number(p.quantite_oeufs), 0);
    document.getElementById('per-mois').textContent    = fmtN(totO) + ' œufs';
    document.getElementById('per-cartons').textContent = (totO/360).toFixed(2);
    const typeBadge = { casse:'badge-red', perte:'badge-amber', manquant:'badge-blue', abime:'badge-amber' };
    document.getElementById('tbl-pertes').innerHTML = data.map(p => {
      const pl  = Math.floor(Number(p.quantite_oeufs)/30);
      const ca  = Math.floor(pl/12);
      const editBtn = `<button class="btn" style="padding:3px 6px;font-size:10px" onclick="editPerte(${p.id})">✏️</button>`;
      const del = isAdmin()
        ? `<button class="btn btn-danger" style="padding:3px 6px;font-size:10px" onclick="deletePerte(${p.id})">✕</button>` : '';
      return `<tr><td>${p.date_perte}</td><td><span class="badge ${typeBadge[p.type_perte]||'badge-amber'}">${p.type_perte}</span></td><td>${p.quantite_oeufs}</td><td>${pl}</td><td>${ca}</td><td>${p.cause}</td><td class="flex" style="gap:4px">${editBtn}${del}</td></tr>`;
    }).join('') || '<tr><td colspan="7" class="empty">Aucune perte enregistrée</td></tr>';
  } catch (e) { console.error(e); }
}

function openPerteModal() {
  document.getElementById('mp-id').value    = '';
  document.getElementById('mp-date').value  = today();
  document.getElementById('mp-oeufs').value = '';
  document.getElementById('mp-cause').value = '';
  document.getElementById('mp-equiv').value = '';
  document.getElementById('mp-type').value  = 'casse';
  document.getElementById('mp-title').textContent = 'Saisir une perte / casse';
  openModal('m-perte');
}
async function editPerte(id) {
  try {
    const data = await api('/pertes'); const p = data.find(x => x.id === id); if (!p) return;
    document.getElementById('mp-id').value    = id;
    document.getElementById('mp-title').textContent = 'Modifier perte';
    document.getElementById('mp-date').value  = p.date_perte;
    document.getElementById('mp-type').value  = p.type_perte;
    document.getElementById('mp-oeufs').value = p.quantite_oeufs;
    document.getElementById('mp-cause').value = p.cause;
    calcPerte(); openModal('m-perte');
  } catch (e) { showToast(e.message, 'error'); }
}
function calcPerte() {
  const n  = parseInt(document.getElementById('mp-oeufs').value) || 0;
  const pl = Math.floor(n/30); const oe = n%30; const ca = Math.floor(pl/12);
  document.getElementById('mp-equiv').value = `${ca} carton(s), ${pl} plateau(x), ${oe} œuf(s)`;
}
async function savePerte() {
  const oeufs = parseInt(document.getElementById('mp-oeufs').value) || 0;
  const cause = document.getElementById('mp-cause').value.trim();
  const date  = document.getElementById('mp-date').value;
  if (oeufs <= 0) { showToast('Nombre d\'œufs invalide (doit être > 0)', 'error'); return; }
  if (!cause)     { showToast('Cause obligatoire', 'error'); return; }
  if (!date)      { showToast('Date obligatoire', 'error'); return; }
  const body = { date_perte:date, type_perte:document.getElementById('mp-type').value, quantite_oeufs:oeufs, cause };
  try {
    const id = document.getElementById('mp-id').value;
    if (id) await api('/pertes/' + id, 'PUT', body);
    else    await api('/pertes', 'POST', body);
    closeModal('m-perte'); showToast('Perte enregistrée, stock déduit ✓'); loadPertes(); loadStock();
  } catch (e) { showToast(e.message, 'error'); }
}
async function deletePerte(id) {
  if (!confirm('Supprimer cette perte et restaurer le stock ?')) return;
  try { await api('/pertes/' + id, 'DELETE'); showToast('Perte supprimée, stock restauré'); loadPertes(); loadStock(); }
  catch (e) { showToast(e.message, 'error'); }
}

// ══════════════════════════════════════════════════════════════
// BANQUE — versement global avec récap + suivi
// ══════════════════════════════════════════════════════════════
async function loadBanque() {
  const tbody = document.getElementById('tbl-banque');
  tbody.innerHTML = '<tr><td colspan="8" class="loading">Chargement…</td></tr>';
  try {
    const cat = document.getElementById('bq-filter-cat')?.value || '';
    const [data, soldeData] = await Promise.all([
      api('/banque' + (cat ? '?categorie=' + cat : '')),
      api('/banque/solde'),
    ]);
    const solde = soldeData.solde;
    document.getElementById('bq-solde').textContent = fmt(solde);

    const catLabels = {
      recouvrement: '<span class="badge badge-green">Recouvrement</span>',
      paiement_fournisseur: '<span class="badge badge-amber">Fournisseur</span>',
      frais_bancaire: '<span class="badge badge-red">Frais bancaire</span>',
      autre: '<span class="badge badge-blue">Autre</span>',
    };

    tbody.innerHTML = data.map(b => {
      const fichierLink = b.fichier_bordereau
        ? `<a href="/uploads/${b.fichier_bordereau}" target="_blank" style="color:var(--acc);font-size:11px">📎</a>` : '';
      const desc = b.description + (fichierLink ? ' ' + fichierLink : '');
      return `<tr>
        <td>${b.date_mouvement}</td><td>${desc}</td>
        <td>${catLabels[b.categorie] || catLabels.autre}</td>
        <td>${b.reference||'—'}</td>
        <td class="text-green">${b.encaissement?fmt(b.encaissement):'—'}</td>
        <td class="text-red">${b.decaissement?fmt(b.decaissement):'—'}</td>
        <td class="fw600">${fmt(b.solde)}</td>
        <td><button class="btn btn-danger" style="padding:3px 8px;font-size:11px" onclick="deleteBanque(${b.id})">✕</button></td>
      </tr>`;
    }).join('') || '<tr><td colspan="8" class="empty">Aucun mouvement</td></tr>';

    // Mettre à jour le KPI banque du dashboard si présent
    if (document.getElementById('kpi-banque')) {
      document.getElementById('kpi-banque').textContent = fmt(solde);
    }
  } catch (e) { tbody.innerHTML = '<tr><td colspan="8" class="empty">Erreur</td></tr>'; }
}

function openBanqueModal() {
  document.getElementById('mb-date').value = today();
  ['mb-desc','mb-ref','mb-montant','mb-comment'].forEach(f => document.getElementById(f).value = '');
  document.getElementById('mb-type').value = 'encaissement';
  document.getElementById('mb-categorie').value = 'autre';
  const infoEl = document.getElementById('mb-versement-info');
  if (infoEl) infoEl.style.display = 'none';
  openModal('m-banque');
}
async function saveBanque() {
  const desc    = document.getElementById('mb-desc').value.trim();
  const montant = document.getElementById('mb-montant').value;
  if (!desc || !montant || parseFloat(montant) <= 0) { showToast('Description et montant requis', 'error'); return; }
  const type = document.getElementById('mb-type').value;
  const fd   = new FormData();
  fd.append('date_mouvement', document.getElementById('mb-date').value);
  fd.append('description',    desc);
  fd.append('reference',      document.getElementById('mb-ref').value);
  fd.append('categorie',      document.getElementById('mb-categorie').value);
  fd.append('commentaires',   document.getElementById('mb-comment').value);
  fd.append('encaissement',   type === 'encaissement' ? montant : 0);
  fd.append('decaissement',   type === 'decaissement' ? montant : 0);
  const fi = document.getElementById('mb-file');
  if (fi && fi.files[0]) fd.append('fichier', fi.files[0]);
  try {
    await api('/banque', 'POST', fd);
    closeModal('m-banque'); showToast('Mouvement bancaire enregistré ✓'); loadBanque();
    if (fi) fi.value = '';
  } catch (e) { showToast(e.message, 'error'); }
}
async function deleteBanque(id) {
  if (!confirm('Supprimer ce mouvement ?')) return;
  try { await api('/banque/' + id, 'DELETE'); showToast('Supprimé'); loadBanque(); }
  catch (e) { showToast(e.message, 'error'); }
}

// ══════════════════════════════════════════════════════════════
// RAPPORTS
// ══════════════════════════════════════════════════════════════
async function genRapport() {
  const date = document.getElementById('rpt-date').value;
  if (!date) { showToast('Sélectionnez une date', 'error'); return; }
  try {
    const data = await api('/rapports/' + date);
    rapportData = data;
    const df = date.split('-').reverse().join('/');
    let txt = `${df}\n`;
    txt += `# QUANTITÉ DISTRIBUÉE : ${data.totaux.totalQte} Cartons\n`;
    if (data.ventes.length) {
      txt += `# DISTRIBUTIONS :\n`;
      data.ventes.forEach(v => txt += `- ${v.client_nom||'?'} : ${v.quantite}\n`);
    }
    txt += `# RECOUVREMENT\n`;
    if (data.recouvrements.length) data.recouvrements.forEach(r => txt += `- ${r.client_nom||'?'} : ${fmtN(r.montant_recu)}\n`);
    else txt += `  (aucun recouvrement)\n`;
    txt += `@ Total cash : ${fmtN(data.totaux.totalCash)}\n`;
    txt += `@IMPAYÉS : ${fmtN(data.totaux.totalImpayesGlobal)}\n`;
    data.impayes.forEach(c => txt += `• ${c.nom} : ${fmtN(c.solde_global)}\n`);
    txt += `# Stock restant : ${pad2(data.stock.cartons)} Cartons`;
    if (data.stock.plateaux > 0 || data.stock.oeufs > 0) {
      txt += ` + ${data.stock.plateaux} plateaux + ${data.stock.oeufs} œufs`;
    }
    txt += '\n';
    if (data.pertes.length) {
      txt += `# Pertes du jour :\n`;
      data.pertes.forEach(p => txt += `  - ${p.type_perte} : ${p.quantite_oeufs} œufs — ${p.cause}\n`);
    }
    document.getElementById('rpt-text').textContent = txt;
    document.getElementById('rpt-result').style.display = 'block';
    showToast('Rapport généré ✓');
  } catch (e) { showToast(e.message, 'error'); }
}

function exportRapportPDF() {
  const txt = document.getElementById('rpt-text').textContent;
  if (!txt) { showToast('Générez d\'abord un rapport', 'error'); return; }
  const w = window.open('', '_blank');
  w.document.write(`<!DOCTYPE html><html><head><meta charset="UTF-8"><title>Rapport</title><style>body{font-family:'Courier New',monospace;padding:30px;white-space:pre-wrap;font-size:14px;line-height:1.8;max-width:700px;margin:auto}@media print{.noprint{display:none}}</style></head><body><div class="noprint" style="margin-bottom:20px"><button onclick="window.print()" style="padding:8px 20px;cursor:pointer;font-size:14px">🖨️ Imprimer / PDF</button></div>${txt.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')}</body></html>`);
  w.document.close();
}

function exportRapportExcel() {
  if (!rapportData) { showToast('Générez d\'abord un rapport', 'error'); return; }
  const d = rapportData; const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([
    ['Rapport Positive Distribution — ' + d.date.split('-').reverse().join('/')],[''],
    ['Total ventes',Number(d.totaux.totalVentes)],['Total encaissé',Number(d.totaux.totalPaye)],
    ['Total recouvrements',Number(d.totaux.totalRecouvr)],['Total cash',Number(d.totaux.totalCash)],
    ['Impayés global',Number(d.totaux.totalImpayesGlobal)],
    ['Stock restant (cartons)',d.stock.cartons],['Stock (plateaux)',d.stock.plateaux],['Stock (œufs)',d.stock.oeufs],
  ]), 'Résumé');
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([
    ['Date','N°','Client','Zone','Qté','PU','Total','Payé','Solde','Statut'],
    ...d.ventes.map(v=>{const st=!Number(v.solde)?'Soldé':Number(v.paiement)>0?'Partiel':'Impayé';return[v.date_vente,v.numero,v.client_nom||'?',v.client_zone||'',Number(v.quantite),Number(v.prix_unitaire),Number(v.total),Number(v.paiement),Number(v.solde),st];}),
  ]), 'Ventes');
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([
    ['Date','Client','Montant reçu','Restant','Note'],
    ...d.recouvrements.map(r=>[r.date_paiement,r.client_nom||'?',Number(r.montant_recu),Number(r.montant_restant),r.observation||'']),
  ]), 'Recouvrements');
  XLSX.writeFile(wb, 'Rapport_' + d.date + '.xlsx');
  showToast('Export Excel téléchargé ✓');
}

// ══════════════════════════════════════════════════════════════
// PRIX (admin only)
// ══════════════════════════════════════════════════════════════
async function loadPrix2() {
  await loadPrix();
  document.getElementById('px-rp').textContent = fmtN(prixActifs['revendeur_principal']||29000) + ' FCFA';
  document.getElementById('px-ar').textContent = fmtN(prixActifs['autre_revendeur']||29500) + ' FCFA';
  document.getElementById('px-pc').textContent = fmtN(prixActifs['patisserie_conso']||33000) + ' FCFA';
  try {
    const data = await api('/prix');
    const catNames = {revendeur_principal:'Revendeur Principal',autre_revendeur:'Autre Revendeur',patisserie_conso:'Patisserie/Conso'};
    document.getElementById('tbl-prix').innerHTML = data.map(p =>
      `<tr><td>${p.date_effet}</td><td>${catNames[p.categorie]||p.categorie}</td><td class="fw600">${fmtN(p.prix_unitaire)} FCFA</td><td><span class="badge ${p.actif?'badge-green':'badge-red'}">${p.actif?'Actif':'Archivé'}</span></td></tr>`
    ).join('');
  } catch (e) {}
}
function openPrixModal() { document.getElementById('mpx-date').value=today(); document.getElementById('mpx-prix').value=''; openModal('m-prix'); }
async function savePrix() {
  const cat=document.getElementById('mpx-cat').value, prix=document.getElementById('mpx-prix').value, date=document.getElementById('mpx-date').value;
  if (!prix||prix<=0||!date) { showToast('Données invalides','error'); return; }
  try { await api('/prix','POST',{date_effet:date,categorie:cat,prix_unitaire:prix}); closeModal('m-prix'); showToast('Prix mis à jour ✓'); loadPrix2(); }
  catch (e) { showToast(e.message,'error'); }
}

// ══════════════════════════════════════════════════════════════
// JOURNAL
// ══════════════════════════════════════════════════════════════
async function loadJournal() {
  const tbody = document.getElementById('tbl-journal');
  tbody.innerHTML = '<tr><td colspan="5" class="loading">Chargement…</td></tr>';
  try {
    const module = document.getElementById('jf-module').value;
    const d1 = document.getElementById('jf-d1').value;
    const d2 = document.getElementById('jf-d2').value;
    let q = '&limit=200';
    if (module) q += '&module=' + module;
    if (d1) q += '&date_debut=' + d1;
    if (d2) q += '&date_fin='   + d2;
    const data = await api('/journal?' + q);
    tbody.innerHTML = data.map(j => {
      const dt = new Date(j.date_action).toLocaleString('fr-FR');
      return `<tr><td style="white-space:nowrap">${dt}</td><td><strong>${j.utilisateur_nom}</strong></td><td>${actionBadge(j.action)}</td><td>${moduleBadge(j.module)}</td><td style="font-size:12px">${j.description}</td></tr>`;
    }).join('') || '<tr><td colspan="5" class="empty">Aucune activité enregistrée</td></tr>';
  } catch (e) { tbody.innerHTML = `<tr><td colspan="5" class="empty" style="color:var(--red)">${e.message}</td></tr>`; }
}

// ══════════════════════════════════════════════════════════════
// UTILISATEURS
// ══════════════════════════════════════════════════════════════
async function loadUsers() {
  try {
    const data = await api('/utilisateurs');
    document.getElementById('tbl-users').innerHTML = data.map(u =>
      `<tr><td>${u.nom}</td><td>${u.email}</td><td><span class="badge ${u.role==='Admin'?'badge-blue':'badge-amber'}">${u.role}</span></td><td><span class="badge ${u.statut==='actif'?'badge-green':'badge-red'}">${u.statut}</span></td><td>${u.dernier_acces?new Date(u.dernier_acces).toLocaleString('fr-FR'):'—'}</td><td><button class="btn" style="padding:3px 8px;font-size:11px" onclick="toggleUser(${u.id},'${u.statut}')">${u.statut==='actif'?'Désactiver':'Activer'}</button></td></tr>`
    ).join('');
  } catch (e) {}
}
function openUserModal() { ['mu-nom','mu-email','mu-pass'].forEach(f=>document.getElementById(f).value=''); document.getElementById('mu-role').value='Commercial'; openModal('m-user'); }
async function toggleUser(id, statut) {
  try {
    const users = await api('/utilisateurs'); const u=users.find(x=>x.id===id); if(!u)return;
    await api('/utilisateurs/'+id,'PUT',{nom:u.nom,email:u.email,role:u.role,statut:statut==='actif'?'inactif':'actif'});
    showToast('Utilisateur mis à jour ✓'); loadUsers();
  } catch(e) { showToast(e.message,'error'); }
}
async function saveUser() {
  const nom=document.getElementById('mu-nom').value.trim(), email=document.getElementById('mu-email').value.trim(), role=document.getElementById('mu-role').value, pass=document.getElementById('mu-pass').value;
  if (!nom||!email||!pass) { showToast('Tous les champs sont requis','error'); return; }
  try { await api('/utilisateurs','POST',{nom,email,mot_de_passe:pass,role}); closeModal('m-user'); showToast('Utilisateur créé ✓'); loadUsers(); }
  catch(e) { showToast(e.message,'error'); }
}

// ══════════════════════════════════════════════════════════════
// IMPORT / EXPORT EXCEL
// ══════════════════════════════════════════════════════════════
function setupImportExport() {
  const imports = [
    {label:'Clients', key:'clients', cols:['Nom','Telephone','Zone','Categorie','Adresse','Observation']},
    {label:'Recouvrements', key:'recouvrements', cols:['Date','Client','Montant','Observation']},
  ];
  const exports = [
    {label:'Liste clients + soldes',key:'clients'},
    {label:'Toutes les ventes',key:'ventes'},
    {label:'Impayés',key:'impayes'},
    {label:'Recouvrements',key:'recouvrements'},
    ...(isAdmin() ? [
      {label:'Journal bancaire',key:'banque'},
      {label:'Factures fournisseur',key:'factures'},
    ] : []),
  ];
  document.getElementById('import-list').innerHTML = imports.map(imp =>
    `<div style="display:flex;align-items:center;justify-content:space-between;padding:10px;background:var(--bg3);border-radius:var(--radius)">
      <span>${imp.label}</span>
      <div class="flex" style="gap:6px">
        <button class="btn" onclick='dlTemplate("${imp.key}",${JSON.stringify(imp.cols)})'>📋 Modèle</button>
        <label class="btn btn-primary" style="cursor:pointer">📥 Import<input type="file" accept=".xlsx,.xls" style="display:none" onchange='importExcel("${imp.key}",this)'></label>
      </div>
    </div>`).join('');
  document.getElementById('export-list').innerHTML = exports.map(ex =>
    `<div style="display:flex;align-items:center;justify-content:space-between;padding:10px;background:var(--bg3);border-radius:var(--radius)">
      <span>${ex.label}</span>
      <button class="btn btn-success" onclick="exportExcel('${ex.key}')">📊 Export</button>
    </div>`).join('');
}

function dlTemplate(type, cols) {
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([cols]), 'Modèle');
  XLSX.writeFile(wb, 'Modele_'+type+'.xlsx');
  showToast('Modèle téléchargé ✓');
}
async function importExcel(type, input) {
  const file = input.files[0]; if (!file) return;
  const reader = new FileReader();
  reader.onload = async e => {
    try {
      const wb=XLSX.read(e.target.result,{type:'binary'}); const ws=wb.Sheets[wb.SheetNames[0]];
      const data=XLSX.utils.sheet_to_json(ws); let ok=0,errCount=0; const errs=[];
      for (const [i,row] of data.entries()) {
        try {
          if (type==='clients') {
            if (!row.Nom) { errCount++; errs.push(`Ligne ${i+2}: Nom manquant`); continue; }
            const catMap={'revendeur_principal':'revendeur_principal','autre_revendeur':'autre_revendeur','patisserie_conso':'patisserie_conso','Revendeur Principal':'revendeur_principal','Autre Revendeur':'autre_revendeur','Patisserie/Conso':'patisserie_conso'};
            await api('/clients','POST',{nom:row.Nom,telephone:row.Telephone||'',zone:row.Zone||'',adresse:row.Adresse||'',categorie:catMap[row.Categorie]||'autre_revendeur',statut:'actif',observation:row.Observation||''});
            ok++;
          } else if (type==='recouvrements') {
            if (!row.Client||!row.Montant) { errCount++; errs.push(`Ligne ${i+2}: Données manquantes`); continue; }
            const clients=await api('/clients?search='+encodeURIComponent(row.Client));
            if (!clients.length) { errCount++; errs.push(`Ligne ${i+2}: "${row.Client}" non trouvé`); continue; }
            await api('/recouvrements','POST',{client_id:clients[0].id,montant_recu:row.Montant,date_paiement:row.Date||today(),observation:row.Observation||''});
            ok++;
          }
        } catch(ex) { errCount++; errs.push(`Ligne ${i+2}: ${ex.message}`); }
      }
      document.getElementById('import-log').innerHTML =
        `<span style="color:var(--green)">✓ ${ok} ligne(s) importée(s)</span>`+
        (errCount?`<br><span style="color:var(--red)">✗ ${errCount} erreur(s):<br>${errs.slice(0,5).join('<br>')}</span>`:'');
      showToast(`Import: ${ok} succès, ${errCount} erreur(s)`);
      input.value='';
    } catch(ex) { showToast('Erreur lecture fichier','error'); }
  };
  reader.readAsBinaryString(file);
}
async function exportExcel(type) {
  try {
    const wb=XLSX.utils.book_new();
    if (type==='clients') {
      const data=await api('/clients');
      XLSX.utils.book_append_sheet(wb,XLSX.utils.aoa_to_sheet([['Code','Nom','Zone','Catégorie','Téléphone','Solde dû (FCFA)','Statut'],...data.map(c=>[c.code,c.nom,c.zone||'',catLabel(c.categorie),c.telephone||'',Number(c.solde_global),c.statut])]),'Clients');
    } else if (type==='ventes') {
      const data=await api('/ventes');
      XLSX.utils.book_append_sheet(wb,XLSX.utils.aoa_to_sheet([['Date','N°','Client','Zone','Qté','PU','Total','Payé','Solde','Statut'],...data.map(v=>{const st=!Number(v.solde)?'Soldé':Number(v.paiement)>0?'Partiel':'Impayé';return[v.date_vente,v.numero,v.client_nom||'?',v.client_zone||'',Number(v.quantite),Number(v.prix_unitaire),Number(v.total),Number(v.paiement),Number(v.solde),st];})]),'Ventes');
    } else if (type==='impayes') {
      const data=(await api('/clients')).filter(c=>Number(c.solde_global)>0).sort((a,b)=>b.solde_global-a.solde_global);
      XLSX.utils.book_append_sheet(wb,XLSX.utils.aoa_to_sheet([['Client','Catégorie','Zone','Téléphone','Solde dû (FCFA)'],...data.map(c=>[c.nom,catLabel(c.categorie),c.zone||'',c.telephone||'',Number(c.solde_global)])]),'Impayés');
    } else if (type==='recouvrements') {
      const data=await api('/recouvrements');
      XLSX.utils.book_append_sheet(wb,XLSX.utils.aoa_to_sheet([['Date','Client','Montant reçu','Restant','Note'],...data.map(r=>[r.date_paiement,r.client_nom||'?',Number(r.montant_recu),Number(r.montant_restant),r.observation||''])]),'Recouvrements');
    } else if (type==='banque') {
      const data=await api('/banque');
      XLSX.utils.book_append_sheet(wb,XLSX.utils.aoa_to_sheet([['Date','Description','Référence','Encaissement','Décaissement','Solde'],...data.map(b=>[b.date_mouvement,b.description,b.reference||'',Number(b.encaissement),Number(b.decaissement),Number(b.solde)])]),'Banque');
    } else if (type==='factures') {
      const data=await api('/factures');
      XLSX.utils.book_append_sheet(wb,XLSX.utils.aoa_to_sheet([['Date','N°','Fournisseur','Qté','PU','Total','Payé','Solde','Statut'],...data.map(f=>{const st=!Number(f.solde)?'Soldée':Number(f.paiement)>0?'Partiel':'Impayée';return[f.date_facture,f.numero,f.fournisseur_nom||'?',Number(f.quantite),Number(f.prix_unitaire),Number(f.total),Number(f.paiement),Number(f.solde),st];})]),'Factures');
    }
    XLSX.writeFile(wb,'Export_'+type+'_'+today()+'.xlsx');
    showToast('Export Excel téléchargé ✓');
  } catch(e) { showToast('Erreur: '+e.message,'error'); }
}

// ══════════════════════════════════════════════════════════════
// FOURNISSEURS
// ══════════════════════════════════════════════════════════════
let fournisseursCache = [];
let prixAchatActifs = {}; // { fournisseur_id: prix }

async function loadFournisseurs() {
  const tbody = document.getElementById('tbl-fournisseurs');
  tbody.innerHTML = '<tr><td colspan="6" class="loading">Chargement…</td></tr>';
  try {
    const data = await api('/fournisseurs');
    fournisseursCache = data;
    const prixData = await api('/prix-achat/actifs');
    prixAchatActifs = {};
    prixData.forEach(p => { prixAchatActifs[p.fournisseur_id] = p.prix_unitaire; });

    tbody.innerHTML = data.map(f => {
      const prix = prixAchatActifs[f.id];
      const solde = Number(f.solde_compte || 0);
      let soldeDisplay;
      if (solde > 0) {
        soldeDisplay = `<span class="text-red fw600">${fmt(solde)} (dû)</span>`;
      } else if (solde < 0) {
        soldeDisplay = `<span class="text-green fw600">${fmt(Math.abs(solde))} (crédit)</span>`;
      } else {
        soldeDisplay = `<span class="text-green">À jour</span>`;
      }
      const del = isAdmin() ? `<button class="btn btn-danger" style="padding:3px 8px;font-size:11px" onclick="deleteFournisseur(${f.id})">✕</button>` : '';
      const payBtn = `<button class="btn btn-success" style="padding:3px 8px;font-size:11px" onclick="openPayerFournisseur(${f.id})">💰 Payer</button>`;
      return `<tr><td><strong>${f.nom}</strong></td><td>${f.telephone||'—'}</td><td>${prix ? fmtN(prix)+' FCFA' : '—'}</td><td>${soldeDisplay}</td><td><span class="badge ${f.statut==='actif'?'badge-green':'badge-red'}">${f.statut}</span></td><td class="flex" style="gap:4px">${payBtn}<button class="btn" style="padding:3px 8px;font-size:11px" onclick="editFournisseur(${f.id})">✏️</button>${del}</td></tr>`;
    }).join('') || '<tr><td colspan="6" class="empty">Aucun fournisseur</td></tr>';

    // Remplir les selects ailleurs (factures, prix achat)
    const selPA = document.getElementById('pa-filter-fourn');
    if (selPA) {
      selPA.innerHTML = '<option value="">Tous les fournisseurs</option>' +
        data.map(f => `<option value="${f.id}">${f.nom}</option>`).join('');
    }
    const selFF = document.getElementById('ff-fourn');
    if (selFF) {
      selFF.innerHTML = '<option value="">Tous fournisseurs</option>' +
        data.filter(f=>f.statut==='actif').map(f => `<option value="${f.id}">${f.nom}</option>`).join('');
    }
  } catch (e) { tbody.innerHTML = '<tr><td colspan="6" class="empty">Erreur</td></tr>'; }
}

// ── Paiement global fournisseur (pas lié à une facture précise) ──
function openPayerFournisseur(id) {
  const f = fournisseursCache.find(x => x.id === id); if (!f) return;
  const solde = Number(f.solde_compte || 0);
  document.getElementById('pgf-fournisseur-id').value = id;
  document.getElementById('pgf-nom').textContent = f.nom;
  document.getElementById('pgf-date').value = today();
  document.getElementById('pgf-montant').value = solde > 0 ? solde : '';
  document.getElementById('pgf-obs').value = '';
  document.getElementById('pgf-deduire-banque').checked = true;

  let infoHtml;
  if (solde > 0) {
    infoHtml = `<strong>${f.nom}</strong><br>Dette actuelle : <strong class="text-red">${fmt(solde)}</strong><br><span style="font-size:11px">Si vous payez plus que ce montant, l'excédent devient un crédit d'avance qui sera automatiquement déduit des prochaines factures.</span>`;
  } else if (solde < 0) {
    infoHtml = `<strong>${f.nom}</strong><br>Crédit d'avance actuel : <strong class="text-green">${fmt(Math.abs(solde))}</strong><br><span style="font-size:11px">Ce fournisseur n'a actuellement aucune dette — vous avez déjà payé d'avance.</span>`;
  } else {
    infoHtml = `<strong>${f.nom}</strong><br>Compte à jour, aucune dette ni crédit.`;
  }
  document.getElementById('pgf-info').innerHTML = infoHtml;
  openModal('m-payer-fournisseur');
}
async function payerFournisseurGlobal() {
  const fournisseur_id = document.getElementById('pgf-fournisseur-id').value;
  const montant = document.getElementById('pgf-montant').value;
  const date_paiement = document.getElementById('pgf-date').value;
  if (!montant || parseFloat(montant) <= 0) { showToast('Montant invalide', 'error'); return; }
  if (!date_paiement) { showToast('Date requise', 'error'); return; }
  try {
    const result = await api('/factures/payer-fournisseur', 'POST', {
      fournisseur_id, date_paiement, montant,
      observation: document.getElementById('pgf-obs').value,
      deduire_banque: document.getElementById('pgf-deduire-banque').checked,
    });
    closeModal('m-payer-fournisseur');
    if (result.credit_avance > 0) {
      showToast(`Paiement enregistré. Crédit d'avance créé : ${fmt(result.credit_avance)} ✓`);
    } else {
      showToast('Paiement enregistré ✓');
    }
    loadFournisseurs(); loadFactures();
  } catch (e) { showToast(e.message, 'error'); }
}

function openFournisseurModal() {
  document.getElementById('mf-id').value = '';
  document.getElementById('mf-title').textContent = 'Nouveau fournisseur';
  ['mf-nom','mf-tel','mf-addr','mf-obs'].forEach(f => document.getElementById(f).value = '');
  document.getElementById('mf-statut').value = 'actif';
  openModal('m-fournisseur');
}
async function editFournisseur(id) {
  const f = fournisseursCache.find(x => x.id === id); if (!f) return;
  document.getElementById('mf-id').value = id;
  document.getElementById('mf-title').textContent = 'Modifier fournisseur';
  document.getElementById('mf-nom').value = f.nom;
  document.getElementById('mf-tel').value = f.telephone || '';
  document.getElementById('mf-addr').value = f.adresse || '';
  document.getElementById('mf-statut').value = f.statut;
  document.getElementById('mf-obs').value = f.observation || '';
  openModal('m-fournisseur');
}
async function saveFournisseur() {
  const nom = document.getElementById('mf-nom').value.trim();
  if (!nom) { showToast('Nom requis', 'error'); return; }
  const id = document.getElementById('mf-id').value;
  const body = { nom, telephone:document.getElementById('mf-tel').value, adresse:document.getElementById('mf-addr').value, statut:document.getElementById('mf-statut').value, observation:document.getElementById('mf-obs').value };
  try {
    if (id) await api('/fournisseurs/' + id, 'PUT', body);
    else    await api('/fournisseurs', 'POST', body);
    closeModal('m-fournisseur'); showToast('Fournisseur enregistré ✓'); loadFournisseurs();
  } catch (e) { showToast(e.message, 'error'); }
}
async function deleteFournisseur(id) {
  if (!confirm('Supprimer ce fournisseur ?')) return;
  try { await api('/fournisseurs/' + id, 'DELETE'); showToast('Fournisseur supprimé/désactivé'); loadFournisseurs(); }
  catch (e) { showToast(e.message, 'error'); }
}

// ── Prix d'achat ──
async function loadPrixAchatHistorique() {
  const tbody = document.getElementById('tbl-prix-achat');
  if (!tbody) return;
  tbody.innerHTML = '<tr><td colspan="4" class="loading">Chargement…</td></tr>';
  try {
    const fid = document.getElementById('pa-filter-fourn').value;
    const data = await api('/prix-achat' + (fid ? '?fournisseur_id=' + fid : ''));
    tbody.innerHTML = data.map(p =>
      `<tr><td>${p.date_effet}</td><td>${p.fournisseur_nom||'?'}</td><td class="fw600">${fmtN(p.prix_unitaire)} FCFA</td><td><span class="badge ${p.actif?'badge-green':'badge-red'}">${p.actif?'Actif':'Archivé'}</span></td></tr>`
    ).join('') || '<tr><td colspan="4" class="empty">Aucun historique</td></tr>';
  } catch (e) { tbody.innerHTML = '<tr><td colspan="4" class="empty">Erreur</td></tr>'; }
}

function openPrixAchatModal() {
  document.getElementById('mpa-date').value = today();
  document.getElementById('mpa-prix').value = '';
  const sel = document.getElementById('mpa-fourn');
  sel.innerHTML = '<option value="">Sélectionner…</option>' +
    fournisseursCache.filter(f=>f.statut==='actif').map(f => `<option value="${f.id}">${f.nom}</option>`).join('');
  openModal('m-prix-achat');
}
async function savePrixAchat() {
  const fournisseur_id = document.getElementById('mpa-fourn').value;
  const prix = document.getElementById('mpa-prix').value;
  const date = document.getElementById('mpa-date').value;
  if (!fournisseur_id || !prix || prix <= 0 || !date) { showToast('Données invalides', 'error'); return; }
  try {
    await api('/prix-achat', 'POST', { fournisseur_id, date_effet: date, prix_unitaire: prix });
    closeModal('m-prix-achat'); showToast('Prix d\'achat enregistré ✓');
    loadFournisseurs(); loadPrixAchatHistorique();
  } catch (e) { showToast(e.message, 'error'); }
}

// ══════════════════════════════════════════════════════════════
// FACTURES FOURNISSEUR
// ══════════════════════════════════════════════════════════════
let facturesCache = [];

async function loadFactures() {
  const tbody = document.getElementById('tbl-factures');
  tbody.innerHTML = '<tr><td colspan="10" class="loading">Chargement…</td></tr>';
  try {
    let q = '';
    const d  = document.getElementById('ff-date')?.value;
    const fn = document.getElementById('ff-fourn')?.value;
    const st = document.getElementById('ff-statut')?.value;
    if (d)  q += '&date_debut=' + d + '&date_fin=' + d;
    if (fn) q += '&fournisseur_id=' + fn;
    if (st) q += '&statut=' + st;
    const data = await api('/factures?' + q);
    facturesCache = data;

    tbody.innerHTML = data.map(f => {
      const payBtn = Number(f.solde) > 0
        ? `<button class="btn btn-success" style="padding:3px 8px;font-size:11px" onclick="openPayerFacture(${f.id})">💰 Payer</button>` : '';
      const fichierLink = f.fichier_facture
        ? `<a href="/uploads/${f.fichier_facture}" target="_blank" style="color:var(--acc);font-size:11px">📎</a>` : '';
      const del = isAdmin() ? `<button class="btn btn-danger" style="padding:3px 8px;font-size:11px" onclick="deleteFacture(${f.id})">✕</button>` : '';
      const statutF = !Number(f.solde) ? '<span class="badge badge-green">Soldée</span>' : Number(f.paiement)>0 ? '<span class="badge badge-amber">Partiel</span>' : '<span class="badge badge-red">Impayée</span>';
      return `<tr>
        <td>${f.date_facture}</td><td>${f.numero} ${fichierLink}</td><td>${f.fournisseur_nom||'?'}</td>
        <td>${f.quantite}</td><td>${fmtN(f.prix_unitaire)}</td>
        <td class="fw600">${fmt(f.total)}</td><td class="text-green">${fmt(f.paiement)}</td>
        <td class="${Number(f.solde)>0?'text-red fw600':''}">${fmt(f.solde)}</td>
        <td>${statutF}</td>
        <td class="flex" style="gap:4px">${payBtn}<button class="btn" style="padding:3px 8px;font-size:11px" onclick="editFacture(${f.id})">✏️</button>${del}</td>
      </tr>`;
    }).join('') || '<tr><td colspan="10" class="empty">Aucune facture</td></tr>';

    document.getElementById('tot-ff-total').textContent = fmt(data.reduce((s,f)=>s+Number(f.total),0));
    document.getElementById('tot-ff-paye').textContent  = fmt(data.reduce((s,f)=>s+Number(f.paiement),0));
    document.getElementById('tot-ff-solde').textContent = fmt(data.reduce((s,f)=>s+Number(f.solde),0));

    // KPIs globaux (toutes factures, pas seulement filtrées)
    const allFactures = await api('/factures');
    const totalDu = allFactures.reduce((s,f)=>s+Number(f.solde),0);
    const now = new Date();
    const moisFactures = allFactures.filter(f => { const dt=new Date(f.date_facture); return dt.getMonth()===now.getMonth()&&dt.getFullYear()===now.getFullYear(); });
    const nbImpayees = allFactures.filter(f => Number(f.solde) > 0).length;

    document.getElementById('ff-total-du').textContent    = fmt(totalDu);
    document.getElementById('ff-total-mois').textContent  = fmt(moisFactures.reduce((s,f)=>s+Number(f.total),0));
    document.getElementById('ff-nb-impayees').textContent = nbImpayees;
    const badge = document.getElementById('badge-fact-imp');
    if (badge) badge.textContent = nbImpayees;

    // Crédit d'avance global (somme des soldes_compte négatifs des fournisseurs)
    try {
      const comptes = await api('/factures/comptes');
      const creditTotal = comptes.reduce((s,f) => s + (Number(f.solde_compte) < 0 ? Math.abs(Number(f.solde_compte)) : 0), 0);
      const elCredit = document.getElementById('ff-credit-avance');
      if (elCredit) elCredit.textContent = fmt(creditTotal);
    } catch (e) {}
  } catch (e) { tbody.innerHTML = `<tr><td colspan="10" class="empty">${e.message}</td></tr>`; }
}

function openFactureModal() {
  document.getElementById('mff-id').value = '';
  document.getElementById('mff-title').textContent = 'Nouvelle facture fournisseur';
  document.getElementById('mff-date').value = today();
  ['mff-qte','mff-pu','mff-total','mff-solde','mff-obs','mff-echeance'].forEach(f => document.getElementById(f).value = '');
  document.getElementById('mff-paye').value = '0';
  document.getElementById('mff-fichier-info').textContent = '';
  const sel = document.getElementById('mff-fourn');
  sel.innerHTML = '<option value="">Sélectionner…</option>' +
    fournisseursCache.filter(f=>f.statut==='actif').map(f => `<option value="${f.id}">${f.nom}</option>`).join('');
  openModal('m-facture');
}
function fillFacturePrix() {
  const fid = document.getElementById('mff-fourn').value;
  if (fid && prixAchatActifs[fid]) document.getElementById('mff-pu').value = prixAchatActifs[fid];
  calcFacture();
}
function calcFacture() {
  const q = parseInt(document.getElementById('mff-qte').value)||0;
  const p = parseInt(document.getElementById('mff-pu').value)||0;
  const pay = parseFloat(document.getElementById('mff-paye').value)||0;
  const tot = q*p;
  document.getElementById('mff-total').value = fmt(tot);
  document.getElementById('mff-solde').value = fmt(Math.max(0, tot-pay));
}
async function editFacture(id) {
  const f = facturesCache.find(x => x.id === id); if (!f) return;
  document.getElementById('mff-id').value = id;
  document.getElementById('mff-title').textContent = 'Modifier facture';
  const sel = document.getElementById('mff-fourn');
  sel.innerHTML = '<option value="">Sélectionner…</option>' +
    fournisseursCache.map(fr => `<option value="${fr.id}" ${fr.id===f.fournisseur_id?'selected':''}>${fr.nom}</option>`).join('');
  document.getElementById('mff-date').value = f.date_facture;
  document.getElementById('mff-qte').value  = f.quantite;
  document.getElementById('mff-pu').value   = f.prix_unitaire;
  document.getElementById('mff-paye').value = f.paiement;
  document.getElementById('mff-echeance').value = f.date_echeance || '';
  document.getElementById('mff-obs').value  = f.observations || '';
  document.getElementById('mff-fichier-info').textContent = f.fichier_facture ? `Fichier actuel: ${f.fichier_facture}` : '';
  calcFacture();
  openModal('m-facture');
}
async function saveFacture() {
  const fournisseur_id = document.getElementById('mff-fourn').value;
  const quantite = document.getElementById('mff-qte').value;
  const prix_unitaire = document.getElementById('mff-pu').value;
  if (!fournisseur_id || !quantite || !prix_unitaire) { showToast('Fournisseur, quantité et prix requis', 'error'); return; }
  const id = document.getElementById('mff-id').value;
  const fd = new FormData();
  fd.append('fournisseur_id', fournisseur_id);
  fd.append('date_facture',   document.getElementById('mff-date').value);
  fd.append('quantite',       quantite);
  fd.append('prix_unitaire',  prix_unitaire);
  fd.append('paiement',       document.getElementById('mff-paye').value || 0);
  fd.append('date_echeance',  document.getElementById('mff-echeance').value);
  fd.append('observations',  document.getElementById('mff-obs').value);
  const fi = document.getElementById('mff-file');
  if (fi && fi.files[0]) fd.append('fichier', fi.files[0]);
  try {
    let result;
    if (id) { result = await api('/factures/' + id, 'PUT', fd); }
    else    { result = await api('/factures', 'POST', fd); }
    closeModal('m-facture');
    if (!id && result.credit_consomme > 0) {
      showToast(`Facture enregistrée. Crédit d'avance utilisé : ${fmt(result.credit_consomme)} ✓`);
    } else {
      showToast((id?'Facture modifiée':'Facture enregistrée') + ' ✓');
    }
    loadFactures(); loadFournisseurs();
    if (fi) fi.value = '';
  } catch (e) { showToast(e.message, 'error'); }
}
async function deleteFacture(id) {
  if (!confirm('Supprimer cette facture ?')) return;
  try { await api('/factures/' + id, 'DELETE'); showToast('Facture supprimée'); loadFactures(); }
  catch (e) { showToast(e.message, 'error'); }
}

// ── Payer une facture ──
function openPayerFacture(id) {
  const f = facturesCache.find(x => x.id === id); if (!f) return;
  document.getElementById('pf-facture-id').value = id;
  document.getElementById('pf-numero').textContent = f.numero;
  document.getElementById('pf-date').value = today();
  document.getElementById('pf-montant').value = f.solde;
  document.getElementById('pf-obs').value = '';
  document.getElementById('pf-deduire-banque').checked = true;
  document.getElementById('pf-info').innerHTML =
    `<strong>${f.fournisseur_nom}</strong> — Facture ${f.numero} du ${f.date_facture}<br>
     Total: ${fmt(f.total)} — Déjà payé: ${fmt(f.paiement)}<br>
     <strong style="color:var(--red)">Solde restant: ${fmt(f.solde)}</strong>`;
  openModal('m-payer-facture');
}
async function payerFacture() {
  const id = document.getElementById('pf-facture-id').value;
  const montant = document.getElementById('pf-montant').value;
  const date_paiement = document.getElementById('pf-date').value;
  if (!montant || parseFloat(montant) <= 0) { showToast('Montant invalide', 'error'); return; }
  if (!date_paiement) { showToast('Date requise', 'error'); return; }
  try {
    await api('/factures/' + id + '/payer', 'POST', {
      date_paiement, montant,
      mode: document.getElementById('pf-mode').value,
      observation: document.getElementById('pf-obs').value,
      deduire_banque: document.getElementById('pf-deduire-banque').checked,
    });
    closeModal('m-payer-facture');
    showToast('Paiement enregistré' + (document.getElementById('pf-deduire-banque').checked ? ', banque mise à jour ✓' : ' ✓'));
    loadFactures();
  } catch (e) { showToast(e.message, 'error'); }
}

// ══════════════════════════════════════════════════════════════
// BANQUE — solde initial
// ══════════════════════════════════════════════════════════════
function openSoldeInitialModal() {
  api('/banque/solde-initial').then(d => {
    document.getElementById('si-montant').value = d.montant || 0;
    document.getElementById('si-date').value = d.date || today();
  }).catch(() => {
    document.getElementById('si-montant').value = 0;
    document.getElementById('si-date').value = today();
  });
  openModal('m-solde-initial');
}
async function saveSoldeInitial() {
  const montant = document.getElementById('si-montant').value;
  const date = document.getElementById('si-date').value;
  if (montant === '' || !date) { showToast('Montant et date requis', 'error'); return; }
  if (!confirm('Confirmer ? Tous les mouvements bancaires seront recalculés à partir de ce nouveau solde initial.')) return;
  try {
    await api('/banque/solde-initial', 'POST', { montant, date });
    closeModal('m-solde-initial');
    showToast('Solde initial synchronisé ✓');
    loadBanque(); loadDashboard();
  } catch (e) { showToast(e.message, 'error'); }
}


document.addEventListener('DOMContentLoaded', () => {
  if (!isDark) document.body.classList.add('light');
  ['mv-date','ml-date','mr-date','ms-date','mp-date','mb-date','mpx-date','fv-date','rep-date-filter'].forEach(id => {
    const el = document.getElementById(id); if (el) el.value = today();
  });
  if (token && currentUser) startApp();
  else document.getElementById('login-wrap').style.display = 'flex';
});

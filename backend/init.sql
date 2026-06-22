-- ============================================================
--  Positive Distribution — Script d'initialisation MySQL
--  Version : Juin 2026
--  Usage   : mysql -u root -p positive_distribution < init.sql
-- ============================================================

CREATE DATABASE IF NOT EXISTS positive_distribution
  CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE positive_distribution;

-- ── Tables ──────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS utilisateurs (
  id            INT AUTO_INCREMENT PRIMARY KEY,
  nom           VARCHAR(100) NOT NULL,
  email         VARCHAR(150) NOT NULL UNIQUE,
  mot_de_passe  VARCHAR(255) NOT NULL,
  role          ENUM('Admin','Commercial') NOT NULL DEFAULT 'Commercial',
  statut        ENUM('actif','inactif') NOT NULL DEFAULT 'actif',
  dernier_acces DATETIME NULL,
  created_at    TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS clients (
  id            INT AUTO_INCREMENT PRIMARY KEY,
  code          VARCHAR(20) NOT NULL UNIQUE,
  nom           VARCHAR(150) NOT NULL,
  telephone     VARCHAR(50)  NULL,
  zone          VARCHAR(100) NULL,
  adresse       TEXT         NULL,
  categorie     ENUM('revendeur_principal','autre_revendeur','patisserie_conso') NOT NULL,
  statut        ENUM('actif','inactif','archive') NOT NULL DEFAULT 'actif',
  solde_global  DECIMAL(15,0) NOT NULL DEFAULT 0,
  observation   TEXT NULL,
  created_at    TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS prix_carton (
  id            INT AUTO_INCREMENT PRIMARY KEY,
  date_effet    DATE NOT NULL,
  categorie     ENUM('revendeur_principal','autre_revendeur','patisserie_conso') NOT NULL,
  prix_unitaire DECIMAL(10,0) NOT NULL,
  actif         TINYINT(1) NOT NULL DEFAULT 1,
  created_at    TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS livraisons (
  id                INT AUTO_INCREMENT PRIMARY KEY,
  date_livraison    DATE NOT NULL,
  quantite_cartons  INT NOT NULL,
  fournisseur       VARCHAR(150) NULL,
  notes             TEXT NULL,
  fichier_facture   VARCHAR(255) NULL,
  created_at        TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS ventes (
  id            INT AUTO_INCREMENT PRIMARY KEY,
  date_vente    DATE NOT NULL,
  numero        VARCHAR(20) NOT NULL UNIQUE,
  client_id     INT NOT NULL,
  quantite      INT NOT NULL,
  prix_unitaire DECIMAL(10,0) NOT NULL,
  total         DECIMAL(15,0) NOT NULL,
  paiement      DECIMAL(15,0) NOT NULL DEFAULT 0,
  solde         DECIMAL(15,0) NOT NULL DEFAULT 0,
  observations  TEXT NULL,
  created_at    TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (client_id) REFERENCES clients(id)
);

CREATE TABLE IF NOT EXISTS recouvrements (
  id              INT AUTO_INCREMENT PRIMARY KEY,
  client_id       INT NOT NULL,
  date_paiement   DATE NOT NULL,
  montant_recu    DECIMAL(15,0) NOT NULL,
  montant_restant DECIMAL(15,0) NOT NULL DEFAULT 0,
  date_suivi      DATE NULL,
  observation     TEXT NULL,
  created_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (client_id) REFERENCES clients(id)
);

CREATE TABLE IF NOT EXISTS stock_actuel (
  id       INT PRIMARY KEY DEFAULT 1,
  cartons  INT NOT NULL DEFAULT 0,
  plateaux INT NOT NULL DEFAULT 0,
  oeufs    INT NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS stock_mouvements (
  id              INT AUTO_INCREMENT PRIMARY KEY,
  date_mouvement  DATE NOT NULL,
  type_mouvement  ENUM('entree','sortie','perte','ajustement') NOT NULL,
  cartons         INT NOT NULL DEFAULT 0,
  plateaux        INT NOT NULL DEFAULT 0,
  oeufs           INT NOT NULL DEFAULT 0,
  motif           TEXT NOT NULL,
  reference_id    INT NULL,
  reference_type  VARCHAR(50) NULL,
  created_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS pertes (
  id             INT AUTO_INCREMENT PRIMARY KEY,
  date_perte     DATE NOT NULL,
  type_perte     ENUM('casse','perte','manquant','abime') NOT NULL DEFAULT 'casse',
  quantite_oeufs INT NOT NULL,
  cause          TEXT NOT NULL,
  created_at     TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS banque_mouvements (
  id              INT AUTO_INCREMENT PRIMARY KEY,
  date_mouvement  DATE NOT NULL,
  description     VARCHAR(255) NOT NULL,
  reference       VARCHAR(100) NULL,
  encaissement    DECIMAL(15,0) NOT NULL DEFAULT 0,
  decaissement    DECIMAL(15,0) NOT NULL DEFAULT 0,
  solde           DECIMAL(15,0) NOT NULL DEFAULT 0,
  commentaires    TEXT NULL,
  fichier_bordereau VARCHAR(255) NULL,
  created_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ── Données initiales ────────────────────────────────────────

-- Stock initial (ligne unique)
INSERT IGNORE INTO stock_actuel (id, cartons, plateaux, oeufs) VALUES (1, 0, 0, 0);

-- Prix initiaux (tarifs au 02/06/2026)
INSERT INTO prix_carton (date_effet, categorie, prix_unitaire, actif) VALUES
  ('2026-06-02', 'revendeur_principal', 29000, 1),
  ('2026-06-02', 'autre_revendeur',     29500, 1),
  ('2026-06-02', 'patisserie_conso',    33000, 1);

-- Utilisateurs (mots de passe : "Pimpact" hashés avec bcrypt)
-- Hash généré avec bcrypt saltRounds=10 pour "Pimpact"
INSERT INTO utilisateurs (nom, email, mot_de_passe, role) VALUES
  ('Oumar',      'oumar@pimpact.net',      '$2a$10$QORhR24rHciPUr3MeDvpxOymjoLP5qitNNPJ95SNGWy31a40WHMpy', 'Admin'),
  ('Abdoulaye',  'abdoulaye@pimpact.net',  '$2a$10$QORhR24rHciPUr3MeDvpxOymjoLP5qitNNPJ95SNGWy31a40WHMpy', 'Admin'),
  ('Brahim',     'brahim@pimpact.net',     '$2a$10$QORhR24rHciPUr3MeDvpxOymjoLP5qitNNPJ95SNGWy31a40WHMpy', 'Admin'),
  ('Zenab',      'zenab@pimpact.net',      '$2a$10$QORhR24rHciPUr3MeDvpxOymjoLP5qitNNPJ95SNGWy31a40WHMpy', 'Admin'),
  ('Bechir',     'bechir@pimpact.net',     '$2a$10$QORhR24rHciPUr3MeDvpxOymjoLP5qitNNPJ95SNGWy31a40WHMpy', 'Commercial'),
  ('Moussa',     'moussa@pimpact.net',     '$2a$10$QORhR24rHciPUr3MeDvpxOymjoLP5qitNNPJ95SNGWy31a40WHMpy', 'Commercial');

-- Clients initiaux
INSERT INTO clients (code, nom, telephone, zone, adresse, categorie, statut, solde_global) VALUES
  ('CLI-001', 'Voisin Chaibo Dembe',            '', 'Dembe',              '', 'revendeur_principal', 'actif', 0),
  ('CLI-002', 'Goni Gassi',                     '', 'Gassi',              '', 'revendeur_principal', 'actif', 0),
  ('CLI-003', 'Adam Issakha Idriss Farcha',      '', 'Farcha Djougoulie',  '', 'revendeur_principal', 'actif', 0),
  ('CLI-004', 'Mht Ismail Farcha Djougoulie',   '', 'Farcha Djougoulie',  '', 'revendeur_principal', 'actif', 0),
  ('CLI-005', 'Achou Farcha Djougoulie',        '', 'Farcha Djougoulie',  '', 'revendeur_principal', 'actif', 0),
  ('CLI-006', 'Hadje Mariam Massaguet',         '', 'Massaguet',          '', 'autre_revendeur',     'actif', 0),
  ('CLI-007', 'Hadje Mariam Bitkine',           '', 'Bitkine',            '', 'autre_revendeur',     'actif', 0),
  ('CLI-008', 'Moussa Kello',                   '', 'Kello',              '', 'autre_revendeur',     'actif', 0),
  ('CLI-009', 'Haroune BEAC Sandwicherie',      '', 'Centre',             '', 'autre_revendeur',     'actif', 0),
  ('CLI-010', 'Vente Directe',                  '', 'Centre',             '', 'autre_revendeur',     'actif', 0),
  ('CLI-011', 'Clients Divers',                 '', 'Centre',             '', 'autre_revendeur',     'actif', 0),
  ('CLI-012', 'Abba Ali Souleymane Abeche',     '', 'Abeche',             '', 'autre_revendeur',     'actif', 0),
  ('CLI-013', 'SPP Sopetrans',                  '', 'Centre',             '', 'patisserie_conso',    'actif', 0),
  ('CLI-014', 'AG',                             '', 'Centre',             '', 'patisserie_conso',    'actif', 0),
  ('CLI-015', 'Pain Doré',                      '', 'Centre',             '', 'patisserie_conso',    'actif', 0);

-- ── Message final ─────────────────────────────────────────────
SELECT '✅ Base de données initialisée avec succès !' AS message;
SELECT '   Connectez-vous avec : email@pimpact.net / Pimpact' AS message;

-- ── Table journal_activite (ajout) ───────────────────────────
CREATE TABLE IF NOT EXISTS journal_activite (
  id              INT AUTO_INCREMENT PRIMARY KEY,
  date_action     DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  utilisateur_id  INT NOT NULL,
  utilisateur_nom VARCHAR(100) NOT NULL,
  action          VARCHAR(50) NOT NULL,
  module          VARCHAR(50) NOT NULL,
  description     TEXT NOT NULL,
  created_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

SELECT '✅ Base initialisée avec journal_activite' AS message;

-- ════════════════════════════════════════════════════════════
-- AJOUT — Fournisseurs, Factures, Banque enrichie
-- ════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS fournisseurs (
  id          INT AUTO_INCREMENT PRIMARY KEY,
  nom         VARCHAR(150) NOT NULL,
  telephone   VARCHAR(50)  NULL,
  adresse     TEXT NULL,
  statut      ENUM('actif','inactif') NOT NULL DEFAULT 'actif',
  observation TEXT NULL,
  created_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS prix_achat (
  id              INT AUTO_INCREMENT PRIMARY KEY,
  fournisseur_id  INT NOT NULL,
  date_effet      DATE NOT NULL,
  prix_unitaire   DECIMAL(10,0) NOT NULL,
  actif           TINYINT(1) NOT NULL DEFAULT 1,
  created_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (fournisseur_id) REFERENCES fournisseurs(id)
);

CREATE TABLE IF NOT EXISTS factures_fournisseur (
  id              INT AUTO_INCREMENT PRIMARY KEY,
  numero          VARCHAR(30) NOT NULL UNIQUE,
  fournisseur_id  INT NOT NULL,
  date_facture    DATE NOT NULL,
  quantite        INT NOT NULL,
  prix_unitaire   DECIMAL(10,0) NOT NULL,
  total           DECIMAL(15,0) NOT NULL,
  paiement        DECIMAL(15,0) NOT NULL DEFAULT 0,
  solde           DECIMAL(15,0) NOT NULL DEFAULT 0,
  date_echeance   DATE NULL,
  observations    TEXT NULL,
  fichier_facture VARCHAR(255) NULL,
  livraison_id    INT NULL,
  created_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (fournisseur_id) REFERENCES fournisseurs(id),
  FOREIGN KEY (livraison_id) REFERENCES livraisons(id)
);

CREATE TABLE IF NOT EXISTS paiements_fournisseur (
  id            INT AUTO_INCREMENT PRIMARY KEY,
  facture_id    INT NOT NULL,
  date_paiement DATE NOT NULL,
  montant       DECIMAL(15,0) NOT NULL,
  mode          VARCHAR(50) NULL,
  observation   TEXT NULL,
  banque_mvt_id INT NULL,
  created_at    TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (facture_id) REFERENCES factures_fournisseur(id)
);

-- Ajout des colonnes catégorie/référence sur banque_mouvements
-- (compatible avec toutes les versions de MySQL, contrairement à ADD COLUMN IF NOT EXISTS)
DROP PROCEDURE IF EXISTS pd_add_column_if_missing;
DELIMITER //
CREATE PROCEDURE pd_add_column_if_missing()
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'banque_mouvements' AND COLUMN_NAME = 'categorie'
  ) THEN
    ALTER TABLE banque_mouvements ADD COLUMN categorie VARCHAR(50) NULL DEFAULT 'autre';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'banque_mouvements' AND COLUMN_NAME = 'reference_id'
  ) THEN
    ALTER TABLE banque_mouvements ADD COLUMN reference_id INT NULL;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'banque_mouvements' AND COLUMN_NAME = 'reference_type'
  ) THEN
    ALTER TABLE banque_mouvements ADD COLUMN reference_type VARCHAR(50) NULL;
  END IF;
END //
DELIMITER ;
CALL pd_add_column_if_missing();
DROP PROCEDURE pd_add_column_if_missing;

CREATE TABLE IF NOT EXISTS parametres (
  cle    VARCHAR(50) PRIMARY KEY,
  valeur VARCHAR(255) NOT NULL
);

INSERT IGNORE INTO parametres (cle, valeur) VALUES ('solde_banque_initial', '0');
INSERT IGNORE INTO parametres (cle, valeur) VALUES ('solde_banque_initial_date', CURDATE());

-- Fournisseur de test (à adapter)
INSERT IGNORE INTO fournisseurs (id, nom, statut) VALUES (1, 'Fournisseur Alpha', 'actif');
INSERT IGNORE INTO prix_achat (fournisseur_id, date_effet, prix_unitaire, actif) VALUES (1, CURDATE(), 25000, 1);

SELECT '✅ Tables Fournisseurs/Factures/Banque ajoutées' AS message;

-- ── Compte fournisseur : solde global (dette positive / crédit négatif) ──
DROP PROCEDURE IF EXISTS pd_add_solde_compte;
DELIMITER //
CREATE PROCEDURE pd_add_solde_compte()
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'fournisseurs' AND COLUMN_NAME = 'solde_compte'
  ) THEN
    ALTER TABLE fournisseurs ADD COLUMN solde_compte DECIMAL(15,0) NOT NULL DEFAULT 0;
  END IF;
END //
DELIMITER ;
CALL pd_add_solde_compte();
DROP PROCEDURE pd_add_solde_compte;

SELECT '✅ Colonne solde_compte ajoutée sur fournisseurs' AS message;

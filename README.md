# 🥚 Positive Distribution — Application Web

Application de gestion de distribution d'œufs pour **Positive Distribution** (Tchad).  
Stack : **Node.js + Express + MySQL + Vanilla JS**

---

## 📋 Table des matières

1. [Prérequis](#prérequis)
2. [Installation locale](#installation-locale)
3. [Premier démarrage](#premier-démarrage)
4. [Comptes utilisateurs](#comptes-utilisateurs)
5. [Structure du projet](#structure-du-projet)
6. [Déploiement en production](#déploiement-en-production)
7. [Variables d'environnement](#variables-denvironnement)
8. [Règles métier](#règles-métier)
9. [Dépannage](#dépannage)

---

## Prérequis

| Logiciel | Version minimale | Vérification |
|----------|-----------------|--------------|
| Node.js  | 18.x ou supérieur | `node --version` |
| npm      | 8.x ou supérieur  | `npm --version` |
| MySQL    | 8.0              | `mysql --version` |

---

## Installation locale

### Étape 1 — Cloner / extraire le projet

```bash
# Si vous avez le ZIP :
unzip positive-distribution.zip
cd positive-distribution
```

### Étape 2 — Installer les dépendances backend

```bash
cd backend
npm install
```

### Étape 3 — Créer le fichier de configuration

```bash
# Copier le fichier exemple
cp .env.example .env
```

Ouvrir `.env` et remplir vos informations MySQL :

```env
DB_HOST=localhost
DB_PORT=3306
DB_USER=root
DB_PASSWORD=votre_mot_de_passe_mysql
DB_NAME=positive_distribution
JWT_SECRET=une_chaine_aleatoire_longue_et_secrete_minimum_32_caracteres
PORT=3001
NODE_ENV=development
```

> **JWT_SECRET** : générez une chaîne aléatoire longue, par exemple :
> ```bash
> node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
> ```

### Étape 4 — Initialiser la base de données MySQL

```bash
# Se connecter à MySQL
mysql -u root -p

# Dans MySQL, exécuter le script :
mysql -u root -p < backend/init.sql

# OU depuis MySQL shell :
source /chemin/vers/backend/init.sql
```

Le script crée :
- La base de données `positive_distribution`
- Toutes les tables
- Les 6 utilisateurs initiaux (mot de passe : `Pimpact`)
- Les 15 clients initiaux
- Les prix par catégorie

---

## Premier démarrage

### Mode développement (avec rechargement automatique)

```bash
cd backend
npm run dev
```

### Mode production

```bash
cd backend
npm start
```

L'application est accessible sur : **http://localhost:3001**

> ⚠️ **Important** : En mode développement, le frontend est servi directement depuis
> `frontend/public/`. Vous pouvez ouvrir `frontend/public/index.html` dans le navigateur
> **ou** accéder via `http://localhost:3001` (le serveur sert le frontend en production).
>
> En mode `development`, ouvrez directement le fichier HTML ou lancez un serveur statique :
> ```bash
> # Depuis la racine du projet
> npx serve frontend/public -p 3000
> ```
> Puis accédez à `http://localhost:3000` — l'API tourne sur `http://localhost:3001`.

---

## Comptes utilisateurs

Tous les comptes ont le mot de passe initial : **`Pimpact`**

| Nom | Email | Rôle |
|-----|-------|------|
| Oumar | oumar@pimpact.net | Admin |
| Abdoulaye | abdoulaye@pimpact.net | Admin |
| Brahim | brahim@pimpact.net | Admin |
| Zenab | zenab@pimpact.net | Admin |
| Bechir | bechir@pimpact.net | Commercial |
| Moussa | moussa@pimpact.net | Commercial |

### Différences Admin / Commercial

| Fonctionnalité | Admin | Commercial |
|----------------|:-----:|:----------:|
| Tableau de bord | ✅ | ✅ |
| Ventes (créer/modifier) | ✅ | ✅ |
| Ventes (supprimer) | ✅ | ❌ |
| Clients (créer/modifier) | ✅ | ✅ |
| Clients (supprimer) | ✅ | ❌ |
| Livraisons | ✅ | ✅ |
| Recouvrements | ✅ | ✅ |
| Stock, Pertes | ✅ | ✅ |
| **Banque** | ✅ | ❌ |
| Rapports | ✅ | ✅ |
| Import/Export Excel | ✅ | ✅ |
| **Modifier les prix** | ✅ | ❌ |
| **Gérer les utilisateurs** | ✅ | ❌ |

---

## Structure du projet

```
positive-distribution/
├── README.md
├── backend/
│   ├── server.js              ← Point d'entrée Express
│   ├── package.json
│   ├── .env.example           ← Modèle de configuration (copier en .env)
│   ├── init.sql               ← Script SQL d'initialisation complète
│   ├── config/
│   │   └── db.js              ← Pool de connexion MySQL
│   ├── middleware/
│   │   └── auth.js            ← Vérification JWT + restriction admin
│   └── routes/
│       ├── auth.js            ← POST /api/auth/login, GET /api/auth/me
│       ├── clients.js         ← CRUD clients
│       ├── ventes.js          ← CRUD ventes + gestion stock
│       ├── livraisons.js      ← CRUD livraisons + gestion stock
│       ├── recouvrements.js   ← CRUD paiements + mise à jour soldes
│       ├── stock.js           ← Stock actuel + journal + ajustements
│       ├── pertes.js          ← CRUD pertes + déduction stock
│       ├── banque.js          ← Journal bancaire (admin)
│       ├── prix.js            ← Prix par catégorie + historique
│       ├── utilisateurs.js    ← Gestion utilisateurs (admin)
│       └── rapports.js        ← Agrégation rapport journalier
└── frontend/
    └── public/
        ├── index.html         ← Interface complète (CSS inclus)
        └── app.js             ← Logique JavaScript (appels API, UI)
```

---

## Déploiement en production

📄 **Voir le guide détaillé : [`DEPLOIEMENT_RENDER_AIVEN.md`](./DEPLOIEMENT_RENDER_AIVEN.md)**

Ce guide couvre le déploiement gratuit en continu sur **Render** (backend) + **Aiven** (base MySQL gratuite), étape par étape, sans carte bancaire requise.

> ⚠️ **Important** : Le hash dans `init.sql` correspond au mot de passe `"password"` (hash de test bcrypt.js), **pas `"Pimpact"`**. Pour générer le vrai hash, lancez ce script **une seule fois** après déploiement :

```bash
cd backend
node -e "
const bcrypt = require('bcryptjs');
bcrypt.hash('Pimpact', 10).then(hash => {
  console.log('Hash à utiliser dans init.sql :');
  console.log(hash);
});
"
```

Puis remplacez le hash dans `init.sql` avant d'importer, ou faites une mise à jour SQL :

```sql
UPDATE utilisateurs SET mot_de_passe = 'LE_HASH_GENERE' WHERE email LIKE '%pimpact.net';
```

---

## Variables d'environnement

### Développement local (`.env`)

```env
DB_HOST=localhost
DB_PORT=3306
DB_USER=root
DB_PASSWORD=votre_mdp_mysql
DB_NAME=positive_distribution
JWT_SECRET=chaine_aleatoire_longue
PORT=3001
NODE_ENV=development
```

### Production (Render + Aiven)

Voir le détail complet dans [`DEPLOIEMENT_RENDER_AIVEN.md`](./DEPLOIEMENT_RENDER_AIVEN.md). En résumé :

| Variable | Valeur |
|----------|--------|
| `NODE_ENV` | `production` |
| `JWT_SECRET` | Chaîne aléatoire ≥ 32 caractères |
| `MYSQLHOST` | *(fourni par Aiven)* |
| `MYSQLPORT` | *(fourni par Aiven)* |
| `MYSQLUSER` | *(fourni par Aiven, généralement `avnadmin`)* |
| `MYSQLPASSWORD` | *(fourni par Aiven)* |
| `MYSQLDATABASE` | *(fourni par Aiven, généralement `defaultdb`)* |
| `DB_SSL_CA` | *(contenu du certificat `ca.pem` téléchargé depuis Aiven)* |

---

## Règles métier

### Conversions d'unités

```
1 carton   = 12 plateaux = 360 œufs
1 plateau  = 30 œufs
```

### Prix par catégorie (au 02/06/2026)

| Catégorie | Prix / carton |
|-----------|--------------|
| Revendeurs Principaux | 29 000 FCFA |
| Autres Revendeurs | 29 500 FCFA |
| Patisseries / Conso | 33 000 FCFA |

### Stock

- **Livraison** → ajoute automatiquement les cartons au stock
- **Vente** → déduit automatiquement du stock (bloquée si stock insuffisant)
- **Suppression d'une vente** → restaure le stock
- **Normalisation** : œufs ≥ 30 → convertis en plateaux ; plateaux ≥ 12 → convertis en cartons

### Soldes clients

Le solde = somme des montants non payés sur toutes les ventes.  
Il se recalcule automatiquement après chaque vente ou recouvrement.

---

## Dépannage

### "Erreur de connexion MySQL"
- Vérifiez que MySQL est démarré : `sudo systemctl status mysql`
- Vérifiez les credentials dans `.env`
- Testez manuellement : `mysql -u root -p -e "SHOW DATABASES;"`

### "Token invalide ou expiré"
- Le JWT expire après 12h. Déconnectez-vous et reconnectez-vous.

### "Stock insuffisant" au premier test
- Ajoutez d'abord une livraison (module **Livraison du jour**) pour alimenter le stock.

### Le frontend ne se charge pas en production
- Vérifiez que `NODE_ENV=production` est défini.
- Vérifiez que le dossier `frontend/public/` contient bien `index.html` et `app.js`.

### Import Excel échoue
- Utilisez le bouton **📋 Modèle** pour télécharger le format attendu.
- Respectez exactement les noms de colonnes (respect de la casse).
- Pour les clients, la valeur de `Categorie` doit être : `revendeur_principal`, `autre_revendeur` ou `patisserie_conso`.

---

## Contacts & support

Application développée pour **Positive Distribution** — Tchad  
Juin 2026

---

*Pour toute question technique, référez-vous à la documentation Express.js (expressjs.com), Render (render.com/docs) et Aiven (aiven.io/docs).*

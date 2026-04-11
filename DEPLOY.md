# Guide de déploiement — TRH Tennis Club

## Architecture de production
- **Frontend** React + **Backend** Express → Gandi Simple Hosting (Node.js)
- **Base de données** MySQL → Gandi Simple Hosting
- **Déploiement** automatique via GitHub Actions → Git Gandi

## Flux de déploiement
`git push origin main` → GitHub Actions → build React → push vers Gandi git → Gandi démarre `npm start`

## Étapes initiales (une seule fois)

### 1. Créer le dépôt GitHub
Sur github.com, créez le dépôt `jjili2000/trh`.
```bash
git init
git add .
git commit -m "Initial commit"
git remote add origin https://github.com/jjili2000/trh.git
git branch -M main
git push -u origin main
```

### 2. Générer une clé SSH de déploiement
```powershell
ssh-keygen -t ed25519 -C "github-gandi-deploy" -f gandi_deploy -N '""'
```
- **`gandi_deploy.pub`** → Gandi admin → **Administration et Sécurité** → **Clés SSH** → Ajouter
- **`gandi_deploy`** → GitHub → Settings → Secrets → Actions → `GANDI_SSH_KEY`
- Supprimez les fichiers locaux : `del gandi_deploy gandi_deploy.pub`

### 3. Initialiser la base de données
Via **phpMyAdmin** (lien dans le panneau de contrôle Gandi) :
1. Créez la base `trh_tennis`
2. Importez `server/setup.sql`

Puis depuis votre machine locale avec les credentials Gandi dans `server/.env` :
```bash
cd server
node seed.js
```

### 4. Uploader le fichier `.env` sur Gandi via SFTP
Créez `server/.env` avec vos credentials MySQL Gandi :
```
DB_HOST=localhost
DB_PORT=3306
DB_USER=votre_user_mysql
DB_PASSWORD=votre_mot_de_passe
DB_NAME=trh_tennis
JWT_SECRET=votre_cle_secrete_longue
NODE_ENV=production
```
Générez le JWT_SECRET :
```powershell
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

Via FileZilla (SFTP), uploadez ce fichier `.env` à la racine du vhost :
`/lamp0/web/vhosts/trh.neos.live/.env`

### 5. Secret GitHub Actions
Sur github.com/jjili2000/trh → Settings → Secrets and variables → Actions :

| Nom | Valeur |
|-----|--------|
| `GANDI_SSH_KEY` | Contenu de la clé privée `gandi_deploy` |

### 6. Premier déploiement
```bash
git push origin main
```
Suivez l'avancement dans l'onglet **Actions** de votre dépôt GitHub.

## Déploiement continu
Chaque `git push origin main` redéploie automatiquement l'application.

## URLs
- Application : https://trh.neos.live
- Suivi : https://github.com/jjili2000/trh/actions

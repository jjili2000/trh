# Déploiement — TRH Tennis Club

## Architecture de production
- Frontend React buildé → servi comme fichiers statiques par Express
- Backend Node.js/Express sur Gandi Simple Hosting
- Base de données MySQL sur Gandi

## Étapes initiales (une seule fois)

### 1. Créer le dépôt GitHub
```bash
git init
git add .
git commit -m "Initial commit"
git remote add origin https://github.com/jjili2000/trh.git
git push -u origin main
```

### 2. Générer une clé SSH pour le déploiement
```bash
ssh-keygen -t ed25519 -C "github-actions-gandi" -f gandi_deploy -N ""
```
Cela crée deux fichiers :
- `gandi_deploy` (clé privée → GitHub Secret)
- `gandi_deploy.pub` (clé publique → Gandi)

### 3. Ajouter la clé publique à Gandi
Dans l'espace admin Gandi → Simple Hosting → votre instance → SSH Keys
Copiez le contenu de `gandi_deploy.pub` et ajoutez-le.

### 4. Ajouter la clé privée à GitHub
Sur github.com/jjili2000/trh → Settings → Secrets and variables → Actions → New repository secret
- Name: `GANDI_SSH_KEY`
- Value: contenu de `gandi_deploy` (la clé privée)

### 5. Variables d'environnement sur Gandi
Dans l'espace admin Gandi → Simple Hosting → Environment variables, ajouter :
- `DB_HOST` : hôte MySQL Gandi
- `DB_PORT` : 3306
- `DB_USER` : utilisateur MySQL
- `DB_PASSWORD` : mot de passe MySQL
- `DB_NAME` : trh_tennis
- `JWT_SECRET` : chaîne aléatoire longue (ex: générer avec `openssl rand -hex 32`)
- `NODE_ENV` : production

### 6. Créer la base de données sur Gandi
Via MySQL Workbench ou l'outil Gandi, exécuter `server/setup.sql` puis `node seed.js`.

## Déploiement continu
Chaque `git push origin main` déclenche automatiquement le déploiement via GitHub Actions.

## Supprimer les clés temporaires
```bash
del gandi_deploy gandi_deploy.pub
```

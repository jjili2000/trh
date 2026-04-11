# TRH Server

Express + MySQL backend for the Tennis Club HR app.

## Setup

### 1. Install MySQL and create the database

```bash
mysql -u root -p < setup.sql
```

### 2. Configure environment

```bash
cp .env.example .env
# Edit .env and fill in DB_PASSWORD, JWT_SECRET, etc.
```

### 3. Install dependencies

```bash
npm install
```

### 4. Seed initial data (run once)

```bash
node seed.js
```

This creates the three demo users with bcrypt-hashed passwords:
- admin@tennisclub.fr / admin123
- manager@tennisclub.fr / manager123
- user@tennisclub.fr / user123

### 5. Start the server

```bash
# Development (auto-restart on changes)
npm run dev

# Production
npm start
```

The server runs on port 3001 by default.

## API Endpoints

All endpoints (except `/api/auth/login` and `/api/health`) require a `Authorization: Bearer <token>` header.

| Method | Path | Description |
|--------|------|-------------|
| POST | /api/auth/login | Authenticate, returns JWT |
| GET | /api/users | List users (admin/manager) |
| GET | /api/users/me | Current user profile |
| POST | /api/users | Create user (admin) |
| PUT | /api/users/:id | Update user (admin) |
| DELETE | /api/users/:id | Delete user (admin) |
| GET | /api/activity-types | List activity types |
| POST | /api/activity-types | Create type (admin/manager) |
| PUT | /api/activity-types/:id | Update type (admin/manager) |
| DELETE | /api/activity-types/:id | Delete type (admin/manager) |
| GET | /api/time-entries | List entries (role-filtered) |
| POST | /api/time-entries | Create entry |
| PUT | /api/time-entries/:id | Update pending entry |
| PUT | /api/time-entries/:id/approve | Approve entry |
| PUT | /api/time-entries/:id/reject | Reject entry |
| DELETE | /api/time-entries/:id | Delete pending entry |
| GET | /api/absence-requests | List requests (role-filtered) |
| POST | /api/absence-requests | Create request |
| PUT | /api/absence-requests/:id | Update pending request |
| PUT | /api/absence-requests/:id/approve | Approve request |
| PUT | /api/absence-requests/:id/reject | Reject request |
| GET | /api/expenses | List expenses (role-filtered) |
| POST | /api/expenses | Create expense |
| PUT | /api/expenses/:id | Update pending expense |
| PUT | /api/expenses/:id/approve | Approve expense |
| PUT | /api/expenses/:id/reject | Reject expense |
| GET | /api/settings | Get app settings |
| PUT | /api/settings | Update settings (admin) |

require('dotenv').config();
const mysql = require('mysql2/promise');

// Sur Gandi, MySQL est accessible via socket Unix, user root sans mot de passe
const isGandi = !!process.env.GANDI;

const pool = mysql.createPool(
  isGandi
    ? {
        socketPath: '/srv/run/mysqld/mysqld.sock',
        user: 'root',
        password: '',
        database: process.env.DB_NAME || 'trh_tennis',
        waitForConnections: true,
        connectionLimit: 10,
      }
    : {
        host: process.env.DB_HOST || 'localhost',
        port: parseInt(process.env.DB_PORT || '3306'),
        user: process.env.DB_USER || 'root',
        password: process.env.DB_PASSWORD || '',
        database: process.env.DB_NAME || 'trh_tennis',
        waitForConnections: true,
        connectionLimit: 10,
      }
);

module.exports = pool;

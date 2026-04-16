require('dotenv').config();
const mysql = require('mysql2/promise');
const fs = require('fs');

// Sur Gandi, MySQL est accessible via socket Unix (pas de mot de passe)
const SOCKET_PATH = '/srv/run/mysqld/mysqld.sock';
const useSocket = fs.existsSync(SOCKET_PATH);

const pool = mysql.createPool(
  useSocket
    ? {
        socketPath: SOCKET_PATH,
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

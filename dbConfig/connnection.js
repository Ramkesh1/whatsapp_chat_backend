const mysql = require('mysql2/promise');

// Create a connection pool (recommended for chat apps / APIs)
const pool = mysql.createPool({
  user: process.env.DB_USER,
  host: process.env.DB_HOST,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_DATABASE,
  port: 3306,
  waitForConnections: true,
  connectionLimit: 10,   // max open connections
  queueLimit: 0
});

// Function to execute a query
async function executeQuery(query, params) {
  try {
    const [rows] = await pool.query(query, params);
    return rows;
  } catch (err) {
    throw err;
  }
}

module.exports = { executeQuery };

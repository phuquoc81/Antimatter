'use strict';

const Database = require('better-sqlite3');
const path = require('path');

const DB_PATH = process.env.DB_PATH || path.join(__dirname, '..', 'antimatter.db');

const db = new Database(DB_PATH);

// Enable WAL mode for better concurrent read performance
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

function initDb() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id          TEXT PRIMARY KEY,
      username    TEXT UNIQUE NOT NULL,
      email       TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      created_at  INTEGER NOT NULL DEFAULT (strftime('%s','now')),
      updated_at  INTEGER NOT NULL DEFAULT (strftime('%s','now'))
    );

    CREATE TABLE IF NOT EXISTS game_state (
      id                  TEXT PRIMARY KEY,
      user_id             TEXT NOT NULL UNIQUE,
      current_dimension   INTEGER NOT NULL DEFAULT 1,
      total_antimatter    REAL NOT NULL DEFAULT 0,
      total_points        REAL NOT NULL DEFAULT 0,
      level               INTEGER NOT NULL DEFAULT 1,
      gold_coins          REAL NOT NULL DEFAULT 0,
      phu81_tokens        REAL NOT NULL DEFAULT 0,
      last_passive_check  INTEGER NOT NULL DEFAULT (strftime('%s','now')),
      passive_rate        REAL NOT NULL DEFAULT 0.01,
      is_active           INTEGER NOT NULL DEFAULT 1,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS dimensions (
      id              TEXT PRIMARY KEY,
      user_id         TEXT NOT NULL,
      dimension_number INTEGER NOT NULL,
      unlocked        INTEGER NOT NULL DEFAULT 0,
      antimatter_rate REAL NOT NULL DEFAULT 1,
      upgrade_level   INTEGER NOT NULL DEFAULT 1,
      last_collected  INTEGER NOT NULL DEFAULT (strftime('%s','now')),
      UNIQUE(user_id, dimension_number),
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS transactions (
      id                 TEXT PRIMARY KEY,
      user_id            TEXT NOT NULL,
      type               TEXT NOT NULL,
      amount_usd         REAL NOT NULL DEFAULT 0,
      gold_coins         REAL NOT NULL DEFAULT 0,
      phu81_tokens       REAL NOT NULL DEFAULT 0,
      stripe_payment_id  TEXT,
      status             TEXT NOT NULL DEFAULT 'pending',
      created_at         INTEGER NOT NULL DEFAULT (strftime('%s','now')),
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS redemptions (
      id              TEXT PRIMARY KEY,
      user_id         TEXT NOT NULL,
      points_redeemed REAL NOT NULL,
      amount_usd      REAL NOT NULL,
      status          TEXT NOT NULL DEFAULT 'pending',
      created_at      INTEGER NOT NULL DEFAULT (strftime('%s','now')),
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS shop_packages (
      id           TEXT PRIMARY KEY,
      name         TEXT NOT NULL,
      price_usd    REAL NOT NULL,
      gold_coins   REAL NOT NULL,
      phu81_tokens REAL NOT NULL,
      is_active    INTEGER NOT NULL DEFAULT 1
    );
  `);

  // Seed shop packages if empty
  const count = db.prepare('SELECT COUNT(*) as c FROM shop_packages').get();
  if (count.c === 0) {
    const insert = db.prepare(
      'INSERT INTO shop_packages (id, name, price_usd, gold_coins, phu81_tokens) VALUES (?, ?, ?, ?, ?)'
    );
    const packages = [
      ['pkg_starter',  'Starter',  0.001,  10,      10],
      ['pkg_basic',    'Basic',    0.99,   1000,    100],
      ['pkg_standard', 'Standard', 4.99,   6000,    600],
      ['pkg_pro',      'Pro',      9.99,   15000,   1500],
      ['pkg_elite',    'Elite',    24.99,  45000,   4500],
      ['pkg_ultimate', 'Ultimate', 49.99,  100000,  10000],
    ];
    const seedAll = db.transaction(() => {
      for (const pkg of packages) insert.run(...pkg);
    });
    seedAll();
  }
}

initDb();

module.exports = db;

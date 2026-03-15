'use strict';

process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'test_secret_for_jest';
process.env.DB_PATH = ':memory:';

const request = require('supertest');
const app = require('../server');
const db = require('../db/database');

async function registerAndLogin(username) {
  const email = `${username}@example.com`;
  await request(app).post('/api/auth/register').send({ username, email, password: 'password123' });
  const res = await request(app).post('/api/auth/login').send({ username, password: 'password123' });
  return { token: res.body.token, userId: res.body.userId };
}

afterAll(() => {
  try { db.close(); } catch (_) {}
});

describe('Game – state', () => {
  it('GET /api/game/state – returns initial state after registration', async () => {
    const { token } = await registerAndLogin('gamer1');
    const res = await request(app)
      .get('/api/game/state')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.gameState).toHaveProperty('level', 1);
    expect(res.body.gameState).toHaveProperty('total_antimatter');
    expect(res.body.gameState.total_antimatter).toBeGreaterThanOrEqual(0);
    expect(res.body.dimensions.length).toBeGreaterThan(0);
    expect(res.body.dimensions[0].unlocked).toBe(1);
  });

  it('GET /api/game/state – rejects unauthenticated request', async () => {
    const res = await request(app).get('/api/game/state');
    expect(res.status).toBe(401);
  });
});

describe('Game – collect', () => {
  it('POST /api/game/collect – earns antimatter from D1', async () => {
    const { token } = await registerAndLogin('collector1');
    const res = await request(app)
      .post('/api/game/collect')
      .set('Authorization', `Bearer ${token}`)
      .send({ dimension_number: 1 });

    expect(res.status).toBe(200);
    expect(res.body.earned).toBeGreaterThan(0);
    expect(res.body.gameState.total_antimatter).toBeGreaterThan(0);
  });

  it('POST /api/game/collect – rejects locked dimension', async () => {
    const { token } = await registerAndLogin('collector2');
    const res = await request(app)
      .post('/api/game/collect')
      .set('Authorization', `Bearer ${token}`)
      .send({ dimension_number: 5 });

    expect(res.status).toBe(403);
  });

  it('POST /api/game/collect – enforces cooldown', async () => {
    const { token } = await registerAndLogin('collector3');
    await request(app)
      .post('/api/game/collect')
      .set('Authorization', `Bearer ${token}`)
      .send({ dimension_number: 1 });
    const res = await request(app)
      .post('/api/game/collect')
      .set('Authorization', `Bearer ${token}`)
      .send({ dimension_number: 1 });

    expect(res.status).toBe(429);
  });

  it('POST /api/game/collect – rejects invalid dimension_number', async () => {
    const { token } = await registerAndLogin('collector4');
    const res = await request(app)
      .post('/api/game/collect')
      .set('Authorization', `Bearer ${token}`)
      .send({ dimension_number: 999 });
    expect(res.status).toBe(400);
  });
});

describe('Game – level-up', () => {
  it('POST /api/game/level-up – fails with insufficient points', async () => {
    const { token } = await registerAndLogin('leveler1');
    const res = await request(app)
      .post('/api/game/level-up')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(400);
    expect(res.body).toHaveProperty('required');
  });

  it('POST /api/game/level-up – succeeds with enough points', async () => {
    const { token, userId } = await registerAndLogin('leveler2');
    // Manually set points to exactly needed for level 1 -> 2 (1000)
    db.prepare('UPDATE game_state SET total_points = 1000 WHERE user_id = ?').run(userId);

    const res = await request(app)
      .post('/api/game/level-up')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.newLevel).toBe(2);
    expect(res.body.newPassiveRate).toBeGreaterThan(0.01);
  });
});

describe('Game – passive income', () => {
  it('GET /api/game/passive-income – returns earned amount', async () => {
    const { token } = await registerAndLogin('passive1');
    const res = await request(app)
      .get('/api/game/passive-income')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('earned');
    expect(res.body.earned).toBeGreaterThanOrEqual(0);
  });
});

describe('Shop', () => {
  it('GET /api/shop/packages – returns packages without auth', async () => {
    const res = await request(app).get('/api/shop/packages');
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.packages)).toBe(true);
    expect(res.body.packages.length).toBeGreaterThan(0);
  });

  it('POST /api/shop/use-gold-coins – fails with insufficient coins', async () => {
    const { token } = await registerAndLogin('shopper1');
    const res = await request(app)
      .post('/api/shop/use-gold-coins')
      .set('Authorization', `Bearer ${token}`)
      .send({ amount: 9999 });
    expect(res.status).toBe(400);
  });

  it('POST /api/shop/use-gold-coins – succeeds when player has enough coins', async () => {
    const { token, userId } = await registerAndLogin('shopper2');
    db.prepare('UPDATE game_state SET gold_coins = 500 WHERE user_id = ?').run(userId);
    const res = await request(app)
      .post('/api/shop/use-gold-coins')
      .set('Authorization', `Bearer ${token}`)
      .send({ amount: 100, purpose: 'test' });
    expect(res.status).toBe(200);
    expect(res.body.spent).toBe(100);
  });
});

describe('Wallet', () => {
  it('GET /api/wallet – returns wallet balances', async () => {
    const { token } = await registerAndLogin('wallet1');
    const res = await request(app)
      .get('/api/wallet')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('goldCoins');
    expect(res.body).toHaveProperty('totalPoints');
    expect(res.body).toHaveProperty('redeemableUsd');
  });

  it('POST /api/wallet/redeem – fails with insufficient points', async () => {
    const { token } = await registerAndLogin('wallet2');
    const res = await request(app)
      .post('/api/wallet/redeem')
      .set('Authorization', `Bearer ${token}`)
      .send({ points: 1_000_000_000_000, payment_method: 'etransfer' });
    expect(res.status).toBe(400);
  });
});

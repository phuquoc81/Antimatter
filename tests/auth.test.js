'use strict';

process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'test_secret_for_jest';
process.env.DB_PATH = ':memory:';

const request = require('supertest');
const app = require('../server');
const db = require('../db/database');

// Helper: register + login a test user, returns { token }
async function registerAndLogin(username = 'testuser', password = 'password123') {
  const email = `${username}@example.com`;
  await request(app).post('/api/auth/register').send({ username, email, password });
  const res = await request(app).post('/api/auth/login').send({ username, password });
  return { token: res.body.token, userId: res.body.userId };
}

afterAll(() => {
  try { db.close(); } catch (_) {}
});

describe('Auth endpoints', () => {
  it('POST /api/auth/register – creates a new user', async () => {
    const res = await request(app).post('/api/auth/register').send({
      username: 'alice',
      email: 'alice@example.com',
      password: 'secure1234',
    });
    expect(res.status).toBe(201);
    expect(res.body).toHaveProperty('token');
    expect(res.body.username).toBe('alice');
  });

  it('POST /api/auth/register – rejects duplicate username', async () => {
    await request(app).post('/api/auth/register').send({
      username: 'bob', email: 'bob@example.com', password: 'password123'
    });
    const res = await request(app).post('/api/auth/register').send({
      username: 'bob', email: 'bob2@example.com', password: 'password123'
    });
    expect(res.status).toBe(409);
  });

  it('POST /api/auth/register – rejects short password', async () => {
    const res = await request(app).post('/api/auth/register').send({
      username: 'carol', email: 'carol@example.com', password: '123'
    });
    expect(res.status).toBe(400);
  });

  it('POST /api/auth/register – rejects invalid username chars', async () => {
    const res = await request(app).post('/api/auth/register').send({
      username: 'bad user!', email: 'bad@example.com', password: 'password123'
    });
    expect(res.status).toBe(400);
  });

  it('POST /api/auth/login – returns token for valid credentials', async () => {
    await request(app).post('/api/auth/register').send({
      username: 'dave', email: 'dave@example.com', password: 'password123'
    });
    const res = await request(app).post('/api/auth/login').send({
      username: 'dave', password: 'password123'
    });
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('token');
  });

  it('POST /api/auth/login – rejects wrong password', async () => {
    const res = await request(app).post('/api/auth/login').send({
      username: 'dave', password: 'wrongpass'
    });
    expect(res.status).toBe(401);
  });

  it('GET /api/auth/me – returns user info with valid token', async () => {
    const { token } = await registerAndLogin('eve', 'password123');
    const res = await request(app)
      .get('/api/auth/me')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.username).toBe('eve');
  });

  it('GET /api/auth/me – rejects missing token', async () => {
    const res = await request(app).get('/api/auth/me');
    expect(res.status).toBe(401);
  });
});

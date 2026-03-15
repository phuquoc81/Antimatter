/* ═══════════════════════════════════════════════════
   Antimatter – Frontend Application
   ═══════════════════════════════════════════════════ */
'use strict';

// ── Config ────────────────────────────────────────────────────────────────────
const API_BASE = '/api';
const POLL_INTERVAL_MS   = 5000;
const PASSIVE_INTERVAL_MS = 5000;
const TRILLION = 1_000_000_000_000;

// ── State ─────────────────────────────────────────────────────────────────────
let token = localStorage.getItem('am_token') || null;
let gameState = null;
let dimensions = [];
let pollTimer = null;
let passiveTimer = null;
let currentPkgForPayment = null;
let stripeInstance = null;
let cardElement = null;
let pendingPaymentIntent = null;
let cooldownTimers = {};

// ── Helpers ───────────────────────────────────────────────────────────────────
function fmt(n) {
  n = Number(n);
  if (!isFinite(n)) return '0';
  if (n >= 1e12) return (n / 1e12).toFixed(2) + 'T';
  if (n >= 1e9)  return (n / 1e9).toFixed(2)  + 'B';
  if (n >= 1e6)  return (n / 1e6).toFixed(2)  + 'M';
  if (n >= 1e3)  return (n / 1e3).toFixed(1)  + 'K';
  return Math.floor(n).toString();
}

function showToast(message, type = 'info', duration = 3500) {
  const container = document.getElementById('toast-container');
  const el = document.createElement('div');
  el.className = `toast ${type}`;
  el.textContent = message;
  container.appendChild(el);
  setTimeout(() => el.remove(), duration);
}

async function apiFetch(path, method = 'GET', body = null) {
  const opts = {
    method,
    headers: { 'Content-Type': 'application/json' },
  };
  if (token) opts.headers['Authorization'] = `Bearer ${token}`;
  if (body) opts.body = JSON.stringify(body);

  const res = await fetch(`${API_BASE}${path}`, opts);
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(data.error || `HTTP ${res.status}`);
    err.status = res.status;
    throw err;
  }
  return data;
}

// ── Auth ──────────────────────────────────────────────────────────────────────
function setToken(t) {
  token = t;
  if (t) localStorage.setItem('am_token', t);
  else   localStorage.removeItem('am_token');
}

function logout() {
  setToken(null);
  gameState = null;
  dimensions = [];
  clearInterval(pollTimer);
  clearInterval(passiveTimer);
  showAuthOverlay();
}

function showAuthOverlay() {
  document.getElementById('auth-overlay').classList.add('active');
  document.getElementById('game-container').classList.add('hidden');
}

function hideAuthOverlay() {
  document.getElementById('auth-overlay').classList.remove('active');
  document.getElementById('game-container').classList.remove('hidden');
}

// Tab switching
document.querySelectorAll('.tab-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    document.querySelectorAll('.auth-form').forEach(f => f.classList.add('hidden'));
    document.getElementById(`${btn.dataset.tab}-form`).classList.remove('hidden');
  });
});

// Login form
document.getElementById('login-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const errEl = document.getElementById('login-error');
  errEl.classList.add('hidden');
  try {
    const data = await apiFetch('/auth/login', 'POST', {
      username: document.getElementById('login-identifier').value,
      email:    document.getElementById('login-identifier').value,
      password: document.getElementById('login-password').value,
    });
    setToken(data.token);
    hideAuthOverlay();
    await initGame();
  } catch (err) {
    errEl.textContent = err.message;
    errEl.classList.remove('hidden');
  }
});

// Register form
document.getElementById('register-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const errEl = document.getElementById('register-error');
  errEl.classList.add('hidden');
  try {
    const data = await apiFetch('/auth/register', 'POST', {
      username: document.getElementById('reg-username').value,
      email:    document.getElementById('reg-email').value,
      password: document.getElementById('reg-password').value,
    });
    setToken(data.token);
    hideAuthOverlay();
    await initGame();
  } catch (err) {
    errEl.textContent = err.message;
    errEl.classList.remove('hidden');
  }
});

// Logout
document.getElementById('btn-logout').addEventListener('click', () => logout());

// ── Panel Navigation ──────────────────────────────────────────────────────────
document.querySelectorAll('.nav-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    document.querySelectorAll('.panel').forEach(p => p.classList.remove('active'));
    const panel = document.getElementById(`panel-${btn.dataset.panel}`);
    if (panel) panel.classList.add('active');

    if (btn.dataset.panel === 'shop')    loadShop();
    if (btn.dataset.panel === 'wallet')  refreshWallet();
    if (btn.dataset.panel === 'upgrades') renderUpgrades();
  });
});

// ── Game Init ─────────────────────────────────────────────────────────────────
async function initGame() {
  try {
    await fetchGameState();
    renderDimensions();
    renderStats();
    loadShop();
    startPolling();
    startPassiveDisplay();
  } catch (err) {
    if (err.status === 401) {
      setToken(null);
      showAuthOverlay();
    } else {
      showToast('Failed to load game: ' + err.message, 'error');
    }
  }
}

async function fetchGameState() {
  const data = await apiFetch('/game/state');
  gameState = data.gameState;
  dimensions = data.dimensions;
}

function startPolling() {
  clearInterval(pollTimer);
  pollTimer = setInterval(async () => {
    try {
      await fetchGameState();
      renderStats();
      renderDimensions();
    } catch (_) {}
  }, POLL_INTERVAL_MS);
}

function startPassiveDisplay() {
  clearInterval(passiveTimer);
  passiveTimer = setInterval(async () => {
    try {
      const data = await apiFetch('/game/passive-income');
      gameState = data.gameState;
      renderStats();
    } catch (_) {}
  }, PASSIVE_INTERVAL_MS);
}

// ── Stats Render ──────────────────────────────────────────────────────────────
function renderStats() {
  if (!gameState) return;
  document.getElementById('stat-antimatter').textContent = fmt(gameState.total_antimatter);
  document.getElementById('stat-points').textContent     = fmt(gameState.total_points);
  document.getElementById('stat-level').textContent      = gameState.level;
  document.getElementById('stat-gold').textContent       = fmt(gameState.gold_coins);
  document.getElementById('stat-phu81').textContent      = fmt(gameState.phu81_tokens);

  // Passive rate
  const rate = gameState.passive_rate || 0;
  document.getElementById('passive-ticker').textContent = `+${rate.toFixed(3)}/s`;

  // Level progress
  const level   = gameState.level;
  const needed  = level * 1000;
  const current = Math.min(gameState.total_points, needed);
  const pct     = Math.min(100, (current / needed) * 100);

  document.getElementById('lv-num').textContent       = level;
  document.getElementById('lv-pts-current').textContent = fmt(current);
  document.getElementById('lv-pts-needed').textContent  = fmt(needed);
  document.getElementById('level-progress-bar').style.width = pct + '%';

  const btnLevelUp = document.getElementById('btn-level-up');
  btnLevelUp.disabled = gameState.total_points < needed;
}

// ── Dimensions ────────────────────────────────────────────────────────────────
function renderDimensions() {
  if (!gameState) return;
  const grid = document.getElementById('dimension-grid');
  grid.innerHTML = '';

  const unlockedSet = new Set(dimensions.map(d => d.dimension_number));
  const dimMap = {};
  for (const d of dimensions) dimMap[d.dimension_number] = d;

  // Show all 100 dimensions
  for (let i = 1; i <= 100; i++) {
    const dim = dimMap[i] || null;
    const isUnlocked = dim && dim.unlocked;
    const card = document.createElement('div');
    card.className = `dim-card ${isUnlocked ? 'unlocked' : 'locked'}`;
    card.dataset.dim = i;

    const unlockCost = i * 100;
    const prevUnlocked = i === 1 || (dimMap[i-1] && dimMap[i-1].unlocked);

    if (isUnlocked) {
      const now = Math.floor(Date.now() / 1000);
      const cooldownLeft = 5 - (now - (dim.last_collected || 0));
      const onCooldown = cooldownLeft > 0;

      card.innerHTML = `
        <div class="dim-number">D${i}</div>
        <div class="dim-rate">⚛ ${fmt(dim.antimatter_rate)} / collect</div>
        <div class="dim-upgrade">Upgrade Lv ${dim.upgrade_level}</div>
        ${onCooldown ? `<div class="dim-cooldown" id="cd-${i}">⏳ ${cooldownLeft}s</div>` : ''}
        <div class="dim-actions">
          <button class="btn btn-collect" data-dim="${i}" ${onCooldown ? 'disabled' : ''}>Collect</button>
        </div>
      `;

      if (onCooldown) {
        startCooldownTimer(i, cooldownLeft, card);
      }
    } else {
      const canUnlock = prevUnlocked;
      card.innerHTML = `
        <div class="dim-number">D${i}</div>
        <div class="dim-locked-label">🔒 Locked</div>
        <div class="dim-rate">Cost: ${fmt(unlockCost)} 🪙</div>
        <div class="dim-actions">
          ${canUnlock
            ? `<button class="btn btn-unlock btn-sm" data-unlock="${i}">Unlock</button>`
            : `<button class="btn btn-secondary btn-sm" disabled>Unlock prev first</button>`
          }
        </div>
      `;
    }

    grid.appendChild(card);
  }

  // Event delegation (re-assigned each render since innerHTML is replaced)
  grid.onclick = onDimensionClick;
}

function startCooldownTimer(dimNumber, remaining, card) {
  if (cooldownTimers[dimNumber]) clearInterval(cooldownTimers[dimNumber]);
  let left = remaining;
  cooldownTimers[dimNumber] = setInterval(() => {
    left--;
    const cdEl = card.querySelector(`#cd-${dimNumber}`);
    const btn  = card.querySelector('[data-dim]');
    if (left <= 0) {
      clearInterval(cooldownTimers[dimNumber]);
      delete cooldownTimers[dimNumber];
      if (cdEl) cdEl.remove();
      if (btn) btn.disabled = false;
      card.classList.remove('cooldown');
    } else {
      if (cdEl) cdEl.textContent = `⏳ ${left}s`;
    }
  }, 1000);
}

async function onDimensionClick(e) {
  const collectBtn = e.target.closest('[data-dim]');
  const unlockBtn  = e.target.closest('[data-unlock]');

  if (collectBtn && !collectBtn.disabled) {
    const dimNumber = parseInt(collectBtn.dataset.dim, 10);
    collectBtn.disabled = true;
    try {
      const data = await apiFetch('/game/collect', 'POST', { dimension_number: dimNumber });
      gameState = data.gameState;
      renderStats();
      showToast(`+${fmt(data.earned)} ⚛ from D${dimNumber}`, 'success');
      renderDimensions();
    } catch (err) {
      showToast(err.message, 'error');
      collectBtn.disabled = false;
    }
  }

  if (unlockBtn) {
    const dimNumber = parseInt(unlockBtn.dataset.unlock, 10);
    const cost = dimNumber * 100;
    if (gameState.gold_coins < cost) {
      showToast(`Need ${fmt(cost)} 🪙 to unlock D${dimNumber}`, 'error');
      return;
    }
    try {
      const data = await apiFetch('/game/unlock-dimension', 'POST', { dimension_number: dimNumber });
      gameState = data.gameState;
      await fetchGameState();
      renderStats();
      renderDimensions();
      showToast(`D${dimNumber} unlocked! 🌌`, 'success');
    } catch (err) {
      showToast(err.message, 'error');
    }
  }
}

// Level-Up button
document.getElementById('btn-level-up').addEventListener('click', async () => {
  try {
    const data = await apiFetch('/game/level-up', 'POST');
    gameState = data.gameState;
    renderStats();
    showToast(`🎉 Level ${data.newLevel}! Passive rate +15%`, 'success');
  } catch (err) {
    showToast(err.message, 'error');
  }
});

// ── Shop ──────────────────────────────────────────────────────────────────────
let packages = [];

async function loadShop() {
  try {
    const data = await apiFetch('/shop/packages');
    packages = data.packages;
    renderShop();
  } catch (err) {
    showToast('Failed to load shop: ' + err.message, 'error');
  }
}

function renderShop() {
  const grid = document.getElementById('shop-packages');
  grid.innerHTML = '';
  for (const pkg of packages) {
    const card = document.createElement('div');
    card.className = 'package-card';
    card.dataset.pkgId = pkg.id;
    card.innerHTML = `
      <div class="pkg-name">${pkg.name}</div>
      <div class="pkg-price">$${Number(pkg.price_usd).toFixed(pkg.price_usd < 0.01 ? 3 : 2)}</div>
      <div class="pkg-coins">🪙 ${fmt(pkg.gold_coins)} Gold Coins</div>
      <div class="pkg-coins">💜 ${fmt(pkg.phu81_tokens)} Phu81 Tokens</div>
    `;
    card.addEventListener('click', () => buyPackage(pkg));
    grid.appendChild(card);
  }
}

async function buyPackage(pkg) {
  const msgEl = document.getElementById('shop-message');
  msgEl.className = 'shop-message hidden';

  try {
    const data = await apiFetch('/shop/buy-gold-coins', 'POST', { package_id: pkg.id });

    if (data.clientSecret) {
      // Stripe payment flow
      pendingPaymentIntent = data;
      currentPkgForPayment = pkg;
      initStripePayment(data.clientSecret, data.publishableKey, pkg);
    } else if (data.gameState) {
      // Micro-transaction – coins already granted
      gameState = data.gameState;
      renderStats();
      showToast(`✅ Received ${fmt(pkg.gold_coins)} 🪙 from ${pkg.name} pack!`, 'success');
    }
  } catch (err) {
    msgEl.textContent = err.message;
    msgEl.className = 'shop-message error';
  }
}

function initStripePayment(clientSecret, publishableKey, pkg) {
  const pubKey = publishableKey;
  if (!pubKey || pubKey.startsWith('pk_test_your')) {
    showToast('Stripe payment not configured. Use e-transfer or contact support.', 'error');
    return;
  }
  if (!stripeInstance || stripeInstance._keyMode !== pubKey) {
    try {
      stripeInstance = Stripe(pubKey);
    } catch (_) {
      showToast('Stripe.js not loaded. Refresh the page and try again.', 'error');
      return;
    }
  }

  const elements = stripeInstance.elements();
  const container = document.getElementById('stripe-container');
  container.classList.remove('hidden');

  if (cardElement) cardElement.destroy();
  cardElement = elements.create('card', {
    style: { base: { color: '#e2e8f0', fontSize: '16px', '::placeholder': { color: '#64748b' } } },
  });
  cardElement.mount('#card-element');

  document.getElementById('btn-confirm-payment').onclick = async () => {
    document.getElementById('btn-confirm-payment').disabled = true;
    const { error } = await stripeInstance.confirmCardPayment(clientSecret, {
      payment_method: { card: cardElement },
    });
    if (error) {
      document.getElementById('card-errors').textContent = error.message;
      document.getElementById('btn-confirm-payment').disabled = false;
    } else {
      container.classList.add('hidden');
      showToast(`💳 Payment successful! Coins will arrive shortly.`, 'success');
      setTimeout(() => fetchGameState().then(renderStats), 3000);
    }
  };

  document.getElementById('btn-cancel-payment').onclick = () => {
    container.classList.add('hidden');
    if (cardElement) { cardElement.destroy(); cardElement = null; }
  };
}

// ── Wallet ────────────────────────────────────────────────────────────────────
async function refreshWallet() {
  try {
    const data = await apiFetch('/wallet');
    document.getElementById('wallet-gold').textContent   = fmt(data.goldCoins);
    document.getElementById('wallet-phu81').textContent  = fmt(data.phu81Tokens);
    document.getElementById('wallet-points').textContent = fmt(data.totalPoints);
    document.getElementById('wallet-usd').textContent    = `$${Number(data.redeemableUsd).toFixed(2)}`;
  } catch (err) {
    showToast('Failed to load wallet: ' + err.message, 'error');
  }
}

document.getElementById('btn-redeem').addEventListener('click', async () => {
  const trillions = parseInt(document.getElementById('redeem-trillions').value, 10);
  const method    = document.getElementById('redeem-method').value;
  const msgEl     = document.getElementById('redeem-message');
  msgEl.classList.add('hidden');

  if (!trillions || trillions < 1) {
    msgEl.textContent = 'Enter at least 1 trillion to redeem.';
    msgEl.classList.remove('hidden');
    return;
  }

  try {
    const data = await apiFetch('/wallet/redeem', 'POST', {
      points: trillions * TRILLION,
      payment_method: method,
    });
    showToast(`✅ Redemption of $${data.amountUsd}.00 registered!`, 'success');
    refreshWallet();
    await fetchGameState();
    renderStats();
  } catch (err) {
    msgEl.textContent = err.message;
    msgEl.classList.remove('hidden');
  }
});

// ── Upgrades ──────────────────────────────────────────────────────────────────
function renderUpgrades() {
  const list = document.getElementById('upgrade-list');
  list.innerHTML = '';

  const unlocked = dimensions.filter(d => d.unlocked);
  if (unlocked.length === 0) {
    list.innerHTML = '<p style="color:var(--text-muted)">No dimensions unlocked yet.</p>';
    return;
  }

  for (const dim of unlocked) {
    const cost = dim.upgrade_level * 50;
    const item = document.createElement('div');
    item.className = 'upgrade-item';
    item.innerHTML = `
      <div class="upgrade-info">
        <div class="upgrade-dim">Dimension ${dim.dimension_number}</div>
        <div class="upgrade-meta">
          Lv ${dim.upgrade_level} • Rate: ${fmt(dim.antimatter_rate)}/collect • Cost: ${fmt(cost)} 🪙
        </div>
      </div>
      <button class="btn btn-gold btn-sm" data-upgrade="${dim.dimension_number}" data-cost="${cost}">
        Upgrade (${fmt(cost)} 🪙)
      </button>
    `;
    list.appendChild(item);
  }

  list.onclick = async (e) => {
    const btn = e.target.closest('[data-upgrade]');
    if (!btn) return;
    const dimNumber = parseInt(btn.dataset.upgrade, 10);
    const cost      = parseInt(btn.dataset.cost, 10);

    if (gameState.gold_coins < cost) {
      showToast(`Need ${fmt(cost)} 🪙 to upgrade`, 'error');
      return;
    }
    try {
      btn.disabled = true;
      const data = await apiFetch('/game/upgrade-dimension', 'POST', { dimension_number: dimNumber });
      gameState = data.gameState;
      await fetchGameState();
      renderStats();
      renderUpgrades();
      showToast(`D${dimNumber} upgraded to Lv ${data.dimension.upgrade_level}!`, 'success');
    } catch (err) {
      showToast(err.message, 'error');
      btn.disabled = false;
    }
  };
}

// ── Boot ──────────────────────────────────────────────────────────────────────
(async function boot() {
  if (token) {
    try {
      await initGame();
    } catch (err) {
      setToken(null);
      showAuthOverlay();
    }
  } else {
    showAuthOverlay();
  }
})();

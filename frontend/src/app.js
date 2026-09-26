// ─────────────────────────────────────────────────────────────
// DEOLS — Frontend SPA Application (Vanilla JS)
// ─────────────────────────────────────────────────────────────

const API = '/api';

// ─── State ──────────────────────────────────────────────────

const state = {
  user: null,
  token: null,
  currentPage: 'dashboard',
  systemStats: null,
  statsInterval: null,
};

// ─── Helpers ────────────────────────────────────────────────

function escapeHTML(str) {
  if (str === null || str === undefined) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// ─── API Helper ─────────────────────────────────────────────

async function api(path, opts = {}) {
  const { method = 'GET', body, raw = false } = opts;
  const headers = {};
  if (body !== undefined && body !== null) {
    headers['Content-Type'] = 'application/json';
  }
  if (state.token) headers['Authorization'] = `Bearer ${state.token}`;

  try {
    const res = await fetch(`${API}${path}`, {
      method,
      headers,
      body: body !== undefined && body !== null ? JSON.stringify(body) : undefined,
      credentials: 'include',
    });

    if (res.status === 401) {
      state.user = null;
      state.token = null;
      localStorage.removeItem('deols_token');
      showLogin();
      return null;
    }

    if (raw) return res;

    let data;
    try {
      data = await res.json();
    } catch {
      data = null;
    }

    if (!res.ok) {
      if (!data || typeof data !== 'object') {
        data = { success: false, error: `HTTP ${res.status}: ${res.statusText}` };
      } else {
        data.success = false;
        if (!data.error && data.message) data.error = data.message;
        if (!data.message && data.error) data.message = data.error;
      }
    }

    return data;
  } catch (err) {
    toast(`Network error: ${err.message}`, 'error');
    return null;
  }
}

// ─── Toast Notifications ────────────────────────────────────

function toast(message, type = 'info', duration = 4000) {
  const container = document.getElementById('toast-container');
  const icons = {
    success: '<svg viewBox="0 0 20 20" fill="currentColor" class="toast-icon"><path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z"/></svg>',
    error: '<svg viewBox="0 0 20 20" fill="currentColor" class="toast-icon"><path fill-rule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z"/></svg>',
    warning: '<svg viewBox="0 0 20 20" fill="currentColor" class="toast-icon"><path fill-rule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z"/></svg>',
    info: '<svg viewBox="0 0 20 20" fill="currentColor" class="toast-icon"><path fill-rule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z"/></svg>',
  };

  const el = document.createElement('div');
  el.className = `toast ${type}`;
  el.innerHTML = `${icons[type] || icons.info}<span>${message}</span>`;
  container.appendChild(el);

  setTimeout(() => {
    el.classList.add('removing');
    setTimeout(() => el.remove(), 300);
  }, duration);
}

// ─── Modal ──────────────────────────────────────────────────

function showModal(title, bodyHTML, footerHTML = '') {
  document.getElementById('modal-title').textContent = title;
  document.getElementById('modal-body').innerHTML = bodyHTML;
  document.getElementById('modal-footer').innerHTML = footerHTML;
  document.getElementById('modal-overlay').style.display = 'flex';
}

function closeModal() {
  document.getElementById('modal-overlay').style.display = 'none';
}

document.getElementById('modal-close').addEventListener('click', closeModal);
document.getElementById('modal-overlay').addEventListener('click', (e) => {
  if (e.target === e.currentTarget) closeModal();
});

// ─── Theme Toggle ───────────────────────────────────────────

function initTheme() {
  const saved = localStorage.getItem('deols_theme') || 'light';
  document.documentElement.setAttribute('data-theme', saved);
}

document.getElementById('theme-toggle')?.addEventListener('click', () => {
  const current = document.documentElement.getAttribute('data-theme');
  const next = current === 'dark' ? 'light' : 'dark';
  document.documentElement.setAttribute('data-theme', next);
  localStorage.setItem('deols_theme', next);
});

// ─── Navigation ─────────────────────────────────────────────

function navigateTo(page, params = {}) {
  state.currentPage = page;
  state.pageParams = params;

  // Update active nav item
  document.querySelectorAll('.nav-item').forEach((el) => {
    el.classList.toggle('active', el.dataset.page === page || (page === 'site-manage' && el.dataset.page === 'sites'));
  });

  // Update page title
  const titles = {
    dashboard: 'Dashboard',
    sites: 'Sites',
    'site-manage': `Site / ${params?.domain || 'Manage'}`,
    databases: 'Databases',
    ssl: 'SSL / TLS',
    files: 'File Manager',
    services: 'Services',
    ols: 'OpenLiteSpeed & WebAdmin',
    cache: 'Cache Control',
    cron: 'Cron Jobs',
    terminal: 'Terminal',
    git: 'Git Deploy',
    python: 'Python Services',
    firewall: 'Firewall',
    security: 'Security',
    autotuner: 'Server Auto-Tuner',
  };
  document.getElementById('page-title').textContent = titles[page] || page;

  // Render page
  const content = document.getElementById('content-body');
  content.innerHTML = '';
  content.classList.remove('page-enter');
  void content.offsetWidth; // Force reflow
  content.classList.add('page-enter');

  const renderers = {
    dashboard: renderDashboard,
    sites: renderSites,
    'site-manage': (container) => renderSiteManage(container, params?.domain),
    databases: renderDatabases,
    ssl: renderSSL,
    files: renderFiles,
    services: renderServices,
    ols: renderOLS,
    cache: renderCache,
    cron: renderCron,
    terminal: renderTerminal,
    git: renderGit,
    python: renderPython,
    firewall: renderFirewall,
    security: renderSecurity,
    autotuner: renderAutoTuner,
  };

  if (renderers[page]) renderers[page](content);

  // Close mobile sidebar
  document.getElementById('sidebar').classList.remove('open');
}

document.querySelectorAll('.nav-item').forEach((el) => {
  el.addEventListener('click', (e) => {
    e.preventDefault();
    navigateTo(el.dataset.page);
  });
});

// Mobile menu
document.getElementById('mobile-menu-btn')?.addEventListener('click', () => {
  document.getElementById('sidebar').classList.toggle('open');
});

// ─── Auth Flow ──────────────────────────────────────────────

async function checkAuth() {
  try {
    // Check if panel is initialized
    const status = await api('/auth/status');
    if (!status) return showLogin(); // Network error fallback

    if (!status.initialized) {
      return showSetup();
    }

    // Try existing session
    state.token = localStorage.getItem('deols_token');
    if (state.token) {
      const me = await api('/auth/me');
      if (me && !me.error) {
        state.user = me;
        showDashboard();
        return;
      }
    }

    showLogin();
  } catch (err) {
    console.error('Auth initialization error:', err);
    showLogin();
  }
}

function showSetup() {
  hideAll();
  document.getElementById('setup-screen').style.display = 'flex';
}

function showLogin() {
  hideAll();
  document.getElementById('login-screen').style.display = 'flex';
}

function showDashboard() {
  hideAll();
  document.getElementById('dashboard').style.display = 'flex';
  if (state.user) {
    document.getElementById('user-display-name').textContent = state.user.username;
    const avatar = document.querySelector('.user-avatar');
    if (avatar) avatar.textContent = state.user.username.charAt(0).toUpperCase();
  }
  navigateTo('dashboard');
  startStatsPolling();
  initServerClock();
}

function hideAll() {
  const loading = document.getElementById('loading-screen');
  if (loading) {
    loading.classList.add('fade-out');
    loading.style.pointerEvents = 'none';
    setTimeout(() => { loading.style.display = 'none'; }, 250);
  }
  const s = document.getElementById('setup-screen');
  if (s) s.style.display = 'none';
  const l = document.getElementById('login-screen');
  if (l) l.style.display = 'none';
  const d = document.getElementById('dashboard');
  if (d) d.style.display = 'none';
}

// Setup screen (Root SSH Required)
document.getElementById('copy-setup-cmd-btn')?.addEventListener('click', () => {
  if (navigator.clipboard) {
    navigator.clipboard.writeText('deols admin reset');
  }
  toast('Copied to clipboard: deols admin reset', 'success');
});

document.getElementById('setup-check-btn')?.addEventListener('click', async () => {
  const status = await api('/auth/status');
  if (status?.initialized) {
    toast('Admin account detected! Please sign in.', 'success');
    showLogin();
  } else {
    toast('Admin account not yet initialized. Run "deols admin reset" via root SSH first.', 'warning');
    showLogin();
  }
});

// Login form
document.getElementById('login-form')?.addEventListener('submit', async (e) => {
  e.preventDefault();
  const errEl = document.getElementById('login-error');
  errEl.textContent = '';

  const username = document.getElementById('login-username').value;
  const password = document.getElementById('login-password').value;

  const result = await api('/auth/login', { method: 'POST', body: { username, password } });
  if (result?.success) {
    state.token = result.token;
    localStorage.setItem('deols_token', result.token);
    state.user = result.user;
    toast('Welcome back!', 'success');
    showDashboard();
  } else {
    errEl.textContent = result?.error || 'Login failed';
  }
});

// Logout
document.getElementById('logout-btn')?.addEventListener('click', async () => {
  await api('/auth/logout', { method: 'POST' });
  state.user = null;
  state.token = null;
  localStorage.removeItem('deols_token');
  stopStatsPolling();
  showLogin();
  toast('Logged out', 'info');
});

// ─── Header OLS Server Restart ──────────────────────────────

async function restartOLSHeader() {
  const btn = document.getElementById('header-ols-restart-btn');
  if (!btn || btn.disabled) return;

  btn.disabled = true;
  btn.classList.add('restarting');
  const textSpan = btn.querySelector('.header-ols-text');
  const originalText = textSpan ? textSpan.textContent : 'Restart OLS';
  if (textSpan) textSpan.textContent = 'Restarting…';

  toast('Sending graceful restart signal to OpenLiteSpeed…', 'info', 3500);

  try {
    const res = await api('/ols/restart', { method: 'POST', body: { action: 'restart' } });
    if (res?.success) {
      toast(res.message || 'OpenLiteSpeed gracefully restarted (zero downtime)', 'success', 5000);
      if (state.currentPage === 'ols' || state.currentPage === 'dashboard') {
        navigateTo(state.currentPage);
      }
    } else {
      const errMsg = res?.message || res?.error || res?.details || 'Failed to restart OpenLiteSpeed';
      toast(errMsg, 'error', 6000);
    }
  } catch (err) {
    toast(`Restart error: ${err.message}`, 'error', 6000);
  } finally {
    setTimeout(() => {
      btn.disabled = false;
      btn.classList.remove('restarting');
      if (textSpan) textSpan.textContent = originalText;
    }, 1200);
  }
}

document.getElementById('header-ols-restart-btn')?.addEventListener('click', (e) => {
  e.preventDefault();
  restartOLSHeader();
});

// ─── Server Timezone & Live Header Clock ────────────────────

let serverTimezone = 'UTC';
let serverTimeOffsetMs = 0;
let clockInterval = null;

async function initServerClock() {
  try {
    const data = await api('/system/timezone');
    if (data?.timezone) {
      serverTimezone = data.timezone;
      if (data.timestamp) {
        serverTimeOffsetMs = data.timestamp - Date.now();
      }
      const badge = document.getElementById('header-tz-badge');
      if (badge) {
        const shortName = serverTimezone.split('/').pop().replace(/_/g, ' ');
        badge.textContent = shortName;
      }
      const btn = document.getElementById('header-tz-btn');
      if (btn) {
        btn.title = `Server Timezone: ${serverTimezone} (Click to change)`;
      }
    }
  } catch {}

  updateHeaderClock();
  if (!clockInterval) {
    clockInterval = setInterval(updateHeaderClock, 1000);
  }
}

function updateHeaderClock() {
  const clockEl = document.getElementById('header-server-time');
  if (!clockEl) return;
  const now = new Date(Date.now() + serverTimeOffsetMs);
  try {
    const timeStr = new Intl.DateTimeFormat('en-US', {
      timeZone: serverTimezone,
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false,
    }).format(now);
    clockEl.textContent = timeStr;
  } catch {
    clockEl.textContent = now.toTimeString().split(' ')[0];
  }
}

document.getElementById('header-tz-btn')?.addEventListener('click', (e) => {
  e.preventDefault();
  showTimezoneModal();
});

const COMMON_TIMEZONES = [
  { value: 'UTC', label: 'UTC (Coordinated Universal Time)' },
  { value: 'Asia/Kolkata', label: 'Asia/Kolkata (IST +05:30)' },
  { value: 'America/New_York', label: 'America/New_York (US Eastern)' },
  { value: 'America/Chicago', label: 'America/Chicago (US Central)' },
  { value: 'America/Denver', label: 'America/Denver (US Mountain)' },
  { value: 'America/Los_Angeles', label: 'America/Los_Angeles (US Pacific)' },
  { value: 'Europe/London', label: 'Europe/London (GMT/BST)' },
  { value: 'Europe/Paris', label: 'Europe/Paris (CET/CEST)' },
  { value: 'Europe/Berlin', label: 'Europe/Berlin (CET/CEST)' },
  { value: 'Asia/Dubai', label: 'Asia/Dubai (GST +04:00)' },
  { value: 'Asia/Singapore', label: 'Asia/Singapore (SGT +08:00)' },
  { value: 'Asia/Tokyo', label: 'Asia/Tokyo (JST +09:00)' },
  { value: 'Australia/Sydney', label: 'Australia/Sydney (AEST/AEDT)' },
  { value: 'Africa/Cairo', label: 'Africa/Cairo (EET +02:00)' },
  { value: 'America/Sao_Paulo', label: 'America/Sao_Paulo (BRT -03:00)' },
  { value: 'Asia/Hong_Kong', label: 'Asia/Hong_Kong (HKT +08:00)' },
  { value: 'Asia/Bangkok', label: 'Asia/Bangkok (ICT +07:00)' },
  { value: 'Europe/Amsterdam', label: 'Europe/Amsterdam (CET/CEST)' },
  { value: 'Pacific/Auckland', label: 'Pacific/Auckland (NZST +12:00)' },
];

function showTimezoneModal() {
  const title = 'Server Timezone Configuration';

  const now = new Date(Date.now() + serverTimeOffsetMs);
  let formattedTime = '';
  try {
    formattedTime = new Intl.DateTimeFormat('en-US', {
      timeZone: serverTimezone,
      dateStyle: 'full',
      timeStyle: 'long',
    }).format(now);
  } catch {
    formattedTime = now.toString();
  }

  const optionsHtml = COMMON_TIMEZONES.map(tz => `
    <option value="${tz.value}" ${tz.value === serverTimezone ? 'selected' : ''}>${tz.label}</option>
  `).join('');

  const bodyHtml = `
    <div id="tz-modal-content">
      <div class="form-group mb-4">
        <label class="form-label">Current Server Clock</label>
        <div style="font-family: var(--font-mono); font-size: 0.95rem; color: #38bdf8; background: var(--bg-tertiary); padding: 10px 14px; border-radius: var(--radius-md); border: 1px solid var(--border-secondary);" id="modal-tz-clock">
          ${escapeHTML(formattedTime)}
        </div>
      </div>

      <div class="form-group mb-4">
        <label class="form-label" for="tz-select">Select Server Timezone (IANA)</label>
        <select id="tz-select" class="input" style="font-family: var(--font-mono); font-size: 0.85rem; padding: 8px 12px; width: 100%;">
          ${optionsHtml}
        </select>
        <span class="form-hint" style="font-size: 11px; color: var(--text-tertiary); margin-top: 6px; display: block;">
          Applied to the Linux operating system via <code>timedatectl set-timezone</code>. Affects cron jobs, server-side WP-Cron, and access log timestamps.
        </span>
      </div>

      <div class="flex justify-between items-center mt-6">
        <button type="button" class="btn btn-secondary" onclick="closeModal()">Cancel</button>
        <button type="button" class="btn btn-primary" id="save-tz-btn" onclick="saveServerTimezone()">
          Set Server Timezone
        </button>
      </div>
    </div>
  `;

  showModal(title, bodyHtml, '');
}

async function saveServerTimezone() {
  const select = document.getElementById('tz-select');
  const btn = document.getElementById('save-tz-btn');
  if (!select) return;

  const timezone = select.value;
  if (btn) btn.disabled = true;

  toast(`Applying server timezone: ${timezone}…`, 'info', 4000);

  try {
    const res = await api('/system/timezone', {
      method: 'POST',
      body: { timezone },
    });

    if (res?.success) {
      serverTimezone = res.timezone || timezone;
      toast(`Server timezone changed to ${serverTimezone}!`, 'success', 5000);

      // Update header badge and title immediately
      const badge = document.getElementById('header-tz-badge');
      if (badge) {
        badge.textContent = serverTimezone.split('/').pop().replace(/_/g, ' ');
      }
      const headerBtn = document.getElementById('header-tz-btn');
      if (headerBtn) {
        headerBtn.title = `Server Timezone: ${serverTimezone} (Click to change)`;
      }
      updateHeaderClock();

      // Show the post-change prompt modal with OLS restart and Server Reload buttons!
      const content = document.getElementById('tz-modal-content');
      if (content) {
        content.innerHTML = `
          <div style="text-align: center; padding: 12px 6px;">
            <div style="width: 48px; height: 48px; border-radius: 50%; background: rgba(16, 185, 129, 0.15); color: var(--success); display: flex; align-items: center; justify-content: center; margin: 0 auto 16px;">
              <svg viewBox="0 0 20 20" fill="currentColor" style="width: 24px; height: 24px;"><path fill-rule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"/></svg>
            </div>
            <h3 style="font-size: 1.15rem; font-weight: 700; margin-bottom: 6px;">Timezone Updated: <span style="color: #38bdf8;">${escapeHTML(serverTimezone)}</span></h3>
            <p style="font-size: 0.85rem; color: var(--text-secondary); margin-bottom: 22px; max-width: 440px; margin-left: auto; margin-right: auto; line-height: 1.5;">
              To ensure that OpenLiteSpeed web engine, WordPress WP-Cron, access log stamps, and background worker services synchronize with the new timezone, please reload the panel daemon and restart OpenLiteSpeed now:
            </p>

            <div style="display: flex; gap: 12px; justify-content: center; flex-wrap: wrap;">
              <button class="btn btn-warning" id="notice-restart-ols-btn" onclick="noticeRestartOLS(this)">
                <svg viewBox="0 0 20 20" fill="currentColor" class="btn-icon"><path fill-rule="evenodd" d="M4 2a1 1 0 011 1v2.101a7.002 7.002 0 0111.601 2.566 1 1 0 11-1.885.666A5.002 5.002 0 005.999 7H9a1 1 0 010 2H4a1 1 0 01-1-1V3a1 1 0 011-1zm.008 9.057a1 1 0 011.276.61A5.002 5.002 0 0014.001 13H11a1 1 0 110-2h5a1 1 0 011 1v5a1 1 0 11-2 0v-2.101a7.002 7.002 0 01-11.601-2.566 1 1 0 01.61-1.276z"/></svg>
                Restart OpenLiteSpeed (OLS)
              </button>
              <button class="btn btn-primary" id="notice-reload-server-btn" onclick="noticeReloadServer(this)">
                <svg viewBox="0 0 20 20" fill="currentColor" class="btn-icon"><path fill-rule="evenodd" d="M4 2a1 1 0 011 1v2.101a7.002 7.002 0 0111.601 2.566 1 1 0 11-1.885.666A5.002 5.002 0 005.999 7H9a1 1 0 010 2H4a1 1 0 01-1-1V3a1 1 0 011-1zm.008 9.057a1 1 0 011.276.61A5.002 5.002 0 0014.001 13H11a1 1 0 110-2h5a1 1 0 011 1v5a1 1 0 11-2 0v-2.101a7.002 7.002 0 01-11.601-2.566 1 1 0 01.61-1.276z"/></svg>
                Reload Server Daemon
              </button>
            </div>

            <div class="mt-4">
              <button class="btn btn-sm btn-secondary" onclick="closeModal()">Dismiss</button>
            </div>
          </div>
        `;
      }

      // Add attention pulse to the header OLS restart button
      const olsBtn = document.getElementById('header-ols-restart-btn');
      if (olsBtn) {
        olsBtn.classList.add('pulsing-attention');
        setTimeout(() => olsBtn.classList.remove('pulsing-attention'), 15000);
      }
    } else {
      toast(res?.error || 'Failed to update server timezone', 'error', 6000);
      if (btn) btn.disabled = false;
    }
  } catch (err) {
    toast(`Timezone error: ${err.message}`, 'error', 6000);
    if (btn) btn.disabled = false;
  }
}

async function noticeRestartOLS(btn) {
  if (btn) btn.disabled = true;
  toast('Sending graceful restart signal to OpenLiteSpeed…', 'info', 3000);
  try {
    const res = await api('/ols/restart', { method: 'POST', body: { action: 'restart' } });
    if (res?.success) {
      toast('OpenLiteSpeed restarted successfully (zero downtime)!', 'success', 5000);
      if (btn) btn.innerHTML = '✓ OLS Restarted';
    } else {
      toast(res?.message || res?.error || 'Failed to restart OLS', 'error');
      if (btn) btn.disabled = false;
    }
  } catch (err) {
    toast(`Error: ${err.message}`, 'error');
    if (btn) btn.disabled = false;
  }
}

async function noticeReloadServer(btn) {
  if (btn) btn.disabled = true;
  toast('Dispatching server daemon reload…', 'info', 3000);
  try {
    const res = await api('/system/reload', { method: 'POST', body: { action: 'reload' } });
    if (res?.success) {
      toast('DEOLS server daemon reload signal dispatched!', 'success', 5000);
      if (btn) btn.innerHTML = '✓ Server Reloaded';
    } else {
      toast(res?.message || res?.error || 'Failed to reload server daemon', 'error');
      if (btn) btn.disabled = false;
    }
  } catch (err) {
    toast(`Error: ${err.message}`, 'error');
    if (btn) btn.disabled = false;
  }
}

// ─── Stats Polling ──────────────────────────────────────────

function startStatsPolling() {
  updateStats();
  state.statsInterval = setInterval(updateStats, 5000);
}

function stopStatsPolling() {
  if (state.statsInterval) clearInterval(state.statsInterval);
}

async function updateStats() {
  const stats = await api('/system/stats');
  if (stats) {
    state.systemStats = stats;
    document.getElementById('cpu-value').textContent = `${stats.cpu}%`;
    document.getElementById('ram-value').textContent = `${stats.memory?.percent || 0}%`;
  }
}

// ─── Utility ────────────────────────────────────────────────

function formatBytes(bytes) {
  if (!bytes) return '0 B';
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  return `${(bytes / Math.pow(1024, i)).toFixed(1)} ${sizes[i]}`;
}

function timeAgo(dateStr) {
  const seconds = Math.floor((Date.now() - new Date(dateStr).getTime()) / 1000);
  if (seconds < 60) return 'just now';
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
  return `${Math.floor(seconds / 86400)}d ago`;
}

// ─── Page Renderers ─────────────────────────────────────────

async function renderDashboard(container) {
  container.innerHTML = `
    <div class="stats-grid" id="dashboard-stats">
      <div class="stat-card">
        <div class="stat-card-header">
          <span class="stat-card-label">CPU Usage</span>
          <div class="stat-card-icon purple"><svg viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M11.3 1.046A1 1 0 0112 2v5h4a1 1 0 01.82 1.573l-7 10A1 1 0 018 18v-5H4a1 1 0 01-.82-1.573l7-10a1 1 0 011.12-.38z"/></svg></div>
        </div>
        <div class="stat-card-value" id="dash-cpu">—%</div>
        <div class="progress-bar"><div class="progress-fill" id="dash-cpu-bar" style="width:0%"></div></div>
      </div>
      <div class="stat-card">
        <div class="stat-card-header">
          <span class="stat-card-label">Memory</span>
          <div class="stat-card-icon blue"><svg viewBox="0 0 20 20" fill="currentColor"><path d="M13 7H7v6h6V7z"/><path fill-rule="evenodd" d="M7 2a1 1 0 012 0v1h2V2a1 1 0 112 0v1h2a2 2 0 012 2v2h1a1 1 0 110 2h-1v2h1a1 1 0 110 2h-1v2a2 2 0 01-2 2h-2v1a1 1 0 11-2 0v-1H9v1a1 1 0 11-2 0v-1H5a2 2 0 01-2-2v-2H2a1 1 0 110-2h1V9H2a1 1 0 010-2h1V5a2 2 0 012-2h2V2zM5 5h10v10H5V5z"/></svg></div>
        </div>
        <div class="stat-card-value" id="dash-ram">—%</div>
        <div class="progress-bar"><div class="progress-fill" id="dash-ram-bar" style="width:0%"></div></div>
      </div>
      <div class="stat-card">
        <div class="stat-card-header">
          <span class="stat-card-label">Active Sites</span>
          <div class="stat-card-icon green"><svg viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M4.083 9h1.946c.089-1.546.383-2.97.837-4.118A6.004 6.004 0 004.083 9zM10 2a8 8 0 100 16 8 8 0 000-16z"/></svg></div>
        </div>
        <div class="stat-card-value" id="dash-sites">—</div>
        <div class="stat-card-change">WordPress sites</div>
      </div>
      <div class="stat-card">
        <div class="stat-card-header">
          <span class="stat-card-label">Disk Usage</span>
          <div class="stat-card-icon yellow"><svg viewBox="0 0 20 20" fill="currentColor"><path d="M2 6a2 2 0 012-2h5l2 2h5a2 2 0 012 2v6a2 2 0 01-2 2H4a2 2 0 01-2-2V6z"/></svg></div>
        </div>
        <div class="stat-card-value" id="dash-disk">—%</div>
        <div class="progress-bar"><div class="progress-fill" id="dash-disk-bar" style="width:0%"></div></div>
      </div>
    </div>

    <div class="card">
      <div class="card-header">
        <h2 class="card-title">
          <svg viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z"/></svg>
          Server Information
        </h2>
      </div>
      <div class="card-body" id="dash-server-info">
        <p class="text-muted">Loading server information…</p>
      </div>
    </div>

    <div class="card">
      <div class="card-header">
        <h2 class="card-title">
          <svg viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M11.49 3.17c-.38-1.56-2.6-1.56-2.98 0a1.532 1.532 0 01-2.286.948c-1.372-.836-2.942.734-2.106 2.106.54.886.061 2.042-.947 2.287-1.561.379-1.561 2.6 0 2.978a1.532 1.532 0 01.947 2.287c-.836 1.372.734 2.942 2.106 2.106a1.532 1.532 0 012.287.947c.379 1.561 2.6 1.561 2.978 0a1.533 1.533 0 012.287-.947c1.372.836 2.942-.734 2.106-2.106a1.533 1.533 0 01.947-2.287c1.561-.379 1.561-2.6 0-2.978a1.532 1.532 0 01-.947-2.287c.836-1.372-.734-2.942-2.106-2.106a1.532 1.532 0 01-2.287-.947zM10 13a3 3 0 100-6 3 3 0 000 6z"/></svg>
          Quick Actions
        </h2>
      </div>
      <div class="card-body">
        <div class="flex gap-3" style="flex-wrap:wrap">
          <button class="btn btn-primary" onclick="navigateTo('sites')">+ New Site</button>
          <button class="btn btn-secondary" onclick="purgeAllCache()">Purge All Cache</button>
          <button class="btn btn-secondary" onclick="navigateTo('terminal')">Open Terminal</button>
          <button class="btn btn-secondary" onclick="navigateTo('security')">Security Status</button>
        </div>
      </div>
    </div>
  `;

  // Load dashboard data
  loadDashboardData();
}

async function loadDashboardData() {
  // System overview
  const overview = await api('/system/overview');
  if (overview) {
    document.getElementById('dash-cpu').textContent = `${overview.cpu?.load || 0}%`;
    document.getElementById('dash-cpu-bar').style.width = `${overview.cpu?.load || 0}%`;
    document.getElementById('dash-ram').textContent = `${overview.memory?.usedPercent || 0}%`;
    document.getElementById('dash-ram-bar').style.width = `${overview.memory?.usedPercent || 0}%`;

    const disk = overview.disk?.find((d) => d.mount === '/');
    if (disk) {
      document.getElementById('dash-disk').textContent = `${disk.usedPercent}%`;
      document.getElementById('dash-disk-bar').style.width = `${disk.usedPercent}%`;
      if (disk.usedPercent > 80) document.getElementById('dash-disk-bar').classList.add('danger');
      else if (disk.usedPercent > 60) document.getElementById('dash-disk-bar').classList.add('warning');
    }

    if (overview.memory?.usedPercent > 80) document.getElementById('dash-ram-bar').classList.add('danger');
    if (overview.cpu?.load > 80) document.getElementById('dash-cpu-bar').classList.add('danger');

    const infoEl = document.getElementById('dash-server-info');
    if (infoEl) {
      const net = overview.network?.[0] || {};
      infoEl.innerHTML = `
        <div class="table-wrap">
          <table class="table">
            <tbody>
              <tr><td class="text-muted">Hostname</td><td>${escapeHTML(overview.hostname || '—')}</td></tr>
              <tr><td class="text-muted">OS</td><td>${escapeHTML(overview.os || '—')}</td></tr>
              <tr><td class="text-muted">Kernel</td><td>${escapeHTML(overview.kernel || '—')}</td></tr>
              <tr><td class="text-muted">CPU</td><td>${escapeHTML(overview.cpu?.model || '—')} (${overview.cpu?.cores || '?'} cores)</td></tr>
              <tr><td class="text-muted">Memory</td><td>${formatBytes(overview.memory?.total)} total</td></tr>
              <tr><td class="text-muted">IP Address</td><td class="text-mono">${escapeHTML(net.ip4 || '—')}</td></tr>
              <tr><td class="text-muted">Uptime</td><td>${Math.floor((overview.uptime || 0) / 3600)} hours</td></tr>
            </tbody>
          </table>
        </div>
      `;
    }
  }

  // Sites count
  const sites = await api('/sites');
  if (sites?.sites) {
    document.getElementById('dash-sites').textContent = sites.sites.length;
  }
}

async function purgeAllCache() {
  const result = await api('/cache/ols/purge', { method: 'POST' });
  if (result?.success) toast('OLS cache purged!', 'success');
  else toast('Failed to purge cache', 'error');
}

// ─── Sites Page ─────────────────────────────────────────────

async function renderSites(container) {
  container.innerHTML = `
    <div class="flex justify-between items-center mb-6">
      <p class="text-muted">Manage WordPress sites hosted on this server</p>
      <button class="btn btn-primary" id="btn-add-site">
        <svg viewBox="0 0 20 20" fill="currentColor" class="btn-icon"><path fill-rule="evenodd" d="M10 3a1 1 0 011 1v5h5a1 1 0 110 2h-5v5a1 1 0 11-2 0v-5H4a1 1 0 110-2h5V4a1 1 0 011-1z"/></svg>
        New Site
      </button>
    </div>
    <div class="card">
      <div class="card-body" id="sites-list">
        <p class="text-muted">Loading sites…</p>
      </div>
    </div>
  `;

  document.getElementById('btn-add-site').addEventListener('click', showNewSiteModal);

  const data = await api('/sites');
  const listEl = document.getElementById('sites-list');

  if (!data?.sites?.length) {
    listEl.innerHTML = `
      <div class="empty-state">
        <svg viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M4.083 9h1.946c.089-1.546.383-2.97.837-4.118A6.004 6.004 0 004.083 9zM10 2a8 8 0 100 16 8 8 0 000-16z"/></svg>
        <h3>No Sites Yet</h3>
        <p>Deploy your first WordPress site in seconds</p>
        <button class="btn btn-primary" onclick="showNewSiteModal()">+ Create Site</button>
      </div>
    `;
    return;
  }

  listEl.innerHTML = `
    <div class="table-wrap">
      <table class="table">
        <thead>
          <tr>
            <th>Domain</th>
            <th>PHP</th>
            <th>SSL</th>
            <th>Status</th>
            <th>Created</th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody>
          ${data.sites.map((site) => `
            <tr>
              <td>
                <div class="flex items-center gap-2">
                  <span class="status-dot ${site.status === 'active' ? 'active' : 'inactive'}"></span>
                  <a href="javascript:void(0)" onclick="openSiteManage('${site.domain}')" class="site-domain-link" title="Open Site Management Dashboard">
                    <strong>${escapeHTML(site.domain)}</strong>
                  </a>
                </div>
              </td>
              <td><span class="badge badge-neutral">PHP ${site.phpVersion === '83' ? '8.3' : site.phpVersion === '82' ? '8.2' : site.phpVersion}</span></td>
              <td>${site.ssl ? '<span class="badge badge-success">Active</span>' : '<span class="badge badge-warning">None</span>'}</td>
              <td><span class="badge badge-${site.status === 'active' ? 'success' : 'warning'}">${site.status}</span></td>
              <td class="text-muted text-sm">${timeAgo(site.createdAt)}</td>
              <td>
                <div class="flex gap-2 items-center">
                  <button class="btn btn-sm btn-primary" onclick="openSiteManage('${site.domain}')" title="Manage site settings, OLS vhost, databases, SSL, cache and logs">
                    <svg viewBox="0 0 20 20" fill="currentColor" class="btn-icon" style="width: 13px; height: 13px; margin-right: 3px;"><path fill-rule="evenodd" d="M11.49 3.17c-.38-1.56-2.6-1.56-2.98 0a1.532 1.532 0 01-2.286.948c-1.372-.836-2.942.734-2.106 2.106.54.886.061 2.042-.947 2.287-1.561.379-1.561 2.6 0 2.978a1.532 1.532 0 01.947 2.287c-.836 1.372.734 2.942 2.106 2.106a1.532 1.532 0 012.287.947c.379 1.561 2.6 1.561 2.978 0a1.533 1.533 0 012.287-.947c1.372.836 2.942-.734 2.106-2.106a1.533 1.533 0 01.947-2.287c1.561-.379 1.561-2.6 0-2.978a1.532 1.532 0 01-.947-2.287c.836-1.372-.734-2.942-2.106-2.106a1.532 1.532 0 01-2.287-.947zM10 13a3 3 0 100-6 3 3 0 000 6z"/></svg>
                    Manage
                  </button>
                  <button class="btn btn-sm btn-ghost" onclick="repairPerms('${site.domain}')" title="Repair permissions to nobody:nogroup">Repair</button>
                  <button class="btn btn-sm btn-danger" onclick="deleteSite('${site.domain}')" title="Delete site">Delete</button>
                </div>
              </td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    </div>
  `;
}

function showNewSiteModal() {
  showModal('New WordPress Site', `
    <form id="new-site-form" class="flex flex-col gap-4">
      <div class="form-group">
        <label>Domain</label>
        <input type="text" id="new-domain" placeholder="example.com" required>
      </div>
      <div class="form-row">
        <div class="form-group">
          <label>PHP Version</label>
          <select id="new-php">
            <option value="83">PHP 8.3</option>
            <option value="82">PHP 8.2</option>
          </select>
        </div>
        <div class="form-group">
          <label>Site Title</label>
          <input type="text" id="new-title" placeholder="My WordPress Site">
        </div>
      </div>
      <div class="form-row">
        <div class="form-group">
          <label>WP Admin Username</label>
          <input type="text" id="new-admin" placeholder="admin" value="admin">
        </div>
        <div class="form-group">
          <label>WP Admin Email</label>
          <input type="email" id="new-email" placeholder="admin@example.com">
        </div>
      </div>
      <div class="form-group">
        <label>WP Admin Password</label>
        <div style="display: flex; gap: 8px;">
          <input type="text" id="new-password" placeholder="Leave blank to auto-generate password" style="flex:1;">
          <button type="button" class="btn btn-secondary btn-sm" id="btn-gen-wp-pass">Generate</button>
        </div>
      </div>
      <div class="flex gap-4 items-center">
        <label class="toggle">
          <input type="checkbox" id="new-wildcard">
          <span class="toggle-slider"></span>
        </label>
        <span class="text-sm">Enable Wildcard Subdomains</span>
      </div>
    </form>
  `, `
    <button class="btn btn-secondary" onclick="closeModal()">Cancel</button>
    <button class="btn btn-primary" id="btn-create-site">Create Site</button>
  `);

  document.getElementById('btn-gen-wp-pass')?.addEventListener('click', () => {
    const chars = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let pass = '';
    for (let i = 0; i < 16; i++) pass += chars.charAt(Math.floor(Math.random() * chars.length));
    document.getElementById('new-password').value = pass;
  });

  document.getElementById('btn-create-site').addEventListener('click', async () => {
    const domain = document.getElementById('new-domain').value.trim();
    if (!domain) {
      toast('Please enter a valid domain name', 'warning');
      return;
    }

    const btn = document.getElementById('btn-create-site');
    btn.disabled = true;
    btn.textContent = 'Provisioning & Installing WordPress…';

    const result = await api('/sites', {
      method: 'POST',
      body: {
        domain,
        phpVersion: document.getElementById('new-php').value,
        siteTitle: document.getElementById('new-title').value || 'My WordPress Site',
        adminUser: document.getElementById('new-admin').value || 'admin',
        adminEmail: document.getElementById('new-email').value || `admin@${domain}`,
        adminPassword: document.getElementById('new-password').value.trim() || undefined,
        enableWildcard: document.getElementById('new-wildcard').checked,
      },
    });

    if (result?.success) {
      toast(`Site ${result.site.domain} created & WordPress installed!`, 'success');
      showSiteCredentialsModal(result);
      navigateTo('sites');
    } else {
      toast(result?.error || 'Failed to create site', 'error');
      btn.disabled = false;
      btn.textContent = 'Create Site';
    }
  });
}

function showSiteCredentialsModal(res) {
  const creds = res.credentials || {};
  const site = res.site || {};
  showModal('🎉 Site Created & Installed', `
    <div style="display:flex; flex-direction:column; gap:16px;">
      <div style="background: rgba(16, 185, 129, 0.1); border: 1px solid rgba(16, 185, 129, 0.3); color: #34d399; border-radius:8px; padding:12px 16px; font-size:13px; line-height:1.5;">
        WordPress is 100% installed and ready! You can login directly without going through manual setup.
      </div>
      <table style="width:100%; border-collapse:collapse; font-size:13px; color:var(--text-primary);">
        <tr style="border-bottom:1px solid var(--border-color,#334155);"><td style="padding:8px 0; font-weight:600; width:140px;">Site Domain:</td><td>${escapeHTML(site.domain)}</td></tr>
        <tr style="border-bottom:1px solid var(--border-color,#334155);"><td style="padding:8px 0; font-weight:600;">WP Admin URL:</td><td><a href="${escapeHTML(creds.loginUrl || 'http://' + site.domain + '/wp-admin/')}" target="_blank" style="color:#38bdf8; text-decoration:underline;">${escapeHTML(creds.loginUrl || 'http://' + site.domain + '/wp-admin/')}</a></td></tr>
        <tr style="border-bottom:1px solid var(--border-color,#334155);"><td style="padding:8px 0; font-weight:600;">WP Admin User:</td><td><code style="background:rgba(0,0,0,0.3); padding:2px 6px; border-radius:4px; font-family:monospace; color:#a78bfa;">${escapeHTML(creds.wpAdmin)}</code></td></tr>
        <tr style="border-bottom:1px solid var(--border-color,#334155);"><td style="padding:8px 0; font-weight:600;">WP Admin Pass:</td><td><code style="background:rgba(0,0,0,0.3); padding:2px 6px; border-radius:4px; font-family:monospace; color:#a78bfa;">${escapeHTML(creds.wpPassword)}</code></td></tr>
        <tr style="border-bottom:1px solid var(--border-color,#334155);"><td style="padding:8px 0; font-weight:600;">DB Name:</td><td><code style="background:rgba(0,0,0,0.3); padding:2px 6px; border-radius:4px; font-family:monospace;">${escapeHTML(creds.dbName)}</code></td></tr>
        <tr style="border-bottom:1px solid var(--border-color,#334155);"><td style="padding:8px 0; font-weight:600;">DB User:</td><td><code style="background:rgba(0,0,0,0.3); padding:2px 6px; border-radius:4px; font-family:monospace;">${escapeHTML(creds.dbUser)}</code></td></tr>
        <tr><td style="padding:8px 0; font-weight:600;">DB Password:</td><td><code style="background:rgba(0,0,0,0.3); padding:2px 6px; border-radius:4px; font-family:monospace;">${escapeHTML(creds.dbPassword)}</code></td></tr>
      </table>
    </div>
  `, `
    <button class="btn btn-primary" onclick="closeModal()">Done</button>
  `);
}

async function repairPerms(domain) {
  const result = await api(`/sites/${domain}/repair-permissions`, { method: 'POST' });
  if (result?.success) toast('Permissions repaired!', 'success');
  else toast('Failed to repair permissions', 'error');
}

async function deleteSite(domain) {
  if (!confirm(`Delete site ${domain}? This cannot be undone.`)) return;
  const result = await api(`/sites/${domain}?removeFiles=true&removeDatabase=true`, { method: 'DELETE' });
  if (result?.success) {
    toast(`Site ${domain} deleted`, 'success');
    navigateTo('sites');
  } else {
    toast(result?.error || 'Failed to delete site', 'error');
  }
}

// ─── Site Management Dashboard (CyberPanel / cPanel Model) ──

let currentSiteManageDomain = null;
let currentSiteLogType = 'error';

async function openSiteManage(domain) {
  navigateTo('site-manage', { domain });
}
window.openSiteManage = openSiteManage;

async function renderSiteManage(container, domain) {
  currentSiteManageDomain = domain;
  if (!domain) {
    container.innerHTML = `
      <div class="empty-state">
        <h3>No Domain Specified</h3>
        <p>Please select a site to manage.</p>
        <button class="btn btn-primary" onclick="navigateTo('sites')">← Back to Sites</button>
      </div>
    `;
    return;
  }

  container.innerHTML = `
    <div class="site-manage-container">
      <div class="text-muted" style="font-size: 0.9rem; padding: 30px 0; text-align: center;">
        <span class="loading-spinner" style="display:inline-block;width:18px;height:18px;border:2px solid var(--border-primary);border-top-color:var(--color-primary);border-radius:50%;animation:spin 1s linear infinite;vertical-align:-3px;margin-right:8px;"></span>
        Loading management dashboard for <strong>${escapeHTML(domain)}</strong>…
      </div>
    </div>
  `;

  const details = await api(`/sites/${encodeURIComponent(domain)}/details`);
  if (!details || details.error) {
    container.innerHTML = `
      <div class="empty-state">
        <h3>Site Configuration Unavailable</h3>
        <p>${escapeHTML(details?.error || 'Could not load site configuration.')}</p>
        <button class="btn btn-primary" onclick="navigateTo('sites')">← Back to Sites</button>
      </div>
    `;
    return;
  }

  const {
    siteUser = domain.replace(/[^a-z0-9]/gi, '').substring(0, 16),
    serverIp = '127.0.0.1',
    docRoot = `/var/www/${domain}/public_html`,
    phpVersion = '83',
    ssl = false,
    dbName = `wp_${domain.replace(/[^a-z0-9]/gi, '_')}`,
    dbUser = `u_${domain.replace(/[^a-z0-9]/gi, '').substring(0, 10)}`,
    status = 'active',
  } = details;

  container.innerHTML = `
    <div class="site-manage-container">
      <!-- Top Meta Info Header (Matches Image 2) -->
      <div class="site-meta-header">
        <div class="site-meta-items">
          <div class="site-meta-item">
            <span class="site-meta-label">Domain</span>
            <span class="site-meta-value">
              <a href="http://${escapeHTML(domain)}" target="_blank" rel="noopener noreferrer" class="site-meta-link">
                ${escapeHTML(domain)}
                <svg viewBox="0 0 20 20" fill="currentColor" style="width: 14px; height: 14px;"><path d="M11 3a1 1 0 100 2h2.586l-6.293 6.293a1 1 0 101.414 1.414L15 6.414V9a1 1 0 102 0V4a1 1 0 00-1-1h-5z"/><path d="M5 5a2 2 0 00-2 2v8a2 2 0 002 2h8a2 2 0 002-2v-3a1 1 0 10-2 0v3H5V7h3a1 1 0 000-2H5z"/></svg>
              </a>
            </span>
          </div>

          <div class="site-meta-item">
            <span class="site-meta-label">Site User</span>
            <span class="site-meta-value text-mono">${escapeHTML(siteUser)}</span>
          </div>

          <div class="site-meta-item">
            <span class="site-meta-label">IP Address</span>
            <span class="site-meta-value text-mono">${escapeHTML(serverIp)}</span>
          </div>
        </div>

        <div class="flex items-center gap-3">
          <span class="badge badge-${status === 'active' ? 'success' : 'warning'}">${status === 'active' ? '● Active' : status}</span>
          <button class="btn btn-secondary btn-sm" onclick="navigateTo('sites')" title="Return to all sites">
            ← Back to Sites
          </button>
        </div>
      </div>

      <!-- Navigation Tabs (Matches Image 2) -->
      <div class="site-tabs-nav" id="site-manage-tabs">
        <button class="site-tab-btn active" data-tab="settings">Settings</button>
        <button class="site-tab-btn" data-tab="limits">⚡ Resource Limits</button>
        <button class="site-tab-btn" data-tab="vhost">Vhost</button>
        <button class="site-tab-btn" data-tab="databases">Databases</button>
        <button class="site-tab-btn" data-tab="cache">OLS Cache</button>
        <button class="site-tab-btn" data-tab="ssl">SSL/TLS</button>
        <button class="site-tab-btn" data-tab="security">Security</button>
        <button class="site-tab-btn" data-tab="ssh">SSH/FTP</button>
        <button class="site-tab-btn" data-tab="files">File Manager</button>
        <button class="site-tab-btn" data-tab="cron">Cron Jobs</button>
        <button class="site-tab-btn" data-tab="logs">Logs</button>
      </div>

      <!-- 1. SETTINGS TAB PANE (Exact replica of Image 2) -->
      <div class="site-tab-pane active" id="pane-settings">
        <!-- Domain Settings Card -->
        <div class="site-manage-card">
          <div class="site-manage-card-header">
            <h3 class="site-manage-card-title">Domain Settings</h3>
          </div>
          <div class="flex flex-col gap-4">
            <div class="form-row" style="display:grid;grid-template-columns:1fr 1fr;gap:20px;">
              <div class="form-group">
                <label class="form-label" style="font-weight:600;font-size:0.85rem;color:var(--text-secondary);margin-bottom:6px;display:block;">Domain Name</label>
                <input type="text" class="input" value="${escapeHTML(domain)}" readonly style="background:var(--bg-secondary);cursor:not-allowed;width:100%;">
              </div>
              <div class="form-group">
                <label class="form-label" style="font-weight:600;font-size:0.85rem;color:var(--text-secondary);margin-bottom:6px;display:block;">Root Directory *</label>
                <input type="text" id="manage-root-dir" class="input" value="${escapeHTML(domain)}" style="width:100%;">
                <span class="form-hint" style="font-size:11px;color:var(--text-tertiary);margin-top:6px;display:block;font-family:var(--font-mono);">
                  ${escapeHTML(docRoot)}
                </span>
              </div>
            </div>

            <div class="form-row" style="display:grid;grid-template-columns:1fr 1fr;gap:20px;">
              <div class="form-group">
                <label class="form-label" style="font-weight:600;font-size:0.85rem;color:var(--text-secondary);margin-bottom:6px;display:block;">PHP Version</label>
                <select id="manage-php-version" class="input" style="width:100%;">
                  <option value="83" ${phpVersion === '83' ? 'selected' : ''}>PHP 8.3 (LSPHP 8.3 — Default)</option>
                  <option value="82" ${phpVersion === '82' ? 'selected' : ''}>PHP 8.2 (LSPHP 8.2)</option>
                  <option value="81" ${phpVersion === '81' ? 'selected' : ''}>PHP 8.1 (LSPHP 8.1)</option>
                </select>
              </div>
              <div class="form-group" style="display:flex;align-items:flex-end;justify-content:flex-end;">
                <button class="btn btn-primary" id="btn-save-domain-settings" onclick="saveDomainSettings('${escapeHTML(domain)}')">
                  Save
                </button>
              </div>
            </div>
          </div>
        </div>

        <!-- Site User Settings Card -->
        <div class="site-manage-card">
          <div class="site-manage-card-header">
            <h3 class="site-manage-card-title">Site User Settings</h3>
          </div>
          <div class="flex flex-col gap-4">
            <div class="form-row" style="display:grid;grid-template-columns:1fr 1fr;gap:20px;">
              <div class="form-group">
                <label class="form-label" style="font-weight:600;font-size:0.85rem;color:var(--text-secondary);margin-bottom:6px;display:block;">Site User</label>
                <input type="text" class="input" value="${escapeHTML(siteUser)}" readonly style="background:var(--bg-secondary);cursor:not-allowed;width:100%;">
              </div>
              <div class="form-group">
                <label class="form-label" style="font-weight:600;font-size:0.85rem;color:var(--text-secondary);margin-bottom:6px;display:block;">Password</label>
                <input type="password" id="manage-site-user-pass" class="input" placeholder="••••••••••••" style="width:100%;">
                <div class="flex justify-between items-center mt-2">
                  <a href="javascript:void(0)" onclick="generateNewSitePass()" style="font-size:12px;color:var(--color-primary);text-decoration:none;font-weight:500;">
                    Generate new password
                  </a>
                  <button class="btn btn-secondary btn-sm" onclick="saveSiteUserPass('${escapeHTML(domain)}')">
                    Update Password
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>

        <!-- OLS Quick Actions Card -->
        <div class="site-manage-card">
          <div class="site-manage-card-header">
            <h3 class="site-manage-card-title">OpenLiteSpeed Engine & Maintenance</h3>
          </div>
          <div class="flex gap-3" style="flex-wrap:wrap;">
            <button class="btn btn-secondary btn-sm" onclick="repairPerms('${escapeHTML(domain)}')">
              🛠️ Repair Permissions (750 / Isolated)
            </button>
            <button class="btn btn-secondary btn-sm" onclick="purgeSiteCache('${escapeHTML(domain)}')">
              ⚡ Purge LiteSpeed Cache (LSCache)
            </button>
            <button class="btn btn-secondary btn-sm" onclick="runSiteWpCron('${escapeHTML(domain)}')">
              ⏱️ Execute WP-Cron Now
            </button>
            <button class="btn btn-secondary btn-sm" onclick="repairSiteDatabase('${escapeHTML(domain)}')">
              🗄️ Repair Database
            </button>
          </div>
        </div>
      </div>

      <!-- 2. RESOURCE LIMITS & USER ISOLATION TAB PANE -->
      <div class="site-tab-pane" id="pane-limits">
        <!-- Live Real-Time Resource Gauges -->
        <div class="site-manage-card">
          <div class="site-manage-card-header">
            <div>
              <h3 class="site-manage-card-title">Live Resource Consumption (cgroups v2 + Quotas)</h3>
              <p class="text-muted text-xs" style="margin-top:2px;">
                Kernel-enforced hardware isolation boundary for <strong>${escapeHTML(siteUser)}</strong>
              </p>
            </div>
            <div class="flex gap-2">
              <button class="btn btn-secondary btn-sm" onclick="loadSiteLimits('${escapeHTML(domain)}')">
                🔄 Refresh Live Metrics
              </button>
            </div>
          </div>
          
          <div style="display:grid;grid-template-columns:repeat(auto-fit, minmax(220px, 1fr));gap:16px;margin-top:10px;">
            <!-- CPU Gauge -->
            <div style="background:var(--bg-secondary);padding:16px;border-radius:10px;border:1px solid var(--border-primary);">
              <div class="flex justify-between items-center mb-2">
                <span style="font-size:0.85rem;font-weight:600;color:var(--text-secondary);">CPU Utilization</span>
                <span id="metric-cpu-text" class="text-mono font-bold" style="color:var(--accent-primary);font-size:0.9rem;">0.0% / 100%</span>
              </div>
              <div style="background:rgba(255,255,255,0.06);border-radius:6px;height:8px;overflow:hidden;margin-bottom:6px;">
                <div id="metric-cpu-bar" style="background:var(--accent-gradient);height:100%;width:0%;transition:width 0.4s ease;"></div>
              </div>
              <div class="flex justify-between text-xs text-muted">
                <span>Core Limit: <strong id="metric-cpu-limit-label">1.0 Core</strong></span>
                <span id="metric-cpu-status">Normal</span>
              </div>
            </div>

            <!-- RAM Gauge -->
            <div style="background:var(--bg-secondary);padding:16px;border-radius:10px;border:1px solid var(--border-primary);">
              <div class="flex justify-between items-center mb-2">
                <span style="font-size:0.85rem;font-weight:600;color:var(--text-secondary);">Memory (RAM)</span>
                <span id="metric-ram-text" class="text-mono font-bold" style="color:var(--success);font-size:0.9rem;">0 MB / 512 MB</span>
              </div>
              <div style="background:rgba(255,255,255,0.06);border-radius:6px;height:8px;overflow:hidden;margin-bottom:6px;">
                <div id="metric-ram-bar" style="background:var(--success);height:100%;width:0%;transition:width 0.4s ease;"></div>
              </div>
              <div class="flex justify-between text-xs text-muted">
                <span>Hard Cap (Max): <strong id="metric-ram-max-label">768 MB</strong></span>
                <span id="metric-ram-status">Safe</span>
              </div>
            </div>

            <!-- Disk Quota Gauge -->
            <div style="background:var(--bg-secondary);padding:16px;border-radius:10px;border:1px solid var(--border-primary);">
              <div class="flex justify-between items-center mb-2">
                <span style="font-size:0.85rem;font-weight:600;color:var(--text-secondary);">Storage Quota</span>
                <span id="metric-disk-text" class="text-mono font-bold" style="color:var(--info);font-size:0.9rem;">0 MB / 5000 MB</span>
              </div>
              <div style="background:rgba(255,255,255,0.06);border-radius:6px;height:8px;overflow:hidden;margin-bottom:6px;">
                <div id="metric-disk-bar" style="background:var(--info);height:100%;width:0%;transition:width 0.4s ease;"></div>
              </div>
              <div class="flex justify-between text-xs text-muted">
                <span>ext4 Quota</span>
                <span id="metric-disk-status">90% Soft / 100% Hard</span>
              </div>
            </div>

            <!-- Tasks / Processes Gauge -->
            <div style="background:var(--bg-secondary);padding:16px;border-radius:10px;border:1px solid var(--border-primary);">
              <div class="flex justify-between items-center mb-2">
                <span style="font-size:0.85rem;font-weight:600;color:var(--text-secondary);">Active Tasks</span>
                <span id="metric-tasks-text" class="text-mono font-bold" style="color:var(--warning);font-size:0.9rem;">0 / 150</span>
              </div>
              <div style="background:rgba(255,255,255,0.06);border-radius:6px;height:8px;overflow:hidden;margin-bottom:6px;">
                <div id="metric-tasks-bar" style="background:var(--warning);height:100%;width:0%;transition:width 0.4s ease;"></div>
              </div>
              <div class="flex justify-between text-xs text-muted">
                <span>Anti-Fork Bomb</span>
                <span>cgroup TasksMax</span>
              </div>
            </div>
          </div>
        </div>

        <!-- Resource Quota Allocation Controls Card -->
        <div class="site-manage-card">
          <div class="site-manage-card-header">
            <h3 class="site-manage-card-title">Configure Resource Allocations & Quotas</h3>
          </div>
          <div class="flex flex-col gap-5">
            <!-- CPU Slider -->
            <div class="form-group">
              <div class="flex justify-between items-center mb-2">
                <label class="form-label" style="font-weight:600;margin:0;">
                  CPU Core Allocation (CPUQuota)
                </label>
                <div class="flex items-center gap-2">
                  <input type="number" id="limit-input-cpu" class="input" style="width:90px;text-align:right;" min="10" max="400" step="10" value="100" oninput="syncLimitSlider('cpu', this.value)">
                  <span class="text-mono font-bold text-sm">%</span>
                  <span id="limit-cpu-cores-text" class="badge badge-neutral" style="font-size:11px;">1.0 Core</span>
                </div>
              </div>
              <input type="range" id="limit-slider-cpu" min="10" max="400" step="10" value="100" style="width:100%;accent-color:var(--accent-primary);cursor:pointer;" oninput="syncLimitInput('cpu', this.value)">
              <div class="flex justify-between text-xs text-muted mt-1">
                <span>10% (0.1 Core)</span>
                <span>100% (1 Full Core)</span>
                <span>200% (2 Cores)</span>
                <span>400% (4 Cores)</span>
              </div>
            </div>

            <!-- RAM Slider -->
            <div class="form-group">
              <div class="flex justify-between items-center mb-2">
                <label class="form-label" style="font-weight:600;margin:0;">
                  RAM Soft Limit (MemoryHigh — Page Cache Reclaim)
                </label>
                <div class="flex items-center gap-2">
                  <input type="number" id="limit-input-ram" class="input" style="width:100px;text-align:right;" min="128" max="16384" step="64" value="512" oninput="syncLimitSlider('ram', this.value)">
                  <span class="text-mono font-bold text-sm">MB</span>
                </div>
              </div>
              <input type="range" id="limit-slider-ram" min="128" max="8192" step="64" value="512" style="width:100%;accent-color:var(--success);cursor:pointer;" oninput="syncLimitInput('ram', this.value)">
              <div class="flex justify-between text-xs text-muted mt-1">
                <span>128 MB</span>
                <span>512 MB</span>
                <span>1024 MB (1 GB)</span>
                <span>2048 MB (2 GB)</span>
                <span>4096 MB (4 GB)</span>
                <span>8192 MB (8 GB)</span>
              </div>
            </div>

            <!-- RAM Max Hard Limit -->
            <div class="form-group">
              <div class="flex justify-between items-center mb-2">
                <label class="form-label" style="font-weight:600;margin:0;">
                  RAM Hard Limit (MemoryMax — Isolated OOM Ceiling)
                </label>
                <div class="flex items-center gap-2">
                  <input type="number" id="limit-input-rammax" class="input" style="width:100px;text-align:right;" min="256" max="32768" step="64" value="768" oninput="syncLimitSlider('rammax', this.value)">
                  <span class="text-mono font-bold text-sm">MB</span>
                </div>
              </div>
              <input type="range" id="limit-slider-rammax" min="256" max="16384" step="64" value="768" style="width:100%;accent-color:var(--warning);cursor:pointer;" oninput="syncLimitInput('rammax', this.value)">
              <span class="form-hint" style="font-size:11px;color:var(--text-tertiary);margin-top:4px;display:block;">
                Hard memory threshold where kernel will terminate leaky user processes without taking down the server.
              </span>
            </div>

            <!-- Disk Quota & TasksMax Row -->
            <div class="form-row" style="display:grid;grid-template-columns:1fr 1fr;gap:20px;">
              <div class="form-group">
                <label class="form-label" style="font-weight:600;font-size:0.85rem;color:var(--text-secondary);margin-bottom:6px;display:block;">
                  Disk Space Quota (MB)
                </label>
                <div class="flex items-center gap-2">
                  <input type="number" id="limit-input-disk" class="input" min="256" max="1000000" step="256" value="5000" style="width:100%;" oninput="updateDiskGbLabel()">
                  <span class="text-mono text-xs text-muted" id="limit-disk-gb-label" style="white-space:nowrap;">~4.88 GB</span>
                </div>
                <span class="form-hint" style="font-size:11px;color:var(--text-tertiary);margin-top:4px;display:block;">
                  Debian ext4 quota (90% soft alert, 100% hard write block).
                </span>
              </div>

              <div class="form-group">
                <label class="form-label" style="font-weight:600;font-size:0.85rem;color:var(--text-secondary);margin-bottom:6px;display:block;">
                  Max Tasks / Processes (TasksMax)
                </label>
                <input type="number" id="limit-input-tasks" class="input" min="20" max="1000" step="10" value="150" style="width:100%;">
                <span class="form-hint" style="font-size:11px;color:var(--text-tertiary);margin-top:4px;display:block;">
                  Anti-fork bomb limit per user process tree.
                </span>
              </div>
            </div>

            <!-- Action buttons -->
            <div class="flex justify-between items-center pt-3" style="border-top:1px solid var(--border-primary);">
              <button class="btn btn-secondary btn-sm" onclick="repairPerms('${escapeHTML(domain)}')">
                🛡️ Repair POSIX Security (750 / ${escapeHTML(siteUser)}:www-data)
              </button>
              <button class="btn btn-primary" id="btn-save-limits" onclick="saveSiteLimits('${escapeHTML(domain)}')">
                💾 Save & Apply Limits Instantly
              </button>
            </div>
          </div>
        </div>

        <!-- Multi-Tenant Architecture Overview Card -->
        <div class="site-manage-card">
          <div class="site-manage-card-header">
            <h3 class="site-manage-card-title">Isolation Architecture Details</h3>
          </div>
          <div class="table-wrap">
            <table class="table">
              <tbody>
                <tr>
                  <td class="text-muted" style="width:220px;">Dedicated System User</td>
                  <td class="text-mono font-bold" style="color:var(--accent-primary);">${escapeHTML(siteUser)}</td>
                </tr>
                <tr>
                  <td class="text-muted">Systemd Resource Slice</td>
                  <td class="text-mono text-xs">/etc/systemd/system/deols-user-${escapeHTML(siteUser)}.slice</td>
                </tr>
                <tr>
                  <td class="text-muted">cgroups v2 Controller</td>
                  <td class="text-mono text-xs">/sys/fs/cgroup/deols-user-${escapeHTML(siteUser)}.slice</td>
                </tr>
                <tr>
                  <td class="text-muted">OpenLiteSpeed FastCGI / LSPHP</td>
                  <td class="text-mono text-xs">uds://tmp/lsphp_${escapeHTML(siteUser)}.sock (extUser: ${escapeHTML(siteUser)}, extGroup: www-data)</td>
                </tr>
                <tr>
                  <td class="text-muted">Directory Permissions</td>
                  <td class="text-mono text-xs">chmod 750 /var/www/${escapeHTML(domain)} (chown -R ${escapeHTML(siteUser)}:www-data)</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <!-- 2. VHOST TAB PANE (OpenLiteSpeed vhconf.conf Editor) -->
      <div class="site-tab-pane" id="pane-vhost">
        <div class="site-manage-card">
          <div class="site-manage-card-header">
            <div>
              <h3 class="site-manage-card-title">OpenLiteSpeed Virtual Host Configuration</h3>
              <p class="text-muted text-xs text-mono" style="margin-top:4px;">
                /usr/local/lsws/conf/vhosts/${escapeHTML(domain)}/vhconf.conf
              </p>
            </div>
            <div class="flex gap-2">
              <button class="btn btn-secondary btn-sm" onclick="loadVhostConf('${escapeHTML(domain)}')">
                🔄 Refresh
              </button>
              <button class="btn btn-primary btn-sm" onclick="saveVhostConf('${escapeHTML(domain)}')">
                💾 Save & Reload OLS
              </button>
            </div>
          </div>
          <div class="flex flex-col gap-3">
            <textarea id="vhost-editor" style="width:100%;height:420px;font-family:var(--font-mono);font-size:0.85rem;line-height:1.5;background:var(--bg-secondary);color:var(--text-primary);padding:14px;border-radius:8px;border:1px solid var(--border-primary);resize:vertical;" spellcheck="false">Loading vhconf.conf…</textarea>
            <div class="flex justify-between items-center text-xs text-muted">
              <span>💡 Edits are applied immediately with a zero-downtime graceful reload signal to OpenLiteSpeed.</span>
              <button class="btn btn-ghost btn-sm" onclick="reloadOlsFromVhost()">
                Restart OLS Engine
              </button>
            </div>
          </div>
        </div>
      </div>

      <!-- 3. DATABASES TAB PANE -->
      <div class="site-tab-pane" id="pane-databases">
        <div class="site-manage-card">
          <div class="site-manage-card-header">
            <h3 class="site-manage-card-title">Associated MariaDB Database</h3>
          </div>
          <div class="table-wrap">
            <table class="table">
              <tbody>
                <tr>
                  <td class="text-muted" style="width:180px;">Database Name</td>
                  <td class="text-mono font-bold">${escapeHTML(dbName)}</td>
                </tr>
                <tr>
                  <td class="text-muted">Database User</td>
                  <td class="text-mono font-bold">${escapeHTML(dbUser)}</td>
                </tr>
                <tr>
                  <td class="text-muted">Host</td>
                  <td class="text-mono">localhost:3306</td>
                </tr>
                <tr>
                  <td class="text-muted">Database Engine</td>
                  <td>MariaDB InnoDB / utf8mb4</td>
                </tr>
              </tbody>
            </table>
          </div>
          <div class="flex gap-3 mt-4" style="flex-wrap:wrap">
            <button class="btn btn-primary btn-sm" onclick="repairSiteDatabase('${escapeHTML(domain)}')">
              🔧 Repair & Optimize Database
            </button>
            <button class="btn btn-warning btn-sm" onclick="fixSiteDbConnection('${escapeHTML(domain)}')">
              ⚡ Fix DB Connection & Sync Password
            </button>
            <button class="btn btn-secondary btn-sm" onclick="navigateTo('databases')">
              Open Global Database Manager →
            </button>
          </div>
        </div>
      </div>

      <!-- 4. OLS CACHE TAB PANE -->
      <div class="site-tab-pane" id="pane-cache">
        <div class="site-manage-card">
          <div class="site-manage-card-header">
            <h3 class="site-manage-card-title">OpenLiteSpeed Cache Engine (LSCache)</h3>
            <span class="badge badge-success">Active & Optimized</span>
          </div>
          <p class="text-muted text-sm mb-4">
            CyberPanel-compatible ultra-fast server-level caching built into the OpenLiteSpeed core. Automatically accelerates WordPress with zero reverse-proxy overhead.
          </p>
          <div class="table-wrap mb-4">
            <table class="table">
              <tbody>
                <tr>
                  <td class="text-muted" style="width:200px;">Cache Storage Root</td>
                  <td class="text-mono">/tmp/lscache or /usr/local/lsws/cachedata</td>
                </tr>
                <tr>
                  <td class="text-muted">Object Cache (Redis)</td>
                  <td><span class="badge badge-success">Connected (127.0.0.1:6379)</span></td>
                </tr>
                <tr>
                  <td class="text-muted">Gzip & Brotli Compression</td>
                  <td><span class="badge badge-success">Enabled (Level 6)</span></td>
                </tr>
              </tbody>
            </table>
          </div>
          <div class="flex gap-3">
            <button class="btn btn-primary" onclick="purgeSiteCache('${escapeHTML(domain)}')">
              ⚡ Purge All LSCache for ${escapeHTML(domain)}
            </button>
            <button class="btn btn-secondary" onclick="purgeAllCache()">
              Purge Global Server Cache
            </button>
          </div>
        </div>
      </div>

      <!-- 5. SSL / TLS TAB PANE -->
      <div class="site-tab-pane" id="pane-ssl">
        <div class="site-manage-card">
          <div class="site-manage-card-header">
            <h3 class="site-manage-card-title">SSL / TLS Certificate Status</h3>
            <span class="badge badge-${ssl ? 'success' : 'warning'}">${ssl ? 'Active Certificate' : 'None / Insecure'}</span>
          </div>
          <p class="text-muted text-sm mb-4">
            Let's Encrypt Zero-Config Standalone SSL with automatic HTTPS listener mapping and HTTP/3 QUIC acceleration.
          </p>
          <div class="table-wrap mb-4">
            <table class="table">
              <tbody>
                <tr>
                  <td class="text-muted" style="width:200px;">Domains Covered</td>
                  <td class="text-mono">${escapeHTML(domain)}, www.${escapeHTML(domain)}</td>
                </tr>
                <tr>
                  <td class="text-muted">Issuance Method</td>
                  <td>Certbot Standalone Engine (Free Let's Encrypt Authority)</td>
                </tr>
                <tr>
                  <td class="text-muted">HTTP/3 & QUIC</td>
                  <td><span class="badge badge-success">Enabled</span></td>
                </tr>
                <tr>
                  <td class="text-muted">OCSP Stapling</td>
                  <td><span class="badge badge-success">Enabled</span></td>
                </tr>
              </tbody>
            </table>
          </div>
          <div class="flex gap-3">
            <button class="btn btn-primary" onclick="quickIssueSSL('${escapeHTML(domain)}')">
              🔒 Issue / Renew Free Let's Encrypt SSL
            </button>
            <button class="btn btn-secondary" onclick="navigateTo('ssl')">
              Wildcard SSL & Cloudflare DNS Settings →
            </button>
          </div>
        </div>
      </div>

      <!-- 6. SECURITY TAB PANE -->
      <div class="site-tab-pane" id="pane-security">
        <div class="site-manage-card">
          <div class="site-manage-card-header">
            <h3 class="site-manage-card-title">WordPress & OLS Hardening</h3>
          </div>
          <div class="flex flex-col gap-4">
            <div class="flex justify-between items-center" style="padding:10px 0;border-bottom:1px solid var(--border-primary);">
              <div>
                <strong>Block PHP Execution in Uploads Directory</strong>
                <p class="text-muted text-xs">Prevents backdoor PHP scripts from executing in <code>/wp-content/uploads/</code></p>
              </div>
              <span class="badge badge-success">Active in vhconf.conf</span>
            </div>
            <div class="flex justify-between items-center" style="padding:10px 0;border-bottom:1px solid var(--border-primary);">
              <div>
                <strong>Disable XML-RPC (xmlrpc.php)</strong>
                <p class="text-muted text-xs">Stops brute-force attacks and pingback DDoS floods targeting XML-RPC</p>
              </div>
              <span class="badge badge-success">Protected</span>
            </div>
            <div class="flex justify-between items-center" style="padding:10px 0;">
              <div>
                <strong>Security Response Headers</strong>
                <p class="text-muted text-xs">X-Content-Type-Options: nosniff, X-Frame-Options: SAMEORIGIN, X-XSS-Protection</p>
              </div>
              <span class="badge badge-success">Enforced</span>
            </div>
          </div>
        </div>
      </div>

      <!-- 7. SSH / FTP TAB PANE -->
      <div class="site-tab-pane" id="pane-ssh">
        <div class="site-manage-card">
          <div class="site-manage-card-header">
            <h3 class="site-manage-card-title">SFTP / SSH Access Credentials</h3>
          </div>
          <div class="table-wrap mb-4">
            <table class="table">
              <tbody>
                <tr>
                  <td class="text-muted" style="width:180px;">SFTP Protocol</td>
                  <td>SFTP (SSH File Transfer Protocol)</td>
                </tr>
                <tr>
                  <td class="text-muted">Host / Server IP</td>
                  <td class="text-mono font-bold">${escapeHTML(serverIp)}</td>
                </tr>
                <tr>
                  <td class="text-muted">Port</td>
                  <td class="text-mono">22</td>
                </tr>
                <tr>
                  <td class="text-muted">Username</td>
                  <td class="text-mono font-bold">${escapeHTML(siteUser)}</td>
                </tr>
                <tr>
                  <td class="text-muted">Default Directory</td>
                  <td class="text-mono">${escapeHTML(docRoot)}</td>
                </tr>
              </tbody>
            </table>
          </div>
          <button class="btn btn-secondary btn-sm" onclick="document.querySelector('[data-tab=\\'settings\\']').click()">
            Change User Password in Settings Tab
          </button>
        </div>
      </div>

      <!-- 8. FILE MANAGER TAB PANE -->
      <div class="site-tab-pane" id="pane-files">
        <div class="site-manage-card">
          <div class="site-manage-card-header">
            <h3 class="site-manage-card-title">Site File System</h3>
            <span class="text-mono text-xs text-muted">${escapeHTML(docRoot)}</span>
          </div>
          <p class="text-muted text-sm mb-4">
            Manage your WordPress core files, <code>wp-config.php</code>, themes, plugins, and <code>.htaccess</code> directly.
          </p>
          <div class="flex gap-3">
            <button class="btn btn-primary" onclick="openSiteFileManager('${escapeHTML(docRoot)}')">
              📂 Open Full File Manager at Site Root
            </button>
            <button class="btn btn-secondary" onclick="openSiteFileManager('/var/www/${escapeHTML(domain)}')">
              Browse /var/www/${escapeHTML(domain)}
            </button>
          </div>
        </div>
      </div>

      <!-- 9. CRON JOBS TAB PANE -->
      <div class="site-tab-pane" id="pane-cron">
        <div class="site-manage-card">
          <div class="site-manage-card-header">
            <h3 class="site-manage-card-title">WordPress Server-Side WP-Cron</h3>
            <span class="badge badge-success">Automated Daemon (Active)</span>
          </div>
          <p class="text-muted text-sm mb-4">
            High-performance server-side cron engine executes <code>wp-cron.php</code> via background daemon every 5 minutes, relieving visitor requests from running background cron tasks.
          </p>
          <div class="table-wrap mb-4">
            <table class="table">
              <tbody>
                <tr>
                  <td class="text-muted" style="width:200px;">Cron Schedule</td>
                  <td class="text-mono">*/5 * * * * (Every 5 minutes)</td>
                </tr>
                <tr>
                  <td class="text-muted">Execution Command</td>
                  <td class="text-mono text-xs">curl -s -k -L -m 10 "https://127.0.0.1/wp-cron.php?doing_wp_cron" -H "Host: ${escapeHTML(domain)}"</td>
                </tr>
                <tr>
                  <td class="text-muted">Engine</td>
                  <td>DEOLS Background Automation Daemon</td>
                </tr>
              </tbody>
            </table>
          </div>
          <div class="flex gap-3">
            <button class="btn btn-primary btn-sm" onclick="runSiteWpCron('${escapeHTML(domain)}')">
              ⏱️ Execute WP-Cron Now
            </button>
            <button class="btn btn-secondary btn-sm" onclick="navigateTo('cron')">
              Manage Server Automation Crons →
            </button>
          </div>
        </div>
      </div>

      <!-- 10. LOGS TAB PANE -->
      <div class="site-tab-pane" id="pane-logs">
        <div class="site-manage-card">
          <div class="site-manage-card-header">
            <div class="flex items-center gap-3">
              <h3 class="site-manage-card-title">Virtual Host Logs</h3>
              <div class="flex gap-1" style="background:var(--bg-secondary);padding:2px;border-radius:6px;">
                <button class="btn btn-sm btn-secondary active" id="log-type-error" onclick="switchSiteLogType('${escapeHTML(domain)}', 'error')">Error Log</button>
                <button class="btn btn-sm btn-ghost" id="log-type-access" onclick="switchSiteLogType('${escapeHTML(domain)}', 'access')">Access Log</button>
              </div>
            </div>
            <div class="flex gap-2">
              <button class="btn btn-secondary btn-sm" onclick="refreshSiteLogs('${escapeHTML(domain)}')">🔄 Refresh</button>
              <button class="btn btn-ghost btn-sm text-danger" onclick="clearSiteLogs('${escapeHTML(domain)}')">🗑️ Clear</button>
            </div>
          </div>
          <pre id="site-log-viewer" style="background:#090d16;color:#93c5fd;font-family:var(--font-mono);font-size:0.8rem;padding:16px;border-radius:8px;max-height:450px;overflow-y:auto;white-space:pre-wrap;line-height:1.45;">Loading logs…</pre>
        </div>
      </div>
    </div>
  `;

  // Attach tab switching events
  container.querySelectorAll('.site-tab-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      container.querySelectorAll('.site-tab-btn').forEach((b) => b.classList.remove('active'));
      container.querySelectorAll('.site-tab-pane').forEach((p) => p.classList.remove('active'));

      btn.classList.add('active');
      const tabName = btn.dataset.tab;
      const pane = container.querySelector(`#pane-${tabName}`);
      if (pane) pane.classList.add('active');

      if (tabName === 'limits') loadSiteLimits(domain);
      if (tabName === 'vhost') loadVhostConf(domain);
      if (tabName === 'logs') loadSiteLogs(domain, currentSiteLogType);
    });
  });
}

function syncLimitSlider(type, val) {
  const num = parseInt(val, 10);
  if (isNaN(num)) return;
  const slider = document.getElementById(`limit-slider-${type}`);
  if (slider) slider.value = num;
  if (type === 'cpu') {
    const label = document.getElementById('limit-cpu-cores-text');
    if (label) label.textContent = `${(num / 100).toFixed(1)} Core${num >= 200 ? 's' : ''}`;
  }
}

function syncLimitInput(type, val) {
  const num = parseInt(val, 10);
  if (isNaN(num)) return;
  const input = document.getElementById(`limit-input-${type}`);
  if (input) input.value = num;
  if (type === 'cpu') {
    const label = document.getElementById('limit-cpu-cores-text');
    if (label) label.textContent = `${(num / 100).toFixed(1)} Core${num >= 200 ? 's' : ''}`;
  }
}

function updateDiskGbLabel() {
  const diskMb = parseInt(document.getElementById('limit-input-disk')?.value || '5000', 10);
  const gbLabel = document.getElementById('limit-disk-gb-label');
  if (gbLabel) {
    gbLabel.textContent = `~${(diskMb / 1024).toFixed(2)} GB`;
  }
}

async function loadSiteLimits(domain) {
  const res = await api(`/sites/${encodeURIComponent(domain)}/limits`);
  if (!res || !res.success) return;

  const { limits = {}, metrics = {} } = res;

  // 1. Update sliders & inputs
  const cpuPercent = limits.cpuPercent || 100;
  const ramMb = limits.ramMb || 512;
  const ramMaxMb = limits.ramMaxMb || 768;
  const diskMb = limits.diskMb || 5000;
  const tasksMax = limits.tasksMax || 150;

  syncLimitInput('cpu', cpuPercent);
  syncLimitSlider('cpu', cpuPercent);
  syncLimitInput('ram', ramMb);
  syncLimitSlider('ram', ramMb);
  syncLimitInput('rammax', ramMaxMb);
  syncLimitSlider('rammax', ramMaxMb);

  const diskInput = document.getElementById('limit-input-disk');
  if (diskInput) diskInput.value = diskMb;
  updateDiskGbLabel();

  const tasksInput = document.getElementById('limit-input-tasks');
  if (tasksInput) tasksInput.value = tasksMax;

  // 2. Update Gauges
  const activeCpu = metrics.cpuPercent || 0;
  const cpuText = document.getElementById('metric-cpu-text');
  const cpuBar = document.getElementById('metric-cpu-bar');
  const cpuCoreLabel = document.getElementById('metric-cpu-limit-label');
  if (cpuText) cpuText.textContent = `${activeCpu.toFixed(1)}% / ${cpuPercent}%`;
  if (cpuBar) cpuBar.style.width = `${Math.min(100, Math.round((activeCpu / cpuPercent) * 100))}%`;
  if (cpuCoreLabel) cpuCoreLabel.textContent = `${(cpuPercent / 100).toFixed(1)} Core${cpuPercent >= 200 ? 's' : ''}`;

  const activeRam = metrics.ramMb || 0;
  const ramText = document.getElementById('metric-ram-text');
  const ramBar = document.getElementById('metric-ram-bar');
  const ramMaxLabel = document.getElementById('metric-ram-max-label');
  if (ramText) ramText.textContent = `${activeRam} MB / ${ramMb} MB`;
  if (ramBar) ramBar.style.width = `${Math.min(100, Math.round((activeRam / ramMb) * 100))}%`;
  if (ramMaxLabel) ramMaxLabel.textContent = `${ramMaxMb} MB`;

  const activeDisk = metrics.diskMb || 0;
  const diskText = document.getElementById('metric-disk-text');
  const diskBar = document.getElementById('metric-disk-bar');
  if (diskText) diskText.textContent = `${activeDisk} MB / ${diskMb} MB`;
  if (diskBar) diskBar.style.width = `${Math.min(100, Math.round((activeDisk / diskMb) * 100))}%`;

  const activeTasks = metrics.activeTasks || 0;
  const tasksText = document.getElementById('metric-tasks-text');
  const tasksBar = document.getElementById('metric-tasks-bar');
  if (tasksText) tasksText.textContent = `${activeTasks} / ${tasksMax}`;
  if (tasksBar) tasksBar.style.width = `${Math.min(100, Math.round((activeTasks / tasksMax) * 100))}%`;
}

async function saveSiteLimits(domain) {
  const btn = document.getElementById('btn-save-limits');
  if (btn) {
    btn.disabled = true;
    btn.innerHTML = '<span class="loading-spinner"></span> Applying…';
  }

  const cpuPercent = parseInt(document.getElementById('limit-input-cpu')?.value || '100', 10);
  const ramMb = parseInt(document.getElementById('limit-input-ram')?.value || '512', 10);
  const ramMaxMb = parseInt(document.getElementById('limit-input-rammax')?.value || '768', 10);
  const diskMb = parseInt(document.getElementById('limit-input-disk')?.value || '5000', 10);
  const tasksMax = parseInt(document.getElementById('limit-input-tasks')?.value || '150', 10);

  toast('Updating cgroups v2 slice and filesystem quotas…', 'info');

  const res = await api(`/sites/${encodeURIComponent(domain)}/limits`, {
    method: 'POST',
    body: { cpuPercent, ramMb, ramMaxMb, diskMb, tasksMax },
  });

  if (btn) {
    btn.disabled = false;
    btn.innerHTML = '💾 Save & Apply Limits Instantly';
  }

  if (res?.success) {
    toast(res.message || 'Resource limits updated successfully!', 'success');
    await loadSiteLimits(domain);
  } else {
    toast(res?.message || res?.error || 'Failed to update resource limits', 'error');
  }
}

async function saveDomainSettings(domain) {
  const rootDirectory = document.getElementById('manage-root-dir')?.value?.trim();
  const phpVersion = document.getElementById('manage-php-version')?.value;
  const btn = document.getElementById('btn-save-domain-settings');

  if (btn) btn.disabled = true;
  toast('Updating domain and OpenLiteSpeed configuration…', 'info');

  const res = await api(`/sites/${encodeURIComponent(domain)}/settings`, {
    method: 'PUT',
    body: { rootDirectory, phpVersion },
  });

  if (btn) btn.disabled = false;
  if (res?.success) {
    toast(res.message || 'Settings saved and OLS reloaded successfully!', 'success');
  } else {
    toast(res?.message || res?.error || 'Failed to save domain settings', 'error');
  }
}

async function saveSiteUserPass(domain) {
  const password = document.getElementById('manage-site-user-pass')?.value;
  if (!password || password.length < 6) {
    toast('Password must be at least 6 characters', 'warning');
    return;
  }

  toast('Updating user credentials…', 'info');
  const res = await api(`/sites/${encodeURIComponent(domain)}/user-password`, {
    method: 'POST',
    body: { password },
  });

  if (res?.success) {
    toast(res.message || 'Password updated successfully!', 'success');
    const input = document.getElementById('manage-site-user-pass');
    if (input) {
      input.value = '';
      input.type = 'password';
    }
  } else {
    toast(res?.message || res?.error || 'Failed to update user password', 'error');
  }
}

function generateNewSitePass() {
  const chars = 'abcdefghjkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789!@#$%&*';
  let pass = '';
  for (let i = 0; i < 16; i++) {
    pass += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  const input = document.getElementById('manage-site-user-pass');
  if (input) {
    input.value = pass;
    input.type = 'text';
    toast('New strong password generated! Click Update Password to save.', 'info', 5000);
  }
}

async function loadVhostConf(domain) {
  const editor = document.getElementById('vhost-editor');
  if (!editor) return;
  editor.value = 'Loading vhconf.conf…';

  const res = await api(`/sites/${encodeURIComponent(domain)}/vhost`);
  if (res?.content) {
    editor.value = res.content;
  } else {
    editor.value = '# No vhconf.conf found yet. It will be generated automatically.';
  }
}

async function saveVhostConf(domain) {
  const editor = document.getElementById('vhost-editor');
  if (!editor) return;

  toast('Saving Virtual Host configuration and signaling OpenLiteSpeed…', 'info');
  const res = await api(`/sites/${encodeURIComponent(domain)}/vhost`, {
    method: 'PUT',
    body: { content: editor.value },
  });

  if (res?.success) {
    toast(res.message || 'Virtual Host saved and OpenLiteSpeed reloaded (zero downtime)!', 'success');
  } else {
    toast(res?.message || res?.error || 'Failed to save vhconf.conf', 'error');
  }
}

async function reloadOlsFromVhost() {
  toast('Sending graceful restart signal to OpenLiteSpeed…', 'info');
  const res = await api('/ols/restart', { method: 'POST', body: { action: 'restart' } });
  if (res?.success) {
    toast('OpenLiteSpeed reloaded with zero downtime!', 'success');
  } else {
    toast(res?.message || res?.error || 'Failed to reload OpenLiteSpeed', 'error');
  }
}

async function repairSiteDatabase(domain) {
  toast(`Repairing and optimizing database for ${domain}…`, 'info');
  const res = await api(`/sites/${encodeURIComponent(domain)}/db/repair`, { method: 'POST', body: {} });
  if (res?.success) {
    toast(res.message || 'Database repaired and optimized successfully!', 'success');
  } else {
    toast(res?.message || res?.error || 'Failed to repair database', 'error');
  }
}

async function purgeSiteCache(domain) {
  toast(`Purging LiteSpeed Cache for ${domain}…`, 'info');
  const res = await api(`/sites/${encodeURIComponent(domain)}/cache/purge`, { method: 'POST', body: {} });
  if (res?.success) {
    toast(res.message || 'LiteSpeed cache purged successfully!', 'success');
  } else {
    toast(res?.message || res?.error || 'Failed to purge cache', 'error');
  }
}

async function runSiteWpCron(domain) {
  toast(`Dispatching WordPress WP-Cron for ${domain}…`, 'info');
  const res = await api(`/sites/${encodeURIComponent(domain)}/wp-cron`, { method: 'POST', body: {} });
  if (res?.success) {
    toast(res.message || 'WP-Cron executed successfully!', 'success');
  } else {
    toast(res?.message || res?.error || 'Failed to execute WP-Cron', 'error');
  }
}

function openSiteFileManager(path) {
  navigateTo('files', { path });
}

async function switchSiteLogType(domain, type) {
  currentSiteLogType = type;
  const btnErr = document.getElementById('log-type-error');
  const btnAcc = document.getElementById('log-type-access');
  if (btnErr && btnAcc) {
    if (type === 'error') {
      btnErr.className = 'btn btn-sm btn-secondary active';
      btnAcc.className = 'btn btn-sm btn-ghost';
    } else {
      btnErr.className = 'btn btn-sm btn-ghost';
      btnAcc.className = 'btn btn-sm btn-secondary active';
    }
  }
  await loadSiteLogs(domain, type);
}

async function loadSiteLogs(domain, type = 'error') {
  const viewer = document.getElementById('site-log-viewer');
  if (!viewer) return;
  viewer.textContent = `Loading ${type} logs for ${domain}…`;

  const res = await api(`/sites/${encodeURIComponent(domain)}/logs?type=${type}`);
  if (res?.lines) {
    viewer.textContent = res.lines;
    viewer.scrollTop = viewer.scrollHeight;
  } else {
    viewer.textContent = `No ${type} logs recorded yet.`;
  }
}

async function refreshSiteLogs(domain) {
  await loadSiteLogs(domain, currentSiteLogType);
  toast('Logs refreshed', 'info', 2000);
}

async function clearSiteLogs(domain) {
  if (!confirm(`Clear all logs for ${domain}?`)) return;
  const res = await api(`/sites/${encodeURIComponent(domain)}/logs/clear`, {
    method: 'POST',
    body: { type: currentSiteLogType },
  });
  if (res?.success) {
    toast('Logs cleared successfully', 'success');
    await loadSiteLogs(domain, currentSiteLogType);
  } else {
    toast(res?.message || res?.error || 'Failed to clear logs', 'error');
  }
}

async function quickIssueSSL(domain) {
  toast(`Initiating Free Let's Encrypt SSL issuance for ${domain}…`, 'info', 4000);
  const res = await api('/ssl/request', {
    method: 'POST',
    body: { domain, mode: 'standalone', overwrite: true },
  });
  if (res?.success) {
    toast(res.message || 'SSL Certificate successfully issued & applied!', 'success', 6000);
    renderSiteManage(document.getElementById('content-body'), domain);
  } else {
    toast(res?.message || res?.error || 'Failed to issue SSL', 'error', 6000);
  }
}

// ─── Databases Page ─────────────────────────────────────────

async function renderDatabases(container) {
  container.innerHTML = `
    <div class="flex justify-between items-center mb-6">
      <p class="text-muted">Manage MariaDB databases, users, permissions, and passwords</p>
      <div class="flex gap-3">
        <button class="btn btn-secondary" onclick="showNewDbUserModal()">+ New DB User</button>
        <button class="btn btn-primary" onclick="showNewDbModal()">+ New Database</button>
      </div>
    </div>
    <div class="card mb-6">
      <div class="card-header"><h2 class="card-title">Databases</h2></div>
      <div class="card-body" id="db-list"><p class="text-muted">Loading…</p></div>
    </div>
    <div class="card">
      <div class="card-header"><h2 class="card-title">Database Users</h2></div>
      <div class="card-body" id="db-users-list"><p class="text-muted">Loading…</p></div>
    </div>
  `;

  const [dbs, users] = await Promise.all([api('/databases'), api('/databases/users')]);

  if (dbs?.databases) {
    document.getElementById('db-list').innerHTML = dbs.databases.length ? `
      <div class="table-wrap"><table class="table">
        <thead><tr><th>Database Name</th><th>Charset</th><th>Collation</th><th>Actions</th></tr></thead>
        <tbody>${dbs.databases.map((d) => `
          <tr>
            <td class="text-mono font-bold">${escapeHTML(d.name)}</td>
            <td>${escapeHTML(d.charset)}</td>
            <td class="text-sm text-muted">${escapeHTML(d.collation)}</td>
            <td>
              <div class="flex gap-2">
                <button class="btn btn-sm btn-secondary" onclick="repairDatabase('${escapeHTML(d.name)}')">🔧 Repair</button>
                <button class="btn btn-sm btn-danger" onclick="dropDb('${escapeHTML(d.name)}')">Drop</button>
              </div>
            </td>
          </tr>
        `).join('')}</tbody>
      </table></div>
    ` : '<p class="text-muted">No databases found</p>';
  } else {
    document.getElementById('db-list').innerHTML = `<p class="text-danger">Failed to load databases: ${escapeHTML(dbs?.error || 'Unknown error')}</p>`;
  }

  if (users?.users) {
    document.getElementById('db-users-list').innerHTML = users.users.length ? `
      <div class="table-wrap"><table class="table">
        <thead><tr><th>User</th><th>Host</th><th>Actions</th></tr></thead>
        <tbody>${users.users.map((u) => `
          <tr>
            <td class="text-mono font-bold">${escapeHTML(u.user)}</td>
            <td class="text-mono text-sm">${escapeHTML(u.host)}</td>
            <td>
              <div class="flex gap-2">
                <button class="btn btn-sm btn-secondary" onclick="showChangeDbUserPassModal('${escapeHTML(u.user)}','${escapeHTML(u.host)}')">🔑 Password</button>
                <button class="btn btn-sm btn-danger" onclick="dropDbUser('${escapeHTML(u.user)}','${escapeHTML(u.host)}')">Drop</button>
              </div>
            </td>
          </tr>
        `).join('')}</tbody>
      </table></div>
    ` : '<p class="text-muted">No users found</p>';
  } else {
    document.getElementById('db-users-list').innerHTML = `<p class="text-danger">Failed to load users: ${escapeHTML(users?.error || 'Unknown error')}</p>`;
  }
}

function showNewDbModal() {
  showModal('Create Database & User', `
    <div class="flex flex-col gap-4">
      <div class="form-group">
        <label>Database Name</label>
        <input type="text" id="new-db-name" placeholder="wp_mysite" required>
      </div>

      <div class="flex items-center gap-2" style="margin-top: 4px;">
        <input type="checkbox" id="new-db-with-user" checked onchange="document.getElementById('new-db-user-fields').style.display = this.checked ? 'flex' : 'none';">
        <label for="new-db-with-user" style="margin:0; font-size:13px; font-weight:600; cursor:pointer;">Create Database User & Grant Full Privileges (Recommended for WP)</label>
      </div>

      <div id="new-db-user-fields" class="flex flex-col gap-3" style="background:rgba(0,0,0,0.2); padding:12px; border-radius:8px; border:1px solid var(--border-color,#334155);">
        <div class="form-group">
          <label>Database Username</label>
          <input type="text" id="new-db-user" placeholder="u_mysite">
        </div>
        <div class="form-group">
          <label>Database Password</label>
          <div style="display:flex; gap:8px;">
            <input type="text" id="new-db-pass" placeholder="Password" style="flex:1;">
            <button type="button" class="btn btn-secondary btn-sm" id="btn-gen-db-full-pass">Generate</button>
          </div>
        </div>
        <div class="form-group">
          <label>Auto-Sync to WordPress Site (Optional)</label>
          <input type="text" id="new-db-sync-domain" placeholder="example.com">
          <span class="text-xs text-muted mt-1">If entered, automatically updates DB_NAME, DB_USER, and DB_PASSWORD in this site's wp-config.php!</span>
        </div>
      </div>
    </div>
  `, `
    <button class="btn btn-secondary" onclick="closeModal()">Cancel</button>
    <button class="btn btn-primary" id="btn-submit-new-db">Create Database</button>
  `);

  document.getElementById('btn-gen-db-full-pass')?.addEventListener('click', () => {
    const chars = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let pass = '';
    for (let i = 0; i < 20; i++) pass += chars.charAt(Math.floor(Math.random() * chars.length));
    document.getElementById('new-db-pass').value = pass;
  });

  // Auto-fill username when typing db name
  document.getElementById('new-db-name')?.addEventListener('input', (e) => {
    const userField = document.getElementById('new-db-user');
    if (userField && (!userField.value || userField.value.startsWith('u_'))) {
      userField.value = 'u_' + e.target.value.replace(/^wp_/, '').substring(0, 14);
    }
  });

  document.getElementById('btn-submit-new-db')?.addEventListener('click', async () => {
    const dbName = document.getElementById('new-db-name').value.trim();
    const withUser = document.getElementById('new-db-with-user').checked;

    if (!dbName) {
      toast('Please enter a database name', 'warning');
      return;
    }

    if (withUser) {
      const dbUser = document.getElementById('new-db-user').value.trim() || ('u_' + dbName.substring(0, 14));
      const password = document.getElementById('new-db-pass').value.trim();
      const syncDomain = document.getElementById('new-db-sync-domain').value.trim();

      const res = await api('/databases/create-with-user', {
        method: 'POST',
        body: { dbName, dbUser, password, syncDomain: syncDomain || undefined },
      });

      if (res?.success) {
        toast(`Database '${res.database}' and user '${res.username}' created!`, 'success');
        closeModal();
        navigateTo('databases');
      } else {
        toast(res?.error || 'Failed to create database', 'error');
      }
    } else {
      const res = await api('/databases', { method: 'POST', body: { name: dbName } });
      if (res?.success) {
        toast('Database created successfully!', 'success');
        closeModal();
        navigateTo('databases');
      } else {
        toast(res?.error || 'Failed to create database', 'error');
      }
    }
  });
}

function showNewDbUserModal() {
  showModal('Create Database User', `
    <div class="flex flex-col gap-4">
      <div class="form-group">
        <label>Username</label>
        <input type="text" id="new-db-user-name" placeholder="db_user" required>
      </div>
      <div class="form-group">
        <label>Password</label>
        <div style="display:flex; gap:8px;">
          <input type="text" id="new-db-user-pass" placeholder="Password" style="flex:1;">
          <button type="button" class="btn btn-secondary btn-sm" id="btn-gen-db-u-pass">Generate</button>
        </div>
      </div>
    </div>
  `, `
    <button class="btn btn-secondary" onclick="closeModal()">Cancel</button>
    <button class="btn btn-primary" onclick="createDbUser()">Create User</button>
  `);

  document.getElementById('btn-gen-db-u-pass')?.addEventListener('click', () => {
    const chars = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let pass = '';
    for (let i = 0; i < 18; i++) pass += chars.charAt(Math.floor(Math.random() * chars.length));
    document.getElementById('new-db-user-pass').value = pass;
  });
}

async function createDbUser() {
  const username = document.getElementById('new-db-user-name').value.trim();
  const password = document.getElementById('new-db-user-pass').value.trim();
  if (!username || !password) {
    toast('Username and password are required', 'warning');
    return;
  }

  const result = await api('/databases/users', { method: 'POST', body: { username, password } });
  if (result?.success) {
    toast(`Database user '${username}' created!`, 'success');
    closeModal();
    navigateTo('databases');
  } else toast(result?.error || 'Failed to create user', 'error');
}

function showChangeDbUserPassModal(username, host = 'localhost') {
  showModal(`Change Password for '${escapeHTML(username)}'`, `
    <div class="flex flex-col gap-4">
      <div class="form-group">
        <label>New Password</label>
        <div style="display:flex; gap:8px;">
          <input type="text" id="change-db-pass-val" placeholder="Enter new password" style="flex:1;">
          <button type="button" class="btn btn-secondary btn-sm" id="btn-gen-chg-pass">Generate</button>
        </div>
      </div>
      <div class="form-group">
        <label>Sync Site wp-config.php (Optional)</label>
        <input type="text" id="change-db-pass-domain" placeholder="example.com (Leave blank if not a WP site)">
        <p class="text-muted text-xs mt-1">If specified, automatically updates DB_PASSWORD in this site's wp-config.php</p>
      </div>
    </div>
  `, `
    <button class="btn btn-secondary" onclick="closeModal()">Cancel</button>
    <button class="btn btn-primary" id="btn-save-db-pass">Save New Password</button>
  `);

  document.getElementById('btn-gen-chg-pass')?.addEventListener('click', () => {
    const chars = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let pass = '';
    for (let i = 0; i < 20; i++) pass += chars.charAt(Math.floor(Math.random() * chars.length));
    document.getElementById('change-db-pass-val').value = pass;
  });

  document.getElementById('btn-save-db-pass')?.addEventListener('click', async () => {
    const password = document.getElementById('change-db-pass-val').value.trim();
    const syncDomain = document.getElementById('change-db-pass-domain').value.trim();
    if (!password) {
      toast('Please enter a password', 'warning');
      return;
    }

    const res = await api(`/databases/users/${encodeURIComponent(username)}/password`, {
      method: 'PUT',
      body: { password, host, syncDomain: syncDomain || undefined },
    });

    if (res?.success) {
      toast(`Password updated for ${username}!`, 'success');
      closeModal();
      navigateTo('databases');
    } else toast(res?.error || 'Failed to update password', 'error');
  });
}

async function repairDatabase(name) {
  toast(`Repairing & optimizing database '${name}'…`, 'info', 5000);
  const result = await api(`/databases/${encodeURIComponent(name)}/repair`, { method: 'POST' });
  if (result?.success) {
    toast(`Database '${name}' repaired and optimized cleanly!`, 'success', 6000);
  } else {
    toast(result?.error || 'Database repair failed', 'error');
  }
}

async function fixSiteDbConnection(domain) {
  if (!confirm(`Fix and resync database connection for '${domain}'? This will repair MariaDB user privileges, update wp-config.php, populate missing tables, and optimize database.`)) return;

  toast(`Fixing & resynced database connection for ${domain}…`, 'info', 8000);
  const result = await api(`/sites/${encodeURIComponent(domain)}/db/fix-connection`, { method: 'POST' });
  if (result?.success) {
    showModal('⚡ Database Connection Repaired', `
      <div style="display:flex; flex-direction:column; gap:12px;">
        <div style="background: rgba(16, 185, 129, 0.1); border: 1px solid rgba(16, 185, 129, 0.3); color: #34d399; border-radius:8px; padding:12px; font-size:13px;">
          Database connection repaired! MariaDB user and wp-config.php are 100% in sync.
        </div>
        <table style="width:100%; border-collapse:collapse; font-size:13px; color:var(--text-primary);">
          <tr style="border-bottom:1px solid var(--border-color,#334155);"><td style="padding:6px 0; font-weight:600; width:140px;">Database Name:</td><td><code style="background:rgba(0,0,0,0.3); padding:2px 6px; border-radius:4px; font-family:monospace;">${escapeHTML(result.dbName)}</code></td></tr>
          <tr style="border-bottom:1px solid var(--border-color,#334155);"><td style="padding:6px 0; font-weight:600;">Database User:</td><td><code style="background:rgba(0,0,0,0.3); padding:2px 6px; border-radius:4px; font-family:monospace;">${escapeHTML(result.dbUser)}</code></td></tr>
          <tr><td style="padding:6px 0; font-weight:600;">Synced DB Pass:</td><td><code style="background:rgba(0,0,0,0.3); padding:2px 6px; border-radius:4px; font-family:monospace; color:#a78bfa;">${escapeHTML(result.newPassword)}</code></td></tr>
        </table>
      </div>
    `, `
      <button class="btn btn-primary" onclick="closeModal()">Done</button>
    `);
  } else {
    toast(result?.error || 'Failed to repair DB connection', 'error');
  }
}

async function dropDb(name) {
  if (!confirm(`Drop database "${name}"?`)) return;
  const result = await api(`/databases/${name}`, { method: 'DELETE' });
  if (result?.success) { toast('Database dropped', 'success'); navigateTo('databases'); }
  else toast(result?.error || 'Failed', 'error');
}

async function dropDbUser(user, host) {
  if (!confirm(`Drop user "${user}"@"${host}"?`)) return;
  const result = await api(`/databases/users/${user}?host=${host}`, { method: 'DELETE' });
  if (result?.success) { toast('User dropped', 'success'); navigateTo('databases'); }
  else toast(result?.error || 'Failed', 'error');
}

// ─── SSL Page ───────────────────────────────────────────────

async function renderSSL(container) {
  container.innerHTML = `
    <div class="flex justify-between items-center mb-6">
      <div>
        <h2 style="font-size: 1.25rem; font-weight: 700; margin-bottom: 4px;">SSL / TLS Certificates & Encryption</h2>
        <p class="text-muted" style="font-size: 0.875rem;">Manage Let's Encrypt Standard SSL (HTTP-01) and Cloudflare Wildcard SSL (*.domain.com)</p>
      </div>
      <div class="flex gap-3">
        <a href="https://dnschecker.org/" target="_blank" rel="noopener noreferrer" class="btn btn-secondary flex items-center gap-1" style="text-decoration:none; font-size: 13px;" title="Check global DNS propagation">
          <svg viewBox="0 0 20 20" fill="currentColor" style="width:14px;height:14px;"><path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM4.332 8.027a6.012 6.012 0 011.912-2.706C6.512 5.73 6.974 6 7.5 6A1.5 1.5 0 019 7.5V8a2 2 0 004 0 2 2 0 011.523-1.943A5.977 5.977 0 0116 10c0 .34-.028.675-.083 1H15a2 2 0 00-2 2v2.197A5.973 5.973 0 0110 16v-.2a2 2 0 00-1.664-1.973l-.403-.067A2 2 0 016 11.8v-.8a2 2 0 00-.916-1.688l-.752-.485z"/></svg>
          <span>DNSChecker.org</span>
        </a>
        <button class="btn btn-primary" onclick="showIssueSSLModal()">+ Issue SSL</button>
        <button class="btn btn-secondary" onclick="renewAllSSL()">Renew All</button>
      </div>
    </div>

    <!-- Quick SSL Stats Grid -->
    <div class="stats-grid mb-6" id="ssl-stats-grid">
      <div class="stat-card">
        <div class="stat-card-header"><span class="stat-card-label">Total Sites</span></div>
        <div class="stat-card-value" id="ssl-total-sites">—</div>
      </div>
      <div class="stat-card">
        <div class="stat-card-header"><span class="stat-card-label">Secured Sites (HTTPS)</span></div>
        <div class="stat-card-value text-success" id="ssl-secured-sites">—</div>
      </div>
      <div class="stat-card">
        <div class="stat-card-header"><span class="stat-card-label">Wildcard SSLs (*.)</span></div>
        <div class="stat-card-value text-primary" id="ssl-wildcard-sites">—</div>
      </div>
    </div>

    <!-- Domain SSL Status Overview Table -->
    <div class="card mb-6">
      <div class="card-header">
        <h2 class="card-title">🌐 Sites & SSL Encryption Status</h2>
      </div>
      <div class="card-body" id="site-ssl-table-wrap">
        <p class="text-muted">Loading sites SSL status…</p>
      </div>
    </div>

    <!-- Raw Let's Encrypt Certificate Vault -->
    <div class="card">
      <div class="card-header"><h2 class="card-title">📜 Let's Encrypt Certificate Vault</h2></div>
      <div class="card-body" id="ssl-list"><p class="text-muted">Loading certificate files…</p></div>
    </div>
  `;

  const data = await api('/ssl/overview');
  const siteWrap = document.getElementById('site-ssl-table-wrap');
  const certWrap = document.getElementById('ssl-list');

  if (data) {
    document.getElementById('ssl-total-sites').textContent = data.totalSites ?? '0';
    document.getElementById('ssl-secured-sites').textContent = data.securedSites ?? '0';
    document.getElementById('ssl-wildcard-sites').textContent = data.wildcardSites ?? '0';

    // 1. Render Domain SSL Status Table
    if (data.sites?.length) {
      siteWrap.innerHTML = `
        <div class="table-wrap"><table class="table">
          <thead>
            <tr>
              <th>Site Domain</th>
              <th>SSL Status</th>
              <th>SSL Type</th>
              <th>Hostnames Covered</th>
              <th>Expiry & Validity</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>${data.sites.map((s) => {
            const isInstalled = s.ssl;
            const isWildcard = s.sslType === 'wildcard';

            const statusBadge = isInstalled
              ? `<span class="badge badge-success">● Active & Secure</span>`
              : `<span class="badge badge-danger">○ Not Installed</span>`;

            const typeBadge = isInstalled
              ? (isWildcard
                  ? `<span class="badge badge-primary" style="background:rgba(139,92,246,0.15); color:#a78bfa; border:1px solid rgba(139,92,246,0.3);">🌟 Wildcard SSL (*.)</span>`
                  : `<span class="badge badge-info" style="background:rgba(56,189,248,0.15); color:#38bdf8; border:1px solid rgba(56,189,248,0.3);">🔒 Standard SSL</span>`)
              : `<span class="text-muted text-xs">None (HTTP only)</span>`;

            return `
              <tr>
                <td><strong class="text-mono">${escapeHTML(s.domain)}</strong></td>
                <td>${statusBadge}</td>
                <td>${typeBadge}</td>
                <td class="text-sm text-mono" style="max-width:240px; overflow:hidden; text-overflow:ellipsis;">${escapeHTML(s.domainsCovered)}</td>
                <td class="text-sm">${escapeHTML(s.expiry)}</td>
                <td>
                  <div class="flex gap-2" style="flex-wrap:wrap">
                    ${!isInstalled ? `
                      <button class="btn btn-sm btn-primary" onclick="showIssueSSLModal('${escapeHTML(s.domain)}', 'standard')">🔒 Issue Standard</button>
                      <button class="btn btn-sm btn-secondary" onclick="showIssueSSLModal('${escapeHTML(s.domain)}', 'wildcard')">🌟 Issue Wildcard</button>
                    ` : `
                      ${!isWildcard ? `
                        <button class="btn btn-sm btn-secondary" onclick="showIssueSSLModal('${escapeHTML(s.domain)}', 'wildcard')" title="Upgrade to wildcard certificate">🌟 Upgrade Wildcard</button>
                      ` : `
                        <button class="btn btn-sm btn-secondary" onclick="showIssueSSLModal('${escapeHTML(s.domain)}', 'wildcard')">🔄 Reissue</button>
                      `}
                      <button class="btn btn-sm btn-danger" onclick="revokeSSL('${escapeHTML(s.domain)}')">Revoke</button>
                    `}
                  </div>
                </td>
              </tr>
            `;
          }).join('')}</tbody>
        </table></div>
      `;
    } else {
      siteWrap.innerHTML = '<p class="text-muted">No sites found. Add a site in the Sites menu first.</p>';
    }

    // 2. Render Certbot Certificate Vault Table
    if (data.certificates?.length) {
      certWrap.innerHTML = `
        <div class="table-wrap"><table class="table">
          <thead><tr><th>Cert Name</th><th>Covered Domains</th><th>Expiry Date</th><th>Actions</th></tr></thead>
          <tbody>${data.certificates.map((c) => `
            <tr>
              <td><strong class="text-mono">${escapeHTML(c.name || '—')}</strong></td>
              <td class="text-sm text-mono">${escapeHTML(c.domains || '—')}</td>
              <td class="text-sm">${escapeHTML(c.expiry || '—')}</td>
              <td><button class="btn btn-sm btn-danger" onclick="revokeSSL('${escapeHTML(c.name)}')">Revoke</button></td>
            </tr>
          `).join('')}</tbody>
        </table></div>
      `;
    } else {
      certWrap.innerHTML = '<p class="text-muted">No Let\'s Encrypt certificates stored in vault.</p>';
    }
  } else {
    siteWrap.innerHTML = '<p class="text-muted">Could not load SSL overview.</p>';
  }
}

let currentSSLTab = 'wildcard';

function showIssueSSLModal(prefillDomain = '', prefillTab = 'wildcard') {
  currentSSLTab = prefillTab || 'wildcard';
  showModal('Issue SSL Certificate', `
    <div class="tabs mb-4 flex gap-2" style="border-bottom: 1px solid var(--border-color, rgba(255,255,255,0.1)); padding-bottom: 8px;">
      <button class="btn btn-sm ${currentSSLTab === 'wildcard' ? 'btn-primary' : 'btn-secondary'}" id="ssl-tab-wildcard-btn" onclick="switchSSLTab('wildcard')">Wildcard SSL (Cloudflare DNS)</button>
      <button class="btn btn-sm ${currentSSLTab === 'standard' ? 'btn-primary' : 'btn-secondary'}" id="ssl-tab-standard-btn" onclick="switchSSLTab('standard')">Standard SSL (HTTP-01)</button>
    </div>

    <!-- Wildcard SSL Form -->
    <div id="ssl-wildcard-panel" class="flex flex-col gap-4" style="display:${currentSSLTab === 'wildcard' ? 'flex' : 'none'};">
      <div class="form-group">
        <label>Base Domain</label>
        <input type="text" id="ssl-wildcard-domain" placeholder="example.com" value="${escapeHTML(prefillDomain)}" required>
        <span class="text-xs text-muted" style="margin-top: 4px; display: block;">Certificate covers both <code>${escapeHTML(prefillDomain || 'example.com')}</code> and <code>*.${escapeHTML(prefillDomain || 'example.com')}</code></span>
      </div>

      <div class="form-group">
        <label>Let's Encrypt Email</label>
        <input type="email" id="ssl-wildcard-email" placeholder="admin@example.com">
      </div>

      <div class="form-group">
        <label>Cloudflare Authentication Method</label>
        <select id="ssl-cf-auth-type" onchange="toggleCFAuthFields()" style="width:100%; padding: 8px; border-radius: 6px; background: rgba(0,0,0,0.3); color: inherit; border: 1px solid var(--border-color, rgba(255,255,255,0.15));">
          <option value="global">Cloudflare Account Email + Global API Key</option>
          <option value="token">Cloudflare Scoped API Token (Bearer)</option>
        </select>
      </div>

      <div class="form-group" id="cf-email-group">
        <label>Cloudflare Account Email</label>
        <input type="email" id="ssl-cf-email" placeholder="user@example.com">
      </div>

      <div class="form-group">
        <label id="cf-key-label">Cloudflare Global API Key</label>
        <input type="password" id="ssl-cf-key" placeholder="••••••••••••••••••••••••" required autocomplete="off">
        <span class="text-xs text-muted" id="cf-key-hint" style="margin-top: 4px; display: block;">Found in Cloudflare &rarr; My Profile &rarr; API Tokens &rarr; Global API Key</span>
      </div>

      <!-- Cloudflare Test Connection Result Banner -->
      <div id="cf-test-result" style="display:none; padding: 10px 14px; border-radius: 6px; font-size: 13px; line-height: 1.4;"></div>

      <div style="background: rgba(99,102,241,0.08); border: 1px solid rgba(99,102,241,0.25); border-radius: 6px; padding: 12px;">
        <p style="font-size: 12px; color: var(--text-secondary, #94a3b8); margin: 0; line-height: 1.4;">
          ⚡ <strong>OLS Wildcard Mapping:</strong> DEOLS will automatically configure the OpenLiteSpeed virtual host SSL listener and add <code>*.domain.com</code> to the server's listener mapping with zero downtime.
        </p>
      </div>
    </div>

    <!-- Standard SSL Form -->
    <div id="ssl-standard-panel" class="flex flex-col gap-4" style="display:${currentSSLTab === 'standard' ? 'flex' : 'none'}">
      <div class="form-group">
        <label>Domain</label>
        <input type="text" id="ssl-domain" placeholder="example.com" value="${escapeHTML(prefillDomain)}" required>
      </div>
      <div class="form-group">
        <label>Email (for Let's Encrypt)</label>
        <input type="email" id="ssl-email" placeholder="admin@${escapeHTML(prefillDomain || 'example.com')}">
      </div>
      <div class="flex gap-4 items-center">
        <label class="toggle">
          <input type="checkbox" id="ssl-www" checked>
          <span class="toggle-slider"></span>
        </label>
        <span class="text-sm">Include www subdomain (if DNS points to this server)</span>
      </div>
    </div>

    <!-- Fallback Error Alert Container (DNSChecker integration) -->
    <div id="ssl-fallback-alert" style="display:none;"></div>
  `, `
    <button class="btn btn-secondary" onclick="closeModal()">Cancel</button>
    <button class="btn btn-secondary" id="btn-test-cf" onclick="testCloudflareConnection()" style="display:${currentSSLTab === 'wildcard' ? 'inline-flex' : 'none'};">
      <svg viewBox="0 0 20 20" fill="currentColor" style="width:14px;height:14px;display:inline-block;vertical-align:-2px;"><path fill-rule="evenodd" d="M11.3 1.046A1 1 0 0112 2v5h4a1 1 0 01.82 1.573l-7 10A1 1 0 018 18v-5H4a1 1 0 01-.82-1.573l7-10a1 1 0 011.12-.38z"/></svg>
      Test Connection
    </button>
    <button class="btn btn-primary" id="btn-issue-ssl" onclick="handleIssueSSLSubmit()">${currentSSLTab === 'wildcard' ? 'Install Wildcard SSL' : 'Issue Standard Certificate'}</button>
  `);
}

function switchSSLTab(tab) {
  currentSSLTab = tab;
  const wildcardPanel = document.getElementById('ssl-wildcard-panel');
  const standardPanel = document.getElementById('ssl-standard-panel');
  const wildcardBtn = document.getElementById('ssl-tab-wildcard-btn');
  const standardBtn = document.getElementById('ssl-tab-standard-btn');
  const testBtn = document.getElementById('btn-test-cf');
  const issueBtn = document.getElementById('btn-issue-ssl');
  const fallbackAlert = document.getElementById('ssl-fallback-alert');
  if (fallbackAlert) fallbackAlert.style.display = 'none';

  if (tab === 'wildcard') {
    wildcardPanel.style.display = 'flex';
    standardPanel.style.display = 'none';
    wildcardBtn.className = 'btn btn-sm btn-primary';
    standardBtn.className = 'btn btn-sm btn-secondary';
    if (testBtn) testBtn.style.display = 'inline-flex';
    if (issueBtn) issueBtn.textContent = 'Install Wildcard SSL';
  } else {
    wildcardPanel.style.display = 'none';
    standardPanel.style.display = 'flex';
    wildcardBtn.className = 'btn btn-sm btn-secondary';
    standardBtn.className = 'btn btn-sm btn-primary';
    if (testBtn) testBtn.style.display = 'none';
    if (issueBtn) issueBtn.textContent = 'Issue Standard Certificate';
  }
}

function toggleCFAuthFields() {
  const type = document.getElementById('ssl-cf-auth-type').value;
  const emailGroup = document.getElementById('cf-email-group');
  const keyLabel = document.getElementById('cf-key-label');
  const keyHint = document.getElementById('cf-key-hint');
  const keyInput = document.getElementById('ssl-cf-key');

  if (type === 'token') {
    emailGroup.style.display = 'none';
    keyLabel.textContent = 'Cloudflare API Token';
    keyHint.textContent = 'Requires Zone:DNS:Edit permissions. Found in My Profile &rarr; API Tokens.';
    keyInput.placeholder = 'e.g. Abc123Xyz...';
  } else {
    emailGroup.style.display = 'block';
    keyLabel.textContent = 'Cloudflare Global API Key';
    keyHint.textContent = 'Found in Cloudflare &rarr; My Profile &rarr; API Tokens &rarr; Global API Key';
    keyInput.placeholder = '••••••••••••••••••••••••';
  }
}

function renderSSLErrorFallback(domain, errData) {
  const alertEl = document.getElementById('ssl-fallback-alert');
  if (!alertEl) return;

  const serverIp = errData?.serverIp || 'This Server IP';
  const resolvedIps = errData?.resolvedIps?.length ? errData.resolvedIps.join(', ') : 'Not resolved / None';
  const dnsCheckerUrl = errData?.dnsCheckerUrl || `https://dnschecker.org/#A/${encodeURIComponent(domain)}`;
  const isDnsMismatch = errData?.dnsMismatch === true;

  alertEl.style.display = 'block';
  if (isDnsMismatch) {
    alertEl.innerHTML = `
      <div style="background: rgba(239, 68, 68, 0.12); border: 1px solid rgba(239, 68, 68, 0.35); border-radius: 8px; padding: 14px; margin-top: 14px; font-size: 13px;">
        <div style="color: #f87171; font-weight: 700; margin-bottom: 6px; display: flex; align-items: center; gap: 6px;">
          <svg viewBox="0 0 20 20" fill="currentColor" style="width: 16px; height: 16px; flex-shrink:0;"><path fill-rule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z"/></svg>
          <span>SSL Verification Failed: Domain Not Pointing to This Server</span>
        </div>
        <p style="color: var(--text-secondary, #94a3b8); margin-bottom: 10px; line-height: 1.4;">
          Let's Encrypt could not verify ownership of <strong>${escapeHTML(domain)}</strong>. Your domain may not be pointing to this server IP yet, or DNS has not propagated worldwide.
        </p>
        <div style="background: rgba(0,0,0,0.35); border-radius: 6px; padding: 8px 12px; margin-bottom: 12px; font-family: var(--font-mono, monospace); font-size: 12px; line-height: 1.6;">
          <div>• Required Server IP: <strong style="color: #34d399;">${escapeHTML(serverIp)}</strong></div>
          <div>• Domain Currently Resolves To: <strong style="color: #f87171;">${escapeHTML(resolvedIps)}</strong></div>
        </div>
        <div style="display: flex; gap: 8px; align-items: center; flex-wrap: wrap;">
          <a href="${dnsCheckerUrl}" target="_blank" rel="noopener noreferrer" class="btn btn-sm" style="background: #0284c7; color: #fff; text-decoration: none; padding: 6px 14px; font-size: 12px; font-weight: 600; border-radius: 6px; display: inline-flex; align-items: center; gap: 6px;">
            <span>🌐 Check DNS Worldwide on DNSChecker.org</span>
            <svg viewBox="0 0 20 20" fill="currentColor" style="width: 12px; height: 12px;"><path d="M11 3a1 1 0 100 2h2.586l-6.293 6.293a1 1 0 101.414 1.414L15 6.414V9a1 1 0 102 0V4a1 1 0 00-1-1h-5z"/><path d="M5 5a2 2 0 00-2 2v8a2 2 0 002 2h8a2 2 0 002-2v-3a1 1 0 10-2 0v3H5V7h3a1 1 0 000-2H5z"/></svg>
          </a>
        </div>
        <p style="font-size: 11px; color: var(--text-muted, #64748b); margin-top: 10px; margin-bottom: 0;">
          💡 <strong>Fix:</strong> Please update your DNS A-Record to point to <code>${escapeHTML(serverIp)}</code>, wait 5 minutes, verify propagation on DNSChecker.org, and click retry.
        </p>
      </div>
    `;
  } else {
    alertEl.innerHTML = `
      <div style="background: rgba(245, 158, 11, 0.12); border: 1px solid rgba(245, 158, 11, 0.35); border-radius: 8px; padding: 14px; margin-top: 14px; font-size: 13px;">
        <div style="color: #f59e0b; font-weight: 700; margin-bottom: 6px; display: flex; align-items: center; gap: 6px;">
          <svg viewBox="0 0 20 20" fill="currentColor" style="width: 16px; height: 16px; flex-shrink:0;"><path fill-rule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z"/></svg>
          <span>SSL Issuance Failed: Verification / Firewall Block</span>
        </div>
        <p style="color: var(--text-secondary, #94a3b8); margin-bottom: 10px; line-height: 1.4;">
          Your domain <strong>${escapeHTML(domain)}</strong> correctly resolves to this server IP (<code>${escapeHTML(serverIp)}</code>), but the Let's Encrypt validation server could not verify port 80.
        </p>
        ${errData?.details ? `
          <div style="background: rgba(0,0,0,0.35); border-radius: 6px; padding: 8px 12px; margin-bottom: 12px; font-family: var(--font-mono, monospace); font-size: 11px; max-height: 120px; overflow-y: auto; color: #fca5a5;">
            ${escapeHTML(errData.details)}
          </div>
        ` : ''}
        <p style="font-size: 11px; color: var(--text-muted, #64748b); margin-top: 6px; margin-bottom: 0;">
          💡 <strong>Fix:</strong> Ensure port 80 and 443 are open in your VPS firewall / security group and not blocked by external rules.
        </p>
      </div>
    `;
  }
}

async function testCloudflareConnection() {
  const domain = document.getElementById('ssl-wildcard-domain')?.value?.trim();
  const authType = document.getElementById('ssl-cf-auth-type')?.value;
  const email = document.getElementById('ssl-cf-email')?.value?.trim();
  const keyOrToken = document.getElementById('ssl-cf-key')?.value?.trim();
  const resultBanner = document.getElementById('cf-test-result');
  const testBtn = document.getElementById('btn-test-cf');

  if (!domain) {
    toast('Please enter a domain to test', 'warning');
    return;
  }

  if (authType === 'global' && (!email || !keyOrToken)) {
    toast('Please enter both Cloudflare Account Email and Global API Key', 'warning');
    return;
  }

  if (authType === 'token' && !keyOrToken) {
    toast('Please enter your Cloudflare API Token', 'warning');
    return;
  }

  resultBanner.style.display = 'block';
  resultBanner.style.background = 'rgba(99,102,241,0.15)';
  resultBanner.style.border = '1px solid rgba(99,102,241,0.3)';
  resultBanner.style.color = '#38bdf8';
  resultBanner.innerHTML = '<span>Checking Cloudflare API connection and DNS zone…</span>';

  testBtn.disabled = true;
  testBtn.innerHTML = '<span>Verifying…</span>';

  const payload = {
    domain,
    email: authType === 'global' ? email : undefined,
    apiKey: authType === 'global' ? keyOrToken : undefined,
    apiToken: authType === 'token' ? keyOrToken : undefined,
  };

  const res = await api('/ssl/cloudflare/test', { method: 'POST', body: payload });
  testBtn.disabled = false;
  testBtn.innerHTML = '<svg viewBox="0 0 20 20" fill="currentColor" style="width:14px;height:14px;display:inline-block;vertical-align:-2px;"><path fill-rule="evenodd" d="M11.3 1.046A1 1 0 0112 2v5h4a1 1 0 01.82 1.573l-7 10A1 1 0 018 18v-5H4a1 1 0 01-.82-1.573l7-10a1 1 0 011.12-.38z"/></svg> Test Connection';

  if (res?.success) {
    resultBanner.style.background = 'rgba(16,185,129,0.15)';
    resultBanner.style.border = '1px solid rgba(16,185,129,0.3)';
    resultBanner.style.color = '#34d399';
    resultBanner.innerHTML = `<strong>${escapeHTML(res.message || 'Ready to install!')}</strong>`;
    toast('Cloudflare API verified successfully!', 'success');
  } else {
    resultBanner.style.background = 'rgba(239,68,68,0.15)';
    resultBanner.style.border = '1px solid rgba(239,68,68,0.3)';
    resultBanner.style.color = '#f87171';
    resultBanner.innerHTML = `<strong>Connection Failed:</strong> ${escapeHTML(res?.error || 'Unable to connect to Cloudflare')}`;
    toast(res?.error || 'Cloudflare connection failed', 'error');
  }
}

async function handleIssueSSLSubmit() {
  if (currentSSLTab === 'wildcard') {
    await issueWildcardSSL();
  } else {
    await issueSSL();
  }
}

async function issueWildcardSSL() {
  const domain = document.getElementById('ssl-wildcard-domain')?.value?.trim();
  const certEmail = document.getElementById('ssl-wildcard-email')?.value?.trim();
  const authType = document.getElementById('ssl-cf-auth-type')?.value;
  const cfEmail = document.getElementById('ssl-cf-email')?.value?.trim();
  const cfKeyOrToken = document.getElementById('ssl-cf-key')?.value?.trim();

  if (!domain) {
    toast('Domain is required', 'error');
    return;
  }

  if (authType === 'global' && (!cfEmail || !cfKeyOrToken)) {
    toast('Cloudflare Email and Global API Key are required', 'error');
    return;
  }

  if (authType === 'token' && !cfKeyOrToken) {
    toast('Cloudflare API Token is required', 'error');
    return;
  }

  const issueBtn = document.getElementById('btn-issue-ssl');
  issueBtn.disabled = true;
  issueBtn.innerHTML = '<span>Issuing Wildcard Certificate…</span>';
  toast('Issuing Wildcard SSL via Cloudflare DNS-01 (~30-40s for DNS propagation)…', 'info', 12000);

  const payload = {
    domain,
    email: certEmail || cfEmail,
    cfEmail: authType === 'global' ? cfEmail : undefined,
    cfApiKey: authType === 'global' ? cfKeyOrToken : undefined,
    cfApiToken: authType === 'token' ? cfKeyOrToken : undefined,
    overwrite: true,
  };

  const res = await api('/ssl/wildcard', { method: 'POST', body: payload });
  if (res?.success) {
    toast(res.message || 'Wildcard SSL successfully issued!', 'success', 8000);
    closeModal();
    navigateTo('ssl');
  } else {
    issueBtn.disabled = false;
    issueBtn.innerHTML = '<span>Retry Install Wildcard SSL</span>';
    renderSSLErrorFallback(domain, res);
    toast(res?.error || 'Failed to issue wildcard SSL', 'error', 10000);
  }
}

async function issueSSL() {
  const domain = document.getElementById('ssl-domain')?.value?.trim();
  const email = document.getElementById('ssl-email')?.value?.trim();
  const includeWww = document.getElementById('ssl-www')?.checked;

  if (!domain) {
    toast('Domain is required', 'error');
    return;
  }

  const issueBtn = document.getElementById('btn-issue-ssl');
  issueBtn.disabled = true;
  issueBtn.innerHTML = '<span>Verifying & Issuing SSL…</span>';
  toast('Verifying domain and issuing SSL certificate…', 'info', 8000);

  const result = await api('/ssl/issue', { method: 'POST', body: { domain, email, includeWww, overwrite: true } });
  if (result?.success) {
    toast('SSL certificate issued successfully!', 'success');
    closeModal();
    navigateTo('ssl');
  } else {
    issueBtn.disabled = false;
    issueBtn.innerHTML = '<span>Retry Issue Certificate</span>';
    renderSSLErrorFallback(domain, result);
    toast(result?.error || 'SSL issuance failed', 'error', 10000);
  }
}

async function renewAllSSL() {
  toast('Renewing all certificates…', 'info', 8000);
  const result = await api('/ssl/renew', { method: 'POST' });
  if (result?.success) toast('All certificates renewed!', 'success');
  else toast('Renewal may have partially failed', 'warning');
}

async function revokeSSL(name) {
  if (!confirm(`Revoke certificate "${name}"?`)) return;
  const result = await api(`/ssl/${name}`, { method: 'DELETE' });
  if (result?.success) { toast('Certificate revoked', 'success'); navigateTo('ssl'); }
  else toast(result?.error || 'Failed', 'error');
}

// ─── File Manager Page (Root Filesystem & Site Navigator) ────

let fileCurrentPath = '/';

async function renderFiles(container) {
  if (state.pageParams?.path) {
    fileCurrentPath = state.pageParams.path;
    state.pageParams.path = null;
  }

  container.innerHTML = `
    <!-- Root Quick Jump Chips -->
    <div class="fm-quick-nav">
      <span class="text-xs text-muted" style="font-weight:700;display:flex;align-items:center;margin-right:4px;">📁 PATHS:</span>
      <button class="fm-chip ${fileCurrentPath === '/' ? 'active' : ''}" onclick="loadFileList('/')">⚡ / (Root)</button>
      <button class="fm-chip ${fileCurrentPath.startsWith('/var/www') ? 'active' : ''}" onclick="loadFileList('/var/www')">🌐 /var/www</button>
      <button class="fm-chip ${fileCurrentPath.startsWith('/usr/local/lsws') ? 'active' : ''}" onclick="loadFileList('/usr/local/lsws')">⚙️ /usr/local/lsws</button>
      <button class="fm-chip ${fileCurrentPath.startsWith('/etc') ? 'active' : ''}" onclick="loadFileList('/etc')">📁 /etc</button>
      <button class="fm-chip ${fileCurrentPath.startsWith('/opt/deols') ? 'active' : ''}" onclick="loadFileList('/opt/deols')">📦 /opt/deols</button>
    </div>

    <div class="flex justify-between items-center mb-4">
      <div class="breadcrumb" id="file-breadcrumb"></div>
      <div class="flex gap-2">
        <button class="btn btn-sm btn-secondary" onclick="showUploadModal()">Upload</button>
        <button class="btn btn-sm btn-secondary" onclick="showNewFolderModal()">New Folder</button>
      </div>
    </div>
    <div class="card">
      <div class="card-body" id="file-list"><p class="text-muted">Loading…</p></div>
    </div>
  `;

  await loadFileList(fileCurrentPath);
}

async function loadFileList(path) {
  fileCurrentPath = path || '/';
  const data = await api(`/files/list?path=${encodeURIComponent(fileCurrentPath)}`);

  // Update quick jump chip active state
  document.querySelectorAll('.fm-chip').forEach((chip) => {
    chip.classList.toggle('active', chip.textContent.includes(fileCurrentPath));
  });

  // Build breadcrumb
  const breadcrumb = document.getElementById('file-breadcrumb');
  if (breadcrumb) {
    const parts = fileCurrentPath.split('/').filter(Boolean);
    let crumbs = `<span class="breadcrumb-item ${fileCurrentPath === '/' ? 'active' : ''}" onclick="loadFileList('/')">/</span>`;
    let accumulated = '';
    parts.forEach((part, i) => {
      accumulated += '/' + part;
      const isLast = i === parts.length - 1;
      crumbs += `<span class="breadcrumb-sep">/</span>`;
      crumbs += `<span class="breadcrumb-item ${isLast ? 'active' : ''}" onclick="loadFileList('${accumulated}')">${part}</span>`;
    });
    breadcrumb.innerHTML = crumbs;
  }

  const listEl = document.getElementById('file-list');
  if (!data?.entries?.length) {
    listEl.innerHTML = '<div class="empty-state"><h3>Empty Directory</h3></div>';
    return;
  }

  listEl.innerHTML = `
    <div class="table-wrap"><table class="table">
      <thead><tr><th>Name</th><th>Size</th><th>Permissions</th><th>Modified</th><th>Actions</th></tr></thead>
      <tbody>
        ${fileCurrentPath !== '/' ? `<tr class="file-row" onclick="loadFileList('${fileCurrentPath.split('/').slice(0, -1).join('/') || '/'}')">
          <td><span class="flex items-center gap-2">📁 <strong>..</strong></span></td><td>—</td><td>—</td><td>—</td><td></td>
        </tr>` : ''}
        ${data.entries.map((e) => `
          <tr class="file-row" ${e.type === 'directory' ? `onclick="loadFileList('${e.path}')" style="cursor:pointer"` : ''}>
            <td><span class="flex items-center gap-2">${e.type === 'directory' ? '📁' : '📄'} <strong>${escapeHTML(e.name)}</strong></span></td>
            <td class="text-sm text-mono">${e.type === 'file' ? formatBytes(e.size) : '—'}</td>
            <td class="text-mono text-sm">${e.permissions || '—'}</td>
            <td class="text-sm text-muted">${e.modified ? new Date(e.modified).toLocaleDateString() : '—'}</td>
            <td>
              <div class="flex gap-2">
                ${e.type === 'file' ? `<button class="btn btn-sm btn-ghost" onclick="event.stopPropagation(); editFile('${e.path}')">Edit</button>` : ''}
                <button class="btn btn-sm btn-danger" onclick="event.stopPropagation(); deleteFile('${e.path}')">Del</button>
              </div>
            </td>
          </tr>
        `).join('')}
      </tbody>
    </table></div>
  `;
}

async function editFile(path) {
  const data = await api(`/files/read?path=${encodeURIComponent(path)}`);
  if (!data?.content && data?.content !== '') {
    toast('Cannot read file', 'error');
    return;
  }

  showModal('Edit File', `
    <p class="text-sm text-muted mb-4 text-mono">${escapeHTML(path)}</p>
    <textarea id="file-editor" style="width:100%;min-height:300px;font-family:var(--font-mono);font-size:0.85rem">${escapeHTML(data.content)}</textarea>
  `, `
    <button class="btn btn-secondary" onclick="closeModal()">Cancel</button>
    <button class="btn btn-primary" onclick="saveFile('${path}')">Save</button>
  `);
}

async function saveFile(path) {
  const content = document.getElementById('file-editor').value;
  const result = await api('/files/save', { method: 'PUT', body: { path, content } });
  if (result?.success) { toast('File saved', 'success'); closeModal(); }
  else toast(result?.error || 'Failed to save', 'error');
}

async function deleteFile(path) {
  if (!confirm(`Delete ${path}?`)) return;
  const result = await api(`/files?path=${encodeURIComponent(path)}`, { method: 'DELETE' });
  if (result?.success) { toast('Deleted', 'success'); loadFileList(fileCurrentPath); }
  else toast(result?.error || 'Failed', 'error');
}

function showUploadModal() {
  toast('Use the file upload endpoint or drag & drop (coming soon)', 'info');
}

function showNewFolderModal() {
  showModal('New Folder', `
    <div class="form-group">
      <label>Folder Name</label>
      <input type="text" id="new-folder-name" placeholder="new-folder" required>
    </div>
  `, `
    <button class="btn btn-secondary" onclick="closeModal()">Cancel</button>
    <button class="btn btn-primary" onclick="createFolder()">Create</button>
  `);
}

async function createFolder() {
  const name = document.getElementById('new-folder-name').value;
  const path = `${fileCurrentPath}/${name}`;
  const result = await api('/files/mkdir', { method: 'POST', body: { path } });
  if (result?.success) { toast('Folder created', 'success'); closeModal(); loadFileList(fileCurrentPath); }
  else toast(result?.error || 'Failed', 'error');
}

// ─── Services Page (Custom Systemd Unit Editor & Core Daemons) ─────────────

let currentCustomServiceName = 'automation-custom-service.service';
let customServicesCache = [];
let customTemplatesCache = {};
let customServiceInspectionMode = 'status'; // 'status' or 'logs'

async function renderServices(container) {
  container.innerHTML = `
    <div class="flex justify-between items-center mb-6">
      <div>
        <h2 style="font-size: 1.25rem; font-weight: 700; margin-bottom: 4px;">System Services & Custom Daemons</h2>
        <p class="text-muted">Linux systemd service controls, daemon-reload, and live custom unit editor (<code>/etc/systemd/system/*.service</code>)</p>
      </div>
      <div class="flex gap-2">
        <button class="btn btn-secondary" id="daemon-reload-btn" onclick="triggerDaemonReload()" title="Execute systemctl daemon-reload across all units">
          <svg viewBox="0 0 20 20" fill="currentColor" class="btn-icon"><path fill-rule="evenodd" d="M4 2a1 1 0 011 1v2.101a7.002 7.002 0 0111.601 2.566 1 1 0 11-1.885.666A5.002 5.002 0 005.999 7H9a1 1 0 010 2H4a1 1 0 01-1-1V3a1 1 0 011-1zm.008 9.057a1 1 0 011.276.61A5.002 5.002 0 0014.001 13H11a1 1 0 110-2h5a1 1 0 011 1v5a1 1 0 11-2 0v-2.101a7.002 7.002 0 01-11.601-2.566 1 1 0 01.61-1.276z"/></svg>
          <span id="daemon-reload-text">daemon-reload</span>
        </button>
        <button class="btn btn-primary" onclick="createNewCustomServiceUI()" title="Create a new custom systemd service">
          <svg viewBox="0 0 20 20" fill="currentColor" class="btn-icon"><path fill-rule="evenodd" d="M10 3a1 1 0 011 1v5h5a1 1 0 110 2h-5v5a1 1 0 11-2 0v-5H4a1 1 0 110-2h5V4a1 1 0 011-1z"/></svg>
          + New Service
        </button>
      </div>
    </div>

    <!-- Navigation Tabs -->
    <div class="flex gap-2 mb-6" style="border-bottom: 1px solid var(--border-secondary); padding-bottom: 12px;">
      <button class="btn btn-sm btn-primary" id="services-tab-custom-btn" onclick="switchServicesTab('custom')">
        <svg viewBox="0 0 20 20" fill="currentColor" class="btn-icon"><path fill-rule="evenodd" d="M2 5a2 2 0 012-2h12a2 2 0 012 2v10a2 2 0 01-2 2H4a2 2 0 01-2-2V5zm3.293 1.293a1 1 0 011.414 0l3 3a1 1 0 010 1.414l-3 3a1 1 0 01-1.414-1.414L7.586 10 5.293 7.707a1 1 0 010-1.414zM11 12a1 1 0 100 2h3a1 1 0 100-2h-3z"/></svg>
        Custom Systemd Units (/etc/systemd/system)
      </button>
      <button class="btn btn-sm btn-secondary" id="services-tab-core-btn" onclick="switchServicesTab('core')">
        <svg viewBox="0 0 20 20" fill="currentColor" class="btn-icon"><path fill-rule="evenodd" d="M11.49 3.17c-.38-1.56-2.6-1.56-2.98 0a1.532 1.532 0 01-2.286.948c-1.372-.836-2.942.734-2.106 2.106.54.886.061 2.042-.947 2.287-1.561.379-1.561 2.6 0 2.978a1.532 1.532 0 01.947 2.287c-.836 1.372.734 2.942 2.106 2.106a1.532 1.532 0 012.287.947c.379 1.561 2.6 1.561 2.978 0a1.533 1.533 0 012.287-.947c1.372.836 2.942-.734 2.106-2.106a1.533 1.533 0 01.947-2.287c1.561-.379 1.561-2.6 0-2.978a1.532 1.532 0 01-.947-2.287c.836-1.372-.734-2.942-2.106-2.106a1.532 1.532 0 01-2.287-.947zM10 13a3 3 0 100-6 3 3 0 000 6z"/></svg>
        Core Server Engines
      </button>
    </div>

    <!-- Tab 1: Custom Services Area -->
    <div id="services-custom-view">
      <div id="custom-services-container">
        <p class="text-muted">Loading custom systemd service manager…</p>
      </div>
    </div>

    <!-- Tab 2: Core Server Engines -->
    <div id="services-core-view" style="display: none;">
      <div class="card">
        <div class="card-body" id="services-list"><p class="text-muted">Loading core services…</p></div>
      </div>
    </div>
  `;

  await Promise.all([loadCustomServicesManager(), loadCoreServicesList()]);
}

function switchServicesTab(tab) {
  const customView = document.getElementById('services-custom-view');
  const coreView = document.getElementById('services-core-view');
  const customBtn = document.getElementById('services-tab-custom-btn');
  const coreBtn = document.getElementById('services-tab-core-btn');

  if (tab === 'custom') {
    if (customView) customView.style.display = 'block';
    if (coreView) coreView.style.display = 'none';
    if (customBtn) customBtn.className = 'btn btn-sm btn-primary';
    if (coreBtn) coreBtn.className = 'btn btn-sm btn-secondary';
  } else {
    if (customView) customView.style.display = 'none';
    if (coreView) coreView.style.display = 'block';
    if (customBtn) customBtn.className = 'btn btn-sm btn-secondary';
    if (coreBtn) coreBtn.className = 'btn btn-sm btn-primary';
  }
}

async function triggerDaemonReload() {
  const btn = document.getElementById('daemon-reload-btn');
  const text = document.getElementById('daemon-reload-text');
  if (btn) btn.disabled = true;
  if (text) text.textContent = 'Reloading…';

  toast('Executing systemctl daemon-reload…', 'info');
  try {
    const res = await api('/services/daemon-reload', { method: 'POST' });
    if (res?.success) {
      toast(res.message || 'systemd daemon reloaded successfully', 'success');
      await loadCustomServicesManager(currentCustomServiceName);
    } else {
      toast(res?.error || 'Failed to reload systemd daemon', 'error');
    }
  } catch (err) {
    toast(`daemon-reload error: ${err.message}`, 'error');
  } finally {
    if (btn) btn.disabled = false;
    if (text) text.textContent = 'daemon-reload';
  }
}

async function loadCustomServicesManager(targetServiceName) {
  const container = document.getElementById('custom-services-container');
  if (!container) return;

  const [servicesRes, templatesRes] = await Promise.all([
    api('/services/custom'),
    api('/services/custom/templates'),
  ]);

  customServicesCache = servicesRes?.services || [];
  customTemplatesCache = templatesRes?.templates || {};

  // Pick active service
  if (targetServiceName) {
    currentCustomServiceName = targetServiceName;
  } else if (!customServicesCache.some(s => s.serviceName === currentCustomServiceName)) {
    if (customServicesCache.length > 0) {
      currentCustomServiceName = customServicesCache[0].serviceName;
    } else {
      currentCustomServiceName = 'automation-custom-service.service';
    }
  }

  // Load details for current service
  const detailRes = await api(`/services/custom/${currentCustomServiceName}`);
  const s = detailRes || {
    name: currentCustomServiceName.replace(/\.service$/, ''),
    serviceName: currentCustomServiceName,
    path: `/etc/systemd/system/${currentCustomServiceName}`,
    exists: false,
    content: customTemplatesCache['automation-custom-service']?.content || '',
    active: false,
    enabled: false,
    statusText: 'inactive',
    statusOutput: 'Service not active or unit file pending creation',
  };

  const isExisting = s.exists !== false;
  const statusColorClass = s.active ? 'service-badge-active' : (s.statusText === 'failed' ? 'service-badge-failed' : 'service-badge-inactive');

  container.innerHTML = `
    <!-- Top Selector & Controls Bar -->
    <div class="card mb-5" style="border: 1px solid var(--border-secondary);">
      <div class="card-body" style="padding: 16px 20px;">
        <div class="flex justify-between items-center flex-wrap gap-4">
          <!-- Left: Service Selector & Nano badge -->
          <div class="flex items-center gap-3 flex-wrap">
            <div style="min-width: 220px;">
              <label class="text-xs text-muted block mb-1 font-semibold">Select Service Unit</label>
              <select class="input" style="padding: 6px 12px; font-weight: 600; font-family: var(--font-mono); font-size: 0.85rem;" onchange="selectCustomService(this.value)">
                ${customServicesCache.map(svc => `
                  <option value="${escapeHTML(svc.serviceName)}" ${svc.serviceName === currentCustomServiceName ? 'selected' : ''}>
                    ${svc.active ? '● ' : '○ '} ${escapeHTML(svc.serviceName)} ${svc.active ? '(active)' : ''}
                  </option>
                `).join('')}
                <option value="__NEW__">+ Create New Service…</option>
              </select>
            </div>

            <div>
              <label class="text-xs text-muted block mb-1 font-semibold">Terminal Nano Path</label>
              <div class="flex items-center gap-2" style="background: rgba(0,0,0,0.3); padding: 6px 12px; border-radius: var(--radius-md); border: 1px solid var(--border-secondary);">
                <code class="text-mono text-xs" style="color: #38bdf8;">nano ${escapeHTML(s.path)}</code>
                <button type="button" class="btn btn-sm" onclick="copyNanoCmd('${escapeHTML(s.serviceName)}')" style="padding: 2px 8px; font-size: 11px;">Copy</button>
              </div>
            </div>

            <div>
              <label class="text-xs text-muted block mb-1 font-semibold">Insert Preset Template</label>
              <select class="input" style="padding: 6px 10px; font-size: 0.8rem;" onchange="applyServiceTemplate(this.value)">
                <option value="">Load Template…</option>
                <option value="automation-custom-service">Python Automation Watcher (automation-custom-service.service)</option>
                <option value="node-worker">Node.js Worker Daemon</option>
                <option value="shell-watcher">Shell Automation Watcher</option>
                <option value="generic-service">Generic Background Service</option>
              </select>
            </div>
          </div>

          <!-- Right: Action Buttons -->
          <div class="flex items-center gap-2 flex-wrap">
            <button class="btn btn-primary" onclick="saveCustomService()" id="save-service-btn" title="Save unit file to /etc/systemd/system and reload systemd daemon">
              <svg viewBox="0 0 20 20" fill="currentColor" class="btn-icon"><path d="M7.707 10.293a1 1 0 10-1.414 1.414l3 3a1 1 0 001.414 0l6-6a1 1 0 00-1.414-1.414L11 11.586l-3.293-3.293z"/></svg>
              Save & Apply
            </button>
            <button class="btn btn-warning" onclick="customServiceAction('restart')" title="Execute systemctl restart">
              <svg viewBox="0 0 20 20" fill="currentColor" class="btn-icon"><path fill-rule="evenodd" d="M4 2a1 1 0 011 1v2.101a7.002 7.002 0 0111.601 2.566 1 1 0 11-1.885.666A5.002 5.002 0 005.999 7H9a1 1 0 010 2H4a1 1 0 01-1-1V3a1 1 0 011-1zm.008 9.057a1 1 0 011.276.61A5.002 5.002 0 0014.001 13H11a1 1 0 110-2h5a1 1 0 011 1v5a1 1 0 11-2 0v-2.101a7.002 7.002 0 01-11.601-2.566 1 1 0 01.61-1.276z"/></svg>
              Restart
            </button>
            ${s.active ? `
              <button class="btn btn-danger" onclick="customServiceAction('stop')" title="Execute systemctl stop">Stop</button>
            ` : `
              <button class="btn btn-success" onclick="customServiceAction('start')" title="Execute systemctl start">Start</button>
            `}
            <button class="btn btn-secondary" onclick="customServiceAction('${s.enabled ? 'disable' : 'enable'}')" title="${s.enabled ? 'Disable auto-start on boot' : 'Enable auto-start on boot'}">
              ${s.enabled ? 'Disable Boot' : 'Enable Boot'}
            </button>
            <button class="btn btn-secondary" onclick="loadCustomServicesManager('${escapeHTML(s.serviceName)}')" title="Refresh status and status text">
              Status
            </button>
            ${isExisting ? `
              <button class="btn btn-secondary" style="color: var(--danger); border-color: rgba(239, 68, 68, 0.4);" onclick="deleteCustomService()" title="Stop, disable and delete this service file">
                Delete
              </button>
            ` : ''}
          </div>
        </div>

        <!-- Live Status Bar -->
        <div class="flex items-center gap-3 mt-4 pt-3 flex-wrap" style="border-top: 1px solid var(--border-primary);">
          <div class="flex items-center gap-2">
            <span class="text-xs text-muted font-semibold">Service Status:</span>
            <span class="badge ${statusColorClass}">
              <span class="status-dot ${s.active ? 'active' : 'inactive'}" style="margin-right: 4px; display: inline-block;"></span>
              ${escapeHTML(s.statusText || (s.active ? 'active (running)' : 'inactive (dead)'))}
            </span>
          </div>

          <div class="flex items-center gap-2">
            <span class="text-xs text-muted font-semibold">Boot Startup:</span>
            <span class="badge badge-${s.enabled ? 'success' : 'secondary'}">
              ${s.enabled ? 'enabled (auto-starts)' : 'disabled'}
            </span>
          </div>

          <div class="flex items-center gap-2">
            <span class="text-xs text-muted font-semibold">System Unit:</span>
            <span class="text-xs text-mono" style="color: var(--text-secondary);">${escapeHTML(s.serviceName)}</span>
          </div>
        </div>
      </div>
    </div>

    <!-- The Nano / Custom Service Code Editor Box -->
    <div class="nano-editor-container">
      <div class="nano-editor-header">
        <div class="flex items-center gap-3">
          <div class="flex gap-1">
            <span class="terminal-dot red"></span>
            <span class="terminal-dot yellow"></span>
            <span class="terminal-dot green"></span>
          </div>
          <span class="nano-editor-title">
            <svg viewBox="0 0 20 20" fill="currentColor" style="width: 15px; height: 15px; color: #58a6ff;"><path fill-rule="evenodd" d="M12.316 3.051a1 1 0 01.633 1.265l-4 12a1 1 0 11-1.898-.632l4-12a1 1 0 011.265-.633zM5.707 6.293a1 1 0 010 1.414L3.414 10l2.293 2.293a1 1 0 11-1.414 1.414l-3-3a1 1 0 010-1.414l3-3a1 1 0 011.414 0zm8.586 0a1 1 0 011.414 0l3 3a1 1 0 010 1.414l-3 3a1 1 0 11-1.414-1.414L16.586 10l-2.293-2.293a1 1 0 010-1.414z"/></svg>
            GNU nano 7.2 &bull; /etc/systemd/system/${escapeHTML(s.serviceName)}
          </span>
        </div>
        <div class="flex items-center gap-3">
          <span class="text-xs text-muted">Systemd Unit Configuration</span>
        </div>
      </div>

      <textarea id="custom-service-code" class="nano-textarea" spellcheck="false" placeholder="[Unit]
Description=My Service
After=network.target

[Service]
Type=simple
User=root
ExecStart=/usr/bin/python3 /path/to/script.py
Restart=always

[Install]
WantedBy=multi-user.target">${escapeHTML(s.content || '')}</textarea>

      <div class="nano-editor-footer">
        <div class="flex items-center flex-wrap">
          <span class="nano-shortcut-badge"><strong>^O</strong> Save & Apply</span>
          <span class="nano-shortcut-badge"><strong>^R</strong> daemon-reload</span>
          <span class="nano-shortcut-badge"><strong>^T</strong> Restart</span>
          <span class="nano-shortcut-badge"><strong>^L</strong> Journal Logs</span>
        </div>
        <div class="text-xs text-muted">
          Path: <code>/etc/systemd/system/${escapeHTML(s.serviceName)}</code>
        </div>
      </div>
    </div>

    <!-- Live Inspection Panel (Status Output & Journalctl Logs) -->
    <div class="card">
      <div class="card-header flex justify-between items-center" style="padding: 12px 18px; border-bottom: 1px solid var(--border-primary);">
        <div class="flex items-center gap-2">
          <button class="btn btn-sm ${customServiceInspectionMode === 'status' ? 'btn-primary' : 'btn-secondary'}" id="inspect-tab-status" onclick="setCustomServiceInspection('status')">
            systemctl status ${escapeHTML(s.serviceName)}
          </button>
          <button class="btn btn-sm ${customServiceInspectionMode === 'logs' ? 'btn-primary' : 'btn-secondary'}" id="inspect-tab-logs" onclick="setCustomServiceInspection('logs')">
            journalctl -u ${escapeHTML(s.serviceName)} -n 100
          </button>
        </div>
        <div class="flex items-center gap-2">
          <button class="btn btn-sm btn-secondary" onclick="refreshInspectionPanel()" title="Refresh live terminal output">
            <svg viewBox="0 0 20 20" fill="currentColor" class="btn-icon"><path fill-rule="evenodd" d="M4 2a1 1 0 011 1v2.101a7.002 7.002 0 0111.601 2.566 1 1 0 11-1.885.666A5.002 5.002 0 005.999 7H9a1 1 0 010 2H4a1 1 0 01-1-1V3a1 1 0 011-1zm.008 9.057a1 1 0 011.276.61A5.002 5.002 0 0014.001 13H11a1 1 0 110-2h5a1 1 0 011 1v5a1 1 0 11-2 0v-2.101a7.002 7.002 0 01-11.601-2.566 1 1 0 01.61-1.276z"/></svg>
            Refresh
          </button>
        </div>
      </div>
      <div class="card-body" style="padding: 16px;">
        <pre class="status-terminal-box" id="service-inspect-output">${escapeHTML(s.statusOutput || 'Loading output…')}</pre>
      </div>
    </div>
  `;
}

function selectCustomService(val) {
  if (val === '__NEW__') {
    createNewCustomServiceUI();
  } else {
    currentCustomServiceName = val;
    loadCustomServicesManager(val);
  }
}

function copyNanoCmd(serviceName) {
  const cmd = `nano /etc/systemd/system/${serviceName}`;
  if (navigator.clipboard) {
    navigator.clipboard.writeText(cmd);
  }
  toast(`Copied command: ${cmd}`, 'success');
}

function createNewCustomServiceUI() {
  const name = prompt('Enter custom systemd service name (e.g. automation-custom-service.service):', 'automation-custom-service.service');
  if (!name || !name.trim()) return;

  let clean = name.trim();
  if (!clean.endsWith('.service')) clean = `${clean}.service`;

  currentCustomServiceName = clean;
  loadCustomServicesManager(clean);
  toast(`Creating new service unit: ${clean}`, 'info');
}

function applyServiceTemplate(tplKey) {
  if (!tplKey || !customTemplatesCache[tplKey]) return;
  const tpl = customTemplatesCache[tplKey];
  const textarea = document.getElementById('custom-service-code');
  if (textarea) {
    textarea.value = tpl.content;
    toast(`Loaded template: ${tpl.title}`, 'success');
  }
}

async function saveCustomService() {
  const textarea = document.getElementById('custom-service-code');
  if (!textarea) return;

  const content = textarea.value;
  if (!content.trim()) {
    return toast('Service unit content cannot be empty', 'error');
  }

  const btn = document.getElementById('save-service-btn');
  if (btn) btn.disabled = true;
  toast(`Saving ${currentCustomServiceName} & reloading systemd…`, 'info');

  try {
    const res = await api('/services/custom', {
      method: 'POST',
      body: {
        name: currentCustomServiceName,
        content,
        enable: true,
        restart: false,
      }
    });

    if (res?.success) {
      toast(res.message || `Service ${currentCustomServiceName} saved successfully!`, 'success', 5000);
      await loadCustomServicesManager(currentCustomServiceName);
    } else {
      toast(res?.error || 'Failed to save service unit', 'error', 6000);
    }
  } catch (err) {
    toast(`Save error: ${err.message}`, 'error', 6000);
  } finally {
    if (btn) btn.disabled = false;
  }
}

async function customServiceAction(action) {
  toast(`Executing systemctl ${action} ${currentCustomServiceName}…`, 'info');
  try {
    const res = await api(`/services/custom/${currentCustomServiceName}/${action}`, { method: 'POST' });
    if (res?.success) {
      toast(res.message || `${action} succeeded for ${currentCustomServiceName}`, 'success');
      await loadCustomServicesManager(currentCustomServiceName);
    } else {
      toast(res?.error || `Failed to ${action} ${currentCustomServiceName}`, 'error');
    }
  } catch (err) {
    toast(`Error: ${err.message}`, 'error');
  }
}

async function deleteCustomService() {
  if (!confirm(`Are you sure you want to stop, disable, and permanently delete /etc/systemd/system/${currentCustomServiceName}?`)) return;

  toast(`Deleting ${currentCustomServiceName}…`, 'info');
  try {
    const res = await api(`/services/custom/${currentCustomServiceName}`, { method: 'DELETE' });
    if (res?.success) {
      toast(res.message || `Deleted ${currentCustomServiceName}`, 'success');
      currentCustomServiceName = 'automation-custom-service.service';
      await loadCustomServicesManager();
    } else {
      toast(res?.error || `Failed to delete ${currentCustomServiceName}`, 'error');
    }
  } catch (err) {
    toast(`Delete error: ${err.message}`, 'error');
  }
}

async function setCustomServiceInspection(mode) {
  customServiceInspectionMode = mode;
  const tabStatus = document.getElementById('inspect-tab-status');
  const tabLogs = document.getElementById('inspect-tab-logs');
  if (tabStatus && tabLogs) {
    tabStatus.className = `btn btn-sm ${mode === 'status' ? 'btn-primary' : 'btn-secondary'}`;
    tabLogs.className = `btn btn-sm ${mode === 'logs' ? 'btn-primary' : 'btn-secondary'}`;
  }
  await refreshInspectionPanel();
}

async function refreshInspectionPanel() {
  const box = document.getElementById('service-inspect-output');
  if (!box) return;

  box.textContent = 'Loading live output…';
  if (customServiceInspectionMode === 'status') {
    const detail = await api(`/services/custom/${currentCustomServiceName}`);
    box.textContent = detail?.statusOutput || 'No status available';
  } else {
    const logsRes = await api(`/services/custom/${currentCustomServiceName}/logs?lines=100`);
    box.textContent = logsRes?.logs || 'No journal logs found';
  }
}

async function loadCoreServicesList() {
  const data = await api('/services');
  const el = document.getElementById('services-list');
  if (!el) return;

  if (data?.services) {
    el.innerHTML = data.services.map((s) => `
      <div class="service-row">
        <div class="service-info">
          <span class="status-dot ${s.active ? 'active' : 'inactive'}"></span>
          <span class="service-name">${escapeHTML(s.name)}</span>
          <span class="badge badge-${s.active ? 'success' : 'warning'}">${s.status}</span>
        </div>
        <div class="service-actions">
          <button class="btn btn-sm btn-success" onclick="svcAction('${s.name}','start')">Start</button>
          <button class="btn btn-sm btn-danger" onclick="svcAction('${s.name}','stop')">Stop</button>
          <button class="btn btn-sm btn-secondary" onclick="svcAction('${s.name}','restart')">Restart</button>
        </div>
      </div>
    `).join('');
  }
}

async function svcAction(name, action) {
  const result = await api(`/services/${name}/${action}`, { method: 'POST' });
  if (result?.success) { toast(`${name}: ${action} successful`, 'success'); loadCoreServicesList(); }
  else toast(result?.error || `Failed to ${action} ${name}`, 'error');
}

// ─── OpenLiteSpeed (OLS) & WebAdmin Page ─────────────────────

async function renderOLS(container) {
  container.innerHTML = `
    <div class="flex justify-between items-center mb-6">
      <div>
        <h2 style="font-size: 1.25rem; font-weight: 700; margin-bottom: 4px;">OpenLiteSpeed Web Engine & WebAdmin</h2>
        <p class="text-muted">CyberPanel-grade OLS service controls, virtual hosts, dual listeners, and WebAdmin console</p>
      </div>
      <div class="flex gap-2">
        <button class="btn btn-secondary" id="ols-sync-btn" title="Synchronize all DEOLS sites with OLS virtual hosts and dual listeners">
          <svg viewBox="0 0 20 20" fill="currentColor" class="btn-icon"><path fill-rule="evenodd" d="M4 2a1 1 0 011 1v2.101a7.002 7.002 0 0111.601 2.566 1 1 0 11-1.885.666A5.002 5.002 0 005.999 7H9a1 1 0 010 2H4a1 1 0 01-1-1V3a1 1 0 011-1zm.008 9.057a1 1 0 011.276.61A5.002 5.002 0 0014.001 13H11a1 1 0 110-2h5a1 1 0 011 1v5a1 1 0 11-2 0v-2.101a7.002 7.002 0 01-11.601-2.566 1 1 0 01.61-1.276z"/></svg>
          Sync with OLS
        </button>
        <button class="btn btn-secondary" id="ols-reload-btn">
          <svg viewBox="0 0 20 20" fill="currentColor" class="btn-icon"><path fill-rule="evenodd" d="M4 2a1 1 0 011 1v2.101a7.002 7.002 0 0111.601 2.566 1 1 0 11-1.885.666A5.002 5.002 0 005.999 7H9a1 1 0 010 2H4a1 1 0 01-1-1V3a1 1 0 011-1zm.008 9.057a1 1 0 011.276.61A5.002 5.002 0 0014.001 13H11a1 1 0 110-2h5a1 1 0 011 1v5a1 1 0 11-2 0v-2.101a7.002 7.002 0 01-11.601-2.566 1 1 0 01.61-1.276z"/></svg>
          Reload Config
        </button>
        <button class="btn btn-primary" id="ols-restart-btn">
          <svg viewBox="0 0 20 20" fill="currentColor" class="btn-icon"><path fill-rule="evenodd" d="M11.49 3.17c-.38-1.56-2.6-1.56-2.98 0a1.532 1.532 0 01-2.286.948c-1.372-.836-2.942.734-2.106 2.106.54.886.061 2.042-.947 2.287-1.561.379-1.561 2.6 0 2.978a1.532 1.532 0 01.947 2.287c-.836 1.372.734 2.942 2.106 2.106a1.532 1.532 0 012.287.947c.379 1.561 2.6 1.561 2.978 0a1.533 1.533 0 012.287-.947c1.372.836 2.942-.734 2.106-2.106a1.533 1.533 0 01.947-2.287c1.561-.379 1.561-2.6 0-2.978a1.532 1.532 0 01-.947-2.287c.836-1.372-.734-2.942-2.106-2.106a1.532 1.532 0 01-2.287-.947zM10 13a3 3 0 100-6 3 3 0 000 6z"/></svg>
          Restart OLS
        </button>
      </div>
    </div>

    <div id="ols-content">
      <p class="text-muted">Loading OpenLiteSpeed status and virtual host maps…</p>
    </div>
  `;

  document.getElementById('ols-sync-btn')?.addEventListener('click', async () => {
    toast('Synchronizing DEOLS websites with OLS Virtual Hosts and Listeners…', 'info');
    const res = await api('/ols/sync', { method: 'POST', body: { action: 'sync' } });
    if (res?.success) {
      toast(res.message || 'OLS configuration synchronized successfully!', 'success');
      renderOLS(container);
    } else {
      toast(res?.message || res?.error || 'Failed to sync with OLS', 'error');
    }
  });

  document.getElementById('ols-restart-btn')?.addEventListener('click', async () => {
    toast('Restarting OpenLiteSpeed…', 'info');
    const res = await api('/ols/restart', { method: 'POST', body: { action: 'restart' } });
    if (res?.success) {
      toast(res.message || 'OpenLiteSpeed restarted successfully', 'success');
      renderOLS(container);
    } else {
      toast(res?.message || res?.error || 'Failed to restart OLS', 'error');
    }
  });

  document.getElementById('ols-reload-btn')?.addEventListener('click', async () => {
    toast('Reloading OpenLiteSpeed config…', 'info');
    const res = await api('/ols/reload', { method: 'POST', body: { action: 'reload' } });
    if (res?.success) {
      toast(res.message || 'Configuration reloaded smoothly', 'success');
      renderOLS(container);
    } else {
      toast(res?.message || res?.error || 'Failed to reload OLS', 'error');
    }
  });

  const [data, vhostsRes, listenersRes] = await Promise.all([
    api('/ols/status'),
    api('/ols/vhosts'),
    api('/ols/listeners'),
  ]);

  const contentEl = document.getElementById('ols-content');
  if (!contentEl) return;

  if (!data) {
    contentEl.innerHTML = `<div class="card"><div class="card-body"><p class="text-danger">Failed to communicate with OLS management service.</p></div></div>`;
    return;
  }

  const hostname = window.location.hostname || 'localhost';
  const adminUrl = `https://${hostname}:${data.adminPort || 7080}`;

  const vhosts = vhostsRes?.vhosts || [];
  const listeners = listenersRes?.listeners || [];

  const vhostsRows = vhosts.length > 0
    ? vhosts.map((vh) => `
        <tr>
          <td>
            <strong>${escapeHTML(vh.name)}</strong>
            ${vh.mappedDomains?.length > 0 ? `<div class="text-xs text-muted truncate" style="max-width:260px;" title="${escapeHTML(vh.mappedDomains.join(', '))}">${escapeHTML(vh.mappedDomains.join(', '))}</div>` : ''}
          </td>
          <td><code class="text-mono text-xs">${escapeHTML(vh.vhRoot || '-')}</code></td>
          <td>
            ${vh.hasSSL
              ? '<span class="badge badge-success">✓ vhssl (Active)</span>'
              : '<span class="badge badge-warning">No SSL</span>'}
          </td>
          <td>
            ${vh.phpSocket
              ? `<code class="text-xs text-mono" style="color: #38bdf8;">${escapeHTML(vh.phpSocket)}</code>`
              : '<span class="text-xs text-muted">Server Default</span>'}
          </td>
          <td>
            ${(vh.listeners || []).map((l) => `<span class="badge ${l.toLowerCase().includes('https') ? 'badge-primary' : 'badge-info'}">${escapeHTML(l)}</span>`).join(' ') || '<span class="badge badge-danger">Unmapped</span>'}
          </td>
          <td>
            <button class="btn btn-secondary btn-sm ols-view-vhost-btn" data-domain="${escapeHTML(vh.name)}" title="Inspect Virtual Host Configuration">
              View Config
            </button>
          </td>
        </tr>
      `).join('')
    : `<tr><td colspan="6" class="text-center text-muted py-4">No Virtual Hosts configured in OLS httpd_config.conf yet. Click <strong>Sync with OLS</strong> to populate.</td></tr>`;

  const listenersRows = listeners.length > 0
    ? listeners.map((l) => `
        <tr>
          <td><strong>${escapeHTML(l.name)}</strong></td>
          <td><code class="text-mono">${escapeHTML(l.address || l.binding || '-')}</code></td>
          <td>
            ${l.secure
              ? '<span class="badge badge-success">🔒 HTTPS (SNI Enabled)</span>'
              : '<span class="badge badge-info">🌐 HTTP (Plain :80)</span>'}
          </td>
          <td>
            ${l.mappings?.length > 0
              ? l.mappings.map((m) => `
                  <div style="margin-bottom: 4px;">
                    <strong style="color: var(--accent-light, #818cf8);">${escapeHTML(m.vhost)}:</strong>
                    <span class="text-xs text-secondary">${escapeHTML(m.domains)}</span>
                  </div>
                `).join('')
              : '<span class="text-xs text-muted">No virtual hosts mapped to this listener</span>'}
          </td>
        </tr>
      `).join('')
    : `<tr><td colspan="4" class="text-center text-muted py-4">No listeners detected in httpd_config.conf.</td></tr>`;

  contentEl.innerHTML = `
    <div class="grid grid-2 gap-6 mb-6">
      <!-- WebAdmin Access Card -->
      <div class="card">
        <div class="card-header flex justify-between items-center">
          <div class="flex items-center gap-2">
            <span class="status-dot ${data.active ? 'active' : 'inactive'}"></span>
            <h3 class="card-title">OLS WebAdmin Console</h3>
          </div>
          <span class="badge badge-${data.active ? 'success' : 'danger'}">${data.active ? 'Running' : 'Stopped'}</span>
        </div>
        <div class="card-body">
          <p class="text-sm text-secondary mb-4">
            OpenLiteSpeed provides an advanced WebAdmin GUI for fine-grained listener, virtual host, cache module, and LSPHP worker tuning.
          </p>
          <div style="background: rgba(0,0,0,0.3); border-radius: 8px; padding: 14px; margin-bottom: 16px;">
            <div class="flex justify-between items-center mb-2">
              <span class="text-xs text-muted">WebAdmin URL:</span>
              <span class="text-xs text-mono" style="color: var(--accent-light, #818cf8); font-weight: 600;">${adminUrl}</span>
            </div>
            <div class="flex justify-between items-center mb-2">
              <span class="text-xs text-muted">Admin Port:</span>
              <span class="text-xs text-mono">${data.adminPort || 7080} (HTTPS)</span>
            </div>
            <div class="flex justify-between items-center">
              <span class="text-xs text-muted">Default Username:</span>
              <span class="text-xs text-mono font-bold">admin</span>
            </div>
          </div>
          <div class="flex gap-2">
            <a href="${adminUrl}" target="_blank" rel="noopener noreferrer" class="btn btn-primary btn-full flex items-center justify-center gap-2">
              <span>Open WebAdmin Console</span>
              <svg viewBox="0 0 20 20" fill="currentColor" style="width: 14px; height: 14px;"><path d="M11 3a1 1 0 100 2h2.586l-6.293 6.293a1 1 0 101.414 1.414L15 6.414V9a1 1 0 102 0V4a1 1 0 00-1-1h-5z"/><path d="M5 5a2 2 0 00-2 2v8a2 2 0 002 2h8a2 2 0 002-2v-3a1 1 0 10-2 0v3H5V7h3a1 1 0 000-2H5z"/></svg>
            </a>
          </div>
          <p class="text-xs text-muted mt-3">
            Note: The WebAdmin interface uses a self-signed certificate by default. Click "Advanced &rarr; Proceed" in your browser when prompted.
          </p>
        </div>
      </div>

      <!-- OLS Password Reset Tool -->
      <div class="card">
        <div class="card-header">
          <h3 class="card-title">Reset OLS WebAdmin Password</h3>
        </div>
        <div class="card-body">
          <p class="text-sm text-secondary mb-4">
            Reset or update the credentials for user <code>admin</code> to access the OpenLiteSpeed WebAdmin panel on port 7080.
          </p>
          <form id="ols-password-form">
            <div class="form-group mb-3">
              <label for="ols-new-pass">New OLS Admin Password</label>
              <input type="password" id="ols-new-pass" placeholder="Min. 6 characters" required minlength="6" autocomplete="new-password">
            </div>
            <button type="submit" class="btn btn-secondary btn-full" id="ols-pass-btn">
              <span>Update OLS Password</span>
            </button>
          </form>
          <div style="margin-top: 14px; padding: 10px 12px; background: rgba(99,102,241,0.08); border: 1px solid rgba(99,102,241,0.2); border-radius: 6px;">
            <p style="font-size: 11px; color: var(--text-secondary, #94a3b8); margin: 0; line-height: 1.4;">
              <strong>Root SSH Shortcut:</strong> You can also reset this from your server terminal anytime by running:
              <br><code style="color: #38bdf8;">deols ols password &lt;new_password&gt;</code> or <code style="color: #38bdf8;">deols ols reset-pass</code>
            </p>
          </div>
        </div>
      </div>
    </div>

    <!-- Runtime & Environment Metrics -->
    <div class="grid grid-3 gap-6 mb-6">
      <div class="card">
        <div class="card-body text-center">
          <p class="text-xs text-muted uppercase">Engine Version</p>
          <p style="font-size: 1.5rem; font-weight: 700; color: var(--accent-light, #818cf8); margin: 8px 0;">${data.version}</p>
          <span class="text-xs text-secondary">OpenLiteSpeed Edition</span>
        </div>
      </div>
      <div class="card">
        <div class="card-body text-center">
          <p class="text-xs text-muted uppercase">Main Process (PID)</p>
          <p style="font-size: 1.5rem; font-weight: 700; color: #10b981; margin: 8px 0;">${data.pid || 'Inactive'}</p>
          <span class="text-xs text-secondary">Uptime: ${data.uptime || 'N/A'}</span>
        </div>
      </div>
      <div class="card">
        <div class="card-body text-center">
          <p class="text-xs text-muted uppercase">Memory Usage (RSS)</p>
          <p style="font-size: 1.5rem; font-weight: 700; color: #38bdf8; margin: 8px 0;">${data.memoryMB} MB</p>
          <span class="text-xs text-secondary">Ultra-low footprint</span>
        </div>
      </div>
    </div>

    <!-- Virtual Hosts in OpenLiteSpeed (CyberPanel Model) -->
    <div class="card mb-6">
      <div class="card-header flex justify-between items-center">
        <div>
          <h3 class="card-title">Virtual Hosts in OpenLiteSpeed</h3>
          <p class="text-xs text-secondary">Defined in httpd_config.conf and synchronized with OLS WebAdmin (Port 7080)</p>
        </div>
        <span class="badge badge-info">${vhosts.length} Virtual Hosts</span>
      </div>
      <div class="card-body">
        <div class="table-wrap">
          <table class="table">
            <thead>
              <tr>
                <th>Virtual Host</th>
                <th>Root Path (vhRoot)</th>
                <th>SSL Status</th>
                <th>Isolated PHP Socket</th>
                <th>Mapped Listeners</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              ${vhostsRows}
            </tbody>
          </table>
        </div>
      </div>
    </div>

    <!-- Active OpenLiteSpeed Listeners (CyberPanel Dual Architecture) -->
    <div class="card mb-6">
      <div class="card-header flex justify-between items-center">
        <div>
          <h3 class="card-title">Active Listeners (CyberPanel Dual Architecture)</h3>
          <p class="text-xs text-secondary">Port 80 (HTTP) & Port 443 (HTTPS SNI) listeners in httpd_config.conf routing traffic to virtual hosts</p>
        </div>
        <span class="badge badge-success">${listeners.length} Active Listeners</span>
      </div>
      <div class="card-body">
        <div class="table-wrap">
          <table class="table">
            <thead>
              <tr>
                <th>Listener Name</th>
                <th>IP / Port</th>
                <th>Protocol & SNI</th>
                <th>Mapped Virtual Hosts & Aliases</th>
              </tr>
            </thead>
            <tbody>
              ${listenersRows}
            </tbody>
          </table>
        </div>
      </div>
    </div>

    <!-- System Architecture & Configuration Paths -->
    <div class="card mb-6">
      <div class="card-header">
        <h3 class="card-title">OpenLiteSpeed Architecture & Path Matrix</h3>
      </div>
      <div class="card-body">
        <div class="table-wrap">
          <table class="table">
            <thead>
              <tr><th>Component</th><th>Path on Debian 12</th><th>Purpose</th></tr>
            </thead>
            <tbody>
              <tr>
                <td><strong>LSWS Base Directory</strong></td>
                <td><code class="text-mono">${data.olsRoot || '/usr/local/lsws'}</code></td>
                <td>Core OpenLiteSpeed installation prefix</td>
              </tr>
              <tr>
                <td><strong>Main HTTPD Config</strong></td>
                <td><code class="text-mono">/usr/local/lsws/conf/httpd_config.conf</code></td>
                <td>Server-level listeners, modules, and external apps</td>
              </tr>
              <tr>
                <td><strong>Virtual Hosts Directory</strong></td>
                <td><code class="text-mono">/usr/local/lsws/conf/vhosts/</code></td>
                <td>Individual website configs auto-managed by DEOLS</td>
              </tr>
              <tr>
                <td><strong>WebAdmin Password File</strong></td>
                <td><code class="text-mono">/usr/local/lsws/admin/conf/htpasswd</code></td>
                <td>Encrypted credentials for port 7080 access</td>
              </tr>
              <tr>
                <td><strong>LSCache Cache Data</strong></td>
                <td><code class="text-mono">/usr/local/lsws/cachedata</code></td>
                <td>High-speed page cache storage engine</td>
              </tr>
              <tr>
                <td><strong>Server Error Log</strong></td>
                <td><code class="text-mono">/usr/local/lsws/logs/error.log</code></td>
                <td>Engine error and startup diagnostics</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
  `;

  // Attach "View Config" modal inspection handlers
  contentEl.querySelectorAll('.ols-view-vhost-btn').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const domain = btn.getAttribute('data-domain');
      if (!domain) return;
      toast(`Loading OLS config for ${domain}…`, 'info');
      const res = await api(`/ols/vhost/${encodeURIComponent(domain)}/config`);
      if (!res) return;

      showModal(
        `OLS Configuration: ${domain}`,
        `
          <div style="margin-bottom: 16px;">
            <div class="flex justify-between items-center mb-1">
              <h4 style="font-size: 13px; font-weight: 600; color: var(--accent-light, #818cf8);">
                1. Virtual Host Directive in httpd_config.conf
              </h4>
              <span class="text-xs text-muted text-mono">/usr/local/lsws/conf/httpd_config.conf</span>
            </div>
            <pre style="background: rgba(0,0,0,0.5); padding: 12px; border-radius: 6px; font-size: 12px; max-height: 180px; overflow: auto; color: #38bdf8;"><code>${escapeHTML(res.httpdSnippet || 'No direct block found in httpd_config.conf')}</code></pre>
          </div>

          <div>
            <div class="flex justify-between items-center mb-1">
              <h4 style="font-size: 13px; font-weight: 600; color: var(--accent-light, #818cf8);">
                2. Virtual Host Config File (vhconf.conf)
              </h4>
              <span class="text-xs text-mono text-muted">${escapeHTML(res.vhconfPath || '')}</span>
            </div>
            <pre style="background: rgba(0,0,0,0.5); padding: 12px; border-radius: 6px; font-size: 12px; max-height: 320px; overflow: auto; color: #e2e8f0;"><code>${escapeHTML(res.vhconfContent || 'File not found on disk')}</code></pre>
          </div>
        `,
        `<button class="btn btn-secondary" onclick="closeModal()">Close</button>`
      );
    });
  });

  // Attach password reset form handler
  document.getElementById('ols-password-form')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const pass = document.getElementById('ols-new-pass').value;
    if (!pass || pass.length < 6) {
      toast('Password must be at least 6 characters', 'error');
      return;
    }
    const btn = document.getElementById('ols-pass-btn');
    btn.disabled = true;
    btn.innerHTML = '<span>Updating…</span>';

    const res = await api('/ols/password', { method: 'POST', body: { password: pass } });
    btn.disabled = false;
    btn.innerHTML = '<span>Update OLS Password</span>';

    if (res?.success) {
      toast('OLS WebAdmin password successfully updated!', 'success');
      document.getElementById('ols-new-pass').value = '';
    } else {
      toast(res?.error || 'Failed to update OLS password', 'error');
    }
  });
}

// ─── Cache Page ─────────────────────────────────────────────

async function renderCache(container) {
  container.innerHTML = `
    <div class="stats-grid mb-6">
      <div class="stat-card">
        <div class="stat-card-header">
          <span class="stat-card-label">OLS Cache</span>
          <div class="stat-card-icon purple"><svg viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M11.3 1.046A1 1 0 0112 2v5h4a1 1 0 01.82 1.573l-7 10A1 1 0 018 18v-5H4a1 1 0 01-.82-1.573l7-10a1 1 0 011.12-.38z"/></svg></div>
        </div>
        <div class="stat-card-value" id="cache-size">—</div>
        <button class="btn btn-sm btn-primary mt-4" onclick="purgeAllCache()">Purge All Cache</button>
      </div>
      <div class="stat-card">
        <div class="stat-card-header">
          <span class="stat-card-label">Redis</span>
          <div class="stat-card-icon red"><svg viewBox="0 0 20 20" fill="currentColor"><path d="M3 12v3c0 1.657 3.134 3 7 3s7-1.343 7-3v-3c0 1.657-3.134 3-7 3s-7-1.343-7-3z"/></svg></div>
        </div>
        <div class="stat-card-value" id="redis-status">—</div>
        <div class="flex gap-2 mt-4">
          <button class="btn btn-sm btn-secondary" onclick="redisAction('restart')">Restart</button>
          <button class="btn btn-sm btn-secondary" onclick="flushRedis()">Flush</button>
        </div>
      </div>
      <div class="stat-card">
        <div class="stat-card-header">
          <span class="stat-card-label">Memcached</span>
          <div class="stat-card-icon yellow"><svg viewBox="0 0 20 20" fill="currentColor"><path d="M13 7H7v6h6V7z"/></svg></div>
        </div>
        <div class="stat-card-value" id="memcached-status">—</div>
        <div class="flex gap-2 mt-4">
          <button class="btn btn-sm btn-secondary" onclick="memcachedAction('restart')">Restart</button>
          <button class="btn btn-sm btn-secondary" onclick="flushMemcached()">Flush</button>
        </div>
      </div>
    </div>
  `;

  const [cacheStats, redis, memcached] = await Promise.all([
    api('/cache/ols/stats'),
    api('/cache/redis/status'),
    api('/cache/memcached/status'),
  ]);

  if (cacheStats) document.getElementById('cache-size').textContent = cacheStats.size || '0';
  if (redis) document.getElementById('redis-status').textContent = redis.active ? 'Running' : redis.installed ? 'Stopped' : 'Not Installed';
  if (memcached) document.getElementById('memcached-status').textContent = memcached.active ? 'Running' : memcached.installed ? 'Stopped' : 'Not Installed';
}

async function redisAction(action) {
  await api('/cache/redis/toggle', { method: 'POST', body: { action } });
  toast(`Redis ${action}`, 'success');
  navigateTo('cache');
}

async function flushRedis() {
  const result = await api('/cache/redis/flush', { method: 'POST' });
  toast(result?.success ? 'Redis flushed' : 'Failed to flush Redis', result?.success ? 'success' : 'error');
}

async function memcachedAction(action) {
  await api('/cache/memcached/toggle', { method: 'POST', body: { action } });
  toast(`Memcached ${action}`, 'success');
  navigateTo('cache');
}

async function flushMemcached() {
  const result = await api('/cache/memcached/flush', { method: 'POST' });
  toast(result?.success ? 'Memcached flushed' : 'Failed', result?.success ? 'success' : 'error');
}

// ─── Cron Page ──────────────────────────────────────────────

async function renderCron(container) {
  container.innerHTML = `
    <div class="flex justify-between items-center mb-6">
      <div>
        <h2 style="font-size: 1.25rem; font-weight: 700; margin-bottom: 4px;">Server-Side Automation & Cron Engine</h2>
        <p class="text-muted">Background daemon for WordPress WP-Cron, automated SSL renewal, OLS cache maintenance, and custom scheduled tasks</p>
      </div>
      <div class="flex gap-2">
        <button class="btn btn-secondary" onclick="showNewCronModal()">+ Standard Crontab</button>
        <button class="btn btn-primary" onclick="showNewAutomationModal()">+ Add Automation Task</button>
      </div>
    </div>

    <!-- Daemon Status Banner -->
    <div class="card mb-6" style="background: linear-gradient(135deg, rgba(99,102,241,0.08) 0%, rgba(16,185,129,0.05) 100%); border-color: rgba(99,102,241,0.2);">
      <div class="card-body flex justify-between items-center py-4">
        <div class="flex items-center gap-3">
          <span class="status-dot active"></span>
          <div>
            <strong style="color: var(--accent-light, #818cf8);">DEOLS Automation Daemon: Active</strong>
            <p class="text-xs text-secondary" style="margin: 2px 0 0 0;">
              Running 60-second schedule evaluations for WordPress events, SSL validity checks, and server maintenance
            </p>
          </div>
        </div>
        <div class="flex items-center gap-2" id="cron-stats-badges">
          <span class="badge badge-success">Daemon Healthy</span>
        </div>
      </div>
    </div>

    <div id="cron-content">
      <p class="text-muted">Loading scheduled tasks…</p>
    </div>
  `;

  const [autoData, crontabData] = await Promise.all([
    api('/cron/automation'),
    api('/cron'),
  ]);

  const contentEl = document.getElementById('cron-content');
  if (!contentEl) return;

  const tasks = autoData?.tasks || [];
  const systemTasks = tasks.filter((t) => t.isSystem);
  const customTasks = tasks.filter((t) => !t.isSystem);
  const crontabJobs = crontabData?.jobs || [];

  contentEl.innerHTML = `
    <!-- System Automation Tasks -->
    <div class="card mb-6">
      <div class="card-header flex justify-between items-center">
        <div>
          <h3 class="card-title">Core System Automation Tasks</h3>
          <p class="text-xs text-secondary">Essential server-side automation runners managed by the DEOLS service engine</p>
        </div>
        <span class="badge badge-info">${systemTasks.length} System Tasks</span>
      </div>
      <div class="card-body">
        <div class="table-wrap">
          <table class="table">
            <thead>
              <tr>
                <th>Task Name & Description</th>
                <th>Schedule</th>
                <th>Last Run</th>
                <th>Status</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              ${systemTasks.map((t) => `
                <tr>
                  <td>
                    <strong>${escapeHTML(t.name)}</strong>
                    <div class="text-xs text-secondary" style="margin-top: 2px;">${escapeHTML(t.description || '')}</div>
                  </td>
                  <td>
                    <span class="badge badge-info text-mono">${escapeHTML(t.schedule)}</span>
                  </td>
                  <td class="text-xs">
                    ${t.lastRun ? `<span>${new Date(t.lastRun).toLocaleTimeString()}</span><div class="text-muted">${t.lastDurationMs}ms</div>` : '<span class="text-muted">Pending</span>'}
                  </td>
                  <td>
                    <span class="badge badge-${t.lastStatus === 'success' ? 'success' : (t.lastStatus === 'failed' ? 'danger' : 'secondary')}">
                      ${escapeHTML(t.lastStatus || 'idle')}
                    </span>
                  </td>
                  <td>
                    <div class="flex gap-2">
                      <button class="btn btn-secondary btn-sm" onclick="triggerRunTask('${escapeHTML(t.id)}')">
                        ⚡ Run Now
                      </button>
                      <button class="btn btn-secondary btn-sm" onclick="showTaskLogsModal('${escapeHTML(t.id)}', '${escapeHTML(t.name)}')">
                        Logs
                      </button>
                    </div>
                  </td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
      </div>
    </div>

    <!-- Custom Scheduled Automation Tasks -->
    <div class="card mb-6">
      <div class="card-header flex justify-between items-center">
        <div>
          <h3 class="card-title">Custom Scheduled Server Tasks</h3>
          <p class="text-xs text-secondary">Custom bash scripts, python automations, and scheduled maintenance commands</p>
        </div>
        <span class="badge badge-primary">${customTasks.length} Custom Tasks</span>
      </div>
      <div class="card-body">
        ${customTasks.length > 0 ? `
          <div class="table-wrap">
            <table class="table">
              <thead>
                <tr>
                  <th>Task Name</th>
                  <th>Schedule</th>
                  <th>Command</th>
                  <th>Last Run</th>
                  <th>Status</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                ${customTasks.map((t) => `
                  <tr>
                    <td><strong>${escapeHTML(t.name)}</strong></td>
                    <td><span class="badge badge-info text-mono">${escapeHTML(t.schedule)}</span></td>
                    <td><code class="text-mono text-xs truncate" style="max-width: 250px; display: inline-block;">${escapeHTML(t.command)}</code></td>
                    <td class="text-xs">
                      ${t.lastRun ? `<span>${new Date(t.lastRun).toLocaleTimeString()}</span><div class="text-muted">${t.lastDurationMs}ms</div>` : '<span class="text-muted">Pending</span>'}
                    </td>
                    <td>
                      <span class="badge badge-${t.lastStatus === 'success' ? 'success' : (t.lastStatus === 'failed' ? 'danger' : 'secondary')}">
                        ${escapeHTML(t.lastStatus || 'idle')}
                      </span>
                    </td>
                    <td>
                      <div class="flex gap-2">
                        <button class="btn btn-secondary btn-sm" onclick="triggerRunTask('${escapeHTML(t.id)}')">⚡ Run</button>
                        <button class="btn btn-secondary btn-sm" onclick="showTaskLogsModal('${escapeHTML(t.id)}', '${escapeHTML(t.name)}')">Logs</button>
                        <button class="btn btn-danger btn-sm" onclick="deleteAutomationTask('${escapeHTML(t.id)}')">Delete</button>
                      </div>
                    </td>
                  </tr>
                `).join('')}
              </tbody>
            </table>
          </div>
        ` : `
          <div class="empty-state py-4">
            <p class="text-muted">No custom scheduled tasks configured yet. Click <strong>+ Add Automation Task</strong> to create one.</p>
          </div>
        `}
      </div>
    </div>

    <!-- Traditional Crontab (crontab -l) -->
    <div class="card">
      <div class="card-header flex justify-between items-center">
        <div>
          <h3 class="card-title">System Crontab (/etc/crontab)</h3>
          <p class="text-xs text-secondary">Direct user crontab entries managed by cron daemon</p>
        </div>
        <span class="badge badge-secondary">${crontabJobs.length} Crontab Lines</span>
      </div>
      <div class="card-body">
        ${crontabJobs.length > 0 ? `
          <div class="table-wrap">
            <table class="table">
              <thead><tr><th>Schedule</th><th>Command</th><th>Actions</th></tr></thead>
              <tbody>
                ${crontabJobs.map((j) => `
                  <tr>
                    <td class="text-mono text-sm">${escapeHTML(j.schedule)}</td>
                    <td class="text-mono text-sm truncate" style="max-width:400px">${escapeHTML(j.command)}</td>
                    <td><button class="btn btn-sm btn-danger" onclick="deleteCron(${j.id})">Delete</button></td>
                  </tr>
                `).join('')}
              </tbody>
            </table>
          </div>
        ` : `
          <div class="empty-state py-4"><p class="text-muted">No raw crontab lines active for user root.</p></div>
        `}
      </div>
    </div>
  `;
}

// ─── Trigger Task Run Immediately ───────────────────────────

async function triggerRunTask(taskId) {
  toast(`Executing automation task ${taskId}…`, 'info');
  const res = await api(`/cron/automation/${encodeURIComponent(taskId)}/run`, { method: 'POST' });

  if (res?.success) {
    const result = res.result;
    showModal(
      `Execution Result: ${taskId}`,
      `
        <div style="margin-bottom: 12px;">
          <div class="flex justify-between items-center mb-2">
            <span>Status: <strong class="badge badge-${result.status === 'success' ? 'success' : 'danger'}">${result.status.toUpperCase()}</strong></span>
            <span class="text-xs text-muted">Execution Duration: <strong>${result.durationMs}ms</strong></span>
          </div>
          <span class="text-xs text-muted">Triggered at: ${new Date(result.timestamp).toLocaleString()}</span>
        </div>
        <div>
          <label style="font-size: 12px; font-weight: 600; color: var(--accent-light, #818cf8);">Task Output Console:</label>
          <pre style="background: rgba(0,0,0,0.6); padding: 12px; border-radius: 6px; font-size: 12px; max-height: 280px; overflow: auto; color: #38bdf8; margin-top: 6px;"><code>${escapeHTML(result.output || 'Task executed with empty output')}</code></pre>
        </div>
      `,
      `<button class="btn btn-secondary" onclick="closeModal()">Close</button>`
    );
    // Refresh page state
    const container = document.getElementById('main-content');
    if (container) renderCron(container);
  } else {
    toast(res?.error || 'Failed to execute task', 'error');
  }
}

// ─── View Task Logs Modal ───────────────────────────────────

async function showTaskLogsModal(taskId, taskName) {
  toast('Loading task history logs…', 'info');
  const res = await api(`/cron/automation/${encodeURIComponent(taskId)}/logs`);
  showModal(
    `Logs: ${taskName}`,
    `
      <div style="margin-bottom: 10px;">
        <span class="text-xs text-muted">Recent execution history and output for <strong>${escapeHTML(taskId)}</strong>:</span>
      </div>
      <pre style="background: rgba(0,0,0,0.6); padding: 12px; border-radius: 6px; font-size: 11px; max-height: 340px; overflow: auto; color: #e2e8f0; font-family: monospace;"><code>${escapeHTML(res?.logs || 'No logs available')}</code></pre>
    `,
    `<button class="btn btn-secondary" onclick="closeModal()">Close</button>`
  );
}

// ─── Add Custom Automation Modal ────────────────────────────

function showNewAutomationModal() {
  showModal(
    'New Server-Side Automation Task',
    `
      <div class="flex flex-col gap-4">
        <div class="form-group">
          <label for="auto-task-name">Task Name</label>
          <input type="text" id="auto-task-name" placeholder="e.g. Daily Database Dump or Sync Assets" required>
        </div>
        <div class="form-group">
          <label for="auto-task-schedule">Cron Schedule</label>
          <input type="text" id="auto-task-schedule" placeholder="*/15 * * * *" value="*/15 * * * *" required>
          <div class="flex gap-2 mt-2">
            <button type="button" class="btn btn-secondary btn-sm" onclick="document.getElementById('auto-task-schedule').value='*/5 * * * *'">Every 5m</button>
            <button type="button" class="btn btn-secondary btn-sm" onclick="document.getElementById('auto-task-schedule').value='*/15 * * * *'">Every 15m</button>
            <button type="button" class="btn btn-secondary btn-sm" onclick="document.getElementById('auto-task-schedule').value='0 * * * *'">Hourly</button>
            <button type="button" class="btn btn-secondary btn-sm" onclick="document.getElementById('auto-task-schedule').value='0 2 * * *'">Daily 2am</button>
          </div>
        </div>
        <div class="form-group">
          <label for="auto-task-cmd">Shell / CLI Command</label>
          <input type="text" id="auto-task-cmd" placeholder="e.g. /usr/bin/python3 /opt/deols/scripts/backup.py" required>
          <span class="form-hint">Command will be executed server-side under root/service context</span>
        </div>
      </div>
    `,
    `
      <button class="btn btn-secondary" onclick="closeModal()">Cancel</button>
      <button class="btn btn-primary" onclick="submitNewAutomationTask()">Create Automation Task</button>
    `
  );
}

async function submitNewAutomationTask() {
  const name = document.getElementById('auto-task-name')?.value;
  const schedule = document.getElementById('auto-task-schedule')?.value;
  const command = document.getElementById('auto-task-cmd')?.value;

  if (!name || !schedule || !command) {
    toast('Please fill all required fields', 'error');
    return;
  }

  const res = await api('/cron/automation', {
    method: 'POST',
    body: { name, schedule, command },
  });

  if (res?.success) {
    toast(`Automation task "${name}" created!`, 'success');
    closeModal();
    const container = document.getElementById('main-content');
    if (container) renderCron(container);
  } else {
    toast(res?.error || 'Failed to create automation task', 'error');
  }
}

async function deleteAutomationTask(taskId) {
  if (!confirm(`Are you sure you want to delete automation task ${taskId}?`)) return;
  const res = await api(`/cron/automation/${encodeURIComponent(taskId)}`, { method: 'DELETE' });
  if (res?.success) {
    toast('Task removed', 'success');
    const container = document.getElementById('main-content');
    if (container) renderCron(container);
  } else {
    toast(res?.error || 'Failed to delete task', 'error');
  }
}

// ─── Standard Crontab Handlers ──────────────────────────────

function showNewCronModal() {
  showModal('New Standard Crontab Line', `
    <div class="flex flex-col gap-4">
      <div class="form-group">
        <label>Schedule (cron format)</label>
        <input type="text" id="cron-schedule" placeholder="*/5 * * * *">
        <span class="form-hint">minute hour day month weekday</span>
      </div>
      <div class="form-group">
        <label>Command</label>
        <input type="text" id="cron-command" placeholder="/usr/local/bin/wp cron event run --due-now">
      </div>
    </div>
  `, `
    <button class="btn btn-secondary" onclick="closeModal()">Cancel</button>
    <button class="btn btn-primary" onclick="addCron()">Add</button>
  `);
}

async function addCron() {
  const schedule = document.getElementById('cron-schedule').value;
  const command = document.getElementById('cron-command').value;
  const result = await api('/cron', { method: 'POST', body: { schedule, command } });
  if (result?.success) { toast('Cron job added', 'success'); closeModal(); const c = document.getElementById('main-content'); if (c) renderCron(c); }
  else toast(result?.error || 'Failed', 'error');
}

async function deleteCron(index) {
  if (!confirm('Delete this cron job?')) return;
  const result = await api(`/cron/${index}`, { method: 'DELETE' });
  if (result?.success) { toast('Cron job deleted', 'success'); const c = document.getElementById('main-content'); if (c) renderCron(c); }
  else toast(result?.error || 'Failed', 'error');
}

// ─── Terminal Page ──────────────────────────────────────────

function renderTerminal(container) {
  container.innerHTML = `
    <div class="terminal-container">
      <div class="terminal-header" style="display:flex; justify-content:space-between; align-items:center;">
        <div style="display:flex; align-items:center; gap:6px;">
          <span class="terminal-dot red"></span>
          <span class="terminal-dot yellow"></span>
          <span class="terminal-dot green"></span>
          <span class="text-sm text-muted" style="margin-left:8px; font-family:var(--font-mono);">root@deols:~#</span>
        </div>
        <span class="text-xs text-muted">Type commands (e.g. <code>ls -la</code>, <code>uptime</code>, <code>systemctl status lsws</code>, <code>clear</code>)</span>
      </div>
      <div class="terminal-body" id="terminal-output" style="height:480px; overflow-y:auto; padding:16px; font-family:var(--font-mono); background:#0d1117;">
        <div style="margin-bottom:12px;color:#58a6ff;">⚡ DEOLS Server Terminal (Debian 12 Bookworm)</div>
        <div class="flex items-center gap-2" id="terminal-prompt-line">
          <span style="color:#79c0ff; font-weight:600;">root@deols:~#</span>
          <input type="text" id="terminal-input" style="flex:1;background:none;border:none;color:#c9d1d9;font-family:var(--font-mono);font-size:0.85rem;outline:none" placeholder="Type a command…" autofocus autocomplete="off" spellcheck="false">
        </div>
      </div>
    </div>
  `;

  const input = document.getElementById('terminal-input');
  const output = document.getElementById('terminal-output');
  const promptLine = document.getElementById('terminal-prompt-line');
  const cmdHistory = [];
  let historyIdx = -1;

  input?.focus();

  input?.addEventListener('keydown', async (e) => {
    if (e.key === 'ArrowUp') {
      e.preventDefault();
      if (cmdHistory.length && historyIdx < cmdHistory.length - 1) {
        historyIdx++;
        input.value = cmdHistory[cmdHistory.length - 1 - historyIdx] || '';
      }
      return;
    }
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (historyIdx > 0) {
        historyIdx--;
        input.value = cmdHistory[cmdHistory.length - 1 - historyIdx] || '';
      } else {
        historyIdx = -1;
        input.value = '';
      }
      return;
    }

    if (e.key !== 'Enter') return;

    const cmd = input.value.trim();
    if (!cmd) return;

    cmdHistory.push(cmd);
    historyIdx = -1;

    if (cmd === 'clear') {
      renderTerminal(container);
      return;
    }

    const cmdLine = document.createElement('div');
    cmdLine.style.cssText = 'margin: 6px 0 2px;';
    cmdLine.innerHTML = `<span style="color:#79c0ff; font-weight:600;">root@deols:~#</span> <span style="color:#f0f6fc;">${escapeHTML(cmd)}</span>`;
    output.insertBefore(cmdLine, promptLine);

    input.value = '';
    input.disabled = true;

    const result = await api('/terminal/exec', { method: 'POST', body: { command: cmd } });
    input.disabled = false;
    input.focus();

    if (result) {
      const resultEl = document.createElement('pre');
      resultEl.style.cssText = 'margin:2px 0 10px; white-space:pre-wrap; word-break:break-all; color:#8b949e; line-height:1.4;';
      resultEl.textContent = result.stdout || result.stderr || '(command executed with no output)';
      if (result.code !== 0) resultEl.style.color = '#f85149';
      output.insertBefore(resultEl, promptLine);
    }

    output.scrollTop = output.scrollHeight;
  });
}

// ─── Git Page ───────────────────────────────────────────────

async function renderGit(container) {
  container.innerHTML = `
    <div class="flex justify-between items-center mb-6">
      <p class="text-muted">Git repository sync and SSH key management</p>
      <div class="flex gap-3">
        <button class="btn btn-primary" onclick="showNewSyncModal()">+ Connect Repo</button>
        <button class="btn btn-secondary" onclick="showAddKeyModal()">+ Add SSH Key</button>
      </div>
    </div>
    <div class="card">
      <div class="card-header"><h2 class="card-title">Repository Connections</h2></div>
      <div class="card-body" id="git-list"><p class="text-muted">Loading…</p></div>
    </div>
    <div class="card">
      <div class="card-header"><h2 class="card-title">SSH Keys</h2></div>
      <div class="card-body" id="ssh-keys-list"><p class="text-muted">Loading…</p></div>
    </div>
  `;

  const [syncs, keys] = await Promise.all([api('/git/sync'), api('/git/ssh-keys')]);

  if (syncs?.connections?.length) {
    document.getElementById('git-list').innerHTML = `
      <div class="table-wrap"><table class="table">
        <thead><tr><th>Domain</th><th>Repository</th><th>Branch</th><th>Last Sync</th><th>Actions</th></tr></thead>
        <tbody>${syncs.connections.map((c) => `
          <tr>
            <td><strong>${escapeHTML(c.domain)}</strong></td>
            <td class="text-sm text-mono truncate" style="max-width:250px">${escapeHTML(c.repoUrl)}</td>
            <td><span class="badge badge-info">${escapeHTML(c.branch)}</span></td>
            <td class="text-sm text-muted">${timeAgo(c.lastSync)}</td>
            <td>
              <div class="flex gap-2">
                <button class="btn btn-sm btn-success" onclick="gitPull('${c.id}')">Pull</button>
                <button class="btn btn-sm btn-danger" onclick="gitRemove('${c.id}')">Remove</button>
              </div>
            </td>
          </tr>
        `).join('')}</tbody>
      </table></div>
    `;
  } else {
    document.getElementById('git-list').innerHTML = '<div class="empty-state"><h3>No Repositories Connected</h3></div>';
  }

  if (keys?.keys?.length) {
    document.getElementById('ssh-keys-list').innerHTML = keys.keys.map((k) => `
      <div class="service-row">
        <div class="service-info">
          <span class="text-mono text-sm">${escapeHTML(k.type)}</span>
          <span class="text-sm text-muted truncate" style="max-width:300px">${escapeHTML(k.comment)}</span>
        </div>
        <button class="btn btn-sm btn-danger" onclick="removeSSHKey(${k.id})">Remove</button>
      </div>
    `).join('');
  } else {
    document.getElementById('ssh-keys-list').innerHTML = '<p class="text-muted" style="padding:16px">No SSH keys found</p>';
  }
}

function showNewSyncModal() {
  showModal('Connect Git Repository', `
    <div class="flex flex-col gap-4">
      <div class="form-group"><label>Domain</label><input type="text" id="sync-domain" placeholder="example.com" required></div>
      <div class="form-group"><label>Repository URL</label><input type="url" id="sync-repo" placeholder="git@github.com:user/repo.git" required></div>
      <div class="form-group"><label>Branch</label><input type="text" id="sync-branch" value="main"></div>
    </div>
  `, `
    <button class="btn btn-secondary" onclick="closeModal()">Cancel</button>
    <button class="btn btn-primary" onclick="createSync()">Connect</button>
  `);
}

async function createSync() {
  const result = await api('/git/sync', {
    method: 'POST',
    body: {
      domain: document.getElementById('sync-domain').value,
      repoUrl: document.getElementById('sync-repo').value,
      branch: document.getElementById('sync-branch').value || 'main',
    },
  });
  if (result?.success) { toast('Repository connected!', 'success'); closeModal(); navigateTo('git'); }
  else toast(result?.error || 'Failed', 'error');
}

async function gitPull(id) {
  toast('Pulling latest changes…', 'info');
  const result = await api(`/git/sync/${id}/pull`, { method: 'POST' });
  if (result?.success) toast('Pull successful!', 'success');
  else toast(result?.error || 'Pull failed', 'error');
}

async function gitRemove(id) {
  if (!confirm('Remove this repository connection?')) return;
  const result = await api(`/git/sync/${id}`, { method: 'DELETE' });
  if (result?.success) { toast('Removed', 'success'); navigateTo('git'); }
}

function showAddKeyModal() {
  showModal('Add SSH Key', `
    <div class="form-group">
      <label>Public Key</label>
      <textarea id="ssh-key-input" placeholder="ssh-ed25519 AAAA..." rows="4"></textarea>
    </div>
  `, `
    <button class="btn btn-secondary" onclick="closeModal()">Cancel</button>
    <button class="btn btn-primary" onclick="addSSHKey()">Add Key</button>
  `);
}

async function addSSHKey() {
  const key = document.getElementById('ssh-key-input').value;
  const result = await api('/git/ssh-keys', { method: 'POST', body: { key } });
  if (result?.success) { toast('SSH key added', 'success'); closeModal(); navigateTo('git'); }
  else toast(result?.error || 'Failed', 'error');
}

async function removeSSHKey(index) {
  if (!confirm('Remove this SSH key?')) return;
  const result = await api(`/git/ssh-keys/${index}`, { method: 'DELETE' });
  if (result?.success) { toast('Key removed', 'success'); navigateTo('git'); }
}

// ─── Python Services Page ───────────────────────────────────

async function renderPython(container) {
  container.innerHTML = `
    <div class="flex justify-between items-center mb-6">
      <p class="text-muted">Manage custom Python background services</p>
      <button class="btn btn-primary" onclick="showNewPyServiceModal()">+ New Service</button>
    </div>
    <div class="card">
      <div class="card-body" id="py-list"><p class="text-muted">Loading…</p></div>
    </div>
  `;

  const data = await api('/python');
  const el = document.getElementById('py-list');

  if (data?.services?.length) {
    el.innerHTML = data.services.map((s) => `
      <div class="service-row">
        <div class="service-info">
          <span class="status-dot ${s.active ? 'active' : 'inactive'}"></span>
          <div>
            <span class="service-name">${escapeHTML(s.name)}</span>
            <span class="text-sm text-muted" style="display:block">${escapeHTML(s.description || s.serviceName)}</span>
          </div>
        </div>
        <div class="service-actions">
          <button class="btn btn-sm btn-success" onclick="pyAction('${s.id}','start')">Start</button>
          <button class="btn btn-sm btn-danger" onclick="pyAction('${s.id}','stop')">Stop</button>
          <button class="btn btn-sm btn-secondary" onclick="pyAction('${s.id}','restart')">Restart</button>
          <button class="btn btn-sm btn-danger" onclick="deletePyService('${s.id}')">Delete</button>
        </div>
      </div>
    `).join('');
  } else {
    el.innerHTML = '<div class="empty-state"><h3>No Python Services</h3><p>Create custom background services with Python</p></div>';
  }
}

function showNewPyServiceModal() {
  showModal('New Python Service', `
    <div class="flex flex-col gap-4">
      <div class="form-group"><label>Service Name</label><input type="text" id="py-name" placeholder="my-bot" required></div>
      <div class="form-group"><label>Description</label><input type="text" id="py-desc" placeholder="My custom bot service"></div>
      <div class="form-group"><label>Script Content (main.py)</label><textarea id="py-script" rows="8" placeholder="import time\nwhile True:\n    print('Running...')\n    time.sleep(60)"></textarea></div>
      <div class="form-group"><label>Requirements (pip packages)</label><textarea id="py-reqs" rows="3" placeholder="requests\nflask"></textarea></div>
    </div>
  `, `
    <button class="btn btn-secondary" onclick="closeModal()">Cancel</button>
    <button class="btn btn-primary" onclick="createPyService()">Create</button>
  `);
}

async function createPyService() {
  const result = await api('/python', {
    method: 'POST',
    body: {
      name: document.getElementById('py-name').value,
      description: document.getElementById('py-desc').value,
      scriptContent: document.getElementById('py-script').value,
      requirements: document.getElementById('py-reqs').value,
    },
  });
  if (result?.success) { toast('Python service created!', 'success'); closeModal(); navigateTo('python'); }
  else toast(result?.error || 'Failed', 'error');
}

async function pyAction(id, action) {
  const result = await api(`/python/${id}/${action}`, { method: 'POST' });
  if (result?.success) { toast(`Service ${action} successful`, 'success'); navigateTo('python'); }
  else toast(result?.error || 'Failed', 'error');
}

async function deletePyService(id) {
  if (!confirm('Delete this Python service?')) return;
  const result = await api(`/python/${id}`, { method: 'DELETE' });
  if (result?.success) { toast('Service deleted', 'success'); navigateTo('python'); }
  else toast(result?.error || 'Failed', 'error');
}

// ─── Firewall Page ──────────────────────────────────────────

async function renderFirewall(container) {
  container.innerHTML = `
    <div class="flex justify-between items-center mb-6">
      <p class="text-muted">UFW Firewall Management</p>
      <div class="flex gap-3">
        <button class="btn btn-primary" onclick="showAddRuleModal()">+ Add Rule</button>
        <button class="btn btn-success" id="fw-enable-btn" onclick="fwEnable()">Enable</button>
        <button class="btn btn-danger" id="fw-disable-btn" onclick="fwDisable()">Disable</button>
      </div>
    </div>
    <div class="card">
      <div class="card-header"><h2 class="card-title">Firewall Rules</h2></div>
      <div class="card-body" id="fw-rules"><p class="text-muted">Loading…</p></div>
    </div>
  `;

  const [status, rules] = await Promise.all([api('/firewall/status'), api('/firewall/rules')]);

  if (rules?.rules?.length) {
    document.getElementById('fw-rules').innerHTML = `
      <div class="table-wrap"><table class="table">
        <thead><tr><th>#</th><th>Rule</th><th>Actions</th></tr></thead>
        <tbody>${rules.rules.map((r) => `
          <tr>
            <td>${r.number}</td>
            <td class="text-mono text-sm">${escapeHTML(r.rule)}</td>
            <td><button class="btn btn-sm btn-danger" onclick="fwDeleteRule(${r.number})">Delete</button></td>
          </tr>
        `).join('')}</tbody>
      </table></div>
    `;
  } else {
    document.getElementById('fw-rules').innerHTML = '<p class="text-muted" style="padding:8px">No rules configured</p>';
  }
}

function showAddRuleModal() {
  showModal('Add Firewall Rule', `
    <div class="flex flex-col gap-4">
      <div class="form-row">
        <div class="form-group"><label>Action</label><select id="fw-action"><option value="allow">Allow</option><option value="deny">Deny</option><option value="reject">Reject</option></select></div>
        <div class="form-group"><label>Port</label><input type="number" id="fw-port" placeholder="8080" required></div>
      </div>
      <div class="form-group"><label>Protocol</label><select id="fw-proto"><option value="tcp">TCP</option><option value="udp">UDP</option></select></div>
    </div>
  `, `
    <button class="btn btn-secondary" onclick="closeModal()">Cancel</button>
    <button class="btn btn-primary" onclick="fwAddRule()">Add Rule</button>
  `);
}

async function fwAddRule() {
  const result = await api('/firewall/rules', {
    method: 'POST',
    body: {
      action: document.getElementById('fw-action').value,
      port: document.getElementById('fw-port').value,
      protocol: document.getElementById('fw-proto').value,
    },
  });
  if (result?.success) { toast('Rule added', 'success'); closeModal(); navigateTo('firewall'); }
  else toast(result?.output || 'Failed', 'error');
}

async function fwDeleteRule(number) {
  if (!confirm('Delete this rule?')) return;
  const result = await api(`/firewall/rules/${number}`, { method: 'DELETE' });
  if (result?.success) { toast('Rule deleted', 'success'); navigateTo('firewall'); }
}

async function fwEnable() {
  const result = await api('/firewall/enable', { method: 'POST' });
  toast(result?.success ? 'Firewall enabled' : 'Failed', result?.success ? 'success' : 'error');
  navigateTo('firewall');
}

async function fwDisable() {
  if (!confirm('Disable firewall?')) return;
  const result = await api('/firewall/disable', { method: 'POST' });
  toast(result?.success ? 'Firewall disabled' : 'Failed', result?.success ? 'success' : 'error');
  navigateTo('firewall');
}

// ─── Security Page ──────────────────────────────────────────

async function renderSecurity(container) {
  const secStatus = await api('/security/status');
  const isActive = secStatus?.antiAttackMode || false;

  container.innerHTML = `
    <div class="shield-card ${isActive ? 'active' : ''}" id="shield-card">
      <svg class="shield-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
        <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
        <path d="M9 12l2 2 4-4"/>
      </svg>
      <h2 class="shield-title">${isActive ? '🛡️ ANTI-ATTACK MODE ACTIVE' : 'Emergency Anti-Attack Shield'}</h2>
      <p class="shield-desc">${isActive ? 'Your server is in lockdown mode. XMLRPC is blocked, rate limits are enforced, and Fail2ban is tightened.' : 'Instantly block XMLRPC, enforce aggressive rate limits, tighten Fail2ban, and activate OLS anti-bot protection.'}</p>
      <button class="btn ${isActive ? 'btn-success' : 'btn-danger'}" style="font-size:1rem;padding:12px 32px" onclick="toggleAntiAttack(${!isActive})">
        ${isActive ? '🔓 Deactivate Shield' : '🛡️ ACTIVATE SHIELD'}
      </button>
    </div>

    <div class="card">
      <div class="card-header"><h2 class="card-title">Server Hardening</h2></div>
      <div class="card-body">
        <p class="text-muted mb-4">One-click security hardening: disables password SSH login, enables UFW + Fail2ban, and disables unused services.</p>
        <button class="btn btn-primary" onclick="hardenServer()">🔒 Harden Server</button>
      </div>
    </div>

    <div class="card">
      <div class="card-header"><h2 class="card-title">Fail2ban Status</h2></div>
      <div class="card-body" id="f2b-status"><p class="text-muted">Loading…</p></div>
    </div>

    <div class="card">
      <div class="card-header"><h2 class="card-title">WordPress Fail2ban Setup</h2></div>
      <div class="card-body">
        <p class="text-muted mb-4">Auto-configure Fail2ban jails for wp-login.php, XMLRPC, and SSH protection.</p>
        <button class="btn btn-secondary" onclick="setupWPFail2ban()">Setup WordPress Jails</button>
      </div>
    </div>
  `;

  // Update badge
  const badge = document.getElementById('anti-attack-badge');
  if (badge) badge.style.display = isActive ? 'flex' : 'none';

  // Load fail2ban status
  const f2b = await api('/security/fail2ban');
  if (f2b) {
    document.getElementById('f2b-status').innerHTML = `<pre class="text-mono text-sm" style="white-space:pre-wrap">${escapeHTML(f2b.output || 'Fail2ban not running')}</pre>`;
  }
}

async function toggleAntiAttack(enable) {
  const msg = enable
    ? 'Activate Anti-Attack Mode? This will block XMLRPC, enforce strict rate limits, and tighten Fail2ban.'
    : 'Deactivate Anti-Attack Mode?';
  if (!confirm(msg)) return;

  toast(enable ? 'Activating Anti-Attack Shield…' : 'Deactivating…', 'info', 5000);
  const result = await api('/security/anti-attack', { method: 'POST', body: { enable } });
  if (result?.success) {
    toast(result.message, 'success', 6000);
    navigateTo('security');
  } else toast(result?.error || 'Failed', 'error');
}

async function hardenServer() {
  if (!confirm('This will disable password SSH login and enable firewall. Are you sure you have SSH key access?')) return;
  toast('Hardening server…', 'info', 8000);
  const result = await api('/security/harden', { method: 'POST' });
  if (result?.success) {
    const actions = result.actions?.join('\n• ') || 'Done';
    toast(`Server hardened!\n• ${actions}`, 'success', 10000);
  } else toast('Hardening failed', 'error');
}

async function setupWPFail2ban() {
  const result = await api('/security/fail2ban/setup-wordpress', { method: 'POST' });
  if (result?.success) toast(result.message, 'success');
  else toast(result?.error || 'Failed', 'error');
}

// ─── Server Auto-Tuner & Backup System Page ─────────────────

let tunerData = null;
let currentTunerPreset = 'auto';
let currentTunerRedis = false;
let activeTunerTab = 'tuner'; // 'tuner' | 'lean'
let leanData = null;
let currentLeanMode = 'lean'; // 'lean' | 'ultra_lean'
let currentOpcacheSize = 64;

function calculateClientAllocations(specs, preset = 'auto', enableRedis = false) {
  const ramMb = specs.ram;
  const cores = specs.cpu;
  const osOverheadMb = 250;

  let dbMb = 256;
  if (ramMb <= 1024) {
    dbMb = 256;
  } else if (ramMb <= 4096) {
    if (preset === 'conservative') dbMb = Math.round(ramMb * 0.35);
    else if (preset === 'aggressive') dbMb = Math.round(ramMb * 0.45);
    else dbMb = Math.round(ramMb * 0.40);
  } else {
    if (preset === 'conservative') dbMb = Math.round(ramMb * 0.50);
    else if (preset === 'aggressive') dbMb = Math.round(ramMb * 0.60);
    else dbMb = Math.round(ramMb * 0.55);
  }

  const redisMb = enableRedis ? Math.max(64, Math.round(ramMb * 0.10)) : 0;
  let availablePhpRamMb = ramMb - (osOverheadMb + dbMb + redisMb);
  if (availablePhpRamMb < 160) availablePhpRamMb = 160;

  const rawWorkers = Math.floor(availablePhpRamMb / 45);

  let maxAllowedWorkers;
  if (ramMb <= 1024 || cores <= 1) {
    maxAllowedWorkers = preset === 'conservative' ? 10 : (preset === 'aggressive' ? 12 : 11);
  } else if (ramMb <= 2048) {
    maxAllowedWorkers = preset === 'conservative' ? 20 : (preset === 'aggressive' ? 25 : 22);
  } else if (ramMb <= 4096) {
    maxAllowedWorkers = preset === 'conservative' ? 50 : (preset === 'aggressive' ? 60 : 55);
  } else {
    const coreCap = cores * (preset === 'conservative' ? 25 : (preset === 'aggressive' ? 35 : 30));
    maxAllowedWorkers = Math.min(Math.floor(ramMb / 45), coreCap);
  }

  const finalWorkers = Math.max(4, Math.min(rawWorkers, maxAllowedWorkers));

  return {
    totalRamMb: ramMb,
    cpuCores: cores,
    osOverheadMb,
    dbMb,
    redisMb,
    availablePhpRamMb,
    phpWorkers: finalWorkers,
    maxConns: finalWorkers,
  };
}

async function renderAutoTuner(container) {
  container.innerHTML = `<div class="p-8 text-center"><p class="text-muted">Loading Server Auto-Tuner & Resource Engine…</p></div>`;

  const [status, leanStatus] = await Promise.all([
    api('/advanced/tuner/status'),
    api('/advanced/lean-engine/status'),
  ]);

  if (!status) {
    container.innerHTML = `
      <div class="card p-6">
        <h3 class="text-danger mb-2">Access Denied or Failed to Load Auto-Tuner</h3>
        <p class="text-muted">Only users with Administrator role are authorized to inspect or tune server resource configurations.</p>
      </div>
    `;
    return;
  }

  tunerData = status;
  leanData = leanStatus || null;
  currentTunerPreset = (status.enabled && status.currentProfile && status.currentProfile !== 'native')
    ? status.currentProfile
    : 'auto';
  currentTunerRedis = Boolean(status.enableRedis);

  if (leanStatus) {
    currentLeanMode = (leanStatus.enabled && leanStatus.mode && leanStatus.mode !== 'standard')
      ? leanStatus.mode
      : 'lean';
    currentOpcacheSize = leanStatus.opcacheSize || 64;
  }

  if (activeTunerTab === 'lean') {
    renderLeanEngineContent(container);
  } else {
    renderAutoTunerContent(container);
  }
}

async function switchTunerTab(tab) {
  activeTunerTab = tab;
  const container = document.getElementById('content-body');
  if (!container) return;

  if (tab === 'lean') {
    if (!leanData) {
      leanData = await api('/advanced/lean-engine/status');
    }
    renderLeanEngineContent(container);
  } else {
    renderAutoTunerContent(container);
  }
}

function renderAutoTunerContent(container) {
  const isEnabled = tunerData.enabled;
  const profile = tunerData.currentProfile || 'native';
  const specs = tunerData.specs || { ram: 2048, cpu: 2, swap: 0 };
  const alloc = calculateClientAllocations(specs, currentTunerPreset, currentTunerRedis);

  const osPct = Math.max(5, Math.round((alloc.osOverheadMb / alloc.totalRamMb) * 100));
  const dbPct = Math.max(10, Math.round((alloc.dbMb / alloc.totalRamMb) * 100));
  const redisPct = alloc.redisMb ? Math.max(5, Math.round((alloc.redisMb / alloc.totalRamMb) * 100)) : 0;
  const phpPct = Math.max(15, 100 - (osPct + dbPct + redisPct));

  container.innerHTML = `
    <!-- Top Sub-Tabs Navigation Bar -->
    <div class="tuner-tabs-bar">
      <button class="tuner-tab-btn ${activeTunerTab === 'tuner' ? 'active' : ''}" onclick="switchTunerTab('tuner')">
        <span>⚡ Auto-Tuner & Resource Allocation</span>
        ${isEnabled ? `<span class="badge badge-success" style="font-size:10px;padding:2px 6px;">⚡ Active (${profile.toUpperCase()})</span>` : ''}
      </button>
      <button class="tuner-tab-btn ${activeTunerTab === 'lean' ? 'active' : ''}" onclick="switchTunerTab('lean')">
        <span>🚀 Lean Engine & Speed Optimizations</span>
        ${leanData?.enabled ? `<span class="badge badge-success" style="font-size:10px;padding:2px 6px;">⚡ Active (${(leanData.mode || 'lean').toUpperCase()})</span>` : ''}
      </button>
    </div>

    <!-- Header with Master Status -->
    <div class="flex justify-between items-center mb-6 flex-wrap gap-4">
      <div>
        <div class="flex items-center gap-3">
          <h2 style="font-size:1.4rem;font-weight:700;margin:0;">Server Auto-Tuner & Backup System</h2>
          <span class="badge ${isEnabled ? 'badge-success' : ''}" style="${!isEnabled ? 'background:rgba(100,116,139,0.18);color:#94a3b8;' : ''};padding:6px 12px;font-size:12px;">
            ${isEnabled ? `⚡ Auto-Tuned Profile Active (${profile.toUpperCase()})` : '🛡️ Native System Defaults Active'}
          </span>
        </div>
        <p class="text-muted text-sm" style="margin-top:4px;">
          Hardware-tailored dynamic tuning for OpenLiteSpeed, MariaDB, and Redis with zero-downtime safety nets.
        </p>
      </div>

      <div class="flex items-center gap-3">
        <button class="btn btn-secondary btn-sm" onclick="navigateTo('autotuner')" title="Refresh hardware metrics">
          🔄 Refresh
        </button>
      </div>
    </div>

    <!-- Admin Warning Notice -->
    <div style="background: rgba(245, 158, 11, 0.08); border: 1px solid rgba(245, 158, 11, 0.25); border-radius: 8px; padding: 14px 18px; margin-bottom: 24px; display: flex; align-items: center; gap: 14px;">
      <svg style="width: 26px; height: 26px; color: #f59e0b; flex-shrink: 0;" viewBox="0 0 20 20" fill="currentColor">
        <path fill-rule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clip-rule="evenodd" />
      </svg>
      <div style="font-size: 13px; color: var(--text-secondary); line-height: 1.5;">
        <strong style="color: #f59e0b; font-weight: 600;">Admin Warning Notice:</strong>
        Modifying low-level server configuration impacts system stability. Automated baseline backups (<code>/var/backups/deols/system_defaults.tar.gz</code>) are created prior to applying changes.
      </div>
    </div>

    <!-- Master Switch & Control Toolbar Card -->
    <div class="card mb-6">
      <div class="card-header flex justify-between items-center">
        <div>
          <h3 class="card-title">Tuning Control & Master Switch</h3>
          <p class="text-muted text-xs">Toggle the tuner on or off. Restoring defaults rolls back all configurations.</p>
        </div>
        <div class="flex items-center gap-3">
          <label class="toggle" title="Toggle Auto-Tuner Master Switch">
            <input type="checkbox" id="tuner-master-toggle" ${isEnabled ? 'checked' : ''} onchange="toggleTunerMaster(this.checked)">
            <span class="toggle-slider"></span>
          </label>
          <span style="font-size:13px;font-weight:600;color:${isEnabled ? 'var(--success)' : 'var(--text-secondary)'};">
            ${isEnabled ? 'Tuning Enabled' : 'Tuning Disabled'}
          </span>
        </div>
      </div>
      <div class="card-body">
        <div class="mb-4">
          <label style="font-size:13px;font-weight:600;color:var(--text-primary);margin-bottom:8px;display:block;">
            Select Optimization Preset
          </label>
          <div class="tuner-preset-grid">
            <!-- Conservative -->
            <div class="tuner-preset-card ${currentTunerPreset === 'conservative' ? 'selected' : ''}" onclick="selectTunerPreset('conservative')">
              <span class="preset-badge" style="background:rgba(59,130,246,0.15);color:#3b82f6;">STABILITY</span>
              <h4 style="margin:0 0 6px;font-size:15px;font-weight:700;">Conservative</h4>
              <p class="text-muted text-xs" style="margin-bottom:12px;line-height:1.4;">
                Allocates 35% RAM to MariaDB buffer pool. Enforces strict worker caps (max 10-20 workers) to prevent OOM errors on entry-level servers.
              </p>
              <div class="text-xs text-muted" style="margin-top:auto;">
                <strong>Best for:</strong> 1GB VPS, bursty memory spikes, database-heavy apps.
              </div>
            </div>

            <!-- Auto (Recommended) -->
            <div class="tuner-preset-card ${currentTunerPreset === 'auto' ? 'selected' : ''}" onclick="selectTunerPreset('auto')">
              <span class="preset-badge" style="background:rgba(99,102,241,0.15);color:var(--accent-primary);">RECOMMENDED</span>
              <h4 style="margin:0 0 6px;font-size:15px;font-weight:700;">Auto (Adaptive)</h4>
              <p class="text-muted text-xs" style="margin-bottom:12px;line-height:1.4;">
                Optimal balance: 40% RAM for MariaDB (55% on >4GB), adaptive PHP concurrency, and balanced worker limits.
              </p>
              <div class="text-xs text-muted" style="margin-top:auto;">
                <strong>Best for:</strong> Production WordPress with LiteSpeed Cache.
              </div>
            </div>

            <!-- Aggressive -->
            <div class="tuner-preset-card ${currentTunerPreset === 'aggressive' ? 'selected' : ''}" onclick="selectTunerPreset('aggressive')">
              <span class="preset-badge" style="background:rgba(239,68,68,0.15);color:#ef4444;">HIGH TRAFFIC</span>
              <h4 style="margin:0 0 6px;font-size:15px;font-weight:700;">Aggressive</h4>
              <p class="text-muted text-xs" style="margin-bottom:12px;line-height:1.4;">
                Pushes MariaDB buffer pool to 45%-60% and unlocks higher PHP concurrency ceilings for high concurrent traffic.
              </p>
              <div class="text-xs text-muted" style="margin-top:auto;">
                <strong>Best for:</strong> Multi-core VPS (4GB+ RAM), high concurrent visitors.
              </div>
            </div>
          </div>
        </div>

        <!-- Redis Option -->
        <div style="background:var(--bg-tertiary);border-radius:8px;padding:12px 16px;margin-bottom:20px;display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:10px;">
          <div>
            <label for="tuner-redis-check" style="font-size:13px;font-weight:600;cursor:pointer;display:flex;align-items:center;gap:8px;margin:0;">
              <input type="checkbox" id="tuner-redis-check" ${currentTunerRedis ? 'checked' : ''} onchange="toggleTunerRedis(this.checked)">
              Allocate Dedicated Redis Cache Pool (10% of Total RAM)
            </label>
            <p class="text-muted text-xs" style="margin:4px 0 0 24px;">Configures Redis with <code>maxmemory-policy allkeys-lru</code> to accelerate object caching.</p>
          </div>
          <span class="badge" style="background:rgba(217,119,6,0.15);color:#d97706;font-size:12px;">
            ${alloc.redisMb ? `${alloc.redisMb} MB Pool` : 'No RAM Reserved'}
          </span>
        </div>

        <!-- Action Toolbar -->
        <div class="flex justify-between items-center flex-wrap gap-4 pt-2" style="border-top:1px solid var(--border-primary);">
          <div class="flex gap-3">
            <button class="btn btn-primary" id="btn-apply-tuner" onclick="applyTunerPreset()">
              🚀 Apply Selected Preset (${currentTunerPreset.toUpperCase()})
            </button>
          </div>
          <div>
            <button class="btn btn-danger" id="btn-restore-tuner" onclick="restoreTunerDefaults()" ${!tunerData.backupExists && !isEnabled ? 'disabled' : ''}>
              🔄 Restore Factory System Defaults
            </button>
          </div>
        </div>
      </div>
    </div>

    <!-- Real-Time Allocation Preview Card -->
    <div class="card mb-6">
      <div class="card-header flex justify-between items-center">
        <div>
          <h3 class="card-title">Real-World Resource Allocation Preview</h3>
          <p class="text-muted text-xs">Hardware-derived allocation budget calculated safely for your server specs.</p>
        </div>
        <div class="flex items-center gap-2">
          <span class="badge" style="background:rgba(59,130,246,0.15);color:#38bdf8;font-size:12px;">
            RAM: ${specs.ram} MB
          </span>
          <span class="badge" style="background:rgba(139,92,246,0.15);color:#a78bfa;font-size:12px;">
            CPU: ${specs.cpu} vCPU
          </span>
          <span class="badge" style="background:rgba(16,185,129,0.15);color:#34d399;font-size:12px;">
            Swap: ${specs.swap} MB
          </span>
        </div>
      </div>
      <div class="card-body">
        <!-- Multi-segment visual allocation bar -->
        <div class="tuner-alloc-bar">
          <div class="tuner-alloc-segment" style="width:${osPct}%; background:#64748b;" title="OS Base Overhead: ${alloc.osOverheadMb} MB (${osPct}%)">
            OS ${alloc.osOverheadMb}M
          </div>
          <div class="tuner-alloc-segment" style="width:${dbPct}%; background:#0284c7;" title="MariaDB Buffer Pool: ${alloc.dbMb} MB (${dbPct}%)">
            MariaDB ${alloc.dbMb}M
          </div>
          ${alloc.redisMb ? `
            <div class="tuner-alloc-segment" style="width:${redisPct}%; background:#d97706;" title="Redis Cache: ${alloc.redisMb} MB (${redisPct}%)">
              Redis ${alloc.redisMb}M
            </div>
          ` : ''}
          <div class="tuner-alloc-segment" style="width:${phpPct}%; background:#7c3aed;" title="Available PHP Pool: ${alloc.availablePhpRamMb} MB (${phpPct}%)">
            PHP Pool ${alloc.availablePhpRamMb}M (${alloc.phpWorkers} Workers)
          </div>
        </div>

        <!-- Legend -->
        <div class="tuner-alloc-legend">
          <div class="tuner-legend-item">
            <span class="tuner-legend-dot" style="background:#64748b;"></span>
            <span><strong>OS Overhead:</strong> ${alloc.osOverheadMb} MB (Reserved)</span>
          </div>
          <div class="tuner-legend-item">
            <span class="tuner-legend-dot" style="background:#0284c7;"></span>
            <span><strong>MariaDB Buffer:</strong> ${alloc.dbMb} MB (${dbPct}%)</span>
          </div>
          <div class="tuner-legend-item">
            <span class="tuner-legend-dot" style="background:#d97706;"></span>
            <span><strong>Redis Cache:</strong> ${alloc.redisMb ? `${alloc.redisMb} MB (10%)` : 'Disabled'}</span>
          </div>
          <div class="tuner-legend-item">
            <span class="tuner-legend-dot" style="background:#7c3aed;"></span>
            <span><strong>PHP Concurrency:</strong> ${alloc.phpWorkers} Workers (maxConns: ${alloc.phpWorkers})</span>
          </div>
        </div>

        <!-- Stat breakdown grid -->
        <div style="display:grid;grid-template-columns:repeat(auto-fit, minmax(200px, 1fr));gap:16px;margin-top:20px;">
          <div class="stat-card" style="padding:14px;">
            <span class="stat-card-label">MariaDB Buffer Pool</span>
            <div class="stat-card-value" style="font-size:1.3rem;color:#0284c7;">${alloc.dbMb} MB</div>
            <div class="stat-card-change"><code>innodb_buffer_pool_size</code></div>
          </div>
          <div class="stat-card" style="padding:14px;">
            <span class="stat-card-label">OpenLiteSpeed PHP Concurrency</span>
            <div class="stat-card-value" style="font-size:1.3rem;color:#7c3aed;">${alloc.phpWorkers} Workers</div>
            <div class="stat-card-change"><code>PHP_LSAPI_CHILDREN = ${alloc.phpWorkers}</code></div>
          </div>
          <div class="stat-card" style="padding:14px;">
            <span class="stat-card-label">Redis Cache Limit</span>
            <div class="stat-card-value" style="font-size:1.3rem;color:#d97706;">${alloc.redisMb ? `${alloc.redisMb} MB` : 'Disabled'}</div>
            <div class="stat-card-change"><code>maxmemory-policy: allkeys-lru</code></div>
          </div>
          <div class="stat-card" style="padding:14px;">
            <span class="stat-card-label">Swap Memory Guardrail</span>
            <div class="stat-card-value" style="font-size:1.3rem;color:#10b981;">${specs.swap ? `${specs.swap} MB` : '2048 MB Safe'}</div>
            <div class="stat-card-change"><code>vm.swappiness = 10</code></div>
          </div>
        </div>
      </div>
    </div>

    <!-- Terminal Diagnostic Helper: SSH Guide Box -->
    <div class="card mb-6" id="ssh-diag-card">
      <div class="card-header" style="cursor:pointer;user-select:none;" onclick="(function(){var b=document.getElementById('ssh-diag-body');var a=document.getElementById('ssh-diag-arrow');b.style.display=b.style.display==='none'?'block':'none';a.style.transform=b.style.display==='none'?'rotate(0deg)':'rotate(180deg)';})()" title="Expand / Collapse">
        <div class="flex items-center justify-between" style="width:100%;">
          <div class="flex items-center gap-3">
            <svg style="width:18px;height:18px;color:#38bdf8;flex-shrink:0;" viewBox="0 0 20 20" fill="currentColor">
              <path fill-rule="evenodd" d="M2 5a2 2 0 012-2h12a2 2 0 012 2v10a2 2 0 01-2 2H4a2 2 0 01-2-2V5zm3.293 1.293a1 1 0 011.414 0l3 3a1 1 0 010 1.414l-3 3a1 1 0 01-1.414-1.414L7.586 10 5.293 7.707a1 1 0 010-1.414zM11 12a1 1 0 100 2h3a1 1 0 100-2h-3z"/>
            </svg>
            <h3 class="card-title" style="margin:0;">🔍 How to Check Your Exact VPS Hardware Over SSH</h3>
            <span class="badge" style="background:rgba(56,189,248,0.12);color:#38bdf8;font-size:11px;padding:3px 8px;">Diagnostic Helper</span>
          </div>
          <svg id="ssh-diag-arrow" style="width:18px;height:18px;color:var(--text-secondary);transition:transform 0.2s ease;transform:rotate(180deg);" viewBox="0 0 20 20" fill="currentColor">
            <path fill-rule="evenodd" d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z"/>
          </svg>
        </div>
      </div>
      <div id="ssh-diag-body" class="card-body">
        <p class="text-muted text-sm mb-4" style="line-height:1.6;">
          The Auto-Tuner reads hardware specs automatically. To <strong>verify the exact values</strong> your VPS reports (or if you prefer manual input), run this single command in your SSH terminal:
        </p>

        <!-- Single copy-paste diagnostic command -->
        <div style="background:var(--bg-code,#0f172a);border:1px solid var(--border-primary);border-radius:8px;overflow:hidden;margin-bottom:20px;">
          <div style="display:flex;align-items:center;justify-content:space-between;padding:10px 16px;border-bottom:1px solid rgba(255,255,255,0.06);background:rgba(255,255,255,0.03);">
            <span style="font-size:11px;font-weight:600;color:#64748b;letter-spacing:0.5px;text-transform:uppercase;">SSH Terminal Command</span>
            <button id="btn-copy-diag-cmd" onclick="(function(){var cmd=document.getElementById('diag-cmd-text').textContent;navigator.clipboard.writeText(cmd).then(function(){var b=document.getElementById('btn-copy-diag-cmd');b.textContent='✓ Copied!';b.style.background='rgba(16,185,129,0.15)';b.style.color='#10b981';setTimeout(function(){b.textContent='Copy';b.style.background='';b.style.color='';},2000);}).catch(function(){});})();" style="font-size:12px;font-weight:600;padding:4px 12px;border-radius:5px;border:1px solid rgba(255,255,255,0.1);background:rgba(99,102,241,0.12);color:#a78bfa;cursor:pointer;transition:all 0.15s;">
              Copy
            </button>
          </div>
          <pre id="diag-cmd-text" style="margin:0;padding:14px 16px;font-family:'JetBrains Mono',monospace;font-size:13px;color:#38bdf8;white-space:pre-wrap;word-break:break-all;line-height:1.7;">${escapeHTML(tunerData.specs?.rawDiagCmd || 'echo "CPU Cores: $(nproc)" && echo "Total RAM: $(free -m | awk \'/Mem:/ {print $2}\') MB" && echo "Disk Space: $(df -m / | awk \'NR==2 {print $2}\') MB"')}</pre>
        </div>

        <!-- Expected output example -->
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-bottom:16px;" class="ssh-diag-grid">
          <div style="background:var(--bg-tertiary);border-radius:8px;padding:14px;border:1px solid var(--border-primary);">
            <div style="font-size:11px;font-weight:700;color:#64748b;letter-spacing:0.5px;text-transform:uppercase;margin-bottom:10px;">Expected Output Format</div>
            <pre style="margin:0;font-family:'JetBrains Mono',monospace;font-size:12px;color:#a3e635;line-height:1.8;">CPU Cores: ${specs.cpu || 2}
Total RAM: ${specs.ram || 2048} MB
Disk Space: ${specs.diskTotalMb || '—'} MB</pre>
          </div>
          <div style="background:var(--bg-tertiary);border-radius:8px;padding:14px;border:1px solid var(--border-primary);">
            <div style="font-size:11px;font-weight:700;color:#64748b;letter-spacing:0.5px;text-transform:uppercase;margin-bottom:10px;">Currently Detected (Live)</div>
            <div style="display:grid;gap:8px;">
              <div class="flex items-center justify-between">
                <span style="font-size:13px;color:var(--text-secondary);">🖥️ CPU Cores (nproc)</span>
                <span style="font-family:'JetBrains Mono',monospace;font-size:13px;font-weight:700;color:#a78bfa;">${specs.cpu || '—'} vCPU</span>
              </div>
              <div class="flex items-center justify-between">
                <span style="font-size:13px;color:var(--text-secondary);">🧠 Total RAM (free -m)</span>
                <span style="font-family:'JetBrains Mono',monospace;font-size:13px;font-weight:700;color:#38bdf8;">${specs.ram || '—'} MB</span>
              </div>
              <div class="flex items-center justify-between">
                <span style="font-size:13px;color:var(--text-secondary);">💽 Disk Space (df -m)</span>
                <span style="font-family:'JetBrains Mono',monospace;font-size:13px;font-weight:700;color:#34d399;">${specs.diskTotalMb ? `${specs.diskTotalMb} MB` : '—'}</span>
              </div>
              <div class="flex items-center justify-between">
                <span style="font-size:13px;color:var(--text-secondary);">🔄 Swap (free -m)</span>
                <span style="font-family:'JetBrains Mono',monospace;font-size:13px;font-weight:700;color:#fbbf24;">${specs.swap ? `${specs.swap} MB` : 'No Swap'}</span>
              </div>
            </div>
          </div>
        </div>

        <!-- CPU Model info -->
        ${specs.cpuModel ? `
        <div style="background:rgba(99,102,241,0.06);border:1px solid rgba(99,102,241,0.15);border-radius:8px;padding:10px 14px;display:flex;align-items:center;gap:10px;">
          <svg style="width:15px;height:15px;color:#818cf8;flex-shrink:0;" viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z"/></svg>
          <span style="font-size:13px;color:var(--text-secondary);">Detected Processor: <strong style="color:#818cf8;font-family:'JetBrains Mono',monospace;font-size:12px;">${escapeHTML(specs.cpuModel)}</strong></span>
        </div>
        ` : ''}
      </div>
    </div>

    <!-- Configuration Comparison & Safety Table -->
    <div class="card mb-6">
      <div class="card-header"><h3 class="card-title">Low-Level Parameter Comparison</h3></div>
      <div class="card-body">
        <div class="table-wrap">
          <table class="table">
            <thead>
              <tr>
                <th>Service</th>
                <th>Tuned Parameter</th>
                <th>Target Config Path</th>
                <th>Native Factory Default</th>
                <th>Auto-Tuned Allocation</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td><strong>OpenLiteSpeed</strong></td>
                <td><code>PHP_LSAPI_CHILDREN</code></td>
                <td class="text-mono text-xs">/usr/local/lsws/conf/httpd_config.conf</td>
                <td class="text-muted">35</td>
                <td class="text-bold" style="color:var(--accent-primary);">${alloc.phpWorkers}</td>
              </tr>
              <tr>
                <td><strong>OpenLiteSpeed</strong></td>
                <td><code>maxConns</code></td>
                <td class="text-mono text-xs">/usr/local/lsws/conf/httpd_config.conf</td>
                <td class="text-muted">35</td>
                <td class="text-bold" style="color:var(--accent-primary);">${alloc.phpWorkers}</td>
              </tr>
              <tr>
                <td><strong>MariaDB</strong></td>
                <td><code>innodb_buffer_pool_size</code></td>
                <td class="text-mono text-xs">/etc/mysql/mariadb.conf.d/99-deols-tuner.cnf</td>
                <td class="text-muted">128 MB</td>
                <td class="text-bold" style="color:#0284c7;">${alloc.dbMb} MB</td>
              </tr>
              <tr>
                <td><strong>MariaDB</strong></td>
                <td><code>innodb_flush_log_at_trx_commit</code></td>
                <td class="text-mono text-xs">/etc/mysql/mariadb.conf.d/99-deols-tuner.cnf</td>
                <td class="text-muted">1 (Strict Disk Write)</td>
                <td class="text-bold" style="color:#0284c7;">2 (OS Cached Write)</td>
              </tr>
              <tr>
                <td><strong>MariaDB</strong></td>
                <td><code>innodb_flush_method</code></td>
                <td class="text-mono text-xs">/etc/mysql/mariadb.conf.d/99-deols-tuner.cnf</td>
                <td class="text-muted">fsync</td>
                <td class="text-bold" style="color:#0284c7;">O_DIRECT</td>
              </tr>
              <tr>
                <td><strong>Redis Cache</strong></td>
                <td><code>maxmemory</code></td>
                <td class="text-mono text-xs">/etc/redis/redis.conf</td>
                <td class="text-muted">0 (Uncapped)</td>
                <td class="text-bold" style="color:#d97706;">${alloc.redisMb ? `${alloc.redisMb} MB` : 'N/A'}</td>
              </tr>
              <tr>
                <td><strong>Linux Kernel</strong></td>
                <td><code>vm.swappiness</code></td>
                <td class="text-mono text-xs">/etc/sysctl.d/99-deols-tuner.conf</td>
                <td class="text-muted">60</td>
                <td class="text-bold" style="color:#10b981;">10 (Prevent Unnecessary Swapping)</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>

    <!-- Automated Backup & Snapshot Status Card -->
    <div class="card">
      <div class="card-header"><h3 class="card-title">Automated Backup & Snapshot Engine</h3></div>
      <div class="card-body">
        <p class="text-muted text-sm mb-4">
          DEOLS automatically creates compressed baseline snapshots before any configuration modification.
        </p>

        <div style="display:grid;grid-template-columns:repeat(auto-fit, minmax(280px, 1fr));gap:14px;">
          <div style="background:var(--bg-tertiary);border-radius:8px;padding:14px;border:1px solid var(--border-primary);">
            <div class="flex items-center justify-between mb-2">
              <span style="font-size:13px;font-weight:700;">Baseline Defaults Snapshot</span>
              <span class="badge ${tunerData.backupExists ? 'badge-success' : ''}" style="${!tunerData.backupExists ? 'background:rgba(100,116,139,0.2);color:#94a3b8;' : ''};font-size:11px;">
                ${tunerData.backupExists ? 'Archived & Verified' : 'Created on First Activation'}
              </span>
            </div>
            <div class="text-mono text-xs text-muted mb-2">/var/backups/deols/system_defaults.tar.gz</div>
            <p class="text-xs text-muted" style="margin:0;">
              Captures unmodified factory state of OpenLiteSpeed, MariaDB, and Redis for 1-click disaster recovery.
            </p>
          </div>

          <div style="background:var(--bg-tertiary);border-radius:8px;padding:14px;border:1px solid var(--border-primary);">
            <div class="flex items-center justify-between mb-2">
              <span style="font-size:13px;font-weight:700;">Pre-Tuning Snapshot</span>
              <span class="badge badge-info" style="font-size:11px;">
                ${tunerData.manifest?.lastBackup ? 'Active' : 'Standby'}
              </span>
            </div>
            <div class="text-mono text-xs text-muted mb-2">/var/backups/deols/pre_tuning_backup.tar.gz</div>
            <p class="text-xs text-muted" style="margin:0;">
              ${tunerData.manifest?.lastBackup ? `Last snapshot: ${timeAgo(tunerData.manifest.lastBackup)}` : 'Captured dynamically prior to any preset change.'}
            </p>
          </div>
        </div>
      </div>
    </div>
  `;
}

function selectTunerPreset(preset) {
  currentTunerPreset = preset;
  const container = document.getElementById('content-body');
  if (container) renderAutoTunerContent(container);
}

function toggleTunerRedis(enable) {
  currentTunerRedis = enable;
  const container = document.getElementById('content-body');
  if (container) renderAutoTunerContent(container);
}

async function toggleTunerMaster(enable) {
  if (enable) {
    await applyTunerPreset();
  } else {
    await restoreTunerDefaults();
  }
}

async function applyTunerPreset() {
  const btn = document.getElementById('btn-apply-tuner');
  if (btn) {
    btn.disabled = true;
    btn.textContent = '⏳ Applying Tuning & Restarting Services…';
  }

  toast(`Applying Auto-Tuner preset "${currentTunerPreset}"…`, 'info', 6000);

  const res = await api('/advanced/tuner/enable', {
    method: 'POST',
    body: {
      preset: currentTunerPreset,
      enableRedis: currentTunerRedis,
    },
  });

  if (res?.success) {
    toast(res.message || 'Auto-Tuner profile activated successfully!', 'success', 6000);
    const container = document.getElementById('content-body');
    if (container) renderAutoTuner(container);
  } else {
    const errorMsg = res?.error || 'Failed to apply auto-tuner preset';
    const detailMsg = res?.details ? ` (${res.details.trim().slice(0, 160)})` : '';
    toast(errorMsg + detailMsg, 'error', 10000);
    const container = document.getElementById('content-body');
    if (container) renderAutoTuner(container);
  }
}

async function restoreTunerDefaults() {
  if (!confirm('Are you sure you want to restore all server configurations to factory defaults? Services will be gracefully restarted.')) {
    const container = document.getElementById('content-body');
    if (container) renderAutoTuner(container);
    return;
  }

  const btn = document.getElementById('btn-restore-tuner');
  if (btn) {
    btn.disabled = true;
    btn.textContent = '⏳ Restoring System Defaults…';
  }

  toast('Restoring baseline system defaults…', 'info', 6000);

  const res = await api('/advanced/tuner/restore', { method: 'POST' });
  if (res?.success) {
    toast(res.message || 'Restored system defaults successfully!', 'success', 6000);
    const container = document.getElementById('content-body');
    if (container) renderAutoTuner(container);
  } else {
    toast(res?.error || 'Failed to restore system defaults', 'error', 8000);
    const container = document.getElementById('content-body');
    if (container) renderAutoTuner(container);
  }
}

// ─── Lean Engine & Speed Optimizer Page ─────────────────────

function renderLeanEngineContent(container) {
  const isEnabled = Boolean(leanData?.enabled);
  const mode = leanData?.mode || currentLeanMode || 'lean';
  const specs = leanData?.specs || { ram: 2048, cpu: 2, diskTotalMb: 40960, swap: 0 };
  const metrics = leanData?.metrics || {
    idleTimeout: currentLeanMode === 'ultra_lean' ? 20 : 30,
    phpWorkers: currentLeanMode === 'ultra_lean' ? 12 : 16,
    maxConns: currentLeanMode === 'ultra_lean' ? 12 : 16,
    opcacheSize: currentOpcacheSize || 64,
    dbBufferPoolMb: 256,
    dbMaxConnections: currentLeanMode === 'ultra_lean' ? 40 : 50,
  };
  const savings = leanData?.savings || {
    estimatedRamSavedMb: Math.round(specs.ram * 0.32) || 650,
    phpMemorySavedMb: 450,
    dbMemorySavedMb: 200,
    idleTimeoutReductionPct: currentLeanMode === 'ultra_lean' ? 93 : 90,
    summaryText: `Reclaimed ~${Math.round(specs.ram * 0.32) || 650} MB RAM for PHP/MariaDB & Reduced Idle Worker Lifespan by 90%`,
  };

  container.innerHTML = `
    <!-- Top Sub-Tabs Navigation Bar -->
    <div class="tuner-tabs-bar">
      <button class="tuner-tab-btn ${activeTunerTab === 'tuner' ? 'active' : ''}" onclick="switchTunerTab('tuner')">
        <span>⚡ Auto-Tuner & Resource Allocation</span>
        ${tunerData?.enabled ? `<span class="badge badge-success" style="font-size:10px;padding:2px 6px;">⚡ Active (${(tunerData.currentProfile || 'native').toUpperCase()})</span>` : ''}
      </button>
      <button class="tuner-tab-btn ${activeTunerTab === 'lean' ? 'active' : ''}" onclick="switchTunerTab('lean')">
        <span>🚀 Lean Engine & Speed Optimizations</span>
        ${isEnabled ? `<span class="badge badge-success" style="font-size:10px;padding:2px 6px;">⚡ Active (${mode.toUpperCase()})</span>` : ''}
      </button>
    </div>

    <!-- Header with Master Status -->
    <div class="flex justify-between items-center mb-6 flex-wrap gap-4">
      <div>
        <div class="flex items-center gap-3 flex-wrap">
          <h2 style="font-size:1.4rem;font-weight:700;margin:0;">"Lean Engine" RAM & Speed Optimizer</h2>
          <span class="badge ${isEnabled ? 'badge-success' : ''}" style="${!isEnabled ? 'background:rgba(100,116,139,0.18);color:#94a3b8;' : ''};padding:6px 14px;font-size:12px;font-weight:700;">
            ${isEnabled ? `⚡ RAM Footprint Mode: Lean Engine Active (${mode.toUpperCase()})` : 'RAM Footprint Mode: Standard (Unoptimized)'}
          </span>
          <span class="badge" style="background:rgba(16,185,129,0.15);color:#10b981;padding:6px 14px;font-size:12px;font-weight:700;">
            💰 ${escapeHTML(savings.summaryText || `Reclaimed ~${savings.estimatedRamSavedMb} MB RAM`)}
          </span>
        </div>
        <p class="text-muted text-sm" style="margin-top:4px;">
          Dramatically lowers idle memory usage (&lt; 150MB target for entry VPS), eliminates stale PHP worker drain, accelerates OPcache, and enforces LSCache bypassing.
        </p>
      </div>

      <div class="flex items-center gap-3">
        <button class="btn btn-secondary btn-sm" onclick="renderAutoTuner(document.getElementById('content-body'))" title="Refresh metrics">
          🔄 Refresh
        </button>
      </div>
    </div>

    <!-- Impact & Savings Hero Highlight Cards -->
    <div class="lean-savings-card">
      <div class="flex justify-between items-center mb-2 flex-wrap gap-2">
        <span style="font-size:12px;font-weight:800;color:#10b981;text-transform:uppercase;letter-spacing:0.5px;">⚡ Real-World Optimization Impact</span>
        <span style="font-size:12px;color:var(--text-secondary);">Target: <strong>&lt; 150 MB Idle RAM Footprint</strong></span>
      </div>
      <div class="lean-stat-grid">
        <div style="background:var(--bg-card);border:1px solid rgba(16,185,129,0.25);border-radius:8px;padding:14px;">
          <span style="font-size:11px;font-weight:600;color:var(--text-secondary);text-transform:uppercase;">Estimated Memory Reclaimed</span>
          <div style="font-size:1.5rem;font-weight:800;color:#10b981;margin:4px 0;">~${savings.estimatedRamSavedMb} MB</div>
          <p class="text-muted text-xs" style="margin:0;">PHP pool + MariaDB buffer right-sizing</p>
        </div>
        <div style="background:var(--bg-card);border:1px solid rgba(99,102,241,0.25);border-radius:8px;padding:14px;">
          <span style="font-size:11px;font-weight:600;color:var(--text-secondary);text-transform:uppercase;">PHP Worker Idle Timeout</span>
          <div style="font-size:1.5rem;font-weight:800;color:#818cf8;margin:4px 0;">${metrics.idleTimeout}s</div>
          <p class="text-muted text-xs" style="margin:0;">Down from 300s (90% faster memory release)</p>
        </div>
        <div style="background:var(--bg-card);border:1px solid rgba(14,165,233,0.25);border-radius:8px;padding:14px;">
          <span style="font-size:11px;font-weight:600;color:var(--text-secondary);text-transform:uppercase;">Zend OPcache RAM Pool</span>
          <div style="font-size:1.5rem;font-weight:800;color:#38bdf8;margin:4px 0;">${currentOpcacheSize} MB</div>
          <p class="text-muted text-xs" style="margin:0;">10,000 files in shared bytecode cache</p>
        </div>
        <div style="background:var(--bg-card);border:1px solid rgba(245,158,11,0.25);border-radius:8px;padding:14px;">
          <span style="font-size:11px;font-weight:600;color:var(--text-secondary);text-transform:uppercase;">MariaDB Buffer Pool</span>
          <div style="font-size:1.5rem;font-weight:800;color:#fbbf24;margin:4px 0;">${metrics.dbBufferPoolMb} MB</div>
          <p class="text-muted text-xs" style="margin:0;">Capped max conns (${metrics.dbMaxConnections})</p>
        </div>
      </div>
    </div>

    <!-- Lean Optimization Engine Controls Card -->
    <div class="card mb-6">
      <div class="card-header flex justify-between items-center">
        <div>
          <h3 class="card-title">Lean Optimization Engine Controls</h3>
          <p class="text-muted text-xs">Configure and activate the Lean Engine. Includes atomic backups and safety snapshots.</p>
        </div>
        <div class="flex items-center gap-3">
          <label class="toggle" title="Toggle Lean Engine Master Switch">
            <input type="checkbox" id="lean-master-toggle" ${isEnabled ? 'checked' : ''} onchange="toggleLeanMaster(this.checked)">
            <span class="toggle-slider"></span>
          </label>
          <span style="font-size:13px;font-weight:600;color:${isEnabled ? 'var(--success)' : 'var(--text-secondary)'};">
            ${isEnabled ? 'Lean Mode Active' : 'Standard Mode'}
          </span>
        </div>
      </div>
      <div class="card-body">
        <label style="font-size:13px;font-weight:600;color:var(--text-primary);margin-bottom:8px;display:block;">
          Select Lean Optimization Profile
        </label>
        <div class="lean-mode-grid">
          <!-- Lean Mode (Balanced) -->
          <div class="lean-mode-card ${currentLeanMode === 'lean' ? 'selected' : ''}" onclick="selectLeanMode('lean')">
            <span class="mode-badge" style="background:rgba(16,185,129,0.15);color:#10b981;">RECOMMENDED</span>
            <h4 style="margin:0 0 6px;font-size:15px;font-weight:700;">🚀 Lean Engine (Balanced)</h4>
            <p class="text-muted text-xs" style="margin-bottom:12px;line-height:1.5;">
              Reduces PHP idle timeout to 30s, scales PHP workers to 10-16 processes, allocates ${specs.ram >= 4096 ? '128' : '64'}MB OPcache, and caps MariaDB at 256MB / 50 connections.
            </p>
            <div class="text-xs text-muted" style="margin-top:auto;border-top:1px solid var(--border-primary);padding-top:8px;">
              <strong>Best for:</strong> Standard WordPress production sites, WooCommerce, and blogs wanting fast TTFB with conservative RAM.
            </div>
          </div>

          <!-- Ultra Lean Mode -->
          <div class="lean-mode-card ${currentLeanMode === 'ultra_lean' ? 'selected' : ''}" onclick="selectLeanMode('ultra_lean')">
            <span class="mode-badge" style="background:rgba(239,68,68,0.15);color:#ef4444;">ENTRY VPS / LOW RAM</span>
            <h4 style="margin:0 0 6px;font-size:15px;font-weight:700;">⚡ Ultra Lean (Maximum RAM Savings)</h4>
            <p class="text-muted text-xs" style="margin-bottom:12px;line-height:1.5;">
              Aggressive 20s PHP idle timeout, strictly bounds PHP workers to 8-12 processes, 48-64MB OPcache, and limits MariaDB to 40 connections.
            </p>
            <div class="text-xs text-muted" style="margin-top:auto;border-top:1px solid var(--border-primary);padding-top:8px;">
              <strong>Best for:</strong> 1GB or 512MB RAM VPS instances, micro cloud containers, targeting &lt; 150MB total system idle memory.
            </div>
          </div>
        </div>

        <!-- Zend OPcache Allocation Options -->
        <div style="background:var(--bg-tertiary);border-radius:8px;padding:14px 18px;margin-top:20px;border:1px solid var(--border-primary);">
          <div class="flex justify-between items-center flex-wrap gap-3">
            <div>
              <strong style="font-size:13px;display:block;">Zend OPcache Memory Allocation</strong>
              <span class="text-muted text-xs">Shared memory dedicated to pre-compiled PHP script execution in RAM.</span>
            </div>
            <div class="flex items-center gap-2 flex-wrap">
              ${[32, 64, 128, 256].map((sz) => `
                <button type="button" class="btn btn-sm ${currentOpcacheSize === sz ? 'btn-primary' : 'btn-secondary'}" onclick="selectLeanOpcache(${sz})" style="padding:4px 12px;font-size:12px;font-weight:600;">
                  ${sz} MB ${sz === 64 ? '(Default)' : (sz === 128 ? '(4GB+)' : '')}
                </button>
              `).join('')}
            </div>
          </div>
        </div>

        <!-- Action Toolbar -->
        <div class="flex justify-between items-center flex-wrap gap-4 pt-4 mt-4" style="border-top:1px solid var(--border-primary);">
          <div class="flex gap-3">
            <button class="btn btn-primary" id="btn-apply-lean" onclick="applyLeanEngine()" style="background:linear-gradient(135deg, #10b981, #059669);border:none;">
              🚀 Enable Lean Engine Mode (${currentLeanMode.toUpperCase()})
            </button>
          </div>
          <div>
            <button class="btn btn-danger" id="btn-restore-lean" onclick="restoreLeanDefaults()" ${!leanData?.backup?.exists && !isEnabled ? 'disabled' : ''}>
              🔄 Restore Default System Limits
            </button>
          </div>
        </div>
      </div>
    </div>

    <!-- Technical Parameter Live Comparison Table -->
    <div class="card mb-6">
      <div class="card-header flex justify-between items-center">
        <div>
          <h3 class="card-title">Detailed Parameter Comparison (Standard vs Lean Engine)</h3>
          <p class="text-muted text-xs">Real-time technical configuration changes applied to OpenLiteSpeed, PHP, MariaDB, and LSCache.</p>
        </div>
        <span class="badge" style="background:rgba(56,189,248,0.15);color:#38bdf8;font-size:11px;">
          RAM Specs: ${specs.ram} MB (${specs.cpu} vCPU)
        </span>
      </div>
      <div class="card-body">
        <div class="table-wrap">
          <table class="table">
            <thead>
              <tr>
                <th>Component</th>
                <th>Low-Level Directive</th>
                <th>Target Config File</th>
                <th>Standard (Unoptimized)</th>
                <th>Lean Engine Active</th>
                <th>Optimization Impact</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td><strong>OpenLiteSpeed</strong></td>
                <td><code>LSAPI_PGRP_MAX_IDLE</code></td>
                <td class="text-mono text-xs">/usr/local/lsws/conf/httpd_config.conf</td>
                <td class="text-muted">300s (5 minutes)</td>
                <td class="text-bold" style="color:#10b981;">${metrics.idleTimeout}s</td>
                <td>Releases idle worker memory 10x faster</td>
              </tr>
              <tr>
                <td><strong>OpenLiteSpeed</strong></td>
                <td><code>PHP_LSAPI_CHILDREN</code></td>
                <td class="text-mono text-xs">/usr/local/lsws/conf/httpd_config.conf</td>
                <td class="text-muted">35+ workers</td>
                <td class="text-bold" style="color:#10b981;">${metrics.phpWorkers} workers</td>
                <td>Prevents out-of-memory worker thrashing</td>
              </tr>
              <tr>
                <td><strong>OpenLiteSpeed</strong></td>
                <td><code>maxConns</code></td>
                <td class="text-mono text-xs">/usr/local/lsws/conf/httpd_config.conf</td>
                <td class="text-muted">35 conns</td>
                <td class="text-bold" style="color:#10b981;">${metrics.maxConns} conns</td>
                <td>Synchronized worker concurrency boundary</td>
              </tr>
              <tr>
                <td><strong>Zend OPcache</strong></td>
                <td><code>opcache.memory_consumption</code></td>
                <td class="text-mono text-xs">/etc/php/8.3/mods-available/opcache.ini</td>
                <td class="text-muted">32 MB / Unset</td>
                <td class="text-bold" style="color:#38bdf8;">${currentOpcacheSize} MB</td>
                <td>Pre-compiles PHP scripts directly in RAM</td>
              </tr>
              <tr>
                <td><strong>Zend OPcache</strong></td>
                <td><code>opcache.interned_strings_buffer</code></td>
                <td class="text-mono text-xs">/etc/php/8.3/mods-available/opcache.ini</td>
                <td class="text-muted">4 MB</td>
                <td class="text-bold" style="color:#38bdf8;">8 MB</td>
                <td>Caches recurring strings & variable names</td>
              </tr>
              <tr>
                <td><strong>Zend OPcache</strong></td>
                <td><code>opcache.max_accelerated_files</code></td>
                <td class="text-mono text-xs">/etc/php/8.3/mods-available/opcache.ini</td>
                <td class="text-muted">4,000 files</td>
                <td class="text-bold" style="color:#38bdf8;">10,000 files</td>
                <td>Complete cache coverage for themes & plugins</td>
              </tr>
              <tr>
                <td><strong>Zend OPcache</strong></td>
                <td><code>opcache.revalidate_freq</code></td>
                <td class="text-mono text-xs">/etc/php/8.3/mods-available/opcache.ini</td>
                <td class="text-muted">60s</td>
                <td class="text-bold" style="color:#38bdf8;">2s</td>
                <td>Sub-millisecond change detection check</td>
              </tr>
              <tr>
                <td><strong>MariaDB</strong></td>
                <td><code>innodb_buffer_pool_size</code></td>
                <td class="text-mono text-xs">/etc/mysql/mariadb.conf.d/99-deols-lean.cnf</td>
                <td class="text-muted">128 MB</td>
                <td class="text-bold" style="color:#fbbf24;">${metrics.dbBufferPoolMb} MB</td>
                <td>Right-sized buffer pool for fast queries</td>
              </tr>
              <tr>
                <td><strong>MariaDB</strong></td>
                <td><code>max_connections</code></td>
                <td class="text-mono text-xs">/etc/mysql/mariadb.conf.d/99-deols-lean.cnf</td>
                <td class="text-muted">151 conns</td>
                <td class="text-bold" style="color:#fbbf24;">${metrics.dbMaxConnections} conns</td>
                <td>Prevents runaway connection memory leaks</td>
              </tr>
              <tr>
                <td><strong>LSCache Engine</strong></td>
                <td><code>Rewrite / Static Cache Bypass</code></td>
                <td class="text-mono text-xs">/usr/local/lsws/conf/vhosts/*/vhconf.conf</td>
                <td class="text-muted">Optional</td>
                <td class="text-bold" style="color:#10b981;">Enforced on All Sites</td>
                <td>Bypasses PHP completely for cached HTML (&lt;20ms TTFB)</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>

    <!-- LSCache Enforcement & Virtual Hosts Status Card -->
    <div class="card mb-6">
      <div class="card-header flex justify-between items-center">
        <div>
          <h3 class="card-title">⚡ LSCache Speed Enforcement Rules</h3>
          <p class="text-muted text-xs">Direct static cache bypass rules injected into virtual hosts.</p>
        </div>
        <span class="badge badge-success" style="font-size:11px;">
          ${leanData?.enforcedVhostsCount ? `${leanData.enforcedVhostsCount} Sites Enforced` : 'All Virtual Hosts Active'}
        </span>
      </div>
      <div class="card-body">
        <p class="text-muted text-sm mb-3">
          The Lean Engine automatically audits and configures OpenLiteSpeed virtual hosts (<code>vhconf.conf</code>) with high-performance cache rules so that cached WordPress pages bypass PHP and MySQL execution entirely.
        </p>
        <div style="background:var(--bg-code,#0f172a);border:1px solid var(--border-primary);border-radius:8px;padding:12px 16px;">
          <pre style="margin:0;font-family:'JetBrains Mono',monospace;font-size:12px;color:#38bdf8;line-height:1.6;">RewriteEngine On
RewriteRule .* - [E=Cache-Control:no-autoflush]
RewriteRule ^/wp-content/cache/ - [L]
RewriteCond %{REQUEST_FILENAME} !-f
RewriteCond %{REQUEST_FILENAME} !-d
RewriteRule . /index.php [L]</pre>
        </div>
      </div>
    </div>

    <!-- Automated Safety & Snapshot Status Card -->
    <div class="card">
      <div class="card-header"><h3 class="card-title">Automated Safety Snapshot Engine</h3></div>
      <div class="card-body">
        <p class="text-muted text-sm mb-4">
          DEOLS automatically creates compressed baseline snapshots before any configuration modification.
        </p>
        <div style="background:var(--bg-tertiary);border-radius:8px;padding:14px;border:1px solid var(--border-primary);">
          <div class="flex items-center justify-between mb-2">
            <span style="font-size:13px;font-weight:700;">Pre-Lean Engine Snapshot</span>
            <span class="badge ${leanData?.backup?.exists ? 'badge-success' : ''}" style="${!leanData?.backup?.exists ? 'background:rgba(100,116,139,0.2);color:#94a3b8;' : ''};font-size:11px;">
              ${leanData?.backup?.exists ? 'Archived & Verified' : 'Created on First Activation'}
            </span>
          </div>
          <div class="text-mono text-xs text-muted mb-2">/var/backups/deols/pre_lean_engine_backup.tar.gz</div>
          <p class="text-xs text-muted" style="margin:0;">
            Captures unmodified configuration state of OpenLiteSpeed, PHP OPcache ini, and MariaDB for instant 1-click rollback.
          </p>
        </div>
      </div>
    </div>
  `;
}

function selectLeanMode(mode) {
  currentLeanMode = mode;
  const container = document.getElementById('content-body');
  if (container) renderLeanEngineContent(container);
}

function selectLeanOpcache(size) {
  currentOpcacheSize = size;
  const container = document.getElementById('content-body');
  if (container) renderLeanEngineContent(container);
}

async function toggleLeanMaster(enable) {
  if (enable) {
    await applyLeanEngine();
  } else {
    await restoreLeanDefaults();
  }
}

async function applyLeanEngine() {
  const btn = document.getElementById('btn-apply-lean');
  if (btn) {
    btn.disabled = true;
    btn.textContent = '⏳ Applying Lean Tuning & Restarting Services…';
  }

  toast(`Applying Lean Engine mode "${currentLeanMode.toUpperCase()}" with ${currentOpcacheSize}MB OPcache…`, 'info', 6000);

  const res = await api('/advanced/lean-engine/enable', {
    method: 'POST',
    body: {
      mode: currentLeanMode,
      opcache_size: currentOpcacheSize,
    },
  });

  if (res?.success) {
    toast(res.message || 'Lean Engine Mode successfully activated!', 'success', 6000);
    const container = document.getElementById('content-body');
    if (container) renderAutoTuner(container);
  } else {
    const errorMsg = res?.error || 'Failed to apply Lean Engine mode';
    const detailMsg = res?.details ? ` (${res.details.trim().slice(0, 160)})` : '';
    toast(errorMsg + detailMsg, 'error', 10000);
    const container = document.getElementById('content-body');
    if (container) renderAutoTuner(container);
  }
}

async function restoreLeanDefaults() {
  if (!confirm('Are you sure you want to restore system limits to standard factory configurations? OpenLiteSpeed and MariaDB will be gracefully reloaded.')) {
    const container = document.getElementById('content-body');
    if (container) renderLeanEngineContent(container);
    return;
  }

  const btn = document.getElementById('btn-restore-lean');
  if (btn) {
    btn.disabled = true;
    btn.textContent = '⏳ Restoring System Defaults…';
  }

  toast('Restoring standard system limits…', 'info', 6000);

  const res = await api('/advanced/lean-engine/disable', { method: 'POST' });
  if (res?.success) {
    toast(res.message || 'Restored system limits successfully!', 'success', 6000);
    const container = document.getElementById('content-body');
    if (container) renderAutoTuner(container);
  } else {
    toast(res?.error || 'Failed to restore system limits', 'error', 8000);
    const container = document.getElementById('content-body');
    if (container) renderAutoTuner(container);
  }
}

// ─── Make functions globally accessible ─────────────────────

// ─── Global Window Bindings ─────────────────────────────────

const _globalExports = {
  navigateTo,
  renderAutoTuner,
  switchTunerTab,
  renderLeanEngineContent,
  selectLeanMode,
  selectLeanOpcache,
  toggleLeanMaster,
  applyLeanEngine,
  restoreLeanDefaults,
  selectTunerPreset,
  toggleTunerRedis,
  toggleTunerMaster,
  applyTunerPreset,
  restoreTunerDefaults,
  purgeAllCache,
  showNewSiteModal,
  repairPerms,
  deleteSite,
  showNewDbModal,
  dropDb,
  dropDbUser,
  showNewDbUserModal,
  createDbUser,
  showChangeDbUserPassModal,
  repairDatabase,
  fixSiteDbConnection,
  showIssueSSLModal,
  switchSSLTab,
  toggleCFAuthFields,
  testCloudflareConnection,
  handleIssueSSLSubmit,
  issueWildcardSSL,
  renderSSLErrorFallback,
  issueSSL,
  renewAllSSL,
  revokeSSL,
  loadFileList,
  editFile,
  saveFile,
  deleteFile,
  showUploadModal,
  showNewFolderModal,
  createFolder,
  svcAction,
  renderOLS,
  redisAction,
  flushRedis,
  memcachedAction,
  flushMemcached,
  showNewCronModal,
  addCron,
  deleteCron,
  showNewSyncModal,
  createSync,
  gitPull,
  gitRemove,
  showAddKeyModal,
  addSSHKey,
  removeSSHKey,
  showNewPyServiceModal,
  createPyService,
  pyAction,
  deletePyService,
  showAddRuleModal,
  fwAddRule,
  fwDeleteRule,
  fwEnable,
  fwDisable,
  toggleAntiAttack,
  hardenServer,
  setupWPFail2ban,
  restartOLSHeader,
  switchServicesTab,
  triggerDaemonReload,
  loadCustomServicesManager,
  selectCustomService,
  copyNanoCmd,
  createNewCustomServiceUI,
  applyServiceTemplate,
  saveCustomService,
  customServiceAction,
  deleteCustomService,
  setCustomServiceInspection,
  refreshInspectionPanel,
  loadCoreServicesList,
  showTimezoneModal,
  saveServerTimezone,
  noticeRestartOLS,
  noticeReloadServer,
  initServerClock,
  showModal,
  closeModal,
  openSiteManage,
  renderTerminal,
  checkAuth,
  showLogin,
  showSetup,
  showDashboard,
  hideAll,
};

for (const [key, val] of Object.entries(_globalExports)) {
  if (typeof val !== 'undefined') {
    window[key] = val;
  }
}

// ─── Initialize ─────────────────────────────────────────────

initTheme();

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => {
    checkAuth();
  });
} else {
  checkAuth();
}

// Emergency Failsafe: Never leave loading screen stuck
setTimeout(() => {
  const loading = document.getElementById('loading-screen');
  if (loading && loading.style.display !== 'none' && !loading.classList.contains('fade-out')) {
    const login = document.getElementById('login-screen');
    const dash = document.getElementById('dashboard');
    const setup = document.getElementById('setup-screen');
    if (login && dash && setup && login.style.display === 'none' && dash.style.display === 'none' && setup.style.display === 'none') {
      console.warn('DEOLS Failsafe triggered: Dismissing stuck loading screen');
      showLogin();
    }
  }
}, 3000);


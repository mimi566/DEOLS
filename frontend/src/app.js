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

// ─── API Helper ─────────────────────────────────────────────

async function api(path, opts = {}) {
  const { method = 'GET', body, raw = false } = opts;
  const headers = { 'Content-Type': 'application/json' };
  if (state.token) headers['Authorization'] = `Bearer ${state.token}`;

  try {
    const res = await fetch(`${API}${path}`, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
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
    return await res.json();
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
  const saved = localStorage.getItem('deols_theme') || 'dark';
  document.documentElement.setAttribute('data-theme', saved);
}

document.getElementById('theme-toggle')?.addEventListener('click', () => {
  const current = document.documentElement.getAttribute('data-theme');
  const next = current === 'dark' ? 'light' : 'dark';
  document.documentElement.setAttribute('data-theme', next);
  localStorage.setItem('deols_theme', next);
});

// ─── Navigation ─────────────────────────────────────────────

function navigateTo(page) {
  state.currentPage = page;

  // Update active nav item
  document.querySelectorAll('.nav-item').forEach((el) => {
    el.classList.toggle('active', el.dataset.page === page);
  });

  // Update page title
  const titles = {
    dashboard: 'Dashboard',
    sites: 'Sites',
    databases: 'Databases',
    ssl: 'SSL / TLS',
    files: 'File Manager',
    services: 'Services',
    cache: 'Cache Control',
    cron: 'Cron Jobs',
    terminal: 'Terminal',
    git: 'Git Deploy',
    python: 'Python Services',
    firewall: 'Firewall',
    security: 'Security',
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
    databases: renderDatabases,
    ssl: renderSSL,
    files: renderFiles,
    services: renderServices,
    cache: renderCache,
    cron: renderCron,
    terminal: renderTerminal,
    git: renderGit,
    python: renderPython,
    firewall: renderFirewall,
    security: renderSecurity,
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
}

function hideAll() {
  document.getElementById('loading-screen').classList.add('fade-out');
  document.getElementById('setup-screen').style.display = 'none';
  document.getElementById('login-screen').style.display = 'none';
  document.getElementById('dashboard').style.display = 'none';
}

// Setup form
document.getElementById('setup-form')?.addEventListener('submit', async (e) => {
  e.preventDefault();
  const errEl = document.getElementById('setup-error');
  errEl.textContent = '';

  const username = document.getElementById('setup-username').value;
  const email = document.getElementById('setup-email').value;
  const password = document.getElementById('setup-password').value;
  const password2 = document.getElementById('setup-password2').value;

  if (password !== password2) {
    errEl.textContent = 'Passwords do not match';
    return;
  }

  const result = await api('/auth/setup', { method: 'POST', body: { username, email, password } });
  if (result?.success) {
    if (result.token) {
      state.token = result.token;
      localStorage.setItem('deols_token', result.token);
    }
    state.user = result.user;
    toast('Panel initialized successfully!', 'success');
    showDashboard();
  } else {
    errEl.textContent = result?.error || 'Setup failed';
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

function escapeHTML(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
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
                  <strong>${escapeHTML(site.domain)}</strong>
                </div>
              </td>
              <td><span class="badge badge-neutral">PHP ${site.phpVersion === '83' ? '8.3' : site.phpVersion === '82' ? '8.2' : site.phpVersion}</span></td>
              <td>${site.ssl ? '<span class="badge badge-success">Active</span>' : '<span class="badge badge-warning">None</span>'}</td>
              <td><span class="badge badge-${site.status === 'active' ? 'success' : 'warning'}">${site.status}</span></td>
              <td class="text-muted text-sm">${timeAgo(site.createdAt)}</td>
              <td>
                <div class="flex gap-2">
                  <button class="btn btn-sm btn-ghost" onclick="repairPerms('${site.domain}')">Repair</button>
                  <button class="btn btn-sm btn-danger" onclick="deleteSite('${site.domain}')">Delete</button>
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
          <label>WP Admin User</label>
          <input type="text" id="new-admin" placeholder="admin" value="admin">
        </div>
        <div class="form-group">
          <label>Admin Email</label>
          <input type="email" id="new-email" placeholder="admin@example.com">
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

  document.getElementById('btn-create-site').addEventListener('click', async () => {
    const btn = document.getElementById('btn-create-site');
    btn.disabled = true;
    btn.textContent = 'Provisioning…';

    const result = await api('/sites', {
      method: 'POST',
      body: {
        domain: document.getElementById('new-domain').value,
        phpVersion: document.getElementById('new-php').value,
        siteTitle: document.getElementById('new-title').value || 'My WordPress Site',
        adminUser: document.getElementById('new-admin').value || 'admin',
        adminEmail: document.getElementById('new-email').value,
        enableWildcard: document.getElementById('new-wildcard').checked,
      },
    });

    if (result?.success) {
      toast(`Site ${result.site.domain} created successfully!`, 'success');
      closeModal();
      navigateTo('sites');
    } else {
      toast(result?.error || 'Failed to create site', 'error');
      btn.disabled = false;
      btn.textContent = 'Create Site';
    }
  });
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

// ─── Databases Page ─────────────────────────────────────────

async function renderDatabases(container) {
  container.innerHTML = `
    <div class="flex justify-between items-center mb-6">
      <p class="text-muted">Manage MariaDB databases and users</p>
      <button class="btn btn-primary" onclick="showNewDbModal()">+ New Database</button>
    </div>
    <div class="card">
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
        <thead><tr><th>Name</th><th>Charset</th><th>Collation</th><th>Actions</th></tr></thead>
        <tbody>${dbs.databases.map((d) => `
          <tr>
            <td class="text-mono">${escapeHTML(d.name)}</td>
            <td>${escapeHTML(d.charset)}</td>
            <td class="text-sm text-muted">${escapeHTML(d.collation)}</td>
            <td><button class="btn btn-sm btn-danger" onclick="dropDb('${d.name}')">Drop</button></td>
          </tr>
        `).join('')}</tbody>
      </table></div>
    ` : '<p class="text-muted">No databases found</p>';
  }

  if (users?.users) {
    document.getElementById('db-users-list').innerHTML = users.users.length ? `
      <div class="table-wrap"><table class="table">
        <thead><tr><th>User</th><th>Host</th><th>Actions</th></tr></thead>
        <tbody>${users.users.map((u) => `
          <tr>
            <td class="text-mono">${escapeHTML(u.user)}</td>
            <td>${escapeHTML(u.host)}</td>
            <td><button class="btn btn-sm btn-danger" onclick="dropDbUser('${u.user}','${u.host}')">Drop</button></td>
          </tr>
        `).join('')}</tbody>
      </table></div>
    ` : '<p class="text-muted">No users found</p>';
  }
}

function showNewDbModal() {
  showModal('Create Database', `
    <div class="flex flex-col gap-4">
      <div class="form-group">
        <label>Database Name</label>
        <input type="text" id="new-db-name" placeholder="my_database" required>
      </div>
    </div>
  `, `
    <button class="btn btn-secondary" onclick="closeModal()">Cancel</button>
    <button class="btn btn-primary" onclick="createDb()">Create</button>
  `);
}

async function createDb() {
  const name = document.getElementById('new-db-name').value;
  const result = await api('/databases', { method: 'POST', body: { name } });
  if (result?.success) {
    toast('Database created!', 'success');
    closeModal();
    navigateTo('databases');
  } else toast(result?.error || 'Failed', 'error');
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
      <p class="text-muted">Manage Let's Encrypt SSL certificates</p>
      <div class="flex gap-3">
        <button class="btn btn-primary" onclick="showIssueSSLModal()">Issue SSL</button>
        <button class="btn btn-secondary" onclick="renewAllSSL()">Renew All</button>
      </div>
    </div>
    <div class="card">
      <div class="card-header"><h2 class="card-title">Certificates</h2></div>
      <div class="card-body" id="ssl-list"><p class="text-muted">Loading certificates…</p></div>
    </div>
  `;

  const data = await api('/ssl/certificates');
  const el = document.getElementById('ssl-list');

  if (data?.certificates?.length) {
    el.innerHTML = `
      <div class="table-wrap"><table class="table">
        <thead><tr><th>Name</th><th>Domains</th><th>Expiry</th><th>Actions</th></tr></thead>
        <tbody>${data.certificates.map((c) => `
          <tr>
            <td><strong>${escapeHTML(c.name || '—')}</strong></td>
            <td class="text-sm">${escapeHTML(c.domains || '—')}</td>
            <td class="text-sm">${escapeHTML(c.expiry || '—')}</td>
            <td><button class="btn btn-sm btn-danger" onclick="revokeSSL('${c.name}')">Revoke</button></td>
          </tr>
        `).join('')}</tbody>
      </table></div>
    `;
  } else {
    el.innerHTML = '<div class="empty-state"><h3>No certificates found</h3><p>Issue your first SSL certificate</p></div>';
  }
}

function showIssueSSLModal() {
  showModal('Issue SSL Certificate', `
    <div class="flex flex-col gap-4">
      <div class="form-group">
        <label>Domain</label>
        <input type="text" id="ssl-domain" placeholder="example.com" required>
      </div>
      <div class="form-group">
        <label>Email (for Let's Encrypt)</label>
        <input type="email" id="ssl-email" placeholder="admin@example.com">
      </div>
      <div class="flex gap-4 items-center">
        <label class="toggle">
          <input type="checkbox" id="ssl-www" checked>
          <span class="toggle-slider"></span>
        </label>
        <span class="text-sm">Include www subdomain</span>
      </div>
    </div>
  `, `
    <button class="btn btn-secondary" onclick="closeModal()">Cancel</button>
    <button class="btn btn-primary" onclick="issueSSL()">Issue Certificate</button>
  `);
}

async function issueSSL() {
  const domain = document.getElementById('ssl-domain').value;
  const email = document.getElementById('ssl-email').value;
  const includeWww = document.getElementById('ssl-www').checked;

  toast('Issuing SSL certificate… this may take a moment', 'info', 8000);
  closeModal();

  const result = await api('/ssl/issue', { method: 'POST', body: { domain, email, includeWww } });
  if (result?.success) {
    toast('SSL certificate issued!', 'success');
    navigateTo('ssl');
  } else toast(result?.error || 'SSL issuance failed', 'error');
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

// ─── File Manager Page ──────────────────────────────────────

let fileCurrentPath = '/var/www';

async function renderFiles(container) {
  container.innerHTML = `
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
  fileCurrentPath = path;
  const data = await api(`/files/list?path=${encodeURIComponent(path)}`);

  // Build breadcrumb
  const breadcrumb = document.getElementById('file-breadcrumb');
  if (breadcrumb) {
    const parts = path.split('/').filter(Boolean);
    let crumbs = '<span class="breadcrumb-item" onclick="loadFileList(\'/\')">/</span>';
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
        ${path !== '/' && path !== '/var/www' ? `<tr class="file-row" onclick="loadFileList('${path.split('/').slice(0, -1).join('/') || '/'}')">
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

// ─── Services Page ──────────────────────────────────────────

async function renderServices(container) {
  container.innerHTML = `
    <p class="text-muted mb-6">Manage system services running on this server</p>
    <div class="card">
      <div class="card-body" id="services-list"><p class="text-muted">Loading services…</p></div>
    </div>
  `;

  const data = await api('/services');
  const el = document.getElementById('services-list');

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
  if (result?.success) { toast(`${name}: ${action} successful`, 'success'); navigateTo('services'); }
  else toast(result?.error || `Failed to ${action} ${name}`, 'error');
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
      <p class="text-muted">Manage cron jobs</p>
      <button class="btn btn-primary" onclick="showNewCronModal()">+ Add Cron Job</button>
    </div>
    <div class="card">
      <div class="card-body" id="cron-list"><p class="text-muted">Loading…</p></div>
    </div>
  `;

  const data = await api('/cron');
  const el = document.getElementById('cron-list');

  if (data?.jobs?.length) {
    el.innerHTML = `
      <div class="table-wrap"><table class="table">
        <thead><tr><th>Schedule</th><th>Command</th><th>Actions</th></tr></thead>
        <tbody>${data.jobs.map((j) => `
          <tr>
            <td class="text-mono text-sm">${escapeHTML(j.schedule)}</td>
            <td class="text-mono text-sm truncate" style="max-width:400px">${escapeHTML(j.command)}</td>
            <td><button class="btn btn-sm btn-danger" onclick="deleteCron(${j.id})">Delete</button></td>
          </tr>
        `).join('')}</tbody>
      </table></div>
    `;
  } else {
    el.innerHTML = '<div class="empty-state"><h3>No Cron Jobs</h3><p>Add scheduled tasks for your sites</p></div>';
  }
}

function showNewCronModal() {
  showModal('New Cron Job', `
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
  if (result?.success) { toast('Cron job added', 'success'); closeModal(); navigateTo('cron'); }
  else toast(result?.error || 'Failed', 'error');
}

async function deleteCron(index) {
  if (!confirm('Delete this cron job?')) return;
  const result = await api(`/cron/${index}`, { method: 'DELETE' });
  if (result?.success) { toast('Cron job deleted', 'success'); navigateTo('cron'); }
  else toast(result?.error || 'Failed', 'error');
}

// ─── Terminal Page ──────────────────────────────────────────

function renderTerminal(container) {
  container.innerHTML = `
    <div class="terminal-container">
      <div class="terminal-header">
        <span class="terminal-dot red"></span>
        <span class="terminal-dot yellow"></span>
        <span class="terminal-dot green"></span>
        <span class="text-sm text-muted" style="margin-left:8px">root@deols</span>
      </div>
      <div class="terminal-body" id="terminal-output">
        <div style="margin-bottom:16px;color:#58a6ff">Welcome to DEOLS Terminal</div>
        <div class="flex items-center gap-2">
          <span style="color:#79c0ff">root@deols:~#</span>
          <input type="text" id="terminal-input" style="flex:1;background:none;border:none;color:#c9d1d9;font-family:var(--font-mono);font-size:0.85rem;outline:none" placeholder="Type a command…" autofocus>
        </div>
      </div>
    </div>
  `;

  const input = document.getElementById('terminal-input');
  const output = document.getElementById('terminal-output');

  input?.addEventListener('keydown', async (e) => {
    if (e.key !== 'Enter' || !input.value.trim()) return;

    const cmd = input.value.trim();
    const cmdLine = document.createElement('div');
    cmdLine.innerHTML = `<span style="color:#79c0ff">root@deols:~#</span> ${escapeHTML(cmd)}`;
    output.insertBefore(cmdLine, output.lastElementChild);

    input.value = '';

    const result = await api('/terminal/exec', { method: 'POST', body: { command: cmd } });
    if (result) {
      const resultEl = document.createElement('pre');
      resultEl.style.cssText = 'margin:4px 0 12px;white-space:pre-wrap;word-break:break-all;color:#8b949e';
      resultEl.textContent = result.stdout || result.stderr || '(no output)';
      output.insertBefore(resultEl, output.lastElementChild);
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

// ─── Make functions globally accessible ─────────────────────

window.navigateTo = navigateTo;
window.purgeAllCache = purgeAllCache;
window.showNewSiteModal = showNewSiteModal;
window.repairPerms = repairPerms;
window.deleteSite = deleteSite;
window.showNewDbModal = showNewDbModal;
window.createDb = createDb;
window.dropDb = dropDb;
window.dropDbUser = dropDbUser;
window.showIssueSSLModal = showIssueSSLModal;
window.issueSSL = issueSSL;
window.renewAllSSL = renewAllSSL;
window.revokeSSL = revokeSSL;
window.loadFileList = loadFileList;
window.editFile = editFile;
window.saveFile = saveFile;
window.deleteFile = deleteFile;
window.showUploadModal = showUploadModal;
window.showNewFolderModal = showNewFolderModal;
window.createFolder = createFolder;
window.svcAction = svcAction;
window.redisAction = redisAction;
window.flushRedis = flushRedis;
window.memcachedAction = memcachedAction;
window.flushMemcached = flushMemcached;
window.showNewCronModal = showNewCronModal;
window.addCron = addCron;
window.deleteCron = deleteCron;
window.showNewSyncModal = showNewSyncModal;
window.createSync = createSync;
window.gitPull = gitPull;
window.gitRemove = gitRemove;
window.showAddKeyModal = showAddKeyModal;
window.addSSHKey = addSSHKey;
window.removeSSHKey = removeSSHKey;
window.showNewPyServiceModal = showNewPyServiceModal;
window.createPyService = createPyService;
window.pyAction = pyAction;
window.deletePyService = deletePyService;
window.showAddRuleModal = showAddRuleModal;
window.fwAddRule = fwAddRule;
window.fwDeleteRule = fwDeleteRule;
window.fwEnable = fwEnable;
window.fwDisable = fwDisable;
window.toggleAntiAttack = toggleAntiAttack;
window.hardenServer = hardenServer;
window.setupWPFail2ban = setupWPFail2ban;

// ─── Initialize ─────────────────────────────────────────────

initTheme();
setTimeout(() => checkAuth(), 800);

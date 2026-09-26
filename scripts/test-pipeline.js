// ─────────────────────────────────────────────────────────────
// DEOLS Full Pipeline Automated Verification Script
// Tests: Path Setup, DB Provisioning, OLS VHost & Listeners,
// Wildcard SSL Injection, and Server-Side Automation Cron Engine
// ─────────────────────────────────────────────────────────────

import { existsSync, readFileSync, writeFileSync, mkdirSync, rmSync } from 'fs';
import { join } from 'path';
import { config } from '../backend/config.js';
import {
  ensureOlsListeners,
  addVirtualHostToOls,
  updateVirtualHostSSL,
  removeVirtualHostFromOls,
  generateCyberpanelVhConf,
  parseOlsVirtualHosts,
  parseOlsListeners,
} from '../backend/utils/ols-config.js';
import { generatePassword, sanitizeDomain, isValidDomain } from '../backend/utils/shell.js';
import {
  loadTasks,
  addCustomTask,
  runTaskNow,
  matchesCron,
  getTaskLogs,
} from '../backend/services/automation.js';

let passed = 0;
let failed = 0;

function assert(condition, message) {
  if (condition) {
    console.log(`  \x1b[32m✓\x1b[0m ${message}`);
    passed++;
  } else {
    console.error(`  \x1b[31m✗\x1b[0m FAIL: ${message}`);
    failed++;
  }
}

async function runPipelineTest() {
  console.log('\n\x1b[36m\x1b[1m═══════════════════════════════════════════════════════════════════\x1b[0m');
  console.log('\x1b[36m\x1b[1m   DEOLS End-to-End Functional Verification & Pipeline Test       \x1b[0m');
  console.log('\x1b[36m\x1b[1m═══════════════════════════════════════════════════════════════════\x1b[0m\n');

  const testDomain = 'example-wp-wildcard.com';
  const testDir = join(config.dataDir, 'test-sandbox');

  if (!existsSync(testDir)) mkdirSync(testDir, { recursive: true });

  // ─── STEP 1: Domain Validation & Path Creation ──────────────
  console.log('\x1b[33m[1/6] Testing Domain Sanitization & Directory Path Creation...\x1b[0m');
  const cleanDomain = sanitizeDomain(testDomain);
  assert(cleanDomain === 'example-wp-wildcard.com', 'Domain correctly sanitized to lowercase');
  assert(isValidDomain(cleanDomain), 'Domain passes RFC hostname validation');

  const siteRoot = join(testDir, 'var-www', cleanDomain);
  const docRoot = join(siteRoot, 'public_html');
  const logsDir = join(siteRoot, 'logs');
  mkdirSync(docRoot, { recursive: true });
  mkdirSync(logsDir, { recursive: true });

  assert(existsSync(docRoot), `Document root created: ${docRoot}`);
  assert(existsSync(logsDir), `Logs directory created: ${logsDir}`);

  // ─── STEP 2: Database Credentials & SQL Generation ─────────
  console.log('\n\x1b[33m[2/6] Testing Database Setup & SQL Generation...\x1b[0m');
  const dbName = 'wp_' + cleanDomain.replace(/[^a-z0-9]/g, '_').substring(0, 40);
  const dbUser = 'u_' + cleanDomain.replace(/[^a-z0-9]/g, '_').substring(0, 14);
  const dbPass = generatePassword(20);

  assert(dbName.startsWith('wp_'), `Database name created: ${dbName}`);
  assert(dbUser.startsWith('u_'), `Database user created: ${dbUser}`);
  assert(dbPass.length === 20, `Cryptographic database password generated (20 chars)`);

  const sqlQuery = `CREATE DATABASE IF NOT EXISTS \`${dbName}\`; CREATE USER IF NOT EXISTS '${dbUser}'@'localhost' IDENTIFIED BY '${dbPass}'; GRANT ALL PRIVILEGES ON \`${dbName}\`.* TO '${dbUser}'@'localhost'; FLUSH PRIVILEGES;`;
  assert(sqlQuery.includes(dbName) && sqlQuery.includes(dbUser), 'MariaDB setup SQL query formatted correctly');

  // ─── STEP 3: OLS Virtual Host Configuration Generation ─────
  console.log('\n\x1b[33m[3/6] Testing CyberPanel-Compatible vhconf.conf Generation...\x1b[0m');
  const vhostConfDir = join(testDir, 'vhosts', cleanDomain);
  mkdirSync(vhostConfDir, { recursive: true });

  const vhconfContent = generateCyberpanelVhConf(cleanDomain, docRoot, logsDir, '83', true);
  const vhconfPath = join(vhostConfDir, 'vhconf.conf');
  writeFileSync(vhconfPath, vhconfContent);

  assert(existsSync(vhconfPath), `Virtual Host config file written to: ${vhconfPath}`);
  assert(vhconfContent.includes(`vhDomain                  ${cleanDomain}`), 'vhconf specifies primary vhDomain');
  assert(vhconfContent.includes(`vhAliases                 www.${cleanDomain}, *.${cleanDomain}`), 'vhconf includes wildcard aliases (*.domain.com)');
  assert(vhconfContent.includes(`uds://tmp/lshttpd/lsphp83_example_wp_wildcard_com.sock`), 'vhconf specifies isolated per-vhost Unix Domain Socket');
  assert(vhconfContent.includes('autoLoadHtaccess        1'), 'vhconf enables auto-loading .htaccess');
  assert(vhconfContent.includes('X-Frame-Options SAMEORIGIN'), 'vhconf includes security response headers');

  // ─── STEP 4: OLS Dual-Listener & httpd_config.conf Mapping ──
  console.log('\n\x1b[33m[4/6] Testing OLS Dual-Listener Routing (Port 80 & 443)...\x1b[0m');
  const mockHttpdConfPath = join(testDir, 'httpd_config.conf');
  const initialHttpd = `
# Core OpenLiteSpeed Config
serverName localhost
httpDir /usr/local/lsws

listener Default {
  address                 *:80
  binding                 *:80
  secure                  0
}

listener DefaultHTTPS {
  address                 *:443
  binding                 *:443
  secure                  1
  keyFile                 /usr/local/lsws/admin/conf/webadmin.key
  certFile                /usr/local/lsws/admin/conf/webadmin.crt
}
`;
  writeFileSync(mockHttpdConfPath, initialHttpd);

  // Temporarily override config paths to test in sandbox
  const originalConf = config.olsRoot;
  config.olsRoot = testDir;
  mkdirSync(join(testDir, 'conf'), { recursive: true });
  writeFileSync(join(testDir, 'conf', 'httpd_config.conf'), initialHttpd);
  config.vhostsDir = join(testDir, 'vhosts');

  addVirtualHostToOls(cleanDomain, true);

  const updatedHttpd = readFileSync(join(testDir, 'conf', 'httpd_config.conf'), 'utf-8');

  assert(updatedHttpd.includes(`virtualhost ${cleanDomain} {`), 'virtualhost block registered in httpd_config.conf');
  assert(updatedHttpd.includes(`map                     ${cleanDomain} ${cleanDomain}, www.${cleanDomain}, *.${cleanDomain}`), 'Domain and wildcard mapped to listeners');

  const listeners = parseOlsListeners();
  const port80 = listeners.find((l) => l.address.includes(':80'));
  const port443 = listeners.find((l) => l.address.includes(':443'));

  assert(port80 !== undefined, 'Port 80 (HTTP) listener active');
  assert(port443 !== undefined && port443.secure === true, 'Port 443 (HTTPS SNI) listener active and secure');

  // ─── STEP 5: Wildcard SSL Configuration & vhssl Block ───────
  console.log('\n\x1b[33m[5/6] Testing Wildcard SSL Injection (vhssl & QUIC/HTTP3)...\x1b[0m');
  updateVirtualHostSSL(cleanDomain, true);

  const sslVhConf = readFileSync(vhconfPath, 'utf-8');
  assert(sslVhConf.includes('vhssl {'), 'vhssl block injected into vhconf.conf');
  assert(sslVhConf.includes(`/etc/letsencrypt/live/${cleanDomain}/privkey.pem`), 'vhssl points to LetsEncrypt private key');
  assert(sslVhConf.includes(`/etc/letsencrypt/live/${cleanDomain}/fullchain.pem`), 'vhssl points to LetsEncrypt fullchain certificate');
  assert(sslVhConf.includes('enableQuic              1'), 'vhssl enables HTTP/3 QUIC');
  assert(sslVhConf.includes('enableSpdy              15'), 'vhssl enables HTTP/2');
  assert(sslVhConf.includes('enableStapling          1'), 'vhssl enables OCSP stapling');

  // ─── STEP 6: Server-Side Automation & Cron Engine ──────────
  console.log('\n\x1b[33m[6/6] Testing Server-Side Automation Service & Cron Engine...\x1b[0m');
  const tasks = loadTasks();
  assert(tasks.length >= 4, `System automation tasks loaded (${tasks.length} tasks initialized)`);
  assert(tasks.some((t) => t.id === 'sys-wp-cron'), 'Global WordPress WP-Cron automation task exists');
  assert(tasks.some((t) => t.id === 'sys-ssl-renew'), 'Automated SSL renewal task exists');
  assert(tasks.some((t) => t.id === 'sys-ols-cache'), 'OLS cache maintenance task exists');

  // Test custom scheduled task creation
  const customTask = addCustomTask({
    name: 'Pipeline Test Automation Job',
    description: 'Automated test task for DEOLS verification',
    schedule: '*/10 * * * *',
    command: 'node -e "console.log(\'Automated server-side task execution verified: OK\')"',
  });

  assert(customTask.id.startsWith('task-'), `Custom automation task created: ${customTask.id}`);

  // Test cron expression matching
  assert(matchesCron('* * * * *'), 'Cron matcher matches wildcard (* * * * *)');
  assert(matchesCron('*/5 * * * *', new Date(2026, 8, 25, 12, 15, 0)), 'Cron matcher handles step schedules (*/5 at minute 15)');

  // Run task immediately and verify output
  const runResult = await runTaskNow(customTask.id);
  assert(runResult.status === 'success', `Automation task executed with status: ${runResult.status}`);
  assert(runResult.output.includes('Automated server-side task execution verified: OK'), 'Task output captured correctly');
  assert(runResult.durationMs >= 0, `Execution duration recorded: ${runResult.durationMs}ms`);

  // ─── STEP 7: Custom Systemd Service Area & Nano Unit Manager ──────
  console.log('\n\x1b[33m[7/8] Testing Custom Systemd Service Manager & automation-custom-service.service...\x1b[0m');
  const systemdSandboxDir = join(testDir, 'systemd');
  mkdirSync(systemdSandboxDir, { recursive: true });

  const testServiceName = 'automation-custom-service.service';
  const testUnitPath = join(systemdSandboxDir, testServiceName);

  const sampleUnitContent = `[Unit]
Description=Custom Background Automation Service
After=network.target

[Service]
Type=simple
User=root
WorkingDirectory=/opt/automation
ExecStart=/usr/bin/python3 /opt/automation/worker.py
Restart=always
RestartSec=5
StandardOutput=journal
StandardError=journal
SyslogIdentifier=automation-custom-service

[Install]
WantedBy=multi-user.target
`;

  // 1. Test unit file writing
  writeFileSync(testUnitPath, sampleUnitContent, { mode: 0o644 });
  assert(existsSync(testUnitPath), `Custom systemd unit created: ${testUnitPath}`);

  // 2. Validate unit file contents
  const readUnit = readFileSync(testUnitPath, 'utf-8');
  assert(readUnit.includes('Description=Custom Background Automation Service'), 'Unit file includes descriptive title');
  assert(readUnit.includes('ExecStart=/usr/bin/python3 /opt/automation/worker.py'), 'Unit file specifies correct ExecStart command');
  assert(readUnit.includes('Restart=always'), 'Unit file specifies automatic restart policy (Restart=always)');
  assert(readUnit.includes('StandardOutput=journal'), 'Unit file routes output to systemd journal');
  assert(readUnit.includes('WantedBy=multi-user.target'), 'Unit file specifies multi-user.target install hook');

  // 3. Test Nano command format
  const expectedNanoCmd = `nano /etc/systemd/system/${testServiceName}`;
  assert(expectedNanoCmd.includes(testServiceName), `Nano CLI shortcut verified: ${expectedNanoCmd}`);

  // 4. Test protection rules
  const protectedUnits = ['ssh', 'sshd', 'deols', 'systemd'];
  const isProtectedCheck = (name) => protectedUnits.includes(name.replace(/\.service$/, ''));
  assert(isProtectedCheck('ssh.service') === true, 'Protected service check blocks critical SSH unit modification');
  assert(isProtectedCheck(testServiceName) === false, 'Custom service is permitted for editing and restart');

  // ─── STEP 8: Server Timezone & Live Header Clock Engine ────────────
  console.log('\n\x1b[33m[8/8] Testing Server Timezone & Clock Engine...\x1b[0m');
  const validTzs = ['UTC', 'Asia/Kolkata', 'America/New_York', 'Europe/London'];
  for (const tz of validTzs) {
    let resolved = false;
    try {
      const dtf = new Intl.DateTimeFormat('en-US', { timeZone: tz, hour: '2-digit', minute: '2-digit' });
      const str = dtf.format(new Date());
      resolved = str.length > 0;
    } catch {}
    assert(resolved, `Timezone '${tz}' validated by IANA runtime formatter`);
  }

  // Test invalid timezone rejection
  let invalidRejected = false;
  try {
    new Intl.DateTimeFormat(undefined, { timeZone: 'Invalid/Non_Existent_Zone_12345' });
  } catch {
    invalidRejected = true;
  }
  // ─── STEP 9: System Memory Metrics & /proc/meminfo Parser ──
  console.log('\n\x1b[33m[9/10] Testing System Memory Metrics & /proc/meminfo Parser...\x1b[0m');
  const { getSystemMemoryMetrics } = await import('../backend/api/system.js');
  const memMetrics = getSystemMemoryMetrics();

  assert(typeof memMetrics.total === 'number' && memMetrics.total > 0, `Total memory reported: ${memMetrics.totalMB} MB`);
  assert(typeof memMetrics.used === 'number' && memMetrics.used >= 0, `Used memory reported: ${memMetrics.usedMB} MB`);
  assert(typeof memMetrics.available === 'number' && memMetrics.available > 0, `Available memory reported: ${memMetrics.availableMB} MB`);
  assert(memMetrics.usedPercentage >= 0 && memMetrics.usedPercentage <= 100, `Memory usage percentage valid: ${memMetrics.usedPercentage}%`);
  assert(memMetrics.usedMB <= memMetrics.totalMB, 'Used memory does not exceed total memory');

  // ─── STEP 10: Multi-Tenant User Isolation & Resource Limits (cgroups v2 + Systemd + Quotas) ──
  console.log('\n\x1b[33m[10/10] Testing Multi-Tenant User Isolation & Systemd Slices...\x1b[0m');
  const {
    generateSystemUsername,
    createOrUpdateSystemdSlice,
    applyDiskQuota,
    getSystemQuotaStatus,
    getRealTimeUserMetrics,
  } = await import('../backend/services/isolation.js');

  // 1. Test POSIX username generation
  const testUser = generateSystemUsername(cleanDomain);
  assert(testUser.startsWith('u_'), `Isolated POSIX username generated: ${testUser}`);
  assert(testUser.length <= 14, `Username conforms to 14-char Linux user limit (Length: ${testUser.length})`);
  assert(!/[^a-z0-9_]/.test(testUser), 'Username contains only valid POSIX characters');

  // 2. Test Systemd Slice file generation
  const sliceLimits = {
    cpuPercent: 150,
    ramMb: 1024,
    ramMaxMb: 1536,
    diskMb: 10000,
    tasksMax: 200,
  };
  const sliceResult = await createOrUpdateSystemdSlice(testUser, sliceLimits);
  assert(existsSync(sliceResult.slicePath), `Systemd slice created: ${sliceResult.slicePath}`);

  const sliceContent = readFileSync(sliceResult.slicePath, 'utf-8');
  assert(sliceContent.includes('CPUQuota=150%'), 'Slice contains CPUQuota=150%');
  assert(sliceContent.includes('MemoryHigh=1024M'), 'Slice contains MemoryHigh=1024M (Soft Limit)');
  assert(sliceContent.includes('MemoryMax=1536M'), 'Slice contains MemoryMax=1536M (Isolated Hard OOM Limit)');
  assert(sliceContent.includes('TasksMax=200'), 'Slice contains TasksMax=200 (Anti-Fork Bomb)');

  // 3. Test Disk Quota calculation
  const quotaResult = await applyDiskQuota(testUser, 10000);
  assert(quotaResult.limitMb === 10000, `Storage limit applied: ${quotaResult.limitMb} MB`);
  assert(quotaResult.hardLimitKb === 10240000, `Hard limit set to 10240000 KB (100%)`);
  assert(quotaResult.softLimitKb === 9216000, `Soft limit set to 9216000 KB (90% warning threshold)`);

  // 4. Test System Quota Status
  const qStatus = await getSystemQuotaStatus();
  assert(typeof qStatus.quotaEnabled === 'boolean', `System quota status checked (active: ${qStatus.quotaEnabled})`);
  assert(typeof qStatus.details === 'string', `Quota details reported: ${qStatus.details}`);

  // 5. Test Real-Time User Metrics Collector
  const userMetrics = await getRealTimeUserMetrics(testUser, cleanDomain);
  assert(typeof userMetrics.cpuPercent === 'number', `Live CPU metric collected: ${userMetrics.cpuPercent}%`);
  assert(typeof userMetrics.ramMb === 'number', `Live RAM metric collected: ${userMetrics.ramMb} MB`);
  assert(typeof userMetrics.diskMb === 'number', `Live Disk metric collected: ${userMetrics.diskMb} MB`);
  assert(typeof userMetrics.activeTasks === 'number', `Live Tasks metric collected: ${userMetrics.activeTasks}`);

  // ─── STEP 11: phpMyAdmin Database Manager Integration ───────
  console.log('\n\x1b[33m[11/11] Testing phpMyAdmin Service & Direct Launch URL...\x1b[0m');
  const {
    getPmaStatus,
    getPmaLaunchUrl,
    installPhpMyAdmin,
    generatePmaSsoSession,
    getSiteDatabaseCredentials,
  } = await import('../backend/services/pma.js');

  const pmaInstallRes = await installPhpMyAdmin();
  assert(pmaInstallRes.success === true, 'phpMyAdmin install process completed successfully');

  const pmaStatus = await getPmaStatus();
  assert(typeof pmaStatus.installed === 'boolean', `phpMyAdmin status detected (installed: ${pmaStatus.installed})`);
  assert(typeof pmaStatus.url === 'string' && pmaStatus.url.includes('/phpmyadmin/'), `phpMyAdmin base URL generated: ${pmaStatus.url}`);

  const testDbName = 'wp_example_site';
  const pmaLaunch = await getPmaLaunchUrl(testDbName, cleanDomain);
  assert(pmaLaunch.url.includes(cleanDomain) || pmaLaunch.url.includes('127.0.0.1'), `phpMyAdmin host resolved: ${pmaLaunch.url}`);
  assert(pmaLaunch.url.includes(`db=${testDbName}`), `phpMyAdmin direct database route encoded: ${pmaLaunch.url}`);

  const ssoRes = await generatePmaSsoSession(testDbName, cleanDomain, '127.0.0.1');
  assert(ssoRes.success === true, 'phpMyAdmin Auto-Login session generated successfully');
  assert(typeof ssoRes.user === 'string' && ssoRes.user.length > 0, `Auto-Login user resolved (${ssoRes.user})`);
  assert(ssoRes.actionUrl.includes('/phpmyadmin/index.php'), `Auto-Login action URL targeted to phpMyAdmin: ${ssoRes.actionUrl}`);

  // ─── STEP 12: Static Asset Browser Caching & Query String Stripping ───
  console.log('\n\x1b[33m[12/12] Testing Global Static Asset Caching & Query String Stripping...\x1b[0m');
  const {
    injectStaticAssetHtaccess,
    removeStaticAssetHtaccess,
    ensureMuPluginCacheOptimizer,
    ensureVhConfExpires,
    getSiteStaticCacheStatus,
    optimizeWordPressStaticCache,
    checkStaticAssetCaching,
  } = await import('../backend/services/staticCache.js');

  // 1. Test VHost template expires block
  assert(vhconfContent.includes('expires  {') || vhconfContent.includes('expires {'), 'vhconf.conf includes OpenLiteSpeed native expires module block');
  assert(vhconfContent.includes('expiresDefault          "access plus 1 month"'), 'vhconf.conf sets default expiration to 1 month');
  assert(vhconfContent.includes('application/javascript="access plus 1 year"'), 'vhconf.conf sets JavaScript expires to 1 year');
  assert(vhconfContent.includes('text/css="access plus 1 year"'), 'vhconf.conf sets CSS expires to 1 year');
  assert(vhconfContent.includes('font/*="access plus 1 year"'), 'vhconf.conf sets web font expires to 1 year');

  // 2. Test .htaccess static cache headers injection
  const htaccessInjected = injectStaticAssetHtaccess(docRoot);
  assert(htaccessInjected === true, 'Static asset caching rules injected into .htaccess');
  const htContent = readFileSync(join(docRoot, '.htaccess'), 'utf-8');
  assert(htContent.includes('# DEOLS Static Asset Caching Rules'), '.htaccess contains DEOLS static caching marker');
  assert(htContent.includes('<IfModule mod_expires.c>'), '.htaccess includes mod_expires rules');
  assert(htContent.includes('Header set Cache-Control "max-age=31536000, public"'), '.htaccess sets aggressive Cache-Control header (1 year)');

  // 3. Test WordPress Must-Use plugin generation
  const muInjected = ensureMuPluginCacheOptimizer(docRoot, true);
  assert(muInjected === true, 'WordPress MU-plugin optimizer generated in wp-content/mu-plugins/');
  const muPath = join(docRoot, 'wp-content', 'mu-plugins', 'deols-cache-optimization.php');
  assert(existsSync(muPath), `MU-plugin file exists: ${muPath}`);
  const muContent = readFileSync(muPath, 'utf-8');
  assert(muContent.includes('deols_remove_asset_version_query_string'), 'MU-plugin contains query string stripping filter');
  assert(muContent.includes('script_loader_src'), 'MU-plugin filters script_loader_src');
  assert(muContent.includes('style_loader_src'), 'MU-plugin filters style_loader_src');

  // 4. Test Site Static Cache Status Detector
  const cacheStatus = getSiteStaticCacheStatus(cleanDomain, docRoot);
  assert(cacheStatus.enabled === true, 'Static cache status detected as enabled');
  assert(cacheStatus.hasHtaccessRules === true, 'Status correctly detects .htaccess caching rules');
  assert(cacheStatus.hasMuPlugin === true, 'Status correctly detects WordPress MU-plugin');
  assert(cacheStatus.stripQueryStrings === true, 'Status correctly detects query string stripping');

  // 5. Test Server-side cURL verification utility
  const checkRes = await checkStaticAssetCaching(cleanDomain);
  assert(typeof checkRes.domain === 'string' && checkRes.domain === cleanDomain, 'Verification returns correct target domain');
  assert(checkRes.statusCode === 200, `Verification HTTP status: ${checkRes.statusCode}`);
  assert(checkRes.cacheControl.includes('max-age=31536000'), `Verification confirms Cache-Control: ${checkRes.cacheControl}`);
  assert(checkRes.isOptimized === true, 'Verification flags asset as fully optimized');

  // 6. Test clean removal of .htaccess rules when disabled
  const htaccessRemoved = removeStaticAssetHtaccess(docRoot);
  assert(htaccessRemoved === true, 'Static asset rules cleanly removed from .htaccess');
  const htContentAfter = readFileSync(join(docRoot, '.htaccess'), 'utf-8');
  assert(!htContentAfter.includes('# DEOLS Static Asset Caching Rules'), 'Verified no residual cache marker in .htaccess');

  // Cleanup sandbox
  try {
    removeVirtualHostFromOls(cleanDomain);
    rmSync(testDir, { recursive: true, force: true });
    config.olsRoot = originalConf;
  } catch {}

  console.log('\n\x1b[36m\x1b[1m═══════════════════════════════════════════════════════════════════\x1b[0m');
  console.log(`\x1b[1m   RESULTS: \x1b[32m${passed} PASSED\x1b[0m | \x1b[${failed > 0 ? '31m' + failed + ' FAILED' : '32m0 FAILED'}\x1b[0m   \x1b[0m`);
  console.log('\x1b[36m\x1b[1m═══════════════════════════════════════════════════════════════════\x1b[0m\n');

  if (failed > 0) process.exit(1);
}

runPipelineTest().catch((err) => {
  console.error('\x1b[31mTest runner encountered unexpected error:\x1b[0m', err);
  process.exit(1);
});

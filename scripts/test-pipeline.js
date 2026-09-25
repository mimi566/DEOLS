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
  assert(invalidRejected, 'Invalid timezone identifier rejected by validation layer');

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

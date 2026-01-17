#!/usr/bin/env node

import fs from "fs";
import fetch from "node-fetch";
import path from "path";
import os from "os";
import { fileURLToPath } from "url";
import readline from "readline";
import inquirer from "inquirer";
import { log, getCurrentIP, getCurrentIPv6, loadLastIP, saveCurrentIP, getConfigDir } from "./utils.js";
import chalk from "chalk";
import figlet from "figlet";
import Table from "cli-table3";
import ora from "ora";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CONFIG_DIR = getConfigDir();
const CONFIG_PATH = path.join(CONFIG_DIR, "config.json");
const UPDATE_CACHE_PATH = path.join(CONFIG_DIR, ".update-check");
const API_BASE = "https://api.apertodns.com/api";

// Ensure config directory exists
if (!fs.existsSync(CONFIG_DIR)) {
  fs.mkdirSync(CONFIG_DIR, { recursive: true });
}

// Leggi versione da package.json
const getPackageVersion = () => {
  try {
    const pkg = JSON.parse(fs.readFileSync(path.resolve(__dirname, "package.json"), "utf-8"));
    return pkg.version;
  } catch {
    return "0.0.0";
  }
};

const CURRENT_VERSION = getPackageVersion();
const UPDATE_CHECK_INTERVAL = 24 * 60 * 60 * 1000; // 24 ore in ms

// Confronto semver robusto
const compareVersions = (v1, v2) => {
  const parts1 = v1.split('.').map(Number);
  const parts2 = v2.split('.').map(Number);

  for (let i = 0; i < Math.max(parts1.length, parts2.length); i++) {
    const p1 = parts1[i] || 0;
    const p2 = parts2[i] || 0;
    if (p1 > p2) return 1;
    if (p1 < p2) return -1;
  }
  return 0;
};

// Check aggiornamenti con cache
const checkForUpdates = async () => {
  try {
    // Controlla cache
    if (fs.existsSync(UPDATE_CACHE_PATH)) {
      const cache = JSON.parse(fs.readFileSync(UPDATE_CACHE_PATH, "utf-8"));
      const cacheAge = Date.now() - (cache.timestamp || 0);

      // Se cache recente, usa il risultato cachato
      if (cacheAge < UPDATE_CHECK_INTERVAL) {
        if (cache.latestVersion && compareVersions(cache.latestVersion, CURRENT_VERSION) > 0) {
          return cache.latestVersion;
        }
        return null;
      }
    }

    // Fetch da npm registry
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 3000);

    const res = await fetch("https://registry.npmjs.org/apertodns/latest", {
      signal: controller.signal
    });
    clearTimeout(timeout);

    if (!res.ok) return null;
    const data = await res.json();
    const latestVersion = data.version;

    // Salva in cache
    fs.writeFileSync(UPDATE_CACHE_PATH, JSON.stringify({
      timestamp: Date.now(),
      latestVersion,
      checkedVersion: CURRENT_VERSION
    }));

    // Confronta versioni
    if (latestVersion && compareVersions(latestVersion, CURRENT_VERSION) > 0) {
      return latestVersion;
    }
    return null;
  } catch {
    return null; // Silenzioso se offline o errore
  }
};

// Colors
const orange = chalk.hex('#f97316');
const green = chalk.hex('#22c55e');
const red = chalk.hex('#ef4444');
const blue = chalk.hex('#3b82f6');
const purple = chalk.hex('#a855f7');
const yellow = chalk.hex('#eab308');
const gray = chalk.hex('#71717a');
const cyan = chalk.hex('#06b6d4');

const showBanner = async () => {
  console.clear();
  const banner = figlet.textSync("ApertoDNS", { font: "Standard" });
  console.log(orange(banner));
  console.log(gray("  ╔════════════════════════════════════════════════════════╗"));
  console.log(gray("  ║") + cyan(`  ApertoDNS CLI v${CURRENT_VERSION}`) + gray(" - Dynamic DNS Reinvented      ║"));
  console.log(gray("  ║") + gray("  Gestisci domini, token e DNS dalla tua shell.        ║"));
  console.log(gray("  ╚════════════════════════════════════════════════════════╝\n"));

  // Check aggiornamenti in background
  const newVersion = await checkForUpdates();
  if (newVersion) {
    console.log(yellow("  ╔════════════════════════════════════════════════════════╗"));
    console.log(yellow("  ║") + red("  ⚠️  Nuova versione disponibile: ") + green.bold(`v${newVersion}`) + yellow("                  ║"));
    console.log(yellow("  ║") + gray(`     Tu hai: v${CURRENT_VERSION}`) + yellow("                                      ║"));
    console.log(yellow("  ║") + cyan("     Aggiorna: ") + chalk.white("npm update -g apertodns") + yellow("               ║"));
    console.log(yellow("  ╚════════════════════════════════════════════════════════╝\n"));
  }
};

const promptInput = (question) => {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => rl.question(question, (ans) => { rl.close(); resolve(ans.trim()); }));
};

// Parse args
const args = process.argv.slice(2);
const isCron = args.includes("--cron");
if (isCron) {
  process.argv.push("--quiet");
  process.argv.push("--json");
}

// Subcommand detection (new style: domains list, update domain.com, etc.)
const subcommand = args[0] && !args[0].startsWith('-') ? args[0] : null;
const subcommandArg = args[1] && !args[1].startsWith('-') ? args[1] : null;

// Helper to get option value from args (works anywhere in args array)
const getOption = (name) => {
  const idx = args.indexOf(name);
  return idx !== -1 && args[idx + 1] && !args[idx + 1].startsWith('-') ? args[idx + 1] : null;
};

const isQuiet = args.includes("--quiet");
const showHelp = args.includes("--help") || args.includes("-h");
const showVersion = args.includes("--version") || args.includes("-v");
const showJson = args.includes("--json");
const runVerify = args.includes("--verify");
const runSetup = args.includes("--setup");
const showStatus = args.includes("--status") || args.includes("--show");
const forceUpdate = args.includes("--force");
const enableTokenId = getOption("--enable");
const disableTokenId = getOption("--disable");
const toggleTokenId = getOption("--toggle");
const runConfigEdit = args.includes("--config");
const listDomains = args.includes("--domains") || (subcommand === "domains" && (!subcommandArg || subcommandArg === "list"));
const listTokens = args.includes("--tokens") || (subcommand === "tokens" && (!subcommandArg || subcommandArg === "list"));
const addDomainArg = getOption("--add-domain") || (subcommand === "domains" && subcommandArg === "add" ? args[2] : null);
const deleteDomainArg = getOption("--delete-domain") || (subcommand === "domains" && subcommandArg === "delete" ? args[2] : null);
const showStats = args.includes("--stats") || subcommand === "stats";
const showLogs = args.includes("--logs") || subcommand === "logs";
const testDns = getOption("--test") || (subcommand === "test" ? subcommandArg : null);
const showDashboard = args.includes("--dashboard") || subcommand === "dashboard";
const listWebhooks = args.includes("--webhooks") || subcommand === "webhooks";
const listApiKeys = args.includes("--api-keys") || (subcommand === "api-keys" && (!subcommandArg || subcommandArg === "list"));
const createApiKeyArg = getOption("--create-api-key") || (subcommand === "api-keys" && subcommandArg === "create" ? args[2] : null);
const deleteApiKeyArg = getOption("--delete-api-key") || (subcommand === "api-keys" && subcommandArg === "delete" ? args[2] : null);
const showScopes = args.includes("--scopes") || subcommand === "scopes";
const useApiKey = getOption("--api-key");
const updateDomainArg = subcommand === "update" ? subcommandArg : null;
const runInteractive = args.length === 0;
const runDaemon = args.includes("--daemon") || subcommand === "daemon";
const daemonInterval = getOption("--interval") ? parseInt(getOption("--interval")) : 300;
const showMyIp = args.includes("--my-ip") || args.includes("--ip") || subcommand === "ip" || subcommand === "my-ip";
const logout = args.includes("--logout") || subcommand === "logout";

// TXT record commands (ACME DNS-01 challenges)
const txtSetIdx = args.indexOf("--txt-set");
const txtSetArgs = txtSetIdx !== -1 ? {
  hostname: args[txtSetIdx + 1],
  name: args[txtSetIdx + 2],
  value: args[txtSetIdx + 3]
} : null;
const txtDeleteIdx = args.indexOf("--txt-delete");
const txtDeleteArgs = txtDeleteIdx !== -1 ? {
  hostname: args[txtDeleteIdx + 1],
  name: args[txtDeleteIdx + 2]
} : null;

// JSON output helper
const jsonOutput = (data) => {
  if (showJson) {
    console.log(JSON.stringify(data, null, 2));
    return true;
  }
  return false;
};

// Show help
if (showHelp) {
  console.log(`
${orange.bold("ApertoDNS CLI")} v${CURRENT_VERSION} - Gestisci il tuo DNS dinamico

${chalk.bold("USAGE:")}
  apertodns [command] [options]

${chalk.bold("COMANDI PRINCIPALI:")}
  ${cyan("--dashboard")}          Dashboard completa con tutte le info
  ${cyan("--domains")}            Lista tutti i tuoi domini
  ${cyan("--tokens")}             Lista tutti i tuoi token
  ${cyan("--stats")}              Statistiche e metriche
  ${cyan("--logs")}               Ultimi log di attività
  ${cyan("--my-ip")}              Mostra il tuo IP pubblico attuale

${chalk.bold("GESTIONE DOMINI:")}
  ${cyan("--add-domain")} <name>  Crea un nuovo dominio
  ${cyan("--delete-domain")}      Elimina un dominio (interattivo)
  ${cyan("--test")} <domain>      Testa risoluzione DNS di un dominio

${chalk.bold("TXT RECORDS (ACME DNS-01):")}
  ${cyan("--txt-set")} <host> <name> <val>   Imposta record TXT
  ${cyan("--txt-delete")} <host> <name>      Elimina record TXT

${chalk.bold("GESTIONE TOKEN:")}
  ${cyan("--enable")} <id>        Attiva un token
  ${cyan("--disable")} <id>       Disattiva un token
  ${cyan("--toggle")} <id>        Inverte stato token (ON/OFF)
  ${cyan("--verify")}             Verifica validità token

${chalk.bold("API KEYS:")}
  ${cyan("--api-keys")}           Lista tutte le API keys
  ${cyan("--create-api-key")} <n> Crea nuova API key con nome
  ${cyan("--delete-api-key")} <id> Elimina una API key
  ${cyan("--scopes")}             Mostra scopes disponibili
  ${cyan("--api-key")} <key>      Usa API key invece di JWT token

${chalk.bold("INTEGRAZIONI:")}
  ${cyan("--webhooks")}           Lista webhook configurati

${chalk.bold("CONFIGURAZIONE:")}
  ${cyan("--setup")}              Configurazione guidata (login/registrazione)
  ${cyan("--status")}             Mostra stato attuale
  ${cyan("--config")}             Modifica configurazione
  ${cyan("--logout")}             Rimuovi configurazione locale
  ${cyan("--force")}              Forza aggiornamento DNS

${chalk.bold("DAEMON MODE:")}
  ${cyan("--daemon")}             Avvia in modalità daemon (aggiornamento continuo)
  ${cyan("--interval")} <sec>     Intervallo aggiornamento daemon (default: 300s)

${chalk.bold("OPZIONI:")}
  ${cyan("--cron")}               Modalità silenziosa per cronjob
  ${cyan("--quiet")}              Nasconde banner
  ${cyan("--json")}               Output JSON (machine-readable)
  ${cyan("-v, --version")}        Mostra versione
  ${cyan("-h, --help")}           Mostra questo help

${chalk.bold("MODALITÀ INTERATTIVA:")}
  Esegui ${cyan("apertodns")} senza argomenti per il menu interattivo.

${chalk.bold("AUTENTICAZIONE:")}
  Puoi autenticarti in 3 modi:
  1. ${cyan("--setup")} - Login interattivo (salva JWT in ~/.apertodns/)
  2. ${cyan("--api-key <key>")} - Usa API key per singola operazione
  3. Variabile ambiente ${cyan("APERTODNS_API_KEY")}

${gray("Esempi:")}
  ${gray("$")} apertodns --dashboard
  ${gray("$")} apertodns --domains --json
  ${gray("$")} apertodns --add-domain mioserver.apertodns.com
  ${gray("$")} apertodns --test mioserver.apertodns.com
  ${gray("$")} apertodns --daemon --interval 60
  ${gray("$")} apertodns --api-key ak_xxx... --domains --json

${gray("Docs: https://apertodns.com/docs")}
`);
  process.exit(0);
}

if (showVersion) {
  if (showJson) {
    console.log(JSON.stringify({ name: "apertodns", version: CURRENT_VERSION }));
  } else {
    console.log(`ApertoDNS CLI v${CURRENT_VERSION}`);
  }
  process.exit(0);
}

if (!isQuiet && !isCron) showBanner();

// Load config
let config = {};
if (fs.existsSync(CONFIG_PATH)) {
  try {
    config = JSON.parse(fs.readFileSync(CONFIG_PATH, "utf-8"));
  } catch (err) {
    if (!showJson) console.error(red("Errore lettura config.json:"), err.message);
  }
}

// Helper: get auth token (JWT or API Key)
const getAuthToken = async () => {
  // Priority: CLI arg > env var > config file
  if (useApiKey) return useApiKey;
  if (process.env.APERTODNS_API_KEY) return process.env.APERTODNS_API_KEY;
  if (config.jwtToken) return config.jwtToken;
  if (config.apiToken) return config.apiToken; // backward compatibility
  return await promptInput(cyan("🔑 Token JWT o API Key: "));
};

// Helper: get CLI token (per DDNS: status, force, update...)
const getCliToken = async () => {
  if (config.cliToken) return config.cliToken;
  if (config.apiToken) return config.apiToken; // backward compatibility
  return await promptInput(cyan("🔑 Token CLI: "));
};

// Helper: create spinner
const spinner = (text) => ora({ text, spinner: "dots", color: "yellow" });

// Helper: get auth headers (supports both JWT and API Key)
const getAuthHeaders = (token) => {
  // API Keys start with "ak_" or "apertodns_live_" or "apertodns_test_"
  if (token && (token.startsWith('ak_') || token.startsWith('apertodns_live_') || token.startsWith('apertodns_test_'))) {
    return { 'X-API-Key': token };
  }
  return { Authorization: `Bearer ${token}` };
};

// ==================== MY IP ====================

const showMyIpCommand = async () => {
  const spin = !showJson ? spinner("Rilevamento IP...").start() : null;

  try {
    const [ipv4, ipv6] = await Promise.all([
      getCurrentIP('https://api.ipify.org').catch(() => null),
      getCurrentIPv6('https://api6.ipify.org').catch(() => null)
    ]);

    spin?.stop();

    const data = {
      ipv4: ipv4?.trim() || null,
      ipv6: ipv6?.trim() || null,
      timestamp: new Date().toISOString()
    };

    if (showJson) {
      console.log(JSON.stringify(data, null, 2));
    } else {
      console.log(`\n🌐 ${chalk.bold('Il tuo IP pubblico')}\n`);
      console.log(`   ${gray('IPv4:')} ${data.ipv4 ? green.bold(data.ipv4) : red('Non disponibile')}`);
      console.log(`   ${gray('IPv6:')} ${data.ipv6 ? cyan(data.ipv6) : gray('Non disponibile')}`);
      console.log();
    }
  } catch (err) {
    spin?.fail("Errore rilevamento IP");
    if (showJson) {
      console.log(JSON.stringify({ error: err.message }));
    }
  }
};

// ==================== DOMAINS ====================

const fetchDomains = async () => {
  const token = await getAuthToken();
  const spin = !showJson ? spinner("Caricamento domini...").start() : null;
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15000);

    const res = await fetch(`${API_BASE}/domains`, {
      headers: getAuthHeaders(token),
      signal: controller.signal
    });
    clearTimeout(timeout);

    spin?.stop();
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || "Errore fetch domini");
    }
    return await res.json();
  } catch (err) {
    spin?.fail(err.name === 'AbortError' ? "Timeout caricamento domini" : "Errore caricamento domini");
    throw err;
  }
};

const showDomainsList = async () => {
  try {
    const domains = await fetchDomains();

    if (showJson) {
      console.log(JSON.stringify({ domains, count: domains.length }, null, 2));
      return;
    }

    if (domains.length === 0) {
      console.log(yellow("\n⚠️  Nessun dominio trovato.\n"));
      return;
    }

    const table = new Table({
      head: [
        gray('STATO'),
        orange.bold('DOMINIO'),
        cyan('IP ATTUALE'),
        gray('TTL'),
        gray('ULTIMO UPDATE')
      ],
      style: { head: [], border: ['gray'] },
      chars: {
        'top': '─', 'top-mid': '┬', 'top-left': '┌', 'top-right': '┐',
        'bottom': '─', 'bottom-mid': '┴', 'bottom-left': '└', 'bottom-right': '┘',
        'left': '│', 'left-mid': '├', 'mid': '─', 'mid-mid': '┼',
        'right': '│', 'right-mid': '┤', 'middle': '│'
      }
    });

    domains.forEach(d => {
      const status = d.ip ? green('● ONLINE') : red('● OFFLINE');
      const lastUpdate = d.lastUpdated
        ? new Date(d.lastUpdated).toLocaleString("it-IT", { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })
        : gray('Mai');

      table.push([
        status,
        chalk.bold(d.name),
        d.ip || gray('N/D'),
        `${d.ttl}s`,
        lastUpdate
      ]);
    });

    console.log(`\n📋 ${chalk.bold('I tuoi domini')} (${domains.length})\n`);
    console.log(table.toString());
    console.log();
  } catch (err) {
    if (showJson) {
      console.log(JSON.stringify({ error: err.message }));
    }
  }
};

const addDomain = async (name) => {
  const token = await getAuthToken();
  const domainName = name || await promptInput(cyan("📝 Nome dominio (es. mioserver.apertodns.com): "));

  if (!domainName) {
    if (showJson) {
      console.log(JSON.stringify({ error: "Nome dominio richiesto" }));
    } else {
      console.log(red("Nome dominio richiesto."));
    }
    return;
  }

  const spin = !showJson ? spinner(`Creazione dominio ${domainName}...`).start() : null;
  try {
    const res = await fetch(`${API_BASE}/domains/standard`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...getAuthHeaders(token)
      },
      body: JSON.stringify({ name: domainName })
    });
    const data = await res.json();

    if (res.ok) {
      spin?.succeed(`Dominio "${domainName}" creato!`);

      if (showJson) {
        console.log(JSON.stringify({ success: true, domain: domainName, token: data.token }));
      } else if (data.token) {
        console.log(yellow("\n🔐 Token generato:"), chalk.bold.white(data.token));
        console.log(gray("   (Salvalo subito, non sarà più visibile)\n"));
      }
    } else {
      spin?.fail(`Errore: ${data.error || data.message}`);
      if (showJson) {
        console.log(JSON.stringify({ error: data.error || data.message }));
      }
    }
  } catch (err) {
    spin?.fail(err.message);
    if (showJson) {
      console.log(JSON.stringify({ error: err.message }));
    }
  }
};

const deleteDomain = async (name) => {
  const token = await getAuthToken();
  const domains = await fetchDomains();

  let domainName = name;
  if (!domainName) {
    if (domains.length === 0) {
      if (showJson) {
        console.log(JSON.stringify({ error: "Nessun dominio da eliminare" }));
      } else {
        console.log(yellow("Nessun dominio da eliminare."));
      }
      return;
    }
    const { selected } = await inquirer.prompt([{
      type: "list",
      name: "selected",
      message: "Quale dominio vuoi eliminare?",
      choices: domains.map(d => ({
        name: `${d.ip ? green('●') : red('●')} ${d.name}`,
        value: d.name
      }))
    }]);
    domainName = selected;
  }

  const domain = domains.find(d => d.name === domainName);
  if (!domain) {
    if (showJson) {
      console.log(JSON.stringify({ error: `Dominio "${domainName}" non trovato` }));
    } else {
      console.log(red(`Dominio "${domainName}" non trovato.`));
    }
    return;
  }

  if (!showJson) {
    const { confirm } = await inquirer.prompt([{
      type: "confirm",
      name: "confirm",
      message: red(`⚠️  Eliminare definitivamente "${domainName}"?`),
      default: false
    }]);

    if (!confirm) {
      console.log(gray("Operazione annullata."));
      return;
    }
  }

  const spin = !showJson ? spinner(`Eliminazione ${domainName}...`).start() : null;
  try {
    const res = await fetch(`${API_BASE}/domains/${domain.id}`, {
      method: "DELETE",
      headers: getAuthHeaders(token)
    });

    if (res.ok) {
      spin?.succeed(`Dominio "${domainName}" eliminato.`);
      if (showJson) {
        console.log(JSON.stringify({ success: true, deleted: domainName }));
      }
    } else {
      const data = await res.json();
      spin?.fail(`Errore: ${data.error || data.message}`);
      if (showJson) {
        console.log(JSON.stringify({ error: data.error || data.message }));
      }
    }
  } catch (err) {
    spin?.fail(err.message);
    if (showJson) {
      console.log(JSON.stringify({ error: err.message }));
    }
  }
};

// ==================== DNS TEST ====================

const testDnsResolution = async (domain) => {
  const domainToTest = domain || await promptInput(cyan("🌐 Dominio da testare: "));
  if (!domainToTest) return;

  // Validazione dominio per prevenire command injection
  const domainRegex = /^[a-zA-Z0-9][a-zA-Z0-9-_.]+[a-zA-Z0-9]$/;
  if (!domainRegex.test(domainToTest) || domainToTest.includes('..')) {
    if (showJson) {
      console.log(JSON.stringify({ error: "Nome dominio non valido" }));
    } else {
      console.log(red("\n❌ Nome dominio non valido.\n"));
    }
    return;
  }

  const spin = !showJson ? spinner(`Testing DNS per ${domainToTest}...`).start() : null;

  try {
    const { execFileSync } = await import('child_process');
    const result = execFileSync('dig', ['+short', domainToTest, 'A'], { encoding: 'utf-8' }).trim();
    const result6 = execFileSync('dig', ['+short', domainToTest, 'AAAA'], { encoding: 'utf-8' }).trim();

    // Propagation check
    const dnsServers = ['8.8.8.8', '1.1.1.1'];
    const propagation = {};

    for (const dns of dnsServers) {
      try {
        const check = execFileSync('dig', ['+short', `@${dns}`, domainToTest, 'A'], { encoding: 'utf-8' }).trim();
        propagation[dns] = check || null;
      } catch {
        propagation[dns] = null;
      }
    }

    spin?.stop();

    if (showJson) {
      console.log(JSON.stringify({
        domain: domainToTest,
        records: {
          A: result || null,
          AAAA: result6 || null
        },
        propagation,
        timestamp: new Date().toISOString()
      }, null, 2));
    } else {
      console.log(`\n🔍 ${chalk.bold('Risultati DNS per')} ${cyan(domainToTest)}\n`);

      const table = new Table({
        style: { head: [], border: ['gray'] }
      });

      table.push(
        [gray('Record A (IPv4)'), result || red('Non trovato')],
        [gray('Record AAAA (IPv6)'), result6 || gray('Non configurato')]
      );

      console.log(table.toString());

      console.log(`\n${gray('Propagazione DNS:')}`);
      for (const [dns, ip] of Object.entries(propagation)) {
        console.log(`   ${dns}: ${ip ? green('✓ ' + ip) : red('✗ Non trovato')}`);
      }
      console.log();
    }
  } catch (err) {
    spin?.fail("Errore nel test DNS");
    if (showJson) {
      console.log(JSON.stringify({ error: "dig command not available or failed" }));
    } else {
      console.log(gray("   (Assicurati che 'dig' sia installato)\n"));
    }
  }
};

// ==================== TXT RECORDS ====================

const IETF_BASE = "https://api.apertodns.com/.well-known/apertodns/v1";

const setTxtRecord = async (hostname, name, value) => {
  if (!hostname || !name || !value) {
    if (showJson) {
      console.log(JSON.stringify({ error: "Uso: --txt-set <hostname> <name> <value>" }));
    } else {
      console.log(red("\n❌ Uso: --txt-set <hostname> <name> <value>"));
      console.log(gray("   Esempio: --txt-set mio.apertodns.com _acme-challenge abc123\n"));
    }
    return;
  }

  const token = await getAuthToken();
  const spin = !showJson ? spinner(`Impostazione TXT ${name}.${hostname}...`).start() : null;

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15000);

    const res = await fetch(`${IETF_BASE}/update`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...getAuthHeaders(token)
      },
      body: JSON.stringify({
        hostname,
        txt: {
          name,
          value,
          action: "set"
        }
      }),
      signal: controller.signal
    });
    clearTimeout(timeout);

    const data = await res.json();

    if (res.ok && data.success !== false) {
      spin?.succeed(`TXT record impostato: ${name}.${hostname}`);
      if (showJson) {
        console.log(JSON.stringify({ success: true, hostname, txt: { name, value, action: "set" }, response: data }, null, 2));
      } else {
        console.log(gray(`   Nome: ${cyan(name)}`));
        console.log(gray(`   Valore: ${cyan(value)}`));
        console.log();
      }
    } else {
      spin?.fail(`Errore: ${data.error || data.message || 'TXT non supportato'}`);
      if (showJson) {
        console.log(JSON.stringify({ error: data.error || data.message }));
      }
    }
  } catch (err) {
    spin?.fail(err.name === 'AbortError' ? "Timeout" : err.message);
    if (showJson) {
      console.log(JSON.stringify({ error: err.message }));
    }
  }
};

const deleteTxtRecord = async (hostname, name) => {
  if (!hostname || !name) {
    if (showJson) {
      console.log(JSON.stringify({ error: "Uso: --txt-delete <hostname> <name>" }));
    } else {
      console.log(red("\n❌ Uso: --txt-delete <hostname> <name>"));
      console.log(gray("   Esempio: --txt-delete mio.apertodns.com _acme-challenge\n"));
    }
    return;
  }

  const token = await getAuthToken();
  const spin = !showJson ? spinner(`Eliminazione TXT ${name}.${hostname}...`).start() : null;

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15000);

    const res = await fetch(`${IETF_BASE}/update`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...getAuthHeaders(token)
      },
      body: JSON.stringify({
        hostname,
        txt: {
          name,
          action: "delete"
        }
      }),
      signal: controller.signal
    });
    clearTimeout(timeout);

    const data = await res.json();

    if (res.ok && data.success !== false) {
      spin?.succeed(`TXT record eliminato: ${name}.${hostname}`);
      if (showJson) {
        console.log(JSON.stringify({ success: true, hostname, txt: { name, action: "delete" }, response: data }, null, 2));
      }
    } else {
      spin?.fail(`Errore: ${data.error || data.message || 'TXT non supportato'}`);
      if (showJson) {
        console.log(JSON.stringify({ error: data.error || data.message }));
      }
    }
  } catch (err) {
    spin?.fail(err.name === 'AbortError' ? "Timeout" : err.message);
    if (showJson) {
      console.log(JSON.stringify({ error: err.message }));
    }
  }
};

// ==================== TOKENS ====================

const fetchTokens = async () => {
  const token = await getAuthToken();
  const spin = !showJson ? spinner("Caricamento token...").start() : null;
  try {
    const res = await fetch(`${API_BASE}/tokens`, {
      headers: getAuthHeaders(token)
    });
    spin?.stop();
    if (!res.ok) throw new Error("Errore fetch token");
    return await res.json();
  } catch (err) {
    spin?.fail("Errore caricamento token");
    return [];
  }
};

const showTokensList = async () => {
  const tokens = await fetchTokens();

  if (showJson) {
    console.log(JSON.stringify({ tokens, count: tokens.length }, null, 2));
    return;
  }

  if (tokens.length === 0) {
    console.log(yellow("\n⚠️  Nessun token trovato.\n"));
    return;
  }

  const table = new Table({
    head: [
      gray('STATO'),
      orange.bold('ETICHETTA'),
      cyan('DOMINIO'),
      gray('ID'),
      gray('ULTIMO USO')
    ],
    style: { head: [], border: ['gray'] }
  });

  tokens.forEach(t => {
    const status = t.active ? green('● ATTIVO') : red('● OFF');
    const lastUsed = t.lastUsed
      ? new Date(t.lastUsed).toLocaleString("it-IT", { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })
      : gray('Mai');

    table.push([
      status,
      chalk.bold(t.label || 'N/D'),
      t.domain?.name || gray('N/D'),
      gray(t.id),
      lastUsed
    ]);
  });

  console.log(`\n🔑 ${chalk.bold('I tuoi token')} (${tokens.length})\n`);
  console.log(table.toString());
  console.log();
};

const updateTokenState = async (tokenId, desiredState = null) => {
  const apiToken = await getAuthToken();
  if (!tokenId) {
    if (showJson) {
      console.log(JSON.stringify({ error: "Token ID richiesto" }));
    } else {
      console.error(red("Devi specificare un tokenId"));
    }
    return;
  }

  let finalState = desiredState;
  if (desiredState === null) {
    const spin = !showJson ? spinner("Caricamento...").start() : null;
    const res = await fetch(`${API_BASE}/tokens`, {
      headers: getAuthHeaders(apiToken)
    });
    const all = await res.json();
    spin?.stop();

    const token = all.find(t => t.id === parseInt(tokenId));
    if (!token) {
      if (showJson) {
        console.log(JSON.stringify({ error: `Token ID ${tokenId} non trovato` }));
      } else {
        console.error(red(`Token ID ${tokenId} non trovato.`));
      }
      return;
    }
    finalState = !token.active;
  }

  const spin = !showJson ? spinner(`${finalState ? 'Attivazione' : 'Disattivazione'} token...`).start() : null;
  const res = await fetch(`${API_BASE}/tokens/${tokenId}`, {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
      ...getAuthHeaders(apiToken)
    },
    body: JSON.stringify({ active: finalState })
  });

  if (res.ok) {
    spin?.succeed(`Token ${tokenId} ${finalState ? green('attivato') : red('disattivato')}`);
    if (showJson) {
      console.log(JSON.stringify({ success: true, tokenId, active: finalState }));
    }
  } else {
    const data = await res.json();
    spin?.fail(`Errore: ${data.error || data.message}`);
    if (showJson) {
      console.log(JSON.stringify({ error: data.error || data.message }));
    }
  }
};

// ==================== API KEYS ====================

const fetchApiKeys = async () => {
  const token = await getAuthToken();
  const spin = !showJson ? spinner("Caricamento API keys...").start() : null;

  try {
    const res = await fetch(`${API_BASE}/api-keys`, {
      headers: getAuthHeaders(token)
    });

    spin?.stop();

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || "Errore fetch API keys");
    }
    return await res.json();
  } catch (err) {
    spin?.fail("Errore caricamento API keys");
    throw err;
  }
};

const showApiKeysList = async () => {
  try {
    const keys = await fetchApiKeys();

    if (showJson) {
      console.log(JSON.stringify({ apiKeys: keys, count: keys.length }, null, 2));
      return;
    }

    if (keys.length === 0) {
      console.log(yellow("\n⚠️  Nessuna API key trovata.\n"));
      return;
    }

    const table = new Table({
      head: [gray('STATO'), blue.bold('NOME'), gray('PREFIX'), gray('SCOPES'), gray('RATE'), gray('SCADENZA')],
      style: { head: [], border: ['gray'] }
    });

    keys.forEach(k => {
      const status = k.active !== false ? green('● ON') : red('● OFF');
      const scopes = k.scopes?.length > 3 ? `${k.scopes.length} scopes` : k.scopes?.join(', ') || 'N/D';
      const expires = k.expiresAt ? new Date(k.expiresAt).toLocaleDateString('it-IT') : gray('Mai');
      table.push([status, chalk.bold(k.name), gray(k.keyPrefix + '...'), scopes, `${k.rateLimit}/h`, expires]);
    });

    console.log(`\n🔐 ${chalk.bold('API Keys')} (${keys.length})\n`);
    console.log(table.toString());
    console.log();
  } catch (err) {
    if (showJson) {
      console.log(JSON.stringify({ error: err.message }));
    }
  }
};

const showScopesCommand = async () => {
  const token = await getAuthToken();
  const spin = !showJson ? spinner("Caricamento scopes...").start() : null;

  try {
    const res = await fetch(`${API_BASE}/api-keys/scopes`, {
      headers: getAuthHeaders(token)
    });

    spin?.stop();

    if (!res.ok) throw new Error("Errore fetch scopes");
    const data = await res.json();

    if (showJson) {
      console.log(JSON.stringify(data, null, 2));
      return;
    }

    console.log(`\n📋 ${chalk.bold('Scopes API disponibili')}\n`);

    if (data.groups) {
      for (const [groupName, scopes] of Object.entries(data.groups)) {
        console.log(`\n${orange.bold(groupName.toUpperCase())}`);
        for (const scope of scopes) {
          const info = data.scopes?.[scope] || {};
          console.log(`   ${cyan(scope.padEnd(25))} ${gray(info.description || '')}`);
        }
      }
    } else if (data.scopes) {
      for (const [scope, info] of Object.entries(data.scopes)) {
        console.log(`   ${cyan(scope.padEnd(25))} ${gray(info.description || '')}`);
      }
    }
    console.log();
  } catch (err) {
    spin?.fail("Errore caricamento scopes");
    if (showJson) {
      console.log(JSON.stringify({ error: err.message }));
    }
  }
};

const createApiKey = async (name) => {
  const token = await getAuthToken();
  const keyName = name || await promptInput(cyan("📝 Nome API key: "));

  if (!keyName) {
    if (showJson) {
      console.log(JSON.stringify({ error: "Nome richiesto" }));
    } else {
      console.log(red("Nome richiesto."));
    }
    return;
  }

  // Seleziona scopes
  let selectedScopes = ['domains:read'];

  if (!showJson) {
    // Fetch available scopes
    try {
      const scopesRes = await fetch(`${API_BASE}/api-keys/scopes`, {
        headers: getAuthHeaders(token)
      });
      const scopesData = await scopesRes.json();

      if (scopesData.scopes) {
        const scopeChoices = Object.entries(scopesData.scopes).map(([scope, info]) => ({
          name: `${scope} - ${info.description || ''}`,
          value: scope,
          checked: scope === 'domains:read'
        }));

        const { scopes } = await inquirer.prompt([{
          type: "checkbox",
          name: "scopes",
          message: "Seleziona gli scopes:",
          choices: scopeChoices,
          validate: (answer) => answer.length > 0 || 'Seleziona almeno uno scope'
        }]);
        selectedScopes = scopes;
      }
    } catch {
      // Use default scopes
    }
  }

  const spin = !showJson ? spinner(`Creazione API key "${keyName}"...`).start() : null;

  try {
    const res = await fetch(`${API_BASE}/api-keys`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...getAuthHeaders(token)
      },
      body: JSON.stringify({
        name: keyName,
        scopes: selectedScopes,
        rateLimit: 1000
      })
    });

    const data = await res.json();

    if (res.ok && data.success) {
      spin?.succeed(`API key "${keyName}" creata!`);

      if (showJson) {
        console.log(JSON.stringify({
          success: true,
          apiKey: {
            id: data.apiKey.id,
            name: data.apiKey.name,
            key: data.apiKey.key,
            keyPrefix: data.apiKey.keyPrefix,
            scopes: data.apiKey.scopes
          }
        }, null, 2));
      } else {
        console.log(yellow("\n🔐 API Key generata:"));
        console.log(chalk.bold.white(`   ${data.apiKey.key}`));
        console.log(red("\n   ⚠️  IMPORTANTE: Salva questa chiave ora!"));
        console.log(gray("   Non sarà più visibile dopo questa schermata.\n"));
        console.log(gray(`   Scopes: ${data.apiKey.scopes?.join(', ')}`));
        console.log(gray(`   Prefix: ${data.apiKey.keyPrefix}...`));
        console.log();
      }
    } else {
      spin?.fail(`Errore: ${data.error || data.message}`);
      if (showJson) {
        console.log(JSON.stringify({ error: data.error || data.message }));
      }
    }
  } catch (err) {
    spin?.fail(err.message);
    if (showJson) {
      console.log(JSON.stringify({ error: err.message }));
    }
  }
};

const deleteApiKey = async (keyId) => {
  const token = await getAuthToken();

  if (!keyId) {
    // Interactive selection
    const keys = await fetchApiKeys();
    if (keys.length === 0) {
      if (showJson) {
        console.log(JSON.stringify({ error: "Nessuna API key da eliminare" }));
      } else {
        console.log(yellow("Nessuna API key da eliminare."));
      }
      return;
    }

    const { selected } = await inquirer.prompt([{
      type: "list",
      name: "selected",
      message: "Quale API key vuoi eliminare?",
      choices: keys.map(k => ({
        name: `${k.name} (${k.keyPrefix}...)`,
        value: k.id
      }))
    }]);
    keyId = selected;
  }

  if (!showJson) {
    const { confirm } = await inquirer.prompt([{
      type: "confirm",
      name: "confirm",
      message: red(`⚠️  Eliminare definitivamente questa API key?`),
      default: false
    }]);

    if (!confirm) {
      console.log(gray("Operazione annullata."));
      return;
    }
  }

  const spin = !showJson ? spinner(`Eliminazione API key...`).start() : null;

  try {
    const res = await fetch(`${API_BASE}/api-keys/${keyId}`, {
      method: "DELETE",
      headers: getAuthHeaders(token)
    });

    if (res.ok) {
      spin?.succeed("API key eliminata.");
      if (showJson) {
        console.log(JSON.stringify({ success: true, deleted: keyId }));
      }
    } else {
      const data = await res.json();
      spin?.fail(`Errore: ${data.error || data.message}`);
      if (showJson) {
        console.log(JSON.stringify({ error: data.error || data.message }));
      }
    }
  } catch (err) {
    spin?.fail(err.message);
    if (showJson) {
      console.log(JSON.stringify({ error: err.message }));
    }
  }
};

// ==================== STATS ====================

const showStatsCommand = async () => {
  const token = await getAuthToken();
  const spin = !showJson ? spinner("Caricamento statistiche...").start() : null;

  try {
    const [domainsRes, tokensRes, statsRes] = await Promise.all([
      fetch(`${API_BASE}/domains`, { headers: getAuthHeaders(token) }),
      fetch(`${API_BASE}/tokens`, { headers: getAuthHeaders(token) }),
      fetch(`${API_BASE}/stats/daily?days=7`, { headers: getAuthHeaders(token) }).catch(() => null)
    ]);

    const domains = await domainsRes.json();
    const tokens = await tokensRes.json();
    const stats = statsRes?.ok ? await statsRes.json() : [];

    spin?.stop();

    if (showJson) {
      console.log(JSON.stringify({
        summary: {
          totalDomains: domains.length,
          onlineDomains: domains.filter(d => d.ip).length,
          totalTokens: tokens.length,
          activeTokens: tokens.filter(t => t.active).length
        },
        dailyStats: stats,
        timestamp: new Date().toISOString()
      }, null, 2));
      return;
    }

    console.log(`\n📊 ${chalk.bold('Statistiche ApertoDNS')}\n`);

    // Summary boxes
    const box1 = `┌─────────────────┐
│ ${orange.bold(String(domains.length).padStart(2))} Domini     │
└─────────────────┘`;

    const box2 = `┌─────────────────┐
│ ${green.bold(String(tokens.filter(t => t.active).length).padStart(2))} Token attivi│
└─────────────────┘`;

    const box3 = `┌─────────────────┐
│ ${cyan.bold(String(domains.filter(d => d.ip).length).padStart(2))} Online      │
└─────────────────┘`;

    console.log(gray(box1.split('\n')[0] + '  ' + box2.split('\n')[0] + '  ' + box3.split('\n')[0]));
    console.log(gray(box1.split('\n')[1] + '  ' + box2.split('\n')[1] + '  ' + box3.split('\n')[1]));
    console.log(gray(box1.split('\n')[2] + '  ' + box2.split('\n')[2] + '  ' + box3.split('\n')[2]));

    // Weekly chart
    if (stats.length > 0) {
      console.log(`\n${gray('Aggiornamenti ultimi 7 giorni:')}`);
      const maxUpdates = Math.max(...stats.map(s => s.updates || 0), 1);

      stats.forEach(day => {
        const barLength = Math.round((day.updates || 0) / maxUpdates * 20);
        const bar = '█'.repeat(barLength) + '░'.repeat(20 - barLength);
        const date = new Date(day.date).toLocaleDateString('it-IT', { weekday: 'short', day: '2-digit' });
        console.log(`   ${gray(date)} ${orange(bar)} ${day.updates || 0}`);
      });
    }

    console.log();
  } catch (err) {
    spin?.fail("Errore caricamento statistiche");
    if (showJson) {
      console.log(JSON.stringify({ error: err.message }));
    }
  }
};

// ==================== LOGS ====================

const showLogsCommand = async () => {
  const token = await getAuthToken();
  const spin = !showJson ? spinner("Caricamento log...").start() : null;

  try {
    const res = await fetch(`${API_BASE}/logs?limit=10`, {
      headers: getAuthHeaders(token)
    });

    if (!res.ok) throw new Error("Errore fetch logs");
    const data = await res.json();
    const logs = data.logs || data;

    spin?.stop();

    if (showJson) {
      console.log(JSON.stringify({ logs, count: logs.length }, null, 2));
      return;
    }

    if (logs.length === 0) {
      console.log(yellow("\n⚠️  Nessun log recente.\n"));
      return;
    }

    console.log(`\n📜 ${chalk.bold('Ultimi log')}\n`);

    logs.forEach(l => {
      const time = new Date(l.createdAt).toLocaleString('it-IT', {
        day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit'
      });
      const actionColor = l.action === 'UPDATE' ? green :
                         l.action === 'CREATE' ? blue :
                         l.action === 'DELETE' ? red : gray;

      console.log(`   ${gray(time)} ${actionColor(l.action.padEnd(8))} ${l.token?.label || 'N/D'} ${gray('→')} ${l.token?.domain?.name || 'N/D'}`);
    });

    console.log();
  } catch (err) {
    spin?.fail("Errore caricamento log");
    if (showJson) {
      console.log(JSON.stringify({ error: err.message }));
    }
  }
};

// ==================== WEBHOOKS ====================

const showWebhooksList = async () => {
  const token = await getAuthToken();
  const spin = !showJson ? spinner("Caricamento webhook...").start() : null;

  try {
    const res = await fetch(`${API_BASE}/webhooks`, {
      headers: getAuthHeaders(token)
    });

    if (!res.ok) throw new Error("Errore fetch webhooks");
    const webhooks = await res.json();

    spin?.stop();

    if (showJson) {
      console.log(JSON.stringify({ webhooks, count: webhooks.length }, null, 2));
      return;
    }

    if (webhooks.length === 0) {
      console.log(yellow("\n⚠️  Nessun webhook configurato.\n"));
      return;
    }

    const table = new Table({
      head: [gray('STATO'), purple.bold('URL'), gray('EVENTI'), gray('DOMINIO')],
      style: { head: [], border: ['gray'] }
    });

    webhooks.forEach(w => {
      const status = w.active ? green('● ON') : red('● OFF');
      const url = w.url.length > 40 ? w.url.substring(0, 37) + '...' : w.url;
      table.push([status, url, w.events?.join(', ') || 'ALL', w.domain?.name || 'Tutti']);
    });

    console.log(`\n🔗 ${chalk.bold('Webhooks')} (${webhooks.length})\n`);
    console.log(table.toString());
    console.log();
  } catch (err) {
    spin?.fail("Errore caricamento webhooks");
    if (showJson) {
      console.log(JSON.stringify({ error: err.message }));
    }
  }
};

// ==================== DASHBOARD ====================

const showDashboardCommand = async () => {
  const token = await getAuthToken();
  const spin = !showJson ? spinner("Caricamento dashboard...").start() : null;

  try {
    const [domainsRes, tokensRes, ipRes] = await Promise.all([
      fetch(`${API_BASE}/domains`, { headers: getAuthHeaders(token) }),
      fetch(`${API_BASE}/tokens`, { headers: getAuthHeaders(token) }),
      getCurrentIP('https://api.ipify.org').catch(() => null)
    ]);

    const domains = await domainsRes.json();
    const tokens = await tokensRes.json();

    spin?.stop();

    if (showJson) {
      console.log(JSON.stringify({
        currentIp: ipRes?.trim() || null,
        domains: {
          total: domains.length,
          online: domains.filter(d => d.ip).length,
          list: domains.map(d => ({ name: d.name, ip: d.ip, lastUpdated: d.lastUpdated }))
        },
        tokens: {
          total: tokens.length,
          active: tokens.filter(t => t.active).length
        },
        timestamp: new Date().toISOString()
      }, null, 2));
      return;
    }

    console.log(`\n${orange.bold('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')}`);
    console.log(`${orange.bold('                         DASHBOARD                           ')}`);
    console.log(`${orange.bold('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')}\n`);

    // Current IP
    console.log(`  🌐 ${gray('IP Attuale:')} ${green.bold(ipRes?.trim() || 'N/D')}`);
    console.log();

    // Stats row
    const onlineDomains = domains.filter(d => d.ip).length;
    const activeTokens = tokens.filter(t => t.active).length;

    console.log(`  ┌──────────────┬──────────────┬──────────────┬──────────────┐`);
    console.log(`  │ ${orange.bold('DOMINI')}       │ ${green.bold('ONLINE')}       │ ${cyan.bold('TOKEN')}        │ ${purple.bold('ATTIVI')}       │`);
    console.log(`  │     ${chalk.bold(String(domains.length).padStart(3))}      │     ${chalk.bold(String(onlineDomains).padStart(3))}      │     ${chalk.bold(String(tokens.length).padStart(3))}      │     ${chalk.bold(String(activeTokens).padStart(3))}      │`);
    console.log(`  └──────────────┴──────────────┴──────────────┴──────────────┘`);
    console.log();

    // Domains preview
    if (domains.length > 0) {
      console.log(`  ${gray('Ultimi domini:')}`);
      domains.slice(0, 5).forEach(d => {
        const status = d.ip ? green('●') : red('●');
        console.log(`   ${status} ${chalk.bold(d.name)} ${gray('→')} ${d.ip || gray('N/D')}`);
      });
      if (domains.length > 5) console.log(`   ${gray(`... e altri ${domains.length - 5}`)}`);
    }

    console.log();
    console.log(`  ${gray('─'.repeat(60))}`);
    console.log(`  ${gray('Usa')} ${cyan('--help')} ${gray('per vedere tutti i comandi disponibili')}`);
    console.log();
  } catch (err) {
    spin?.fail("Errore caricamento dashboard");
    if (showJson) {
      console.log(JSON.stringify({ error: err.message }));
    }
  }
};

// ==================== EXISTING FUNCTIONS ====================

const fetchRemoteConfig = async (token) => {
  try {
    const res = await fetch(`${API_BASE}/cli-config/from-token`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token })
    });
    const data = await res.json();
    if (!res.ok || !data.config || !data.config.id) throw new Error(data.error || "Configurazione non valida");
    return data.config;
  } catch (err) {
    return null;
  }
};

const setup = async () => {
  console.log(cyan("\n🔧 Configurazione ApertoDNS CLI\n"));

  const { hasAccount } = await inquirer.prompt([{
    type: "list",
    name: "hasAccount",
    message: "Seleziona un'opzione:",
    choices: [
      { name: green('🔓 Ho già un account - Login'), value: true },
      { name: blue('📝 Sono nuovo - Registrati sul sito'), value: false }
    ]
  }]);

  let apiToken;

  if (hasAccount) {
    const { email, password } = await inquirer.prompt([
      { type: "input", name: "email", message: "📧 Email:" },
      { type: "password", name: "password", message: "🔑 Password:", mask: "●" }
    ]);

    const spin = spinner("Login in corso...").start();
    const res = await fetch(`${API_BASE}/auth/cli-login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password })
    });
    const data = await res.json();

    if (!res.ok || !data.token) {
      spin.fail("Login fallito: " + (data.error || data.message || "Errore"));
      return;
    }
    apiToken = data.token;
    config.jwtToken = data.token;
    spin.succeed("Login effettuato!");
  } else {
    // Registrazione solo via web per sicurezza (captcha)
    console.log(cyan("\n📝 Per registrarti, visita: ") + orange.bold("https://apertodns.com/register"));
    console.log(gray("   Dopo la registrazione, torna qui per fare il login.\n"));
    return;
  }

  const remoteConfig = await fetchRemoteConfig(apiToken);
  config = remoteConfig ? { ...remoteConfig, jwtToken: apiToken } : { jwtToken: apiToken };

  const { save } = await inquirer.prompt([{
    type: "confirm",
    name: "save",
    message: "💾 Salvare la configurazione su questo computer?",
    default: true
  }]);

  if (save) {
    fs.writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2));
    console.log(green(`\n✅ Configurazione salvata in ${CONFIG_PATH}`));
    console.log(yellow("⚠️  Non condividere questo file - contiene il tuo token.\n"));
  }
};

const verifyToken = async () => {
  const apiToken = await promptInput(cyan("🔍 Token da verificare: "));
  const spin = !showJson ? spinner("Verifica in corso...").start() : null;

  try {
    const res = await fetch(`${API_BASE}/tokens/verify`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token: apiToken })
    });
    const data = await res.json();

    if (data.valid) {
      spin?.succeed("Token valido!");

      if (showJson) {
        console.log(JSON.stringify({ valid: true, ...data }));
      } else {
        console.log(`   ${gray('Etichetta:')} ${data.label}`);
        console.log(`   ${gray('Creato:')} ${new Date(data.createdAt).toLocaleString("it-IT")}\n`);
      }
    } else {
      spin?.fail("Token non valido");
      if (showJson) {
        console.log(JSON.stringify({ valid: false }));
      }
    }
  } catch (err) {
    spin?.fail("Errore nella verifica");
    if (showJson) {
      console.log(JSON.stringify({ error: err.message }));
    }
  }
};

const showCurrentStatus = async () => {
  const cliToken = await getCliToken();
  const spin = !showJson ? spinner("Caricamento stato...").start() : null;

  const remote = await fetchRemoteConfig(cliToken);
  if (!remote) {
    spin?.fail("Impossibile caricare la configurazione");
    if (showJson) {
      console.log(JSON.stringify({ error: "Configurazione non trovata" }));
    }
    return;
  }

  const currentIP = await getCurrentIP(remote.ipService).catch(() => null);
  const lastIP = loadLastIP();

  spin?.stop();

  if (showJson) {
    console.log(JSON.stringify({
      domain: remote.domain,
      ttl: remote.ttl,
      currentIp: currentIP?.trim() || null,
      lastKnownIp: lastIP || null,
      ipv6Enabled: remote.useIPv6,
      ipService: remote.ipService
    }, null, 2));
    return;
  }

  console.log(`\n📊 ${chalk.bold('Stato Attuale')}\n`);

  const table = new Table({ style: { border: ['gray'] } });
  table.push(
    [gray('Dominio'), cyan.bold(remote.domain)],
    [gray('TTL'), `${remote.ttl}s`],
    [gray('IP Attuale'), green.bold(currentIP?.trim() || 'N/D')],
    [gray('Ultimo IP'), lastIP || gray('N/D')],
    [gray('IPv6'), remote.useIPv6 ? green('Attivo') : gray('Disattivo')]
  );

  console.log(table.toString());
  console.log();
};

const editConfig = async () => {
  const apiToken = await getAuthToken();
  const remote = await fetchRemoteConfig(apiToken);
  if (!remote) {
    console.log(red("Impossibile caricare la configurazione."));
    return;
  }

  const answers = await inquirer.prompt([
    { type: "input", name: "ttl", message: "⏱️  TTL (secondi):", default: String(remote.ttl) },
    { type: "input", name: "ipService", message: "🌐 Servizio IP:", default: remote.ipService },
    { type: "confirm", name: "useIPv6", message: "6️⃣  Usare IPv6?", default: remote.useIPv6 }
  ]);

  const spin = spinner("Salvataggio...").start();
  const res = await fetch(`${API_BASE}/cli-config/${remote.id}`, {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
      ...getAuthHeaders(apiToken)
    },
    body: JSON.stringify({
      ttl: parseInt(answers.ttl),
      ipService: answers.ipService,
      useIPv6: answers.useIPv6
    })
  });

  if (res.ok) {
    spin.succeed("Configurazione aggiornata!");
    config = { ...remote, ...answers, apiToken };
    fs.writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2));
  } else {
    const data = await res.json();
    spin.fail("Errore: " + (data.error || data.message));
  }
};

const runUpdate = async () => {
  let apiToken = config.apiToken;
  if (!apiToken) {
    apiToken = await promptInput(cyan("🔑 Token API: "));
    const remoteConfig = await fetchRemoteConfig(apiToken);
    if (!remoteConfig) {
      if (showJson) {
        console.log(JSON.stringify({ error: "Configurazione non trovata" }));
      } else {
        console.log(red("Configurazione non trovata."));
      }
      return;
    }
    config = { ...remoteConfig, apiToken };
  }

  const spin = !showJson ? spinner("Rilevamento IP...").start() : null;
  const currentIP = await getCurrentIP(config.ipService).catch(() => null);
  const currentIPv6 = config.useIPv6 ? await getCurrentIPv6(config.ipv6Service).catch(() => null) : null;

  if (!currentIP && !currentIPv6) {
    spin?.fail("Nessun IP rilevato");
    if (showJson) {
      console.log(JSON.stringify({ error: "Nessun IP rilevato" }));
    }
    return;
  }

  if (spin) spin.text = `IP rilevato: ${currentIP}`;

  const lastIP = loadLastIP();
  if (!forceUpdate && lastIP === currentIP) {
    spin?.succeed(`IP invariato (${currentIP})`);
    if (showJson) {
      console.log(JSON.stringify({ status: "unchanged", ip: currentIP }));
    }
    return;
  }

  if (spin) spin.text = `Aggiornamento DNS per ${config.domain}...`;

  const body = {
    name: config.domain,
    ip: currentIP,
    ttl: config.ttl,
  };
  if (currentIPv6) body.ipv6 = currentIPv6;

  const res = await fetch(`${API_BASE}/update-dns`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${config.apiToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  const data = await res.json();
  if (res.ok && data.results) {
    saveCurrentIP(currentIP);
    spin?.succeed(`DNS aggiornato! ${config.domain} → ${currentIP}`);
    if (showJson) {
      console.log(JSON.stringify({
        status: "updated",
        domain: config.domain,
        ip: currentIP,
        previousIp: lastIP,
        result: data.results[0]
      }, null, 2));
    }
  } else {
    spin?.fail(`Errore: ${data.error || data.details}`);
    if (showJson) {
      console.log(JSON.stringify({ error: data.error || data.details }));
    }
  }
};

// ==================== UPDATE SINGLE DOMAIN ====================

const updateSingleDomain = async (domainName) => {
  const token = await getAuthToken();
  const spin = !showJson ? spinner(`Rilevamento IP per ${domainName}...`).start() : null;

  try {
    // Get current IP
    const currentIP = await getCurrentIP('https://api.ipify.org').catch(() => null);
    const currentIPv6 = await getCurrentIPv6('https://api6.ipify.org').catch(() => null);

    if (!currentIP && !currentIPv6) {
      spin?.fail("Nessun IP rilevato");
      if (showJson) {
        console.log(JSON.stringify({ error: "Nessun IP rilevato" }));
      }
      return;
    }

    if (spin) spin.text = `Ricerca dominio ${domainName}...`;

    // First, get domain list to find the domain ID
    const listRes = await fetch(`${API_BASE}/domains`, {
      headers: getAuthHeaders(token)
    });

    if (!listRes.ok) {
      const errData = await listRes.json().catch(() => ({}));
      spin?.fail(`Errore autenticazione: ${errData.error || errData.message || 'Token non valido'}`);
      if (showJson) {
        console.log(JSON.stringify({ error: errData.error || errData.message || 'Autenticazione fallita' }));
      }
      return;
    }

    const listData = await listRes.json();
    const domains = listData.domains || listData;
    const domain = domains.find(d => d.name === domainName || d.name.toLowerCase() === domainName.toLowerCase());

    if (!domain) {
      spin?.fail(`Dominio "${domainName}" non trovato nel tuo account`);
      if (showJson) {
        console.log(JSON.stringify({ error: `Dominio "${domainName}" non trovato` }));
      }
      return;
    }

    if (spin) spin.text = `Aggiornamento DNS per ${domainName}...`;

    // Use PATCH /domains/:id to update (supports API Key)
    const updateBody = { ip: currentIP };
    if (currentIPv6) updateBody.ipv6 = currentIPv6;

    const res = await fetch(`${API_BASE}/domains/${domain.id}`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        ...getAuthHeaders(token)
      },
      body: JSON.stringify(updateBody)
    });

    const data = await res.json();

    if (res.ok) {
      spin?.succeed(`DNS aggiornato! ${domainName} → ${currentIP}`);
      if (showJson) {
        console.log(JSON.stringify({
          success: true,
          domain: domainName,
          ip: currentIP,
          ipv6: currentIPv6 || null,
          previousIp: domain.ip,
          result: data
        }, null, 2));
      }
    } else {
      spin?.fail(`Errore: ${data.error || data.details || data.message}`);
      if (showJson) {
        console.log(JSON.stringify({ error: data.error || data.details || data.message }));
      }
    }
  } catch (err) {
    spin?.fail(err.message);
    if (showJson) {
      console.log(JSON.stringify({ error: err.message }));
    }
  }
};

// ==================== DAEMON MODE ====================

const runDaemonMode = async () => {
  console.log(cyan(`\n🔄 Avvio daemon mode (intervallo: ${daemonInterval}s)\n`));
  console.log(gray("   Premi Ctrl+C per terminare\n"));

  const update = async () => {
    const timestamp = new Date().toISOString().replace("T", " ").substring(0, 19);

    try {
      const currentIP = await getCurrentIP(config.ipService || 'https://api.ipify.org').catch(() => null);
      const lastIP = loadLastIP();

      if (lastIP === currentIP) {
        console.log(`${gray(`[${timestamp}]`)} ${gray('IP invariato')} ${currentIP}`);
      } else {
        console.log(`${gray(`[${timestamp}]`)} ${yellow('IP cambiato!')} ${lastIP || 'N/D'} → ${green(currentIP)}`);

        // Trigger update
        if (config.apiToken && config.domain) {
          const body = { name: config.domain, ip: currentIP, ttl: config.ttl || 300 };

          const res = await fetch(`${API_BASE}/update-dns`, {
            method: "POST",
            headers: {
              Authorization: `Bearer ${config.apiToken}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify(body),
          });

          if (res.ok) {
            saveCurrentIP(currentIP);
            console.log(`${gray(`[${timestamp}]`)} ${green('✓ DNS aggiornato')}`);
          } else {
            const data = await res.json();
            console.log(`${gray(`[${timestamp}]`)} ${red('✗ Errore:')} ${data.error || data.details}`);
          }
        }
      }
    } catch (err) {
      console.log(`${gray(`[${timestamp}]`)} ${red('Errore:')} ${err.message}`);
    }
  };

  // Initial update
  await update();

  // Schedule updates
  setInterval(update, daemonInterval * 1000);
};

// ==================== LOGOUT ====================

const runLogout = async () => {
  if (fs.existsSync(CONFIG_PATH)) {
    fs.unlinkSync(CONFIG_PATH);
    if (showJson) {
      console.log(JSON.stringify({ success: true, message: "Configurazione rimossa" }));
    } else {
      console.log(green("\n✅ Configurazione rimossa.\n"));
    }
  } else {
    if (showJson) {
      console.log(JSON.stringify({ success: true, message: "Nessuna configurazione trovata" }));
    } else {
      console.log(yellow("\n⚠️  Nessuna configurazione trovata.\n"));
    }
  }
};

// ==================== INTERACTIVE MODE ====================

const interactiveMode = async () => {
  console.log(gray("  Premi Ctrl+C per uscire\n"));

  while (true) {
    const { action } = await inquirer.prompt([{
      type: "list",
      name: "action",
      message: orange("Cosa vuoi fare?"),
      pageSize: 15,
      choices: [
        { name: `${orange('📊')} Dashboard`, value: "dashboard" },
        new inquirer.Separator(gray('─── Domini ───')),
        { name: `${cyan('📋')} Lista domini`, value: "domains" },
        { name: `${green('➕')} Aggiungi dominio`, value: "add-domain" },
        { name: `${red('🗑️ ')} Elimina dominio`, value: "delete-domain" },
        { name: `${blue('🔍')} Test DNS`, value: "test-dns" },
        new inquirer.Separator(gray('─── Token ───')),
        { name: `${purple('🔑')} Lista token`, value: "tokens" },
        { name: `${yellow('🔄')} Toggle token`, value: "toggle-token" },
        new inquirer.Separator(gray('─── API Keys ───')),
        { name: `${blue('🔐')} Lista API keys`, value: "api-keys" },
        { name: `${green('➕')} Crea API key`, value: "create-api-key" },
        { name: `${red('🗑️ ')} Elimina API key`, value: "delete-api-key" },
        new inquirer.Separator(gray('─── Altro ───')),
        { name: `${cyan('📈')} Statistiche`, value: "stats" },
        { name: `${gray('📜')} Log attività`, value: "logs" },
        { name: `${purple('🔗')} Webhooks`, value: "webhooks" },
        { name: `${cyan('🌐')} Il mio IP`, value: "my-ip" },
        new inquirer.Separator(gray('─── Account ───')),
        { name: `${gray('📊')} Stato attuale`, value: "status" },
        { name: `${green('🔄')} Aggiorna DNS`, value: "update" },
        { name: `${yellow('⚙️ ')} Impostazioni DNS`, value: "config" },
        { name: `${blue('🔑')} Login / Cambia account`, value: "setup" },
        { name: `${red('🚪')} Disconnetti`, value: "logout" },
        new inquirer.Separator(),
        { name: red("❌ Chiudi CLI"), value: "exit" }
      ]
    }]);

    console.log();

    switch (action) {
      case "dashboard": await showDashboardCommand(); break;
      case "domains": await showDomainsList(); break;
      case "add-domain": await addDomain(); break;
      case "delete-domain": await deleteDomain(); break;
      case "test-dns": await testDnsResolution(); break;
      case "tokens": await showTokensList(); break;
      case "toggle-token":
        const tokens = await fetchTokens();
        if (tokens.length === 0) {
          console.log(yellow("Nessun token disponibile."));
          break;
        }
        const { tokenId } = await inquirer.prompt([{
          type: "list",
          name: "tokenId",
          message: "Seleziona token:",
          choices: tokens.map(t => ({
            name: `${t.active ? green('●') : red('●')} ${t.label} ${gray('→')} ${t.domain?.name || 'N/D'}`,
            value: t.id
          }))
        }]);
        await updateTokenState(tokenId, null);
        break;
      case "api-keys": await showApiKeysList(); break;
      case "create-api-key": await createApiKey(); break;
      case "delete-api-key": await deleteApiKey(); break;
      case "stats": await showStatsCommand(); break;
      case "logs": await showLogsCommand(); break;
      case "webhooks": await showWebhooksList(); break;
      case "my-ip": await showMyIpCommand(); break;
      case "status": await showCurrentStatus(); break;
      case "update": await runUpdate(); break;
      case "config": await editConfig(); break;
      case "setup": await setup(); break;
      case "logout": await runLogout(); break;
      case "exit":
        console.log(gray("Arrivederci! 👋\n"));
        process.exit(0);
    }

    console.log();
  }
};

// ==================== MAIN ====================

const main = async () => {
  try {
    if (logout) await runLogout();
    else if (txtSetArgs) await setTxtRecord(txtSetArgs.hostname, txtSetArgs.name, txtSetArgs.value);
    else if (txtDeleteArgs) await deleteTxtRecord(txtDeleteArgs.hostname, txtDeleteArgs.name);
    else if (showMyIp) await showMyIpCommand();
    else if (runDaemon) await runDaemonMode();
    else if (enableTokenId) await updateTokenState(enableTokenId, true);
    else if (disableTokenId) await updateTokenState(disableTokenId, false);
    else if (toggleTokenId) await updateTokenState(toggleTokenId, null);
    else if (showDashboard) await showDashboardCommand();
    else if (listDomains) await showDomainsList();
    else if (addDomainArg) await addDomain(addDomainArg);
    else if (deleteDomainArg) await deleteDomain(deleteDomainArg);
    else if (updateDomainArg) await updateSingleDomain(updateDomainArg);
    else if (testDns) await testDnsResolution(testDns);
    else if (listTokens) await showTokensList();
    else if (showStats) await showStatsCommand();
    else if (showLogs) await showLogsCommand();
    else if (listWebhooks) await showWebhooksList();
    else if (listApiKeys) await showApiKeysList();
    else if (createApiKeyArg) await createApiKey(createApiKeyArg);
    else if (deleteApiKeyArg) await deleteApiKey(deleteApiKeyArg);
    else if (showScopes) await showScopesCommand();
    else if (runSetup) await setup();
    else if (runVerify) await verifyToken();
    else if (showStatus) await showCurrentStatus();
    else if (runConfigEdit) await editConfig();
    else if (runInteractive) await interactiveMode();
    else await runUpdate();
  } catch (err) {
    if (err.message !== 'User force closed the prompt') {
      if (showJson) {
        console.log(JSON.stringify({ error: err.message }));
      } else {
        console.error(red("\n❌ Errore:"), err.message);
      }
    }
    process.exit(1);
  }
};

main();

import fetch from "node-fetch";
import fs from "fs";
import path from "path";
import os from "os";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Get config directory based on platform (XDG compliant)
export const getConfigDir = () => {
  // Check for XDG config home first (Linux standard)
  if (process.env.XDG_CONFIG_HOME) {
    return path.join(process.env.XDG_CONFIG_HOME, "apertodns");
  }

  // Platform-specific defaults
  const platform = os.platform();

  if (platform === "win32") {
    // Windows: use APPDATA
    return path.join(process.env.APPDATA || path.join(os.homedir(), "AppData", "Roaming"), "apertodns");
  }

  // macOS and Linux: use ~/.config/apertodns or ~/.apertodns
  const configDir = path.join(os.homedir(), ".config", "apertodns");

  // Fallback to ~/.apertodns if .config doesn't exist
  if (!fs.existsSync(path.join(os.homedir(), ".config"))) {
    return path.join(os.homedir(), ".apertodns");
  }

  return configDir;
};

// Get data directory for cache and temp files
export const getDataDir = () => {
  const configDir = getConfigDir();
  const dataDir = path.join(configDir, ".data");

  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }

  return dataDir;
};

const dataDir = getDataDir();
const ipPath = path.join(dataDir, "last_ip.txt");
const ipv6Path = path.join(dataDir, "last_ipv6.txt");

export const log = (msg) => {
  const time = new Date().toISOString().replace("T", " ").substring(0, 19);
  console.log(`[${time}] ${msg}`);
};

export const getCurrentIP = async (ipService = 'https://api.ipify.org') => {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000);

    const res = await fetch(ipService, { signal: controller.signal });
    clearTimeout(timeout);

    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const ip = (await res.text()).trim();

    // Validate IPv4
    const ipv4Regex = /^(\d{1,3}\.){3}\d{1,3}$/;
    if (!ipv4Regex.test(ip)) {
      throw new Error("Invalid IPv4 format");
    }

    return ip;
  } catch (err) {
    // Try fallback services
    const fallbacks = [
      'https://api.ipify.org',
      'https://ifconfig.me/ip',
      'https://icanhazip.com',
      'https://checkip.amazonaws.com'
    ];

    for (const fallback of fallbacks) {
      if (fallback === ipService) continue;

      try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 5000);

        const res = await fetch(fallback, { signal: controller.signal });
        clearTimeout(timeout);

        if (res.ok) {
          const ip = (await res.text()).trim();
          const ipv4Regex = /^(\d{1,3}\.){3}\d{1,3}$/;
          if (ipv4Regex.test(ip)) {
            return ip;
          }
        }
      } catch {
        continue;
      }
    }

    throw new Error("Unable to detect IP address");
  }
};

export const getCurrentIPv6 = async (ipService6 = 'https://api6.ipify.org') => {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000);

    const res = await fetch(ipService6, { signal: controller.signal });
    clearTimeout(timeout);

    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const ip = (await res.text()).trim();

    // Basic IPv6 validation (contains colons)
    if (!ip.includes(':')) {
      throw new Error("Invalid IPv6 format");
    }

    return ip;
  } catch (err) {
    // IPv6 might not be available, return null instead of throwing
    return null;
  }
};

export const loadLastIP = () => {
  try {
    return fs.existsSync(ipPath) ? fs.readFileSync(ipPath, "utf-8").trim() : null;
  } catch {
    return null;
  }
};

export const saveCurrentIP = (ip) => {
  try {
    fs.writeFileSync(ipPath, ip);
  } catch (err) {
    // Silently fail - non-critical
  }
};

export const loadLastIPv6 = () => {
  try {
    return fs.existsSync(ipv6Path) ? fs.readFileSync(ipv6Path, "utf-8").trim() : null;
  } catch {
    return null;
  }
};

export const saveCurrentIPv6 = (ip) => {
  try {
    fs.writeFileSync(ipv6Path, ip);
  } catch (err) {
    // Silently fail - non-critical
  }
};

// Export package info
export const getPackageInfo = () => {
  try {
    const pkg = JSON.parse(fs.readFileSync(path.resolve(__dirname, "package.json"), "utf-8"));
    return { name: pkg.name, version: pkg.version };
  } catch {
    return { name: "apertodns", version: "0.0.0" };
  }
};

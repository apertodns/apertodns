# ApertoDNS CLI

[![npm version](https://img.shields.io/npm/v/apertodns.svg)](https://www.npmjs.com/package/apertodns)
[![npm downloads](https://img.shields.io/npm/dm/apertodns.svg)](https://www.npmjs.com/package/apertodns)
[![license](https://img.shields.io/npm/l/apertodns.svg)](https://github.com/apertodns/apertodns/blob/main/LICENSE)
[![node](https://img.shields.io/node/v/apertodns.svg)](https://nodejs.org)

**Dynamic DNS management from your terminal.** Manage domains, tokens, API keys, and DNS updates with style.

ApertoDNS is a free Dynamic DNS service that lets you point a subdomain to your dynamic IP address. Perfect for home servers, IoT devices, game servers, NAS systems, and remote access.

## Why ApertoDNS?

| Feature | ApertoDNS | Dyn (Oracle) | No-IP | DuckDNS |
|---------|-----------|--------------|-------|---------|
| Free plan | Yes | No ($55/yr) | Yes | Yes |
| Free subdomains | Unlimited | 0 | 1 | 5 |
| API Keys with scopes | Yes | No | No | No |
| CLI tool | Yes | No | No | No |
| Docker images | Yes | No | No | No |
| IPv6 support | Yes | Paid | Paid | Yes |
| No forced renewal | Yes | N/A | 30 days | Yes |
| DynDNS2 compatible | Yes | Yes | Yes | No |
| Webhooks | Yes | No | No | No |
| Team sharing | Yes | No | No | No |
| Open Source | Yes | No | No | No |

## Features

- **Easy Setup** - Login or register directly from CLI
- **Multiple Domains** - Manage unlimited subdomains
- **API Keys** - Create and manage API keys with granular scopes
- **Auto Updates** - Set up cron or daemon mode for automatic IP updates
- **Interactive Mode** - Beautiful terminal UI with menus
- **JSON Output** - Machine-readable output for scripting
- **IPv4 & IPv6** - Full dual-stack support
- **Real-time Stats** - View usage statistics and logs
- **Router/NAS Compatible** - Works with Synology, QNAP, and DynDNS2-compatible routers
- **Docker Images** - Official [apertodns/cli](https://hub.docker.com/r/apertodns/cli) and [apertodns/updater](https://hub.docker.com/r/apertodns/updater) images

## Requirements

- Node.js 18.0.0 or higher
- An ApertoDNS account ([register free](https://apertodns.com/register))

## Installation

```bash
# npm
npm install -g apertodns

# yarn
yarn global add apertodns

# pnpm
pnpm add -g apertodns
```

Or use without installing:

```bash
npx apertodns --help
```

## Quick Start

```bash
# 1. Setup (login or register)
apertodns --setup

# 2. View your dashboard
apertodns --dashboard

# 3. List your domains
apertodns --domains

# 4. Force DNS update
apertodns --force
```

## Commands

### Main Commands

| Command | Description |
|---------|-------------|
| `--dashboard` | Complete dashboard with all info |
| `--domains` | List all your domains |
| `--tokens` | List all your tokens |
| `--stats` | Statistics and metrics |
| `--logs` | Recent activity logs |
| `--my-ip` | Show your current public IP |

### Domain Management

| Command | Description |
|---------|-------------|
| `--add-domain <name>` | Create a new subdomain |
| `--delete-domain` | Delete a domain (interactive) |
| `--test <domain>` | Test DNS resolution |
| `update <domain>` | Update a specific domain's IP (use with `--api-key`) |

### Token Management

| Command | Description |
|---------|-------------|
| `--enable <id>` | Enable a token |
| `--disable <id>` | Disable a token |
| `--toggle <id>` | Toggle token state |
| `--verify` | Verify token validity |

### API Keys

| Command | Description |
|---------|-------------|
| `--api-keys` | List all API keys |
| `--create-api-key <name>` | Create new API key |
| `--delete-api-key <id>` | Delete an API key |
| `--scopes` | Show available scopes |
| `--api-key <key>` | Use API key for authentication |

### Configuration

| Command | Description |
|---------|-------------|
| `--setup` | Guided setup (login/register) |
| `--status` | Show current status and IP |
| `--config` | Edit configuration |
| `--logout` | Remove local configuration |
| `--force` | Force DNS update now |

### Standalone Update (DynDNS2)

| Command | Description |
|---------|-------------|
| `--update` | Standalone DynDNS2 update (no config required) |
| `--domain <fqdn>` | Domain to update (with --update) |
| `--token <token>` | Token for authentication (with --update) |
| `--ip <address>` | Custom IP address (optional, auto-detected if omitted) |

### Daemon Mode

| Command | Description |
|---------|-------------|
| `--daemon` | Start daemon mode (continuous updates) |
| `--interval <sec>` | Update interval (default: 300s) |

### Options

| Option | Description |
|--------|-------------|
| `--cron` | Silent mode for cron jobs |
| `--quiet` | Hide banner |
| `--json` | JSON output (machine-readable) |
| `-v, --version` | Show version |
| `-h, --help` | Show help |

## Interactive Mode

Run `apertodns` without arguments for an interactive menu with all options.

```bash
apertodns
```

## Authentication Methods

You can authenticate in 3 ways:

1. **Interactive Login** - Run `apertodns --setup` (saves JWT to ~/.config/apertodns/)
2. **API Key** - Use `--api-key <key>` for single operations
3. **Environment Variable** - Set `APERTODNS_API_KEY`

## JSON Output

All commands support `--json` flag for machine-readable output:

```bash
# Get domains as JSON
apertodns --domains --json

# Get your IP as JSON
apertodns --my-ip --json

# Combine with API key for scripting
apertodns --api-key apertodns_live_xxx... --domains --json
```

## Daemon Mode

Run continuously to keep your DNS updated:

```bash
# Default interval (5 minutes)
apertodns --daemon

# Custom interval (60 seconds)
apertodns --daemon --interval 60
```

## Standalone Update

Update DNS without any saved configuration - perfect for scripts and one-off updates:

```bash
# Auto-detect IP and update
apertodns --update --domain myserver.apertodns.com --token YOUR_TOKEN

# Specify custom IP
apertodns --update --domain myserver.apertodns.com --token YOUR_TOKEN --ip 203.0.113.42
```

## Docker

Run without installing Node.js:

```bash
# Run CLI via Docker
docker run --rm apertodns/cli --help

# Interactive setup (persisted config)
docker run -it -v apertodns_config:/root/.config/apertodns apertodns/cli --setup

# List domains
docker run -v apertodns_config:/root/.config/apertodns apertodns/cli --domains

# Standalone update (no config needed)
docker run --rm apertodns/cli --update --domain myhost.apertodns.com --token YOUR_TOKEN
```

For continuous updates, use the dedicated updater image:

```bash
docker run -d \
  --name apertodns-updater \
  --restart unless-stopped \
  -e TOKEN=your_token \
  -e DOMAINS=myhost.apertodns.com \
  apertodns/updater
```

See [Docker Hub](https://hub.docker.com/r/apertodns/cli) for more options.

## Automatic Updates (Cron)

Set up automatic IP updates with cron:

```bash
# Update every 5 minutes
*/5 * * * * /usr/local/bin/apertodns --cron >> /var/log/apertodns.log 2>&1

# Or every minute for faster updates
* * * * * /usr/local/bin/apertodns --cron
```

Find your apertodns path with: `which apertodns`

## Router Integration (DynDNS2)

ApertoDNS is compatible with routers that support DynDNS2 protocol:

```
Server: api.apertodns.com
Protocol: DynDNS2
Path: /nic/update
Username: your-token
Password: your-token
Hostname: yourdomain.apertodns.com
```

### Compatible Devices

- **Routers**: ASUS, TP-Link, Netgear, Ubiquiti, pfSense, OPNsense, DD-WRT, OpenWRT
- **NAS**: Synology DSM, QNAP QTS, TrueNAS
- **Other**: Any device supporting DynDNS2/DynDNS protocol

## Configuration Storage

Configuration is stored in platform-specific locations:

- **Linux**: `~/.config/apertodns/` or `~/.apertodns/`
- **macOS**: `~/.config/apertodns/`
- **Windows**: `%APPDATA%\apertodns\`

## Troubleshooting

### Common Issues

**"Unable to detect IP address"**
- Check your internet connection
- Try a different IP detection service: the CLI automatically tries multiple fallbacks
- If behind a corporate proxy, the detected IP may be the proxy's IP

**"Authentication failed"**
- Run `apertodns --logout` then `apertodns --setup` to re-authenticate
- If using API key, verify it has the required scopes
- Check if the token/API key is still active in your dashboard

**"DNS not updating"**
- Use `apertodns --force` to force an immediate update
- Check `apertodns --status` to see current IP vs DNS IP
- DNS propagation can take up to 5 minutes

**IPv6 not working**
- IPv6 requires your ISP and network to support it
- Use `apertodns --my-ip --json` to check if IPv6 is detected
- Some networks only provide IPv4

**Permission denied on Linux**
- If installed globally, you may need sudo: `sudo npm install -g apertodns`
- Or use a Node version manager (nvm) to avoid permission issues

**Daemon mode exits unexpectedly**
- Check logs in `/var/log/apertodns.log` if using cron
- Ensure stable internet connection
- Consider using a process manager like PM2 or systemd

### Getting Help

```bash
# Show all commands
apertodns --help

# Check current status
apertodns --status

# Verify authentication
apertodns --verify
```

## Security

- Credentials are stored locally, never transmitted except to ApertoDNS servers
- API keys support granular scopes for least-privilege access
- All API communication uses HTTPS
- No cross-account data access - strict user isolation

## Examples

```bash
# Quick status check
apertodns --status

# Test DNS propagation
apertodns --test myserver.apertodns.com

# Create domain and get token
apertodns --add-domain newserver.apertodns.com

# List domains as JSON
apertodns --domains --json

# Use API key for automation
APERTODNS_API_KEY=apertodns_live_xxx... apertodns --domains --json
```

## Links

- **Website**: [apertodns.com](https://apertodns.com)
- **Dashboard**: [apertodns.com/dashboard](https://apertodns.com/dashboard)
- **Documentation**: [apertodns.com/docs](https://apertodns.com/docs)
- **Issues**: [GitHub Issues](https://github.com/apertodns/apertodns/issues)

## Support

Need help?
- Open an issue on [GitHub](https://github.com/apertodns/apertodns/issues)
- Email: support@apertodns.com

## License

MIT - [Aperto Network](https://apertodns.com)

# Sporky

CLI Bitcoin/Lightning wallet powered by [Breez SDK Spark](https://github.com/breez/spark-sdk) — built for [OpenClaw](https://github.com/OpenAgentsInc/openclaw) bots.

## Setup

```bash
npm install
npm run build
```

Copy `.env.example` to `.env` and fill in:

```bash
cp .env.example .env
```

| Variable | Required | Description |
|---|---|---|
| `SPORKY_API_KEY` | Yes | Breez SDK API key ([get one here](https://breez.technology)) |
| `SPORKY_NSEC` | Yes | Bot's Nostr private key (nsec or hex) — encrypts the wallet file via NIP-44 |
| `SPORKY_MNEMONIC` | No | Mnemonic phrase — bypasses encrypted file storage (for headless bots) |
| `SPORKY_NETWORK` | No | `mainnet` (default) or `regtest` |
| `SPORKY_DATA_DIR` | No | Custom data directory (default: `~/.sporky`) |

## Usage

```bash
node dist/index.js <command> [options]
```

Or link globally:

```bash
npm link
sporky <command> [options]
```

All commands support `--json` for machine-readable output and `--verbose` for SDK debug logging.

### Wallet

```bash
sporky wallet create                # Generate new 12-word mnemonic wallet
sporky wallet restore               # Restore from mnemonic phrase (interactive)
sporky wallet restore-backup <file> # Restore from Spark wallet backup JSON
sporky wallet info                  # Show balance and lightning address
sporky wallet delete                # Delete stored wallet (irreversible)
sporky wallet export-mnemonic       # Decrypt and display mnemonic
```

### Balance

```bash
sporky balance                      # Sync and show balance
sporky balance --no-sync            # Show cached balance (faster)
```

### Send

```bash
sporky send <destination> [--amount <sats>] [--comment <text>]
```

Auto-detects destination type: BOLT11 invoice, lightning address, LNURL, bitcoin address, or spark address. `--amount` is required for addresses, optional for invoices.

### Receive

```bash
sporky receive lightning <amount> [--description <text>]  # Create BOLT11 invoice
sporky receive bitcoin                                     # Get bitcoin deposit address
sporky receive spark                                       # Get spark address
```

### Lightning Address

```bash
sporky address show                              # Show current lightning address
sporky address register <username> [--description <text>]
sporky address check <username>                  # Check availability
sporky address delete
```

### Payments

```bash
sporky payments [--limit <n>] [--offset <n>] [--type send|receive]
```

### Deposits

```bash
sporky deposits list                                     # Show unclaimed deposits
sporky deposits claim <txid> <vout> [--max-fee <sats>]
sporky deposits refund <txid> <vout> <address> [--fee <sats>] [--fee-rate <sat-per-vbyte>]
```

## Wallet Storage

The mnemonic is encrypted using NIP-44 (encrypt-to-self with the bot's nsec) and stored at `~/.sporky/wallet.enc`. SDK data lives in `~/.sporky/data/`.

For fully headless operation, set `SPORKY_MNEMONIC` directly to skip file-based storage entirely.

## Backup Compatibility

Sporky can restore wallets from Spark wallet backup files (JSON format with NIP-44 or NIP-04 encrypted mnemonics):

```bash
sporky wallet restore-backup ~/Downloads/spark-wallet-backup.json
```

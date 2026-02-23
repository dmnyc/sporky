import { Command } from "commander";
import { generateMnemonic, validateMnemonic } from "bip39";
import { readFileSync, mkdirSync, existsSync } from "node:fs";
import { createInterface } from "node:readline";
import { loadConfig, getWalletFilePath } from "../config.js";
import {
  saveMnemonicFile,
  loadMnemonicFile,
  deleteMnemonicFile,
  hasMnemonicFile,
  resolvePrivateKey,
  parseBackupFile,
  decryptBackupMnemonic,
} from "../storage/mnemonic.js";
import { connectWallet, disconnectAndExit, getInfo, getLightningAddress } from "../services/wallet.js";
import { output, outputSuccess, outputError } from "../output.js";

function promptLine(question: string): Promise<string> {
  const rl = createInterface({ input: process.stdin, output: process.stderr });
  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      rl.close();
      resolve(answer.trim());
    });
  });
}

async function resolveNsec(config: ReturnType<typeof loadConfig>): Promise<Uint8Array> {
  if (config.nsec) return resolvePrivateKey(config.nsec);
  const nsec = await promptLine("Enter your Nostr private key (nsec or hex): ");
  if (!nsec) throw new Error("Nostr private key (SPORKY_NSEC) is required for wallet encryption.");
  return resolvePrivateKey(nsec);
}

async function resolveMnemonic(config: ReturnType<typeof loadConfig>): Promise<string> {
  // Priority 1: env var
  if (config.mnemonic) return config.mnemonic;

  // Priority 2: encrypted file
  const walletPath = getWalletFilePath(config);
  if (hasMnemonicFile(walletPath)) {
    const privateKey = await resolveNsec(config);
    const mnemonic = loadMnemonicFile(walletPath, privateKey);
    if (!mnemonic) throw new Error("Failed to decrypt wallet file. Wrong nsec?");
    return mnemonic;
  }

  throw new Error("No wallet found. Run 'sporky wallet create' or 'sporky wallet restore' first.");
}

export function walletCommand(): Command {
  const cmd = new Command("wallet").description("Manage wallet lifecycle");

  cmd
    .command("create")
    .description("Generate a new wallet with a 12-word mnemonic")
    .action(async () => {
      try {
        const config = loadConfig();
        if (!config.apiKey) {
          outputError("SPORKY_API_KEY is required. Set it in .env or environment.");
          process.exit(1);
        }

        const walletPath = getWalletFilePath(config);
        if (hasMnemonicFile(walletPath)) {
          outputError("Wallet already exists. Delete it first with 'sporky wallet delete'.");
          process.exit(1);
        }

        const mnemonic = generateMnemonic(128); // 12 words

        // Encrypt with bot's Nostr key
        const privateKey = await resolveNsec(config);
        if (!existsSync(config.dataDir)) {
          mkdirSync(config.dataDir, { recursive: true });
        }
        saveMnemonicFile(walletPath, mnemonic, privateKey);

        // Test connection
        await connectWallet(mnemonic, config);
        const info = await getInfo();

        outputSuccess("Wallet created successfully.", {
          mnemonic,
          balanceSats: info.balanceSats,
          walletFile: walletPath,
          encryption: "NIP-44 (encrypt-to-self)",
          warning: "BACK UP YOUR MNEMONIC. It cannot be recovered if lost.",
        });
        await disconnectAndExit();
      } catch (err) {
        outputError("Failed to create wallet", err instanceof Error ? err.message : err);
        process.exit(1);
      }
    });

  cmd
    .command("restore")
    .description("Restore a wallet from an existing mnemonic")
    .action(async () => {
      try {
        const config = loadConfig();
        if (!config.apiKey) {
          outputError("SPORKY_API_KEY is required.");
          process.exit(1);
        }

        const walletPath = getWalletFilePath(config);
        if (hasMnemonicFile(walletPath)) {
          outputError("Wallet already exists. Delete it first with 'sporky wallet delete'.");
          process.exit(1);
        }

        const mnemonic = await promptLine("Enter your 12-word mnemonic: ");
        if (!validateMnemonic(mnemonic)) {
          outputError("Invalid mnemonic phrase.");
          process.exit(1);
        }

        const privateKey = await resolveNsec(config);
        if (!existsSync(config.dataDir)) {
          mkdirSync(config.dataDir, { recursive: true });
        }
        saveMnemonicFile(walletPath, mnemonic, privateKey);

        // Test connection
        await connectWallet(mnemonic, config);
        const info = await getInfo();

        outputSuccess("Wallet restored successfully.", {
          balanceSats: info.balanceSats,
        });
        await disconnectAndExit();
      } catch (err) {
        outputError("Failed to restore wallet", err instanceof Error ? err.message : err);
        process.exit(1);
      }
    });

  cmd
    .command("restore-backup <file>")
    .description("Restore a wallet from a Spark wallet backup JSON file")
    .action(async (file: string) => {
      try {
        const config = loadConfig();
        if (!config.apiKey) {
          outputError("SPORKY_API_KEY is required.");
          process.exit(1);
        }

        const walletPath = getWalletFilePath(config);
        if (hasMnemonicFile(walletPath)) {
          outputError("Wallet already exists. Delete it first with 'sporky wallet delete'.");
          process.exit(1);
        }

        // Read and parse backup file
        if (!existsSync(file)) {
          outputError(`Backup file not found: ${file}`);
          process.exit(1);
        }

        const content = readFileSync(file, "utf-8");
        const backup = parseBackupFile(content);

        // Decrypt the mnemonic from the backup
        const privateKey = await resolveNsec(config);
        const mnemonic = decryptBackupMnemonic(
          backup.encryptedMnemonic,
          backup.pubkey,
          privateKey,
          backup.encryption,
        );

        if (!validateMnemonic(mnemonic)) {
          outputError("Decrypted mnemonic is invalid. Wrong nsec or corrupted backup?");
          process.exit(1);
        }

        // Save re-encrypted with our own NIP-44 encrypt-to-self
        if (!existsSync(config.dataDir)) {
          mkdirSync(config.dataDir, { recursive: true });
        }
        saveMnemonicFile(walletPath, mnemonic, privateKey);

        // Test connection
        await connectWallet(mnemonic, config);
        const info = await getInfo();

        outputSuccess("Wallet restored from backup.", {
          balanceSats: info.balanceSats,
          backupSource: backup.createdBy ?? "unknown",
          backupCreatedAt: new Date(backup.createdAt).toISOString(),
        });
        await disconnectAndExit();
      } catch (err) {
        outputError("Failed to restore from backup", err instanceof Error ? err.message : err);
        process.exit(1);
      }
    });

  cmd
    .command("info")
    .description("Show wallet info (balance, lightning address)")
    .action(async () => {
      try {
        const config = loadConfig();
        if (!config.apiKey) {
          outputError("SPORKY_API_KEY is required.");
          process.exit(1);
        }

        const mnemonic = await resolveMnemonic(config);
        await connectWallet(mnemonic, config);

        const info = await getInfo();
        const lnAddr = await getLightningAddress().catch(() => undefined);

        output({
          balanceSats: info.balanceSats,
          lightningAddress: lnAddr?.lightningAddress ?? null,
          lnurl: lnAddr?.lnurl ?? null,
          network: config.network,
        });
        await disconnectAndExit();
      } catch (err) {
        outputError("Failed to get wallet info", err instanceof Error ? err.message : err);
        process.exit(1);
      }
    });

  cmd
    .command("delete")
    .description("Delete the stored wallet (irreversible)")
    .action(async () => {
      try {
        const config = loadConfig();
        const walletPath = getWalletFilePath(config);

        if (!hasMnemonicFile(walletPath)) {
          outputError("No wallet file found.");
          process.exit(1);
        }

        const confirm = await promptLine(
          "This will permanently delete your encrypted wallet file. Type 'yes' to confirm: ",
        );
        if (confirm !== "yes") {
          outputError("Aborted.");
          process.exit(1);
        }

        deleteMnemonicFile(walletPath);
        outputSuccess("Wallet deleted.");
      } catch (err) {
        outputError("Failed to delete wallet", err instanceof Error ? err.message : err);
        process.exit(1);
      }
    });

  cmd
    .command("export-mnemonic")
    .description("Decrypt and display the wallet mnemonic")
    .action(async () => {
      try {
        const config = loadConfig();
        const mnemonic = await resolveMnemonic(config);
        outputSuccess("Mnemonic phrase:", { mnemonic });
      } catch (err) {
        outputError("Failed to export mnemonic", err instanceof Error ? err.message : err);
        process.exit(1);
      }
    });

  return cmd;
}

// Helper exported for other commands that need to connect
export { resolveMnemonic };

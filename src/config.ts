import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";

export interface SporkyConfig {
  apiKey: string;
  nsec?: string;
  mnemonic?: string;
  network: "mainnet" | "regtest";
  dataDir: string;
}

function getDefaultDataDir(): string {
  return join(homedir(), ".sporky");
}

function loadConfigFile(dataDir: string): Partial<SporkyConfig> {
  const configPath = join(dataDir, "config.json");
  if (!existsSync(configPath)) return {};

  try {
    const raw = readFileSync(configPath, "utf-8");
    return JSON.parse(raw);
  } catch {
    return {};
  }
}

export function loadConfig(): SporkyConfig {
  const dataDir = process.env.SPORKY_DATA_DIR || getDefaultDataDir();
  const fileConfig = loadConfigFile(dataDir);

  return {
    apiKey: process.env.SPORKY_API_KEY || fileConfig.apiKey || "",
    nsec: process.env.SPORKY_NSEC || fileConfig.nsec,
    mnemonic: process.env.SPORKY_MNEMONIC || fileConfig.mnemonic,
    network:
      (process.env.SPORKY_NETWORK as "mainnet" | "regtest") ||
      fileConfig.network ||
      "mainnet",
    dataDir,
  };
}

export function getWalletFilePath(config: SporkyConfig): string {
  return join(config.dataDir, "wallet.enc");
}

export function getStorageDir(config: SporkyConfig): string {
  return join(config.dataDir, "data");
}

import { readFileSync, writeFileSync, existsSync, unlinkSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { encrypt, decrypt, getConversationKey } from "nostr-tools/nip44";
import { encrypt as nip04Encrypt, decrypt as nip04Decrypt } from "nostr-tools/nip04";
import { getPublicKey } from "nostr-tools/pure";
import { decode } from "nostr-tools/nip19";
import { hexToBytes, bytesToHex } from "@noble/hashes/utils";

/**
 * Resolve a Nostr private key from nsec or hex format to raw bytes.
 */
export function resolvePrivateKey(input: string): Uint8Array {
  const trimmed = input.trim();
  if (trimmed.startsWith("nsec1")) {
    const decoded = decode(trimmed);
    if (decoded.type !== "nsec") throw new Error("Invalid nsec");
    return decoded.data;
  }
  return hexToBytes(trimmed);
}

/**
 * Derive the conversation key for encrypt-to-self using NIP-44.
 * ECDH(privateKey, ownPubkey) produces a deterministic shared secret.
 */
function getSelfConversationKey(privateKey: Uint8Array): Uint8Array {
  const pubkey = getPublicKey(privateKey);
  return getConversationKey(privateKey, pubkey);
}

/**
 * Encrypt a mnemonic using NIP-44 (encrypt to self).
 * Returns a base64-encoded NIP-44 payload string.
 */
export function encryptMnemonic(mnemonic: string, privateKey: Uint8Array): string {
  const conversationKey = getSelfConversationKey(privateKey);
  return encrypt(mnemonic, conversationKey);
}

/**
 * Decrypt a NIP-44 encrypted mnemonic payload.
 */
export function decryptMnemonic(payload: string, privateKey: Uint8Array): string {
  const conversationKey = getSelfConversationKey(privateKey);
  return decrypt(payload, conversationKey);
}

export function saveMnemonicFile(filePath: string, mnemonic: string, privateKey: Uint8Array): void {
  const dir = dirname(filePath);
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
  const encrypted = encryptMnemonic(mnemonic, privateKey);
  writeFileSync(filePath, encrypted, "utf-8");
}

export function loadMnemonicFile(filePath: string, privateKey: Uint8Array): string | null {
  if (!existsSync(filePath)) return null;

  try {
    const payload = readFileSync(filePath, "utf-8");
    return decryptMnemonic(payload, privateKey);
  } catch {
    return null;
  }
}

export function deleteMnemonicFile(filePath: string): void {
  if (existsSync(filePath)) {
    unlinkSync(filePath);
  }
}

export function hasMnemonicFile(filePath: string): boolean {
  return existsSync(filePath);
}

// --- Backup restore support ---

export interface SparkWalletBackup {
  version: number;
  type: string;
  encryption?: "nip44" | "nip04";
  pubkey: string;
  encryptedMnemonic: string;
  walletId?: string;
  createdAt: number;
  createdBy?: string;
}

/**
 * Detect encryption method from ciphertext format.
 * Presence of `?iv=` indicates NIP-04 (AES-256-CBC).
 */
function detectEncryptionMethod(ciphertext: string): "nip44" | "nip04" {
  return ciphertext.includes("?iv=") ? "nip04" : "nip44";
}

/**
 * Decrypt a mnemonic from a Spark wallet backup file.
 * Tries the declared method first, then falls back to the alternative.
 */
export function decryptBackupMnemonic(
  encryptedMnemonic: string,
  backupPubkey: string,
  privateKey: Uint8Array,
  declaredMethod?: "nip44" | "nip04",
): string {
  const detected = detectEncryptionMethod(encryptedMnemonic);
  const methods: Array<"nip44" | "nip04"> =
    declaredMethod === "nip04" || detected === "nip04"
      ? ["nip04", "nip44"]
      : ["nip44", "nip04"];

  let lastError: unknown;

  for (const method of methods) {
    try {
      if (method === "nip44") {
        const conversationKey = getConversationKey(privateKey, backupPubkey);
        return decrypt(encryptedMnemonic, conversationKey);
      } else {
        return nip04Decrypt(privateKey, backupPubkey, encryptedMnemonic);
      }
    } catch (e) {
      lastError = e;
    }
  }

  throw new Error(
    `Failed to decrypt backup mnemonic: ${lastError instanceof Error ? lastError.message : lastError}`,
  );
}

/**
 * Parse and validate a Spark wallet backup JSON file.
 */
export function parseBackupFile(content: string): SparkWalletBackup {
  const backup = JSON.parse(content) as SparkWalletBackup;

  if (backup.type !== "spark-wallet-backup") {
    throw new Error(`Invalid backup type: ${backup.type}`);
  }
  if (backup.version !== 1 && backup.version !== 2) {
    throw new Error(`Unsupported backup version: ${backup.version}`);
  }
  if (!backup.encryptedMnemonic) {
    throw new Error("Backup file missing encryptedMnemonic");
  }
  if (!backup.pubkey) {
    throw new Error("Backup file missing pubkey");
  }

  return backup;
}

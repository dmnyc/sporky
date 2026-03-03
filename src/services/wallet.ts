import type {
  BreezSdk,
  Config,
  GetInfoRequest,
  GetInfoResponse,
  InputType,
  ListPaymentsRequest,
  Payment,
  PrepareSendPaymentRequest,
  PrepareSendPaymentResponse,
  SendPaymentRequest,
  SendPaymentResponse,
  ReceivePaymentRequest,
  ReceivePaymentResponse,
  PrepareLnurlPayRequest,
  PrepareLnurlPayResponse,
  LnurlPayRequest,
  LnurlPayResponse,
  SdkEvent,
  EventListener,
  LogEntry,
  LightningAddressInfo,
  DepositInfo,
  Fee,
  MaxFee,
} from "@breeztech/breez-sdk-spark";
import type { SporkyConfig } from "../config.js";
import { getStorageDir } from "../config.js";

let sdk: BreezSdk | null = null;
let eventListenerId: string | null = null;
let verbose = false;

export function setVerbose(v: boolean): void {
  verbose = v;
}

function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
  operation: string,
): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) =>
      setTimeout(
        () => reject(new Error(`${operation} timed out after ${timeoutMs / 1000}s`)),
        timeoutMs,
      ),
    ),
  ]);
}

function requireSdk(): BreezSdk {
  if (!sdk) throw new Error("Wallet not connected. Run 'sporky wallet create' or 'sporky wallet restore' first.");
  return sdk;
}

// Resolve the SDK module — Node.js CJS entry puts everything on .default when imported from ESM
async function loadSdk() {
  const mod = await import("@breeztech/breez-sdk-spark");
  // Handle CJS default export wrapping
  const breez = (mod as Record<string, unknown>).default ?? mod;
  return breez as {
    connect: typeof import("@breeztech/breez-sdk-spark").connect;
    defaultConfig: typeof import("@breeztech/breez-sdk-spark").defaultConfig;
    initLogging: typeof import("@breeztech/breez-sdk-spark").initLogging;
  };
}

export async function connectWallet(
  mnemonic: string,
  config: SporkyConfig,
): Promise<void> {
  if (sdk) return;

  const breez = await loadSdk();

  if (verbose) {
    const logger = {
      log: (l: LogEntry) => {
        console.error(`[SDK ${l.level}] ${l.line}`);
      },
    };
    await breez.initLogging(logger as Parameters<typeof breez.initLogging>[0]);
  }

  const sdkConfig: Config = breez.defaultConfig(config.network);
  sdkConfig.apiKey = config.apiKey;
  sdkConfig.privateEnabledDefault = true;

  const storageDir = getStorageDir(config);

  sdk = await withTimeout(
    breez.connect({
      config: sdkConfig,
      seed: { type: "mnemonic", mnemonic: mnemonic.trim().toLowerCase().replace(/\s+/g, " ") },
      storageDir,
    }),
    60000,
    "SDK connect",
  );

  // Set up event listener immediately after connect
  const listener: EventListener = {
    onEvent: (event: SdkEvent) => {
      if (verbose) {
        console.error(`[SDK event] ${event.type}`);
      }
    },
  };
  eventListenerId = await sdk.addEventListener(listener);

  // Background sync — don't block
  sdk.syncWallet({}).catch(() => {
    if (verbose) console.error("[SDK] Background sync failed");
  });
}

export async function disconnectWallet(): Promise<void> {
  if (!sdk) return;

  try {
    if (eventListenerId) {
      await sdk.removeEventListener(eventListenerId).catch(() => {});
      eventListenerId = null;
    }
    await sdk.disconnect();
  } catch {
    // Ignore disconnect errors
  } finally {
    sdk = null;
  }
}

/**
 * Disconnect and force exit. The WASM SDK keeps background workers alive
 * that prevent the Node.js event loop from draining naturally.
 */
export async function disconnectAndExit(code = 0): Promise<never> {
  await disconnectWallet();
  process.exit(code);
}

// --- Info & Balance ---

export async function getInfo(): Promise<GetInfoResponse> {
  const s = requireSdk();
  // CRITICAL: Never use ensureSynced: true — causes 30+ second hangs
  const request: GetInfoRequest = { ensureSynced: false };
  return await s.getInfo(request);
}

export async function syncAndGetInfo(): Promise<GetInfoResponse> {
  const s = requireSdk();
  await withTimeout(s.syncWallet({}), 90000, "Wallet sync");
  return await s.getInfo({ ensureSynced: false });
}

export async function syncWallet(): Promise<void> {
  const s = requireSdk();
  await withTimeout(s.syncWallet({}), 90000, "Wallet sync");
}

// --- Parse Input ---

export async function parseInput(input: string): Promise<InputType> {
  const s = requireSdk();
  return await s.parse(input);
}

// --- Send Payments ---

export async function prepareSendPayment(
  request: PrepareSendPaymentRequest,
): Promise<PrepareSendPaymentResponse> {
  const s = requireSdk();
  return await withTimeout(s.prepareSendPayment(request), 20000, "Prepare send");
}

export async function sendPayment(
  request: SendPaymentRequest,
): Promise<SendPaymentResponse> {
  const s = requireSdk();
  return await withTimeout(s.sendPayment(request), 60000, "Send payment");
}

export async function prepareLnurlPay(
  request: PrepareLnurlPayRequest,
): Promise<PrepareLnurlPayResponse> {
  const s = requireSdk();
  return await withTimeout(s.prepareLnurlPay(request), 20000, "Prepare LNURL pay");
}

export async function lnurlPay(
  request: LnurlPayRequest,
): Promise<LnurlPayResponse> {
  const s = requireSdk();
  return await withTimeout(s.lnurlPay(request), 60000, "LNURL pay");
}

// --- Receive Payments ---

export async function receivePayment(
  request: ReceivePaymentRequest,
): Promise<ReceivePaymentResponse> {
  const s = requireSdk();
  return await withTimeout(s.receivePayment(request), 20000, "Receive payment");
}

// --- Transaction History ---

export async function listPayments(
  request: ListPaymentsRequest,
): Promise<Payment[]> {
  const s = requireSdk();
  const response = await withTimeout(s.listPayments(request), 10000, "List payments");
  return response.payments;
}

// --- Lightning Address ---

export async function getLightningAddress(): Promise<LightningAddressInfo | undefined> {
  const s = requireSdk();
  return await s.getLightningAddress();
}

export async function checkLightningAddressAvailable(username: string): Promise<boolean> {
  const s = requireSdk();
  return await s.checkLightningAddressAvailable({ username });
}

export async function registerLightningAddress(
  username: string,
  description?: string,
): Promise<LightningAddressInfo> {
  const s = requireSdk();
  return await s.registerLightningAddress({ username, description });
}

export async function deleteLightningAddress(): Promise<void> {
  const s = requireSdk();
  await s.deleteLightningAddress();
}

// --- Deposits ---

export async function listUnclaimedDeposits(): Promise<DepositInfo[]> {
  const s = requireSdk();
  const response = await s.listUnclaimedDeposits({});
  return response.deposits;
}

export async function claimDeposit(
  txid: string,
  vout: number,
  maxFee?: MaxFee,
): Promise<void> {
  const s = requireSdk();
  await withTimeout(s.claimDeposit({ txid, vout, maxFee }), 30000, "Claim deposit");
}

export async function refundDeposit(
  txid: string,
  vout: number,
  destinationAddress: string,
  fee: Fee,
): Promise<string> {
  const s = requireSdk();
  const response = await withTimeout(
    s.refundDeposit({ txid, vout, destinationAddress, fee }),
    30000,
    "Refund deposit",
  );
  return response.txId;
}

export function isConnected(): boolean {
  return sdk !== null;
}

// Graceful shutdown handler
export function setupShutdownHandlers(): void {
  const cleanup = async () => {
    await disconnectWallet();
    process.exit(0);
  };
  process.on("SIGINT", cleanup);
  process.on("SIGTERM", cleanup);
}

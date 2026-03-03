import { Command } from "commander";
import { loadConfig } from "../config.js";
import {
  connectWallet,
  disconnectAndExit,
  listUnclaimedDeposits,
  claimDeposit,
  refundDeposit,
  syncWallet,
} from "../services/wallet.js";
import { output, outputSuccess, outputError } from "../output.js";
import { resolveMnemonic } from "./wallet.js";

export function depositsCommand(): Command {
  const cmd = new Command("deposits").description("Manage on-chain deposits");

  cmd
    .command("list")
    .description("List unclaimed deposits")
    .option("--no-sync", "Skip sync and show cached deposits (faster)")
    .action(async (opts: { sync: boolean }) => {
      try {
        const config = loadConfig();
        if (!config.apiKey) {
          outputError("SPORKY_API_KEY is required.");
          process.exit(1);
        }

        const mnemonic = await resolveMnemonic(config);
        await connectWallet(mnemonic, config);

        if (opts.sync) {
          await syncWallet();
        }

        const deposits = await listUnclaimedDeposits();

        if (deposits.length === 0) {
          outputSuccess("No unclaimed deposits.");
          await disconnectAndExit();
          return;
        }

        const rows = deposits.map((d) => ({
          txid: d.txid,
          vout: d.vout,
          amountSats: d.amountSats,
          claimError: d.claimError ? d.claimError.type : null,
        }));

        output(rows);
        await disconnectAndExit();
      } catch (err) {
        outputError("Failed to list deposits", err instanceof Error ? err.message : err);
        await disconnectAndExit(1);
        process.exit(1);
      }
    });

  cmd
    .command("claim <txid> <vout>")
    .description("Claim an on-chain deposit")
    .option("--max-fee <sats>", "Maximum fee in sats", parseInt)
    .action(async (txid: string, voutStr: string, opts: { maxFee?: number }) => {
      try {
        const vout = parseInt(voutStr, 10);
        const config = loadConfig();
        if (!config.apiKey) {
          outputError("SPORKY_API_KEY is required.");
          process.exit(1);
        }

        const mnemonic = await resolveMnemonic(config);
        await connectWallet(mnemonic, config);

        const maxFee = opts.maxFee
          ? { type: "fixed" as const, amount: opts.maxFee }
          : undefined;

        await claimDeposit(txid, vout, maxFee);

        outputSuccess("Deposit claimed.", { txid, vout });
        await disconnectAndExit();
      } catch (err) {
        outputError("Failed to claim deposit", err instanceof Error ? err.message : err);
        await disconnectAndExit(1);
        process.exit(1);
      }
    });

  cmd
    .command("refund <txid> <vout> <address>")
    .description("Refund a deposit to a Bitcoin address")
    .option("--fee <sats>", "Fee in sats", parseInt)
    .option("--fee-rate <sat-per-vbyte>", "Fee rate in sat/vbyte", parseInt)
    .action(
      async (
        txid: string,
        voutStr: string,
        address: string,
        opts: { fee?: number; feeRate?: number },
      ) => {
        try {
          const vout = parseInt(voutStr, 10);
          const config = loadConfig();
          if (!config.apiKey) {
            outputError("SPORKY_API_KEY is required.");
            process.exit(1);
          }

          const mnemonic = await resolveMnemonic(config);
          await connectWallet(mnemonic, config);

          let fee: { type: "fixed"; amount: number } | { type: "rate"; satPerVbyte: number };
          if (opts.feeRate) {
            fee = { type: "rate", satPerVbyte: opts.feeRate };
          } else if (opts.fee) {
            fee = { type: "fixed", amount: opts.fee };
          } else {
            fee = { type: "rate", satPerVbyte: 1 };
          }

          const refundTxId = await refundDeposit(txid, vout, address, fee);

          outputSuccess("Deposit refunded.", { txid, vout, refundTxId, address });
          await disconnectAndExit();
        } catch (err) {
          outputError("Failed to refund deposit", err instanceof Error ? err.message : err);
          await disconnectAndExit(1);
          process.exit(1);
        }
      },
    );

  return cmd;
}

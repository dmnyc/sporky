import { Command } from "commander";
import { loadConfig } from "../config.js";
import { connectWallet, disconnectAndExit, receivePayment } from "../services/wallet.js";
import { output, outputError } from "../output.js";
import { resolveMnemonic } from "./wallet.js";

export function receiveCommand(): Command {
  const cmd = new Command("receive").description("Generate a payment request to receive funds");

  cmd
    .command("lightning <amount>")
    .description("Create a BOLT11 Lightning invoice")
    .option("--description <text>", "Invoice description")
    .option("--expiry <secs>", "Invoice expiry in seconds", parseInt)
    .action(async (amountStr: string, opts: { description?: string; expiry?: number }) => {
      try {
        const amount = parseInt(amountStr, 10);
        if (isNaN(amount) || amount <= 0) {
          outputError("Amount must be a positive integer (sats).");
          process.exit(1);
        }

        const config = loadConfig();
        if (!config.apiKey) {
          outputError("SPORKY_API_KEY is required.");
          process.exit(1);
        }

        const mnemonic = await resolveMnemonic(config);
        await connectWallet(mnemonic, config);

        const response = await receivePayment({
          paymentMethod: {
            type: "bolt11Invoice",
            description: opts.description || "sporky payment",
            amountSats: amount,
            expirySecs: opts.expiry,
          },
        });

        output({
          invoice: response.paymentRequest,
          amountSats: amount,
          feeSats: response.fee.toString(),
        });
        await disconnectAndExit();
      } catch (err) {
        outputError("Failed to create invoice", err instanceof Error ? err.message : err);
        await disconnectAndExit(1);
        process.exit(1);
      }
    });

  cmd
    .command("bitcoin")
    .description("Get a Bitcoin deposit address")
    .action(async () => {
      try {
        const config = loadConfig();
        if (!config.apiKey) {
          outputError("SPORKY_API_KEY is required.");
          process.exit(1);
        }

        const mnemonic = await resolveMnemonic(config);
        await connectWallet(mnemonic, config);

        const response = await receivePayment({
          paymentMethod: { type: "bitcoinAddress" },
        });

        output({
          address: response.paymentRequest,
          feeSats: response.fee.toString(),
        });
        await disconnectAndExit();
      } catch (err) {
        outputError("Failed to get Bitcoin address", err instanceof Error ? err.message : err);
        await disconnectAndExit(1);
        process.exit(1);
      }
    });

  cmd
    .command("spark")
    .description("Get a Spark address")
    .action(async () => {
      try {
        const config = loadConfig();
        if (!config.apiKey) {
          outputError("SPORKY_API_KEY is required.");
          process.exit(1);
        }

        const mnemonic = await resolveMnemonic(config);
        await connectWallet(mnemonic, config);

        const response = await receivePayment({
          paymentMethod: { type: "sparkAddress" },
        });

        output({
          address: response.paymentRequest,
          feeSats: response.fee.toString(),
        });
        await disconnectAndExit();
      } catch (err) {
        outputError("Failed to get Spark address", err instanceof Error ? err.message : err);
        await disconnectAndExit(1);
        process.exit(1);
      }
    });

  return cmd;
}

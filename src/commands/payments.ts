import { Command } from "commander";
import { loadConfig } from "../config.js";
import { connectWallet, disconnectAndExit, listPayments } from "../services/wallet.js";
import { output, outputError } from "../output.js";
import { resolveMnemonic } from "./wallet.js";
import type { PaymentType } from "@breeztech/breez-sdk-spark";

export function paymentsCommand(): Command {
  const cmd = new Command("payments")
    .description("List transaction history")
    .option("--limit <n>", "Number of transactions to show", parseInt, 20)
    .option("--offset <n>", "Offset for pagination", parseInt, 0)
    .option("--type <type>", "Filter by type: send or receive")
    .action(async (opts: { limit: number; offset: number; type?: string }) => {
      try {
        const config = loadConfig();
        if (!config.apiKey) {
          outputError("SPORKY_API_KEY is required.");
          process.exit(1);
        }

        const mnemonic = await resolveMnemonic(config);
        await connectWallet(mnemonic, config);

        const typeFilter: PaymentType[] | undefined = opts.type
          ? [opts.type as PaymentType]
          : undefined;

        const payments = await listPayments({
          limit: opts.limit,
          offset: opts.offset,
          typeFilter,
        });

        const rows = payments.map((p) => ({
          id: p.id,
          type: p.paymentType,
          status: p.status,
          amount: p.amount.toString(),
          fees: p.fees.toString(),
          method: p.method,
          timestamp: new Date(p.timestamp * 1000).toISOString(),
        }));

        output(rows);
        await disconnectAndExit();
      } catch (err) {
        outputError("Failed to list payments", err instanceof Error ? err.message : err);
        await disconnectAndExit(1);
        process.exit(1);
      }
    });

  return cmd;
}

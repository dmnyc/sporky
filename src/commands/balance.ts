import { Command } from "commander";
import { loadConfig } from "../config.js";
import { connectWallet, disconnectAndExit, getInfo, syncAndGetInfo } from "../services/wallet.js";
import { output, outputError } from "../output.js";
import { resolveMnemonic } from "./wallet.js";

export function balanceCommand(): Command {
  const cmd = new Command("balance")
    .description("Show wallet balance")
    .option("--no-sync", "Skip sync and show cached balance (faster)")
    .action(async (opts: { sync: boolean }) => {
      try {
        const config = loadConfig();
        if (!config.apiKey) {
          outputError("SPORKY_API_KEY is required.");
          process.exit(1);
        }

        const mnemonic = await resolveMnemonic(config);
        await connectWallet(mnemonic, config);

        const info = opts.sync ? await syncAndGetInfo() : await getInfo();
        output({ balanceSats: info.balanceSats });
        await disconnectAndExit();
      } catch (err) {
        outputError("Failed to get balance", err instanceof Error ? err.message : err);
        process.exit(1);
      }
    });

  return cmd;
}

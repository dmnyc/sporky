import { Command } from "commander";
import { loadConfig } from "../config.js";
import {
  connectWallet,
  disconnectAndExit,
  getLightningAddress,
  checkLightningAddressAvailable,
  registerLightningAddress,
  deleteLightningAddress,
} from "../services/wallet.js";
import { output, outputSuccess, outputError } from "../output.js";
import { resolveMnemonic } from "./wallet.js";

export function addressCommand(): Command {
  const cmd = new Command("address").description("Manage Lightning address");

  cmd
    .command("show")
    .description("Show current Lightning address")
    .action(async () => {
      try {
        const config = loadConfig();
        if (!config.apiKey) {
          outputError("SPORKY_API_KEY is required.");
          process.exit(1);
        }

        const mnemonic = await resolveMnemonic(config);
        await connectWallet(mnemonic, config);

        const addr = await getLightningAddress();

        if (!addr) {
          outputSuccess("No Lightning address registered.");
          await disconnectAndExit();
          return;
        }

        output({
          lightningAddress: addr.lightningAddress,
          username: addr.username,
          lnurl: addr.lnurl,
          description: addr.description,
        });
        await disconnectAndExit();
      } catch (err) {
        outputError("Failed to get Lightning address", err instanceof Error ? err.message : err);
        await disconnectAndExit(1);
        process.exit(1);
      }
    });

  cmd
    .command("check <username>")
    .description("Check if a Lightning address username is available")
    .action(async (username: string) => {
      try {
        const config = loadConfig();
        if (!config.apiKey) {
          outputError("SPORKY_API_KEY is required.");
          process.exit(1);
        }

        const mnemonic = await resolveMnemonic(config);
        await connectWallet(mnemonic, config);

        const available = await checkLightningAddressAvailable(username);

        output({ username, available });
        await disconnectAndExit();
      } catch (err) {
        outputError("Failed to check address", err instanceof Error ? err.message : err);
        await disconnectAndExit(1);
        process.exit(1);
      }
    });

  cmd
    .command("register <username>")
    .description("Register a Lightning address (@breez.tips)")
    .option("--description <text>", "Address description")
    .action(async (username: string, opts: { description?: string }) => {
      try {
        const config = loadConfig();
        if (!config.apiKey) {
          outputError("SPORKY_API_KEY is required.");
          process.exit(1);
        }

        const mnemonic = await resolveMnemonic(config);
        await connectWallet(mnemonic, config);

        const addr = await registerLightningAddress(username, opts.description);

        output({
          lightningAddress: addr.lightningAddress,
          username: addr.username,
          lnurl: addr.lnurl,
        });
        await disconnectAndExit();
      } catch (err) {
        outputError("Failed to register address", err instanceof Error ? err.message : err);
        await disconnectAndExit(1);
        process.exit(1);
      }
    });

  cmd
    .command("delete")
    .description("Delete the registered Lightning address")
    .action(async () => {
      try {
        const config = loadConfig();
        if (!config.apiKey) {
          outputError("SPORKY_API_KEY is required.");
          process.exit(1);
        }

        const mnemonic = await resolveMnemonic(config);
        await connectWallet(mnemonic, config);

        await deleteLightningAddress();

        outputSuccess("Lightning address deleted.");
        await disconnectAndExit();
      } catch (err) {
        outputError("Failed to delete address", err instanceof Error ? err.message : err);
        await disconnectAndExit(1);
        process.exit(1);
      }
    });

  return cmd;
}

#!/usr/bin/env node

import "dotenv/config";
import { Command } from "commander";
import { setJsonMode } from "./output.js";
import { setVerbose, setupShutdownHandlers } from "./services/wallet.js";
import { walletCommand } from "./commands/wallet.js";
import { balanceCommand } from "./commands/balance.js";
import { sendCommand } from "./commands/send.js";
import { receiveCommand } from "./commands/receive.js";
import { addressCommand } from "./commands/address.js";
import { paymentsCommand } from "./commands/payments.js";
import { depositsCommand } from "./commands/deposits.js";

const program = new Command();

program
  .name("sporky")
  .description("CLI Bitcoin/Lightning wallet powered by Breez SDK Spark")
  .version("0.1.0")
  .option("--json", "Output in JSON format (for bot consumption)")
  .option("--verbose", "Enable SDK debug logging")
  .hook("preAction", (thisCommand) => {
    const opts = thisCommand.opts();
    if (opts.json) setJsonMode(true);
    if (opts.verbose) setVerbose(true);
  });

program.addCommand(walletCommand());
program.addCommand(balanceCommand());
program.addCommand(sendCommand());
program.addCommand(receiveCommand());
program.addCommand(addressCommand());
program.addCommand(paymentsCommand());
program.addCommand(depositsCommand());

setupShutdownHandlers();

program.parse();

import { Command } from "commander";
import { loadConfig } from "../config.js";
import {
  connectWallet,
  disconnectAndExit,
  parseInput,
  prepareSendPayment,
  sendPayment,
  prepareLnurlPay,
  lnurlPay,
} from "../services/wallet.js";
import { output, outputError } from "../output.js";
import { resolveMnemonic } from "./wallet.js";
import type {
  OnchainConfirmationSpeed,
  LnurlPayRequestDetails,
} from "@breeztech/breez-sdk-spark";

export function sendCommand(): Command {
  const cmd = new Command("send")
    .description("Send a payment (auto-detects destination type)")
    .argument("<destination>", "BOLT11 invoice, Lightning address, LNURL, Bitcoin address, or Spark address")
    .option("--amount <sats>", "Amount in sats (required for addresses, optional for invoices)", parseInt)
    .option("--comment <text>", "Comment for LNURL payments")
    .option("--speed <speed>", "On-chain confirmation speed: fast, medium, slow", "medium")
    .action(async (destination: string, opts: { amount?: number; comment?: string; speed?: string }) => {
      try {
        const config = loadConfig();
        if (!config.apiKey) {
          outputError("SPORKY_API_KEY is required.");
          process.exit(1);
        }

        const mnemonic = await resolveMnemonic(config);
        await connectWallet(mnemonic, config);

        const parsed = await parseInput(destination);

        let result: Record<string, unknown>;

        switch (parsed.type) {
          case "bolt11Invoice": {
            const prepReq: Parameters<typeof prepareSendPayment>[0] = {
              paymentRequest: destination,
            };
            if (opts.amount) {
              prepReq.amount = BigInt(opts.amount);
            }
            const prepared = await prepareSendPayment(prepReq);
            const sent = await sendPayment({ prepareResponse: prepared });
            result = {
              paymentId: sent.payment.id,
              amount: sent.payment.amount.toString(),
              fees: sent.payment.fees.toString(),
              status: sent.payment.status,
              method: "lightning",
            };
            break;
          }

          case "lightningAddress":
          case "lnurlPay": {
            if (!opts.amount) {
              outputError("--amount is required for Lightning address and LNURL payments.");
              await disconnectAndExit();
              process.exit(1);
            }
            const payRequest = (parsed as { payRequest: LnurlPayRequestDetails }).payRequest;
            const prepLnurl = await prepareLnurlPay({
              amountSats: opts.amount,
              comment: opts.comment,
              payRequest,
            });
            const lnurlResult = await lnurlPay({ prepareResponse: prepLnurl });
            result = {
              paymentId: lnurlResult.payment.id,
              amount: lnurlResult.payment.amount.toString(),
              fees: lnurlResult.payment.fees.toString(),
              status: lnurlResult.payment.status,
              method: parsed.type === "lightningAddress" ? "lightningAddress" : "lnurl",
            };
            if (lnurlResult.successAction) {
              result.successAction = lnurlResult.successAction;
            }
            break;
          }

          case "bitcoinAddress": {
            if (!opts.amount) {
              outputError("--amount is required for Bitcoin address payments.");
              await disconnectAndExit();
              process.exit(1);
            }
            const prepared = await prepareSendPayment({
              paymentRequest: destination,
              amount: BigInt(opts.amount),
            });
            const speed = (opts.speed || "medium") as OnchainConfirmationSpeed;
            const sent = await sendPayment({
              prepareResponse: prepared,
              options: { type: "bitcoinAddress", confirmationSpeed: speed },
            });
            result = {
              paymentId: sent.payment.id,
              amount: sent.payment.amount.toString(),
              fees: sent.payment.fees.toString(),
              status: sent.payment.status,
              method: "bitcoin",
              speed,
            };
            break;
          }

          case "sparkAddress": {
            if (!opts.amount) {
              outputError("--amount is required for Spark address payments.");
              await disconnectAndExit();
              process.exit(1);
            }
            const prepared = await prepareSendPayment({
              paymentRequest: destination,
              amount: BigInt(opts.amount),
            });
            const sent = await sendPayment({ prepareResponse: prepared });
            result = {
              paymentId: sent.payment.id,
              amount: sent.payment.amount.toString(),
              fees: sent.payment.fees.toString(),
              status: sent.payment.status,
              method: "spark",
            };
            break;
          }

          default: {
            outputError(`Unsupported destination type: ${parsed.type}`);
            await disconnectAndExit();
            process.exit(1);
          }
        }

        output(result!);
        await disconnectAndExit();
      } catch (err) {
        outputError("Payment failed", err instanceof Error ? err.message : err);
        await disconnectAndExit(1);
        process.exit(1);
      }
    });

  return cmd;
}

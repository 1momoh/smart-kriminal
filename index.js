#!/usr/bin/env node
// index.js - Smart Kriminal NFT Sniper Bot
import "dotenv/config";
import chalk from "chalk";
import inquirer from "inquirer";
import gradient from "gradient-string";
import figlet from "figlet";
import ora from "ora";
import { Monitor } from "./src/monitor.js";
import { Sniper } from "./src/sniper.js";
import { openSeaClient } from "./src/opensea.js";
import { magicEdenClient } from "./src/magiceden.js";
import { walletManager } from "./src/wallet.js";
import { CHAINS } from "./src/chains.js";
import { logger } from "./src/logger.js";
import { telegramBot } from "./src/telegram.js";

function printBanner() {
  console.clear();
  const title = figlet.textSync("SMART KRIMINAL", { font: "ANSI Shadow", horizontalLayout: "default" });
  console.log(gradient.pastel.multiline(title));
  console.log("  " + chalk.hex("#FF6EC7").bold("by") + " " + chalk.hex("#00FFD1").bold(".87") + " " + chalk.hex("#7CFC00")("🌵"));
  console.log(
    chalk.gray("  NFT Sniper Bot  |  ETH + Base  |  OpenSea + MagicEden") +
    "   " + chalk.hex("#1DA1F2")("follow ") + chalk.hex("#1DA1F2").bold("@ofalamin") + chalk.white(" on 𝕏")
  );
  console.log(chalk.gray("  ─────────────────────────────────────────────────────\n"));
}

function checkEnv() {
  const issues = [];
  if (!process.env.PRIVATE_KEY || process.env.PRIVATE_KEY === "your_private_key_here") issues.push("PRIVATE_KEY is not set");
  if (!process.env.ETH_RPC_URL || process.env.ETH_RPC_URL.includes("YOUR_KEY")) issues.push("ETH_RPC_URL is not configured");
  if (!process.env.BASE_RPC_URL) issues.push("BASE_RPC_URL is not configured");
  if (issues.length > 0) {
    console.log(chalk.red("  Configuration issues:"));
    issues.forEach((i) => console.log(chalk.red("   - " + i)));
    console.log(chalk.yellow("\n  Copy .env.example to .env and fill in your values.\n"));
    process.exit(1);
  }
}

async function mainMenu() {
  printBanner();
  checkEnv();
  const { mode } = await inquirer.prompt([{
    type: "list", name: "mode",
    message: chalk.cyan("What do you want to do?"),
    choices: [
      { name: "  Snipe NFT (monitor + auto-buy below target price)", value: "snipe" },
      { name: "  Monitor Only (watch prices, no buying)", value: "monitor" },
      { name: "  Check Wallet Balance", value: "balance" },
      { name: "  Check Collection Stats", value: "stats" },
      { name: "  Exit", value: "exit" },
    ],
  }]);

  if (mode === "exit") { console.log(chalk.gray("\n  Goodbye.\n")); process.exit(0); }
  if (mode === "balance") { await showBalances(); return; }

  const config = await getConfig(mode);

  if (mode === "stats") { await showStats(config); return; }

  let targetPrice = null;
  const { tp } = await inquirer.prompt([{
    type: "input", name: "tp",
    message: chalk.cyan(mode === "snipe" ? "Enter target buy price in ETH (snipe if price <= this):" : "Enter alert price in ETH (or Enter to skip):"),
    validate: mode === "snipe" ? (v) => { const n = parseFloat(v); return (!isNaN(n) && n > 0) || "Enter a valid number (e.g. 0.05)"; } : () => true,
  }]);
  if (tp && parseFloat(tp) > 0) targetPrice = parseFloat(tp);

  if (mode === "snipe") {
    await runSniper(config, targetPrice);
  } else {
    await runMonitor(config, targetPrice, false, null);
  }
}

async function getConfig(mode) {
  const answers = await inquirer.prompt([
    {
      type: "list", name: "chain", message: chalk.cyan("Select blockchain:"),
      choices: [
        { name: "  Ethereum (ETH Mainnet)", value: "ethereum" },
        { name: "  Base (Coinbase L2)", value: "base" },
      ],
    },
    {
      type: "list", name: "marketplace", message: chalk.cyan("Select marketplace:"),
      choices: [
        { name: "  OpenSea", value: "opensea" },
        { name: "  MagicEden", value: "magiceden" },
        { name: "  Both (best price across both)", value: "both" },
      ],
    },
    {
      type: "input", name: "collection",
      message: chalk.cyan("Enter collection (contract 0x... or OpenSea slug):"),
      validate: (v) => (v && v.trim().length >= 3) || "Enter a valid address or slug",
    },
  ]);
  const isAddress = answers.collection.startsWith("0x") && answers.collection.length === 42;
  return { chain: answers.chain, marketplace: answers.marketplace, collection: answers.collection.trim().toLowerCase(), isSlug: !isAddress };
}

async function runSniper(config, targetPrice) {
  console.log(chalk.yellow("\n  Initializing sniper...\n"));
  const spinner = ora("Connecting wallet and RPC...").start();
  let sniper;
  try {
    sniper = new Sniper(config.chain);
    await sniper.init();
    spinner.succeed(chalk.green("Wallet connected!"));
  } catch (err) {
    spinner.fail(chalk.red("Init failed: " + err.message));
    process.exit(1);
  }

  if (telegramBot.isEnabled()) {
    console.log(chalk.green("  Telegram: ") + chalk.white("ENABLED ✓ — you'll get phone notifications"));
    await telegramBot.sendStarted(Object.assign({}, config, { targetPrice }));
  } else {
    console.log(chalk.gray("  Telegram: disabled (add TELEGRAM_BOT_TOKEN + TELEGRAM_CHAT_ID to .env to enable)"));
  }

  let sniped = false;

  async function onSnipe(listing) {
    if (sniped) return;
    sniped = true;
    const monitor = global.__monitor;
    if (monitor) monitor.stop();

    listing.chain = config.chain;
    console.log(chalk.bold.yellow("\n  TARGET FOUND! Price: " + listing.price + " ETH  (target: " + targetPrice + " ETH)"));

    let decision = null;

    // Telegram approval path
    if (telegramBot.isEnabled()) {
      console.log(chalk.cyan("  Sending Telegram alert — check your phone!"));
      const alert = await telegramBot.sendSnipeAlert(listing);
      if (alert) {
        console.log(chalk.gray("  Waiting for your Telegram decision (2 min timeout)..."));
        decision = await telegramBot.waitForApproval(alert.approvalId, alert.messageId, 120000);
        if (decision === "accept") {
          console.log(chalk.green("  Approved via Telegram! Firing snipe..."));
        } else if (decision === "reject") {
          console.log(chalk.gray("  Rejected via Telegram. Resuming monitor..."));
          sniped = false;
          if (monitor) monitor.start(targetPrice, onSnipe);
          return;
        } else {
          console.log(chalk.yellow("  Telegram timed out. Falling back to terminal..."));
        }
      }
    }

    // Terminal fallback
    if (!decision || decision === "timeout") {
      const { go } = await inquirer.prompt([{
        type: "confirm", name: "go",
        message: chalk.red("EXECUTE SNIPE NOW?"),
        default: true,
      }]);
      decision = go ? "accept" : "reject";
    }

    if (decision !== "accept") {
      console.log(chalk.gray("  Snipe cancelled. Resuming monitor...\n"));
      sniped = false;
      if (monitor) monitor.start(targetPrice, onSnipe);
      return;
    }

    const result = await sniper.snipe(listing);

    if (result && result.success) {
      await telegramBot.sendSuccess(result);
    } else {
      const reason = result ? result.reason : "unknown";
      console.log(chalk.red("  Snipe failed: " + reason));
      await telegramBot.sendFailure(reason);
      sniped = false;
    }

    const stats = sniper.getStats();
    console.log(chalk.gray("  Stats: " + stats.successCount + " sniped / " + stats.failCount + " failed / " + stats.execCount + " total"));

    const { cont } = await inquirer.prompt([{
      type: "confirm", name: "cont",
      message: chalk.cyan("Keep monitoring for more?"),
      default: false,
    }]);
    if (cont) { sniped = false; if (monitor) monitor.start(targetPrice, onSnipe); }
    else process.exit(0);
  }

  await runMonitor(config, targetPrice, true, onSnipe);
}

async function runMonitor(config, targetPrice, isSniping, onSnipe) {
  const monitor = new Monitor(config);
  global.__monitor = monitor;
  process.on("SIGINT", () => { monitor.stop(); console.log(chalk.gray("\n\n  Stopped. Goodbye.\n")); process.exit(0); });
  await monitor.start(targetPrice, isSniping ? onSnipe : null);
}

async function showBalances() {
  printBanner();
  const spinner = ora("Fetching balances...").start();
  const results = [];
  for (const chain of ["ethereum", "base"]) {
    try {
      const bal = await walletManager.getBalance(chain);
      results.push({ chain: CHAINS[chain].name, balance: parseFloat(bal).toFixed(6) + " ETH" });
    } catch (err) {
      results.push({ chain: CHAINS[chain].name, balance: chalk.red("Error: " + err.message) });
    }
  }
  spinner.stop();
  console.log("");
  results.forEach((r) => console.log(chalk.gray("  " + r.chain.padEnd(12)) + chalk.white(r.balance)));
  if (walletManager.getAddress("ethereum")) console.log(chalk.gray("\n  Address: ") + chalk.cyan(walletManager.getAddress("ethereum")));
  console.log("");
  await inquirer.prompt([{ type: "input", name: "_", message: "Press Enter to go back..." }]);
  mainMenu();
}

async function showStats(config) {
  printBanner();
  const spinner = ora("Fetching collection stats...").start();
  const tasks = [];
  if (config.marketplace === "opensea" || config.marketplace === "both") {
    tasks.push(openSeaClient.getCollectionStats(config.collection).then((s) => s ? Object.assign({ _src: "OpenSea" }, s) : null).catch(() => null));
  }
  if (config.marketplace === "magiceden" || config.marketplace === "both") {
    tasks.push(magicEdenClient.getCollectionStats(config.collection, config.chain).then((s) => s ? Object.assign({ _src: "MagicEden" }, s) : null).catch(() => null));
  }
  const results = await Promise.allSettled(tasks);
  spinner.stop();
  console.log("");
  results.forEach((r) => {
    if (r.status === "fulfilled" && r.value) {
      const s = r.value;
      console.log(chalk.bold.cyan("  " + s._src));
      if (s.floorPrice != null) console.log(chalk.gray("    Floor Price  : ") + chalk.green(s.floorPrice + " " + (s.floorPriceCurrency || "ETH")));
      if (s.volume24h != null) console.log(chalk.gray("    24h Volume   : ") + chalk.white(parseFloat(s.volume24h).toFixed(4) + " ETH"));
      if (s.listedCount != null) console.log(chalk.gray("    Listed       : ") + chalk.white(s.listedCount));
      if (s.numOwners != null) console.log(chalk.gray("    Owners       : ") + chalk.white(s.numOwners));
      if (s.totalSupply != null) console.log(chalk.gray("    Total Supply : ") + chalk.white(s.totalSupply));
      console.log("");
    }
  });
  await inquirer.prompt([{ type: "input", name: "_", message: "Press Enter to go back..." }]);
  mainMenu();
}

mainMenu().catch((err) => { logger.error("Fatal: " + err.message); process.exit(1); });

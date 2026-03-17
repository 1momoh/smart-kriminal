// src/monitor.js
import { openSeaClient } from "./opensea.js";
import { magicEdenClient } from "./magiceden.js";
import { logger } from "./logger.js";
import chalk from "chalk";
import Table from "cli-table3";

export class Monitor {
  constructor(config) {
    this.config = config;
    this.running = false;
    this.priceHistory = [];
    this.intervalId = null;
    this.pollInterval = parseInt(process.env.POLL_INTERVAL_MS) || 3000;
  }

  async fetchPrices() {
    const { collection, chain, marketplace } = this.config;
    const results = { timestamp: Date.now(), prices: [] };
    const tasks = [];

    if (marketplace === "opensea" || marketplace === "both") {
      tasks.push(
        openSeaClient.getListings(collection, chain, 10).then((list) => {
          list.forEach((l) => { if (l.price) results.prices.push(Object.assign({}, l, { marketplace: "opensea" })); });
        }).catch(() => {})
      );
    }
    if (marketplace === "magiceden" || marketplace === "both") {
      tasks.push(
        magicEdenClient.getListings(collection, chain, 10).then((list) => {
          list.forEach((l) => { if (l.price) results.prices.push(Object.assign({}, l, { marketplace: "magiceden" })); });
        }).catch(() => {})
      );
    }

    await Promise.allSettled(tasks);
    results.prices.sort((a, b) => (a.price || Infinity) - (b.price || Infinity));
    return results;
  }

  printTable(results, targetPrice) {
    if (!results.prices.length) { logger.warn("No listings found."); return; }
    const table = new Table({
      head: [chalk.cyan("Marketplace"), chalk.cyan("Token ID"), chalk.cyan("Price (ETH)"), chalk.cyan("Target"), chalk.cyan("Status")],
      colWidths: [15, 12, 14, 14, 14],
    });
    results.prices.slice(0, 15).forEach((item) => {
      const price = item.price ? item.price.toFixed(4) : "-";
      const below = item.price && targetPrice && item.price <= targetPrice;
      table.push([
        item.marketplace === "opensea" ? chalk.blue("OpenSea") : chalk.magenta("MagicEden"),
        item.tokenId ? String(item.tokenId).slice(0, 10) : "-",
        below ? chalk.green(price) : chalk.white(price),
        targetPrice ? chalk.yellow(targetPrice.toFixed(4)) : "-",
        below ? chalk.green("SNIPE!") : chalk.gray("watching"),
      ]);
    });
    console.log(table.toString());
  }

  async start(targetPrice, onSnipe) {
    this.running = true;
    let ticks = 0;
    logger.info(chalk.yellow("Monitor started - polling every " + (this.pollInterval / 1000) + "s"));

    const tick = async () => {
      if (!this.running) return;
      ticks++;
      try {
        const results = await this.fetchPrices();
        console.clear();
        console.log(chalk.bold.cyan("  SMART KRIMINAL") + chalk.gray("  |  Collection: " + this.config.collection));
        console.log(chalk.gray("  Chain: " + this.config.chain + "  |  Market: " + this.config.marketplace + "  |  Target: ") + (targetPrice ? chalk.yellow(targetPrice + " ETH") : chalk.gray("none")) + chalk.gray("  |  " + new Date().toLocaleTimeString()));
        console.log("");
        this.printTable(results, targetPrice);
        const cheapest = results.prices[0];
        if (cheapest) {
          this.priceHistory.push({ time: Date.now(), price: cheapest.price });
          if (this.priceHistory.length > 100) this.priceHistory.shift();
          console.log(chalk.gray("\n  Floor: ") + chalk.green(cheapest.price.toFixed(4) + " ETH") + chalk.gray(" (" + cheapest.marketplace + ")  |  Ticks: " + ticks + "  |  Ctrl+C to stop"));
        }
        if (targetPrice && results.prices.length) {
          const hit = results.prices.find((p) => p.price && p.price <= targetPrice);
          if (hit && onSnipe) await onSnipe(hit);
        }
      } catch (err) {
        logger.error("Monitor tick error: " + err.message);
      }
    };

    await tick();
    this.intervalId = setInterval(tick, this.pollInterval);
  }

  stop() {
    this.running = false;
    if (this.intervalId) clearInterval(this.intervalId);
    logger.info("Monitor stopped.");
  }
}

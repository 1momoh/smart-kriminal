// src/sniper.js
import { ethers } from "ethers";
import { walletManager } from "./wallet.js";
import { CHAINS, SEAPORT_ABI, WETH_ABI } from "./chains.js";
import { logger } from "./logger.js";
import chalk from "chalk";
import axios from "axios";

export class Sniper {
  constructor(chain) {
    this.chain = chain;
    this.chainConfig = CHAINS[chain];
    this.execCount = 0;
    this.successCount = 0;
    this.failCount = 0;
  }

  async init() {
    const result = await walletManager.init(this.chain);
    this.provider = result.provider;
    this.signer = result.signer;
    this.address = result.signer.address;
    this.seaport = new ethers.Contract(this.chainConfig.seaportAddress, SEAPORT_ABI, this.signer);
    this.weth = new ethers.Contract(this.chainConfig.wethAddress, WETH_ABI, this.signer);
    logger.info(chalk.green("Sniper ready on " + this.chainConfig.name));
    logger.info(chalk.gray("Wallet: " + this.address));
    const bal = await walletManager.getBalance(this.chain);
    logger.info(chalk.gray("Balance: " + parseFloat(bal).toFixed(4) + " ETH"));
    return this;
  }

  async checkGas() {
    const max = parseFloat(process.env.MAX_GAS_PRICE_GWEI) || 50;
    const gas = await walletManager.estimateGas(this.chain);
    if (parseFloat(gas.gasPriceGwei) > max) {
      logger.warn("Gas too high: " + gas.gasPriceGwei + " Gwei (max: " + max + "). Skipping.");
      return { ok: false, gasInfo: gas };
    }
    return { ok: true, gasInfo: gas };
  }

  async checkBalance(requiredEth) {
    const bal = parseFloat(await walletManager.getBalance(this.chain));
    const need = parseFloat(requiredEth) * (parseFloat(process.env.GAS_MULTIPLIER) || 1.2) + 0.005;
    if (bal < need) {
      logger.warn("Low balance: " + bal.toFixed(4) + " ETH (need ~" + need.toFixed(4) + " ETH)");
      return false;
    }
    return true;
  }

  async snipeOpenSea(listing) {
    logger.info(chalk.cyan("OpenSea snipe — Token: " + (listing.tokenId || "?") + "  Price: " + listing.price + " ETH"));
    this.execCount++;

    if (!process.env.OPENSEA_API_KEY || process.env.OPENSEA_API_KEY === "your_opensea_api_key_here") {
      this.failCount++;
      logger.error("OPENSEA_API_KEY not set. Get one at opensea.io/account/api-keys");
      return { success: false, reason: "no_opensea_api_key" };
    }
    if (!listing.orderHash) {
      this.failCount++;
      logger.error("No order hash on listing — cannot fulfill.");
      return { success: false, reason: "no_order_hash" };
    }

    const { ok, gasInfo } = await this.checkGas();
    if (!ok) return { success: false, reason: "gas_too_high" };
    if (!await this.checkBalance(listing.price)) return { success: false, reason: "insufficient_balance" };

    try {
      const fulfillData = await this._getOpenSeaFulfillment(listing);
      if (!fulfillData) { this.failCount++; return { success: false, reason: "no_fulfillment_data" }; }
      const tx = await this._sendOpenSeaTx(fulfillData, listing.price, gasInfo);
      return await this._waitForTx(tx, listing);
    } catch (err) {
      this.failCount++;
      logger.error("OpenSea snipe failed: " + err.message);
      return { success: false, reason: err.message };
    }
  }

  async snipeMagicEden(listing) {
    logger.info(chalk.magenta("MagicEden snipe — Token: " + (listing.tokenId || "?") + "  Price: " + listing.price + " ETH"));
    this.execCount++;

    const { ok, gasInfo } = await this.checkGas();
    if (!ok) return { success: false, reason: "gas_too_high" };
    if (!await this.checkBalance(listing.price)) return { success: false, reason: "insufficient_balance" };

    try {
      const base = this.chain === "base"
        ? "https://api-mainnet.magiceden.dev/v3/rtp/base"
        : "https://api-mainnet.magiceden.dev/v3/rtp/ethereum";
      const res = await axios.post(base + "/execute/buy/v7", {
        items: [{ orderId: listing.orderId, quantity: 1 }],
        taker: this.address,
        source: "smart-kriminal",
      }, {
        headers: { Authorization: "Bearer " + (process.env.MAGICEDEN_API_KEY || ""), "Content-Type": "application/json" },
        timeout: 15000,
      });
      const steps = res.data && res.data.steps ? res.data.steps : [];
      const txStep = steps.find((s) => s.kind === "transaction");
      if (!txStep || !txStep.items || !txStep.items[0]) { this.failCount++; return { success: false, reason: "no_tx_data" }; }
      const txData = txStep.items[0].data;
      const tx = await this.signer.sendTransaction({
        to: txData.to, data: txData.data,
        value: ethers.parseEther(String(listing.price)),
        maxFeePerGas: gasInfo.maxFeePerGas,
        maxPriorityFeePerGas: ethers.parseUnits(String(process.env.PRIORITY_FEE_GWEI || "2"), "gwei"),
      });
      return await this._waitForTx(tx, listing);
    } catch (err) {
      this.failCount++;
      logger.error("MagicEden snipe failed: " + err.message);
      return { success: false, reason: err.message };
    }
  }

  async snipe(listing) {
    const retries = parseInt(process.env.MAX_TX_RETRIES) || 3;
    let result;
    for (let i = 0; i < retries; i++) {
      if (i > 0) { logger.info("Retry " + i + "/" + retries + "..."); await new Promise((r) => setTimeout(r, 1500)); }
      result = listing.source === "magiceden" ? await this.snipeMagicEden(listing) : await this.snipeOpenSea(listing);
      if (result && result.success) break;
    }
    if (result && result.success) { this.successCount++; this._logSuccess(result); }
    return result;
  }

  async _getOpenSeaFulfillment(listing) {
    try {
      const res = await axios.post("https://api.opensea.io/v2/listings/fulfillment_data", {
        listing: { hash: listing.orderHash, chain: this.chain, protocol_address: this.chainConfig.seaportAddress },
        fulfiller: { address: this.address },
      }, {
        headers: { "X-API-KEY": process.env.OPENSEA_API_KEY || "", "Content-Type": "application/json" },
        timeout: 15000,
      });
      return res.data;
    } catch (err) {
      logger.warn("Fulfillment error: " + err.message);
      return null;
    }
  }

  async _sendOpenSeaTx(fulfillData, price, gasInfo) {
    const txn = fulfillData && fulfillData.fulfillment_data && fulfillData.fulfillment_data.transaction
      ? fulfillData.fulfillment_data.transaction : null;
    if (!txn) throw new Error("No transaction in fulfillment response");
    const calldata = txn.input_data && txn.input_data.data ? txn.input_data.data : txn.data;
    if (!calldata || calldata === "0x" || calldata === "") {
      throw new Error("OpenSea returned empty calldata — check your API key or the order may have expired");
    }
    let value;
    try { value = txn.value ? ethers.toBigInt(txn.value) : ethers.parseEther(String(price)); }
    catch (e) { value = ethers.parseEther(String(price)); }
    logger.info("  Calldata: " + calldata.length + " chars — valid");
    return await this.signer.sendTransaction({
      to: txn.to, data: calldata, value,
      maxFeePerGas: gasInfo.maxFeePerGas,
      maxPriorityFeePerGas: ethers.parseUnits(String(process.env.PRIORITY_FEE_GWEI || "2"), "gwei"),
    });
  }

  async _waitForTx(tx, listing) {
    logger.info(chalk.yellow("TX sent: " + tx.hash));
    const receipt = await tx.wait(1);
    if (receipt && receipt.status === 1) {
      return {
        success: true, txHash: tx.hash, tokenId: listing.tokenId, price: listing.price,
        gasUsed: receipt.gasUsed ? receipt.gasUsed.toString() : "0",
        blockNumber: receipt.blockNumber,
        explorerUrl: this.chainConfig.explorer + "/tx/" + tx.hash,
      };
    }
    throw new Error("Transaction reverted: " + tx.hash);
  }

  _logSuccess(result) {
    console.log("\n" + chalk.bold.bgGreen.black("  SNIPED!  "));
    console.log(chalk.green("  Token   : #" + result.tokenId));
    console.log(chalk.green("  Price   : " + result.price + " ETH"));
    console.log(chalk.green("  Block   : " + result.blockNumber));
    console.log(chalk.blue("  TX      : " + result.explorerUrl));
    console.log("");
  }

  getStats() { return { execCount: this.execCount, successCount: this.successCount, failCount: this.failCount }; }
}

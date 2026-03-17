// src/wallet.js
import { ethers } from "ethers";
import { CHAINS } from "./chains.js";
import { logger } from "./logger.js";

export class WalletManager {
  constructor() {
    this.providers = {};
    this.signers = {};
  }

  async init(chainName) {
    const chain = CHAINS[chainName];
    if (!chain) throw new Error("Unknown chain: " + chainName);
    const rpcUrl = process.env[chain.rpcEnvKey];
    if (!rpcUrl || rpcUrl.includes("YOUR_KEY")) throw new Error("RPC URL not configured for " + chainName + ". Check your .env (" + chain.rpcEnvKey + ")");
    const privateKey = process.env.PRIVATE_KEY;
    if (!privateKey || privateKey === "your_private_key_here") throw new Error("PRIVATE_KEY not set in .env");
    const provider = new ethers.JsonRpcProvider(rpcUrl, { chainId: chain.id, name: chain.name });
    try {
      const block = await provider.getBlockNumber();
      logger.info("Connected to " + chain.name + " - Block #" + block);
    } catch (err) {
      throw new Error("Failed to connect to " + chain.name + " RPC: " + err.message);
    }
    const signer = new ethers.Wallet(privateKey, provider);
    this.providers[chainName] = provider;
    this.signers[chainName] = signer;
    return { provider, signer };
  }

  async getBalance(chainName) {
    if (!this.providers[chainName]) await this.init(chainName);
    const balance = await this.providers[chainName].getBalance(this.signers[chainName].address);
    return ethers.formatEther(balance);
  }

  getProvider(chainName) { return this.providers[chainName]; }
  getSigner(chainName) { return this.signers[chainName]; }
  getAddress(chainName) { return this.signers[chainName] ? this.signers[chainName].address : null; }

  async estimateGas(chainName) {
    const feeData = await this.providers[chainName].getFeeData();
    return {
      gasPrice: feeData.gasPrice,
      maxFeePerGas: feeData.maxFeePerGas,
      maxPriorityFeePerGas: feeData.maxPriorityFeePerGas,
      gasPriceGwei: parseFloat(ethers.formatUnits(feeData.gasPrice || 0n, "gwei")).toFixed(2),
    };
  }
}

export const walletManager = new WalletManager();

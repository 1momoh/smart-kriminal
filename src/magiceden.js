// src/magiceden.js
import axios from "axios";
import { logger } from "./logger.js";

export class MagicEdenClient {
  _client(chain) {
    const base = chain === "base"
      ? "https://api-mainnet.magiceden.dev/v3/rtp/base"
      : "https://api-mainnet.magiceden.dev/v3/rtp/ethereum";
    return axios.create({
      baseURL: base,
      headers: { Authorization: "Bearer " + (process.env.MAGICEDEN_API_KEY || ""), "Content-Type": "application/json" },
      timeout: 15000,
    });
  }

  async getCollectionStats(contractAddress, chain) {
    chain = chain || "ethereum";
    try {
      const res = await this._client(chain).get("/collections/v7", { params: { contract: contractAddress, limit: 1 } });
      const col = res.data && res.data.collections ? res.data.collections[0] : null;
      if (!col) return null;
      return {
        source: "magiceden",
        name: col.name,
        floorPrice: col.floorAsk && col.floorAsk.price ? col.floorAsk.price.amount.native : null,
        floorPriceCurrency: "ETH",
        volume24h: col.volume && col.volume["1day"] ? col.volume["1day"] : null,
        numOwners: col.ownerCount || null,
        totalSupply: col.tokenCount || null,
        listedCount: col.onSaleCount || null,
      };
    } catch (err) {
      logger.warn("MagicEden stats error: " + err.message);
      return null;
    }
  }

  async getListings(contractAddress, chain, limit) {
    chain = chain || "ethereum";
    limit = limit || 20;
    try {
      const res = await this._client(chain).get("/orders/asks/v5", {
        params: { contracts: contractAddress, sortBy: "price", limit, includeRawData: true },
      });
      return (res.data && res.data.orders ? res.data.orders : []).map((o) => this._parse(o));
    } catch (err) {
      logger.warn("MagicEden listings error: " + err.message);
      return [];
    }
  }

  async getFloorPrice(contractAddress, chain) {
    const s = await this.getCollectionStats(contractAddress, chain);
    return s ? s.floorPrice : null;
  }

  _parse(order) {
    const price = order && order.price ? order.price : null;
    return {
      source: "magiceden",
      tokenId: order && order.criteria && order.criteria.data && order.criteria.data.token
        ? order.criteria.data.token.tokenId : null,
      contractAddress: order && order.contract ? order.contract : null,
      price: price && price.amount ? price.amount.native : null,
      currency: "ETH",
      orderId: order ? order.id : null,
      expirationTime: order ? order.expiration : null,
      rawData: order ? order.rawData : null,
      maker: order ? order.maker : null,
    };
  }
}

export const magicEdenClient = new MagicEdenClient();

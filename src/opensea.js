// src/opensea.js
import axios from "axios";
import { logger } from "./logger.js";

export class OpenSeaClient {
  constructor() {
    this.client = axios.create({
      baseURL: "https://api.opensea.io/api/v2",
      headers: { "X-API-KEY": process.env.OPENSEA_API_KEY || "", "Content-Type": "application/json" },
      timeout: 15000,
    });
  }

  async getCollectionStats(slug) {
    try {
      const res = await this.client.get("/collections/" + slug + "/stats");
      const t = res.data && res.data.total;
      return {
        source: "opensea",
        floorPrice: t && t.floor_price ? t.floor_price : null,
        floorPriceCurrency: t && t.floor_price_symbol ? t.floor_price_symbol : "ETH",
        volume24h: t && t.volume ? t.volume : null,
        numOwners: t && t.num_owners ? t.num_owners : null,
        totalSupply: t && t.total_supply ? t.total_supply : null,
        listedCount: t && t.num_for_sale ? t.num_for_sale : null,
      };
    } catch (err) {
      logger.warn("OpenSea stats error for " + slug + ": " + err.message);
      return null;
    }
  }

  async getListings(slug, chain, limit) {
    chain = chain || "ethereum";
    limit = limit || 20;
    try {
      const res = await this.client.get("/listings/collection/" + slug + "/best", {
        params: { limit, chain },
      });
      return (res.data && res.data.listings ? res.data.listings : []).map((l) => this._parse(l));
    } catch (err) {
      logger.warn("OpenSea listings error for " + slug + ": " + err.message);
      return [];
    }
  }

  async getFloorPrice(slug) {
    const s = await this.getCollectionStats(slug);
    return s ? s.floorPrice : null;
  }

  _parse(listing) {
    const price = listing && listing.price && listing.price.current ? listing.price.current : null;
    // Try multiple paths for token ID
    let tokenId = null;
    if (listing && listing.asset && listing.asset.identifier) {
      tokenId = listing.asset.identifier;
    } else if (listing && listing.criteria && listing.criteria.data && listing.criteria.data.token) {
      tokenId = listing.criteria.data.token.tokenId;
    } else if (listing && listing.protocol_data && listing.protocol_data.parameters) {
      var offer = listing.protocol_data.parameters.offer;
      if (offer && offer[0] && offer[0].identifierOrCriteria) tokenId = offer[0].identifierOrCriteria;
    }
    // Try multiple paths for contract
    var contractAddress = null;
    if (listing && listing.asset && listing.asset.contract) {
      contractAddress = listing.asset.contract;
    } else if (listing && listing.protocol_data && listing.protocol_data.parameters) {
      var offer2 = listing.protocol_data.parameters.offer;
      if (offer2 && offer2[0] && offer2[0].token) contractAddress = offer2[0].token;
    }
    return {
      source: "opensea",
      tokenId,
      contractAddress,
      price: price ? parseFloat(price.value) / Math.pow(10, price.decimals || 18) : null,
      currency: price ? price.currency : "ETH",
      orderHash: listing ? listing.order_hash : null,
      expirationTime: listing ? listing.expiration_time : null,
      protocolData: listing ? listing.protocol_data : null,
      maker: listing && listing.maker ? listing.maker.address : null,
    };
  }
}

export const openSeaClient = new OpenSeaClient();

// src/telegram.js - Telegram notification + phone approval
import { logger } from "./logger.js";

const API = "https://api.telegram.org/bot";

export class TelegramBot {
  constructor() {
    this.token = process.env.TELEGRAM_BOT_TOKEN;
    this.chatId = process.env.TELEGRAM_CHAT_ID;
    this.lastUpdateId = 0;
    this.enabled = !!(
      this.token && this.chatId &&
      this.token !== "your_telegram_bot_token" &&
      this.chatId !== "your_telegram_chat_id"
    );
  }

  async _call(method, body) {
    if (!this.enabled) return null;
    try {
      const res = await fetch(API + this.token + "/" + method, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      return data.ok ? data.result : null;
    } catch (err) {
      logger.warn("Telegram error: " + err.message);
      return null;
    }
  }

  async send(text) {
    return await this._call("sendMessage", {
      chat_id: this.chatId, text, parse_mode: "HTML", disable_web_page_preview: true,
    });
  }

  async sendStarted(config) {
    if (!this.enabled) return;
    await this.send(
      "🟢 <b>Smart Kriminal is running</b>\n\n" +
      "📦  Collection: <code>" + config.collection + "</code>\n" +
      "⛓  Chain: " + (config.chain || "ethereum").toUpperCase() + "\n" +
      "🏪  Marketplace: " + (config.marketplace || "opensea").toUpperCase() + "\n" +
      (config.targetPrice ? "🎯  Target: <b>" + config.targetPrice + " ETH</b>" : "👀  Monitor Only")
    );
  }

  async sendSnipeAlert(listing) {
    if (!this.enabled) {
      logger.warn("Telegram not configured — add TELEGRAM_BOT_TOKEN + TELEGRAM_CHAT_ID to .env");
      return null;
    }
    const approvalId = "sk_" + Date.now();
    const text =
      "🎯 <b>SNIPE TARGET FOUND!</b>\n\n" +
      "🖼  Token: <b>" + (listing.tokenId ? "#" + listing.tokenId : "unknown") + "</b>\n" +
      "💰  Price: <b>" + (listing.price ? listing.price.toFixed(4) : "?") + " ETH</b>\n" +
      "🏪  Source: " + (listing.source || "opensea").toUpperCase() + "\n" +
      "⛓  Chain: " + (listing.chain || "ethereum").toUpperCase() + "\n" +
      (listing.contractAddress ? "📄  Contract: <code>" + listing.contractAddress + "</code>\n" : "") +
      "\n⏳ <i>Waiting for your decision (2 min timeout)...</i>";

    const result = await this._call("sendMessage", {
      chat_id: this.chatId,
      text,
      parse_mode: "HTML",
      disable_web_page_preview: true,
      reply_markup: {
        inline_keyboard: [[
          { text: "✅  ACCEPT — SNIPE IT", callback_data: approvalId + ":accept" },
          { text: "❌  REJECT — SKIP", callback_data: approvalId + ":reject" },
        ]],
      },
    });

    if (!result) return null;
    return { messageId: result.message_id, approvalId };
  }

  async waitForApproval(approvalId, messageId, timeoutMs) {
    timeoutMs = timeoutMs || 120000;
    logger.info("Waiting for Telegram approval (" + (timeoutMs / 1000) + "s timeout)...");

    return new Promise((resolve) => {
      const deadline = Date.now() + timeoutMs;

      const poll = async () => {
        if (Date.now() > deadline) {
          await this._editMessage(messageId, "⏰ <b>Timed out</b> — no decision. Snipe skipped.");
          resolve("timeout");
          return;
        }
        const updates = await this._getUpdates();
        for (const update of updates) {
          if (!update.callback_query) continue;
          const data = update.callback_query.data || "";
          if (!data.startsWith(approvalId)) continue;
          const decision = data.endsWith(":accept") ? "accept" : "reject";
          await this._call("answerCallbackQuery", {
            callback_query_id: update.callback_query.id,
            text: decision === "accept" ? "Executing snipe..." : "Snipe rejected.",
          });
          await this._editMessage(messageId,
            decision === "accept"
              ? "✅ <b>ACCEPTED — executing snipe now...</b>"
              : "❌ <b>REJECTED — resuming monitor.</b>"
          );
          resolve(decision);
          return;
        }
        setTimeout(poll, 1500);
      };
      poll();
    });
  }

  async sendSuccess(result) {
    if (!this.enabled) return;
    await this.send(
      "🎉 <b>SNIPED SUCCESSFULLY!</b>\n\n" +
      "🖼  Token: <b>#" + (result.tokenId || "?") + "</b>\n" +
      "💰  Price: <b>" + (result.price || "?") + " ETH</b>\n" +
      "⛽  Gas Used: " + (result.gasUsed || "?") + "\n" +
      "📦  Block: " + (result.blockNumber || "?") + "\n" +
      "🔗  <a href=\"" + result.explorerUrl + "\">View on Explorer</a>"
    );
  }

  async sendFailure(reason) {
    if (!this.enabled) return;
    await this.send("❗ <b>Snipe Failed</b>\n\nReason: <code>" + reason + "</code>");
  }

  async _editMessage(messageId, text) {
    return await this._call("editMessageText", {
      chat_id: this.chatId, message_id: messageId, text, parse_mode: "HTML",
    });
  }

  async _getUpdates() {
    try {
      const res = await this._call("getUpdates", {
        offset: this.lastUpdateId + 1, timeout: 1, allowed_updates: ["callback_query"],
      });
      if (res && res.length > 0) this.lastUpdateId = res[res.length - 1].update_id;
      return res || [];
    } catch (err) { return []; }
  }

  isEnabled() { return this.enabled; }
}

export const telegramBot = new TelegramBot();

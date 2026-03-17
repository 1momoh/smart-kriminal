# Smart Kriminal — NFT Sniper Bot

Terminal-based NFT sniper for **Ethereum** and **Base**.
Monitors OpenSea and MagicEden. Auto-buys when price drops below your target.
Get Telegram alerts on your phone and approve snipes remotely.

## Features

- Real-time price monitoring (every 3s)
- Auto-snipe when listing drops below target price
- Telegram phone notifications with Accept/Reject buttons
- Cross-marketplace: OpenSea + MagicEden simultaneously
- ETH + Base chain support with custom RPC
- Gas guard, balance check, auto-retry (3x)
- Full logging to logs/sniper.log

## Setup

    git clone https://github.com/1momoh/smart-kriminal.git
    cd smart-kriminal
    npm install
    cp .env.example .env

Fill in your .env, then:

    npm start

## Telegram Setup (for phone approvals)

1. Open Telegram, message @BotFather
2. Send /newbot, follow steps, copy the token
3. Message @userinfobot to get your chat ID
4. Add both to your .env:
   TELEGRAM_BOT_TOKEN=...
   TELEGRAM_CHAT_ID=...

When the bot finds a target NFT, you get a Telegram message with
Accept and Reject buttons. Tap Accept and the snipe fires immediately.

## .env Variables

- PRIVATE_KEY          : Wallet private key
- ETH_RPC_URL          : Ethereum RPC (Infura/Alchemy)
- BASE_RPC_URL         : Base RPC
- OPENSEA_API_KEY      : From opensea.io/account/api-keys
- MAGICEDEN_API_KEY    : From docs.magiceden.dev
- TELEGRAM_BOT_TOKEN   : From @BotFather
- TELEGRAM_CHAT_ID     : From @userinfobot
- MAX_GAS_PRICE_GWEI   : Max gas (default 50)
- POLL_INTERVAL_MS     : Poll speed in ms (default 3000)

## Disclaimer

For educational purposes only. Use at your own risk.

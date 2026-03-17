// src/chains.js
export const CHAINS = {
  ethereum: {
    id: 1,
    name: "Ethereum",
    symbol: "ETH",
    rpcEnvKey: "ETH_RPC_URL",
    explorer: "https://etherscan.io",
    seaportAddress: "0x0000000000000068F116a894984e2DB1123eB395",
    wethAddress: "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2",
  },
  base: {
    id: 8453,
    name: "Base",
    symbol: "ETH",
    rpcEnvKey: "BASE_RPC_URL",
    explorer: "https://basescan.org",
    seaportAddress: "0x0000000000000068F116a894984e2DB1123eB395",
    wethAddress: "0x4200000000000000000000000000000000000006",
  },
};

export const SEAPORT_ABI = [
  "function fulfillBasicOrder(tuple(address considerationToken, uint256 considerationIdentifier, uint256 considerationAmount, address offerer, address zone, address offerToken, uint256 offerIdentifier, uint256 offerAmount, uint8 basicOrderType, uint256 startTime, uint256 endTime, bytes32 zoneHash, uint256 salt, bytes32 offererConduitKey, bytes32 fulfillerConduitKey, uint256 totalOriginalAdditionalRecipients, tuple(uint256 amount, address recipient)[] additionalRecipients, bytes signature) parameters) payable returns (bool fulfilled)",
];

export const WETH_ABI = [
  "function deposit() payable",
  "function withdraw(uint256 wad)",
  "function approve(address guy, uint256 wad) returns (bool)",
  "function allowance(address src, address guy) view returns (uint256)",
  "function balanceOf(address who) view returns (uint256)",
];

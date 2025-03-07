import type { Plugin } from "@elizaos/core";
import { coinGeckoProvider } from "./providers/coingecko";
import { defiLlamaProvider } from "./providers/defillama";
import { walletProvider } from "./providers/wallet";
import { transfer } from "./actions/transfer";
import { erc20Transfer } from "./actions/erc20Transfer";
import { portfolio } from "./actions/portfolio";
import { swap } from "./actions/swap";
import { deposit } from "./actions/lending/deposit";
import { withdraw } from "./actions/lending/withdraw";
import { borrow } from "./actions/lending/borrow";
import { repay } from "./actions/lending/repay";

export const hivefiPlugin: Plugin = {
    name: "hivefi",
    description: "HiveFi Plugin for Eliza - Mantle DeFi Agent Swarm",
    actions: [
        transfer,
        erc20Transfer,
        portfolio,
        swap,
        deposit,
        withdraw,
        borrow,
        repay
    ],
    evaluators: [],
    providers: [
        coinGeckoProvider,
        defiLlamaProvider,
        walletProvider
    ]
};

export default hivefiPlugin;

import type { Chain } from "viem";

// Define Mantle chain configuration
export const mantleChain = {
    id: 5000,
    name: "Mantle",
    nativeCurrency: {
        decimals: 18,
        name: "MNT",
        symbol: "MNT",
    },
    rpcUrls: {
        default: { http: ["https://rpc.mantle.xyz"] },
        public: { http: ["https://rpc.mantle.xyz"] },
    },
    blockExplorers: {
        default: { name: "Explorer", url: "https://mantlescan.xyz/" },
    },
} as const satisfies Chain;

export const mantleTestnetChain = {
    id: 5003,
    name: "Mantle Sepolia Testnet",
    nativeCurrency: {
        decimals: 18,
        name: "MNT",
        symbol: "MNT",
    },
    rpcUrls: {
        default: { http: ["https://rpc.sepolia.mantle.xyz"] },
        public: { http: ["https://rpc.sepolia.mantle.xyz"] },
    },
    blockExplorers: {
        default: { name: "Explorer", url: "https://sepolia.mantlescan.xyz/" },
    },
} as const satisfies Chain;

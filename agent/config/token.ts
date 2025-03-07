import type { Address } from "viem";

interface BaseTokenConfig {
    symbol: string;
    name: string;
    decimals: number;
}

interface NativeTokenConfig extends BaseTokenConfig {
    type: 'native';
}

interface ERC20TokenConfig extends BaseTokenConfig {
    type: 'erc20';
    address: Address;
}

type TokenConfig = NativeTokenConfig | ERC20TokenConfig;
export type { TokenConfig };

type TokensConfig = {
    [K in string]: TokenConfig;
};

export const TOKENS: TokensConfig = {
    MNT: {
        type: 'native',
        symbol: "MNT",
        name: "Mantle",
        decimals: 18,
    },
    AISHOP: {
        type: 'erc20',
        symbol: "AISHOP",
        name: "AI Shop Agent",
        address: "0x0E02649Db4d1Aa8c202aA44EA99e3606d12a21b1" as Address,
        decimals: 18,
    },
} as const;

export type TokenSymbol = keyof typeof TOKENS;

// Helper functions to get token data
export function getTokenBySymbol(symbol: TokenSymbol): TokenConfig {
    return TOKENS[symbol];
}

export function getTokenByAddress(address: string): ERC20TokenConfig | undefined {
    const normalizedAddress = address.toLowerCase();
    const token = Object.values(TOKENS).find(
        token => token.type === 'erc20' && token.address.toLowerCase() === normalizedAddress
    );
    return token?.type === 'erc20' ? token : undefined;
}

// Helper to check if a token is ERC20
export function isERC20Token(token: TokenConfig): token is ERC20TokenConfig {
    return token.type === 'erc20';
}

// Get all ERC20 tokens
export function getERC20Tokens(): ERC20TokenConfig[] {
    return Object.values(TOKENS).filter(isERC20Token);
}

// Derived maps for specific use cases
export const TOKEN_ADDRESSES: Record<string, Address> = {};
export const TOKEN_DECIMALS: Record<string, number> = {};

// Initialize the derived maps
for (const [symbol, token] of Object.entries(TOKENS)) {
    if (token.type === 'erc20') {
        TOKEN_ADDRESSES[symbol] = token.address;
    }
    TOKEN_DECIMALS[symbol] = token.decimals;
}

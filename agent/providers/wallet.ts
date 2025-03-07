import {
    createPublicClient,
    createWalletClient,
    HttpTransport,
    Chain,
    Account,
    http,
    formatEther,
    type PublicClient,
    type WalletClient,
    type Address,
    formatUnits,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import type { Provider, IAgentRuntime, Memory, State } from "@elizaos/core";
import { mantleSepoliaTestnet } from "../config/chains";
import { TOKENS, isERC20Token } from "../config/token";
import { getUserWallet, userHasWallet } from "../actions/createWallet";

class WalletProvider {
    private account: ReturnType<typeof privateKeyToAccount>;
    private walletClient: WalletClient;

    constructor(
        privateKey: `0x${string}`,
        rpcUrl = "https://rpc.sepolia.mantle.xyz"
    ) {
        this.account = privateKeyToAccount(privateKey);

        this.walletClient = createWalletClient({
            account: this.account,
            chain: mantleSepoliaTestnet,
            transport: http(rpcUrl),
        });
    }

    getAddress(): Address {
        return this.account.address;
    }

    getAccount(): ReturnType<typeof privateKeyToAccount> {
        return this.account;
    }

    async getBalance(): Promise<string> {
        try {
            const balance = await publicClient.getBalance({
                address: this.account.address,
            });
            return formatEther(balance);
        } catch (error) {
            console.error("Error fetching balance:", error);
            throw error;
        }
    }

    async getTokenBalance(tokenAddress: Address): Promise<string> {
        try {
            const erc20Abi = [
                {
                    name: "balanceOf",
                    type: "function",
                    inputs: [{ name: "account", type: "address" }],
                    outputs: [{ name: "balance", type: "uint256" }],
                    stateMutability: "view",
                },
                {
                    name: "decimals",
                    type: "function",
                    inputs: [],
                    outputs: [{ name: "", type: "uint8" }],
                    stateMutability: "view",
                },
            ] as const;

            // Get token decimals
            const decimals = await this.getPublicClient().readContract({
                address: tokenAddress,
                abi: erc20Abi,
                functionName: "decimals",
            });

            // Get token balance
            const balance = await this.getPublicClient().readContract({
                address: tokenAddress,
                abi: erc20Abi,
                functionName: "balanceOf",
                args: [this.account.address],
            });

            return formatUnits(balance, decimals);
        } catch (error) {
            console.error(
                `Error fetching token balance for ${tokenAddress}:`,
                error
            );
            throw error;
        }
    }

    getWalletClient(): WalletClient {
        return this.walletClient;
    }

    getPublicClient(): PublicClient<HttpTransport, Chain, Account | undefined> {
        const publicClient = createPublicClient({
            chain: mantleSepoliaTestnet,
            transport: http("https://rpc.sepolia.mantle.xyz"),
        });
        return publicClient;
    }
}

// Inicializar un proveedor de wallet para un usuario específico
export async function initUserWalletProvider(
    runtime: IAgentRuntime,
    userId: string
): Promise<WalletProvider | null> {
    try {
        // Obtener la wallet del usuario desde el storage
        const userWallet = await getUserWallet(runtime, userId);
        if (!userWallet) {
            console.error("No se encontró una wallet para el usuario", userId);
            return null;
        }

        // Normalizar la clave privada
        const normalizedKey = userWallet.privateKey.startsWith("0x")
            ? (userWallet.privateKey as `0x${string}`)
            : (`0x${userWallet.privateKey}` as `0x${string}`);

        const rpcUrl =
            runtime.getSetting("EVM_RPC_URL") ||
            "https://rpc.sepolia.mantle.xyz";

        return new WalletProvider(normalizedKey, rpcUrl);
    } catch (error) {
        console.error(
            "Error al inicializar el proveedor de wallet del usuario:",
            error
        );
        return null;
    }
}

// Inicializar un proveedor de wallet a partir de una clave privada configurada
export function initWalletProvider(
    runtime: IAgentRuntime
): WalletProvider | null {
    try {
        const privateKey = runtime.getSetting("EVM_PRIVATE_KEY");
        if (!privateKey) {
            console.error("EVM_PRIVATE_KEY is not set");
            return null;
        }

        const normalizedKey = privateKey.startsWith("0x")
            ? (privateKey as `0x${string}`)
            : (`0x${privateKey}` as `0x${string}`);
        const rpcUrl =
            runtime.getSetting("EVM_RPC_URL") ||
            "https://rpc.sepolia.mantle.xyz";

        return new WalletProvider(normalizedKey, rpcUrl);
    } catch (error) {
        console.error("Error initializing wallet provider:", error);
        return null;
    }
}

// Create a public client for read-only operations
const publicClient = createPublicClient({
    chain: mantleSepoliaTestnet,
    transport: http("https://rpc.sepolia.mantle.xyz"),
});

// Export the provider for use in the plugin
export const walletProvider: Provider = {
    async get(
        runtime: IAgentRuntime,
        memory: Memory,
        state?: State
    ): Promise<string> {
        try {
            // Obtener el userId
            const userId = memory.userId || state?.userId;

            if (!userId) {
                return "No se pudo identificar tu cuenta. Por favor inténtalo de nuevo o contacta a soporte.";
            }

            // Check if there's a specific address in the message
            const addressMatch =
                memory.content?.text?.match(/0x[a-fA-F0-9]{40}/i);
            if (addressMatch) {
                const address = addressMatch[0].toLowerCase() as `0x${string}`;
                try {
                    // Obtener balance de MNT
                    const nativeBalance = await publicClient.getBalance({
                        address,
                    });

                    // Obtener balance de AISHOP si está configurado
                    let aishopBalance = "No disponible";
                    const aishopToken = TOKENS.AISHOP;

                    if (isERC20Token(aishopToken)) {
                        try {
                            const erc20Abi = [
                                {
                                    name: "balanceOf",
                                    type: "function",
                                    inputs: [
                                        { name: "account", type: "address" },
                                    ],
                                    outputs: [
                                        { name: "balance", type: "uint256" },
                                    ],
                                    stateMutability: "view",
                                },
                                {
                                    name: "decimals",
                                    type: "function",
                                    inputs: [],
                                    outputs: [{ name: "", type: "uint8" }],
                                    stateMutability: "view",
                                },
                            ] as const;

                            const tokenDecimals =
                                await publicClient.readContract({
                                    address: aishopToken.address,
                                    abi: erc20Abi,
                                    functionName: "decimals",
                                });

                            const tokenBalance =
                                await publicClient.readContract({
                                    address: aishopToken.address,
                                    abi: erc20Abi,
                                    functionName: "balanceOf",
                                    args: [address],
                                });

                            aishopBalance = formatUnits(
                                tokenBalance,
                                tokenDecimals
                            );
                        } catch (error) {
                            console.error(
                                "Error al obtener balance de AISHOP:",
                                error
                            );
                            aishopBalance = "Error al consultar";
                        }
                    }

                    return [
                        "Información de Dirección en Mantle Sepolia:",
                        `Dirección: ${address}`,
                        `Balance MNT: ${formatEther(nativeBalance)} MNT`,
                        `Balance AISHOP: ${aishopBalance} AISHOP`,
                        "",
                        `Ver en Explorador: https://sepolia.mantlescan.xyz/address/${address}`,
                    ].join("\n");
                } catch (error) {
                    console.error("Error fetching balance:", error);
                    return `Error al obtener el balance de ${address}: ${
                        error instanceof Error
                            ? error.message
                            : "Error desconocido"
                    }`;
                }
            }

            // Verificar si el usuario tiene una wallet
            const hasWallet = await userHasWallet(runtime, userId);

            if (!hasWallet) {
                return [
                    "No tienes una wallet creada. Para crear tu wallet personal, simplemente dime:",
                    "",
                    '"Crear wallet"',
                    "",
                    "Una vez creada tu wallet, podrás consultar tu balance y realizar transacciones.",
                ].join("\n");
            }

            // Inicializar el proveedor de wallet del usuario
            const provider = await initUserWalletProvider(runtime, userId);
            if (!provider) {
                return [
                    "Parece que hay un problema al acceder a tu wallet. Por favor, intenta las siguientes soluciones:",
                    "",
                    "1. Escribe 'crear wallet' para intentar restablecer tu wallet.",
                    "2. Contacta a soporte si el problema persiste.",
                ].join("\n");
            }

            try {
                // Obtener dirección y balance de MNT
                const address = provider.getAddress();
                const mntBalance = await provider.getBalance();

                // Obtener balance de AISHOP
                let aishopBalance = "No disponible";
                const aishopToken = TOKENS.AISHOP;

                if (isERC20Token(aishopToken)) {
                    try {
                        const tokenBalance = await provider.getTokenBalance(
                            aishopToken.address
                        );
                        aishopBalance = tokenBalance;
                    } catch (error) {
                        console.error(
                            "Error al obtener balance de AISHOP:",
                            error
                        );
                        aishopBalance = "Error al consultar";
                    }
                }

                return [
                    "Información de Tu Wallet en Mantle Sepolia:",
                    `Dirección: ${address}`,
                    `Balance MNT: ${mntBalance} MNT`,
                    `Balance AISHOP: ${aishopBalance} AISHOP`,
                    "",
                    "Tu wallet está correctamente configurada y lista para transacciones.",
                    `Ver en Explorador: https://sepolia.mantlescan.xyz/address/${address}`,
                ].join("\n");
            } catch (error) {
                console.error("Error in wallet provider:", error);
                return `Error al acceder a la información de la wallet: ${
                    error instanceof Error ? error.message : "Error desconocido"
                }`;
            }
        } catch (error) {
            console.error("Error in wallet provider:", error);
            return "Error al acceder a la información de la wallet. Por favor, asegúrate de que tu configuración es correcta.";
        }
    },
};

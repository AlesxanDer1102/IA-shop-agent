import {
    Action,
    ActionExample,
    HandlerCallback,
    IAgentRuntime,
    Memory,
    State,
} from "@elizaos/core";

import { formatEther, formatUnits, parseAbi, type Address } from "viem";

import {
    initWalletProvider,
    initUserWalletProvider,
} from "../providers/wallet";
import { TOKENS, isERC20Token } from "../config/token";
import { userHasWallet, getUserWallet } from "./createWallet";

function extractEthereumWalletAddress(text: string): Address | null {
    const ethAddressRegex = /0x[a-fA-F0-9]{40}/g;
    const matches = text.match(ethAddressRegex);
    return matches ? (matches[0] as Address) : null;
}

export function generateId(): `${string}-${string}-${string}-${string}-${string}` {
    return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(
        /[xy]/g,
        function (c) {
            const r = (Math.random() * 16) | 0;
            const v = c === "x" ? r : (r & 0x3) | 0x8;
            return v.toString(16);
        }
    ) as `${string}-${string}-${string}-${string}-${string}`;
}

// ABI para contratos ERC20 (solo los métodos que necesitamos)
const erc20Abi = parseAbi([
    "function balanceOf(address owner) view returns (uint256)",
]);

export const checkBalanceAction: Action = {
    name: "CHECK_BALANCE",
    similes: ["CHECK_WALLET", "VIEW_BALANCE", "SHOW_BALANCE"],
    description: "Check your token balances on Mantle network (MNT and AISHOP)",

    validate: async (_agent: IAgentRuntime, memory: Memory, _state?: State) => {
        // Podemos validar si hay una dirección explícita o si el usuario quiere ver su propio balance
        const text = (memory.content?.text || "").toLowerCase();
        return (
            text.includes("balance") ||
            text.includes("wallet") ||
            text.includes("saldo") ||
            text.includes("fondos") ||
            extractEthereumWalletAddress(text) !== null
        );
    },

    handler: async (
        agent: IAgentRuntime,
        memory: Memory,
        state?: State,
        _options?: any,
        callback?: HandlerCallback
    ) => {
        try {
            // Obtener el userId desde memory o state
            const userId = memory.userId || state?.userId;

            if (!userId) {
                callback?.(
                    {
                        text: "No se pudo identificar tu cuenta. Por favor inténtalo de nuevo o contacta a soporte.",
                    },
                    []
                );
                return false;
            }

            // Verificar si hay una dirección específica en el mensaje
            const addressFromMessage = extractEthereumWalletAddress(
                memory.content?.text || ""
            );

            // Si se especificó una dirección, mostrar su balance sin importar si el usuario tiene wallet
            if (addressFromMessage) {
                // Cliente público para consultas a cualquier dirección
                const publicClient =
                    createWalletProvider(agent)?.getPublicClient();

                if (!publicClient) {
                    callback?.(
                        {
                            text: "No se pudo inicializar el cliente para consultar balances. Contacta a soporte.",
                        },
                        []
                    );
                    return false;
                }

                // Obtener el balance nativo (MNT)
                const nativeBalance = await publicClient.getBalance({
                    address: addressFromMessage,
                });
                const nativeBalanceFormatted = formatEther(nativeBalance);

                // Preparar objeto para almacenar todos los balances
                const balances: Record<string, string> = {
                    MNT: nativeBalanceFormatted,
                };

                // Obtener balance del token AISHOP
                const aishopToken = TOKENS.AISHOP;
                if (isERC20Token(aishopToken)) {
                    try {
                        const tokenBalance = await publicClient.readContract({
                            address: aishopToken.address,
                            abi: erc20Abi,
                            functionName: "balanceOf",
                            args: [addressFromMessage],
                        });

                        balances.AISHOP = formatUnits(
                            tokenBalance,
                            aishopToken.decimals
                        );
                    } catch (error) {
                        console.error(
                            "Error al obtener balance de AISHOP:",
                            error
                        );
                        balances.AISHOP = "Error al obtener balance";
                    }
                }

                // Crear el mensaje de respuesta
                const balanceText = [
                    `Balances en Mantle Sepolia Testnet para ${addressFromMessage}:`,
                    `MNT: ${balances.MNT}`,
                    `AISHOP: ${balances.AISHOP}`,
                    "",
                    `Ver en Explorer: https://sepolia.mantlescan.xyz/address/${addressFromMessage}`,
                ].join("\n");

                // Crear memoria con la información
                await agent.documentsManager.createMemory({
                    id: generateId(),
                    userId: memory.userId,
                    agentId: memory.agentId,
                    content: {
                        text: balanceText,
                        action: "CHECK_BALANCE",
                        balances: balances,
                        address: addressFromMessage,
                    },
                    roomId: memory.roomId,
                });

                // Devolver la respuesta
                callback?.(
                    {
                        text: balanceText,
                    },
                    []
                );

                return true;
            }

            // Si no hay dirección específica, usar la wallet del usuario

            // Verificar si el usuario tiene una wallet
            const hasWallet = await userHasWallet(agent, userId);

            if (!hasWallet) {
                callback?.(
                    {
                        text: [
                            "No tienes una wallet creada todavía. Para crear tu wallet personal, simplemente escribe:",
                            "",
                            '"Crear wallet"',
                            "",
                            "Una vez creada, podrás consultar tus balances y realizar transacciones.",
                        ].join("\n"),
                    },
                    []
                );
                return false;
            }

            // Inicializar el proveedor de wallet del usuario
            const userWalletProvider = await initUserWalletProvider(
                agent,
                userId
            );

            if (!userWalletProvider) {
                callback?.(
                    {
                        text: "Hubo un problema al acceder a tu wallet. Por favor intenta crear una nueva wallet o contacta a soporte.",
                    },
                    []
                );
                return false;
            }

            // Obtener la dirección del usuario
            const userAddress = userWalletProvider.getAddress();

            // Obtener el balance nativo (MNT)
            const nativeBalance = await userWalletProvider.getBalance();

            // Preparar objeto para almacenar todos los balances
            const balances: Record<string, string> = {
                MNT: nativeBalance,
            };

            // Obtener balance del token AISHOP
            const aishopToken = TOKENS.AISHOP;
            if (isERC20Token(aishopToken)) {
                try {
                    const tokenBalance =
                        await userWalletProvider.getTokenBalance(
                            aishopToken.address
                        );
                    balances.AISHOP = tokenBalance;
                } catch (error) {
                    console.error("Error al obtener balance de AISHOP:", error);
                    balances.AISHOP = "Error al obtener balance";
                }
            }

            // Crear el mensaje de respuesta
            const balanceText = [
                `📊 Tus Balances en Mantle Sepolia Testnet:`,
                "",
                `Dirección: ${userAddress}`,
                `MNT: ${balances.MNT}`,
                `AISHOP: ${balances.AISHOP}`,
                "",
                `Ver en Explorer: https://sepolia.mantlescan.xyz/address/${userAddress}`,
            ].join("\n");

            // Crear memoria con la información
            await agent.documentsManager.createMemory({
                id: generateId(),
                userId: memory.userId,
                agentId: memory.agentId,
                content: {
                    text: balanceText,
                    action: "CHECK_BALANCE",
                    balances: balances,
                    address: userAddress,
                },
                roomId: memory.roomId,
            });

            // Devolver la respuesta
            callback?.(
                {
                    text: balanceText,
                },
                []
            );

            return true;
        } catch (error) {
            console.error("Error al verificar balances:", error);
            callback?.(
                {
                    text: `Error al verificar balances: ${
                        error instanceof Error
                            ? error.message
                            : "Error desconocido"
                    }`,
                },
                []
            );
            return false;
        }
    },
    examples: [
        [
            {
                user: "{{user1}}",
                content: { text: "¿Cuál es mi balance actual?" },
            },
            {
                user: "{{agentName}}",
                content: {
                    text: "¡Voy a verificar tus balances!",
                    action: "CHECK_BALANCE",
                },
            },
        ],
        [
            {
                user: "{{user1}}",
                content: {
                    text: "Verifica el balance de 0x1234567890abcdef1234567890abcdef12345678",
                },
            },
            {
                user: "{{agentName}}",
                content: {
                    text: "Verificando los balances de esa dirección...",
                    action: "CHECK_BALANCE",
                },
            },
        ],
        [
            {
                user: "{{user1}}",
                content: { text: "¿Cuántos tokens MNT y AISHOP tengo?" },
            },
            {
                user: "{{agentName}}",
                content: {
                    text: "Consultando tus balances de MNT y AISHOP...",
                    action: "CHECK_BALANCE",
                },
            },
        ],
    ] as ActionExample[][],
};

// Función auxiliar para crear un proveedor de wallet genérico
function createWalletProvider(agent: IAgentRuntime) {
    return initWalletProvider(agent);
}

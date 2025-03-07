import {
    Action,
    ActionExample,
    HandlerCallback,
    IAgentRuntime,
    Memory,
    State,
} from "@elizaos/core";

import { parseUnits, formatUnits, type Address, parseAbi } from "viem";

import {
    initWalletProvider,
    initUserWalletProvider,
} from "../providers/wallet";
import { mantleSepoliaTestnet } from "../config/chains";
import { TOKENS, isERC20Token } from "../config/token";
import { userHasWallet, getUserWallet } from "./createWallet";

// ABI para la función transfer de ERC20
const erc20TransferAbi = parseAbi([
    "function transfer(address to, uint256 amount) returns (bool)",
    "function balanceOf(address owner) view returns (uint256)",
]);

function extractEthereumWalletAddress(text: string): Address | null {
    const ethAddressRegex = /0x[a-fA-F0-9]{40}/g;
    const matches = text.match(ethAddressRegex);
    return matches ? (matches[0] as Address) : null;
}

function extractTokenTransferInfo(
    text: string
): { amount: string; symbol: string } | null {
    // Busca patrones como "100 AISHOP", "1.5 AISHOP", "10 aishop", etc.
    const transferRegex = /(\d+(\.\d+)?)\s*(AISHOP|aishop)/i;
    const match = text.match(transferRegex);

    if (!match) return null;

    return {
        amount: match[1],
        symbol: match[3].toUpperCase(),
    };
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

export const transferERC20Action: Action = {
    name: "TRANSFER_ERC20",
    similes: ["SEND_AISHOP", "TRANSFER_TOKEN", "SEND_TOKEN"],
    description:
        "Transfer ERC20 tokens (like AISHOP) to a specified wallet address on Mantle network",

    validate: async (_agent: IAgentRuntime, memory: Memory, _state?: State) => {
        const text = (memory.content?.text || "").toLowerCase();

        // Verificar si el texto incluye palabras clave relacionadas con transferencias
        const hasTransferIntent =
            text.includes("transfer") ||
            text.includes("send") ||
            text.includes("enviar") ||
            text.includes("transferir");

        // Verificar si menciona AISHOP
        const mentionsAishop = text.includes("aishop");

        // Verificar si hay una dirección Ethereum y una cantidad
        const hasAddress =
            extractEthereumWalletAddress(memory.content?.text || "") !== null;
        const hasTokenInfo =
            extractTokenTransferInfo(memory.content?.text || "") !== null;

        return (
            hasTransferIntent && mentionsAishop && hasAddress && hasTokenInfo
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

            // Verificar si el usuario tiene una wallet
            const hasWallet = await userHasWallet(agent, userId);

            if (!hasWallet) {
                callback?.(
                    {
                        text: "Necesitas crear una wallet antes de poder realizar transferencias de tokens. Puedes decirme 'crear wallet' para configurar una.",
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
                        text: "No se pudo acceder a tu wallet. Por favor intenta crear una nueva wallet o contacta a soporte.",
                    },
                    []
                );
                return false;
            }

            // Obtener dirección de destino del mensaje
            const toAddress = extractEthereumWalletAddress(
                memory.content?.text || ""
            );
            if (!toAddress) {
                callback?.(
                    {
                        text: "No se pudo identificar una dirección de wallet válida en tu mensaje. Por favor, proporciona una dirección en formato 0x...",
                    },
                    []
                );
                return false;
            }

            // Obtener información del token y cantidad a transferir
            const tokenInfo = extractTokenTransferInfo(
                memory.content?.text || ""
            );
            if (!tokenInfo) {
                callback?.(
                    {
                        text: "No se pudo identificar la cantidad y el tipo de token a transferir. Por favor, especifica una cantidad y el token (por ejemplo, '100 AISHOP').",
                    },
                    []
                );
                return false;
            }

            // Obtener la configuración del token desde TOKENS
            const token = TOKENS[tokenInfo.symbol as keyof typeof TOKENS];
            if (!token || !isERC20Token(token)) {
                callback?.(
                    {
                        text: `No se encontró configuración para el token ${tokenInfo.symbol} o no es un token ERC20.`,
                    },
                    []
                );
                return false;
            }

            // Convertir la cantidad a la unidad más pequeña según los decimales del token
            const amountInSmallestUnit = parseUnits(
                tokenInfo.amount,
                token.decimals
            );

            // Obtener la información de la wallet del usuario
            const fromAddress = userWalletProvider.getAddress();
            const walletClient = userWalletProvider.getWalletClient();
            const publicClient = userWalletProvider.getPublicClient();

            // Verificar el balance de tokens antes de la transferencia
            try {
                const tokenBalance = await publicClient.readContract({
                    address: token.address,
                    abi: erc20TransferAbi,
                    functionName: "balanceOf",
                    args: [fromAddress],
                });

                if (tokenBalance < amountInSmallestUnit) {
                    const formattedBalance = formatUnits(
                        tokenBalance,
                        token.decimals
                    );

                    callback?.(
                        {
                            text: `Balance insuficiente para realizar la transferencia. Tienes ${formattedBalance} ${token.symbol} y estás intentando enviar ${tokenInfo.amount} ${token.symbol}.`,
                        },
                        []
                    );
                    return false;
                }
            } catch (error) {
                console.error("Error al verificar balance de tokens:", error);
                // Continuamos incluso si hay error en la verificación de balance
            }

            // Notificar que se está procesando la transacción
            callback?.(
                {
                    text: `Procesando transferencia de ${tokenInfo.amount} ${token.symbol} desde tu wallet personal (${fromAddress}) hacia ${toAddress}...`,
                },
                []
            );

            // Realizar la transacción de token ERC20
            const txHash = await walletClient.writeContract({
                account: fromAddress,
                address: token.address,
                abi: erc20TransferAbi,
                functionName: "transfer",
                args: [toAddress, amountInSmallestUnit],
                chain: mantleSepoliaTestnet,
            });

            // Esperar a que se confirme la transacción
            const receipt = await publicClient.waitForTransactionReceipt({
                hash: txHash,
                confirmations: 1, // Esperar al menos 1 confirmación
            });

            // Crear mensaje de éxito con detalles de la transacción
            const successText = [
                `✅ Transferencia de token ERC20 completada con éxito:`,
                ``,
                `Token: ${token.symbol} (${token.name})`,
                `Cantidad: ${tokenInfo.amount} ${token.symbol}`,
                `De: ${fromAddress} (tu wallet)`,
                `Para: ${toAddress}`,
                `Hash de Transacción: ${txHash}`,
                `Estado: ${
                    receipt.status === "success" ? "Exitoso" : "Pendiente"
                }`,
                ``,
                `Ver en el explorador: https://sepolia.mantlescan.xyz/tx/${txHash}`,
            ].join("\n");

            // Guardar en memoria los detalles de la transacción
            await agent.documentsManager.createMemory({
                id: generateId(),
                userId: memory.userId,
                agentId: memory.agentId,
                content: {
                    text: successText,
                    action: "TRANSFER_ERC20",
                    transaction: {
                        hash: txHash,
                        from: fromAddress,
                        to: toAddress,
                        token: token.symbol,
                        tokenAddress: token.address,
                        amount: tokenInfo.amount,
                        blockNumber: receipt.blockNumber,
                        status: receipt.status,
                    },
                },
                roomId: memory.roomId,
            });

            // Devolver mensaje de éxito
            callback?.(
                {
                    text: successText,
                },
                []
            );

            return true;
        } catch (error) {
            console.error("Error al transferir token ERC20:", error);
            callback?.(
                {
                    text: `Error al transferir token ERC20: ${
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
                content: {
                    text: "Transfiere 100 AISHOP a la wallet 0x1234567890abcdef1234567890abcdef12345678",
                },
            },
            {
                user: "{{agentName}}",
                content: {
                    text: "Procesando tu transferencia de tokens AISHOP...",
                    action: "TRANSFER_ERC20",
                },
            },
        ],
        [
            {
                user: "{{user1}}",
                content: {
                    text: "Envía 50 AISHOP a 0x1234567890abcdef1234567890abcdef12345678",
                },
            },
            {
                user: "{{agentName}}",
                content: {
                    text: "Iniciando transferencia de 50 tokens AISHOP...",
                    action: "TRANSFER_ERC20",
                },
            },
        ],
        [
            {
                user: "{{user1}}",
                content: {
                    text: "¿Puedes transferir 25.5 AISHOP a esta dirección 0x1234567890abcdef1234567890abcdef12345678?",
                },
            },
            {
                user: "{{agentName}}",
                content: {
                    text: "Voy a transferir 25.5 tokens AISHOP a la dirección especificada...",
                    action: "TRANSFER_ERC20",
                },
            },
        ],
    ] as ActionExample[][],
};

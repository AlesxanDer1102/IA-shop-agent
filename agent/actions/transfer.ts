import {
    Action,
    ActionExample,
    HandlerCallback,
    IAgentRuntime,
    Memory,
    State,
} from "@elizaos/core";

import {
    parseEther,
    formatEther,
    type Address,
    type Hash,
    createWalletClient,
    http,
    type Hex,
    type ByteArray,
} from "viem";

import { privateKeyToAccount } from "viem/accounts";
import {
    initUserWalletProvider,
} from "../providers/wallet";
import { mantleSepoliaTestnet } from "../config/chains";
import { userHasWallet, getUserWallet } from "./createWallet";

function extractEthereumWalletAddress(text: string): Address | null {
    const ethAddressRegex = /0x[a-fA-F0-9]{40}/g;
    const matches = text.match(ethAddressRegex);
    return matches ? (matches[0] as Address) : null;
}

function extractAmount(text: string): string | null {
    // Busca patrones como "0.1 MNT", "1.5 MNT", "1 MNT", etc.
    const amountRegex = /(\d+(\.\d+)?)\s*(MNT|mnt)/i;
    const match = text.match(amountRegex);
    return match ? match[1] : null;
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

export const transferMNTAction: Action = {
    name: "TRANSFER_MNT",
    similes: ["SEND_MNT", "TRANSFER_MANTLE", "SEND_FUNDS"],
    description:
        "Transfer MNT tokens to a specified wallet address on Mantle network",

    validate: async (_agent: IAgentRuntime, memory: Memory, _state?: State) => {
        const text = (memory.content?.text || "").toLowerCase();

        // Verificar si el texto incluye palabras clave relacionadas con transferencias
        const hasTransferIntent =
            text.includes("transfer") ||
            text.includes("send") ||
            text.includes("enviar") ||
            text.includes("transferir");

        // Verificar si hay una dirección Ethereum y una cantidad
        const hasAddress =
            extractEthereumWalletAddress(memory.content?.text || "") !== null;
        const hasAmount = extractAmount(memory.content?.text || "") !== null;

        return hasTransferIntent && hasAddress && hasAmount;
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
                        text: "Necesitas crear una wallet antes de poder realizar transferencias. Puedes decirme 'crear wallet' para configurar una.",
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
            const to = extractEthereumWalletAddress(memory.content?.text);
            if (!to) {
                callback?.(
                    {
                        text: "No se pudo identificar una dirección de wallet válida en tu mensaje. Por favor, proporciona una dirección en formato 0x...",
                    },
                    []
                );
                return false;
            }

            // Obtener cantidad a transferir del mensaje
            const amountStr = extractAmount(memory.content?.text || "");
            if (!amountStr) {
                callback?.(
                    {
                        text: "No se pudo identificar la cantidad de MNT a transferir. Por favor, especifica una cantidad (por ejemplo, '0.1 MNT').",
                    },
                    []
                );
                return false;
            }

            // Convertir la cantidad a Wei (unidad más pequeña)
            const value = parseEther(amountStr);

            // Obtener información de la wallet del usuario
            const fromAddress = userWalletProvider.getAddress();
            const publicClient = userWalletProvider.getPublicClient();

            // Verificar balance antes de la transferencia
            const currentBalance = await publicClient.getBalance({
                address: fromAddress,
            });

            if (currentBalance < value) {
                callback?.(
                    {
                        text: `Balance insuficiente para realizar la transferencia. Tienes ${formatEther(
                            currentBalance
                        )} MNT y estás intentando enviar ${amountStr} MNT.`,
                    },
                    []
                );
                return false;
            }

            // Notificar que se está procesando la transacción
            callback?.(
                {
                    text: `Procesando transferencia de ${amountStr} MNT desde tu wallet personal (${fromAddress}) hacia ${to}...`,
                },
                []
            );

            const walletClient = userWalletProvider.getWalletClient();
            // Realizar la transacción
            const txHash = await walletClient.sendTransaction({
                account: walletClient.account,
                data: "0x" as Hex,
                to,
                value,
                kzg: {
                    blobToKzgCommitment: (_: ByteArray): ByteArray => {
                        throw new Error("Function not implemented.");
                    },
                    computeBlobKzgProof: (
                        _blob: ByteArray,
                        _commitment: ByteArray
                    ): ByteArray => {
                        throw new Error("Function not implemented.");
                    },
                },
                chain: undefined,
            });

            // Esperar a que se confirme la transacción
            const receipt = await publicClient.waitForTransactionReceipt({
                hash: txHash,
                confirmations: 1, // Esperar al menos 1 confirmación
            });

            // Crear mensaje de éxito con detalles de la transacción
            const successText = [
                `✅ Transferencia completada con éxito:`,
                ``,
                `Cantidad: ${amountStr} MNT`,
                `De: ${fromAddress} (tu wallet)`,
                `Para: ${to}`,
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
                    action: "TRANSFER_MNT",
                    transaction: {
                        hash: txHash,
                        from: fromAddress,
                        to: to,
                        amount: amountStr,
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
            console.error("Error al transferir MNT:", error);
            callback?.(
                {
                    text: `Error al transferir MNT: ${
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
                    text: "Transfiere 0.01 MNT a la wallet 0x1234567890abcdef1234567890abcdef12345678",
                },
            },
            {
                user: "{{agentName}}",
                content: {
                    text: "Procesando tu transferencia de MNT...",
                    action: "TRANSFER_MNT",
                },
            },
        ],
        [
            {
                user: "{{user1}}",
                content: {
                    text: "Envía 0.5 MNT a 0x1234567890abcdef1234567890abcdef12345678",
                },
            },
            {
                user: "{{agentName}}",
                content: {
                    text: "Iniciando transferencia de 0.5 MNT...",
                    action: "TRANSFER_MNT",
                },
            },
        ],
        [
            {
                user: "{{user1}}",
                content: {
                    text: "¿Puedes transferir 0.1 MNT a esta dirección 0x1234567890abcdef1234567890abcdef12345678?",
                },
            },
            {
                user: "{{agentName}}",
                content: {
                    text: "Voy a transferir 0.1 MNT a la dirección especificada...",
                    action: "TRANSFER_MNT",
                },
            },
        ],
    ] as ActionExample[][],
};

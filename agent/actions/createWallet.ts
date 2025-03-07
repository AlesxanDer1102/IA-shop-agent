import {
    Action,
    ActionExample,
    HandlerCallback,
    IAgentRuntime,
    Memory,
    State,
} from "@elizaos/core";

import { createWalletClient, http, formatEther, type Address } from "viem";

import { privateKeyToAccount } from "viem/accounts";
import { generatePrivateKey } from "viem/accounts";
import { mantleSepoliaTestnet } from "../config/chains";

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

// Función para verificar si el usuario ya tiene una wallet
async function userHasWallet(
    agent: IAgentRuntime,
    userId: string
): Promise<boolean> {
    try {
        // Buscar en la base de datos del agente
        const userWalletRecord = await agent.cacheManager.get(
            `user_wallet:${userId}`
        );
        return !!userWalletRecord;
    } catch (error) {
        console.error("Error al verificar wallet de usuario:", error);
        return false;
    }
}

// Función para guardar la wallet del usuario
async function saveUserWallet(
    agent: IAgentRuntime,
    userId: string,
    walletData: {
        address: Address;
        privateKey: string;
        createdAt: number;
    }
): Promise<boolean> {
    try {
        // Guardar en la base de datos del agente
        await agent.cacheManager.set(
            `user_wallet:${userId}`,
            JSON.stringify(walletData)
        );

        // También registrar la dirección para búsqueda inversa (address -> userId)
        await agent.cacheManager.set(
            `address_to_user:${walletData.address}`,
            userId
        );

        return true;
    } catch (error) {
        console.error("Error al guardar wallet de usuario:", error);
        return false;
    }
}

// Función para obtener la wallet del usuario
async function getUserWallet(
    agent: IAgentRuntime,
    userId: string
): Promise<{ address: Address; privateKey: string } | null> {
    try {
        const walletData = await agent.cacheManager.get(
            `user_wallet:${userId}`
        );
        if (!walletData) return null;

        const parsedData =
            typeof walletData === "string"
                ? JSON.parse(walletData)
                : walletData;
        return {
            address: parsedData.address as Address,
            privateKey: parsedData.privateKey,
        };
    } catch (error) {
        console.error("Error al obtener wallet de usuario:", error);
        return null;
    }
}

// Función para obtener el userId a partir de una dirección
export async function getUserIdByAddress(
    agent: IAgentRuntime,
    address: Address
): Promise<string | null> {
    try {
        const userId = await agent.cacheManager.get(
            `address_to_user:${address}`
        );
        return typeof userId === "string" ? userId : null;
    } catch (error) {
        console.error("Error al obtener usuario por dirección:", error);
        return null;
    }
}

export const createWalletAction: Action = {
    name: "CREATE_WALLET",
    similes: [
        "NEW_WALLET",
        "CREATE_WALLET",
        "SETUP_WALLET",
        "INITIALIZE_WALLET",
    ],
    description: "Crea una nueva wallet Ethereum asociada a tu usuario",

    validate: async (_agent: IAgentRuntime, memory: Memory, _state?: State) => {
        const text = (memory.content?.text || "").toLowerCase();
        return (
            text.includes("crear wallet") ||
            text.includes("nueva wallet") ||
            text.includes("generar wallet") ||
            text.includes("create wallet") ||
            text.includes("setup wallet")
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

            // Verificar si el usuario ya tiene una wallet
            const hasWallet = await userHasWallet(agent, userId);

            if (hasWallet) {
                const wallet = await getUserWallet(agent, userId);

                if (!wallet) {
                    callback?.(
                        {
                            text: "Se detectó una wallet registrada, pero no se pudo recuperar su información. Por favor contacta a soporte.",
                        },
                        []
                    );
                    return false;
                }

                // Notificar al usuario que ya tiene una wallet
                callback?.(
                    {
                        text: `Ya tienes una wallet creada. Tu dirección es:\n\n\`${wallet.address}\`\n\nTu wallet está segura y lista para usar.`,
                    },
                    []
                );

                return true;
            }

            // Notificar que estamos creando una nueva wallet
            callback?.(
                {
                    text: "Creando una nueva wallet para ti. Esto tomará solo un momento...",
                },
                []
            );

            // Crear nueva wallet
            const privateKey = generatePrivateKey();
            const account = privateKeyToAccount(privateKey);

            // Guardar datos de la wallet
            const walletData = {
                address: account.address,
                privateKey: privateKey,
                createdAt: Date.now(),
            };

            const saved = await saveUserWallet(agent, userId, walletData);

            if (!saved) {
                callback?.(
                    {
                        text: "Hubo un problema al guardar tu wallet. Por favor inténtalo de nuevo más tarde.",
                    },
                    []
                );
                return false;
            }

            // Crear cliente de wallet para mostrar información
            const walletClient = createWalletClient({
                account,
                chain: mantleSepoliaTestnet,
                transport: http(),
            });

            // Crear mensaje de éxito con la dirección pública
            const successText = [
                `✅ ¡Tu wallet ha sido creada con éxito!`,
                ``,
                `Tu dirección pública es:`,
                `\`${account.address}\``,
                ``,
                `Esta wallet está asociada a tu cuenta de usuario y puede ser utilizada para:`,
                `- Recibir y enviar tokens MNT`,
                `- Recibir y enviar tokens AISHOP`,
                `- Interactuar con aplicaciones en la red Mantle`,
                ``,
                `Tu clave privada está almacenada de forma segura y se utilizará automáticamente cuando necesites realizar transacciones.`,
                ``,
                `Puedes consultar tu balance en cualquier momento escribiendo "ver mi balance" o "check balance".`,
            ].join("\n");

            // Guardar en memoria que se ha creado una wallet
            await agent.documentsManager.createMemory({
                id: generateId(),
                userId: userId,
                agentId: memory.agentId,
                content: {
                    text: `Se ha creado una nueva wallet para el usuario: ${account.address}`,
                    action: "CREATE_WALLET",
                    walletAddress: account.address,
                    createdAt: walletData.createdAt,
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
            console.error("Error al crear wallet:", error);
            callback?.(
                {
                    text: `Error al crear wallet: ${
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
                content: { text: "Quiero crear una wallet" },
            },
            {
                user: "{{agentName}}",
                content: {
                    text: "Creando una nueva wallet para ti...",
                    action: "CREATE_WALLET",
                },
            },
        ],
        [
            {
                user: "{{user1}}",
                content: { text: "Necesito una wallet para usar en Mantle" },
            },
            {
                user: "{{agentName}}",
                content: {
                    text: "Voy a crear una wallet para ti en la red Mantle...",
                    action: "CREATE_WALLET",
                },
            },
        ],
        [
            {
                user: "{{user1}}",
                content: {
                    text: "¿Cómo puedo obtener una wallet para recibir tokens?",
                },
            },
            {
                user: "{{agentName}}",
                content: {
                    text: "Puedo crear una wallet para que puedas recibir tokens...",
                    action: "CREATE_WALLET",
                },
            },
        ],
    ] as ActionExample[][],
};

// Exportar funciones útiles para otras acciones
export { userHasWallet, getUserWallet };

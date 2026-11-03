import "../../lib/Ice.min.js";
import "./ChessService.js";
import { ChessRealtimeObserver } from "./chessRealtimeObserver.js";

/**
 * Servicio de comunicación RPC con ZeroC Ice sobre WebSockets.
 * Encapsula el ciclo de vida del Communicator, el proxy de ChessService
 * y la suscripción en tiempo real mediante ChessRealtimeObserver.
 */

export class ChessClientService {
    constructor() {
        this.Ice = window.Ice;
        this.ChessApp = window.ChessApp;
        this.communicator = null;
        this.service = null;
        this.realtimeObserver = null;
        this.isConnected = false;
        this.nickname = "";
        this.currentRoomCode = null;
        this.role = null;
        this.assignedColor = null;
    }

    validateRuntime() {
        if (!this.Ice || !this.ChessApp) {
            throw new Error("No se pudo cargar el runtime de ZeroC Ice o el contrato ChessService.js.");
        }
    }

    async connect(host, port, nickname) {
        this.validateRuntime();
        if (this.communicator) {
            // Cierra primero el adaptador local para no dejar callbacks ligados a una conexión vieja.
            if (this.realtimeObserver) {
                await this.realtimeObserver.cleanupAdapter();
            }
            await this.communicator.destroy();
        }

        this.communicator = null;
        this.service = null;
        this.realtimeObserver = null;
        this.isConnected = false;
        this.currentRoomCode = null;
        this.role = null;
        this.assignedColor = null;

        const initData = new this.Ice.InitializationData();
        initData.properties = this.Ice.createProperties();
        // Permite estados de partida completos y mantiene vivo el canal WebSocket para callbacks.
        initData.properties.setProperty("Ice.MessageSizeMax", "2048");
        initData.properties.setProperty("Ice.ACM.Client.Timeout", "0");
        initData.properties.setProperty("Ice.ACM.Client.Heartbeat", "3");

        const targetHost = String(host || "127.0.0.1").trim();
        const targetPort = Number(port) || 10002;
        this.nickname = String(nickname || "").trim();

        try {
            this.communicator = this.Ice.initialize(initData);
            // El endpoint ws selecciona WebSocket; checkedCast confirma que el servicio remoto responde.
            const proxyString = `ChessService:ws -h ${targetHost} -p ${targetPort}`;
            const base = this.communicator.stringToProxy(proxyString);
            this.service = await this.ChessApp.ChessServicePrx.checkedCast(base);
            if (!this.service) {
                throw new Error("El proxy ChessService no pudo validarse en el servidor.");
            }

            this.realtimeObserver = new ChessRealtimeObserver(this.Ice, this.ChessApp);
            this.isConnected = true;
        } catch (error) {
            if (this.communicator) {
                await this.communicator.destroy();
            }
            this.communicator = null;
            this.service = null;
            this.realtimeObserver = null;
            throw error;
        }
    }

    async getLobbyData() {
        this.ensureConnected();
        const [rooms, leaderboard] = await Promise.all([
            this.service.getActiveRooms(),
            this.service.getLeaderboard()
        ]);
        return { rooms, leaderboard };
    }

    async createRoom(nickname) {
        this.ensureConnected();
        if (nickname && nickname.trim()) {
            this.nickname = nickname.trim();
        }
        return await this.service.createRoom(this.nickname);
    }

    async joinRoom(roomCode, nickname) {
        this.ensureConnected();
        if (nickname && nickname.trim()) {
            this.nickname = nickname.trim();
        }

        const normalizedCode = String(roomCode || "").trim().toUpperCase();
        // El servidor trata el código normalizado como identidad de sala en las llamadas siguientes.
        const result = await this.service.joinRoom(normalizedCode, this.nickname);
        this.currentRoomCode = normalizedCode;
        this.role = result.role;
        this.assignedColor = result.assignedColor;
        return result;
    }

    async subscribeToRoom(listeners = {}) {
        this.ensureConnected();
        if (!this.currentRoomCode) {
            throw new Error("No hay una sala activa para suscribir el observador.");
        }
        await this.realtimeObserver.subscribe(
            this.communicator,
            this.service,
            this.currentRoomCode,
            this.nickname,
            listeners
        );
    }

    async makeMove(fromRow, fromCol, toRow, toCol) {
        this.ensureConnected();
        if (!this.currentRoomCode) {
            throw new Error("No hay una sala activa para realizar la jugada.");
        }
        // Slice espera objetos Position; no se envían las cuatro coordenadas por separado.
        const fromPos = new this.ChessApp.Position(fromRow, fromCol);
        const toPos = new this.ChessApp.Position(toRow, toCol);
        return await this.service.makeMove(this.currentRoomCode, this.nickname, fromPos, toPos);
    }

    async resign() {
        this.ensureConnected();
        if (!this.currentRoomCode) {
            throw new Error("No hay una sala activa para rendirse.");
        }
        await this.service.resign(this.currentRoomCode, this.nickname);
    }

    async leaveRoom() {
        this.ensureConnected();
        if (!this.currentRoomCode) {
            return;
        }

        const roomCode = this.currentRoomCode;
        try {
            // Desregistra el callback antes de abandonar para que no queden notificaciones huérfanas.
            if (this.realtimeObserver) {
                await this.realtimeObserver.unsubscribe(this.service, roomCode, this.nickname);
            }
            await this.service.leaveRoom(roomCode, this.nickname);
        } finally {
            this.currentRoomCode = null;
            this.role = null;
            this.assignedColor = null;
        }
    }

    ensureConnected() {
        if (!this.isConnected || !this.communicator || !this.service) {
            throw new Error("El cliente no está conectado al servidor ZeroC Ice.");
        }
    }
}

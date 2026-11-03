/**
 * Gestor de actualizaciones en tiempo real para el cliente Web mediante
 * Conexiones Bidireccionales (BiDir) sobre WebSockets en ZeroC Ice.
 * Implementa el servant ChessObserver en el navegador sin usar polling.
 */

export class ChessRealtimeObserver {
    constructor(Ice, ChessApp) {
        this.Ice = Ice;
        this.ChessApp = ChessApp;
        this.adapter = null;
        this.identity = null;
        this.onStateChangedCallback = null;
        this.onGameFinishedCallback = null;
    }

    /**
     * Crea el servant de ChessObserver, configura el ObjectAdapter bidireccional
     * sobre la conexión WebSocket activa y registra el observador en la sala.
     */
    async subscribe(communicator, servicePrx, roomCode, nickname, { onStateChanged, onGameFinished } = {}) {
        await this.cleanupAdapter();
        this.onStateChangedCallback = onStateChanged;
        this.onGameFinishedCallback = onGameFinished;

        // El servant del navegador implementa la interfaz Slice y reenvía eventos a la vista.
        class WebChessObserverServant extends this.ChessApp.ChessObserver {
            onGameStateChanged(newState, _current) {
                if (typeof this.onStateChangedCallback === "function") {
                    this.onStateChangedCallback(newState);
                }
            }

            onGameFinished(finalState, winnerNickname, pointsDelta, _current) {
                if (typeof this.onGameFinishedCallback === "function") {
                    this.onGameFinishedCallback(finalState, winnerNickname, pointsDelta);
                }
            }
        }

        const servant = new WebChessObserverServant();
        servant.onStateChangedCallback = this.onStateChangedCallback;
        servant.onGameFinishedCallback = this.onGameFinishedCallback;

        // Un adaptador sin endpoints solo puede recibir llamadas usando una conexión ya abierta.
        this.adapter = communicator.createObjectAdapter("");
        this.identity = new this.Ice.Identity(this.Ice.generateUUID(), "ChessObserver");
        const baseProxy = this.adapter.add(servant, this.identity);
        this.adapter.activate();

        try {
            const connection = await servicePrx.ice_getConnection();
            connection.setAdapter(this.adapter);
            // Se fija el proxy a la conexión entrante para que el servidor pueda llamar al navegador.
            const observerPrx = this.ChessApp.ChessObserverPrx.uncheckedCast(baseProxy);
            await servicePrx.registerObserver(roomCode, nickname, observerPrx);
        } catch (error) {
            await this.cleanupAdapter();
            throw error;
        }
    }

    /**
     * Desvincula el observador de la sala en el servidor y limpia el adaptador local.
     */
    async unsubscribe(servicePrx, roomCode, nickname) {
        this.onStateChangedCallback = null;
        this.onGameFinishedCallback = null;
        try {
            await servicePrx.unregisterObserver(roomCode, nickname);
        } finally {
            await this.cleanupAdapter();
        }
    }

    async cleanupAdapter() {
        const adapter = this.adapter;
        const identity = this.identity;
        // Desacopla el estado antes de destruir el adaptador para permitir limpieza segura/repetida.
        this.adapter = null;
        this.identity = null;
        if (adapter) {
            try {
                if (identity) {
                    adapter.remove(identity);
                }
            } finally {
                await adapter.destroy();
            }
        }
    }
}

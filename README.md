
# Ajedrez Distribuido con ZeroC Ice (JavaFX & Vanilla JavaScript)

Proyecto distribuido de ajedrez cliente-servidor desarrollado para el curso **Computación en Internet I (09776 - TIC)** de la **Universidad Icesi**.

Implementa dos clientes completos e interoperables que consumen el mismo servicio RPC de ZeroC Ice:
1. **Cliente de Escritorio en JavaFX** (Comunicación nativa TCP en puerto `10000`).
2. **Cliente Web en JavaScript Vainilla Componetizado** (Comunicación WebSocket en puerto `10002` con la librería oficial `ice`).

---

## Características Principales

1. **Invitación a Partidas por Código de Sala (`Room Code`):**
   - Un jugador crea una sala y el servidor genera un código alfanumérico único (ej. `R-8K2NX`).
   - Los rivales y observadores pueden unirse ingresando el código desde JavaFX o la Web, o seleccionando la sala en el listado de salas activas.

2. **Roles Dinámicos (Blancas, Negras y Espectadores):**
   - **Primer participante:** Asignado automáticamente al rol **Blancas** (`ROLEWHITE`).
   - **Segundo participante:** Asignado automáticamente al rol **Negras** (`ROLEBLACK`), iniciando la partida.
   - **Tercero en adelante:** Asignados automáticamente al rol **Espectador** (`ROLESPECTATOR`) en tiempo real. Los espectadores ven el tablero actualizarse en vivo con un badge distintivo morado, sin permiso de mover piezas.

3. **Sistema de Clasificación y Tiers por Puntos:**
   - Cada jugador inicia con **1200 puntos**.
   - **Victoria:** `+30 puntos`.
   - **Derrota:** `-20 puntos` (límite inferior en 0).
   - **Tablas:** `+5 puntos`.
   - **Escalafón de Tiers:**
     - **Bronce:** 0 – 1199 pts
     - **Plata:** 1200 – 1499 pts
     - **Oro:** 1500 – 1799 pts
     - **Platino:** 1800 – 2099 pts
     - **Diamante:** 2100+ pts
   - Tabla global de clasificación persistente y badge en tiempo real durante la partida.

4. **Motor de Reglas de Ajedrez Completo:**
   - Movimiento de Peones (1 o 2 pasos iniciales, capturas diagonales, coronación automática a Dama).
   - Movimiento de Caballos (saltos en 'L').
   - Alfiles, Torres y Damas (rayos direccionales sin atravesar piezas).
   - Rey (1 casilla en cualquier dirección).
   - Validación estricta de turno y seguridad del Rey (no se permiten movimientos que dejen o expongan al Rey en jaque).
   - Detección automática de **Jaque**, **Jaque Mate** y **Tablas por Ahogado** (Stalemate).
   - Opción de **Rendición** (*Resign*) con asignación de victoria al rival.

5. **Frontends Interoperables:**
   - **JavaFX:** Aplicación gráfica de escritorio con tablero 8x8 y notación clásica.
   - **JavaScript Vainilla (Web):** Single Page Application componetizada sin frameworks externos, manipulando el DOM desde módulos ES (`src/app.js`, `src/components/`, `src/services/`) sobre un único contenedor `#root`.

---

## Arquitectura del Proyecto

```text
codigo_base/
├── build.gradle          # Script raíz con configuración de compilación y tareas runServer/runClient/runClientJs
├── settings.gradle       # Inclusión de subproyectos (common, server, client)
├── common/               # Definiciones Slice (.ice) y modelos compartidos
│   ├── src/main/slice/ChessService.ice
│   └── src/main/java/co/icesi/chess/model/ (ChessRules, TierManager)
├── server/               # Servidor ZeroC Ice multi-protocolo (TCP 10000 + WebSocket 10002)
│   ├── src/main/java/co/icesi/chess/server/ (ChessServerApp, ChessServiceImpl)
│   └── src/main/java/co/icesi/chess/server/model/ (GameRoom, RoomManager)
├── client/               # Cliente JavaFX de escritorio (TCP 10000)
│   └── src/main/java/co/icesi/chess/client/ (ChessClientApp, ChessClientLauncher, ChessBoardControl, etc.)
└── client-js/            # Cliente Web en JavaScript Vainilla Componetizado (WebSocket 10002)
    ├── package.json      # Dependencia "ice": "^3.7.110"
    ├── index.html        # Punto de montaje único (<div id="root"></div>)
    ├── styles.css        # Estilos de la aplicación
    └── src/
        ├── app.js        # Controlador principal y montaje en #root
        ├── components/   # Componentes DOM (Header, LobbyView, GameView, ChessBoard, PlayerCard, MoveHistory, TierBadge)
        └── services/     # Servicios Ice/reglas; ChessService.js se genera aquí con slice2js
```

---

## Instrucciones de Ejecución

### 1. Iniciar el Servidor ZeroC Ice
```bash
./gradlew runServer
```
*El servidor escuchará simultáneamente en TCP `10000` (JavaFX) y WebSocket `10002` (JavaScript).*

### 2. Opción A: Iniciar Clientes JavaFX
```bash
# Jugador 1 (Blancas)
./gradlew runClient

# Jugador 2 (Negras) o Espectador
./gradlew runClient
```

### 3. Opción B: Iniciar Cliente Web en JavaScript Vainilla
```bash
# Desde la raíz o en una nueva terminal:
cd client-js
npm install
npm start
```
Abre en tu navegador: `http://localhost:3000`

---

## Pruebas Automatizadas
```bash
./gradlew test
```
Verifica el motor autoritativo de ajedrez y la concurrencia distribuida de salas, espectadores y tiers.

---

## Guía del Taller Académico
El enunciado oficial y los criterios de evaluación detallados se encuentran disponibles en:
- [Guía del Taller en PDF](docs/Taller_Ajedrez_Ice_JavaFX.pdf)


## Respuestas al cuestionario del PDF

1. Conexiones bidireccionales (BiDir) vs. callbacks tradicionales

Un navegador web no puede abrir un puerto para escuchar conexiones, así que el servidor no tiene forma de conectarse al cliente para notificarle eventos (por ejemplo, “el rival movió”). Por eso el cliente crea un ObjectAdapter sin endpoints con createObjectAdapter(""): este adaptador no escucha en ningún puerto, solo registra el objeto que va a recibir las llamadas. Luego se asocia a la conexión que ya existe con servicePrx.ice_getConnection(), de modo que el servidor pueda invocar al cliente por la misma conexión que el cliente abrió.

En el servidor, observer.ice_fixed(current.con) crea un proxy atado a esa conexión (current.con). Así, cuando el servidor llama al observer, Ice envía la invocación por esa conexión y no intenta abrir una nueva hacia el cliente, que no sería posible.

En los callbacks tradicionales el cliente debe tener un endpoint accesible. En BiDir no hace falta, y por eso funciona en navegadores.

2. Transporte TCP vs. WebSockets en ZeroC Ice

En Ice la lógica del servicio (el servant) está separada del transporte. ChessServiceImpl no sabe por cuál protocolo llegó la petición. Lo que se hace es configurar un solo ObjectAdapter con dos endpoints:

Los clientes JavaFX entran por TCP (10000) y los clientes JavaScript por WebSockets (10002), porque el navegador no permite sockets TCP crudos. Ambos endpoints están en el mismo adaptador, que tiene una única instancia de ChessServiceImpl, y Ice despacha todas las peticiones al mismo servant. Así no se duplica la lógica de negocio.

3. Empaquetado del contrato con slice2js

slice2js compila el archivo .ice y genera ChessService.js, que contiene en JavaScript los tipos, proxies y operaciones definidos en el contrato. Este archivo registra el espacio de nombres ChessApp en el navegador (a partir del module ChessApp de Slice) y cuelga de él las clases y proxies, por ejemplo ChessApp.ChessServicePrx.

Se debe importar primero Ice.min.js porque ChessService.js depende del runtime de Ice (Ice.Value, Ice.ObjectPrx, etc.). Si se carga antes, esos objetos no existen todavía y aparece el error Ice is not defined.

4. Validación autoritativa en GameRoom.makeMove

Las casillas candidatas que calcula chessRulesHelper.js son solo una ayuda visual para el usuario. El código JavaScript corre en el navegador, donde el usuario puede modificarlo o enviar peticiones directas al servidor con jugadas ilegales (trampas). Por eso el servidor no puede confiar en el cliente.

Además, el servidor es quien guarda el estado real de la partida, y en makeMove verifica que sea el turno del jugador, que la pieza le pertenezca y que el movimiento cumpla las reglas. Esto garantiza que todos los clientes (JavaFX y JavaScript) vean el mismo estado y las mismas reglas.

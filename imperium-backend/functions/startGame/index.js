/**
 * startGame — Host starts the game.
 *
 * Client sends:
 *   { "action": "startGame" }
 *
 * Server broadcasts to all:
 *   { "action": "gameStarted", "game": { ... } }
 */
const {
  getGame,
  saveGame,
  getConnection,
  sendToConnection,
  broadcastToAll,
  publicGameView,
  ok,
  error,
} = require('/opt/nodejs/db');
const { startGame } = require('/opt/nodejs/gameEngine');

exports.handler = async (event) => {
  const connectionId = event.requestContext.connectionId;

  try {
    const conn = await getConnection(connectionId);
    if (!conn?.gameId) {
      await sendToConnection(connectionId, { action: 'error', message: 'No estás en ninguna sala' });
      return error(400, 'No game found for connection');
    }

    const game = await getGame(conn.gameId);
    if (!game) {
      await sendToConnection(connectionId, { action: 'error', message: 'Sala no encontrada' });
      return error(404, 'Game not found');
    }

    const updatedGame = startGame(game, connectionId);
    await saveGame(updatedGame);

    await broadcastToAll(updatedGame, {
      action: 'gameStarted',
      game: publicGameView(updatedGame),
    });

    console.log(`Game started: ${conn.gameId}`);
    return ok();
  } catch (err) {
    console.error('startGame error:', err.message);
    await sendToConnection(connectionId, { action: 'error', message: err.message });
    return error(400, err.message);
  }
};

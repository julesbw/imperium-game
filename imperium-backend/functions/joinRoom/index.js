/**
 * joinRoom — A player joins an existing room by code.
 *
 * Client sends:
 *   { "action": "joinRoom", "gameId": "ABC123", "playerName": "Ana" }
 *
 * Server broadcasts to all players in room:
 *   { "action": "playerJoined", "game": { ... } }
 */
const {
  getGame,
  saveGame,
  saveConnection,
  sendToConnection,
  broadcastToAll,
  publicGameView,
  ok,
  error,
} = require('/opt/nodejs/db');
const { addPlayerToGame } = require('/opt/nodejs/gameEngine');

exports.handler = async (event) => {
  const connectionId = event.requestContext.connectionId;
  const body = JSON.parse(event.body || '{}');
  const gameId     = (body.gameId || '').toUpperCase().trim();
  const playerName = (body.playerName || 'Jugador').trim().slice(0, 20);

  if (!gameId) {
    await sendToConnection(connectionId, { action: 'error', message: 'gameId requerido' });
    return error(400, 'gameId requerido');
  }

  try {
    const game = await getGame(gameId);
    if (!game) {
      await sendToConnection(connectionId, { action: 'error', message: `Sala "${gameId}" no encontrada` });
      return error(404, 'Sala no encontrada');
    }

    const updatedGame = addPlayerToGame(game, connectionId, playerName);
    await saveGame(updatedGame);
    await saveConnection(connectionId, { gameId, playerName });

    // Tell everyone (including the new player) the updated state
    await broadcastToAll(updatedGame, {
      action: 'playerJoined',
      playerName,
      game: publicGameView(updatedGame),
    });

    console.log(`${playerName} joined room ${gameId}`);
    return ok();
  } catch (err) {
    console.error('joinRoom error:', err.message);
    await sendToConnection(connectionId, { action: 'error', message: err.message });
    return error(400, err.message);
  }
};

/**
 * getGame — Fetch current game state (used for reconnection/resume).
 *
 * Client sends:
 *   { "action": "getGame", "gameId": "ABC123" }
 *
 * Server responds to requester only:
 *   { "action": "gameState", "game": { ... } }
 */
const {
  getGame,
  getConnection,
  saveConnection,
  sendToConnection,
  broadcastToAll,
  publicGameView,
  ok,
  error,
} = require('/opt/nodejs/db');

exports.handler = async (event) => {
  const connectionId = event.requestContext.connectionId;
  const body = JSON.parse(event.body || '{}');

  // Support fetching by explicit gameId (reconnect flow) or from stored connection
  let gameId = body.gameId?.toUpperCase().trim();

  if (!gameId) {
    const conn = await getConnection(connectionId);
    gameId = conn?.gameId;
  }

  if (!gameId) {
    await sendToConnection(connectionId, { action: 'error', message: 'gameId requerido' });
    return error(400, 'gameId required');
  }

  try {
    const game = await getGame(gameId);
    if (!game) {
      await sendToConnection(connectionId, { action: 'error', message: `Sala "${gameId}" no encontrada` });
      return error(404, 'Game not found');
    }

    // Reconnect: update connectionId for the matching player name (if provided)
    const playerName = body.playerName?.trim();
    if (playerName) {
      const player = game.players.find((p) => p.name === playerName);
      if (player && player.connectionId !== connectionId) {
        // Reassign the player's connection to the new socket
        player.connectionId = connectionId;
        if (game.hostConnectionId === player.connectionId) {
          game.hostConnectionId = connectionId;
        }

        const { saveGame } = require('/opt/nodejs/db');
        await saveGame(game);
        await saveConnection(connectionId, { gameId, playerName });

        // Notify others that player reconnected
        await broadcastToAll(game, {
          action: 'playerReconnected',
          playerName,
          game: publicGameView(game),
        });

        console.log(`${playerName} reconnected to ${gameId}`);
      }
    }

    await sendToConnection(connectionId, {
      action: 'gameState',
      game: publicGameView(game),
    });

    return ok();
  } catch (err) {
    console.error('getGame error:', err.message);
    await sendToConnection(connectionId, { action: 'error', message: err.message });
    return error(500, err.message);
  }
};

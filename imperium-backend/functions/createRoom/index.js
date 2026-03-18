/**
 * createRoom — Host creates a new game room.
 *
 * Client sends:
 *   { "action": "createRoom", "playerName": "Pedro" }
 *
 * Server responds to host:
 *   { "action": "roomCreated", "gameId": "ABC123", "game": { ... } }
 */
const {
  saveGame,
  saveConnection,
  sendToConnection,
  publicGameView,
  ok,
  error,
} = require('/opt/nodejs/db');
const { createNewGame } = require('/opt/nodejs/gameEngine');

// Generate a short human-readable room code
function generateRoomCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no ambiguous chars
  return Array.from({ length: 6 }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
}

exports.handler = async (event) => {
  const connectionId = event.requestContext.connectionId;
  const body = JSON.parse(event.body || '{}');
  const playerName = (body.playerName || 'Jugador 1').trim().slice(0, 20);

  try {
    const gameId = generateRoomCode();
    const game = createNewGame(gameId, connectionId, playerName);

    // Save game and link connection → game
    await saveGame(game);
    await saveConnection(connectionId, { gameId, playerName });

    await sendToConnection(connectionId, {
      action: 'roomCreated',
      gameId,
      game: publicGameView(game),
    });

    console.log(`Room created: ${gameId} by ${playerName} [${connectionId}]`);
    return ok();
  } catch (err) {
    console.error('createRoom error:', err.message);
    await sendToConnection(connectionId, { action: 'error', message: err.message });
    return error(500, err.message);
  }
};

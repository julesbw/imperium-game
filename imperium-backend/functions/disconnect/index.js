/**
 * $disconnect — Fired when a client closes the WebSocket connection.
 * Removes the connection record and notifies other players in the same room.
 */
const {
  getConnection,
  deleteConnection,
  getGame,
  saveGame,
  broadcastToAll,
  ok,
} = require('/opt/nodejs/db');

exports.handler = async (event) => {
  const connectionId = event.requestContext.connectionId;
  console.log('DISCONNECT:', connectionId);

  try {
    const conn = await getConnection(connectionId);

    if (conn?.gameId) {
      const game = await getGame(conn.gameId);
      if (game) {
        const player = game.players.find((p) => p.connectionId === connectionId);

        if (player) {
          // Notify remaining players
          await broadcastToAll(game, {
            action: 'playerDisconnected',
            playerName: player.name,
            playerAvatar: player.avatar,
          });

          // If game is in LOBBY, remove player from list
          if (game.status === 'LOBBY') {
            game.players = game.players.filter((p) => p.connectionId !== connectionId);
            // Re-index
            game.players.forEach((p, i) => { p.index = i; });
            // Transfer host if needed
            if (game.hostConnectionId === connectionId && game.players.length > 0) {
              game.hostConnectionId = game.players[0].connectionId;
            }
            await saveGame(game);
          }
          // During active game we keep the player slot; they could reconnect
        }
      }
    }
  } catch (err) {
    console.error('Disconnect cleanup error:', err.message);
    // Don't throw — always return 200 for $disconnect
  }

  await deleteConnection(connectionId);
  return ok();
};

/**
 * playCard — Current player chooses an option on the active card.
 *
 * Client sends:
 *   { "action": "playCard", "optionIndex": 0 }  // 0 = left, 1 = right
 *
 * Server broadcasts to ALL players:
 *   { "action": "gameUpdated", "game": { ... } }
 *
 * If game over:
 *   { "action": "gameOver", "game": { ... } }
 *
 * If events triggered, they are included in game.pendingEvents
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
const { processPlay } = require('/opt/nodejs/gameEngine');

exports.handler = async (event) => {
  const connectionId = event.requestContext.connectionId;
  const body = JSON.parse(event.body || '{}');
  const optionIndex = body.optionIndex;

  if (optionIndex === undefined || optionIndex === null) {
    await sendToConnection(connectionId, { action: 'error', message: 'optionIndex requerido (0 o 1)' });
    return error(400, 'optionIndex required');
  }

  try {
    const conn = await getConnection(connectionId);
    if (!conn?.gameId) {
      await sendToConnection(connectionId, { action: 'error', message: 'No estás en ninguna sala' });
      return error(400, 'No game found for connection');
    }

    const game = await getGame(conn.gameId);
    if (!game) {
      await sendToConnection(connectionId, { action: 'error', message: 'Partida no encontrada' });
      return error(404, 'Game not found');
    }

    const updatedGame = processPlay(game, connectionId, Number(optionIndex));
    await saveGame(updatedGame);

    const isGameOver = updatedGame.status === 'FINISHED';
    const action = isGameOver ? 'gameOver' : 'gameUpdated';

    await broadcastToAll(updatedGame, {
      action,
      game: publicGameView(updatedGame),
    });

    console.log(
      `Turn ${updatedGame.turn - 1} played in ${conn.gameId}` +
      (isGameOver ? ' — GAME OVER' : '')
    );
    return ok();
  } catch (err) {
    console.error('playCard error:', err.message);
    await sendToConnection(connectionId, { action: 'error', message: err.message });
    return error(400, err.message);
  }
};

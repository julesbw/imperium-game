/**
 * IMPERIUM — DB & WebSocket Helpers (Shared Layer)
 */

const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
const {
  DynamoDBDocumentClient,
  GetCommand,
  PutCommand,
  UpdateCommand,
  DeleteCommand,
} = require('@aws-sdk/lib-dynamodb');
const {
  ApiGatewayManagementApiClient,
  PostToConnectionCommand,
} = require('@aws-sdk/client-apigatewaymanagementapi');

// ─── DynamoDB ─────────────────────────────────────────────────────────────────

const dynamo = DynamoDBDocumentClient.from(new DynamoDBClient({}));

const GAMES_TABLE       = process.env.GAMES_TABLE;
const CONNECTIONS_TABLE = process.env.CONNECTIONS_TABLE;

async function getGame(gameId) {
  const res = await dynamo.send(new GetCommand({
    TableName: GAMES_TABLE,
    Key: { gameId },
  }));
  return res.Item || null;
}

async function saveGame(game) {
  await dynamo.send(new PutCommand({
    TableName: GAMES_TABLE,
    Item: game,
  }));
  return game;
}

async function getConnection(connectionId) {
  const res = await dynamo.send(new GetCommand({
    TableName: CONNECTIONS_TABLE,
    Key: { connectionId },
  }));
  return res.Item || null;
}

async function saveConnection(connectionId, data = {}) {
  const ttl = Math.floor(Date.now() / 1000) + 86400; // 24h
  await dynamo.send(new PutCommand({
    TableName: CONNECTIONS_TABLE,
    Item: { connectionId, ...data, ttl },
  }));
}

async function deleteConnection(connectionId) {
  await dynamo.send(new DeleteCommand({
    TableName: CONNECTIONS_TABLE,
    Key: { connectionId },
  }));
}

// ─── WebSocket ────────────────────────────────────────────────────────────────

function getApiClient() {
  return new ApiGatewayManagementApiClient({
    endpoint: process.env.WEBSOCKET_ENDPOINT,
  });
}

async function sendToConnection(connectionId, data) {
  const client = getApiClient();
  try {
    await client.send(new PostToConnectionCommand({
      ConnectionId: connectionId,
      Data: Buffer.from(JSON.stringify(data)),
    }));
  } catch (err) {
    // Connection gone — clean up stale connection
    if (err.$metadata?.httpStatusCode === 410) {
      await deleteConnection(connectionId).catch(() => {});
    } else {
      console.error(`sendToConnection error [${connectionId}]:`, err.message);
    }
  }
}

async function broadcastToGame(game, message, excludeConnectionId = null) {
  const promises = game.players
    .filter((p) => p.connectionId !== excludeConnectionId)
    .map((p) => sendToConnection(p.connectionId, message));
  await Promise.allSettled(promises);
}

async function broadcastToAll(game, message) {
  const promises = game.players.map((p) =>
    sendToConnection(p.connectionId, message)
  );
  await Promise.allSettled(promises);
}

// ─── Response Helpers ─────────────────────────────────────────────────────────

function ok(body = {}) {
  return { statusCode: 200, body: JSON.stringify(body) };
}

function error(statusCode, message) {
  return { statusCode, body: JSON.stringify({ error: message }) };
}

// Strips sensitive data (connection IDs) before sending game state to clients
function publicGameView(game) {
  return {
    gameId:               game.gameId,
    status:               game.status,
    players:              game.players.map(({ connectionId, ...rest }) => rest),
    states:               game.states,
    currentCard:          game.deck?.[game.currentCardIndex] || null,
    currentPlayerIndex:   game.currentPlayerIndex,
    turn:                 game.turn,
    log:                  game.log,
    pendingEvents:        game.pendingEvents || [],
    gameOver:             game.gameOver || null,
  };
}

module.exports = {
  getGame,
  saveGame,
  getConnection,
  saveConnection,
  deleteConnection,
  sendToConnection,
  broadcastToGame,
  broadcastToAll,
  ok,
  error,
  publicGameView,
};

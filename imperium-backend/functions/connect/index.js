/**
 * $connect — Fired when a client opens a WebSocket connection.
 * Stores the connectionId in DynamoDB for later reference.
 */
const { saveConnection, ok } = require('/opt/nodejs/db');

exports.handler = async (event) => {
  const connectionId = event.requestContext.connectionId;
  console.log('CONNECT:', connectionId);

  await saveConnection(connectionId, {
    connectedAt: new Date().toISOString(),
  });

  return ok();
};

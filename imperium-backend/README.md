# ⚜️ IMPERIUM — Backend AWS SAM

Multiplayer card game: API Gateway WebSocket + Lambda + DynamoDB

## Architecture

```
Client (React)  ──wss://──►  API Gateway WebSocket
                                  │
  $connect    → ConnectFunction    → ConnectionsTable
  $disconnect → DisconnectFunction → ConnectionsTable + GamesTable
  createRoom  → CreateRoomFunction → GamesTable
  joinRoom    → JoinRoomFunction   → GamesTable
  startGame   → StartGameFunction  → GamesTable
  playCard    → PlayCardFunction   → GamesTable  ← core logic
  getGame     → GetGameFunction    → GamesTable  (reconnect)
```

## Prerequisites

```bash
brew install aws/tap/aws-sam-cli
aws configure   # set key, secret, region
```

## Deploy

```bash
sam build
sam deploy --guided
# Stack: imperium-backend | Region: us-east-1 | Stage: dev

# Get your WebSocket URL:
aws cloudformation describe-stacks \
  --stack-name imperium-backend \
  --query "Stacks[0].Outputs[?OutputKey=='WebSocketURL'].OutputValue" \
  --output text
```

## Connect Frontend

Paste the URL into `useImperiumSocket.js`:
```js
const DEFAULT_WS_URL = 'wss://YOUR_ID.execute-api.us-east-1.amazonaws.com/dev';
```

Then use the hook:
```jsx
const { connected, gameState, isMyTurn, actions } = useImperiumSocket();

actions.createRoom('Pedro');          // host
actions.joinRoom('ABC123', 'Ana');    // player
actions.startGame();                  // host starts
actions.playCard(0);                  // 0=left option, 1=right
actions.getGame('ABC123', 'Pedro');   // reconnect
```

## WebSocket Protocol

### Client → Server
| action       | payload                        |
|--------------|--------------------------------|
| createRoom   | `{ playerName }`               |
| joinRoom     | `{ gameId, playerName }`       |
| startGame    | `{}`                           |
| playCard     | `{ optionIndex: 0 \| 1 }`     |
| getGame      | `{ gameId?, playerName? }`     |

### Server → Client
| action             | when                            |
|--------------------|---------------------------------|
| roomCreated        | Room created (host only)        |
| playerJoined       | New player joined lobby         |
| playerDisconnected | Player left                     |
| gameStarted        | Game started                    |
| gameUpdated        | Card played, state changed      |
| gameOver           | Game ended                      |
| gameState          | Response to getGame (reconnect) |
| error              | Something went wrong            |

All messages include a `game` object with: status, players, states, currentCard, currentPlayerIndex, turn, log, pendingEvents, gameOver.

## Local Development

```bash
docker run -p 8000:8000 amazon/dynamodb-local
sam local start-api

# Test WebSocket
npm i -g wscat
wscat -c ws://localhost:3001
> {"action":"createRoom","playerName":"Pedro"}
```

## Teardown
```bash
sam delete --stack-name imperium-backend
```

## Cost (~$0 on free tier)
- Lambda: 1M req/month free
- API Gateway WS: 1M messages/month free  
- DynamoDB: 25GB + 200M req/month free

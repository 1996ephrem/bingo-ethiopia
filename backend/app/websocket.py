"""WebSocket manager for real-time game updates."""
from fastapi import WebSocket
from typing import Dict, List
import json


class ConnectionManager:
    def __init__(self):
        # game_id -> list of websockets
        self.rooms: Dict[int, List[WebSocket]] = {}

    async def connect(self, websocket: WebSocket, game_id: int):
        await websocket.accept()
        self.rooms.setdefault(game_id, []).append(websocket)

    def disconnect(self, websocket: WebSocket, game_id: int):
        if game_id in self.rooms:
            self.rooms[game_id] = [ws for ws in self.rooms[game_id] if ws != websocket]

    async def broadcast(self, game_id: int, message: dict):
        """Send a message to all players in a game room."""
        dead = []
        for ws in self.rooms.get(game_id, []):
            try:
                await ws.send_text(json.dumps(message))
            except Exception:
                dead.append(ws)
        for ws in dead:
            self.disconnect(ws, game_id)

    async def send_personal(self, websocket: WebSocket, message: dict):
        await websocket.send_text(json.dumps(message))


manager = ConnectionManager()

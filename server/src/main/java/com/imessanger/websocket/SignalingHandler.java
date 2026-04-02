package com.imessanger.websocket;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Component;
import org.springframework.web.socket.CloseStatus;
import org.springframework.web.socket.TextMessage;
import org.springframework.web.socket.WebSocketSession;
import org.springframework.web.socket.handler.TextWebSocketHandler;

import java.io.IOException;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;

/**
 * Handles WebRTC signaling messages between peers in a room.
 *
 * Message format (JSON):
 * {
 *   "type":   "join" | "offer" | "answer" | "ice-candidate" | "leave",
 *   "roomId": "<room identifier>",
 *   "payload": { ... }   // SDP or ICE candidate data
 * }
 */
@Component
public class SignalingHandler extends TextWebSocketHandler {

    private static final Logger log = LoggerFactory.getLogger(SignalingHandler.class);

    private final ObjectMapper objectMapper = new ObjectMapper();

    // roomId → list of sessions in that room (max 2 for 1-on-1 call)
    private final Map<String, List<WebSocketSession>> rooms = new ConcurrentHashMap<>();

    // sessionId → roomId (for cleanup on disconnect)
    private final Map<String, String> sessionRoomMap = new ConcurrentHashMap<>();

    @Override
    public void afterConnectionEstablished(WebSocketSession session) {
        log.info("New connection: sessionId={}", session.getId());
    }

    @Override
    protected void handleTextMessage(WebSocketSession session, TextMessage message) throws Exception {
        JsonNode node = objectMapper.readTree(message.getPayload());
        String type   = node.path("type").asText();
        String roomId = node.path("roomId").asText();

        log.debug("Message received: type={}, roomId={}, sessionId={}", type, roomId, session.getId());

        switch (type) {
            case "join"          -> handleJoin(session, roomId);
            case "offer"         -> relay(session, roomId, node);
            case "answer"        -> relay(session, roomId, node);
            case "ice-candidate" -> relay(session, roomId, node);
            case "leave"         -> handleLeave(session, roomId);
            default              -> log.warn("Unknown message type: {}", type);
        }
    }

    @Override
    public void afterConnectionClosed(WebSocketSession session, CloseStatus status) {
        String roomId = sessionRoomMap.remove(session.getId());
        if (roomId != null) {
            removeFromRoom(session, roomId);
            notifyPeer(session, roomId, "peer-left");
        }
        log.info("Connection closed: sessionId={}, status={}", session.getId(), status);
    }

    @Override
    public void handleTransportError(WebSocketSession session, Throwable exception) {
        log.error("Transport error for session {}: {}", session.getId(), exception.getMessage());
    }

    // -------------------------------------------------------------------------
    // Private helpers
    // -------------------------------------------------------------------------

    private void handleJoin(WebSocketSession session, String roomId) throws IOException {
        List<WebSocketSession> room = rooms.computeIfAbsent(roomId, k -> new ArrayList<>());

        if (room.size() >= 2) {
            // Room is full — reject
            sendMessage(session, buildMessage("room-full", roomId, null));
            log.warn("Room {} is full. Rejected session {}", roomId, session.getId());
            return;
        }

        room.add(session);
        sessionRoomMap.put(session.getId(), roomId);

        if (room.size() == 1) {
            // First peer — wait for second
            sendMessage(session, buildMessage("waiting", roomId, null));
            log.info("Session {} joined room {} (waiting)", session.getId(), roomId);
        } else {
            // Second peer — tell the first peer to start the offer
            sendMessage(session, buildMessage("ready", roomId, null));
            WebSocketSession firstPeer = room.get(0);
            sendMessage(firstPeer, buildMessage("ready", roomId, null));
            log.info("Session {} joined room {} (call starting)", session.getId(), roomId);
        }
    }

    private void relay(WebSocketSession sender, String roomId, JsonNode node) throws IOException {
        List<WebSocketSession> room = rooms.get(roomId);
        if (room == null) return;

        for (WebSocketSession peer : room) {
            if (!peer.getId().equals(sender.getId()) && peer.isOpen()) {
                sendMessage(peer, node.toString());
            }
        }
    }

    private void handleLeave(WebSocketSession session, String roomId) {
        removeFromRoom(session, roomId);
        sessionRoomMap.remove(session.getId());
        notifyPeer(session, roomId, "peer-left");
        log.info("Session {} left room {}", session.getId(), roomId);
    }

    private void removeFromRoom(WebSocketSession session, String roomId) {
        List<WebSocketSession> room = rooms.get(roomId);
        if (room != null) {
            room.remove(session);
            if (room.isEmpty()) {
                rooms.remove(roomId);
            }
        }
    }

    private void notifyPeer(WebSocketSession leaving, String roomId, String messageType) {
        List<WebSocketSession> room = rooms.get(roomId);
        if (room == null) return;
        for (WebSocketSession peer : room) {
            if (!peer.getId().equals(leaving.getId()) && peer.isOpen()) {
                try {
                    sendMessage(peer, buildMessage(messageType, roomId, null));
                } catch (IOException e) {
                    log.error("Failed to notify peer: {}", e.getMessage());
                }
            }
        }
    }

    private void sendMessage(WebSocketSession session, String json) throws IOException {
        if (session.isOpen()) {
            synchronized (session) {
                session.sendMessage(new TextMessage(json));
            }
        }
    }

    private String buildMessage(String type, String roomId, ObjectNode payload) throws IOException {
        ObjectNode msg = objectMapper.createObjectNode();
        msg.put("type", type);
        msg.put("roomId", roomId);
        if (payload != null) {
            msg.set("payload", payload);
        }
        return objectMapper.writeValueAsString(msg);
    }
}

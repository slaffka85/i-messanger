package com.imessanger.websocket;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ArrayNode;
import com.fasterxml.jackson.databind.node.ObjectNode;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Component;
import org.springframework.web.socket.CloseStatus;
import org.springframework.web.socket.TextMessage;
import org.springframework.web.socket.WebSocketSession;
import org.springframework.web.socket.handler.TextWebSocketHandler;

import java.io.IOException;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;

@Component
public class SignalingHandler extends TextWebSocketHandler {

    private static final Logger log = LoggerFactory.getLogger(SignalingHandler.class);
    private final ObjectMapper objectMapper = new ObjectMapper();

    // clientId -> WebSocketSession
    private final Map<String, WebSocketSession> onlineClients = new ConcurrentHashMap<>();

    // sessionId -> clientId
    private final Map<String, String> sessionClientMap = new ConcurrentHashMap<>();

    @Override
    public void afterConnectionEstablished(WebSocketSession session) throws Exception {
        log.info("New connection: sessionId={}", session.getId());
    }

    @Override
    protected void handleTextMessage(WebSocketSession session, TextMessage message) throws Exception {
        try {
            JsonNode node = objectMapper.readTree(message.getPayload());
            String type = node.path("type").asText();

            log.debug("Message received: type={}, sessionId={}", type, session.getId());

            switch (type) {
                case "identify" -> handleIdentify(session, node.path("clientId").asText());
                case "call" -> handleCallInit(session, node.path("targetId").asText());
                case "offer", "answer", "ice-candidate", "call-accepted", "call-declined" -> relayToTarget(session, node);
                case "leave" -> relayToTarget(session, node);
                default -> log.warn("Unknown message type: {}", type);
            }
        } catch (Exception e) {
            log.error("Error handling message: {}", e.getMessage(), e);
        }
    }

    @Override
    public void afterConnectionClosed(WebSocketSession session, CloseStatus status) throws Exception {
        handleLeave(session);
        log.info("Connection closed: sessionId={}, status={}", session.getId(), status);
    }

    private void handleIdentify(WebSocketSession session, String clientId) throws IOException {
        if (clientId == null || clientId.isBlank()) return;

        onlineClients.put(clientId, session);
        sessionClientMap.put(session.getId(), clientId);
        log.info("Client identified: clientId={}, sessionId={}", clientId, session.getId());

        broadcastClientList();
    }

    private void handleCallInit(WebSocketSession sender, String targetId) throws IOException {
        WebSocketSession targetSession = onlineClients.get(targetId);
        String senderId = sessionClientMap.get(sender.getId());

        if (targetSession != null && targetSession.isOpen()) {
            ObjectNode msg = objectMapper.createObjectNode();
            msg.put("type", "incoming-call");
            msg.put("fromId", senderId);
            sendMessage(targetSession, msg.toString());
            log.info("Call initiated: from={} to={}", senderId, targetId);
        } else {
            log.warn("Call target offline: {}", targetId);
            sendError(sender, "Target offline.");
        }
    }

    private void relayToTarget(WebSocketSession sender, JsonNode node) throws IOException {
        String targetId = node.path("targetId").asText();
        WebSocketSession targetSession = onlineClients.get(targetId);
        String senderId = sessionClientMap.get(sender.getId());

        if (targetSession != null && targetSession.isOpen()) {
            // Explicitly build a new object to avoid any cast/mutation issues
            ObjectNode msg = objectMapper.createObjectNode();
            msg.put("type", node.path("type").asText());
            msg.set("payload", node.path("payload"));
            msg.put("fromId", senderId);
            msg.put("targetId", targetId);
            
            sendMessage(targetSession, msg.toString());
            log.debug("Relayed {} from {} to {}", node.path("type").asText(), senderId, targetId);
        }
    }

    private void handleLeave(WebSocketSession session) throws IOException {
        String clientId = sessionClientMap.remove(session.getId());
        if (clientId != null) {
            onlineClients.remove(clientId);
            log.info("Client left: clientId={}", clientId);
            broadcastClientList();
        }
    }

    private void broadcastClientList() throws IOException {
        ObjectNode msg = objectMapper.createObjectNode();
        msg.put("type", "client-list");
        ArrayNode clientsArray = msg.putArray("clients");
        
        for (String clientId : onlineClients.keySet()) {
            clientsArray.add(clientId);
        }

        String json = msg.toString();
        for (WebSocketSession session : onlineClients.values()) {
            if (session.isOpen()) {
                sendMessage(session, json);
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

    private void sendError(WebSocketSession session, String error) throws IOException {
        ObjectNode msg = objectMapper.createObjectNode();
        msg.put("type", "error");
        msg.put("message", error);
        sendMessage(session, msg.toString());
    }
}

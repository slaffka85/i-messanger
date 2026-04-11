package com.imessanger.websocket;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ArrayNode;
import com.fasterxml.jackson.databind.node.ObjectNode;
import com.imessanger.model.Message;
import com.imessanger.model.User;
import com.imessanger.repository.MessageRepository;
import com.imessanger.repository.UserRepository;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.security.oauth2.client.authentication.OAuth2AuthenticationToken;
import org.springframework.stereotype.Component;
import org.springframework.web.socket.CloseStatus;
import org.springframework.web.socket.TextMessage;
import org.springframework.web.socket.WebSocketSession;
import org.springframework.web.socket.handler.TextWebSocketHandler;

import java.io.IOException;
import java.time.OffsetDateTime;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;

@Component
public class SignalingHandler extends TextWebSocketHandler {

    private static final Logger log = LoggerFactory.getLogger(SignalingHandler.class);
    private final ObjectMapper objectMapper = new ObjectMapper();
    private final MessageRepository messageRepository;
    private final UserRepository userRepository;

    // userId -> WebSocketSession
    private final Map<String, WebSocketSession> onlineClients = new ConcurrentHashMap<>();

    // sessionId -> userId
    private final Map<String, String> sessionClientMap = new ConcurrentHashMap<>();

    public SignalingHandler(MessageRepository messageRepository, UserRepository userRepository) {
        this.messageRepository = messageRepository;
        this.userRepository = userRepository;
    }

    private String getUserId(WebSocketSession session) {
        if (session.getUri() != null && session.getUri().getQuery() != null) {
            String query = session.getUri().getQuery();
            for (String param : query.split("&")) {
                String[] pair = param.split("=");
                if (pair.length == 2 && pair[0].equals("userId")) {
                    try {
                        return java.net.URLDecoder.decode(pair[1], java.nio.charset.StandardCharsets.UTF_8).trim();
                    } catch (Exception e) {
                        return pair[1].trim();
                    }
                }
            }
        }

        java.security.Principal principal = session.getPrincipal();
        if (principal == null) {
            log.warn("Principal is missing for WebSocketSession {}", session.getId());
            return null;
        }
        
        String pName = principal.getName();
        if (principal instanceof OAuth2AuthenticationToken token) {
            String sub = token.getPrincipal().getAttribute("sub");
            if (sub != null) return sub.trim();
        }
        return pName != null ? pName.trim() : null;
    }

    @Override
    public void afterConnectionEstablished(WebSocketSession session) throws Exception {
        log.info("!!! WEBSOCKET ATTEMPT: sessionId={}", session.getId());
        String userId = getUserId(session);
        if (userId == null) {
            log.warn("Unauthenticated connection attempt: sessionId={}", session.getId());
            session.close(CloseStatus.NOT_ACCEPTABLE);
            return;
        }

        log.info("New connection: sessionId={}, userId={}", session.getId(), userId);
        onlineClients.put(userId, session);
        sessionClientMap.put(session.getId(), userId);
        
        broadcastClientList();
    }

    @Override
    protected void handleTextMessage(WebSocketSession session, TextMessage message) throws Exception {
        try {
            JsonNode node = objectMapper.readTree(message.getPayload());
            String type = node.path("type").asText();
            String senderId = sessionClientMap.get(session.getId());

            if (senderId == null) return;

            log.debug("Message received: type={}, senderId={}", type, senderId);

            switch (type) {
                case "call" -> handleCallInit(session, senderId, node.path("targetId").asText());
                case "offer", "answer", "ice-candidate", "call-accepted", "call-declined" -> relayToTarget(senderId, node);
                case "leave" -> relayToTarget(senderId, node);
                case "chat-message" -> handleChatMessage(senderId, node);
                default -> log.warn("Unknown message type: {}", type);
            }
        } catch (Exception e) {
            log.error("Error handling message: {}", e.getMessage(), e);
        }
    }

    @Override
    public void afterConnectionClosed(WebSocketSession session, CloseStatus status) throws Exception {
        String userId = sessionClientMap.remove(session.getId());
        if (userId != null) {
            // Only remove if this was the current session for that user
            boolean removed = onlineClients.remove(userId, session);
            if (removed) {
                log.info("Connection closed and user removed: userId={}, status={}", userId, status);
                broadcastClientList();
            } else {
                log.info("Connection closed but user has another active session: userId={}", userId);
            }
        }
    }

    private void handleCallInit(WebSocketSession sender, String senderId, String targetId) throws IOException {
        WebSocketSession targetSession = onlineClients.get(targetId);

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

    private void relayToTarget(String senderId, JsonNode node) throws IOException {
        String targetId = node.path("targetId").asText();
        WebSocketSession targetSession = onlineClients.get(targetId);

        if (targetSession != null && targetSession.isOpen()) {
            ObjectNode msg = objectMapper.createObjectNode();
            msg.put("type", node.path("type").asText());
            msg.set("payload", node.path("payload"));
            msg.put("fromId", senderId);
            msg.put("targetId", targetId);
            
            sendMessage(targetSession, msg.toString());
            log.debug("Relayed {} from {} to {}", node.path("type").asText(), senderId, targetId);
        }
    }

    private void handleChatMessage(String senderId, JsonNode node) throws IOException {
        String targetId = node.path("targetId").asText();
        String text = node.path("text").asText(null);
        String fileId = node.path("fileId").asText(null);
        String fileName = node.path("fileName").asText(null);

        // Save to Database first to get the ID
        com.imessanger.model.Message dbMessage = new com.imessanger.model.Message(
                null, senderId, targetId, text, fileId, fileName, OffsetDateTime.now(), com.imessanger.model.MessageStatus.SENT);
        dbMessage = messageRepository.save(dbMessage);

        WebSocketSession senderSession = onlineClients.get(senderId);

        // Notify sender that message is stored
        if (senderSession != null && senderSession.isOpen()) {
            ObjectNode sentAck = objectMapper.createObjectNode();
            sentAck.put("type", "message-sent");
            sentAck.put("tempId", node.path("tempId").asText()); // Use tempId from client
            sentAck.put("id", dbMessage.id());
            sentAck.put("status", "SENT");
            sendMessage(senderSession, sentAck.toString());
        }

        // Relay if user is online
        WebSocketSession targetSession = onlineClients.get(targetId);
        if (targetSession != null && targetSession.isOpen()) {
            ObjectNode msg = (ObjectNode) node.deepCopy();
            msg.put("id", dbMessage.id());
            msg.put("fromId", senderId);
            msg.put("status", com.imessanger.model.MessageStatus.DELIVERED.name());
            msg.put("createdAt", dbMessage.createdAt().toString());
            sendMessage(targetSession, msg.toString());

            // Update status in DB
            dbMessage = new com.imessanger.model.Message(
                    dbMessage.id(), senderId, targetId, text, fileId, fileName, dbMessage.createdAt(), com.imessanger.model.MessageStatus.DELIVERED);
            messageRepository.save(dbMessage);

            // Notify sender about delivery
            if (senderSession != null && senderSession.isOpen()) {
                ObjectNode ack = objectMapper.createObjectNode();
                ack.put("type", "message-delivered");
                ack.put("id", dbMessage.id());
                ack.put("targetId", targetId);
                sendMessage(senderSession, ack.toString());
            }
        }
    }

    private void broadcastClientList() throws IOException {
        Iterable<User> allUsers = userRepository.findAll();
        java.util.List<User> userList = new java.util.ArrayList<>();
        allUsers.forEach(userList::add);
        
        log.info("Broadcasting client list. Online keys in memory: {}", onlineClients.keySet());
        log.info("Total users in DB: {}", userList.size());

        for (WebSocketSession session : onlineClients.values()) {
            String recipientId = sessionClientMap.get(session.getId());
            if (recipientId == null) continue;

            ObjectNode msg = objectMapper.createObjectNode();
            msg.put("type", "client-list");
            ArrayNode clientsArray = msg.putArray("clients");

            log.info("Building list for recipient: {}", recipientId);
            for (User user : userList) {
                String uid = user.id().trim();
                if (uid.equals(recipientId)) {
                    continue;
                }

                ObjectNode userNode = objectMapper.createObjectNode();
                userNode.put("id", uid);
                userNode.put("name", user.name());
                userNode.put("email", user.email());
                userNode.put("avatarUrl", user.avatarUrl());
                
                // CRITICAL CHECK: check if this ID exists in our online map
                boolean isOnline = onlineClients.containsKey(uid);
                userNode.put("online", isOnline);
                
                clientsArray.add(userNode);
                log.info("  - User {} isOnline={}", uid, isOnline);
            }

            sendMessage(session, msg.toString());
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

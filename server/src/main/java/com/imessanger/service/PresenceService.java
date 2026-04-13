package com.imessanger.service;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ArrayNode;
import com.fasterxml.jackson.databind.node.ObjectNode;
import com.imessanger.model.User;
import com.imessanger.repository.UserRepository;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;
import io.micrometer.core.instrument.MeterRegistry;
import org.springframework.web.socket.TextMessage;
import org.springframework.web.socket.WebSocketSession;

import java.io.IOException;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;

@Service
public class PresenceService {
    private static final Logger log = LoggerFactory.getLogger(PresenceService.class);
    private final UserRepository userRepository;
    private final ObjectMapper objectMapper = new ObjectMapper();
    
    // userId -> WebSocketSession
    private final Map<String, WebSocketSession> onlineClients = new ConcurrentHashMap<>();
    // sessionId -> userId
    private final Map<String, String> sessionClientMap = new ConcurrentHashMap<>();

    public PresenceService(UserRepository userRepository, MeterRegistry meterRegistry) {
        this.userRepository = userRepository;
        meterRegistry.gauge("imessanger.ws.online_users", onlineClients, Map::size);
    }

    public void registerSession(String userId, WebSocketSession session) {
        onlineClients.put(userId, session);
        sessionClientMap.put(session.getId(), userId);
        log.info("Registered user {}: session {}", userId, session.getId());
    }

    public boolean unregisterSession(WebSocketSession session) {
        String userId = sessionClientMap.remove(session.getId());
        if (userId != null) {
            boolean removed = onlineClients.remove(userId, session);
            if (removed) {
                log.info("Unregistered primary session {} for user {}", session.getId(), userId);
                return true;
            }
            log.info("Unregistered secondary session {} for user {}", session.getId(), userId);
        }
        return false;
    }

    public String getUserIdFromSession(String sessionId) {
        return sessionClientMap.get(sessionId);
    }

    public WebSocketSession getSession(String userId) {
        return onlineClients.get(userId);
    }

    public boolean isOnline(String userId) {
        WebSocketSession session = onlineClients.get(userId);
        return session != null && session.isOpen();
    }

    public void broadcastClientList() throws IOException {
        Iterable<User> allUsers = userRepository.findAll();
        java.util.List<User> userList = new java.util.ArrayList<>();
        allUsers.forEach(userList::add);

        for (WebSocketSession session : onlineClients.values()) {
            if (!session.isOpen()) continue;
            
            String recipientId = sessionClientMap.get(session.getId());
            if (recipientId == null) continue;

            ObjectNode msg = objectMapper.createObjectNode();
            msg.put("type", "client-list");
            ArrayNode clientsArray = msg.putArray("clients");

            for (User user : userList) {
                String uid = user.id().trim();
                if (uid.equals(recipientId)) continue;

                ObjectNode userNode = objectMapper.createObjectNode();
                userNode.put("id", uid);
                userNode.put("name", user.name());
                userNode.put("email", user.email());
                userNode.put("avatarUrl", user.avatarUrl());
                userNode.put("online", isOnline(uid));
                
                clientsArray.add(userNode);
            }

            sendMessage(session, msg.toString());
        }
    }

    public void sendMessage(WebSocketSession session, String json) throws IOException {
        if (session != null && session.isOpen()) {
            synchronized (session) {
                session.sendMessage(new TextMessage(json));
            }
        }
    }

    public void sendToUser(String userId, String json) throws IOException {
        WebSocketSession session = getSession(userId);
        sendMessage(session, json);
    }
}

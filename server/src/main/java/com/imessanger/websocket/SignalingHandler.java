package com.imessanger.websocket;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.imessanger.service.CallService;
import com.imessanger.service.ChatService;
import com.imessanger.service.PresenceService;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.security.oauth2.client.authentication.OAuth2AuthenticationToken;
import org.springframework.stereotype.Component;
import org.springframework.web.socket.CloseStatus;
import org.springframework.web.socket.TextMessage;
import org.springframework.web.socket.WebSocketSession;
import org.springframework.web.socket.handler.TextWebSocketHandler;

@Component
public class SignalingHandler extends TextWebSocketHandler {

    private static final Logger log = LoggerFactory.getLogger(SignalingHandler.class);
    private final ObjectMapper objectMapper = new ObjectMapper();
    private final PresenceService presenceService;
    private final ChatService chatService;
    private final CallService callService;

    public SignalingHandler(PresenceService presenceService, ChatService chatService, CallService callService) {
        this.presenceService = presenceService;
        this.chatService = chatService;
        this.callService = callService;
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
        String userId = getUserId(session);
        if (userId == null) {
            log.warn("Unauthenticated connection attempt: sessionId={}", session.getId());
            session.close(CloseStatus.NOT_ACCEPTABLE);
            return;
        }

        log.info("New connection: sessionId={}, userId={}", session.getId(), userId);
        presenceService.registerSession(userId, session);
        presenceService.broadcastClientList();
    }

    @Override
    protected void handleTextMessage(WebSocketSession session, TextMessage message) throws Exception {
        try {
            JsonNode node = objectMapper.readTree(message.getPayload());
            String type = node.path("type").asText();
            String senderId = presenceService.getUserIdFromSession(session.getId());

            if (senderId == null) return;

            log.debug("Message received: type={}, senderId={}", type, senderId);

            switch (type) {
                case "call" -> callService.handleCallInit(senderId, node.path("targetId").asText());
                case "offer", "answer", "ice-candidate", "call-accepted", "call-declined", "typing", "leave" -> 
                        callService.relaySignaling(senderId, node);
                case "chat-message" -> chatService.handleChatMessage(senderId, node);
                case "message-read" -> chatService.handleMessageRead(senderId, node);
                default -> log.warn("Unknown message type: {}", type);
            }
        } catch (Exception e) {
            log.error("Error handling message: {}", e.getMessage(), e);
        }
    }

    @Override
    public void afterConnectionClosed(WebSocketSession session, CloseStatus status) throws Exception {
        boolean removed = presenceService.unregisterSession(session);
        if (removed) {
            log.info("Primary connection closed, broadcasting update. status={}", status);
            presenceService.broadcastClientList();
        }
    }
}

package com.imessanger.service;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;

import java.io.IOException;

@Service
public class CallService {
    private static final Logger log = LoggerFactory.getLogger(CallService.class);
    private final PresenceService presenceService;
    private final ObjectMapper objectMapper = new ObjectMapper();

    public CallService(PresenceService presenceService) {
        this.presenceService = presenceService;
    }

    public void handleCallInit(String senderId, String targetId) throws IOException {
        if (presenceService.isOnline(targetId)) {
            ObjectNode msg = objectMapper.createObjectNode();
            msg.put("type", "incoming-call");
            msg.put("fromId", senderId);
            presenceService.sendToUser(targetId, msg.toString());
            log.info("Call initiated: from={} to={}", senderId, targetId);
        } else {
            log.warn("Call target offline: {}", targetId);
            sendError(senderId, "Target offline.");
        }
    }

    public void relaySignaling(String senderId, JsonNode node) throws IOException {
        String targetId = node.path("targetId").asText();
        String type = node.path("type").asText();

        if (presenceService.isOnline(targetId)) {
            ObjectNode msg = objectMapper.createObjectNode();
            msg.put("type", type);
            msg.set("payload", node.path("payload"));
            msg.put("fromId", senderId);
            msg.put("targetId", targetId);
            
            presenceService.sendToUser(targetId, msg.toString());
            log.debug("Relayed {} from {} to {}", type, senderId, targetId);
        }
    }

    private void sendError(String userId, String error) throws IOException {
        ObjectNode msg = objectMapper.createObjectNode();
        msg.put("type", "error");
        msg.put("message", error);
        presenceService.sendToUser(userId, msg.toString());
    }
}

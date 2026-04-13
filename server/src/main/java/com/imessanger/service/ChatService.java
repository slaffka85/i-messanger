package com.imessanger.service;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import com.imessanger.model.Message;
import com.imessanger.model.MessageStatus;
import com.imessanger.repository.MessageRepository;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;

import java.io.IOException;
import java.time.OffsetDateTime;

@Service
public class ChatService {
    private static final Logger log = LoggerFactory.getLogger(ChatService.class);
    private final MessageRepository messageRepository;
    private final PresenceService presenceService;
    private final ObjectMapper objectMapper = new ObjectMapper();

    public ChatService(MessageRepository messageRepository, PresenceService presenceService) {
        this.messageRepository = messageRepository;
        this.presenceService = presenceService;
    }

    public void handleChatMessage(String senderId, JsonNode node) throws IOException {
        String targetId = node.path("targetId").asText();
        String text = node.path("text").asText(null);
        String fileId = node.path("fileId").asText(null);
        String fileName = node.path("fileName").asText(null);
        String tempId = node.path("tempId").asText();

        // Save to Database
        Message dbMessage = new Message(
                null, senderId, targetId, text, fileId, fileName, OffsetDateTime.now(), MessageStatus.SENT);
        dbMessage = messageRepository.save(dbMessage);

        // Notify sender about storage
        sendStatusAck(senderId, "message-sent", dbMessage.id(), tempId, "SENT");

        // Try delivery
        if (presenceService.isOnline(targetId)) {
            deliverToTarget(senderId, targetId, node, dbMessage);
            
            // Update status to DELIVERED
            dbMessage = new Message(
                    dbMessage.id(), senderId, targetId, text, fileId, fileName, dbMessage.createdAt(), MessageStatus.DELIVERED);
            messageRepository.save(dbMessage);

            // Notify sender about delivery
            sendStatusAck(senderId, "message-delivered", dbMessage.id(), null, "DELIVERED");
        }
    }

    private void deliverToTarget(String senderId, String targetId, JsonNode originalNode, Message dbMessage) throws IOException {
        ObjectNode msg = (ObjectNode) originalNode.deepCopy();
        msg.put("id", dbMessage.id());
        msg.put("fromId", senderId);
        msg.put("status", MessageStatus.DELIVERED.name());
        msg.put("createdAt", dbMessage.createdAt().toString());
        presenceService.sendToUser(targetId, msg.toString());
    }

    public void handleMessageRead(String readerId, JsonNode node) throws IOException {
        long messageId = node.path("messageId").asLong();
        messageRepository.findById(messageId).ifPresent(msg -> {
            if (msg.recipientId().equals(readerId) && msg.status() != MessageStatus.READ) {
                Message updated = new Message(
                        msg.id(), msg.senderId(), msg.recipientId(), msg.text(), msg.fileId(), msg.fileName(), msg.createdAt(), MessageStatus.READ);
                messageRepository.save(updated);

                // Notify sender
                ObjectNode ack = objectMapper.createObjectNode();
                ack.put("type", "message-read");
                ack.put("id", messageId);
                ack.put("readerId", readerId);
                try {
                    presenceService.sendToUser(msg.senderId(), ack.toString());
                } catch (IOException e) {
                    log.error("Failed to send read ack: {}", e.getMessage());
                }
            }
        });
    }

    private void sendStatusAck(String userId, String type, Long msgId, String tempId, String status) throws IOException {
        ObjectNode ack = objectMapper.createObjectNode();
        ack.put("type", type);
        if (tempId != null) ack.put("tempId", tempId);
        ack.put("id", msgId);
        ack.put("status", status);
        presenceService.sendToUser(userId, ack.toString());
    }
}

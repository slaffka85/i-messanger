package com.imessanger.model;

import org.springframework.data.annotation.Id;
import org.springframework.data.relational.core.mapping.Table;

import java.time.OffsetDateTime;

@Table("messages")
public record Message(
    @Id Long id,
    String senderId,
    String recipientId,
    String text,
    String fileId,
    String fileName,
    OffsetDateTime createdAt,
    MessageStatus status
) {}

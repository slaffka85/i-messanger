package com.imessanger.model;

import org.springframework.data.annotation.Id;
import org.springframework.data.relational.core.mapping.Table;

import java.time.OffsetDateTime;

@Table("users")
public record User(
    @Id String id,
    String email,
    String name,
    String avatarUrl,
    OffsetDateTime createdAt
) {}

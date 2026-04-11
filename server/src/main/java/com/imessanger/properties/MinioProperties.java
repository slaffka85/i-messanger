package com.imessanger.properties;

import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.stereotype.Component;

//@Component
@ConfigurationProperties("minio")
public record MinioProperties(
    String endpoint,
    String accessKey,
    String secretKey,
    String bucketName
) {}

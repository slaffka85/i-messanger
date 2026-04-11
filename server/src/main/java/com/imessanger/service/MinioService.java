package com.imessanger.service;

import com.imessanger.properties.MinioProperties;
import io.minio.*;
import jakarta.annotation.PostConstruct;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.web.multipart.MultipartFile;

import java.io.InputStream;

@Service
@RequiredArgsConstructor
@Slf4j
public class MinioService {

    private final MinioProperties minioProperties;
    private MinioClient minioClient;

    @PostConstruct
    public void init() {
        minioClient = MinioClient.builder()
                .endpoint(minioProperties.endpoint())
                .credentials(minioProperties.accessKey(), minioProperties.secretKey())
                .build();

        try {
            boolean found = minioClient.bucketExists(BucketExistsArgs.builder().bucket(minioProperties.bucketName()).build());
            if (!found) {
                minioClient.makeBucket(MakeBucketArgs.builder().bucket(minioProperties.bucketName()).build());
                log.info("Created MinIO bucket: {}", minioProperties.bucketName());
            }
        } catch (Exception e) {
            log.error("Error initializing MinIO bucket", e);
        }
    }

    public void uploadFile(String objectName, MultipartFile file) {
        try {
            minioClient.putObject(
                    PutObjectArgs.builder()
                            .bucket(minioProperties.bucketName())
                            .object(objectName)
                            .stream(file.getInputStream(), file.getSize(), -1)
                            .contentType(file.getContentType())
                            .build()
            );
            log.info("Uploaded file to MinIO: {}", objectName);
        } catch (Exception e) {
            log.error("Error uploading file to MinIO", e);
            throw new RuntimeException("Upload failed", e);
        }
    }

    public InputStream getFile(String objectName) {
        try {
            return minioClient.getObject(
                    GetObjectArgs.builder()
                            .bucket(minioProperties.bucketName())
                            .object(objectName)
                            .build()
            );
        } catch (Exception e) {
            log.error("Error getting file from MinIO", e);
            throw new RuntimeException("Download failed", e);
        }
    }
}

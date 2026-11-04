package com.experiencefieldops.api.services.impl;

import java.io.IOException;
import java.util.UUID;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Primary;
import org.springframework.context.annotation.Profile;
import org.springframework.stereotype.Service;
import org.springframework.web.multipart.MultipartFile;

import com.experiencefieldops.api.services.StorageService;

import software.amazon.awssdk.core.sync.RequestBody;
import software.amazon.awssdk.services.s3.S3Client;
import software.amazon.awssdk.services.s3.model.DeleteObjectRequest;
import software.amazon.awssdk.services.s3.model.PutObjectRequest;

/**
 * Implementação de StorageService usando Amazon S3.
 * Ativa apenas no perfil "prod" — em dev/test continua usando LocalStorageServiceImpl.
 */
@Service
@Profile("prod")
@Primary
public class S3StorageServiceImpl implements StorageService {

    private static final Logger log = LoggerFactory.getLogger(S3StorageServiceImpl.class);

    private final S3Client s3Client;
    private final String bucketName;
    private final String bucketUrl;

    public S3StorageServiceImpl(
            S3Client s3Client,
            @Value("${aws.s3.bucket}") String bucketName,
            @Value("${aws.s3.region}") String region) {
        this.s3Client   = s3Client;
        this.bucketName = bucketName;
        // URL pública do bucket
        this.bucketUrl  = String.format("https://%s.s3.%s.amazonaws.com", bucketName, region);
    }

    @Override
    public String store(MultipartFile file) {
        // Nunca usa nome original do arquivo (RN-050)
        String extension = getExtension(file.getOriginalFilename());
        String fileKey   = "evidencias/" + UUID.randomUUID() + extension;

        try {
            PutObjectRequest request = PutObjectRequest.builder()
                    .bucket(bucketName)
                    .key(fileKey)
                    .contentType(file.getContentType())
                    .contentLength(file.getSize())
                    .build();

            s3Client.putObject(request, RequestBody.fromInputStream(
                    file.getInputStream(), file.getSize()));

            log.info("Arquivo enviado ao S3: bucket={} key={}", bucketName, fileKey);
            return fileKey;

        } catch (IOException e) {
            throw new RuntimeException("Falha ao enviar arquivo ao S3: " + e.getMessage(), e);
        }
    }

    @Override
    public void delete(String fileKey) {
        DeleteObjectRequest request = DeleteObjectRequest.builder()
                .bucket(bucketName)
                .key(fileKey)
                .build();

        s3Client.deleteObject(request);
        log.info("Arquivo removido do S3: bucket={} key={}", bucketName, fileKey);
    }

    @Override
    public String getUrl(String fileKey) {
        return bucketUrl + "/" + fileKey;
    }

    private String getExtension(String filename) {
        if (filename == null || !filename.contains(".")) return "";
        return filename.substring(filename.lastIndexOf(".")).toLowerCase();
    }
}

package com.experiencefieldops.api.config;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.context.annotation.Profile;

import software.amazon.awssdk.auth.credentials.DefaultCredentialsProvider;
import software.amazon.awssdk.regions.Region;
import software.amazon.awssdk.services.s3.S3Client;

/**
 * Configuração dos clientes AWS SDK.
 * Ativa apenas no perfil "prod".
 * As credenciais são obtidas automaticamente via IAM Role da EC2/Beanstalk —
 * nunca hardcoded (boa prática de segurança).
 */
@Configuration
@Profile("prod")
public class AwsConfig {

    @Value("${aws.s3.region}")
    private String region;

    @Bean
    public S3Client s3Client() {
        return S3Client.builder()
                .region(Region.of(region))
                // DefaultCredentialsProvider usa automaticamente:
                // 1. IAM Role da instância (EC2/Beanstalk) — recomendado em prod
                // 2. Variáveis de ambiente AWS_ACCESS_KEY_ID / AWS_SECRET_ACCESS_KEY
                // 3. ~/.aws/credentials (local)
                .credentialsProvider(DefaultCredentialsProvider.create())
                .build();
    }
}

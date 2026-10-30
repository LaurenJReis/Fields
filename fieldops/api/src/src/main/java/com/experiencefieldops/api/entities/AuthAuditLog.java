package com.experiencefieldops.api.entities;

import jakarta.persistence.*;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.time.Instant;

/**
 * Registra toda tentativa de autenticação no sistema.
 * Campos obrigatórios: email, ip e timestamp.
 * O campo success indica se o login foi bem-sucedido.
 * O campo failureReason descreve o motivo da falha, quando aplicável.
 */
@Entity
@Table(name = "auth_audit_log", indexes = {
        @Index(name = "idx_audit_email", columnList = "email"),
        @Index(name = "idx_audit_timestamp", columnList = "timestamp"),
        @Index(name = "idx_audit_ip", columnList = "ip")
})
@Data
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class AuthAuditLog {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    /** E-mail informado na tentativa de login */
    @Column(nullable = false, length = 255)
    private String email;

    /** Endereço IP de origem da requisição */
    @Column(nullable = false, length = 45) // 45 suporta IPv6 completo
    private String ip;

    /** Momento exato da tentativa (UTC) */
    @Column(nullable = false, updatable = false)
    private Instant timestamp;

    /** true = login bem-sucedido, false = falha */
    @Column(nullable = false)
    private boolean success;

    /** Motivo da falha: INVALID_CREDENTIALS, USER_NOT_FOUND, USER_INACTIVE, etc. */
    @Column(length = 100)
    private String failureReason;

    @PrePersist
    private void prePersist() {
        if (this.timestamp == null) {
            this.timestamp = Instant.now();
        }
    }
}

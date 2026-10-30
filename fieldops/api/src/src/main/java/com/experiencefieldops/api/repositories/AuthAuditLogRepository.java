package com.experiencefieldops.api.repositories;

import com.experiencefieldops.api.entities.AuthAuditLog;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.time.Instant;
import java.util.List;

@Repository
public interface AuthAuditLogRepository extends JpaRepository<AuthAuditLog, Long> {

    /** Todos os logs de um e-mail, do mais recente ao mais antigo */
    List<AuthAuditLog> findByEmailOrderByTimestampDesc(String email);

    /** Logs de um e-mail paginados */
    Page<AuthAuditLog> findByEmailOrderByTimestampDesc(String email, Pageable pageable);

    /** Apenas falhas de um e-mail (útil para detectar brute-force) */
    List<AuthAuditLog> findByEmailAndSuccessFalseOrderByTimestampDesc(String email);

    /** Logs de um IP específico */
    List<AuthAuditLog> findByIpOrderByTimestampDesc(String ip);

    /** Logs em um intervalo de tempo, paginados */
    Page<AuthAuditLog> findByTimestampBetweenOrderByTimestampDesc(
            Instant from, Instant to, Pageable pageable);

    /** Contagem de falhas de um e-mail após determinado instante (detecção de brute-force) */
    long countByEmailAndSuccessFalseAndTimestampAfter(String email, Instant after);
}

package com.experiencefieldops.api.security;

import java.io.IOException;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.web.access.AccessDeniedHandler;
import org.springframework.stereotype.Component;

import com.experiencefieldops.api.entities.AuditLog;
import com.experiencefieldops.api.enums.AuditAction;
import com.experiencefieldops.api.repositories.AuditLogRepository;

import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import lombok.RequiredArgsConstructor;

/**
 * Tarefa 2: Loga todo acesso negado (403) com usuário, endpoint e timestamp.
 *
 * Registrado no SecurityConfig como accessDeniedHandler.
 * Nunca lança exceção — falha silenciosa para não esconder o 403 original.
 */
@Component
@RequiredArgsConstructor
public class AccessDeniedAuditHandler implements AccessDeniedHandler {

    private static final Logger log = LoggerFactory.getLogger(AccessDeniedAuditHandler.class);

    private final AuditLogRepository auditLogRepository;

    @Override
    public void handle(HttpServletRequest request,
                       HttpServletResponse response,
                       AccessDeniedException accessDeniedException)
            throws IOException, ServletException {

        String userEmail = resolverUsuario();
        String endpoint  = request.getMethod() + " " + request.getRequestURI();
        String ip        = extrairIp(request);

        // ── Log estruturado (Tarefa 6/7) ─────────────────────────────────────
        log.warn("ACCESS_DENIED user={} endpoint={} ip={}", userEmail, endpoint, ip);

        // ── Persistência na tabela de auditoria ───────────────────────────────
        try {
            AuditLog entry = AuditLog.builder()
                    .actorName(userEmail)
                    .action(AuditAction.STATUS_CHANGE) // reutilizando ação genérica — representa evento de segurança
                    .entityType("Security")
                    .entityId(0L)
                    .details("Acesso negado (403). endpoint=" + endpoint)
                    .ipAddress(ip)
                    .build();

            auditLogRepository.save(entry);
        } catch (Exception e) {
            log.error("Falha ao salvar audit log de acesso negado: {}", e.getMessage());
        }

        // Devolve 403 padrão
        response.sendError(HttpServletResponse.SC_FORBIDDEN, "Acesso negado");
    }

    private String resolverUsuario() {
        var auth = SecurityContextHolder.getContext().getAuthentication();
        if (auth != null && auth.isAuthenticated()) {
            return auth.getName();
        }
        return "anonymous";
    }

    private String extrairIp(HttpServletRequest request) {
        String forwarded = request.getHeader("X-Forwarded-For");
        if (forwarded != null && !forwarded.isBlank()) {
            return forwarded.split(",")[0].trim();
        }
        return request.getRemoteAddr();
    }
}

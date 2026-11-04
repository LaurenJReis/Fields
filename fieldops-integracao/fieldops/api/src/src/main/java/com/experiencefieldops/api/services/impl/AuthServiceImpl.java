package com.experiencefieldops.api.services.impl;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.security.authentication.AuthenticationManager;
import org.springframework.security.authentication.BadCredentialsException;
import org.springframework.security.authentication.DisabledException;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.AuthenticationException;
import org.springframework.security.core.userdetails.UserDetails;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import com.experiencefieldops.api.dto.LoginRequest;
import com.experiencefieldops.api.dto.LoginResponse;
import com.experiencefieldops.api.dto.UserRequest;
import com.experiencefieldops.api.dto.UserResponse;
import com.experiencefieldops.api.entities.AuditLog;
import com.experiencefieldops.api.entities.User;
import com.experiencefieldops.api.enums.AuditAction;
import com.experiencefieldops.api.exception.ConflictException;
import com.experiencefieldops.api.exception.ResourceNotFoundException;
import com.experiencefieldops.api.repositories.AuditLogRepository;
import com.experiencefieldops.api.repositories.UserRepository;
import com.experiencefieldops.api.security.JwtService;
import com.experiencefieldops.api.services.AuthService;

import lombok.RequiredArgsConstructor;

@Service
@RequiredArgsConstructor
public class AuthServiceImpl implements AuthService {

    private static final Logger log = LoggerFactory.getLogger(AuthServiceImpl.class);

    private final AuthenticationManager authenticationManager;
    private final JwtService jwtService;
    private final UserRepository userRepository;
    private final PasswordEncoder passwordEncoder;
    private final org.springframework.security.core.userdetails.UserDetailsService userDetailsService;
    private final AuditLogRepository auditLogRepository;

    @Override
    public LoginResponse login(LoginRequest request, String ip) {
        String email = request.email();
        String resolvedIp = (ip != null && !ip.isBlank()) ? ip : "unknown";

        try {
            authenticationManager.authenticate(
                    new UsernamePasswordAuthenticationToken(email, request.password()));

            User user = userRepository.findByEmail(email)
                    .orElseThrow(() -> new ResourceNotFoundException("Usuário não encontrado: " + email));

            UserDetails userDetails = userDetailsService.loadUserByUsername(user.getEmail());
            String token = jwtService.generateToken(userDetails);

            // ── Tarefa 1: log de login bem-sucedido ───────────────────────────
            registrarLoginAudit(user.getId(), user.getName(), email, resolvedIp, true, null);
            log.info("LOGIN_SUCCESS email={} ip={}", email, resolvedIp);

            return LoginResponse.builder()
                    .token(token)
                    .type("Bearer")
                    .expiresIn(jwtService.getExpiration())
                    .user(UserResponse.from(user))
                    .build();

        } catch (DisabledException ex) {
            // ── Tarefa 1: log de falha — usuário inativo ──────────────────────
            registrarLoginAudit(null, null, email, resolvedIp, false, "USER_INACTIVE");
            log.warn("LOGIN_FAILED reason=USER_INACTIVE email={} ip={}", email, resolvedIp);
            throw ex;

        } catch (BadCredentialsException ex) {
            // ── Tarefa 1: log de falha — credenciais inválidas ────────────────
            registrarLoginAudit(null, null, email, resolvedIp, false, "INVALID_CREDENTIALS");
            log.warn("LOGIN_FAILED reason=INVALID_CREDENTIALS email={} ip={}", email, resolvedIp);
            throw ex;

        } catch (AuthenticationException ex) {
            // ── Tarefa 1: qualquer outra falha de autenticação ────────────────
            registrarLoginAudit(null, null, email, resolvedIp, false, ex.getClass().getSimpleName());
            log.warn("LOGIN_FAILED reason={} email={} ip={}", ex.getClass().getSimpleName(), email, resolvedIp);
            throw ex;
        }
    }

    @Override
    @Transactional
    public UserResponse register(UserRequest request) {
        if (userRepository.existsByEmail(request.email())) {
            throw new ConflictException("E-mail já cadastrado: " + request.email());
        }

        User user = User.builder()
                .name(request.name())
                .email(request.email())
                .passwordHash(passwordEncoder.encode(request.password()))
                .role(request.role())
                .active(true)
                .build();

        User saved = userRepository.save(user);

        // ── Tarefa 3: log de criação de entidade crítica (User) ───────────────
        // Não inclui passwordHash — (Tarefa 5: dados sensíveis nunca no log)
        registrarEntityAudit(saved.getId(), saved.getName(), AuditAction.CREATE,
                "User", saved.getId(), null,
                String.format("{\"email\":\"%s\",\"role\":\"%s\"}", saved.getEmail(), saved.getRole()),
                "Registro de novo usuário", null);

        return UserResponse.from(saved);
    }

    // ── helpers privados ──────────────────────────────────────────────────────

    /**
     * Persiste log de tentativa de login (Tarefa 1).
     * Usa REQUIRES_NEW via AuditLogRepository diretamente para garantir persistência
     * mesmo em caso de rollback da transação principal.
     * Nunca lança exceção — falha silenciosa para não bloquear o login.
     */
    private void registrarLoginAudit(Long actorId, String actorName,
                                     String email, String ip,
                                     boolean success, String failureReason) {
        try {
            // Monta details sem expor senha ou token (Tarefa 5)
            String details = success
                    ? String.format("Login bem-sucedido. email=%s ip=%s", email, ip)
                    : String.format("Falha de login. email=%s ip=%s motivo=%s", email, ip, failureReason);

            AuditLog entry = AuditLog.builder()
                    .actorId(actorId)
                    .actorName(actorName)
                    .action(AuditAction.LOGIN)
                    .entityType("Auth")
                    .entityId(actorId)
                    .details(details)
                    .ipAddress(ip)
                    .build();

            auditLogRepository.save(entry);
        } catch (Exception e) {
            // Auditoria nunca deve interromper o fluxo de autenticação
            log.error("Falha ao salvar audit log de login: email={} error={}", email, e.getMessage());
        }
    }

    /**
     * Persiste log de operação em entidade crítica (Tarefa 3).
     * Nunca lança exceção — falha silenciosa.
     */
    private void registrarEntityAudit(Long actorId, String actorName,
                                      AuditAction action, String entityType, Long entityId,
                                      String oldValue, String newValue,
                                      String details, String ip) {
        try {
            AuditLog entry = AuditLog.builder()
                    .actorId(actorId)
                    .actorName(actorName)
                    .action(action)
                    .entityType(entityType)
                    .entityId(entityId)
                    .oldValue(oldValue)
                    .newValue(newValue)
                    .details(details)
                    .ipAddress(ip)
                    .build();

            auditLogRepository.save(entry);
        } catch (Exception e) {
            log.error("Falha ao salvar audit log de entidade: entity={} id={} error={}",
                    entityType, entityId, e.getMessage());
        }
    }
}

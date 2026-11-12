package com.experiencefieldops.api.services;

import java.time.LocalDateTime;
import java.util.List;
import java.util.stream.Collectors;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import com.experiencefieldops.api.dto.UserRequest;
import com.experiencefieldops.api.dto.UserResponse;
import com.experiencefieldops.api.dto.UserUpdateRequest;
import com.experiencefieldops.api.entities.AuditLog;
import com.experiencefieldops.api.entities.User;
import com.experiencefieldops.api.enums.AuditAction;
import com.experiencefieldops.api.exception.ConflictException;
import com.experiencefieldops.api.exception.ResourceNotFoundException;
import com.experiencefieldops.api.repositories.AuditLogRepository;
import com.experiencefieldops.api.repositories.UserRepository;

@Service
public class UserService {

    private static final Logger log = LoggerFactory.getLogger(UserService.class);

    private final UserRepository userRepository;
    private final PasswordEncoder passwordEncoder;
    private final AuditLogRepository auditLogRepository;

    public UserService(UserRepository userRepository,
                       PasswordEncoder passwordEncoder,
                       AuditLogRepository auditLogRepository) {
        this.userRepository = userRepository;
        this.passwordEncoder = passwordEncoder;
        this.auditLogRepository = auditLogRepository;
    }

    @Transactional(readOnly = true)
    public List<UserResponse> getAllUsers() {
        return userRepository.findAll()
                .stream()
                .filter(u -> u.getDeletedAt() == null)
                .map(UserResponse::from)
                .collect(Collectors.toList());
    }

    @Transactional(readOnly = true)
    public UserResponse getById(Long id) {
        return UserResponse.from(findActiveUser(id));
    }

    @Transactional
    public UserResponse save(UserRequest request) {
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

        // Tarefa 3: log de criação — sem passwordHash (Tarefa 5)
        auditarEntidade(AuditAction.CREATE, "User", saved.getId(), null,
                snapshotSeguro(saved), "Usuário criado");

        return UserResponse.from(saved);
    }

    @Transactional
    public UserResponse update(Long id, UserUpdateRequest request) {
        User user = findActiveUser(id);
        String estadoAnterior = snapshotSeguro(user);

        if (request.name() != null) {
            user.setName(request.name());
        }
        if (request.email() != null && !request.email().equals(user.getEmail())) {
            if (userRepository.existsByEmail(request.email())) {
                throw new ConflictException("E-mail já cadastrado: " + request.email());
            }
            user.setEmail(request.email());
        }
        if (request.password() != null) {
            user.setPasswordHash(passwordEncoder.encode(request.password()));
        }
        if (request.role() != null) {
            user.setRole(request.role());
        }
        if (request.active() != null) {
            user.setActive(request.active());
        }

        User saved = userRepository.save(user);

        // Tarefa 3: log de atualização — sem passwordHash (Tarefa 5)
        auditarEntidade(AuditAction.UPDATE, "User", saved.getId(),
                estadoAnterior, snapshotSeguro(saved), "Usuário atualizado");

        return UserResponse.from(saved);
    }

    @Transactional
    public void deleteById(Long id) {
        User user = findActiveUser(id);
        String estadoAnterior = snapshotSeguro(user);

        user.setDeletedAt(LocalDateTime.now());
        user.setActive(false);
        userRepository.save(user);

        // Tarefa 3: log de exclusão (soft delete)
        auditarEntidade(AuditAction.DELETE, "User", user.getId(),
                estadoAnterior, null, "Usuário removido (soft delete)");
    }

    // ── helpers ───────────────────────────────────────────────────────────────

    private User findActiveUser(Long id) {
        return userRepository.findByIdAndDeletedAtIsNull(id)
                .orElseThrow(() -> new ResourceNotFoundException("User", id));
    }

    /**
     * Tarefa 5: snapshot sem campos sensíveis — nunca inclui passwordHash ou tokens.
     */
    private String snapshotSeguro(User u) {
        return String.format(
                "{\"id\":%d,\"name\":\"%s\",\"email\":\"%s\",\"role\":\"%s\",\"active\":%b}",
                u.getId(), u.getName(), u.getEmail(), u.getRole(), u.getActive());
    }

    /**
     * Persiste log de auditoria. Falha silenciosa — nunca interrompe o fluxo principal.
     */
    private void auditarEntidade(AuditAction action, String entityType, Long entityId,
                                  String oldValue, String newValue, String details) {
        try {
            AuditLog entry = AuditLog.builder()
                    .action(action)
                    .entityType(entityType)
                    .entityId(entityId)
                    .oldValue(oldValue)
                    .newValue(newValue)
                    .details(details)
                    .build();
            auditLogRepository.save(entry);
        } catch (Exception e) {
            log.error("Falha ao salvar audit log: entity={} id={} error={}",
                    entityType, entityId, e.getMessage());
        }
    }
}

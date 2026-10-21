package com.experiencefieldops.api.services;

import com.experiencefieldops.api.dto.LoginRequest;
import com.experiencefieldops.api.dto.LoginResponse;
import com.experiencefieldops.api.dto.UserRequest;
import com.experiencefieldops.api.dto.UserResponse;

public interface AuthService {

    /** Autentica o usuário e registra a tentativa de login com IP e timestamp. */
    LoginResponse login(LoginRequest request, String ip);

    UserResponse register(UserRequest request);
}

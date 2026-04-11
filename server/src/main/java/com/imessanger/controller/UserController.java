package com.imessanger.controller;

import com.imessanger.model.User;
import com.imessanger.repository.UserRepository;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.core.user.OAuth2User;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.stream.StreamSupport;
import java.util.List;

@RestController
@RequestMapping("/api/users")
public class UserController {

    private final UserRepository userRepository;

    public UserController(UserRepository userRepository) {
        this.userRepository = userRepository;
    }

    @GetMapping("/me")
    public ResponseEntity<User> getCurrentUser(@AuthenticationPrincipal OAuth2User principal) {
        if (principal == null) {
            return ResponseEntity.status(HttpStatus.UNAUTHORIZED).build();
        }
        String id = principal.getAttribute("sub");
        return userRepository.findById(id)
                .map(ResponseEntity::ok)
                .orElse(ResponseEntity.notFound().build());
    }

    @GetMapping
    public List<User> getAllUsers() {
        return StreamSupport.stream(userRepository.findAll().spliterator(), false).toList();
    }

    @GetMapping("/debug")
    public java.util.Map<String, Object> debugUsers(@AuthenticationPrincipal OAuth2User principal) {
        java.util.Map<String, Object> debug = new java.util.HashMap<>();
        if (principal != null) {
            debug.put("principalSub", principal.getAttribute("sub"));
            debug.put("principalName", principal.getName());
            debug.put("principalClass", principal.getClass().getName());
        }
        
        List<User> fromDb = StreamSupport.stream(userRepository.findAll().spliterator(), false).toList();
        debug.put("usersInDbCount", fromDb.size());
        debug.put("users", fromDb);
        
        return debug;
    }
}

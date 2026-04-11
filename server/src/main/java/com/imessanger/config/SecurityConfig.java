package com.imessanger.config;

import com.imessanger.filter.BypassAuthFilter;
import com.imessanger.model.User;
import com.imessanger.repository.UserRepository;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.config.annotation.web.configuration.EnableWebSecurity;
import org.springframework.security.oauth2.client.userinfo.DefaultOAuth2UserService;
import org.springframework.security.oauth2.client.userinfo.OAuth2UserRequest;
import org.springframework.security.oauth2.client.userinfo.OAuth2UserService;
import org.springframework.security.oauth2.core.user.OAuth2User;
import org.springframework.security.web.SecurityFilterChain;
import org.springframework.security.web.authentication.UsernamePasswordAuthenticationFilter;
import org.springframework.web.cors.CorsConfiguration;
import org.springframework.web.cors.CorsConfigurationSource;
import org.springframework.web.cors.UrlBasedCorsConfigurationSource;

import java.util.List;
import java.util.Optional;

@Configuration
@EnableWebSecurity
public class SecurityConfig {

    private final UserRepository userRepository;
    private final JdbcTemplate jdbcTemplate;

    @org.springframework.beans.factory.annotation.Value("${app.frontend.url:https://localhost:5173}")
    private String frontendUrl;

    public SecurityConfig(UserRepository userRepository, JdbcTemplate jdbcTemplate) {
        this.userRepository = userRepository;
        this.jdbcTemplate = jdbcTemplate;
    }

    @Bean
    public SecurityFilterChain filterChain(HttpSecurity http) throws Exception {
        http
                .cors(cors -> cors.configurationSource(corsConfigurationSource()))
                .csrf(csrf -> csrf.disable()) // Disabled for local dev convenience, usually enabled for form requests.
                .authorizeHttpRequests(authz -> authz
                        .requestMatchers("/", "/login**", "/error", "/signal").permitAll()
                        .anyRequest().authenticated())
                .oauth2Login(oauth2 -> oauth2
                        .userInfoEndpoint(userInfo -> userInfo.userService(this.oauth2UserService()))
                        .defaultSuccessUrl(frontendUrl, true))
                .addFilterBefore(new BypassAuthFilter(), UsernamePasswordAuthenticationFilter.class);
        return http.build();
    }

    private OAuth2UserService<OAuth2UserRequest, OAuth2User> oauth2UserService() {
        DefaultOAuth2UserService delegate = new DefaultOAuth2UserService();
        return request -> {
            OAuth2User oAuth2User = delegate.loadUser(request);

            String email = oAuth2User.getAttribute("email");
            String name = oAuth2User.getAttribute("name");
            String avatarUrl = oAuth2User.getAttribute("picture");
            String subjectId = oAuth2User.getAttribute("sub");

            if (email != null && subjectId != null) {
                // Upsert user manually since we use string IDs and Spring Data JDBC might try
                // to update non-existing rows.
                Optional<User> existing = userRepository.findById(subjectId);
                if (existing.isEmpty()) {
                    jdbcTemplate.update(
                            "INSERT INTO users (id, email, name, avatar_url, created_at) VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)",
                            subjectId, email, name, avatarUrl);
                } else {
                    jdbcTemplate.update("UPDATE users SET email = ?, name = ?, avatar_url = ? WHERE id = ?",
                            email, name, avatarUrl, subjectId);
                }
            }
            return oAuth2User;
        };
    }

    @Bean
    public CorsConfigurationSource corsConfigurationSource() {
        CorsConfiguration configuration = new CorsConfiguration();
        configuration.setAllowedOrigins(List.of(frontendUrl, "http://127.0.0.1:5173"));
        configuration.setAllowedMethods(List.of("GET", "POST", "PUT", "DELETE", "OPTIONS"));
        configuration.setAllowedHeaders(List.of("*"));
        configuration.setAllowCredentials(true);

        UrlBasedCorsConfigurationSource source = new UrlBasedCorsConfigurationSource();
        source.registerCorsConfiguration("/**", configuration);
        return source;
    }
}

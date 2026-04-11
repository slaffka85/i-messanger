package com.imessanger.properties;

import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.stereotype.Component;

import java.util.List;

//@Component
@ConfigurationProperties("app.cors")
public record CorsProperties(
    List<String> allowedOrigins
) {
}

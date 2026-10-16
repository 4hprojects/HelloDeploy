package com.hellodeploy.fixture;

import java.util.Map;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RestController;

@SpringBootApplication
@RestController
public class FixtureApplication {

    public static void main(String[] args) {
        SpringApplication.run(FixtureApplication.class, args);
    }

    @GetMapping("/")
    public String index() {
        return "java-maven-ok";
    }

    @GetMapping("/acceptance")
    public Map<String, Object> acceptance() {
        return Map.of("fixture", "java-maven", "ok", true, "java", Runtime.version().feature());
    }
}

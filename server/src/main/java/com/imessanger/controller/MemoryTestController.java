package com.imessanger.controller;

import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.util.ArrayList;
import java.util.List;

@RestController
@RequestMapping("/api/memory-test")
public class MemoryTestController {

    private final List memory = new ArrayList<>();
    private int counter;
    @GetMapping
    public List<byte[]> test(
            @RequestParam(required = false, defaultValue = "100") Integer size
    ) {

        System.out.println("size = " + size + ", i = " + counter);
        counter++;
        List<byte[]> list = new ArrayList<>();
        for (int i = 0; i < size; i++) {
            list.add(new byte[1024 * 1024]); // 1 MB
        }
        memory.add(list);
        return list;
    }
}

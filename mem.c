#include <stdint.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include "type.h"

typedef struct {
    const void* ptr;
} GCEntry;

typedef struct {
    GCEntry* entries;
    size_t len;
    size_t cap;
} GCMap;

typedef struct Frame {
    struct Frame* prev;
    const void* slots[];
} Frame;

GCMap map;
Frame* current_frame;

// TODO: allocation error
// TODO: capacity growth
// TODO: iteration termination
void map_init() {
    map.entries = calloc(256, sizeof(GCEntry));
    map.cap = 256;
}

size_t map_hash(const void* const ptr) {
    return ((size_t)ptr >> 3) & (map.cap - 1);
}

GCEntry* map_get(const void* const ptr) {
    auto idx = map_hash(ptr);
    while (true) {
        if (map.entries[idx].ptr == ptr) {
            return &map.entries[idx];
        }
        idx = (idx + 1) & (map.cap - 1);
    }
}

void map_insert(const GCEntry entry) {
    auto idx = map_hash(entry.ptr);
    while (true) {
        if (map.entries[idx].ptr == nullptr || (size_t)map.entries[idx].ptr == 1 || map.entries[idx].ptr == entry.ptr) {
            map.entries[idx] = entry;
            map.len++;
            return;
        }
        idx = (idx + 1) & (map.cap - 1);
    }
}

void map_remove(const void* const ptr) {
    const auto entry = map_get(ptr);
    entry->ptr = (void*)(size_t)1;
    map.len--;
}

void map_display() {
    if (map.len == 0) {
        puts("GCMap []");
        return;
    }
    size_t i = 0;
    for (; i < map.cap; i++) {
        if (map.entries[i].ptr != nullptr && (size_t)map.entries[i].ptr != 1) {
            printf("GCMap [{ slot = %zu, ptr = %p }", i, map.entries[i].ptr);
            break;
        }
    }
    i++;
    for (; i < map.cap; i++) {
        if (map.entries[i].ptr != nullptr && (size_t)map.entries[i].ptr != 1) {
            printf(" { slot = %zu, ptr = %p }", i, map.entries[i].ptr);
        }
    }
    puts("]");
}

void frame_push(Frame* const frame, const size_t len) {
    frame->prev = current_frame;
    memset(frame->slots, 0, len * sizeof(void*));
    current_frame = frame;
}

void frame_slot_push(const size_t i, const void* const ptr) {
    printf("frame_slot_push i = %zu, ptr = %p\n", i, ptr);
    current_frame->slots[i] = ptr;
}

void frame_pop() {
    current_frame = current_frame->prev;
}

void frame_display(const size_t len) {
    printf("Frame { prev = %p, slots = [ ", (void*)current_frame->prev);
    for (size_t i = 0; i < len; i++) {
        auto slot = current_frame->slots[i];
        printf("{ ptr = %p, value = ", slot);
        print_var(*(uint64_t*)slot);
        printf(" } ");
    }
    puts("] }");
}

void* gc_alloc(const size_t size) {
    void* const ptr = calloc(size, 1);
    map_insert((GCEntry){.ptr = ptr});
    return ptr;
}

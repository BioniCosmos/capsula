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
    const struct Frame* prev;
    size_t len;
    const void* slots[];
} Frame;

GCMap map;
Frame* current_frame;

// TODO: allocation error
void map_init() {
    map.entries = calloc(256, sizeof(GCEntry));
    map.cap = 256;
}

size_t map_hash(const void* const ptr) {
    return ((size_t)ptr >> 3) & (map.cap - 1);
}

bool map_is_empty_entry(const GCEntry* const entry) {
    return entry->ptr == nullptr || (size_t)entry->ptr == 1;
}

GCEntry* map_get(const void* const ptr) {
    auto i = map_hash(ptr);
    while (map.entries[i].ptr != nullptr) {
        if (map.entries[i].ptr == ptr) {
            return &map.entries[i];
        }
        i = (i + 1) & (map.cap - 1);
    }
    return nullptr;
}

void map_grow();

void map_insert(const GCEntry entry) {
    if ((float)map.len / map.cap > 0.75) {
        map_grow();
    }
    auto i = map_hash(entry.ptr);
    while (true) {
        if (map_is_empty_entry(map.entries + i) || map.entries[i].ptr == entry.ptr) {
            map.entries[i] = entry;
            map.len++;
            return;
        }
        i = (i + 1) & (map.cap - 1);
    }
}

void map_grow() {
    const auto old = map;
    map = (GCMap){.entries = calloc(old.cap * 2, sizeof(GCEntry)), .cap = old.cap * 2};
    for (size_t i = 0; i < old.cap; i++) {
        if (!map_is_empty_entry(old.entries + i)) {
            map_insert(old.entries[i]);
        }
    }
    free(old.entries);
}

void map_remove(const void* const ptr) {
    map_get(ptr)->ptr = (void*)1;
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
    frame->len = len;
    memset(frame->slots, 0, len * sizeof(void*));
    current_frame = frame;
}

void frame_slot_push(const size_t i, const void* const ptr) {
    printf("frame_slot_push i = %zu, ptr = %p\n", i, ptr);
    current_frame->slots[i] = ptr;
}

void frame_pop() {
    current_frame = (Frame*)current_frame->prev;
}

void frame_display() {
    printf("Frame { prev = %p, slots = [ ", (void*)current_frame->prev);
    for (size_t i = 0; i < current_frame->len; i++) {
        const auto slot = current_frame->slots[i];
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

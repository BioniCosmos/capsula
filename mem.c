#include <stdio.h>
#include <stdlib.h>

typedef struct {
    void* ptr;
} GCEntry;

typedef struct {
    GCEntry* entries;
    size_t len;
    size_t cap;
} GCMap;

GCMap map;

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

void* gc_alloc(const size_t size) {
    void* const ptr = calloc(size, 1);
    map_insert((GCEntry){.ptr = ptr});
    return ptr;
}

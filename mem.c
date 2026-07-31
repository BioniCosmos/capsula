#include <stdint.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include "type.h"

typedef struct {
    void* ptr;
    bool marked;
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

const void* anchors[1024];
size_t anchors_top;

// TODO: allocation error
void map_init() {
    map.entries = calloc(256, sizeof(GCEntry));
    map.cap = 256;
}

void map_deinit() {
    free(map.entries);
    map = (GCMap){};
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
    const auto entry = map_get(ptr);
    if (entry != nullptr) {
        entry->ptr = (void*)1;
        map.len--;
    }
}

void map_display() {
    if (map.len == 0) {
        puts("GCMap []");
        return;
    }
    size_t i = 0;
    for (; i < map.cap; i++) {
        if (!map_is_empty_entry(map.entries + i)) {
            printf("GCMap [{ slot = %zu, ptr = %p, marked = %s }", i, map.entries[i].ptr,
                   map.entries[i].marked ? "true" : "false");
            break;
        }
    }
    i++;
    for (; i < map.cap; i++) {
        if (!map_is_empty_entry(map.entries + i)) {
            printf(" { slot = %zu, ptr = %p, marked = %s }", i, map.entries[i].ptr,
                   map.entries[i].marked ? "true" : "false");
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

void gc_collect();

const void* gc_alloc(const size_t size) {
    if ((float)map.len / map.cap > 0.75) {
        gc_collect();
    }
    const auto ptr = calloc(size, 1);
    map_insert((GCEntry){.ptr = ptr});
    return ptr;
}

void gc_check(const uint64_t x) {
    switch (tag(x)) {
        case 0b000: {
            const auto entry = map_get((void*)x);
            if (entry != nullptr) {
                entry->marked = true;
                const auto inner = *(int64_t*)x;
                if (tag(inner) == 0b000) {
                    gc_check(inner);
                }
            }
            break;
        }
        case 0b011: {
            const auto arr = (const ArrayHeader*)(x & ~0b111);
            if (array_is_managed(arr)) {
                const auto entry = map_get(arr->ptr);
                if (entry != nullptr) {
                    entry->marked = true;
                }
            }
            for (size_t i = 0; i < arr->len; i++) {
                gc_check(arr->ptr[i]);
            }
            break;
        }
    }
}

void gc_mark() {
    auto frame = current_frame;
    while (frame != nullptr) {
        for (size_t i = 0; i < frame->len; i++) {
            gc_check(*(uint64_t*)frame->slots[i]);
        }
        frame = (Frame*)frame->prev;
    }
    for (size_t i = 0; i < anchors_top; i++) {
        gc_check(*(uint64_t*)anchors[i]);
    }
}

void gc_sweep() {
    for (size_t i = 0; i < map.cap; i++) {
        const auto entry = map.entries + i;
        if (!map_is_empty_entry(entry)) {
            if (entry->marked) {
                entry->marked = false;
            } else {
                free(entry->ptr);
                map_remove(entry->ptr);
            }
        }
    }
}

void gc_collect() {
    gc_mark();
    gc_sweep();
}

void gc_clear() {
    for (size_t i = 0; i < map.cap; i++) {
        const auto entry = map.entries + i;
        if (!map_is_empty_entry(entry)) {
            free(entry->ptr);
        }
    }
    memset(map.entries, 0, map.cap * sizeof(GCEntry));
    map.len = 0;
}

void gc_retain(const void* const ptr) {
    if (anchors_top >= 1024) {
        fprintf(stderr, "gc_retain: top of stack reached");
        abort();
    }
    anchors[anchors_top++] = ptr;
}

void gc_release() {
    anchors_top--;
}

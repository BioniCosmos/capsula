#pragma once

#include <stdint.h>
#include <stdio.h>

typedef struct {
    const uint64_t type;
    const uint64_t len;
    const uint64_t* const ptr;
} ArrayHeader;

static inline bool array_is_managed(const ArrayHeader* const arr) {
    return arr->type >> 63 == 1;
}

static inline void print_var(const uint64_t x) {
    switch (x & 0b111) {
        case 0b000:
            printf("box { ptr = %#llx, value = ", x);
            print_var(*(uint64_t*)x);
            printf(" }");
            break;
        case 0b10001:
            printf("unit");
            break;
        case 0b001:
            printf("%s", (x >> 3) ? "true" : "false");
            break;
        case 0b010:
            printf("%lld", (int64_t)x >> 3);
            break;
        case 0b011: {
            const auto arr = (const ArrayHeader*)(x & ~0b111);
            printf("array { type = %s", (arr->type & INT64_MAX) == 0 ? "array" : "struct");
            if (array_is_managed(arr)) {
                printf(" (managed)");
            }
            printf(", len = %llu, ptr = %p }", arr->len, (void*)arr->ptr);
            break;
        }
        default:
            printf("%llu", x);
    }
}

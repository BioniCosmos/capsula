#pragma once

#include <stdint.h>
#include <stdio.h>

typedef struct {
    const uint64_t type;
    const uint64_t len;
    const uint64_t* const ptr;
} ArrayHeader;

void print_var(const uint64_t x);

static inline int64_t tag(const uint64_t x) {
    return x & 0b111;
}

static inline bool array_is_managed(const ArrayHeader* const arr) {
    return arr->type >> 63 == 1;
}

#ifdef CAPSULA_IMPLEMENTATION

void print_var(const uint64_t x) {
    switch (tag(x)) {
        case 0b000:
            printf("box { ptr = %#llx, value = ", x);
            print_var(*(uint64_t*)x);
            printf(" }");
            break;
        case 0b001:
            if (x == 0b10001) {
                printf("unit");
            } else {
                printf("%s", (x >> 3) ? "true" : "false");
            }
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
            printf(", len = %llu, value = [ ", arr->len);
            for (size_t i = 0; i < arr->len; i++) {
                print_var(arr->ptr[i]);
                printf(" ");
            }
            printf("] }");
            break;
        }
        default:
            printf("%llu", x);
    }
}

#endif

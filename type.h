#include <stdint.h>
#include <stdio.h>

typedef struct {
    const uint64_t type;
    const uint64_t len;
    const void* const ptr;
} ArrayHeader;

void print_var(const uint64_t x) {
    switch (x & 0b111) {
        case 0b000:
            printf("box { ptr = %0llx, value =  ", x);
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
            printf("array { type = %llu, len = %llu, ptr = %p }", arr->type, arr->len, arr->ptr);
            break;
        }
        default:
            printf("%llu", x);
    }
}

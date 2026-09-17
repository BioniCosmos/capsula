#pragma once

#include <stdint.h>
#include <stdio.h>
#include <stdlib.h>

#define error(fmt, ...)                                                               \
    {                                                                                 \
        fprintf(stderr, "%s:%d in %s() runtime error: " fmt "\n", __FILE__, __LINE__, \
                __func__ __VA_OPT__(, ) __VA_ARGS__);                                 \
        exit(1);                                                                      \
    }

typedef struct {
    const uint64_t type;
    const uint64_t len;
    const uint64_t data[];
} Array;

void var_display(const uint64_t x);
void var_debug(const uint64_t x);
const char* type_name(const uint64_t x);

static inline int64_t tag(const uint64_t x) {
    return x & 0b111;
}

static inline bool array_is_managed(const Array* const arr) {
    return arr->type >> 63 == 1;
}

#ifdef CAPSULA_IMPLEMENTATION

void var_display(const uint64_t x) {
    switch (tag(x)) {
        case 0b000:
            var_display(*(uint64_t*)x);
            break;
        case 0b001:
            if (x == 0b10001) {
                printf("()");
            } else {
                printf("%s", (x >> 3) ? "true" : "false");
            }
            break;
        case 0b010:
            printf("%lld", (int64_t)x >> 3);
            break;
        case 0b011: {
            const auto arr = (const Array*)(x & ~0b111);
            if (array_is_managed(arr)) {
                const auto ptr = (uint64_t*)arr->data[0];
                switch (arr->type & INT64_MAX) {
                    case 0:
                        printf("[ ");
                        for (size_t i = 0; i < arr->len; i++) {
                            var_display(ptr[i]);
                            printf(" ");
                        }
                        printf("]");
                        break;
                    // TODO: Add struct type info to runtime.
                    case 1:
                        printf("{ ");
                        for (size_t i = 0; i < arr->len; i++) {
                            var_display(ptr[i]);
                            printf(" ");
                        }
                        printf("}");
                        break;
                    case 2:
                        printf("%s", (char*)ptr);
                        break;
                }
            } else {
                switch (arr->type & INT64_MAX) {
                    case 0:
                        printf("[ ");
                        for (size_t i = 0; i < arr->len; i++) {
                            var_display(arr->data[i]);
                            printf(" ");
                        }
                        printf("]");
                        break;
                    // TODO: Add struct type info to runtime.
                    case 1:
                        printf("{ ");
                        for (size_t i = 0; i < arr->len; i++) {
                            var_display(arr->data[i]);
                            printf(" ");
                        }
                        printf("}");
                        break;
                }
            }
            break;
        }
        default:
            error("invalid var: %#llx", x);
    }
}

void var_debug(const uint64_t x) {
    switch (tag(x)) {
        case 0b000:
            printf("box { ptr = %#llx, value = ", x);
            var_debug(*(uint64_t*)x);
            printf(" }");
            break;
        case 0b001:
            if (x == 0b10001) {
                printf("unit ()");
            } else {
                printf("%s", (x >> 3) ? "true" : "false");
            }
            break;
        case 0b010:
            printf("%lld", (int64_t)x >> 3);
            break;
        case 0b011: {
            const auto arr = (const Array*)(x & ~0b111);
            if (array_is_managed(arr)) {
                const auto ptr = (uint64_t*)arr->data[0];
                switch (arr->type & INT64_MAX) {
                    case 0:
                        printf("array (managed)");
                        printf(" { len = %llu, value = [ ", arr->len);
                        for (size_t i = 0; i < arr->len; i++) {
                            var_debug(ptr[i]);
                            printf(" ");
                        }
                        printf("] }");
                        break;
                    case 1:
                        printf("struct (managed)");
                        printf(" { ");
                        for (size_t i = 0; i < arr->len; i++) {
                            var_debug(ptr[i]);
                            printf(" ");
                        }
                        printf("}");
                        break;
                    case 2:
                        printf("\"%s\"", (char*)ptr);
                        break;
                }
            } else {
                switch (arr->type & INT64_MAX) {
                    case 0:
                        printf("array");
                        printf(" { len = %llu, value = [ ", arr->len);
                        for (size_t i = 0; i < arr->len; i++) {
                            var_debug(arr->data[i]);
                            printf(" ");
                        }
                        printf("] }");
                        break;
                    case 1:
                        printf("struct");
                        printf(" { ");
                        for (size_t i = 0; i < arr->len; i++) {
                            var_debug(arr->data[i]);
                            printf(" ");
                        }
                        printf("}");
                        break;
                }
            }
            break;
        }
        default:
            error("invalid var: %#llx", x);
    }
}

// TODO: Returning when no tag matched seems to be not a good idea.
const char* type_name(const uint64_t x) {
    switch (tag(x)) {
        case 0b000:
            return "box";
        case 0b001:
            if (x == 0b10001) {
                return "unit";
            }
            return "bool";
        case 0b010:
            return "i64";
        case 0b011:
            return "array";
        default:
            return nullptr;
    }
}

#endif

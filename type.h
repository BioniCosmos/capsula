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

typedef enum : uint8_t { TypeBox, TypeNarrow, TypeI64, TypeArray } Type;

constexpr auto unit = 0b10001;
constexpr auto bool_false = 0b0001;
constexpr auto bool_true = 0b1001;

#define to_managed(x) ((x) | INT64_MIN)

typedef enum : uint64_t {
    ArrayTypeArray,
    ArrayTypeStruct,
    ArrayTypeString,
    ArrayTypeArrayManaged = to_managed(ArrayTypeArray),
    ArrayTypeStructManaged = to_managed(ArrayTypeStruct),
} ArrayType;

typedef struct {
    const ArrayType type;
    const uint64_t len;
    const uint64_t data[];
} Array;

void var_display(const uint64_t x);
void var_debug(const uint64_t x);
const char* type_name(const uint64_t x);

static inline Type tag(const uint64_t x) {
    return x & UINT64_C(0b111);
}

static inline bool array_is_managed(const Array* const arr) {
    return arr->type >> 63 == 1;
}

static inline const Array* unwrap_array(const uint64_t x) {
    return (Array*)(x & ~UINT64_C(0b111));
}

static inline const void* array_ptr(const Array* const arr) {
    return (void*)arr->data[0];
}

#ifdef CAPSULA_IMPLEMENTATION

void var_display(const uint64_t x) {
    switch (tag(x)) {
        case TypeBox:
            var_display(*(uint64_t*)x);
            return;
        case TypeNarrow:
            switch (x) {
                case unit:
                    printf("()");
                    return;
                case bool_false:
                    printf("false");
                    return;
                case bool_true:
                    printf("true");
                    return;
            }
            break;
        case TypeI64:
            printf("%lld", (int64_t)x >> 3);
            return;
        case TypeArray: {
            const auto arr = unwrap_array(x);
            switch (arr->type) {
                case ArrayTypeArray:
                    printf("[ ");
                    for (size_t i = 0; i < arr->len; i++) {
                        var_display(arr->data[i]);
                        printf(" ");
                    }
                    printf("]");
                    return;
                case ArrayTypeStruct:
                    // TODO: Add struct type info to runtime.
                    printf("{ ");
                    for (size_t i = 0; i < arr->len; i++) {
                        var_display(arr->data[i]);
                        printf(" ");
                    }
                    printf("}");
                    return;
                case ArrayTypeString:
                    fwrite(array_ptr(arr), sizeof(char), arr->len, stdout);
                    fflush(stdout);
                    return;
                case ArrayTypeArrayManaged: {
                    const uint64_t* const data = array_ptr(arr);
                    printf("[ ");
                    for (size_t i = 0; i < arr->len; i++) {
                        var_display(data[i]);
                        printf(" ");
                    }
                    printf("]");
                    return;
                }
                case ArrayTypeStructManaged: {
                    const uint64_t* const data = array_ptr(arr);
                    printf("{ ");
                    for (size_t i = 0; i < arr->len; i++) {
                        var_display(data[i]);
                        printf(" ");
                    }
                    printf("}");
                    return;
                }
            }
            break;
        }
    }
    error("invalid var: %#llx", x);
}

void var_debug(const uint64_t x) {
    switch (tag(x)) {
        case TypeBox:
            printf("box { ptr = %#llx, value = ", x);
            var_debug(*(uint64_t*)x);
            printf(" }");
            return;
        case TypeNarrow:
            switch (x) {
                case unit:
                    printf("unit ()");
                    return;
                case bool_false:
                    printf("false");
                    return;
                case bool_true:
                    printf("true");
                    return;
            }
            break;
        case TypeI64:
            printf("%lld", (int64_t)x >> 3);
            return;
        case TypeArray: {
            const auto arr = unwrap_array(x);
            switch (arr->type) {
                case ArrayTypeArray:
                    printf("array");
                    printf(" { len = %llu, value = [ ", arr->len);
                    for (size_t i = 0; i < arr->len; i++) {
                        var_debug(arr->data[i]);
                        printf(" ");
                    }
                    printf("] }");
                    return;
                case ArrayTypeStruct:
                    printf("struct");
                    printf(" { ");
                    for (size_t i = 0; i < arr->len; i++) {
                        var_debug(arr->data[i]);
                        printf(" ");
                    }
                    printf("}");
                    return;
                case ArrayTypeString:
                    fwrite("\"", sizeof(char), 1, stdout);
                    fwrite(array_ptr(arr), sizeof(char), arr->len, stdout);
                    fwrite("\"", sizeof(char), 1, stdout);
                    fflush(stdout);
                    return;
                case ArrayTypeArrayManaged: {
                    const uint64_t* const data = array_ptr(arr);
                    printf("array (managed)");
                    printf(" { len = %llu, value = [ ", arr->len);
                    for (size_t i = 0; i < arr->len; i++) {
                        var_debug(data[i]);
                        printf(" ");
                    }
                    printf("] }");
                    return;
                }
                case ArrayTypeStructManaged: {
                    const uint64_t* const data = array_ptr(arr);
                    printf("struct (managed)");
                    printf(" { ");
                    for (size_t i = 0; i < arr->len; i++) {
                        var_debug(data[i]);
                        printf(" ");
                    }
                    printf("}");
                    return;
                }
            }
            break;
        }
    }
    error("invalid var: %#llx", x);
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

uint64_t size_of(const uint64_t x) {
    switch (tag(x)) {
        case TypeBox:
        case TypeNarrow:
        case TypeI64:
            return sizeof x;
        case TypeArray: {
            const auto arr = unwrap_array(x);
            switch (arr->type) {
                case ArrayTypeArray:
                case ArrayTypeStruct: {
                    uint64_t size = sizeof *arr;
                    for (size_t i = 0; i < arr->len; i++) {
                        size += size_of(arr->data[i]);
                    }
                    return size;
                }
                case ArrayTypeString:
                case ArrayTypeArrayManaged:
                case ArrayTypeStructManaged:
                    return sizeof *arr + sizeof array_ptr(arr);
            }
        }
    }
    error("invalid var: %#llx", x);
}

#endif

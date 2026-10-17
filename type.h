#pragma once

#include <stdio.h>
#include <stdlib.h>

#define error(fmt, ...)                                                               \
    {                                                                                 \
        fprintf(stderr, "%s:%d in %s() runtime error: " fmt "\n", __FILE__, __LINE__, \
                __func__ __VA_OPT__(, ) __VA_ARGS__);                                 \
        exit(1);                                                                      \
    }

typedef enum : uint8_t { TypeBox, TypeNarrow, TypeI64 } Type;

constexpr auto unit = 0b10001;
constexpr auto bool_false = 0b0001;
constexpr auto bool_true = 0b1001;

typedef enum : uint16_t { BoxScalar, BoxArray, BoxStruct, BoxString } BoxType;
typedef enum : uint16_t { Stack, Heap, Data } Segment;

typedef struct {
    const BoxType type;
} Box;

typedef struct {
    const BoxType type;
    const uint64_t value;
} ScalarBox;

typedef struct {
    const BoxType type;
    const Segment segment;
    const uint32_t id;
    const uint64_t len;
    const uint64_t data[];
} CompositeBox;

typedef struct {
    const char* const name;
    const char* const fields[];
} Struct;

extern const Struct* const structs[];

static inline Type tag(const uint64_t x) {
    return x & UINT64_C(0b111);
}

static inline void* alloc(const size_t count, const size_t size) {
    const auto ptr = calloc(count, size);
    if (ptr == nullptr) {
        error("failed to allocate memory");
    }
    return ptr;
}

#ifdef CAPSULA_IMPLEMENTATION

void var_display(const uint64_t x) {
    switch (tag(x)) {
        case TypeBox: {
            const auto box = (const CompositeBox*)x;
            switch (box->type) {
                case BoxScalar:
                    var_display(((ScalarBox*)x)->value);
                    return;
                case BoxArray:
                    printf("[ ");
                    for (size_t i = 0; i < box->len; i++) {
                        var_display(box->data[i]);
                        printf(" ");
                    }
                    printf("]");
                    return;
                case BoxStruct: {
                    const auto meta = structs[box->id];
                    printf("%s { ", meta->name);
                    const char* sep = "";
                    for (size_t i = 0; i < box->len; i++) {
                        printf("%s%s = ", sep, meta->fields[i]);
                        var_display(box->data[i]);
                        sep = ", ";
                    }
                    printf(" }");
                    return;
                }
                case BoxString:
                    fwrite(box->data, sizeof(char), box->len, stdout);
                    fflush(stdout);
                    return;
            }
            break;
        }
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
    }
    error("invalid var: %#llx", x);
}

const char* type_name(const uint64_t x) {
    switch (tag(x)) {
        case TypeBox:
            switch (((Box*)x)->type) {
                case BoxScalar:
                    return "box";
                case BoxArray:
                    return "array";
                case BoxStruct:
                    return "struct";
                case BoxString:
                    return "string";
            }
            break;
        case TypeNarrow:
            switch (x) {
                case unit:
                    return "unit";
                case bool_false:
                case bool_true:
                    return "bool";
            }
            break;
        case TypeI64:
            return "i64";
    }
    error("invalid var: %#llx", x);
}

uint64_t size_of(const uint64_t x) {
    switch (tag(x)) {
        case TypeBox: {
            const auto box = (const CompositeBox*)x;
            if (box->type == BoxScalar ||
                ((box->type == BoxArray || box->type == BoxStruct || box->type == BoxString) &&
                 (box->segment == Heap || box->segment == Data))) {
                return sizeof x;
            }
            if ((box->type == BoxArray || box->type == BoxStruct) && box->segment == Stack) {
                uint64_t size = sizeof *box;
                for (size_t i = 0; i < box->len; i++) {
                    size += size_of(box->data[i]);
                }
                return size;
            }
            if (box->type == BoxString && box->segment == Stack) {
                return sizeof *box + box->len;
            }
            break;
        }
        case TypeNarrow:
        case TypeI64:
            return sizeof x;
    }
    error("invalid var: %#llx", x);
}

#endif

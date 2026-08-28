#include <stdint.h>
#include <stdio.h>
#include <stdlib.h>

[[noreturn]] void panic(const uint8_t* const file_name,
                        const uint32_t line,
                        const uint32_t column,
                        const uint8_t* const message) {
    fprintf(stderr, "%s:%u:%u panic: %s\n", file_name, line, column, message);
    exit(1);
}

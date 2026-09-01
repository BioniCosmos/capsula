#include <stdarg.h>
#include <stdint.h>
#include <stdio.h>
#include <stdlib.h>

[[noreturn]] void panic(const char* const file_name,
                        const uint32_t line,
                        const uint32_t column,
                        const char* const message,
                        ...) {
    fprintf(stderr, "%s:%u:%u panic: ", file_name, line, column);
    va_list args;
    va_start(args);
    vfprintf(stderr, message, args);
    va_end(args);
    putchar('\n');
    exit(1);
}

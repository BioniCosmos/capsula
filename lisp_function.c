// #include <stdarg.h>
// #include <stdio.h>
// #include <stdlib.h>
// #include <string.h>
// #include "utils.h"

// typedef struct {
//   char* name;
//   char** arguments;
//   int args_count;
// } LispFunction;

// LispFunction* lisp_function_new(char* name, int args_count, ...) {
//   LispFunction* func = malloc(sizeof(LispFunction));
//   func->name = name;
//   func->arguments = malloc(args_count * sizeof(char*));
//   func->args_count = args_count;
//   va_list args = NULL;
//   va_start(args, args_count);
//   for (int i = 0; i < args_count; i++) {
//     func->arguments[i] = va_arg(args, char*);
//   }
//   va_end(args);
//   return func;
// }

// void lisp_function_drop(LispFunction* func) {
//   for (int i = 0; i < func->args_count; i++) {
//     free(func->arguments[i]);
//   }
//   free(func->arguments);
//   free(func);
// }

// void lisp_function_print(LispFunction* func) {
//   char* joined = join_to_string(func->arguments, func->args_count, ", ");
//   printf("function %s(%s)", func->name, joined);
//   free(joined);
// }

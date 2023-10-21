#ifndef BuiltInFunctionsHeader
#define BuiltInFunctionsHeader

#include "lisp_value.h"

LispValue* eval_built_in_functions(const char* function_name, List* args);

#endif

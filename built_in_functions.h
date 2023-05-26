#ifndef BuiltInFunctionsHeader
#define BuiltInFunctionsHeader

#include "lisp_value.h"

LispValue eval_built_in_functions(char* function_name, List(LispValue) * args);

#endif

#include "built_in_functions.h"
#include "utils.h"

LispValue add(List(LispValue) * args) {
  int result = 0;
  for_each(LispValue, arg, *args) {
    result += arg->number;
  }
  return number_from(result);
}

LispValue subtract(List(LispValue) * args) {
  int result = 0;
  for_each(LispValue, arg, *args) {
    result -= arg->number;
  }
  return number_from(result);
}

LispValue multiply(List(LispValue) * args) {
  int result = 1;
  for_each(LispValue, arg, *args) {
    result *= arg->number;
  }
  return number_from(result);
}

LispValue divide(List(LispValue) * args) {
  ListIterator(LispValue) iterator = list_iterator_from(LispValue)(args);
  int result =
      args->size == 1 ? 1 : list_iterator_next(LispValue)(&iterator)->number;
  while (list_iterator_has_next(LispValue)(&iterator)) {
    int number = list_iterator_next(LispValue)(&iterator)->number;
    if (number == 0) {
      return error_from(xstring_from("division by zero"));
    }
    result /= number;
  };
  return number_from(result);
}

LispValue list(List(LispValue) * args) {
  LispValue list = expressions_new(QExpression);
  list_drop(LispValue)(&list.expressions, NULL);
  list.expressions = list_clone(LispValue)(args, lisp_value_clone);
  return list;
}

LispValue head(List(LispValue) * args) {
  return lisp_value_clone(
      list_head(LispValue)(&list_head(LispValue)(args)->expressions));
}

typedef struct {
  char* name;
  LispValue (*func)(List(LispValue) * args);
} BuiltInFunctionMap;

const BuiltInFunctionMap BuiltInFunctions[] = {
    {.name = "+", .func = add},      {.name = "-", .func = subtract},
    {.name = "*", .func = multiply}, {.name = "/", .func = divide},
    {.name = "list", .func = list},  {.name = "head", .func = head},
};

LispValue (*map_get(char* function_name))(List(LispValue) * args) {
  for (size_t i = 0; i < 6; i++) {
    if (string_equals(function_name, BuiltInFunctions[i].name)) {
      return BuiltInFunctions[i].func;
    }
  }
  return NULL;
}

LispValue eval_built_in_functions(char* function_name, List(LispValue) * args) {
  if (string_equals(function_name, "+") || string_equals(function_name, "-") ||
      string_equals(function_name, "*") || string_equals(function_name, "/")) {
    for_each(LispValue, arg, *args) {
      if (arg->type == Error) {
        return lisp_value_clone(arg);
      }
      if (arg->type != Number) {
        return error_from(xstring_from("operate on non-number"));
      }
    }
  }
  LispValue (*func)(List(LispValue)*) = map_get(function_name);
  return func == NULL ? error_from(xstring_from("undefined function"))
                      : func(args);
}

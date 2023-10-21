#include "lisp_value.h"
#include <stdlib.h>

LispValue* number_from(int number) {
  LispValue* value = calloc(1, sizeof(LispValue));
  value->type = Number;
  value->number = number;
  return value;
}

LispValue* error_from(XString* error) {
  LispValue* value = calloc(1, sizeof(LispValue));
  value->type = Error;
  value->error = error;
  return value;
}

LispValue* symbol_from(XString* symbol) {
  LispValue* value = calloc(1, sizeof(LispValue));
  value->type = Symbol;
  value->symbol = symbol;
  return value;
}

LispValue* expressions_new(LispType type) {
  LispValue* value = calloc(1, sizeof(LispValue));
  value->type = type;
  value->expressions = list_new();
  return value;
}

void lisp_value_drop(LispValue* value) {
  switch (value->type) {
    case Number:
      break;
    case Error:
      xstring_drop(value->error);
      break;
    case Symbol:
      xstring_drop(value->symbol);
      break;
    case SExpression:
    case QExpression:
      list_drop(value->expressions, (void (*)(void*))lisp_value_drop);
      break;
      // case Function:
      //   lisp_function_drop(value->function);
      //   break;
  }
  free(value);
}

XString* lisp_value_to_string(LispValue* value) {
  switch (value->type) {
    case Number:
      return int_to_xstring(value->number);
    case Error: {
      XString* xs = xstring_from("Error: ");
      xstring_push(xs, value->error);
      return xs;
    }
    case Symbol:
      return xstring_clone(value->symbol);
    case SExpression:
    case QExpression: {
      List* expressions = list_new_with_capacity(value->expressions->size + 2);
      for_each(LispValue, expression, value->expressions) {
        list_push(expressions, lisp_value_to_string(expression));
      }
      XString* xs = list_join_to_string(
          expressions, " ", value->type == SExpression ? "(" : "{",
          value->type == SExpression ? ")" : "}", false);
      list_drop(expressions, (void (*)(void*))xstring_drop);
      return xs;
    }
      // case Function:
      //   lisp_function_print(value->function);
      //   break;
  }
}

void lisp_value_add_cell(LispValue* value, LispValue* cell) {
  list_push(value->expressions, cell);
}

LispValue* lisp_value_clone(LispValue* value) {
  switch (value->type) {
    case Number:
      return number_from(value->number);
    case Error:
      return error_from(xstring_clone(value->error));
    case Symbol:
      return symbol_from(xstring_clone(value->symbol));
    case SExpression:
    case QExpression: {
      LispValue* cloned_value = expressions_new(value->type);
      list_drop(cloned_value->expressions, NULL);
      cloned_value->expressions =
          list_clone(value->expressions, (void* (*)(void*))lisp_value_clone);
      return cloned_value;
    }
  }
}

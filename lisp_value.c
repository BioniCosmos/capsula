#include "lisp_value.h"

list_type_init(XString);
list_func_init(XString);
list_join_to_string_init;

LispValue number_from(int number) {
  LispValue value = {
      .type = Number,
      .number = number,
  };
  return value;
}

LispValue error_from(XString error) {
  LispValue value = {
      .type = Error,
      .error = error,
  };
  return value;
}

LispValue symbol_from(XString symbol) {
  LispValue value = {
      .type = Symbol,
      .symbol = symbol,
  };
  return value;
}

LispValue expressions_new(LispType type) {
  LispValue value = {
      .type = type,
      .expressions = list_new(LispValue)(),
  };
  return value;
}

void lisp_value_drop(LispValue* value) {
  switch (value->type) {
    case Number:
      break;
    case Error:
      xstring_drop(&value->error);
      break;
    case Symbol:
      xstring_drop(&value->symbol);
      break;
    case SExpression:
    case QExpression:
      list_drop(LispValue)(&value->expressions, lisp_value_drop);
      break;
      // case Function:
      //   lisp_function_drop(value->function);
      //   break;
  }
  free(value);
}

XString lisp_value_to_string(LispValue* value) {
  switch (value->type) {
    case Number:
      return int_to_xstring(value->number);
    case Error: {
      XString xs = xstring_from("Error: ");
      xstring_push(&xs, &value->error);
      return xs;
    }
    case Symbol:
      return xstring_clone(&value->symbol);
    case SExpression:
    case QExpression: {
      List(XString) expressions =
          list_new_with_capacity(XString)(value->expressions.size + 2);
      for_each(LispValue, expression, value->expressions) {
        list_push(XString)(&expressions, lisp_value_to_string(expression));
      }
      XString xs = list_join_to_string(
          &expressions, xstring_from(" "),
          xstring_from(value->type == SExpression ? "(" : "{"),
          xstring_from(value->type == SExpression ? ")" : "}"));
      list_drop(XString)(&expressions, xstring_drop);
      return xs;
    }
      // case Function:
      //   lisp_function_print(value->function);
      //   break;
  }
}

void lisp_value_add_cell(LispValue* value, LispValue cell) {
  list_push(LispValue)(&value->expressions, cell);
}

LispValue lisp_value_clone(LispValue* value) {
  switch (value->type) {
    case Number:
      return number_from(value->number);
    case Error:
      return error_from(xstring_clone(&value->error));
    case Symbol:
      return symbol_from(xstring_clone(&value->symbol));
    case SExpression:
    case QExpression: {
      LispValue cloned_value = expressions_new(value->type);
      list_drop(LispValue)(&cloned_value.expressions, NULL);
      cloned_value.expressions =
          list_clone(LispValue)(&value->expressions, lisp_value_clone);
      return cloned_value;
    }
  }
}

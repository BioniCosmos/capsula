#ifndef LispValueHeader
#define LispValueHeader

#include "lib/list.h"
#include "lib/xstring.h"

typedef enum {
  Number,
  Error,
  Symbol,
  SExpression,
  QExpression,
  /* Function */
} LispType;

typedef struct LispValue LispValue;
list_type_init(LispValue);

typedef struct LispValue {
  LispType type;
  union {
    int number;
    XString error;
    XString symbol;
    List(LispValue) expressions;
    /* LispFunction* function */;
  };
} LispValue;

list_func_init(LispValue);

LispValue number_from(int number);
LispValue error_from(XString error);
LispValue symbol_from(XString symbol);
LispValue expressions_new(LispType type);
void lisp_value_drop(LispValue* value);
XString lisp_value_to_string(LispValue* value);
void lisp_value_add_cell(LispValue* value, LispValue cell);
LispValue lisp_value_clone(LispValue* value);

#endif

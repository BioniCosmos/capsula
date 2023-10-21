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

typedef struct LispValue {
  LispType type;
  union {
    int number;
    XString* error;
    XString* symbol;
    List* expressions;
    /* LispFunction* function */;
  };
} LispValue;

LispValue* number_from(int number);
LispValue* error_from(XString* error);
LispValue* symbol_from(XString* symbol);
LispValue* expressions_new(LispType type);
void lisp_value_drop(LispValue* value);
XString* lisp_value_to_string(LispValue* value);
void lisp_value_add_cell(LispValue* value, LispValue* cell);
LispValue* lisp_value_clone(LispValue* value);

#endif

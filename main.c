#include <readline/readline.h>
#include "built_in_functions.h"
#include "lib/mpc.h"
#include "utils.h"

List* read_all(mpc_ast_t* node);
LispValue* eval(LispValue* value);
LispValue* eval_operation(const char* operator, List * args);

int main(void) {
  mpc_parser_t* number = mpc_new("number");
  mpc_parser_t* symbol = mpc_new("symbol");
  mpc_parser_t* expression = mpc_new("expression");
  mpc_parser_t* s_expression = mpc_new("s_expression");
  mpc_parser_t* q_expression = mpc_new("q_expression");
  mpc_parser_t* lispy = mpc_new("lispy");
  mpca_lang(MPCA_LANG_DEFAULT,
            "                                                              \
      number      : /-?[0-9]+/;                                            \
      symbol      : '+' | '-' | '*' | '/'                                  \
                  | \"eval\" | \"list\" | \"head\";                        \
      expression  : <number> | <symbol> | <s_expression> | <q_expression>; \
      s_expression: '(' <expression>* ')';                                 \
      q_expression: '{' <expression>* '}';                                 \
      lispy       : /^/ <expression>* /$/;                                 \
    ",
            number, symbol, expression, s_expression, q_expression, lispy);
  while (true) {
    char* input = readline("lispy> ");
    add_history(input);
    if (input == NULL || string_equals(input, "exit")) {
      free(input);
      break;
    }
    mpc_result_t result;
    if (mpc_parse("<stdin>", input, lispy, &result)) {
      List* values = read_all(result.output);
      for_each(LispValue, value, values) {
        switch (value->type) {
          case Number:
          case Error:
          case Symbol:
          case QExpression: {
            XString* s = lisp_value_to_string(value);
            printf("%s ", xstring_to_c_string(s));
            xstring_drop(s);
            break;
          }
          case SExpression: {
            LispValue* r = eval(value);
            XString* s = lisp_value_to_string(r);
            printf("%s ", xstring_to_c_string(s));
            xstring_drop(s);
            lisp_value_drop(r);
            break;
          }
        }
      }
      putchar('\n');
      list_drop(values, (void (*)(void*))lisp_value_drop);
      mpc_ast_delete(result.output);
    } else {
      mpc_err_print(result.error);
      mpc_err_delete(result.error);
    }
    free(input);
  }
  mpc_cleanup(6, number, symbol, expression, s_expression, q_expression, lispy);
  return 0;
}

LispValue* read(mpc_ast_t* node) {
  if (strstr(node->tag, "number") != NULL) {
    errno = 0;
    int number = (int)strtol(node->contents, NULL, 10);
    return errno == ERANGE ? error_from(xstring_from("invalid number"))
                           : number_from(number);
  }
  if (strstr(node->tag, "symbol") != NULL) {
    return symbol_from(xstring_from(node->contents));
  }
  {
    bool is_s_expression = strstr(node->tag, "s_expression") != NULL;
    bool is_q_expression = strstr(node->tag, "q_expression") != NULL;
    if (is_s_expression || is_q_expression) {
      LispValue* value =
          expressions_new(is_s_expression ? SExpression : QExpression);
      for (int i = 1; i < node->children_num - 1; i++) {
        lisp_value_add_cell(value, read(node->children[i]));
      }
      return value;
    }
  }
  return error_from(xstring_from("unable to parse"));
}

List* read_all(mpc_ast_t* node) {
  List* values = list_new();
  for (int i = 1; i < node->children_num - 1; i++) {
    list_push(values, read(node->children[i]));
  }
  return values;
}

LispValue* eval(LispValue* value) {
  if (value->type == SExpression) {
    if (value->expressions->size == 0) {
      return error_from(xstring_from("empty expression"));
    }
    ListIterator iterator = list_iterator_from(value->expressions);
    LispValue* operator= list_iterator_next(&iterator);
    bool has_eval = false;
    if (operator->type == SExpression && string_equals(
            xstring_to_c_string(
                ((LispValue*)list_head(operator->expressions))->symbol),
            "eval")) {
      operator= eval(list_get(operator->expressions, 1));
      has_eval = true;
    }
    if (operator->type != Symbol) {
      return error_from(xstring_from("not a function"));
    }
    List* args = list_new_with_capacity(value->expressions->size - 1);
    while (list_iterator_has_next(&iterator)) {
      list_push(args, eval(list_iterator_next(&iterator)));
    };
    LispValue* result =
        eval_built_in_functions(xstring_to_c_string(operator->symbol), args);
    list_drop(args, (void (*)(void*))lisp_value_drop);
    if (has_eval) {
      lisp_value_drop(operator);
    }
    return result;
  }
  return lisp_value_clone(value);
}

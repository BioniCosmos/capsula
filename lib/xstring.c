#include "xstring.h"
#include <stdio.h>
#include <stdlib.h>
#include <string.h>

XString* xstring_new_with_size(size_t size) {
  XString* xs = calloc(1, sizeof(XString));
  xs->size = size;
  xs->data = calloc(size + 1, sizeof(char));
  return xs;
}

XString* xstring_from(const char* s) {
  XString* xs = xstring_new_with_size(strlen(s));
  strcpy(xs->data, s);
  return xs;
}

XString* xstring_clone(XString* xs) {
  return xstring_from(xs->data);
}

void xstring_drop(XString* xs) {
  free(xs->data);
  free(xs);
}

const char* xstring_to_c_string(XString* xs) {
  return xs->data;
}

void xstring_push(XString* a, XString* b) {
  a->size += b->size;
  char* new_data = realloc(a->data, a->size + 1);
  a->data = new_data;
  strcat(a->data, b->data);
}

XString* xstring_concat(XString* a, XString* b) {
  XString* xs = xstring_new_with_size(a->size + b->size);
  strcat(xs->data, a->data);
  strcat(xs->data, b->data);
  return xs;
}

XString* int_to_xstring(int i) {
  XString* xs = xstring_new_with_size(snprintf(NULL, 0, "%d", i));
  sprintf(xs->data, "%d", i);
  return xs;
}

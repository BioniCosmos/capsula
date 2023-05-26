#ifndef XStringHeader
#define XStringHeader

#include <stddef.h>

typedef struct {
  size_t size;
  char* data;
} XString;

XString xstring_new_with_size(size_t size);
XString xstring_from(char* s);
XString xstring_clone(XString* xs);
void xstring_drop(XString* xs);
char* xstring_to_c_string(XString* xs);
void xstring_push(XString* a, XString* b);
XString xstring_concat(XString* a, XString* b);
XString int_to_xstring(int i);

#endif

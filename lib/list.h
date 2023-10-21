#ifndef ListHeader
#define ListHeader

#include <stdbool.h>
#include <stddef.h>
#include "xstring.h"

typedef enum { None, IndexOutOfRange } ListError;

typedef struct {
  size_t size;
  size_t capacity;
  void** data;
} List;

typedef struct {
  List* list;
  size_t index;
} ListIterator;

List* list_new_with_capacity(size_t capacity);
List* list_new();
void list_drop(List* list, void(drop_element)(void*));
ListError list_insert(List* list, size_t index, void* element);
ListError list_push(List* list, void* element);
void* list_get(List* list, size_t index);
List* list_clone(List* list, void*(cloned_element)(void*));
void* list_head(List* list);
XString* list_join_to_string(List* list,
                             void* delimiter,
                             void* prefix,
                             void* postfix,
                             bool useX);

ListIterator list_iterator_from(List* list);
bool list_iterator_has_next(ListIterator* iterator);
void* list_iterator_next(ListIterator* iterator);

#define for_each(T, element, list)                 \
  for (size_t i = 0, j = 0; i < (list)->size; i++) \
    for (T * (element) = list_get(list, i); i == j; j++)

#endif

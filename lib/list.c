#include "list.h"
#include <stdlib.h>

List* list_new_with_capacity(size_t capacity) {
  List* list = calloc(1, sizeof(List));
  list->data = calloc(capacity, sizeof(void*));
  list->size = 0;
  list->capacity = capacity;
  return list;
}

List* list_new() {
  return list_new_with_capacity(1);
}

void list_drop(List* list, void(drop_element)(void*)) {
  if (list == NULL) {
    return;
  }
  ListIterator iterator = list_iterator_from(list);
  while (list_iterator_has_next(&iterator)) {
    drop_element(list_iterator_next(&iterator));
  }
  if (list->capacity != 0) {
    free(list->data);
  }
  free(list);
}

ListError list_insert(List* list, size_t index, void* element) {
  if (index > list->size) {
    return IndexOutOfRange;
  }
  if (list->size == list->capacity) {
    list->capacity *= 2;
    void* new_data = realloc(list->data, list->capacity * sizeof(void*));
    list->data = new_data;
  }
  for (size_t i = list->size; i > index; i--) {
    list->data[i] = list->data[i - 1];
  }
  list->data[index] = element;
  list->size++;
  return None;
}

ListError list_push(List* list, void* element) {
  return list_insert(list, list->size, element);
}

void* list_get(List* list, size_t index) {
  if (index >= list->size) {
    return NULL;
  }
  return list->data[index];
}

List* list_clone(List* list, void*(cloned_element)(void*)) {
  List* cloned_list = list_new_with_capacity(list->capacity);
  cloned_list->size = list->size;
  for (size_t i = 0; i < cloned_list->size; i++) {
    cloned_list->data[i] = cloned_element(list->data[i]);
  }
  return cloned_list;
}

void* list_head(List* list) {
  return list_get(list, 0);
}

XString* list_join_to_string(List* list,
                             void* delimiter,
                             void* prefix,
                             void* postfix,
                             bool useX) {
  if (list == NULL || list->size == 0) {
    return xstring_from("");
  }

  XString* d = useX ? delimiter : xstring_from(delimiter);
  XString* pre = useX ? prefix : xstring_from(prefix);
  XString* post = useX ? postfix : xstring_from(postfix);
  XString* joined = pre;
  for (size_t i = 0; i < list->size; i++) {
    xstring_push(joined, list_get(list, i));
    if (i != list->size - 1) {
      xstring_push(joined, d);
    }
  }
  xstring_push(joined, post);
  xstring_drop(d);
  xstring_drop(post);
  return joined;
}

ListIterator list_iterator_from(List* list) {
  ListIterator iterator = {.list = list, .index = 0};
  return iterator;
}

bool list_iterator_has_next(ListIterator* iterator) {
  if (iterator->list == NULL) {
    return false;
  }
  return iterator->index < iterator->list->size;
}

void* list_iterator_next(ListIterator* iterator) {
  if (!list_iterator_has_next(iterator)) {
    return NULL;
  }
  return iterator->list->data[iterator->index++];
}

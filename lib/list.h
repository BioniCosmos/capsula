#ifndef ListHeader
#define ListHeader

#include <stdbool.h>
#include <stdlib.h>

typedef enum { None, IndexOutOfRange } ListError;

#define List(T) List_##T
#define list_new_with_capacity(T) list_new_with_capacity_##T
#define list_new(T) list_new_##T
#define list_drop(T) list_drop_##T
#define list_insert(T) list_insert_##T
#define list_push(T) list_push_##T
#define list_get(T) list_get_##T
// #define list_join_to_string(T) list_join_to_string_##T
#define list_clone(T) list_clone_##T
#define list_head(T) list_head_##T
#define ListIterator(T) ListIterator_##T
#define list_iterator_from(T) list_iterator_from_##T
#define list_iterator_has_next(T) list_iterator_has_next_##T
#define list_iterator_next(T) list_iterator_next_##T

#define list_type_init(T) \
  typedef struct {        \
    size_t size;          \
    size_t capacity;      \
    T* data;              \
  } List(T);              \
                          \
  typedef struct {        \
    List(T) * list;       \
    size_t index;         \
  } ListIterator(T);

#define list_func_init(T)                                             \
  List(T) list_new_with_capacity(T)(size_t capacity);                 \
  List(T) list_new(T)();                                              \
  void list_drop(T)(List(T) * list, void(drop_element)(T*));          \
  ListError list_insert(T)(List(T) * list, size_t index, T element);  \
  ListError list_push(T)(List(T) * list, T element);                  \
  T* list_get(T)(List(T) * list, size_t index);                       \
  List(T) list_clone(T)(List(T) * list, T(cloned_element)(T*));       \
  T* list_head(T)(List(T) * list);                                    \
                                                                      \
  ListIterator(T) list_iterator_from(T)(List(T) * list);              \
  bool list_iterator_has_next(T)(ListIterator(T) * iterator);         \
  T* list_iterator_next(T)(ListIterator(T) * iterator);               \
                                                                      \
  List(T) list_new_with_capacity(T)(size_t capacity) {                \
    List(T) list = {                                                  \
        .data = calloc(capacity, sizeof(T)),                          \
        .size = 0,                                                    \
        .capacity = capacity,                                         \
    };                                                                \
    return list;                                                      \
  }                                                                   \
                                                                      \
  List(T) list_new(T)() {                                             \
    return list_new_with_capacity(T)(1);                              \
  }                                                                   \
                                                                      \
  void list_drop(T)(List(T) * list, void(drop_element)(T*)) {         \
    if (list == NULL) {                                               \
      return;                                                         \
    }                                                                 \
    ListIterator(T) iterator = list_iterator_from(T)(list);           \
    while (list_iterator_has_next(T)(&iterator)) {                    \
      drop_element(list_iterator_next(T)(&iterator));                 \
    }                                                                 \
    if (list->capacity != 0) {                                        \
      free(list->data);                                               \
    }                                                                 \
  }                                                                   \
                                                                      \
  ListError list_insert(T)(List(T) * list, size_t index, T element) { \
    if (index > list->size) {                                         \
      return IndexOutOfRange;                                         \
    }                                                                 \
    if (list->size == list->capacity) {                               \
      list->capacity *= 2;                                            \
      T* new_data = realloc(list->data, list->capacity * sizeof(T));  \
      list->data = new_data;                                          \
    }                                                                 \
    for (size_t i = list->size; i > index; i--) {                     \
      list->data[i] = list->data[i - 1];                              \
    }                                                                 \
    list->data[index] = element;                                      \
    list->size++;                                                     \
    return None;                                                      \
  }                                                                   \
                                                                      \
  ListError list_push(T)(List(T) * list, T element) {                 \
    return list_insert(T)(list, list->size, element);                 \
  }                                                                   \
                                                                      \
  T* list_get(T)(List(T) * list, size_t index) {                      \
    if (index >= list->size) {                                        \
      return NULL;                                                    \
    }                                                                 \
    return &list->data[index];                                        \
  }                                                                   \
                                                                      \
  List(T) list_clone(T)(List(T) * list, T(cloned_element)(T*)) {      \
    List(T) cloned_list = list_new_with_capacity(T)(list->capacity);  \
    cloned_list.size = list->size;                                    \
    for (size_t i = 0; i < cloned_list.size; i++) {                   \
      cloned_list.data[i] = cloned_element(&list->data[i]);           \
    }                                                                 \
    return cloned_list;                                               \
  }                                                                   \
                                                                      \
  T* list_head(T)(List(T) * list) {                                   \
    return list_get(T)(list, 0);                                      \
  }                                                                   \
                                                                      \
  ListIterator(T) list_iterator_from(T)(List(T) * list) {             \
    ListIterator(T) iterator = {                                      \
        .list = list,                                                 \
        .index = 0,                                                   \
    };                                                                \
    return iterator;                                                  \
  }                                                                   \
                                                                      \
  bool list_iterator_has_next(T)(ListIterator(T) * iterator) {        \
    if (iterator->list == NULL) {                                     \
      return false;                                                   \
    }                                                                 \
    return iterator->index < iterator->list->size;                    \
  }                                                                   \
                                                                      \
  T* list_iterator_next(T)(ListIterator(T) * iterator) {              \
    if (!list_iterator_has_next(T)(iterator)) {                       \
      return NULL;                                                    \
    }                                                                 \
    return &iterator->list->data[iterator->index++];                  \
  }

#define list_join_to_string_init                                       \
  XString list_join_to_string(List(XString) * list, XString delimiter, \
                              XString prefix, XString postfix) {       \
    if (list == NULL || list->size == 0) {                             \
      return xstring_from("");                                         \
    }                                                                  \
    XString joined = prefix;                                           \
    for (size_t i = 0; i < list->size; i++) {                          \
      xstring_push(&joined, list_get(XString)(list, i));               \
      if (i != list->size - 1) {                                       \
        xstring_push(&joined, &delimiter);                             \
      }                                                                \
    }                                                                  \
    xstring_push(&joined, &postfix);                                   \
    xstring_drop(&delimiter);                                          \
    xstring_drop(&postfix);                                            \
    return joined;                                                     \
  }

#define for_each(T, element, list)                \
  for (size_t i = 0, j = 0; i < (list).size; i++) \
    for (T * (element) = list_get(T)(&(list), i); i == j; j++)

#endif

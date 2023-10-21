cmake_minimum_required(VERSION 3.27)
project(lisp VERSION 0.1.0)

set(CMAKE_C_STANDARD 17)
add_link_options(-fsanitize=address -ledit -lm)
aux_source_directory(lib lib)
add_executable(lisp ${lib} main.c lisp_value.c utils.c built_in_functions.c)

const std = @import("std");
const heap = std.heap;
const testing = std.testing;
const Allocator = std.mem.Allocator;
const ArenaAllocator = heap.ArenaAllocator;
const ArrayList = std.ArrayList;
const builtin = @import("builtin.zig");
const io = @import("io.zig");
const LispValue = @import("lisp_value.zig").LispValue;
const String = @import("string.zig").String;

const c = @cImport({
    @cInclude("mpc.h");
});

pub fn main() !void {
    var arena = ArenaAllocator.init(heap.raw_c_allocator);
    const allocator = arena.allocator();
    defer arena.deinit();

    const number = c.mpc_new("number");
    const symbol = c.mpc_new("symbol");
    const expression = c.mpc_new("expression");
    const s_expression = c.mpc_new("s_expression");
    const q_expression = c.mpc_new("q_expression");
    const lispy = c.mpc_new("lispy");
    defer c.mpc_cleanup(6, number, symbol, expression, s_expression, q_expression, lispy);

    _ = c.mpca_lang(c.MPCA_LANG_DEFAULT, "                                                                    number      : /-?[0-9]+/;                                                  symbol      : '+' | '-' | '*' | '/'                                                    | \"eval\" | \"list\" | \"head\";                              expression  : <number> | <symbol> | <s_expression> | <q_expression>;       s_expression: '(' <expression>* ')';                                       q_expression: '{' <expression>* '}';                                       lispy       : /^/ <expression>* /$/;                                     ", number, symbol, expression, s_expression, q_expression, lispy);

    while (true) {
        defer _ = arena.reset(.retain_capacity);
        const input = io.readline("lispy> ");
        if (input == null or String.equal(input.?, "exit")) {
            break;
        }
        defer heap.raw_c_allocator.free(input.?);

        var result: c.mpc_result_t = undefined;
        if (c.mpc_parse("<stdin>", @ptrCast(input.?), lispy, &result) != 0) {
            const values = try parseAST(allocator, @alignCast(@ptrCast(result.output)));
            for (values.items) |value| {
                const evaluated_value = try builtin.eval(&value);
                const value_string = try evaluated_value.toString();
                io.print("{s}\n", .{value_string.raw});
            }
            c.mpc_ast_delete(@alignCast(@ptrCast(result.output)));
        } else {
            c.mpc_err_print(result.@"error");
            c.mpc_err_delete(result.@"error");
        }
    }
}

fn parseAST(allocator: Allocator, node: *const c.mpc_ast_t) !ArrayList(LispValue) {
    const children_len = @as(usize, @intCast(node.children_num));
    var values = ArrayList(LispValue).init(allocator);
    for (1..children_len - 1) |i| {
        try values.append(try LispValue.fromAST(allocator, node.children[i]));
    }
    return values;
}

test {
    testing.refAllDecls(@This());
}

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
const Token = @import("tokenizer.zig").Token;

pub fn main() !void {
    var arena = ArenaAllocator.init(heap.raw_c_allocator);
    const allocator = arena.allocator();
    defer arena.deinit();

    while (true) {
        defer _ = arena.reset(.retain_capacity);
        const input = io.readline("lispy> ");
        if (input == null or String.equal(input.?, "exit")) {
            break;
        }
        defer heap.raw_c_allocator.free(input.?);

        const tokens = (try Token.tokenize(allocator, input.?, 0)).value;
        const values = try parse(allocator, &tokens);
        for (values.items) |value| {
            const evaluated_value = try builtin.eval(&value);
            const value_string = try evaluated_value.toString();
            io.print("{s}\n", .{value_string.raw});
        }
    }
}

fn parse(allocator: Allocator, tokens: *const ArrayList(Token)) !ArrayList(LispValue) {
    var values = ArrayList(LispValue).init(allocator);
    for (tokens.items) |token| {
        try values.append(try LispValue.fromToken(allocator, &token));
    }
    return values;
}

test {
    testing.refAllDecls(@This());
}

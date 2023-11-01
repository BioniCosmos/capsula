const std = @import("std");
const io = std.io;
const mem = std.mem;

const c = @cImport({
    @cInclude("readline/readline.h");
});

pub fn print(comptime format: []const u8, args: anytype) void {
    io.getStdOut().writer().print(format, args) catch unreachable;
}

pub fn println(comptime format: []const u8, args: anytype) void {
    print(format ++ "\n", args);
}

pub fn readline(prompt: []const u8) ?[]const u8 {
    const input = c.readline(@ptrCast(prompt));
    if (input == null) {
        return null;
    }
    _ = c.add_history(input);
    return mem.span(input);
}

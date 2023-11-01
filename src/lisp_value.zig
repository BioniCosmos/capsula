const std = @import("std");
const mem = std.mem;
const testing = std.testing;
const Allocator = mem.Allocator;
const ArrayList = std.ArrayList;
const string = @import("string.zig");
const RawString = string.RawString;
const String = string.String;

const c = @cImport({
    @cInclude("mpc.h");
});

pub const LispValue = struct {
    const Self = @This();

    data: union(enum) {
        number: i32,
        err: String,
        symbol: RawString,
        values: ArrayList(Self),
    },
    quoted: bool = false,
    allocator: Allocator,

    pub fn fromNumber(allocator: Allocator, number: i32) Self {
        return .{ .data = .{ .number = number }, .allocator = allocator };
    }

    pub fn fromError(allocator: Allocator, err: String) Self {
        return .{ .data = .{ .err = err }, .allocator = allocator };
    }

    pub fn fromSymbol(allocator: Allocator, symbol: RawString) Self {
        return .{ .data = .{ .symbol = symbol }, .allocator = allocator };
    }

    pub fn initValues(allocator: Allocator, quoted: bool) Self {
        return .{ .data = .{ .values = ArrayList(Self).init(allocator) }, .quoted = quoted, .allocator = allocator };
    }

    pub fn clone(self: *const Self) !Self {
        return switch (self.data) {
            .number, .symbol => self.*,
            .err => |err| fromError(self.allocator, err),
            .values => |values| .{ .data = .{ .values = try values.clone() }, .quoted = self.quoted, .allocator = self.allocator },
        };
    }

    pub fn fromAST(allocator: Allocator, node: *const c.mpc_ast_t) !LispValue {
        const tag = mem.span(node.tag);
        const contents = mem.span(node.contents);
        const children_len = @as(usize, @intCast(node.children_num));

        if (String.contain(tag, "number")) {
            const number = std.fmt.parseInt(i32, contents, 10) catch {
                const err = try String.fromSlices(allocator, &[_]RawString{ "Fail to parse `", contents, "` into a number." });
                return LispValue.fromError(allocator, err);
            };
            return LispValue.fromNumber(allocator, number);
        }

        if (String.contain(tag, "symbol")) {
            return LispValue.fromSymbol(allocator, contents);
        }

        if (String.contain(tag, "_expression")) {
            var value = LispValue.initValues(allocator, !String.contain(tag, "s_expression"));
            for (1..children_len - 1) |i| {
                try value.data.values.append(try fromAST(allocator, node.children[i]));
            }
            return value;
        }

        const err = try String.fromSlices(allocator, &[_]RawString{ "Fail to parse `", contents, "`." });
        return LispValue.fromError(allocator, err);
    }

    pub fn deinit(self: *const Self) void {
        switch (self.data) {
            .err => |err| {
                err.deinit();
            },
            .values => |values| {
                for (values.items) |value| {
                    value.deinit();
                }
                values.deinit();
            },
            else => {},
        }
    }

    pub fn toString(self: *const Self) !String {
        return switch (self.data) {
            .number => |number| String.fromInt(self.allocator, number),
            .err => |err| String.fromSlices(self.allocator, &[_]RawString{ "Error: ", err.raw }),
            .symbol => |symbol| String.fromSlice(self.allocator, symbol),
            .values => |values| block: {
                var values_string = try ArrayList(String).initCapacity(self.allocator, values.items.len);
                defer {
                    for (values_string.items) |value_string| {
                        value_string.deinit();
                    }
                    values_string.deinit();
                }

                for (values.items) |value| {
                    const value_string = try value.toString();
                    try values_string.append(value_string);
                }
                break :block try String.joinToString(self.allocator, values_string.items, " ", "(", ")");
            },
        };
    }
};

test "LispValue.fromNumber.toString" {
    const value = LispValue.fromNumber(testing.allocator, -0xf);
    defer value.deinit();
    const value_string = try value.toString();
    defer value_string.deinit();
    try testing.expectEqualStrings("-15", value_string.raw);
}

test "LispValue.fromError.toString" {
    const err = try String.fromSlice(testing.allocator, "OOM");
    const value = LispValue.fromError(testing.allocator, err);
    defer value.deinit();
    const value_string = try value.toString();
    defer value_string.deinit();
    try testing.expectEqualStrings("Error: OOM", value_string.raw);
}

test "LispValue.fromSymbol.toString" {
    const value = LispValue.fromSymbol(testing.allocator, "list");
    defer value.deinit();
    const value_string = try value.toString();
    defer value_string.deinit();
    try testing.expectEqualStrings("list", value_string.raw);
}

test "LispValue.initValues.toString" {
    var value = LispValue.initValues(testing.allocator, false);
    defer value.deinit();
    try value.data.values.appendSlice(&[_]LispValue{
        LispValue.fromSymbol(testing.allocator, "+"),
        LispValue.fromNumber(testing.allocator, 1),
        LispValue.fromNumber(testing.allocator, 1),
    });
    const value_string = try value.toString();
    defer value_string.deinit();
    try testing.expectEqualStrings("(+ 1 1)", value_string.raw);
}

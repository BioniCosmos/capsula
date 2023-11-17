const std = @import("std");
const mem = std.mem;
const testing = std.testing;
const Allocator = mem.Allocator;
const ArrayList = std.ArrayList;
const string = @import("string.zig");
const RawString = string.RawString;
const String = string.String;
const Token = @import("tokenizer.zig").Token;

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

    pub fn fromToken(allocator: Allocator, token: *const Token) !LispValue {
        switch (token.value) {
            .number => |number| {
                const value = std.fmt.parseInt(i32, number, 10) catch {
                    const err = try String.fromSlices(
                        allocator,
                        &[_]RawString{ "Fail to parse `", number, "` into a number." },
                    );
                    return LispValue.fromError(allocator, err);
                };
                return LispValue.fromNumber(allocator, value);
            },
            .symbol => |symbol| {
                return LispValue.fromSymbol(allocator, symbol);
            },
            .sexpr => |sexpr| {
                var value = LispValue.initValues(allocator, token.quoted);
                for (sexpr.items) |cell| {
                    try value.data.values.append(try fromToken(allocator, &cell));
                }
                return value;
            },
        }
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

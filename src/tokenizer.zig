const std = @import("std");
const ascii = std.ascii;
const testing = std.testing;
const Allocator = std.mem.Allocator;
const ArrayList = std.ArrayList;
const RawString = @import("string.zig").RawString;

pub const Token = struct {
    fn Result(comptime T: type) type {
        return struct {
            value: T,
            index: usize,
        };
    }

    const Type = union(enum) {
        number: RawString,
        symbol: RawString,
        sexpr: ArrayList(Token),
    };

    value: Type,
    quoted: bool,

    pub fn tokenize(allocator: Allocator, input: RawString, index: usize) !Result(ArrayList(Token)) {
        var i = index;

        var tokens = ArrayList(Token).init(allocator);
        var quoted = false;

        while (i < input.len) : (i += 1) {
            const c = input[i];

            if (ascii.isWhitespace(c)) {
                continue;
            }

            if (c == '(') {
                const result = try tokenize(allocator, input, i + 1);
                try tokens.append(.{ .value = .{ .sexpr = result.value }, .quoted = quoted });
                i = result.index;
                quoted = false;
            } else if (c == ')') {
                return .{ .value = tokens, .index = i };
            } else if (c == '\'') {
                quoted = true;
            } else {
                const result = tokenizeCell(input, i);
                try tokens.append(.{ .value = result.value, .quoted = quoted });
                i = result.index;
                quoted = false;
            }
        }
        return .{ .value = tokens, .index = i };
    }

    pub fn deinitTokens(tokens: *const ArrayList(Token)) void {
        for (tokens.items) |token| {
            switch (token.value) {
                .sexpr => |sexpr| deinitTokens(&sexpr),
                else => {},
            }
        }
        tokens.deinit();
    }

    fn tokenizeCell(input: RawString, index: usize) Result(Token.Type) {
        var i = index;

        const start = i;
        var go_back: usize = 0;
        while (i < input.len and !ascii.isWhitespace(input[i])) : (i += 1) {
            if (input[i] == ')') {
                go_back = 1;
                break;
            }
        }

        const cell = input[start..i];
        if (ascii.isDigit(cell[0]) or (cell[0] == '-' and cell.len > 1)) {
            const is_digit = blk: {
                for (cell[1..]) |c| {
                    if (!ascii.isDigit(c)) {
                        break :blk false;
                    }
                }
                break :blk true;
            };

            if (is_digit) {
                return .{ .value = .{ .number = cell }, .index = i - go_back };
            }
        }
        return .{ .value = .{ .symbol = cell }, .index = i - go_back };
    }
};

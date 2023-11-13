const std = @import("std");
const ascii = std.ascii;
const testing = std.testing;
const Allocator = std.mem.Allocator;
const ArrayList = std.ArrayList;
const RawString = @import("string.zig").RawString;

const Token = struct {
    value: union(enum) {
        number: RawString,
        symbol: RawString,
        sexpr: ArrayList(Token),
    },
    quoted: bool,

    fn tokenize(allocator: Allocator, input: RawString, i: *usize) !ArrayList(Token) {
        var tokens = ArrayList(Token).init(allocator);
        var quoted = false;
        while (i.* < input.len) : (i.* += 1) {
            const c = input[i.*];
            if (c == '(') {
                i.* += 1;
                const sexpr = try tokenize(allocator, input, i);
                try tokens.append(.{ .value = .{ .sexpr = sexpr }, .quoted = quoted });
                quoted = false;
            } else if (ascii.isDigit(c)) {
                try tokens.append(.{
                    .value = .{ .number = takeWhile(input, i, ascii.isDigit).? },
                    .quoted = quoted,
                });
                quoted = false;
            } else if (c == '-' and i.* + 1 < input.len and ascii.isDigit(input[i.* + 1])) {
                const number = takeWhile(input, i, ascii.isDigit).?;
                try tokens.append(.{
                    .value = .{ .number = input[i.* - number.len - 1 .. i.*] },
                    .quoted = quoted,
                });
                quoted = false;
            } else if (c == ')') {
                return tokens;
            } else if (c == '\'') {
                quoted = true;
            } else if (isNotWhitespace(c)) {
                try tokens.append(.{
                    .value = .{ .symbol = takeWhile(input, i, isNotWhitespace).? },
                    .quoted = quoted,
                });
                quoted = false;
            }
        }
        return tokens;
    }

    fn deinitTokens(tokens: *const ArrayList(Token)) void {
        for (tokens.items) |token| {
            switch (token.value) {
                .sexpr => |sexpr| deinitTokens(&sexpr),
                else => {},
            }
        }
        tokens.deinit();
    }
};

fn takeWhile(list: RawString, i: *usize, pred: *const fn (c: u8) bool) ?RawString {
    var start: ?usize = null;
    while (i.* < list.len) : (i.* += 1) {
        if (pred(list[i.*])) {
            if (start == null) {
                start = i.*;
            }
        } else {
            if (start != null) {
                i.* -= 1;
                break;
            }
        }
    }
    return if (start != null) list[start.?..i.*] else null;
}

fn isNotWhitespace(c: u8) bool {
    return !ascii.isWhitespace(c);
}

test "Token.tokenize positive integer" {
    const input = "123";
    var i: usize = 0;
    const tokens = try Token.tokenize(testing.allocator, input, &i);
    defer tokens.deinit();
    try testing.expectEqualSlices(
        Token,
        &[_]Token{.{ .value = .{ .number = "123" }, .quoted = false }},
        tokens.items,
    );
}

test "Token.tokenize negative integer" {
    const input = "-1";
    var i: usize = 0;
    const tokens = try Token.tokenize(testing.allocator, input, &i);
    defer tokens.deinit();
    try testing.expectEqualSlices(
        Token,
        &[_]Token{.{ .value = .{ .number = "-1" }, .quoted = false }},
        tokens.items,
    );
}

test "Token.tokenize symbol" {
    const input = "is-real?";
    var i: usize = 0;
    const tokens = try Token.tokenize(testing.allocator, input, &i);
    defer tokens.deinit();
    try testing.expectEqualSlices(
        Token,
        &[_]Token{.{ .value = .{ .symbol = "is-real?" }, .quoted = false }},
        tokens.items,
    );
}

test "Token.tokenize symbol `-`" {
    const input = "-";
    var i: usize = 0;
    const tokens = try Token.tokenize(testing.allocator, input, &i);
    defer tokens.deinit();
    try testing.expectEqualSlices(
        Token,
        &[_]Token{.{ .value = .{ .symbol = "-" }, .quoted = false }},
        tokens.items,
    );
}

test "Token.tokenize sexpr" {
    const input = "(+ 1 1)";
    var i: usize = 0;
    const tokens = try Token.tokenize(testing.allocator, input, &i);
    defer Token.deinitTokens(&tokens);
    try testing.expectEqual(@as(usize, 1), tokens.items.len);
    try testing.expectEqual(false, tokens.items[0].quoted);

    const sexpr = tokens.items[0].value.sexpr.items;
    try testing.expectEqual(
        .{ .value = .{ .symbol = "+" }, .quoted = false },
        sexpr[0],
    );
    try testing.expectEqual(
        .{ .value = .{ .number = "1" }, .quoted = false },
        sexpr[1],
    );
    try testing.expectEqual(
        .{ .value = .{ .number = "1" }, .quoted = false },
        sexpr[2],
    );
}

test "Token.tokenize nested sexpr" {
    const input = "(+ (+ 1 1) (+ 1 1))";
    var i: usize = 0;
    const tokens = try Token.tokenize(testing.allocator, input, &i);
    defer Token.deinitTokens(&tokens);

    const sexpr = tokens.items[0].value.sexpr.items;

    const symbol = sexpr[0];
    try testing.expectEqual(
        .{ .value = .{ .symbol = "+" }, .quoted = false },
        symbol,
    );

    const sexpr1 = sexpr[1].value.sexpr.items;
    try testing.expectEqual(
        .{ .value = .{ .symbol = "+" }, .quoted = false },
        sexpr1[0],
    );
    try testing.expectEqual(
        .{ .value = .{ .number = "1" }, .quoted = false },
        sexpr1[1],
    );
    try testing.expectEqual(
        .{ .value = .{ .number = "1" }, .quoted = false },
        sexpr1[2],
    );

    const sexpr2 = sexpr[2].value.sexpr.items;
    try testing.expectEqual(
        .{ .value = .{ .symbol = "+" }, .quoted = false },
        sexpr2[0],
    );
    try testing.expectEqual(
        .{ .value = .{ .number = "1" }, .quoted = false },
        sexpr2[1],
    );
    try testing.expectEqual(
        .{ .value = .{ .number = "1" }, .quoted = false },
        sexpr2[2],
    );
}

test "Token.tokenize quoted symbol" {
    const input = "'head";
    var i: usize = 0;
    const tokens = try Token.tokenize(testing.allocator, input, &i);
    defer tokens.deinit();
    try testing.expectEqual(@as(usize, 1), tokens.items.len);
    try testing.expectEqual(
        .{ .value = .{ .symbol = "head" }, .quoted = true },
        tokens.items[0],
    );
}

test "Token.tokenize quoted sexpr" {
    const input = "'('hello-world🥳 abc123 '-10000)";
    var i: usize = 0;
    const tokens = try Token.tokenize(testing.allocator, input, &i);
    defer Token.deinitTokens(&tokens);
    try testing.expectEqual(@as(usize, 1), tokens.items.len);
    try testing.expectEqual(true, tokens.items[0].quoted);

    const sexpr = tokens.items[0].value.sexpr.items;
    try testing.expectEqual(
        .{ .value = .{ .symbol = "hello-world🥳" }, .quoted = true },
        sexpr[0],
    );
    try testing.expectEqual(
        .{ .value = .{ .symbol = "abc123" }, .quoted = false },
        sexpr[1],
    );
    try testing.expectEqual(
        .{ .value = .{ .number = "-10000" }, .quoted = true },
        sexpr[2],
    );
}

test "Token.tokenize expressions" {
    const input = "-9 head '(🌚)";
    var i: usize = 0;
    const tokens = try Token.tokenize(testing.allocator, input, &i);
    defer Token.deinitTokens(&tokens);
    try testing.expectEqual(@as(usize, 3), tokens.items.len);

    try testing.expectEqual(
        .{ .value = .{ .number = "-9" }, .quoted = false },
        tokens.items[0],
    );
    try testing.expectEqual(
        .{ .value = .{ .symbol = "head", .quoted = false } },
        tokens.items[1],
    );

    const sexpr = tokens.items[2];
    try testing.expectEqual(true, sexpr.quoted);
    try testing.expectEqual(
        .{ .value = .{ .symbol = "🌚", .quoted = false } },
        sexpr.value.sexpr.items[0],
    );
}

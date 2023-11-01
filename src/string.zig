const std = @import("std");
const fmt = std.fmt;
const mem = std.mem;
const testing = std.testing;
const Allocator = mem.Allocator;
const ArrayList = std.ArrayList;

pub const RawString = []const u8;

pub const String = struct {
    const Self = @This();

    raw: RawString,
    allocator: Allocator,

    pub fn fromSlice(allocator: Allocator, s: RawString) !Self {
        return .{ .raw = try allocator.dupe(u8, s), .allocator = allocator };
    }

    pub fn fromSlices(allocator: Allocator, slices: []const RawString) !Self {
        return .{ .raw = try mem.concat(allocator, u8, slices), .allocator = allocator };
    }

    pub fn fromInt(allocator: Allocator, i: i32) !Self {
        return .{ .raw = try fmt.allocPrint(allocator, "{}", .{i}), .allocator = allocator };
    }

    pub fn deinit(self: *const Self) void {
        self.allocator.free(self.raw);
    }

    pub fn concat(self: *const Self, another: RawString) !String {
        return fromSlices(self.allocator, &[_]RawString{ self.raw, another });
    }

    pub fn joinToString(
        allocator: Allocator,
        strings: []const String,
        delimiter: RawString,
        prefix: ?RawString,
        postfix: ?RawString,
    ) !String {
        if (strings.len == 0) {
            return String.fromSlice(allocator, "");
        }

        var joined = ArrayList(RawString).init(allocator);
        defer joined.deinit();
        if (prefix) |pre| {
            try joined.append(pre);
        }
        for (strings, 0..) |string, i| {
            try joined.append(string.raw);
            if (i != strings.len - 1) {
                try joined.append(delimiter);
            }
        }
        if (postfix) |post| {
            try joined.append(post);
        }

        return String.fromSlices(allocator, joined.items);
    }

    pub fn contain(big: RawString, small: RawString) bool {
        return mem.containsAtLeast(u8, big, 1, small);
    }

    pub fn equal(a: RawString, b: RawString) bool {
        return mem.eql(u8, a, b);
    }
};

test "String.fromSlice" {
    const s = try String.fromSlice(testing.allocator, "Hello, world!");
    defer s.deinit();
    try testing.expectEqualStrings("Hello, world!", s.raw);
    try testing.expectEqual(@as(usize, 13), s.raw.len);
}

test "String.fromSlices" {
    const s = try String.fromSlices(testing.allocator, &[_]RawString{ "Hello, ", "world!" });
    defer s.deinit();
    try testing.expectEqualStrings("Hello, world!", s.raw);
    try testing.expectEqual(@as(usize, 13), s.raw.len);
}

test "String.fromInt" {
    const s = try String.fromInt(testing.allocator, -123);
    defer s.deinit();
    try testing.expectEqualStrings("-123", s.raw);
}

test "String.concat" {
    const s = try String.fromSlice(testing.allocator, "one two three");
    defer s.deinit();
    const concat = try s.concat("-123");
    defer concat.deinit();
    try testing.expectEqualStrings("one two three-123", concat.raw);
}

test "String.joinToString" {
    const s1 = try String.fromSlice(testing.allocator, "😀");
    defer s1.deinit();
    const s2 = try String.fromSlice(testing.allocator, "😃");
    defer s2.deinit();
    const s3 = try String.fromSlice(testing.allocator, "😄");
    defer s3.deinit();
    const s = try String.joinToString(testing.allocator, &[_]String{ s1, s2, s3 }, ", ", "> ", null);
    defer s.deinit();
    try testing.expectEqualStrings("> 😀, 😃, 😄", s.raw);
}

test "String.contain" {
    try testing.expect(String.contain("You are using Zig.", "Zig"));
}

test "String.equal" {
    try testing.expect(String.equal("Drop it!", "Drop it!"));
}

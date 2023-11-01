const std = @import("std");
const testing = std.testing;
const Allocator = std.mem.Allocator;
const ArrayList = std.ArrayList;
const LispValue = @import("lisp_value.zig").LispValue;
const string = @import("string.zig");
const RawString = string.RawString;
const String = string.String;

pub fn eval(lisp_value: *const LispValue) !LispValue {
    if (lisp_value.data != .values or lisp_value.quoted) {
        return lisp_value.clone();
    }

    const function_symbol = lisp_value.data.values.items[0];
    const args = lisp_value.data.values.items[1..];

    if (function_symbol.data != .symbol) {
        const fn_symbol_string = try function_symbol.toString();
        defer fn_symbol_string.deinit();
        const err = try String.fromSlices(lisp_value.allocator, &[_]RawString{ "`", fn_symbol_string.raw, "` is not a function." });
        return LispValue.fromError(lisp_value.allocator, err);
    }

    if (String.equal(function_symbol.data.symbol, "eval")) {
        var value = try args[0].clone();
        value.quoted = false;
        return eval(&value);
    }

    var evaluated_values = try ArrayList(LispValue).initCapacity(lisp_value.allocator, lisp_value.data.values.items.len);
    defer {
        for (evaluated_values.items) |evaluated_value| {
            evaluated_value.deinit();
        }
        evaluated_values.deinit();
    }
    for (lisp_value.data.values.items) |value| {
        const evaluated_value = try eval(&value);
        if (evaluated_value.data == .err) {
            return evaluated_value;
        }
        try evaluated_values.append(evaluated_value);
    }

    const evaluated_fn_symbol = evaluated_values.items[0];
    const evaluated_args = evaluated_values.items[1..];
    const builtin_function = builtin_functions.get(evaluated_fn_symbol.data.symbol) orelse {
        const err = try String.fromSlices(lisp_value.allocator, &[_]RawString{ "Function `", function_symbol.data.symbol, "` is undefined." });
        return LispValue.fromError(lisp_value.allocator, err);
    };
    return builtin_function(evaluated_args);
}

fn add(args: []const LispValue) !LispValue {
    const allocator = args[0].allocator;
    var result: i32 = 0;
    for (args) |arg| {
        if (arg.data != .number) {
            const err = try String.fromSlice(allocator, "The type of args should be `number`.");
            return LispValue.fromError(allocator, err);
        }
        result += arg.data.number;
    }
    return LispValue.fromNumber(allocator, result);
}

fn subtract(args: []const LispValue) !LispValue {
    const first_arg = args[0];
    const allocator = first_arg.allocator;
    const first_number = if (first_arg.data == .number) first_arg.data.number else {
        const err = try String.fromSlice(allocator, "The type of args should be `number`.");
        return LispValue.fromError(allocator, err);
    };

    var result = if (args.len != 1) first_number else return LispValue.fromNumber(allocator, -first_number);
    for (args[1..]) |arg| {
        if (arg.data != .number) {
            const err = try String.fromSlice(allocator, "The type of args should be `number`.");
            return LispValue.fromError(allocator, err);
        }
        result -= arg.data.number;
    }
    return LispValue.fromNumber(allocator, result);
}

fn multiply(args: []const LispValue) !LispValue {
    const allocator = args[0].allocator;
    var result: i32 = 1;
    for (args) |arg| {
        if (arg.data != .number) {
            const err = try String.fromSlice(allocator, "The type of args should be `number`.");
            return LispValue.fromError(allocator, err);
        }
        result *= arg.data.number;
    }
    return LispValue.fromNumber(allocator, result);
}

fn divide(args: []const LispValue) !LispValue {
    const first_arg = args[0];
    const allocator = first_arg.allocator;
    const first_number = if (first_arg.data == .number) first_arg.data.number else {
        const err = try String.fromSlice(allocator, "The type of args should be `number`.");
        return LispValue.fromError(allocator, err);
    };

    var result = if (args.len != 1) first_number else if (first_number == 0) {
        const err = try String.fromSlice(allocator, "The divisor cannot be 0.");
        return LispValue.fromError(allocator, err);
    } else return LispValue.fromNumber(allocator, @divTrunc(1, first_number));

    for (args[1..]) |arg| {
        if (arg.data != .number) {
            const err = try String.fromSlice(allocator, "The type of args should be `number`.");
            return LispValue.fromError(allocator, err);
        }
        const number = arg.data.number;
        if (number == 0) {
            const err = try String.fromSlice(allocator, "The divisor cannot be 0.");
            return LispValue.fromError(allocator, err);
        }
        result = @divTrunc(result, number);
    }
    return LispValue.fromNumber(allocator, result);
}

fn list(args: []const LispValue) !LispValue {
    const allocator = args[0].allocator;
    return .{ .data = .{ .values = ArrayList(LispValue).fromOwnedSlice(allocator, try allocator.dupe(LispValue, args)) }, .quoted = true, .allocator = allocator };
}

fn head(args: []const LispValue) !LispValue {
    return args[0].data.values.items[0].clone();
}

const builtin_functions = std.ComptimeStringMap(*const fn ([]const LispValue) anyerror!LispValue, .{
    .{
        "+",
        &add,
    },
    .{
        "-",
        &subtract,
    },
    .{
        "*",
        &multiply,
    },
    .{
        "/",
        &divide,
    },
    .{
        "list",
        &list,
    },
    .{
        "head",
        &head,
    },
});

test "builtin.add" {
    const a = LispValue.fromNumber(testing.allocator, -1);
    const b = LispValue.fromNumber(testing.allocator, 1000);
    const result = try add(&[_]LispValue{ a, b });
    try testing.expectEqual(@as(i32, 999), result.data.number);
}

test "builtin.add 'a'" {
    const a = LispValue.fromSymbol(testing.allocator, "a");
    const result = try add(&[_]LispValue{a});
    defer result.deinit();
    try testing.expectEqualStrings("The type of args should be `number`.", result.data.err.raw);
}

test "builtin.subtract" {
    const a = LispValue.fromNumber(testing.allocator, -1);
    const b = LispValue.fromNumber(testing.allocator, 1000);
    const result = try subtract(&[_]LispValue{ a, b });
    try testing.expectEqual(@as(i32, -1001), result.data.number);
}

test "builtin.subtract 10" {
    const a = LispValue.fromNumber(testing.allocator, 10);
    const result = try subtract(&[_]LispValue{a});
    try testing.expectEqual(@as(i32, -10), result.data.number);
}

test "builtin.subtract -10" {
    const a = LispValue.fromNumber(testing.allocator, -10);
    const result = try subtract(&[_]LispValue{a});
    try testing.expectEqual(@as(i32, 10), result.data.number);
}

test "builtin.multiply" {
    const a = LispValue.fromNumber(testing.allocator, -1);
    const b = LispValue.fromNumber(testing.allocator, 1000);
    const result = try multiply(&[_]LispValue{ a, b });
    try testing.expectEqual(@as(i32, -1000), result.data.number);
}

test "builtin.divide" {
    const a = LispValue.fromNumber(testing.allocator, -1);
    const b = LispValue.fromNumber(testing.allocator, 1000);
    const result = try divide(&[_]LispValue{ a, b });
    try testing.expectEqual(@as(i32, 0), result.data.number);
}

test "builtin.divide 0" {
    const a = LispValue.fromNumber(testing.allocator, 0);
    const result = try divide(&[_]LispValue{a});
    defer result.deinit();
    try testing.expectEqualStrings("The divisor cannot be 0.", result.data.err.raw);
}

test "builtin.divide 0 1" {
    const a = LispValue.fromNumber(testing.allocator, 0);
    const b = LispValue.fromNumber(testing.allocator, 1);
    const result = try divide(&[_]LispValue{ a, b });
    try testing.expectEqual(@as(i32, 0), result.data.number);
}

test "builtin.divide 1 0" {
    const a = LispValue.fromNumber(testing.allocator, 1);
    const b = LispValue.fromNumber(testing.allocator, 0);
    const result = try divide(&[_]LispValue{ a, b });
    defer result.deinit();
    try testing.expectEqualStrings("The divisor cannot be 0.", result.data.err.raw);
}

test "builtin.eval (1)" {
    var value = LispValue.initValues(testing.allocator, false);
    defer value.deinit();
    const number = LispValue.fromNumber(testing.allocator, 1);
    try value.data.values.append(number);
    const err = try eval(&value);
    defer err.deinit();
    try testing.expectEqualStrings("`1` is not a function.", err.data.err.raw);
}

test "builtin.eval (f)" {
    var value = LispValue.initValues(testing.allocator, false);
    defer value.deinit();
    const f_symbol = LispValue.fromSymbol(testing.allocator, "f");
    try value.data.values.append(f_symbol);
    const err = try eval(&value);
    defer err.deinit();
    try testing.expectEqualStrings("Function `f` is undefined.", err.data.err.raw);
}

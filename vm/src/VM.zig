const std = @import("std");
const debug = std.debug;
const fmt = std.fmt;
const heap = std.heap;
const math = std.math;
const mem = std.mem;

const Var = union(VarType) { i64: i64, bool: bool };
const VarType = enum { i64, bool };

pub const Instruction = enum(u8) { add, push, load };

const Error = error{ Runtime, MaxVariableNumberExceeded } || mem.Allocator.Error;

const Self = @This();

pub const max_slot_size = math.maxInt(u16);

gpa: *heap.DebugAllocator(.{}),
allocator: mem.Allocator,

vars: std.ArrayList(Var) = .empty,
local: std.ArrayList(Var) = .empty,
stack: std.ArrayList(Var) = .empty,

err_buf: [1024]u8 = undefined,
err: []const u8 = "",

pub fn init() Self {
    const gpa = heap.c_allocator.create(heap.DebugAllocator(.{})) catch @panic("failed to create the allocator");
    gpa.* = .init;
    return .{ .gpa = gpa, .allocator = gpa.allocator() };
}

pub fn deinit(self: *Self) void {
    self.vars.deinit(self.allocator);
    self.local.deinit(self.allocator);
    self.stack.deinit(self.allocator);
    debug.assert(self.gpa.deinit() == .ok);
    heap.c_allocator.destroy(self.gpa);
}

pub fn execute(self: *Self, bytecode: []const u8) Error!void {
    defer {
        debug.print("vars: {any}\n", .{self.vars.items});
        debug.print("stack: {any}\n", .{self.stack.items});
    }

    var i: usize = 0;
    while (i < bytecode.len) : (i += 1) {
        const instruction: Instruction = @enumFromInt(bytecode[i]);
        switch (instruction) {
            .add => {
                const lhs = switch (self.pop()) {
                    .i64 => |v| v,
                    else => |v| {
                        self.err = fmt.bufPrint(
                            &self.err_buf,
                            "evaluating `add`: expecting `i64`, found `{t}`",
                            .{v},
                        ) catch unreachable;
                        return Error.Runtime;
                    },
                };
                const rhs = switch (self.pop()) {
                    .i64 => |v| v,
                    else => |v| {
                        self.err = fmt.bufPrint(
                            &self.err_buf,
                            "evaluating `add`: expecting `i64`, found `{t}`",
                            .{v},
                        ) catch unreachable;
                        return Error.Runtime;
                    },
                };
                debug.print("{}\n", .{lhs + rhs});
            },
            .push => {
                try self.pushToList(
                    self.vars.items[mem.readVarInt(u16, bytecode[i + 1 .. i + 3], .little)],
                    &self.stack,
                );
                i += 2;
            },
            .load => {
                try self.pushToList(
                    self.stack.items[mem.readVarInt(u16, bytecode[i + 1 .. i + 3], .little)],
                    &self.stack,
                );
                i += 2;
            },
        }
    }
}

pub fn addVar(self: *Self, variable: Var) Error!u16 {
    if (self.vars.items.len >= max_slot_size) {
        self.err = fmt.bufPrint(
            &self.err_buf,
            "adding variable to memory: max variable number exceeded, which is `{}`",
            .{max_slot_size},
        ) catch unreachable;
        return Error.MaxVariableNumberExceeded;
    }
    try self.pushToList(variable, &self.vars);
    return @as(u16, @intCast(self.vars.items.len - 1));
}

fn pop(self: *Self) Var {
    return self.stack.pop().?;
}

fn pushToList(self: *Self, x: Var, xs: *std.ArrayList(Var)) !void {
    xs.append(self.allocator, x) catch |err| {
        self.err = fmt.bufPrint(&self.err_buf, "OOM", .{}) catch unreachable;
        return err;
    };
}

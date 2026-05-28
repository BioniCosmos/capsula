const std = @import("std");
const debug = std.debug;
const fmt = std.fmt;
const heap = std.heap;
const Io = std.Io;
const math = std.math;
const mem = std.mem;
const meta = std.meta;

const msgpack = @import("msgpack");

pub const Var = union(VarType) {
    unit: void,
    bool: bool,
    i64: i64,

    pub fn format(self: @This(), writer: *Io.Writer) Io.Writer.Error!void {
        switch (self) {
            .unit => {},
            inline else => |x| try writer.print("{}", .{x}),
        }
    }

    pub fn serialize(self: Var, allocator: mem.Allocator) !msgpack.Payload {
        const varType = msgpack.Payload.uintToPayload(@intFromEnum(self));
        const value = switch (self) {
            .unit => msgpack.Payload.nilToPayload(),
            .bool => |x| msgpack.Payload.boolToPayload(x),
            .i64 => |x| msgpack.Payload.intToPayload(x),
        };

        var payload = try msgpack.Payload.arrPayload(2, allocator);
        try payload.setArrElement(0, varType);
        try payload.setArrElement(1, value);

        return payload;
    }

    pub fn deserialize(serialized: msgpack.Payload) !Var {
        const varType: VarType = @enumFromInt(try (try serialized.getArrElement(0)).asUint());
        return switch (varType) {
            .unit => .{ .unit = {} },
            .bool => .{ .bool = try (try serialized.getArrElement(1)).asBool() },
            .i64 => .{ .i64 = try (try serialized.getArrElement(1)).getInt() },
        };
    }
};

const VarType = enum { unit, bool, i64 };

pub const Instruction = enum(u8) { add, sub, mul, div, rem, eq, push, load, save, jump, beqz, is_i64 };

const Error = error{ Runtime, MaxVariableNumberExceeded } || mem.Allocator.Error;

const Self = @This();

pub const max_slot_size = math.maxInt(u16);

gpa: *heap.DebugAllocator(.{}),
allocator: mem.Allocator,

vars: std.ArrayList(Var) = .empty,
local: [1024 * 1024]Var = undefined,
stack: std.ArrayList(Var) = .empty,

err_buf: [1024]u8 = undefined,
err: []const u8 = "",

result_buf: [1024]u8 = undefined,

pub fn init() Self {
    const gpa = heap.c_allocator.create(heap.DebugAllocator(.{})) catch @panic("failed to create the allocator");
    gpa.* = .init;
    return .{ .gpa = gpa, .allocator = gpa.allocator() };
}

pub fn deinit(self: *Self) void {
    self.vars.deinit(self.allocator);
    self.stack.deinit(self.allocator);
    debug.assert(self.gpa.deinit() == .ok);
    heap.c_allocator.destroy(self.gpa);
}

pub fn execute(self: *Self, bytecode: []const u8) Error!Var {
    defer {
        debug.print("vars: {any}\n", .{self.vars.items});
        debug.print("stack: {any}\n", .{self.stack.items});
    }

    var i: usize = 0;
    while (i < bytecode.len) : (i += 1) {
        const instruction: Instruction = @enumFromInt(bytecode[i]);
        switch (instruction) {
            .add => try self.pushToList(.{ .i64 = self.pop().i64 + self.pop().i64 }, &self.stack),
            .sub => try self.pushToList(.{ .i64 = self.pop().i64 - self.pop().i64 }, &self.stack),
            .mul => try self.pushToList(.{ .i64 = self.pop().i64 * self.pop().i64 }, &self.stack),
            .div => try self.pushToList(.{ .i64 = @divTrunc(self.pop().i64, self.pop().i64) }, &self.stack),
            .rem => try self.pushToList(.{ .i64 = @rem(self.pop().i64, self.pop().i64) }, &self.stack),
            .eq => try self.pushToList(.{ .bool = meta.eql(self.pop(), self.pop()) }, &self.stack),
            .push => try self.pushToList(self.vars.items[read(u16, bytecode, &i)], &self.stack),
            .load => try self.pushToList(self.local[read(u16, bytecode, &i)], &self.stack),
            .save => self.local[read(u16, bytecode, &i)] = self.pop(),
            .jump => {
                const current = i;
                i = jump(current, read(i16, bytecode, &i));
            },
            .beqz => {
                const current = i;
                const offset = read(i16, bytecode, &i);
                if (!self.pop().bool) {
                    i = jump(current, offset);
                }
            },
            .is_i64 => try self.pushToList(.{ .bool = self.pop() == .i64 }, &self.stack),
        }
    }

    return self.stack.pop() orelse .{ .unit = {} };
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

fn read(T: type, bytecode: []const u8, i: *usize) T {
    const size = @sizeOf(T);
    const addr = mem.readVarInt(T, bytecode[i.* + 1 .. i.* + size + 1], .little);
    i.* += size;
    return addr;
}

fn jump(from: usize, offset: i16) usize {
    return @intCast(@as(isize, @intCast(from)) + @as(isize, @intCast(offset)) - 1);
}

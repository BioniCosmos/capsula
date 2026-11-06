const std = @import("std");
const debug = std.debug;
const fmt = std.fmt;
const heap = std.heap;
const Io = std.Io;
const log = std.log;
const math = std.math;
const mem = std.mem;
const meta = std.meta;

const msgpack = @import("msgpack");

pub const Var = union(enum) {
    unit: void,
    bool: bool,
    i64: i64,
    sym: []const u8,
    arr: []const Var,
    @"struct": Struct,
    str: []const u8,
    @"fn": u64,
    state: State,

    pub fn format(self: @This(), writer: *Io.Writer) Io.Writer.Error!void {
        switch (self) {
            .unit => try writer.print("()", .{}),
            .arr => |xs| {
                if (xs.len == 0) {
                    try writer.print("[]", .{});
                    return;
                }
                try writer.print("[", .{});
                for (xs) |x| {
                    try writer.print(" {f}", .{x});
                }
                try writer.print(" ]", .{});
            },
            .@"struct" => |x| {
                const m = structs[x.meta];
                if (x.value.len == 0) {
                    try writer.print("{s} {{}}", .{m.name});
                    return;
                }
                try writer.print("{s} {{", .{m.name});
                var sep: []const u8 = " ";
                for (x.value, 0..) |field, i| {
                    try writer.print("{s}{s} = {f}", .{ sep, m.fields[i], field });
                    sep = ", ";
                }
                try writer.print(" }}", .{});
            },
            .sym, .str => |x| try writer.print("{s}", .{x}),
            inline else => |x| try writer.print("{}", .{x}),
        }
    }
};

const Struct = struct { value: []const Var, meta: usize };

fn sexprToVar(serialized: msgpack.Payload) Var {
    return switch (serialized) {
        .bool => |x| .{ .bool = x },
        .int => |x| .{ .i64 = x },
        .uint => |x| .{ .i64 = @intCast(x) },
        .str => |x| .{ .str = x.value() },
        else => unreachable,
    };
}

/// All the memory should be allocated by arena.
pub const Fn = struct {
    code: []const u8,
    constants: []const Var,
    local_count: usize,

    pub fn deserialize(allocator: mem.Allocator, serialized: msgpack.Payload) !Fn {
        const constants_payload = (try serialized.mapGet("constants")).?;
        const constants = try allocator.alloc(Var, try constants_payload.getArrLen());
        for (constants, 0..) |*constant, i| {
            constant.* = sexprToVar(try constants_payload.getArrElement(i));
        }
        return .{
            .code = try (try serialized.mapGet("code")).?.asBin(),
            .constants = constants,
            .local_count = try (try serialized.mapGet("local_count")).?.getUint(),
        };
    }
};

pub const StructMeta = struct {
    name: []const u8,
    fields: [][]const u8,

    pub fn deserialize(allocator: mem.Allocator, serialized: msgpack.Payload) !StructMeta {
        const serialized_fields = (try serialized.mapGet("fields")).?;
        const fields = try allocator.alloc([]const u8, try serialized_fields.getArrLen());
        for (fields, 0..) |*field, i| {
            field.* = try (try serialized_fields.getArrElement(i)).asStr();
        }
        return .{ .name = try (try serialized.mapGet("name")).?.asStr(), .fields = fields };
    }
};
pub var structs: []const StructMeta = undefined;

pub fn deserialize(T: type, allocator: mem.Allocator, serialized: msgpack.Payload, key: []const u8) ![]T {
    const serialized_field = (try serialized.mapGet(key)).?;
    const field = try allocator.alloc(T, try serialized_field.getArrLen());
    for (field, 0..) |*field_element, i| {
        field_element.* = try T.deserialize(allocator, try serialized_field.getArrElement(i));
    }
    return field;
}

const State = struct { func: usize, pc: usize, base: usize };

pub const Instruction = enum(u8) {
    add,
    sub,
    mul,
    div,
    rem,
    eq,
    ne,
    lt,
    gt,
    le,
    ge,
    push,
    pop,
    load,
    save,
    jump,
    call,
    native_call,
    ret,
    beqz,
};

const Error = error{MaxVariableNumberExceeded} || mem.Allocator.Error || Io.Writer.Error;

const Self = @This();

pub const max_slot_size = math.maxInt(u16);

allocator: mem.Allocator,
io: Io,

local: [1024]Var = undefined,
pc: usize = 0,
base: usize = 0,
top: usize = 0,
stack: std.ArrayList(Var) = .empty,

err_buf: [1024]u8 = undefined,
err: []const u8 = "",

result_buf: [1024]u8 = undefined,

stdout_buf: [1024]u8 = undefined,
stdout_writer: Io.File.Writer = undefined,
stdout: *Io.Writer = undefined,

pub fn init(allocator: mem.Allocator, io: Io) !*Self {
    const vm = try allocator.create(Self);
    vm.* = .{ .allocator = allocator, .io = io };

    vm.stdout_writer = Io.File.stdout().writer(vm.io, &vm.stdout_buf);
    vm.stdout = &vm.stdout_writer.interface;

    return vm;
}

pub fn deinit(self: *Self) void {
    self.stdout.flush() catch |e| log.warn("VM.deinit: failed to flush stdout: {}", .{e});

    self.stack.deinit(self.allocator);

    const allocator = self.allocator;
    allocator.destroy(self);
}

pub fn execute(self: *Self, functions: []const Fn) Error!Var {
    if (functions.len == 0) {
        return .{ .unit = {} };
    }

    self.top = functions[0].local_count;

    var fn_idx: usize = 0;
    var stop_add = false;
    while (self.pc < functions[fn_idx].code.len) : ({
        if (stop_add) {
            stop_add = false;
        } else {
            self.pc += 1;
        }
    }) {
        const func = functions[fn_idx];
        const instruction: Instruction = @fromBackingInt(func.code[self.pc]);

        switch (instruction) {
            .add => try self.pushToList(.{ .i64 = self.pop().i64 + self.pop().i64 }, &self.stack),
            .sub => try self.pushToList(.{ .i64 = self.pop().i64 - self.pop().i64 }, &self.stack),
            .mul => try self.pushToList(.{ .i64 = self.pop().i64 * self.pop().i64 }, &self.stack),
            .div => try self.pushToList(.{ .i64 = @divTrunc(self.pop().i64, self.pop().i64) }, &self.stack),
            .rem => try self.pushToList(.{ .i64 = @rem(self.pop().i64, self.pop().i64) }, &self.stack),
            .eq => try self.pushToList(.{ .bool = meta.eql(self.pop(), self.pop()) }, &self.stack),
            .ne => try self.pushToList(.{ .bool = !meta.eql(self.pop(), self.pop()) }, &self.stack),
            .lt => try self.pushToList(.{ .bool = self.pop().i64 < self.pop().i64 }, &self.stack),
            .gt => try self.pushToList(.{ .bool = self.pop().i64 > self.pop().i64 }, &self.stack),
            .le => try self.pushToList(.{ .bool = self.pop().i64 <= self.pop().i64 }, &self.stack),
            .ge => try self.pushToList(.{ .bool = self.pop().i64 >= self.pop().i64 }, &self.stack),
            .push => try self.pushToList(func.constants[self.read(u16, func.code)], &self.stack),
            .pop => _ = self.pop(),
            .load => try self.pushToList(self.local[self.base + self.read(u16, func.code)], &self.stack),
            .save => self.local[self.base + self.read(u16, func.code)] = self.pop(),
            .jump => {
                const current = self.pc;
                self.pc = jump(current, self.read(i16, func.code));
                stop_add = true;
            },
            .call => {
                const old_fn_idx = fn_idx;
                fn_idx = self.read(u16, func.code);

                const state = State{ .func = old_fn_idx, .pc = self.pc, .base = self.base };
                self.local[self.top] = .{ .state = state };

                self.pc = 0;
                stop_add = true;
                self.base = self.top + 1;
                self.top = self.base + functions[fn_idx].local_count;
            },
            .native_call => native_functions.get(self.pop().str).?(self) catch |err|
                if (err == NativeFnError.Break) break else return @errorCast(err),
            .ret => {
                const top = self.base - 1;
                const state = self.local[top].state;
                fn_idx = state.func;
                self.pc = state.pc;
                self.base = state.base;
                self.top = top;
            },
            .beqz => {
                const current = self.pc;
                const offset = self.read(i16, func.code);
                if (!self.pop().bool) {
                    self.pc = jump(current, offset);
                    stop_add = true;
                }
            },
        }
    }

    return self.stack.pop() orelse .{ .unit = {} };
}

fn read(self: *Self, T: type, bytecode: []const u8) T {
    const size = @sizeOf(T);
    const addr = mem.readVarInt(T, bytecode[self.pc + 1 .. self.pc + size + 1], .little);
    self.pc += size;
    return addr;
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

fn jump(from: usize, offset: i16) usize {
    return @intCast(@as(isize, @intCast(from)) + @as(isize, @intCast(offset)));
}

const NativeFnError = error{Break} || mem.Allocator.Error || Io.Writer.Error;

var native_functions = std.StaticStringMap(*const fn (vm: *Self) NativeFnError!void).initComptime(.{
    .{ "panic", &panic },
    .{ "type-of", &typeOf },
    .{ "type-name", &typeName },
    .{ "size-of", &sizeOf },
    .{ "print", &print },
    .{ "unit", &unit },
    .{ "array-new", &arrayNew },
    .{ "array-len", &arrayLen },
    .{ "array-at", &arrayAt },
    .{ "struct", &@"struct" },
});

fn panic(vm: *Self) !void {
    debug.print("{s}:{}:{} panic: ", .{ vm.pop().str, vm.pop().i64, vm.pop().i64 });
    const format = vm.pop().str;
    var prev: u8 = 0;
    for (format) |c| {
        if (c == '}' and prev == '{') {
            debug.print("{f}", .{vm.pop()});
        } else if (c != '}' and prev == '{') {
            debug.print("}}{c}", .{c});
        } else if (c != '{') {
            debug.print("{c}", .{c});
        }
        prev = c;
    }
    debug.print("\n", .{});
    return NativeFnError.Break;
}

fn typeOf(vm: *Self) !void {
    try vm.pushToList(.{ .i64 = @backingInt(vm.pop()) }, &vm.stack);
}

fn typeName(vm: *Self) !void {
    try vm.pushToList(.{ .str = @tagName(vm.pop()) }, &vm.stack);
}

fn sizeOf(vm: *Self) !void {
    try vm.pushToList(.{ .i64 = @sizeOf(Var) }, &vm.stack);
}

fn print(vm: *Self) !void {
    vm.stdout.print("{f}", .{vm.pop()}) catch |err| {
        vm.err = fmt.bufPrint(&vm.err_buf, "failed to print", .{}) catch unreachable;
        return err;
    };
    vm.stdout.flush() catch |err| {
        vm.err = fmt.bufPrint(&vm.err_buf, "failed to flush", .{}) catch unreachable;
        return err;
    };
}

fn unit(vm: *Self) !void {
    try vm.pushToList(.{ .unit = {} }, &vm.stack);
}

fn arrayNew(vm: *Self) !void {
    const len: usize = @intCast(vm.pop().i64);
    const xs = vm.allocator.alloc(Var, len) catch |err| {
        vm.err = fmt.bufPrint(&vm.err_buf, "failed to allocate memory for array", .{}) catch unreachable;
        return err;
    };
    for (0..len) |i| {
        xs[i] = vm.pop();
    }
    try vm.pushToList(.{ .arr = xs }, &vm.stack);
}

fn arrayLen(vm: *Self) !void {
    try vm.pushToList(.{ .i64 = @intCast(vm.pop().arr.len) }, &vm.stack);
}

fn arrayAt(vm: *Self) !void {
    const xs = switch (vm.pop()) {
        .arr => |xs| xs,
        .@"struct" => |x| x.value,
        else => unreachable,
    };
    const i = vm.pop().i64;
    try vm.pushToList(xs[@intCast(i)], &vm.stack);
}

fn @"struct"(vm: *Self) !void {
    const m: usize = @intCast(vm.pop().i64);
    const len: usize = @intCast(vm.pop().i64);
    const xs = vm.allocator.alloc(Var, len) catch |err| {
        vm.err = fmt.bufPrint(&vm.err_buf, "failed to allocate memory for array", .{}) catch unreachable;
        return err;
    };
    for (0..len) |i| {
        xs[i] = vm.pop();
    }
    try vm.pushToList(.{ .@"struct" = .{ .meta = m, .value = xs } }, &vm.stack);
}

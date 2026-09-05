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
    array: []const Var,
    str: []const u8,
    state: State,

    pub fn format(self: @This(), writer: *Io.Writer) Io.Writer.Error!void {
        switch (self) {
            .unit => try writer.print("()", .{}),
            .array => |xs| {
                try writer.print("[{}]: [{f}", .{ xs.len, xs[0] });
                for (xs[1..]) |x| {
                    try writer.print(" {f}", .{x});
                }
                try writer.print("]", .{});
            },
            .str => |x| try writer.print("{s}", .{x}),
            inline else => |x| try writer.print("{}", .{x}),
        }
    }
};

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
    load,
    save,
    jump,
    call,
    native_call,
    ret,
    beqz,
    unit,
    is_i64,
    print,
    array_new,
    array_get,
    array_set,
    array_len,
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
        const instruction: Instruction = @enumFromInt(func.code[self.pc]);

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
            .unit => try self.pushToList(.{ .unit = {} }, &self.stack),
            .is_i64 => try self.pushToList(.{ .bool = self.pop() == .i64 }, &self.stack),
            .print => {
                self.stdout.print("{f}", .{self.pop()}) catch |err| {
                    self.err = fmt.bufPrint(&self.err_buf, "failed to print", .{}) catch unreachable;
                    return err;
                };
                self.stdout.flush() catch |err| {
                    self.err = fmt.bufPrint(&self.err_buf, "failed to flush", .{}) catch unreachable;
                    return err;
                };
            },
            .array_new => {
                const len = self.read(u16, func.code);
                const xs = self.allocator.alloc(Var, len) catch |err| {
                    self.err = fmt.bufPrint(
                        &self.err_buf,
                        "failed to allocate memory for array",
                        .{},
                    ) catch unreachable;
                    return err;
                };
                for (0..len) |idx| {
                    xs[idx] = self.pop();
                }
                try self.pushToList(.{ .array = xs }, &self.stack);
            },
            .array_get => try self.pushToList(self.pop().array[self.read(u16, func.code)], &self.stack),
            .array_set => debug.panic("TODO", .{}),
            .array_len => debug.panic("TODO", .{}),
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

const NativeFnError = error{Break} || mem.Allocator.Error;

var native_functions = std
    .StaticStringMap(*const fn (vm: *Self) NativeFnError!void)
    .initComptime(.{ .{ "panic", &panic }, .{ "type-of", &typeOf }, .{ "type-name", &typeName } });

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
    try vm.pushToList(.{ .i64 = @intFromEnum(vm.pop()) }, &vm.stack);
}

fn typeName(vm: *Self) !void {
    try vm.pushToList(.{ .str = @tagName(vm.pop()) }, &vm.stack);
}

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
    arr: *const Ref(Var, .stack),
    @"struct": *const Ref(Var, .stack),
    str: *const Ref(u8, .data),
    @"fn": u64,
    state: State,
};

fn Ref(T: type, segment: Segment) type {
    const Base = struct { id: usize = 0, len: usize };

    if (segment == .data) {
        return struct {
            const Self = @This();

            base: Base,
            data: [*]const T,

            fn init(allocator: mem.Allocator, base: Base, data: ?[*]const T) !*const Self {
                const x = try allocator.create(Self);
                x.base = base;
                if (data) |d| {
                    x.data = d;
                }
                return x;
            }

            fn deinit(self: *const Self, allocator: mem.Allocator) void {
                allocator.destroy(self);
            }

            inline fn items(self: *const Self) []const T {
                return self.data[0..self.base.len];
            }

            inline fn itemsMut(self: *Self) []T {
                return @constCast(self.items());
            }

            fn toHeap(self: *const Self, allocator: mem.Allocator) !*Ref(T, .heap) {
                return .init(allocator, self.base, self.items().ptr);
            }
        };
    }

    return struct {
        const Self = @This();
        const alignment = mem.Alignment.max(.of(Self), .of(T));
        const data_offset = alignment.forward(@sizeOf(Self));

        base: Base,
        size: usize,

        fn init(allocator: mem.Allocator, base: Base, data: ?[*]const T) !*Self {
            const size = data_offset + base.len * @sizeOf(T);
            const raw = try allocator.alignedAlloc(u8, alignment, size);
            const x: *Self = @ptrCast(raw.ptr);
            x.* = .{ .base = base, .size = size };
            if (data) |d| {
                @memcpy(x.itemsMut(), d);
            }
            return x;
        }

        fn deinit(self: *const Self, allocator: mem.Allocator) void {
            const raw: [*]align(alignment.toByteUnits()) const u8 = @ptrCast(@alignCast(self));
            allocator.free(raw[0..self.size]);
        }

        inline fn items(self: *const Self) []const T {
            const raw: [*]const u8 = @ptrCast(self);
            const xs: [*]const T = @ptrCast(@alignCast(raw + data_offset));
            return xs[0..self.base.len];
        }

        inline fn itemsMut(self: *Self) []T {
            return @constCast(self.items());
        }

        fn toHeap(self: *const Self, allocator: mem.Allocator) !*Ref(T, .heap) {
            return .init(allocator, self.base, self.items().ptr);
        }
    };
}

const Segment = enum(u8) { stack, heap, data };

fn sexprToVar(vm: *VM, serialized: msgpack.Payload) !Var {
    return switch (serialized) {
        .bool => |x| .{ .bool = x },
        .int => |x| .{ .i64 = x },
        .uint => |x| .{ .i64 = @intCast(x) },
        .str => |x| .{
            .str = try Ref(u8, .data)
                .init(vm.stack_allocator, .{ .len = x.value().len }, x.value().ptr),
        },
        else => unreachable,
    };
}

/// All the memory should be allocated by arena.
pub const Fn = struct {
    code: []const u8,
    constants: []const Var,
    local_count: usize,

    pub fn deserialize(allocator: mem.Allocator, vm: *VM, serialized: msgpack.Payload) !Fn {
        const constants_payload = (try serialized.mapGet("constants")).?;
        const constants = try allocator.alloc(Var, try constants_payload.getArrLen());
        for (constants, 0..) |*constant, i| {
            constant.* = try sexprToVar(vm, try constants_payload.getArrElement(i));
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

    pub fn deserialize(allocator: mem.Allocator, _: *VM, serialized: msgpack.Payload) !StructMeta {
        const serialized_fields = (try serialized.mapGet("fields")).?;
        const fields = try allocator.alloc([]const u8, try serialized_fields.getArrLen());
        for (fields, 0..) |*field, i| {
            field.* = try (try serialized_fields.getArrElement(i)).asStr();
        }
        return .{ .name = try (try serialized.mapGet("name")).?.asStr(), .fields = fields };
    }
};

pub fn deserialize(
    T: type,
    allocator: mem.Allocator,
    vm: *VM,
    serialized: msgpack.Payload,
    key: []const u8,
) ![]T {
    const serialized_field = (try serialized.mapGet(key)).?;
    const field = try allocator.alloc(T, try serialized_field.getArrLen());
    for (field, 0..) |*field_element, i| {
        field_element.* = try T.deserialize(allocator, vm, try serialized_field.getArrElement(i));
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

const VM = @This();

pub const max_slot_size = math.maxInt(u16);

allocator: mem.Allocator,
io: Io,

structs: []const StructMeta = &.{},
local: [1024]Var = undefined,
pc: usize = 0,
base: usize = 0,
top: usize = 0,

raw: [1024]u8 = undefined,
raw_allocator: heap.FixedBufferAllocator = undefined,
stack_allocator: mem.Allocator = undefined,

stack: std.ArrayList(Var) = .empty,

err_buf: [1024]u8 = undefined,
err: []const u8 = "",

result_buf: [1024]u8 = undefined,

stdout_buf: [1024]u8 = undefined,
stdout_writer: Io.File.Writer = undefined,
stdout: *Io.Writer = undefined,

pub fn init(allocator: mem.Allocator, io: Io) !*VM {
    const vm = try allocator.create(VM);
    vm.* = .{ .allocator = allocator, .io = io };

    vm.raw_allocator = .init(&vm.raw);
    vm.stack_allocator = vm.raw_allocator.allocator();

    vm.stdout_writer = Io.File.stdout().writer(vm.io, &vm.stdout_buf);
    vm.stdout = &vm.stdout_writer.interface;

    return vm;
}

pub fn deinit(self: *VM) void {
    self.stdout.flush() catch |e| log.warn("VM.deinit: failed to flush stdout: {}", .{e});

    self.stack.deinit(self.allocator);

    const allocator = self.allocator;
    allocator.destroy(self);
}

pub fn execute(self: *VM, functions: []const Fn) Error!Var {
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
            .native_call => native_functions.get(self.pop().str.items()).?(self) catch |err|
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

fn read(self: *VM, T: type, bytecode: []const u8) T {
    const size = @sizeOf(T);
    const addr = mem.readVarInt(T, bytecode[self.pc + 1 .. self.pc + size + 1], .little);
    self.pc += size;
    return addr;
}

fn pop(self: *VM) Var {
    return self.stack.pop().?;
}

fn pushToList(self: *VM, x: Var, xs: *std.ArrayList(Var)) !void {
    xs.append(self.allocator, x) catch |err| {
        self.err = fmt.bufPrint(&self.err_buf, "OOM", .{}) catch unreachable;
        return err;
    };
}

fn jump(from: usize, offset: i16) usize {
    return @intCast(@as(isize, @intCast(from)) + @as(isize, @intCast(offset)));
}

const NativeFnError = error{Break} || mem.Allocator.Error || Io.Writer.Error;

var native_functions = std.StaticStringMap(*const fn (vm: *VM) NativeFnError!void).initComptime(.{
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

fn panic(vm: *VM) !void {
    debug.print("{s}:{}:{} panic: ", .{ vm.pop().str.items(), vm.pop().i64, vm.pop().i64 });
    const format = vm.pop().str.items();
    var prev: u8 = 0;
    for (format) |c| {
        if (c == '}' and prev == '{') {
            debug.print("{}", .{vm.pop()});
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

fn typeOf(vm: *VM) !void {
    try vm.pushToList(.{ .i64 = @backingInt(vm.pop()) }, &vm.stack);
}

fn typeName(vm: *VM) !void {
    const s = @tagName(vm.pop());
    try vm.pushToList(
        .{ .str = try .init(vm.stack_allocator, .{ .len = s.len }, s.ptr) },
        &vm.stack,
    );
}

fn sizeOf(vm: *VM) !void {
    try vm.pushToList(.{ .i64 = @sizeOf(Var) }, &vm.stack);
}

fn print(vm: *VM) !void {
    displayVar(vm, vm.pop()) catch |err| {
        vm.err = fmt.bufPrint(&vm.err_buf, "failed to print", .{}) catch unreachable;
        return err;
    };
    vm.stdout.flush() catch |err| {
        vm.err = fmt.bufPrint(&vm.err_buf, "failed to flush", .{}) catch unreachable;
        return err;
    };
}

fn displayVar(vm: *const VM, value: Var) !void {
    const w = vm.stdout;
    switch (value) {
        .unit => try w.print("()", .{}),
        .sym => |x| try w.print("{s}", .{x}),
        .arr => |ref| {
            if (ref.base.len == 0) {
                try w.print("[]", .{});
                return;
            }
            try w.print("[", .{});
            for (ref.items()) |x| {
                try w.print(" ", .{});
                try displayVar(vm, x);
            }
            try w.print(" ]", .{});
        },
        .@"struct" => |ref| {
            const m = vm.structs[ref.base.id];
            if (ref.base.len == 0) {
                try w.print("{s} {{}}", .{m.name});
                return;
            }
            try w.print("{s} {{", .{m.name});
            var sep: []const u8 = " ";
            for (ref.items(), m.fields) |x, field| {
                try w.print("{s}{s} = ", .{ sep, field });
                try displayVar(vm, x);
                sep = ", ";
            }
            try w.print(" }}", .{});
        },
        .str => |ref| try w.print("{s}", .{ref.items()}),
        inline else => |x| try w.print("{}", .{x}),
    }
}

fn unit(vm: *VM) !void {
    try vm.pushToList(.{ .unit = {} }, &vm.stack);
}

fn arrayNew(vm: *VM) !void {
    const len: u64 = @intCast(vm.pop().i64);
    var ref = try Ref(Var, .stack).init(vm.stack_allocator, .{ .len = len }, null);
    const xs = ref.itemsMut();
    for (0..len) |i| {
        xs[i] = vm.pop();
    }
    try vm.pushToList(.{ .arr = ref }, &vm.stack);
}

fn arrayLen(vm: *VM) !void {
    try vm.pushToList(.{ .i64 = @intCast(vm.pop().arr.base.len) }, &vm.stack);
}

fn arrayAt(vm: *VM) !void {
    const ref = vm.pop().arr;
    try vm.pushToList(ref.items()[@intCast(vm.pop().i64)], &vm.stack);
}

fn @"struct"(vm: *VM) !void {
    const id: u32 = @intCast(vm.pop().i64);
    const len: u64 = @intCast(vm.pop().i64);
    var ref = try Ref(Var, .stack).init(vm.stack_allocator, .{ .id = id, .len = len }, null);
    const xs = ref.itemsMut();
    for (0..len) |i| {
        xs[i] = vm.pop();
    }
    try vm.pushToList(.{ .@"struct" = ref }, &vm.stack);
}

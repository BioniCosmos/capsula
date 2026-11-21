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
    ref: *const Ref,
    @"fn": u64,
    box: *const Var,
    state: State,

    pub fn format(self: @This(), writer: *Io.Writer) Io.Writer.Error!void {
        switch (self) {
            .unit => try writer.print("()", .{}),
            .sym => |x| try writer.print("{s}", .{x}),
            .ref => |ref| try writer.print("{f}", .{ref}),
            inline else => |x| try writer.print("{}", .{x}),
        }
    }
};

const Ref = struct {
    const Type = enum(u8) { arr, @"struct", str };
    const Segment = enum(u8) { stack, heap, data };

    vm: *Self,
    type: Type,
    segment: Segment,
    id: u32 = 0,
    len: u64,

    inline fn data(self: *const Ref) [*]const u8 {
        const p: [*]const u8 = @ptrCast(self);
        return p + @sizeOf(Ref);
    }

    fn items(self: *const Ref) []const Var {
        debug.assert(self.type != .str);
        const aligned = mem.alignPointer(self.data(), @alignOf(Var)).?;
        const xs: [*]const Var = @ptrCast(@alignCast(aligned));
        return xs[0..self.len];
    }

    fn str(self: *const Ref) []const u8 {
        debug.assert(self.type == .str);
        const aligned = mem.alignPointer(self.data(), @alignOf([*]const u8)).?;
        const ptr: *const [*]const u8 = @ptrCast(@alignCast(aligned));
        return ptr.*[0..self.len];
    }

    fn store(self: Ref, T: type) struct { *const Ref, [*]u8 } {
        const ref_aligned = mem.alignPointer(self.vm.raw_sp, @alignOf(Ref)).?;
        const ref: *Ref = @ptrCast(@alignCast(ref_aligned));
        const data_aligned = mem.alignPointer(@constCast(ref.data()), @alignOf(T)).?;
        ref.* = self;
        return .{ ref, data_aligned };
    }

    fn storeItems(self: Ref) struct { *const Ref, [*]Var } {
        const ref, const raw = self.store(Var);
        self.vm.raw_sp = raw + self.len * @sizeOf(Var);
        return .{ ref, @ptrCast(@alignCast(raw)) };
    }

    fn storeStr(self: Ref) struct { *const Ref, *[*]const u8 } {
        const ref, const raw = self.store([*]const u8);
        self.vm.raw_sp = raw + @sizeOf([*]const u8);
        return .{ ref, @ptrCast(@alignCast(raw)) };
    }

    pub fn format(self: *const Ref, w: *Io.Writer) !void {
        switch (self.type) {
            .arr => {
                if (self.len == 0) {
                    try w.print("[]", .{});
                    return;
                }
                try w.print("[", .{});
                for (self.items()) |x| {
                    try w.print(" {f}", .{x});
                }
                try w.print(" ]", .{});
            },
            .@"struct" => {
                const m = self.vm.structs[self.id];
                if (self.len == 0) {
                    try w.print("{s} {{}}", .{m.name});
                    return;
                }
                try w.print("{s} {{", .{m.name});
                var sep: []const u8 = " ";
                for (self.items(), m.fields) |x, field| {
                    try w.print("{s}{s} = {f}", .{ sep, field, x });
                    sep = ", ";
                }
                try w.print(" }}", .{});
            },
            .str => try w.print("{s}", .{self.str()}),
        }
    }
};

fn sexprToVar(vm: *Self, serialized: msgpack.Payload) Var {
    return switch (serialized) {
        .bool => |x| .{ .bool = x },
        .int => |x| .{ .i64 = x },
        .uint => |x| .{ .i64 = @intCast(x) },
        .str => |x| b: {
            const ref, const ptr = Ref.storeStr(.{
                .vm = vm,
                .type = .str,
                .segment = .data,
                .len = x.value().len,
            });
            ptr.* = x.value().ptr;
            break :b .{ .ref = ref };
        },
        else => unreachable,
    };
}

/// All the memory should be allocated by arena.
pub const Fn = struct {
    code: []const u8,
    constants: []const Var,
    local_count: usize,

    pub fn deserialize(allocator: mem.Allocator, vm: *Self, serialized: msgpack.Payload) !Fn {
        const constants_payload = (try serialized.mapGet("constants")).?;
        const constants = try allocator.alloc(Var, try constants_payload.getArrLen());
        for (constants, 0..) |*constant, i| {
            constant.* = sexprToVar(vm, try constants_payload.getArrElement(i));
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

    pub fn deserialize(allocator: mem.Allocator, _: *Self, serialized: msgpack.Payload) !StructMeta {
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
    vm: *Self,
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

const Self = @This();

pub const max_slot_size = math.maxInt(u16);

allocator: mem.Allocator,
io: Io,

structs: []const StructMeta = &.{},
local: [1024]Var = undefined,
pc: usize = 0,
base: usize = 0,
top: usize = 0,

raw: [1024]u8 align(@max(@alignOf(Ref), @alignOf(Var), @alignOf([*]const u8))) = undefined,
raw_sp: [*]u8,

stack: std.ArrayList(Var) = .empty,

err_buf: [1024]u8 = undefined,
err: []const u8 = "",

result_buf: [1024]u8 = undefined,

stdout_buf: [1024]u8 = undefined,
stdout_writer: Io.File.Writer = undefined,
stdout: *Io.Writer = undefined,

pub fn init(allocator: mem.Allocator, io: Io) !*Self {
    const vm = try allocator.create(Self);
    vm.* = .{ .allocator = allocator, .io = io, .raw_sp = &vm.raw };

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
            .native_call => native_functions.get(self.pop().ref.str()).?(self) catch |err|
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
    .{ "box", &box },
});

fn panic(vm: *Self) !void {
    debug.print("{s}:{}:{} panic: ", .{ vm.pop().ref.str(), vm.pop().i64, vm.pop().i64 });
    const format = vm.pop().ref.str();
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
    try vm.pushToList(.{ .i64 = switch (vm.pop()) {
        .ref => |ref| switch (ref.type) {
            .arr => 100,
            .@"struct" => 101,
            .str => 102,
        },
        else => |x| @backingInt(x),
    } }, &vm.stack);
}

fn typeName(vm: *Self) !void {
    const s = switch (vm.pop()) {
        .ref => |ref| @tagName(ref.type),
        else => |x| @tagName(x),
    };
    const ref, const ptr = Ref.storeStr(.{
        .vm = vm,
        .type = .str,
        .segment = .data,
        .len = s.len,
    });
    ptr.* = s.ptr;
    try vm.pushToList(.{ .ref = ref }, &vm.stack);
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
    const len: u64 = @intCast(vm.pop().i64);
    const ref, const xs = Ref.storeItems(.{
        .vm = vm,
        .type = .arr,
        .segment = .stack,
        .len = len,
    });
    for (0..len) |i| {
        xs[i] = vm.pop();
    }
    try vm.pushToList(.{ .ref = ref }, &vm.stack);
}

fn arrayLen(vm: *Self) !void {
    try vm.pushToList(.{ .i64 = @intCast(vm.pop().ref.len) }, &vm.stack);
}

fn arrayAt(vm: *Self) !void {
    const ref = vm.pop().ref;
    try vm.pushToList(ref.items()[@intCast(vm.pop().i64)], &vm.stack);
}

fn @"struct"(vm: *Self) !void {
    const id: u32 = @intCast(vm.pop().i64);
    const len: u64 = @intCast(vm.pop().i64);
    const ref, const xs = Ref.storeItems(.{
        .vm = vm,
        .type = .@"struct",
        .segment = .stack,
        .id = id,
        .len = len,
    });
    for (0..len) |i| {
        xs[i] = vm.pop();
    }
    try vm.pushToList(.{ .ref = ref }, &vm.stack);
}

fn box(vm: *Self) !void {
    const x = try vm.allocator.create(Var);
    x.* = vm.pop();
    try vm.pushToList(.{ .box = x }, &vm.stack);
}

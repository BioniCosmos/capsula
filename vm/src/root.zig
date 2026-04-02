const std = @import("std");
const debug = std.debug;
const heap = std.heap;
const mem = std.mem;

pub export fn execute(bytecode: [*]const u8, len: u64) void {
    var gpa = heap.DebugAllocator(.{}).init;
    const allocator = gpa.allocator();
    var stack = std.ArrayList(u8){};
    var memo = std.ArrayList(u8){};
    var fp: u64 = undefined;
    defer {
        stack.deinit(allocator);
        memo.deinit(allocator);
        debug.assert(gpa.deinit() == .ok);
    }

    var i: usize = 0;
    while (i < len) : (i += 1) {
        const instruction: Instruction = @enumFromInt(bytecode[i]);
        switch (instruction) {
            .add => {
                const lhs = pop(i64, &stack);
                const rhs = pop(i64, &stack);
                debug.print("{}\n", .{lhs + rhs});
            },
            .ld => {
                const addr = pop(u64, &stack);
                mem.writeInt(
                    u64,
                    stack.addManyAsArray(allocator, 8) catch unreachable,
                    mem.readVarInt(u64, memo.items[addr .. addr + 8], .little),
                    .little,
                );
            },
            .ldfp => {},
            .ldscope => {
                const addr = fp + @as(u64, @intCast(stack.pop().?));
                mem.writeInt(
                    u64,
                    stack.addManyAsArray(allocator, 8) catch unreachable,
                    mem.readVarInt(u64, memo.items[addr .. addr + 8], .little),
                    .little,
                );
            },
            .sd => {
                const addr = pop(u64, &stack);
                mem.writeInt(u64, memo.items[addr .. addr + 8][0..8], pop(u64, &stack), .little);
            },
            .sdfp => {
                fp = pop(u64, &stack);
            },
            .sdscope => {
                const value = pop(u64, &stack);
                const addr = fp + @as(u64, @intCast(stack.pop().?));
                mem.writeInt(u64, memo.items[addr .. addr + 8][0..8], value, .little);
            },
            .pushb => {
                stack.append(allocator, bytecode[i + 1]) catch unreachable;
                i += 1;
            },
            .pushd => {
                stack.appendSlice(allocator, bytecode[i + 1 .. i + 9]) catch unreachable;
                i += 8;
            },
            .alloc => {
                const head = memo.items.len;
                memo.appendNTimes(allocator, 0, pop(u64, &stack)) catch unreachable;
                mem.writeInt(u64, stack.addManyAsArray(allocator, 8) catch unreachable, head, .little);
            },
        }
    }
}

fn pop(comptime T: type, stack: *std.ArrayList(u8)) T {
    const len = @sizeOf(T);
    const top = stack.items.len;
    const value = mem.readVarInt(T, stack.items[(top - len)..top], .little);
    for (0..len) |_| {
        _ = stack.pop();
    }
    return value;
}

pub const Instruction = enum(u8) {
    add,
    ld,
    ldfp,
    ldscope,
    sd,
    sdfp,
    sdscope,
    pushb,
    pushd,
    alloc,
};

const std = @import("std");
const heap = std.heap;

const VM = @import("VM.zig");

/// ## Error
///
/// Return `null` if allocation failed.
export fn init() ?*VM {
    const vm = heap.c_allocator.create(VM) catch return null;
    vm.* = VM.init();
    return vm;
}

export fn deinit(self: *VM) void {
    self.deinit();
    heap.c_allocator.destroy(self);
}

export fn err(self: *VM) [*:0]const u8 {
    self.err_buf[self.err.len] = 0;
    return self.err_buf[0..self.err.len :0];
}

/// ## Error
///
/// Return `65535` if `vars` is full.
export fn addBool(self: *VM, variable: bool) u16 {
    return self.addVar(.{ .bool = variable }) catch VM.max_slot_size;
}

/// ## Error
///
/// Return `65535` if `vars` is full.
export fn addI64(self: *VM, variable: i64) u16 {
    return self.addVar(.{ .i64 = variable }) catch VM.max_slot_size;
}

/// ## Error
///
/// Return `null` if error occurred.
export fn execute(self: *VM, bytecode: [*]const u8, len: u64) ?[*:0]const u8 {
    return std.fmt.bufPrintSentinel(
        &self.result_buf,
        "{f}",
        .{self.execute(bytecode[0..len]) catch return null},
        0,
    ) catch unreachable;
}

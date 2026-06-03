const std = @import("std");
const heap = std.heap;
const Io = std.Io;
const mem = std.mem;

const VM = @import("VM.zig");

const Wrapper = struct {
    vm: *VM = undefined,

    gpa: heap.DebugAllocator(.{}) = .init,
    allocator: mem.Allocator = undefined,
    threaded: Io.Threaded = undefined,
    io: Io = undefined,
};

/// ## Error
///
/// Return `null` if allocation failed.
export fn init() ?*Wrapper {
    const wrapper = heap.page_allocator.create(Wrapper) catch return null;
    wrapper.* = .{};
    wrapper.allocator = wrapper.gpa.allocator();
    wrapper.threaded = .init(wrapper.allocator, .{});
    wrapper.io = wrapper.threaded.io();

    wrapper.vm = VM.init(wrapper.allocator, wrapper.io) catch return null;

    return wrapper;
}

export fn deinit(self: *Wrapper) void {
    self.vm.deinit();
    heap.page_allocator.destroy(self);
}

export fn err(self: *Wrapper) [*:0]const u8 {
    self.vm.err_buf[self.vm.err.len] = 0;
    return self.vm.err_buf[0..self.vm.err.len :0];
}

/// ## Error
///
/// Return `65535` if `vars` is full.
export fn addBool(self: *Wrapper, variable: bool) u16 {
    return self.vm.addVar(.{ .bool = variable }) catch VM.max_slot_size;
}

/// ## Error
///
/// Return `65535` if `vars` is full.
export fn addI64(self: *Wrapper, variable: i64) u16 {
    return self.vm.addVar(.{ .i64 = variable }) catch VM.max_slot_size;
}

/// ## Error
///
/// Return `null` if error occurred.
export fn execute(self: *Wrapper, bytecode: [*]const u8, len: u64) ?[*:0]const u8 {
    return std.fmt.bufPrintSentinel(
        &self.vm.result_buf,
        "{f}",
        .{self.vm.execute(bytecode[0..len]) catch return null},
        0,
    ) catch unreachable;
}

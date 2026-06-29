const std = @import("std");
const debug = std.debug;
const Io = std.Io;
const process = std.process;

const msgpack = @import("msgpack");

const VM = @import("VM.zig");

pub fn main(init: process.Init) !void {
    const allocator = init.arena.allocator();
    const io = init.io;

    const args = try init.minimal.args.toSlice(allocator);
    if (args.len < 2) {
        debug.print("bytecode file path required\n", .{});
        return;
    }
    const path = args[1];

    const file = try Io.Dir.cwd().openFile(io, path, .{});
    defer file.close(io);

    var buf: [1024]u8 = undefined;
    var reader = file.reader(io, &buf);

    var packer = msgpack.packIO(&reader.interface, @constCast(&Io.Writer.failing));
    const payload = try packer.read(allocator);

    const functions = try allocator.alloc(VM.Fn, try payload.getArrLen());
    for (functions, 0..) |*func, i| {
        func.* = try VM.Fn.deserialize(allocator, try payload.getArrElement(i));
    }

    const vm = try VM.init(allocator, io);
    defer vm.deinit();
    _ = try vm.execute(functions);
}
